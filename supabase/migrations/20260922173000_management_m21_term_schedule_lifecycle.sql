-- Management / M21
-- Term + schedule lifecycle foundation.
--
-- Product contract:
--   * a schedule identity is academic_year + term
--   * the public read model represents the currently active term
--   * published/archived management revisions preserve historical terms
--   * a future term/year may be created from a PUBLISHED or ARCHIVED revision
--     without mutating the source
--
-- SAFETY:
--   * additive/backfill only for lifecycle metadata
--   * current 2026-2027 public projection remains byte-for-byte semantically
--     unchanged apart from explicit term=1 metadata
--   * no M20.3 invocation
--   * no publication
--   * publication apply remains locked
--   * no provisional-resource or curriculum-compliance behavior is introduced

begin;


-- -------------------------------------------------------------------------
-- TERM IDENTITY ON THE PUBLIC READ MODEL
-- -------------------------------------------------------------------------

alter table public.schedule_sessions
  add column if not exists term smallint;

update public.schedule_sessions
set term = 1
where term is null;

alter table public.schedule_sessions
  alter column term set default 1,
  alter column term set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.schedule_sessions'::regclass
      and conname = 'schedule_sessions_term_check'
  ) then
    alter table public.schedule_sessions
      add constraint schedule_sessions_term_check
      check (term between 1 and 2);
  end if;
end
$$;

create index if not exists schedule_sessions_year_term_idx
  on public.schedule_sessions (academic_year, term);


-- The public projection remains one active projection per academic year.
-- active_term tells clients which term that projection represents.
alter table public.schedule_projection_metadata
  add column if not exists active_term smallint;

update public.schedule_projection_metadata
set active_term = 1
where active_term is null;

alter table public.schedule_projection_metadata
  alter column active_term set default 1,
  alter column active_term set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.schedule_projection_metadata'::regclass
      and conname = 'schedule_projection_metadata_active_term_check'
  ) then
    alter table public.schedule_projection_metadata
      add constraint schedule_projection_metadata_active_term_check
      check (active_term between 1 and 2);
  end if;
end
$$;


-- Publication controls are still year-scoped because there is only one active
-- public projection for an academic year, but record the term represented by
-- the baseline currently under control.
alter table public.management_publication_controls
  add column if not exists active_term smallint;

update public.management_publication_controls
set active_term = 1
where active_term is null;

alter table public.management_publication_controls
  alter column active_term set default 1,
  alter column active_term set not null;

-- Adding schedule_sessions.term intentionally changes the JSON row shape used
-- by the M19 bootstrap session hash. No schedule meaning changed, so when the
-- year has never had a managed publication, re-anchor the bootstrap hash to
-- the same rows with their explicit term identity. This prevents a false
-- PUBLIC_BASELINE_DRIFT caused only by the additive schema column.
update public.management_publication_controls control
set
  bootstrap_sessions_hash =
    public.management_public_sessions_hash(control.academic_year),
  bootstrap_groups_hash =
    public.management_public_groups_hash(control.academic_year),
  note = concat_ws(
    ' ',
    nullif(control.note, ''),
    'M21: bootstrap hash re-anchored after explicit term metadata backfill.'
  ),
  updated_at = now()
where not exists (
  select 1
  from public.management_publications publication
  where publication.academic_year = control.academic_year
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.management_publication_controls'::regclass
      and conname = 'management_publication_controls_active_term_check'
  ) then
    alter table public.management_publication_controls
      add constraint management_publication_controls_active_term_check
      check (active_term between 1 and 2);
  end if;
end
$$;


-- Publication audit rows retain the term that was published even after a later
-- term replaces the public projection.
alter table public.management_publications
  add column if not exists term smallint;

update public.management_publications publication
set term = requirement_set.term
from public.requirement_sets requirement_set
where requirement_set.id = publication.requirement_set_id
  and publication.term is null;

alter table public.management_publications
  alter column term set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.management_publications'::regclass
      and conname = 'management_publications_term_check'
  ) then
    alter table public.management_publications
      add constraint management_publications_term_check
      check (term between 1 and 2);
  end if;
end
$$;

create index if not exists management_publications_year_term_latest_idx
  on public.management_publications (
    academic_year,
    term,
    publication_number desc
  );


-- -------------------------------------------------------------------------
-- TERM-AWARE PUBLIC HASH HELPERS
-- -------------------------------------------------------------------------

create or replace function public.management_public_sessions_hash_by_term(
  p_academic_year text,
  p_term smallint
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(
    coalesce(
      string_agg(
        to_jsonb(session_row)::text,
        '|' order by session_row.id
      ),
      ''
    )
  )
  from public.schedule_sessions session_row
  where session_row.academic_year = p_academic_year
    and session_row.term = p_term
$$;

create or replace function public.management_public_groups_hash_by_term(
  p_academic_year text,
  p_term smallint
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(
    coalesce(
      string_agg(
        to_jsonb(group_row)::text,
        '|' order by group_row.id
      ),
      ''
    )
  )
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = p_academic_year
    and session_row.term = p_term
$$;

revoke all
  on function public.management_public_sessions_hash_by_term(text, smallint),
     public.management_public_groups_hash_by_term(text, smallint)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- CROSS-TERM TEMPLATE REQUIREMENT LINEAGE
-- -------------------------------------------------------------------------

create table if not exists public.management_term_template_lineage (
  child_requirement_id uuid primary key
    references public.course_requirements(id) on delete cascade,
  parent_requirement_id uuid not null
    references public.course_requirements(id) on delete restrict,
  source_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  target_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint management_term_template_lineage_not_self
    check (child_requirement_id <> parent_requirement_id)
);

create index if not exists
  management_term_template_lineage_parent_idx
  on public.management_term_template_lineage (parent_requirement_id);

create index if not exists
  management_term_template_lineage_source_revision_idx
  on public.management_term_template_lineage (source_revision_id);

create index if not exists
  management_term_template_lineage_target_revision_idx
  on public.management_term_template_lineage (target_revision_id);

alter table public.management_term_template_lineage enable row level security;

revoke all
  on public.management_term_template_lineage
  from anon, authenticated;

grant select
  on public.management_term_template_lineage
  to authenticated;

drop policy if exists management_term_template_lineage_read
  on public.management_term_template_lineage;

create policy management_term_template_lineage_read
  on public.management_term_template_lineage
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- READ-ONLY TEMPLATE PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_term_template(
  p_source_revision_id uuid,
  p_target_academic_year text,
  p_target_term smallint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source record;
  v_target_draft_count integer;
  v_target_published_count integer;
  v_group_count integer;
  v_relation_count integer;
  v_requirement_count integer;
  v_teacher_assignment_count integer;
  v_room_assignment_count integer;
  v_card_count integer;
  v_placement_count integer;
  v_block_reasons jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M21 management VIEWER role required'
      using errcode = '42501';
  end if;

  if p_target_academic_year is null
     or length(btrim(p_target_academic_year)) = 0 then
    raise exception 'M21 target academic year is required';
  end if;

  if p_target_term is null
     or p_target_term not between 1 and 2 then
    raise exception 'M21 target term must be 1 or 2';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.status as requirement_set_status
  into v_source
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_source_revision_id;

  if not found then
    raise exception 'M21 source revision not found: %',
      p_source_revision_id;
  end if;

  if v_source.revision_status not in ('PUBLISHED', 'ARCHIVED')
     or v_source.requirement_set_status not in ('PUBLISHED', 'ARCHIVED') then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array(
        'SOURCE_MUST_BE_PUBLISHED_OR_ARCHIVED'
      );
  end if;

  if v_source.academic_year = p_target_academic_year
     and v_source.term = p_target_term then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array(
        'TARGET_MUST_BE_DIFFERENT_TERM_OR_YEAR'
      );
  end if;

  select count(*)
  into v_target_draft_count
  from public.requirement_sets requirement_set
  where requirement_set.academic_year = p_target_academic_year
    and requirement_set.term = p_target_term
    and requirement_set.status = 'DRAFT';

  if v_target_draft_count > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array(
        'TARGET_DRAFT_ALREADY_EXISTS'
      );
  end if;

  select count(*)
  into v_target_published_count
  from public.requirement_sets requirement_set
  where requirement_set.academic_year = p_target_academic_year
    and requirement_set.term = p_target_term
    and requirement_set.status = 'PUBLISHED';

  if v_target_published_count > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array(
        'TARGET_ALREADY_PUBLISHED'
      );
  end if;

  select count(*)
  into v_group_count
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_source.requirement_set_id;

  select count(*)
  into v_relation_count
  from public.instructional_group_relations relation
  where exists (
    select 1
    from public.instructional_groups instructional_group
    where instructional_group.requirement_set_id =
      v_source.requirement_set_id
      and instructional_group.id = relation.left_group_id
  );

  select count(*)
  into v_requirement_count
  from public.course_requirements requirement
  where requirement.requirement_set_id =
    v_source.requirement_set_id;

  select count(*)
  into v_teacher_assignment_count
  from public.course_requirement_teachers assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id =
    v_source.requirement_set_id;

  select count(*)
  into v_room_assignment_count
  from public.course_requirement_rooms assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id =
    v_source.requirement_set_id;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_source_revision_id;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_source_revision_id;

  return jsonb_build_object(
    'sourceRevisionId', p_source_revision_id,
    'sourceAcademicYear', v_source.academic_year,
    'sourceTerm', v_source.term,
    'targetAcademicYear', p_target_academic_year,
    'targetTerm', p_target_term,
    'canCreateTemplate',
      jsonb_array_length(v_block_reasons) = 0,
    'canCurrentUserCreateTemplate',
      jsonb_array_length(v_block_reasons) = 0
      and public.has_management_role('ADMIN'),
    'blockReasons', v_block_reasons,
    'copyPlan', jsonb_build_object(
      'instructionalGroups', v_group_count,
      'groupRelations', v_relation_count,
      'courseRequirements', v_requirement_count,
      'teacherAssignments', v_teacher_assignment_count,
      'roomAssignments', v_room_assignment_count,
      'scheduleCards', v_card_count,
      'placements', v_placement_count
    ),
    'resetPlan', jsonb_build_object(
      'sourceEvidence', 'NOT_CLONED',
      'moveHistory', 'RESET',
      'candidateDomain', 'REBUILD',
      'draftNameOverrides', 'NOT_CLONED'
    ),
    'sourcePreserved', true
  );
end
$$;

revoke all
  on function public.management_preview_term_template(uuid, text, smallint)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_term_template(uuid, text, smallint)
  to authenticated;


-- -------------------------------------------------------------------------
-- LOCKED TEMPLATE APPLY
-- -------------------------------------------------------------------------
-- This is intentionally installed without authenticated EXECUTE. It completes
-- the lifecycle contract now while preventing accidental use before M22/M23
-- and the management UI are ready.

create or replace function public.management_create_term_from_template(
  p_source_revision_id uuid,
  p_target_academic_year text,
  p_target_term smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_source record;
  v_target_requirement_set_id uuid := gen_random_uuid();
  v_target_revision_id uuid := gen_random_uuid();
  v_target_requirement_set_version integer;
  v_target_revision_version integer;
begin
  if not public.has_management_role('ADMIN') then
    raise exception 'M21 management ADMIN role required'
      using errcode = '42501';
  end if;

  v_preview := public.management_preview_term_template(
    p_source_revision_id,
    p_target_academic_year,
    p_target_term
  );

  if not coalesce(
    (v_preview ->> 'canCreateTemplate')::boolean,
    false
  ) then
    raise exception
      'M21 template creation blocked: %',
      coalesce(v_preview -> 'blockReasons', '[]'::jsonb)::text;
  end if;

  lock table
    public.requirement_sets,
    public.schedule_revisions,
    public.instructional_groups,
    public.instructional_group_relations,
    public.course_requirements,
    public.course_requirement_teachers,
    public.course_requirement_rooms,
    public.schedule_cards,
    public.placements,
    public.management_term_template_lineage
  in share row exclusive mode;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.status as requirement_set_status
  into v_source
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_source_revision_id
  for share of revision, requirement_set;

  if not found
     or v_source.revision_status not in ('PUBLISHED', 'ARCHIVED')
     or v_source.requirement_set_status not in ('PUBLISHED', 'ARCHIVED') then
    raise exception 'M21 template source changed after preview';
  end if;

  if exists (
    select 1
    from public.requirement_sets requirement_set
    where requirement_set.academic_year = p_target_academic_year
      and requirement_set.term = p_target_term
      and requirement_set.status in ('DRAFT', 'PUBLISHED')
  ) then
    raise exception 'M21 target term became occupied after preview';
  end if;

  select coalesce(max(requirement_set.version_number), 0) + 1
  into v_target_requirement_set_version
  from public.requirement_sets requirement_set
  where requirement_set.academic_year = p_target_academic_year
    and requirement_set.term = p_target_term;

  select coalesce(max(revision.version_number), 0) + 1
  into v_target_revision_version
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = p_target_academic_year
    and requirement_set.term = p_target_term;

  insert into public.requirement_sets (
    id,
    academic_year,
    term,
    version_number,
    status,
    parent_id
  )
  values (
    v_target_requirement_set_id,
    p_target_academic_year,
    p_target_term,
    v_target_requirement_set_version,
    'DRAFT',
    v_source.requirement_set_id
  );

  drop table if exists pg_temp.m21_group_map;
  create temporary table m21_group_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m21_group_map (old_id, new_id)
  select
    instructional_group.id,
    gen_random_uuid()
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_source.requirement_set_id;

  insert into public.instructional_groups (
    id,
    requirement_set_id,
    class_group_id,
    name,
    group_type,
    term_status,
    knowledge_status,
    audience_target,
    subgroup_label
  )
  select
    mapping.new_id,
    v_target_requirement_set_id,
    source_group.class_group_id,
    source_group.name,
    source_group.group_type,
    source_group.term_status,
    source_group.knowledge_status,
    source_group.audience_target,
    source_group.subgroup_label
  from m21_group_map mapping
  join public.instructional_groups source_group
    on source_group.id = mapping.old_id;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select
    left_mapping.new_id,
    right_mapping.new_id,
    relation.relation
  from public.instructional_group_relations relation
  join m21_group_map left_mapping
    on left_mapping.old_id = relation.left_group_id
  join m21_group_map right_mapping
    on right_mapping.old_id = relation.right_group_id;

  drop table if exists pg_temp.m21_requirement_map;
  create temporary table m21_requirement_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m21_requirement_map (old_id, new_id)
  select
    requirement.id,
    gen_random_uuid()
  from public.course_requirements requirement
  where requirement.requirement_set_id =
    v_source.requirement_set_id;

  insert into public.course_requirements (
    id,
    requirement_set_id,
    subject_id,
    instructional_group_id,
    weekly_load,
    preferred_partition,
    allowed_partitions,
    min_distinct_days,
    max_blocks_per_day,
    max_consecutive_periods,
    course_character,
    term_status,
    knowledge_status,
    teacher_mode,
    resource_mode,
    required_capability,
    delivery_mode
  )
  select
    requirement_mapping.new_id,
    v_target_requirement_set_id,
    source_requirement.subject_id,
    group_mapping.new_id,
    source_requirement.weekly_load,
    source_requirement.preferred_partition,
    source_requirement.allowed_partitions,
    source_requirement.min_distinct_days,
    source_requirement.max_blocks_per_day,
    source_requirement.max_consecutive_periods,
    source_requirement.course_character,
    source_requirement.term_status,
    source_requirement.knowledge_status,
    source_requirement.teacher_mode,
    source_requirement.resource_mode,
    source_requirement.required_capability,
    source_requirement.delivery_mode
  from m21_requirement_map requirement_mapping
  join public.course_requirements source_requirement
    on source_requirement.id = requirement_mapping.old_id
  join m21_group_map group_mapping
    on group_mapping.old_id =
      source_requirement.instructional_group_id;

  insert into public.course_requirement_teachers (
    requirement_id,
    teacher_id,
    knowledge_status
  )
  select
    requirement_mapping.new_id,
    assignment.teacher_id,
    assignment.knowledge_status
  from public.course_requirement_teachers assignment
  join m21_requirement_map requirement_mapping
    on requirement_mapping.old_id = assignment.requirement_id;

  insert into public.course_requirement_rooms (
    requirement_id,
    room_id,
    knowledge_status
  )
  select
    requirement_mapping.new_id,
    assignment.room_id,
    assignment.knowledge_status
  from public.course_requirement_rooms assignment
  join m21_requirement_map requirement_mapping
    on requirement_mapping.old_id = assignment.requirement_id;

  insert into public.schedule_revisions (
    id,
    requirement_set_id,
    version_number,
    status,
    base_revision_id,
    validation_summary
  )
  values (
    v_target_revision_id,
    v_target_requirement_set_id,
    v_target_revision_version,
    'DRAFT',
    p_source_revision_id,
    jsonb_build_object(
      'phase', 'M21',
      'template_source_revision_id', p_source_revision_id,
      'template_source_academic_year', v_source.academic_year,
      'template_source_term', v_source.term,
      'target_academic_year', p_target_academic_year,
      'target_term', p_target_term,
      'move_history', 'RESET',
      'source_evidence', 'NOT_CLONED',
      'candidate_domain', 'REBUILD',
      'resource_name_overrides', 'NOT_CLONED'
    )
  );

  insert into public.management_term_template_lineage (
    child_requirement_id,
    parent_requirement_id,
    source_revision_id,
    target_revision_id
  )
  select
    requirement_mapping.new_id,
    requirement_mapping.old_id,
    p_source_revision_id,
    v_target_revision_id
  from m21_requirement_map requirement_mapping;

  drop table if exists pg_temp.m21_card_map;
  create temporary table m21_card_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m21_card_map (old_id, new_id)
  select
    card.id,
    gen_random_uuid()
  from public.schedule_cards card
  where card.schedule_revision_id = p_source_revision_id;

  insert into public.schedule_cards (
    id,
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  select
    card_mapping.new_id,
    v_target_revision_id,
    requirement_mapping.new_id,
    source_card.block_index,
    source_card.duration_periods,
    source_card.locked,
    source_card.publication_end_time_override
  from m21_card_map card_mapping
  join public.schedule_cards source_card
    on source_card.id = card_mapping.old_id
  join m21_requirement_map requirement_mapping
    on requirement_mapping.old_id = source_card.requirement_id;

  insert into public.placements (
    id,
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  select
    gen_random_uuid(),
    card_mapping.new_id,
    source_placement.day_of_week,
    source_placement.start_period,
    source_placement.teacher_id,
    source_placement.room_id,
    null
  from public.placements source_placement
  join m21_card_map card_mapping
    on card_mapping.old_id = source_placement.card_id;

  perform public.refresh_management_candidate_domain(
    v_target_revision_id
  );

  return jsonb_build_object(
    'created', true,
    'sourceRevisionId', p_source_revision_id,
    'targetAcademicYear', p_target_academic_year,
    'targetTerm', p_target_term,
    'targetRequirementSetId', v_target_requirement_set_id,
    'targetRevisionId', v_target_revision_id,
    'sourcePreserved', true
  );
end
$$;

revoke all
  on function public.management_create_term_from_template(uuid, text, smallint)
  from public, anon, authenticated;

comment on function public.management_create_term_from_template(uuid, text, smallint) is
  'M21 LOCKED cross-term/year template clone. Copies a frozen PUBLISHED/ARCHIVED management schedule into a new DRAFT term while preserving the source. No authenticated EXECUTE grant until later lifecycle/UI validation.';


-- -------------------------------------------------------------------------
-- CURRENT PERIOD ARCHIVE / ACTIVE-PROJECTION DIAGNOSTIC
-- -------------------------------------------------------------------------

create or replace function public.management_term_lifecycle_status(
  p_academic_year text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with metadata as (
    select
      projection_version,
      active_term,
      runtime_adjustments_required,
      published_at
    from public.schedule_projection_metadata
    where academic_year = p_academic_year
  ),
  terms as (
    select
      requirement_set.term,
      count(*) filter (
        where requirement_set.status = 'DRAFT'
      )::integer as draft_count,
      count(*) filter (
        where requirement_set.status = 'PUBLISHED'
      )::integer as published_count,
      count(*) filter (
        where requirement_set.status = 'ARCHIVED'
      )::integer as archived_count
    from public.requirement_sets requirement_set
    where requirement_set.academic_year = p_academic_year
    group by requirement_set.term
  )
  select jsonb_build_object(
    'academicYear', p_academic_year,
    'activePublicTerm',
      (select active_term from metadata),
    'projectionVersion',
      (select projection_version from metadata),
    'runtimeAdjustmentsRequired',
      (select runtime_adjustments_required from metadata),
    'publicSessionCount',
      (
        select count(*)
        from public.schedule_sessions session_row
        where session_row.academic_year = p_academic_year
      ),
    'publicTermMismatchCount',
      (
        select count(*)
        from public.schedule_sessions session_row
        cross join metadata
        where session_row.academic_year = p_academic_year
          and session_row.term <> metadata.active_term
      ),
    'terms',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'term', terms.term,
              'draftCount', terms.draft_count,
              'publishedCount', terms.published_count,
              'archivedCount', terms.archived_count
            )
            order by terms.term
          )
          from terms
        ),
        '[]'::jsonb
      )
  )
$$;

revoke all
  on function public.management_term_lifecycle_status(text)
  from public, anon, authenticated;

grant execute
  on function public.management_term_lifecycle_status(text)
  to authenticated;


-- -------------------------------------------------------------------------
-- MIGRATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_sessions integer;
  v_groups integer;
  v_wrong_term integer;
  v_publications integer;
  v_metadata_term smallint;
  v_control_term smallint;
  v_baseline_healthy boolean;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  select count(*)
  into v_wrong_term
  from public.schedule_sessions
  where academic_year = '2026-2027'
    and term <> 1;

  select count(*)
  into v_publications
  from public.management_publications;

  select active_term
  into v_metadata_term
  from public.schedule_projection_metadata
  where academic_year = '2026-2027';

  select active_term
  into v_control_term
  from public.management_publication_controls
  where academic_year = '2026-2027';

  select coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  )
  into v_baseline_healthy;

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M21 installation modified public projection cardinality: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if v_wrong_term <> 0 then
    raise exception
      'M21 expected existing 2026-2027 public projection to be term 1';
  end if;

  if v_metadata_term is distinct from 1
     or v_control_term is distinct from 1 then
    raise exception
      'M21 expected current 2026-2027 active term to remain 1';
  end if;

  if not v_baseline_healthy then
    raise exception
      'M21 term metadata backfill caused public baseline drift';
  end if;

  if v_publications <> 0 then
    raise exception
      'M21 expected no managed publication before lifecycle transition';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M21 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M21 term template apply must remain locked';
  end if;
end
$$;

commit;

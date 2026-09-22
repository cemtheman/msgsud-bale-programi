-- Management / M19.2
-- Publication Safety Gate + durable publication baseline foundation.
--
-- IMPORTANT:
-- This migration DOES NOT publish or mutate schedule_sessions/session_groups.
-- It creates:
--   1. durable publication audit + session mapping tables,
--   2. exact public-baseline hashes,
--   3. server-side draft readiness / projection validation,
--   4. a publication state token,
--   5. an explicit runtime-adjustment reconciliation blocker.
--
-- The runtime blocker starts FALSE for 2026-2027 because the public class
-- reader still applies data/scheduleAdjustments.ts after reading Supabase.
-- A later reconciliation migration must move those overlays into the
-- management/publication model before real publication can be enabled.

begin;

-- -------------------------------------------------------------------------
-- PUBLICATION CONTROL / AUDIT TABLES
-- -------------------------------------------------------------------------

create table public.management_publication_controls (
  academic_year text primary key,
  runtime_adjustments_reconciled boolean not null default false,
  bootstrap_session_count integer not null check (bootstrap_session_count >= 0),
  bootstrap_group_count integer not null check (bootstrap_group_count >= 0),
  bootstrap_sessions_hash text not null,
  bootstrap_groups_hash text not null,
  note text null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table public.management_publications (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete restrict,
  academic_year text not null,
  publication_number integer not null check (publication_number > 0),
  state_token text not null,
  readiness jsonb not null,
  before_session_count integer not null check (before_session_count >= 0),
  before_group_count integer not null check (before_group_count >= 0),
  after_session_count integer not null check (after_session_count >= 0),
  after_group_count integer not null check (after_group_count >= 0),
  before_sessions_hash text not null,
  before_groups_hash text not null,
  after_sessions_hash text not null,
  after_groups_hash text not null,
  published_by uuid null,
  published_at timestamptz not null default now(),
  constraint management_publications_readiness_object
    check (jsonb_typeof(readiness) = 'object'),
  constraint management_publications_year_number_unique
    unique (academic_year, publication_number)
);

create index management_publications_revision_idx
  on public.management_publications (schedule_revision_id);

create index management_publications_year_latest_idx
  on public.management_publications (academic_year, publication_number desc);

create table public.management_publication_sessions (
  publication_id uuid not null
    references public.management_publications(id) on delete cascade,
  requirement_id uuid not null
    references public.course_requirements(id) on delete restrict,
  session_id uuid not null,
  card_id uuid not null,
  unit_index smallint not null check (unit_index > 0),
  evidence jsonb not null default '{}'::jsonb,
  primary key (publication_id, session_id),
  constraint management_publication_sessions_evidence_object
    check (jsonb_typeof(evidence) = 'object')
);

create index management_publication_sessions_session_idx
  on public.management_publication_sessions (session_id);

create index management_publication_sessions_requirement_idx
  on public.management_publication_sessions (requirement_id);

alter table public.management_publication_controls enable row level security;
alter table public.management_publications enable row level security;
alter table public.management_publication_sessions enable row level security;

revoke all
  on public.management_publication_controls,
     public.management_publications,
     public.management_publication_sessions
  from anon, authenticated;

grant select
  on public.management_publication_controls,
     public.management_publications,
     public.management_publication_sessions
  to authenticated;

create policy management_publication_controls_read
  on public.management_publication_controls
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_publications_read
  on public.management_publications
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_publication_sessions_read
  on public.management_publication_sessions
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- EXACT CURRENT PUBLIC-PROJECTION HASHES
-- -------------------------------------------------------------------------

create or replace function public.management_public_sessions_hash(
  p_academic_year text
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
$$;

create or replace function public.management_public_groups_hash(
  p_academic_year text
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
$$;

revoke all
  on function public.management_public_sessions_hash(text),
     public.management_public_groups_hash(text)
  from public, anon, authenticated;


-- Capture the current, already-validated public projection as the initial
-- publication baseline. Later successful publication rows supersede it.
insert into public.management_publication_controls (
  academic_year,
  runtime_adjustments_reconciled,
  bootstrap_session_count,
  bootstrap_group_count,
  bootstrap_sessions_hash,
  bootstrap_groups_hash,
  note
)
select
  '2026-2027',
  false,
  (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
  ),
  (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
  ),
  public.management_public_sessions_hash('2026-2027'),
  public.management_public_groups_hash('2026-2027'),
  'M19.2 gate: runtime scheduleAdjustments.ts overlays must be reconciled before publication is enabled.';

do $$
declare
  v_session_count integer;
  v_group_count integer;
begin
  select
    bootstrap_session_count,
    bootstrap_group_count
  into
    v_session_count,
    v_group_count
  from public.management_publication_controls
  where academic_year = '2026-2027';

  if v_session_count <> 517 or v_group_count <> 609 then
    raise exception
      'M19.2 bootstrap public projection changed unexpectedly: sessions %, groups %',
      v_session_count,
      v_group_count;
  end if;
end
$$;


-- -------------------------------------------------------------------------
-- PERIOD GRID
-- -------------------------------------------------------------------------

create or replace function public.management_publication_period_bounds(
  p_period smallint
)
returns table (
  start_time time,
  end_time time
)
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select
    period_grid.start_time,
    period_grid.end_time
  from (
    values
      (1::smallint, '08:20'::time, '09:00'::time),
      (2::smallint, '09:10'::time, '09:50'::time),
      (3::smallint, '10:00'::time, '10:40'::time),
      (4::smallint, '10:50'::time, '11:30'::time),
      (5::smallint, '11:40'::time, '12:20'::time),
      (6::smallint, '13:00'::time, '13:40'::time),
      (7::smallint, '13:50'::time, '14:30'::time),
      (8::smallint, '14:40'::time, '15:20'::time),
      (9::smallint, '15:30'::time, '16:10'::time),
      (10::smallint, '16:20'::time, '17:00'::time),
      (11::smallint, '17:10'::time, '17:50'::time),
      (12::smallint, '18:00'::time, '18:40'::time)
  ) as period_grid(period_number, start_time, end_time)
  where period_number = p_period
$$;

revoke all
  on function public.management_publication_period_bounds(smallint)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- REQUIREMENT -> PUBLIC AUDIENCE PROJECTION
-- -------------------------------------------------------------------------
-- Concrete instructional groups project directly.
-- Composite groups recursively expand through CONTAINS until concrete
-- class_group_id + audience_target rows are reached.

create or replace function public.management_requirement_public_members(
  p_requirement_id uuid
)
returns table (
  class_group_id uuid,
  target text,
  subgroup text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive group_tree(group_id, path) as (
    select
      requirement.instructional_group_id,
      array[requirement.instructional_group_id]::uuid[]
    from public.course_requirements requirement
    where requirement.id = p_requirement_id

    union all

    select
      relation.right_group_id,
      tree.path || relation.right_group_id
    from group_tree tree
    join public.instructional_group_relations relation
      on relation.left_group_id = tree.group_id
     and relation.relation = 'CONTAINS'
    where not relation.right_group_id = any(tree.path)
  )
  select distinct
    instructional_group.class_group_id,
    instructional_group.audience_target::text,
    instructional_group.subgroup_label
  from group_tree tree
  join public.instructional_groups instructional_group
    on instructional_group.id = tree.group_id
  where instructional_group.class_group_id is not null
    and instructional_group.audience_target::text
      in ('SECTION', 'BALLET', 'MUSIC')
$$;

revoke all
  on function public.management_requirement_public_members(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- PUBLIC BASELINE STATUS
-- -------------------------------------------------------------------------

create or replace function public.management_publication_baseline_status(
  p_academic_year text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_control record;
  v_latest record;
  v_expected_session_count integer;
  v_expected_group_count integer;
  v_expected_sessions_hash text;
  v_expected_groups_hash text;
  v_current_session_count integer;
  v_current_group_count integer;
  v_current_sessions_hash text;
  v_current_groups_hash text;
  v_source text;
begin
  select *
  into v_control
  from public.management_publication_controls control
  where control.academic_year = p_academic_year;

  if not found then
    return jsonb_build_object(
      'healthy', false,
      'source', 'MISSING_CONTROL',
      'academicYear', p_academic_year
    );
  end if;

  select publication.*
  into v_latest
  from public.management_publications publication
  where publication.academic_year = p_academic_year
  order by publication.publication_number desc
  limit 1;

  if found then
    v_expected_session_count := v_latest.after_session_count;
    v_expected_group_count := v_latest.after_group_count;
    v_expected_sessions_hash := v_latest.after_sessions_hash;
    v_expected_groups_hash := v_latest.after_groups_hash;
    v_source := 'PUBLICATION_' || v_latest.publication_number::text;
  else
    v_expected_session_count := v_control.bootstrap_session_count;
    v_expected_group_count := v_control.bootstrap_group_count;
    v_expected_sessions_hash := v_control.bootstrap_sessions_hash;
    v_expected_groups_hash := v_control.bootstrap_groups_hash;
    v_source := 'BOOTSTRAP';
  end if;

  select count(*)
  into v_current_session_count
  from public.schedule_sessions
  where academic_year = p_academic_year;

  select count(*)
  into v_current_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = p_academic_year;

  v_current_sessions_hash :=
    public.management_public_sessions_hash(p_academic_year);
  v_current_groups_hash :=
    public.management_public_groups_hash(p_academic_year);

  return jsonb_build_object(
    'healthy',
      v_current_session_count = v_expected_session_count
      and v_current_group_count = v_expected_group_count
      and v_current_sessions_hash = v_expected_sessions_hash
      and v_current_groups_hash = v_expected_groups_hash,
    'source', v_source,
    'academicYear', p_academic_year,
    'expectedSessionCount', v_expected_session_count,
    'currentSessionCount', v_current_session_count,
    'expectedGroupCount', v_expected_group_count,
    'currentGroupCount', v_current_group_count,
    'expectedSessionsHash', v_expected_sessions_hash,
    'currentSessionsHash', v_current_sessions_hash,
    'expectedGroupsHash', v_expected_groups_hash,
    'currentGroupsHash', v_current_groups_hash
  );
end
$$;

revoke all
  on function public.management_publication_baseline_status(text)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- STATE TOKEN
-- -------------------------------------------------------------------------
create or replace function public.management_publication_state_token(
  p_schedule_revision_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_cards jsonb;
  v_placements jsonb;
  v_summaries jsonb;
  v_moves jsonb;
  v_requirements jsonb;
  v_groups jsonb;
  v_relations jsonb;
  v_baseline jsonb;
  v_control jsonb;
begin
  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number,
    revision.status,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', card.id,
        'requirementId', card.requirement_id,
        'blockIndex', card.block_index,
        'durationPeriods', card.duration_periods,
        'locked', card.locked
      )
      order by card.requirement_id, card.block_index, card.id
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', placement.card_id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period,
        'teacherId', placement.teacher_id,
        'roomId', placement.room_id
      )
      order by placement.card_id
    ),
    '[]'::jsonb
  )
  into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', summary.card_id,
        'unresolvedCount', summary.unresolved_count,
        'isContradiction', summary.is_contradiction
      )
      order by summary.card_id
    ),
    '[]'::jsonb
  )
  into v_summaries
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', move.id,
        'actorType', move.actor_type,
        'action', move.action,
        'payload', move.payload,
        'revertedAt', move.reverted_at
      )
      order by move.created_at, move.id
    ),
    '[]'::jsonb
  )
  into v_moves
  from public.move_transactions move
  where move.schedule_revision_id = p_schedule_revision_id
    and move.actor_type = 'USER'
    and move.action in ('PLACE', 'MOVE', 'REMOVE');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', requirement.id,
        'subjectId', requirement.subject_id,
        'instructionalGroupId', requirement.instructional_group_id,
        'weeklyLoad', requirement.weekly_load,
        'termStatus', requirement.term_status,
        'teacherMode', requirement.teacher_mode,
        'resourceMode', requirement.resource_mode,
        'requiredCapability', requirement.required_capability,
        'deliveryMode', requirement.delivery_mode
      )
      order by requirement.id
    ),
    '[]'::jsonb
  )
  into v_requirements
  from public.course_requirements requirement
  where requirement.requirement_set_id = v_revision.requirement_set_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', instructional_group.id,
        'classGroupId', instructional_group.class_group_id,
        'groupType', instructional_group.group_type,
        'termStatus', instructional_group.term_status,
        'audienceTarget', instructional_group.audience_target,
        'subgroupLabel', instructional_group.subgroup_label
      )
      order by instructional_group.id
    ),
    '[]'::jsonb
  )
  into v_groups
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_revision.requirement_set_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leftGroupId', relation.left_group_id,
        'rightGroupId', relation.right_group_id,
        'relation', relation.relation
      )
      order by relation.left_group_id, relation.right_group_id, relation.relation
    ),
    '[]'::jsonb
  )
  into v_relations
  from public.instructional_group_relations relation
  join public.instructional_groups left_group
    on left_group.id = relation.left_group_id
  where left_group.requirement_set_id =
    v_revision.requirement_set_id;

  v_baseline :=
    public.management_publication_baseline_status(
      v_revision.academic_year
    );

  select to_jsonb(control)
  into v_control
  from public.management_publication_controls control
  where control.academic_year = v_revision.academic_year;

  return md5(
    jsonb_build_object(
      'revision', jsonb_build_object(
        'id', v_revision.id,
        'requirementSetId', v_revision.requirement_set_id,
        'versionNumber', v_revision.version_number,
        'status', v_revision.status,
        'academicYear', v_revision.academic_year,
        'term', v_revision.term
      ),
      'cards', v_cards,
      'placements', v_placements,
      'summaries', v_summaries,
      'moves', v_moves,
      'requirements', v_requirements,
      'groups', v_groups,
      'relations', v_relations,
      'baseline', v_baseline,
      'control', coalesce(v_control, '{}'::jsonb)
    )::text
  );
end
$$;

revoke all
  on function public.management_publication_state_token(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- M19.2 SERVER-SIDE PUBLICATION PREVIEW / READINESS
-- -------------------------------------------------------------------------
create or replace function public.management_preview_publication(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_control record;
  v_baseline jsonb;

  v_total_cards integer;
  v_placed_cards integer;
  v_unplaced_cards integer;
  v_contradictions integer;
  v_unresolved_touched integer;
  v_unresolved_inherited integer;
  v_missing_summaries integer;
  v_invalid_periods integer;
  v_memberless_requirements integer;
  v_inactive_room_placements integer;

  v_projected_sessions integer;
  v_projected_groups integer;

  v_block_reasons jsonb := '[]'::jsonb;
  v_warning_reasons jsonb := '[]'::jsonb;
  v_can_publish boolean;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M19.2 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number,
    revision.status,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M19.2 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception 'M19.2 publication preview requires DRAFT revision';
  end if;

  select *
  into v_control
  from public.management_publication_controls control
  where control.academic_year = v_revision.academic_year;

  if not found then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('PUBLICATION_CONTROL_MISSING');
  elsif not v_control.runtime_adjustments_reconciled then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('RUNTIME_ADJUSTMENTS_PENDING');
  end if;

  v_baseline :=
    public.management_publication_baseline_status(
      v_revision.academic_year
    );

  if not coalesce((v_baseline ->> 'healthy')::boolean, false) then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('PUBLIC_BASELINE_DRIFT');
  end if;

  select count(*)
  into v_total_cards
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_placed_cards
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id;

  v_unplaced_cards := greatest(v_total_cards - v_placed_cards, 0);

  if v_unplaced_cards > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('UNPLACED_CARDS');
  end if;

  select count(*)
  into v_missing_summaries
  from public.schedule_cards card
  left join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and summary.card_id is null;

  if v_missing_summaries > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('DOMAIN_SUMMARY_MISSING');
  end if;

  select count(*)
  into v_contradictions
  from public.schedule_cards card
  join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and summary.is_contradiction;

  if v_contradictions > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('CONTRADICTIONS');
  end if;

  with card_state as (
    select
      card.id,
      coalesce(summary.unresolved_count, 0) as unresolved_count,
      coalesce(summary.is_contradiction, false) as is_contradiction,
      exists (
        select 1
        from public.move_transactions move
        where move.schedule_revision_id = p_schedule_revision_id
          and move.actor_type = 'USER'
          and move.action in ('PLACE', 'MOVE', 'REMOVE')
          and move.payload ->> 'card_id' = card.id::text
      ) as touched
    from public.schedule_cards card
    left join public.schedule_card_domain_summaries summary
      on summary.card_id = card.id
    where card.schedule_revision_id = p_schedule_revision_id
  )
  select
    count(*) filter (
      where unresolved_count > 0
        and touched
        and not is_contradiction
    ),
    count(*) filter (
      where unresolved_count > 0
        and not touched
        and not is_contradiction
    )
  into
    v_unresolved_touched,
    v_unresolved_inherited
  from card_state;

  if v_unresolved_touched > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('UNRESOLVED_TOUCHED');
  end if;

  if v_unresolved_inherited > 0 then
    v_warning_reasons :=
      v_warning_reasons || jsonb_build_array('UNRESOLVED_INHERITED');
  end if;

  select count(*)
  into v_invalid_periods
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and (
      placement.start_period < 1
      or placement.start_period + card.duration_periods - 1 > 12
    );

  if v_invalid_periods > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('INVALID_PERIOD_RANGE');
  end if;

  select count(distinct requirement.id)
  into v_memberless_requirements
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and not exists (
      select 1
      from public.management_requirement_public_members(requirement.id)
    );

  if v_memberless_requirements > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('PUBLIC_MEMBER_MAPPING_MISSING');
  end if;

  select count(*)
  into v_inactive_room_placements
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  join public.rooms selected_room
    on selected_room.id = placement.room_id
  join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where card.schedule_revision_id = p_schedule_revision_id
    and canonical_room.operational_status <> 'ACTIVE';

  if v_inactive_room_placements > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('INACTIVE_ROOM_PLACEMENT');
  end if;

  select coalesce(sum(card.duration_periods), 0)::integer
  into v_projected_sessions
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id;

  select coalesce(
    sum(
      card.duration_periods
      * (
        select count(*)
        from public.management_requirement_public_members(
          card.requirement_id
        )
      )
    ),
    0
  )::integer
  into v_projected_groups
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id;

  v_can_publish :=
    jsonb_array_length(v_block_reasons) = 0;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'revisionVersion', v_revision.version_number,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'canPublish', v_can_publish,
    'canCurrentUserPublish',
      v_can_publish and public.has_management_role('ADMIN'),
    'blockReasons', v_block_reasons,
    'warningReasons', v_warning_reasons,
    'totalCards', v_total_cards,
    'placedCards', v_placed_cards,
    'unplacedCards', v_unplaced_cards,
    'contradictionCount', v_contradictions,
    'unresolvedTouchedCount', v_unresolved_touched,
    'unresolvedInheritedCount', v_unresolved_inherited,
    'missingDomainSummaryCount', v_missing_summaries,
    'invalidPeriodCount', v_invalid_periods,
    'memberlessRequirementCount', v_memberless_requirements,
    'inactiveRoomPlacementCount', v_inactive_room_placements,
    'projectedSessionCount', v_projected_sessions,
    'projectedGroupCount', v_projected_groups,
    'baseline', v_baseline,
    'runtimeAdjustmentsReconciled',
      coalesce(v_control.runtime_adjustments_reconciled, false),
    'stateToken',
      public.management_publication_state_token(
        p_schedule_revision_id
      )
  );
end
$$;

revoke all
  on function public.management_preview_publication(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_publication(uuid)
  to authenticated;

comment on function public.management_preview_publication(uuid) is
  'M19.2 read-only server publication gate. Mirrors management health blockers, validates public audience projection and baseline hashes, and blocks while runtime schedule adjustments remain unreconciled.';

comment on table public.management_publications is
  'Durable successful publication audit. M19.2 creates the table but performs no publication mutation.';
comment on table public.management_publication_sessions is
  'Durable session-to-requirement mapping for successful publications; used by future comparison baselines without overwriting bootstrap source evidence.';
comment on table public.management_publication_controls is
  'Per-academic-year publication safety controls and bootstrap public-projection hashes.';

commit;

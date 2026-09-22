-- Management / M19.5
-- Publication lifecycle foundation + public projection metadata.
--
-- This migration does NOT publish or mutate schedule_sessions/session_groups.
-- It prepares the atomic handoff contract needed by the future publication
-- command and makes the legacy frontend compatibility overlay publication-aware.

begin;

-- -------------------------------------------------------------------------
-- PUBLIC PROJECTION METADATA
-- -------------------------------------------------------------------------
-- The current student/teacher frontend still needs data/scheduleAdjustments.ts
-- because raw schedule_sessions does not yet contain the effective 5A overlays.
--
-- Deploy the frontend metadata check BEFORE the first managed publication.
-- The future atomic publication transaction will switch
-- runtime_adjustments_required to false in the same transaction that replaces
-- the public projection. That avoids any double-adjustment deployment window.

create table if not exists public.schedule_projection_metadata (
  academic_year text primary key,
  projection_version integer not null default 0
    check (projection_version >= 0),
  runtime_adjustments_required boolean not null default true,
  published_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.schedule_projection_metadata (
  academic_year,
  projection_version,
  runtime_adjustments_required,
  published_at
)
values (
  '2026-2027',
  0,
  true,
  null
)
on conflict (academic_year) do nothing;

alter table public.schedule_projection_metadata enable row level security;

revoke all
  on public.schedule_projection_metadata
  from anon, authenticated;

grant select
  on public.schedule_projection_metadata
  to anon, authenticated;

drop policy if exists schedule_projection_metadata_public_read
  on public.schedule_projection_metadata;

create policy schedule_projection_metadata_public_read
  on public.schedule_projection_metadata
  for select
  to anon, authenticated
  using (true);

comment on table public.schedule_projection_metadata is
  'Public read-only projection generation metadata. runtime_adjustments_required stays true until the first managed publication atomically materializes the legacy effective schedule into schedule_sessions/session_groups.';


-- -------------------------------------------------------------------------
-- REQUIREMENT LINEAGE
-- -------------------------------------------------------------------------
-- Publishing freezes the current requirement set. The next editable DRAFT must
-- be a clone with new requirement IDs; this mapping lets future publication
-- comparison translate the latest published requirement IDs to their cloned
-- draft successors without rewriting the immutable bootstrap source evidence.

create table if not exists public.management_requirement_lineage (
  child_requirement_id uuid primary key
    references public.course_requirements(id) on delete cascade,
  parent_requirement_id uuid not null
    references public.course_requirements(id) on delete restrict,
  publication_id uuid not null
    references public.management_publications(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint management_requirement_lineage_not_self
    check (child_requirement_id <> parent_requirement_id)
);

create index if not exists
  management_requirement_lineage_parent_idx
  on public.management_requirement_lineage (parent_requirement_id);

create index if not exists
  management_requirement_lineage_publication_idx
  on public.management_requirement_lineage (publication_id);

alter table public.management_requirement_lineage enable row level security;

revoke all
  on public.management_requirement_lineage
  from anon, authenticated;

grant select
  on public.management_requirement_lineage
  to authenticated;

drop policy if exists management_requirement_lineage_read
  on public.management_requirement_lineage;

create policy management_requirement_lineage_read
  on public.management_requirement_lineage
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

comment on table public.management_requirement_lineage is
  'Publication clone lineage from a new editable requirement to the requirement frozen by the publication that created it.';


-- -------------------------------------------------------------------------
-- LIFECYCLE UNIQUENESS INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_duplicate_draft_terms integer;
  v_duplicate_published_terms integer;
begin
  select count(*)
  into v_duplicate_draft_terms
  from (
    select academic_year, term
    from public.requirement_sets
    where status = 'DRAFT'
    group by academic_year, term
    having count(*) > 1
  ) duplicates;

  if v_duplicate_draft_terms <> 0 then
    raise exception
      'M19.5 cannot enforce lifecycle invariant: % academic-year/term pairs have multiple DRAFT requirement sets',
      v_duplicate_draft_terms;
  end if;

  select count(*)
  into v_duplicate_published_terms
  from (
    select academic_year, term
    from public.requirement_sets
    where status = 'PUBLISHED'
    group by academic_year, term
    having count(*) > 1
  ) duplicates;

  if v_duplicate_published_terms <> 0 then
    raise exception
      'M19.5 cannot enforce lifecycle invariant: % academic-year/term pairs have multiple PUBLISHED requirement sets',
      v_duplicate_published_terms;
  end if;
end
$$;

create unique index if not exists requirement_sets_one_draft_per_term_uidx
  on public.requirement_sets (academic_year, term)
  where status = 'DRAFT';

create unique index if not exists requirement_sets_one_published_per_term_uidx
  on public.requirement_sets (academic_year, term)
  where status = 'PUBLISHED';

create unique index if not exists schedule_revisions_one_draft_per_set_uidx
  on public.schedule_revisions (requirement_set_id)
  where status = 'DRAFT';

create unique index if not exists schedule_revisions_one_published_per_set_uidx
  on public.schedule_revisions (requirement_set_id)
  where status = 'PUBLISHED';


-- -------------------------------------------------------------------------
-- READ-ONLY PUBLICATION LIFECYCLE PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_publication_lifecycle(
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
  v_gate jsonb;
  v_metadata record;

  v_next_requirement_set_version integer;
  v_next_revision_version integer;

  v_group_count integer;
  v_group_relation_count integer;
  v_requirement_count integer;
  v_teacher_assignment_count integer;
  v_room_assignment_count integer;
  v_card_count integer;
  v_placement_count integer;
  v_teacher_override_count integer;
  v_room_override_count integer;

  v_source_evidence_count integer;
  v_move_history_count integer;
  v_domain_summary_count integer;
  v_candidate_assessment_count integer;

  v_metadata_ready boolean;
  v_can_transition boolean;
  v_can_current_user_transition boolean;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M19.5 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number as revision_version,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.version_number as requirement_set_version,
    requirement_set.status as requirement_set_status,
    requirement_set.parent_id
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M19.5 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M19.5 lifecycle preview requires a DRAFT revision on a DRAFT requirement set';
  end if;

  v_gate :=
    public.management_preview_publication(p_schedule_revision_id);

  select *
  into v_metadata
  from public.schedule_projection_metadata metadata
  where metadata.academic_year = v_revision.academic_year;

  v_metadata_ready := found;

  select coalesce(max(requirement_set.version_number), 0) + 1
  into v_next_requirement_set_version
  from public.requirement_sets requirement_set
  where requirement_set.academic_year = v_revision.academic_year
    and requirement_set.term = v_revision.term;

  select coalesce(max(revision.version_number), 0) + 1
  into v_next_revision_version
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = v_revision.academic_year
    and requirement_set.term = v_revision.term;

  select count(*)
  into v_group_count
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_group_relation_count
  from public.instructional_group_relations relation
  where exists (
    select 1
    from public.instructional_groups instructional_group
    where instructional_group.requirement_set_id =
      v_revision.requirement_set_id
      and instructional_group.id = relation.left_group_id
  );

  select count(*)
  into v_requirement_count
  from public.course_requirements requirement
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_teacher_assignment_count
  from public.course_requirement_teachers assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_room_assignment_count
  from public.course_requirement_rooms assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_teacher_override_count
  from public.management_teacher_name_overrides name_override
  where name_override.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_room_override_count
  from public.management_room_name_overrides name_override
  where name_override.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_source_evidence_count
  from public.course_requirement_source_sessions evidence
  join public.course_requirements requirement
    on requirement.id = evidence.requirement_id
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_move_history_count
  from public.move_transactions move
  where move.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_domain_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_candidate_assessment_count
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  v_can_transition :=
    coalesce((v_gate ->> 'canPublish')::boolean, false)
    and v_metadata_ready;

  v_can_current_user_transition :=
    v_can_transition
    and public.has_management_role('ADMIN');

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'requirementSetId', v_revision.requirement_set_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,

    'currentRequirementSetVersion',
      v_revision.requirement_set_version,
    'currentRevisionVersion',
      v_revision.revision_version,
    'nextRequirementSetVersion',
      v_next_requirement_set_version,
    'nextRevisionVersion',
      v_next_revision_version,

    'canTransition', v_can_transition,
    'canCurrentUserTransition',
      v_can_current_user_transition,
    'blockReasons',
      case
        when not v_metadata_ready
          then coalesce(v_gate -> 'blockReasons', '[]'::jsonb)
            || jsonb_build_array('PROJECTION_METADATA_MISSING')
        else coalesce(v_gate -> 'blockReasons', '[]'::jsonb)
      end,
    'warningReasons',
      coalesce(v_gate -> 'warningReasons', '[]'::jsonb),
    'stateToken', v_gate ->> 'stateToken',

    'projectionMetadata', jsonb_build_object(
      'present', v_metadata_ready,
      'projectionVersion',
        case when v_metadata_ready
          then v_metadata.projection_version
          else null
        end,
      'runtimeAdjustmentsRequired',
        case when v_metadata_ready
          then v_metadata.runtime_adjustments_required
          else null
        end,
      'publishedAt',
        case when v_metadata_ready
          then v_metadata.published_at
          else null
        end
    ),

    'clonePlan', jsonb_build_object(
      'requirementSets', 1,
      'instructionalGroups', v_group_count,
      'groupRelations', v_group_relation_count,
      'courseRequirements', v_requirement_count,
      'teacherAssignments', v_teacher_assignment_count,
      'roomAssignments', v_room_assignment_count,
      'scheduleCards', v_card_count,
      'placements', v_placement_count,
      'teacherNameOverrides', v_teacher_override_count,
      'roomNameOverrides', v_room_override_count
    ),

    'resetPlan', jsonb_build_object(
      'sourceEvidenceRowsNotCloned', v_source_evidence_count,
      'moveTransactionsNotCloned', v_move_history_count,
      'domainSummariesRebuilt', v_domain_summary_count,
      'candidateAssessmentsRebuilt', v_candidate_assessment_count
    ),

    'strategies', jsonb_build_object(
      'requirementSet',
        'FREEZE_PUBLISHED_AND_CLONE_NEW_DRAFT',
      'scheduleRevision',
        'FREEZE_PUBLISHED_AND_CLONE_NEW_DRAFT',
      'requirementLineage',
        'CREATE_CHILD_TO_PARENT_MAPPING',
      'sourceEvidence',
        'KEEP_BOOTSTRAP_IMMUTABLE_USE_PUBLICATION_MAPPING',
      'moveHistory',
        'RESET_FOR_NEW_DRAFT',
      'candidateDomain',
        'REBUILD_FOR_NEW_DRAFT',
      'nameOverrides',
        'CLONE_PENDING_DRAFT_OVERRIDES',
      'runtimeOverlay',
        'SWITCH_PUBLIC_METADATA_FALSE_IN_PUBLICATION_TRANSACTION'
    ),

    'publicationGate', v_gate
  );
end
$$;

revoke all
  on function public.management_preview_publication_lifecycle(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_publication_lifecycle(uuid)
  to authenticated;

comment on function public.management_preview_publication_lifecycle(uuid) is
  'M19.5 read-only lifecycle proof. Describes the frozen-published + cloned-next-draft transition contract, including clone/reset counts and the projection metadata switch, without mutating either management or public schedule data.';


-- -------------------------------------------------------------------------
-- MIGRATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_sessions integer;
  v_groups integer;
  v_runtime_required boolean;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M19.5 modified public projection unexpectedly: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  select runtime_adjustments_required
  into v_runtime_required
  from public.schedule_projection_metadata
  where academic_year = '2026-2027';

  if v_runtime_required is distinct from true then
    raise exception
      'M19.5 bootstrap projection metadata must keep runtime adjustments required';
  end if;

  if exists (
    select 1
    from public.management_requirement_lineage
  ) then
    raise exception
      'M19.5 lifecycle foundation must not create requirement lineage rows before publication';
  end if;
end
$$;

commit;

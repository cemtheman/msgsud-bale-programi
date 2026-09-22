-- Management / M22
-- Provisional Resource Semantics v1 — candidate-domain foundation.
--
-- Product invariant:
--   UNKNOWN != ABSENT != UNAVAILABLE
--
-- This phase changes only derived scheduling semantics and resource certainty
-- metadata. It intentionally does NOT yet change the manual PLACE/MOVE RPC
-- signatures/behavior; controlled provisional placement/reconciliation follows
-- in M22.1 after this domain model is live-validated.
--
-- Rules:
--   * teacher_mode=UNKNOWN is schedulable with a provisional unknown identity
--   * resource_mode=UNKNOWN is schedulable with a provisional unknown room
--   * CAPABILITY with only unconfirmed matching rooms is schedulable but warned
--   * FIXED/ELIGIBLE_POOL with no assignment remains UNRESOLVED
--   * CAPABILITY with no matching room at all is a hard NO_ELIGIBLE_ROOM block
--   * inactive rooms remain hard INVALID through M18.6
--   * provisional candidates are never deterministic forced-propagation targets
--
-- SAFETY:
--   * no public schedule mutation
--   * no card placement/move/removal
--   * no M20.3 invocation
--   * no publication/template unlock
--   * candidate/domain rows are derived state and are rebuilt

begin;


-- -------------------------------------------------------------------------
-- PRE-MIGRATION SAFETY SNAPSHOT
-- -------------------------------------------------------------------------

create temporary table m22_guard on commit drop as
select
  (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
  )::integer as public_session_count,
  (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
  )::integer as public_group_count,
  (
    select md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'card_id', placement.card_id,
            'day_of_week', placement.day_of_week,
            'start_period', placement.start_period,
            'teacher_id', placement.teacher_id,
            'room_id', placement.room_id
          )::text,
          '|' order by placement.card_id
        ),
        ''
      )
    )
    from public.placements placement
  ) as placement_semantic_hash;


-- -------------------------------------------------------------------------
-- CANDIDATE CERTAINTY METADATA
-- -------------------------------------------------------------------------

alter table public.schedule_card_candidate_assessments
  add column if not exists warning_codes text[] not null
    default array[]::text[],
  add column if not exists teacher_resolution_status text not null
    default 'RESOLVED',
  add column if not exists room_resolution_status text not null
    default 'RESOLVED';

alter table public.schedule_card_candidate_assessments
  drop constraint if exists
    schedule_card_candidate_teacher_resolution_status_check,
  drop constraint if exists
    schedule_card_candidate_room_resolution_status_check;

alter table public.schedule_card_candidate_assessments
  add constraint schedule_card_candidate_teacher_resolution_status_check
    check (
      teacher_resolution_status in (
        'RESOLVED',
        'PROVISIONAL_UNKNOWN',
        'BLOCKED_MISSING_ASSIGNMENT'
      )
    ),
  add constraint schedule_card_candidate_room_resolution_status_check
    check (
      room_resolution_status in (
        'RESOLVED',
        'PROVISIONAL_UNKNOWN',
        'PROVISIONAL_CAPABILITY',
        'BLOCKED_MISSING_ASSIGNMENT',
        'BLOCKED_NO_ELIGIBLE_ROOM'
      )
    );

comment on column public.schedule_card_candidate_assessments.warning_codes is
  'M22 non-blocking candidate warnings. Provisional resource identity/certainty belongs here rather than reason_codes.';
comment on column public.schedule_card_candidate_assessments.teacher_resolution_status is
  'M22 teacher certainty: RESOLVED, PROVISIONAL_UNKNOWN, or BLOCKED_MISSING_ASSIGNMENT.';
comment on column public.schedule_card_candidate_assessments.room_resolution_status is
  'M22 room certainty: RESOLVED, PROVISIONAL_UNKNOWN, PROVISIONAL_CAPABILITY, BLOCKED_MISSING_ASSIGNMENT, or BLOCKED_NO_ELIGIBLE_ROOM.';
comment on column public.schedule_card_candidate_assessments.is_complete is
  'M22 schedulability completeness. TRUE means the candidate has sufficient time/resource semantics to be scheduled; provisional UNKNOWN resource identities may therefore be NULL while complete.';


-- -------------------------------------------------------------------------
-- PROVISIONAL CANDIDATE NORMALIZER
-- -------------------------------------------------------------------------
-- Existing M14.2/M14.3 candidate builders remain the source for time/resource
-- combinations. This trigger changes only the interpretation of uncertainty.

create or replace function public.management_apply_provisional_candidate_semantics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reasons text[] :=
    coalesce(new.reason_codes, array[]::text[]);
  v_warnings text[] :=
    coalesce(new.warning_codes, array[]::text[]);
  v_hard_invalid boolean;
  v_hard_unresolved boolean;
begin
  -- Teacher UNKNOWN is knowledge uncertainty, not resource unavailability.
  if 'TEACHER_UNKNOWN' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'TEACHER_UNKNOWN'
    );
    v_warnings :=
      v_warnings || array['TEACHER_IDENTITY_PROVISIONAL']::text[];
    new.teacher_resolution_status := 'PROVISIONAL_UNKNOWN';
  elsif 'TEACHER_ASSIGNMENT_MISSING' = any(v_reasons) then
    new.teacher_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
  elsif new.teacher_id is null then
    -- Preserve explicit provisional state across M15 delta revalidation, whose
    -- static reason list no longer contains TEACHER_UNKNOWN after normalization.
    if new.teacher_resolution_status <> 'PROVISIONAL_UNKNOWN' then
      new.teacher_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
    end if;
  else
    new.teacher_resolution_status := 'RESOLVED';
  end if;

  -- Room UNKNOWN is likewise schedulable. An unconfirmed capability match has a
  -- concrete room_id, so real room conflicts are still enforceable.
  if 'ROOM_UNKNOWN' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'ROOM_UNKNOWN'
    );
    v_warnings :=
      v_warnings || array['ROOM_IDENTITY_PROVISIONAL']::text[];
    new.room_resolution_status := 'PROVISIONAL_UNKNOWN';

  elsif 'CAPABILITY_UNCONFIRMED' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'CAPABILITY_UNCONFIRMED'
    );
    v_warnings :=
      v_warnings || array['ROOM_CAPABILITY_PROVISIONAL']::text[];
    new.room_resolution_status := 'PROVISIONAL_CAPABILITY';

  elsif 'CAPABILITY_UNRESOLVED' = any(v_reasons) then
    -- No room carries the required capability at all. This is not mere
    -- uncertainty; there is currently no eligible resource.
    v_reasons := array(
      select case
        when reason = 'CAPABILITY_UNRESOLVED'
          then 'NO_ELIGIBLE_ROOM'
        else reason
      end
      from unnest(v_reasons) reason
    );
    new.room_resolution_status := 'BLOCKED_NO_ELIGIBLE_ROOM';

  elsif 'ROOM_ASSIGNMENT_MISSING' = any(v_reasons) then
    new.room_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';

  elsif new.room_id is null then
    if new.room_resolution_status <> 'PROVISIONAL_UNKNOWN' then
      new.room_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
    end if;
  else
    new.room_resolution_status := 'RESOLVED';
  end if;

  -- Normalize arrays after translating uncertainty into warnings.
  select coalesce(
    array_agg(distinct reason order by reason),
    array[]::text[]
  )
  into v_reasons
  from unnest(v_reasons) reason;

  select coalesce(
    array_agg(distinct warning order by warning),
    array[]::text[]
  )
  into v_warnings
  from unnest(v_warnings) warning;

  new.reason_codes := v_reasons;
  new.warning_codes := v_warnings;

  v_hard_invalid :=
    v_reasons && array[
      'TIME_OUTSIDE_DAY',
      'LUNCH_BREAK_CROSSING',
      'TEACHER_CONFLICT',
      'ROOM_CONFLICT',
      'GROUP_CONFLICT',
      'ROOM_INACTIVE',
      'NO_ELIGIBLE_ROOM'
    ]::text[];

  v_hard_unresolved :=
    v_reasons && array[
      'TEACHER_ASSIGNMENT_MISSING',
      'ROOM_ASSIGNMENT_MISSING'
    ]::text[];

  if v_hard_invalid then
    new.status := 'INVALID';
    new.is_complete := false;
  elsif v_hard_unresolved then
    new.status := 'UNRESOLVED';
    new.is_complete := false;
  elsif cardinality(v_reasons) > 0 then
    -- Unknown future static reason codes stay conservative.
    if new.status = 'INVALID' then
      new.is_complete := false;
    else
      new.status := 'UNRESOLVED';
      new.is_complete := false;
    end if;
  else
    new.status := 'VALID';
    new.is_complete := true;
  end if;

  new.details :=
    coalesce(new.details, '{}'::jsonb)
    || jsonb_build_object(
      'resource_semantics_version', 'M22-v1',
      'teacher_resolution_status',
        new.teacher_resolution_status,
      'room_resolution_status',
        new.room_resolution_status
    );

  return new;
end
$$;

drop trigger if exists
  zz_management_apply_provisional_candidate_semantics_trigger
  on public.schedule_card_candidate_assessments;

create trigger zz_management_apply_provisional_candidate_semantics_trigger
before insert or update
on public.schedule_card_candidate_assessments
for each row
execute function public.management_apply_provisional_candidate_semantics();

revoke all
  on function public.management_apply_provisional_candidate_semantics()
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- DOMAIN SUMMARY: PROVISIONAL CANDIDATES MUST NEVER BECOME FORCED
-- -------------------------------------------------------------------------

alter table public.schedule_card_domain_summaries
  add column if not exists provisional_valid_count integer not null
    default 0;

alter table public.schedule_card_domain_summaries
  drop constraint if exists schedule_card_domain_forced_rule;

alter table public.schedule_card_domain_summaries
  add constraint schedule_card_domain_provisional_valid_count_nonnegative
    check (provisional_valid_count >= 0),
  add constraint schedule_card_domain_forced_rule
    check (
      is_forced = (
        valid_count = 1
        and unresolved_count = 0
        and provisional_valid_count = 0
      )
    );

create or replace function public.management_apply_provisional_domain_summary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provisional_valid_count integer;
begin
  select count(*)::integer
  into v_provisional_valid_count
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = new.card_id
    and assessment.status = 'VALID'
    and (
      assessment.teacher_resolution_status <> 'RESOLVED'
      or assessment.room_resolution_status <> 'RESOLVED'
      or cardinality(assessment.warning_codes) > 0
    );

  new.provisional_valid_count :=
    coalesce(v_provisional_valid_count, 0);

  new.is_forced :=
    new.valid_count = 1
    and new.unresolved_count = 0
    and new.provisional_valid_count = 0;

  return new;
end
$$;

drop trigger if exists
  zz_management_apply_provisional_domain_summary_trigger
  on public.schedule_card_domain_summaries;

create trigger zz_management_apply_provisional_domain_summary_trigger
before insert or update
on public.schedule_card_domain_summaries
for each row
execute function public.management_apply_provisional_domain_summary();

revoke all
  on function public.management_apply_provisional_domain_summary()
  from public, anon, authenticated;

comment on column public.schedule_card_domain_summaries.provisional_valid_count is
  'M22 count of VALID candidates whose teacher/room resolution is provisional. Any provisional VALID candidate prevents deterministic forced propagation for that card.';


-- -------------------------------------------------------------------------
-- PLACEMENT RESOURCE CERTAINTY
-- -------------------------------------------------------------------------

alter table public.placements
  add column if not exists teacher_resolution_status text not null
    default 'RESOLVED',
  add column if not exists room_resolution_status text not null
    default 'RESOLVED',
  add column if not exists resource_warning_codes text[] not null
    default array[]::text[];

alter table public.placements
  drop constraint if exists placements_teacher_resolution_status_check,
  drop constraint if exists placements_room_resolution_status_check;

alter table public.placements
  add constraint placements_teacher_resolution_status_check
    check (
      teacher_resolution_status in (
        'RESOLVED',
        'PROVISIONAL_UNKNOWN',
        'INCONSISTENT'
      )
    ),
  add constraint placements_room_resolution_status_check
    check (
      room_resolution_status in (
        'RESOLVED',
        'PROVISIONAL_UNKNOWN',
        'PROVISIONAL_CAPABILITY',
        'INCONSISTENT'
      )
    );

create or replace function public.management_apply_provisional_placement_semantics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_teacher_mode text;
  v_resource_mode text;
  v_room_knowledge_status text;
  v_warnings text[] := array[]::text[];
begin
  select
    requirement.teacher_mode,
    requirement.resource_mode
  into
    v_teacher_mode,
    v_resource_mode
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.id = new.card_id;

  if new.teacher_id is null then
    if v_teacher_mode = 'UNKNOWN' then
      new.teacher_resolution_status := 'PROVISIONAL_UNKNOWN';
      v_warnings :=
        v_warnings || array['TEACHER_IDENTITY_PROVISIONAL']::text[];
    else
      new.teacher_resolution_status := 'INCONSISTENT';
      v_warnings :=
        v_warnings || array['TEACHER_ASSIGNMENT_INCONSISTENT']::text[];
    end if;
  else
    new.teacher_resolution_status := 'RESOLVED';
  end if;

  if new.room_id is null then
    if v_resource_mode = 'UNKNOWN' then
      new.room_resolution_status := 'PROVISIONAL_UNKNOWN';
      v_warnings :=
        v_warnings || array['ROOM_IDENTITY_PROVISIONAL']::text[];
    else
      new.room_resolution_status := 'INCONSISTENT';
      v_warnings :=
        v_warnings || array['ROOM_ASSIGNMENT_INCONSISTENT']::text[];
    end if;
  else
    select coalesce(
      canonical.knowledge_status,
      selected_room.knowledge_status,
      'UNKNOWN'
    )
    into v_room_knowledge_status
    from public.rooms selected_room
    left join public.rooms canonical
      on canonical.id = selected_room.canonical_room_id
    where selected_room.id = new.room_id;

    if v_resource_mode = 'CAPABILITY'
       and coalesce(v_room_knowledge_status, 'UNKNOWN') <> 'CONFIRMED' then
      new.room_resolution_status := 'PROVISIONAL_CAPABILITY';
      v_warnings :=
        v_warnings || array['ROOM_CAPABILITY_PROVISIONAL']::text[];
    else
      new.room_resolution_status := 'RESOLVED';
    end if;
  end if;

  select coalesce(
    array_agg(distinct warning order by warning),
    array[]::text[]
  )
  into new.resource_warning_codes
  from unnest(v_warnings) warning;

  return new;
end
$$;

drop trigger if exists
  zz_management_apply_provisional_placement_semantics_trigger
  on public.placements;

create trigger zz_management_apply_provisional_placement_semantics_trigger
before insert or update of card_id, teacher_id, room_id
on public.placements
for each row
execute function public.management_apply_provisional_placement_semantics();

revoke all
  on function public.management_apply_provisional_placement_semantics()
  from public, anon, authenticated;

comment on column public.placements.teacher_resolution_status is
  'M22 certainty of the teacher identity stored on a placement. NULL may be a legitimate PROVISIONAL_UNKNOWN identity.';
comment on column public.placements.room_resolution_status is
  'M22 certainty of the room identity/capability stored on a placement.';
comment on column public.placements.resource_warning_codes is
  'M22 non-blocking resource certainty warnings attached to an already placed card.';

-- Backfill certainty only; card/time/resource IDs are unchanged.
update public.placements
set
  teacher_id = teacher_id,
  room_id = room_id;


-- -------------------------------------------------------------------------
-- REBUILD DERIVED DOMAIN STATE UNDER M22 SEMANTICS
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
begin
  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.created_at desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M22 expected the active 2026-2027 term-1 DRAFT revision';
  end if;

  perform public.refresh_management_candidate_domain(v_revision_id);
end
$$;


-- -------------------------------------------------------------------------
-- READ-ONLY DIAGNOSTIC
-- -------------------------------------------------------------------------

create or replace function public.management_diagnose_provisional_resource_semantics(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M22 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M22 revision not found: %',
      p_schedule_revision_id;
  end if;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,

    'requirements', (
      select jsonb_build_object(
        'total', count(*),
        'teacherUnknown', count(*) filter (
          where requirement.teacher_mode = 'UNKNOWN'
        ),
        'roomUnknown', count(*) filter (
          where requirement.resource_mode = 'UNKNOWN'
        ),
        'roomCapability', count(*) filter (
          where requirement.resource_mode = 'CAPABILITY'
        )
      )
      from public.course_requirements requirement
      join public.schedule_revisions revision
        on revision.requirement_set_id =
          requirement.requirement_set_id
      where revision.id = p_schedule_revision_id
    ),

    'cards', (
      select jsonb_build_object(
        'total', count(*),
        'validDomain', count(*) filter (
          where summary.domain_status = 'VALID'
        ),
        'unresolvedDomain', count(*) filter (
          where summary.domain_status = 'UNRESOLVED'
        ),
        'invalidDomain', count(*) filter (
          where summary.domain_status = 'INVALID'
        ),
        'contradictions', count(*) filter (
          where summary.is_contradiction
        ),
        'forced', count(*) filter (
          where summary.is_forced
        ),
        'withProvisionalValidCandidates', count(*) filter (
          where summary.provisional_valid_count > 0
        )
      )
      from public.schedule_cards card
      join public.schedule_card_domain_summaries summary
        on summary.card_id = card.id
      where card.schedule_revision_id =
        p_schedule_revision_id
    ),

    'candidates', (
      select jsonb_build_object(
        'total', count(*),
        'valid', count(*) filter (
          where assessment.status = 'VALID'
        ),
        'unresolved', count(*) filter (
          where assessment.status = 'UNRESOLVED'
        ),
        'invalid', count(*) filter (
          where assessment.status = 'INVALID'
        ),
        'teacherProvisional', count(*) filter (
          where assessment.teacher_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomProvisionalUnknown', count(*) filter (
          where assessment.room_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomProvisionalCapability', count(*) filter (
          where assessment.room_resolution_status =
            'PROVISIONAL_CAPABILITY'
        ),
        'noEligibleRoom', count(*) filter (
          where 'NO_ELIGIBLE_ROOM' =
            any(assessment.reason_codes)
        ),
        'legacyUnknownBlockingCodes', count(*) filter (
          where assessment.reason_codes && array[
            'TEACHER_UNKNOWN',
            'ROOM_UNKNOWN',
            'CAPABILITY_UNCONFIRMED'
          ]::text[]
        ),
        'provisionalWarnings', count(*) filter (
          where cardinality(assessment.warning_codes) > 0
        )
      )
      from public.schedule_card_candidate_assessments assessment
      join public.schedule_cards card
        on card.id = assessment.card_id
      where card.schedule_revision_id =
        p_schedule_revision_id
    ),

    'placements', (
      select jsonb_build_object(
        'total', count(*),
        'teacherProvisional', count(*) filter (
          where placement.teacher_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomProvisionalUnknown', count(*) filter (
          where placement.room_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomProvisionalCapability', count(*) filter (
          where placement.room_resolution_status =
            'PROVISIONAL_CAPABILITY'
        ),
        'inconsistentTeacher', count(*) filter (
          where placement.teacher_resolution_status =
            'INCONSISTENT'
        ),
        'inconsistentRoom', count(*) filter (
          where placement.room_resolution_status =
            'INCONSISTENT'
        )
      )
      from public.placements placement
      join public.schedule_cards card
        on card.id = placement.card_id
      where card.schedule_revision_id =
        p_schedule_revision_id
    ),

    'safety', jsonb_build_object(
      'provisionalForcedViolationCount', (
        select count(*)
        from public.schedule_card_domain_summaries summary
        join public.schedule_cards card
          on card.id = summary.card_id
        where card.schedule_revision_id =
            p_schedule_revision_id
          and summary.is_forced
          and summary.provisional_valid_count > 0
      ),
      'validIncompleteViolationCount', (
        select count(*)
        from public.schedule_card_candidate_assessments assessment
        join public.schedule_cards card
          on card.id = assessment.card_id
        where card.schedule_revision_id =
            p_schedule_revision_id
          and assessment.status = 'VALID'
          and not assessment.is_complete
      ),
      'currentEngineManualProvisionalPlacementReady', false,
      'nextStep', 'M22.1_CONTROLLED_PROVISIONAL_PLACEMENT_AND_RECONCILIATION'
    )
  );
end
$$;

revoke all
  on function public.management_diagnose_provisional_resource_semantics(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_provisional_resource_semantics(uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_before record;
  v_after_session_count integer;
  v_after_group_count integer;
  v_after_placement_hash text;
  v_baseline_healthy boolean;
begin
  select *
  into v_before
  from m22_guard;

  select count(*)
  into v_after_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_after_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  select md5(
    coalesce(
      string_agg(
        jsonb_build_object(
          'card_id', placement.card_id,
          'day_of_week', placement.day_of_week,
          'start_period', placement.start_period,
          'teacher_id', placement.teacher_id,
          'room_id', placement.room_id
        )::text,
        '|' order by placement.card_id
      ),
      ''
    )
  )
  into v_after_placement_hash
  from public.placements placement;

  if v_after_session_count <> v_before.public_session_count
     or v_after_group_count <> v_before.public_group_count then
    raise exception
      'M22 modified public projection cardinality';
  end if;

  if v_after_placement_hash is distinct from
      v_before.placement_semantic_hash then
    raise exception
      'M22 modified existing placement time/resource semantics';
  end if;

  if exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.status = 'VALID'
      and not assessment.is_complete
  ) then
    raise exception
      'M22 produced VALID incomplete candidate';
  end if;

  if exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.reason_codes && array[
      'TEACHER_UNKNOWN',
      'ROOM_UNKNOWN',
      'CAPABILITY_UNCONFIRMED'
    ]::text[]
  ) then
    raise exception
      'M22 left provisional uncertainty in blocking reason_codes';
  end if;

  if exists (
    select 1
    from public.schedule_card_domain_summaries summary
    where summary.is_forced
      and summary.provisional_valid_count > 0
  ) then
    raise exception
      'M22 allowed provisional candidate to become forced';
  end if;

  select coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  )
  into v_baseline_healthy;

  if not v_baseline_healthy then
    raise exception
      'M22 caused public baseline drift';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M22 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M22 must not unlock term template apply';
  end if;
end
$$;

commit;

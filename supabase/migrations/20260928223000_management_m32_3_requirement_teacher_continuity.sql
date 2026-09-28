-- Management M32.3
-- Requirement-level teacher continuity.
--
-- Product invariant:
--   One class/group receives one subject from one resolved teacher across all
--   weekly blocks of the same course_requirement.
--
-- ELIGIBLE_POOL remains a choice only until the first resolved placement for
-- that requirement. After that, remaining blocks are candidate-locked to the
-- already used teacher. Provisional UNKNOWN teacher identity remains allowed
-- under M22 semantics until a resolved teacher exists.
--
-- SAFETY:
--   * no published schedule mutation
--   * no automatic reassignment of existing placements
--   * no room semantics changes
--   * hard write guard prevents two different resolved teachers in one
--     requirement/revision
--   * candidate lock is derived and reversible when all resolved sibling
--     placements are removed

begin;

-- Refuse to declare the invariant on top of an already contradictory draft.
do $$
declare
  v_conflict_count integer;
begin
  select count(*)
  into v_conflict_count
  from (
    select
      card.schedule_revision_id,
      card.requirement_id
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where placement.teacher_id is not null
    group by
      card.schedule_revision_id,
      card.requirement_id
    having count(distinct placement.teacher_id) > 1
  ) conflict;

  if v_conflict_count > 0 then
    raise exception
      'M32.3 existing teacher-continuity conflicts found in % requirement(s)',
      v_conflict_count;
  end if;
end
$$;


-- -------------------------------------------------------------------------
-- HARD WRITE GUARD
-- -------------------------------------------------------------------------
-- Keep M22 provisional NULL teacher semantics intact. The hard invariant here
-- prevents two different RESOLVED teacher ids in the same requirement. Once a
-- resolved sibling exists, the candidate engine below removes NULL/different
-- teacher choices from normal scheduling paths.

create or replace function public.management_enforce_requirement_teacher_continuity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_id uuid;
  v_revision_id uuid;
  v_conflicting_teacher_id uuid;
begin
  if new.teacher_id is null then
    return new;
  end if;

  select
    card.requirement_id,
    card.schedule_revision_id
  into
    v_requirement_id,
    v_revision_id
  from public.schedule_cards card
  where card.id = new.card_id;

  if v_requirement_id is null or v_revision_id is null then
    raise exception
      'M32.3 placement card not found for teacher continuity: %',
      new.card_id;
  end if;

  select placement.teacher_id
  into v_conflicting_teacher_id
  from public.placements placement
  join public.schedule_cards sibling
    on sibling.id = placement.card_id
  where sibling.schedule_revision_id = v_revision_id
    and sibling.requirement_id = v_requirement_id
    and sibling.id <> new.card_id
    and placement.teacher_id is not null
    and placement.teacher_id is distinct from new.teacher_id
  limit 1;

  if v_conflicting_teacher_id is not null then
    raise exception
      'M32.3 requirement teacher continuity requires teacher %, not %',
      v_conflicting_teacher_id,
      new.teacher_id;
  end if;

  return new;
end
$$;

drop trigger if exists
  zy_management_requirement_teacher_continuity_trigger
  on public.placements;

create trigger zy_management_requirement_teacher_continuity_trigger
before insert or update of card_id, teacher_id
on public.placements
for each row
execute function public.management_enforce_requirement_teacher_continuity();

revoke all
  on function public.management_enforce_requirement_teacher_continuity()
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- UNIVERSAL CANDIDATE GUARD
-- -------------------------------------------------------------------------
-- Run before the existing M22 provisional-semantics trigger (zy < zz).
-- Any candidate builder/rebuilder therefore sees the same teacher-continuity
-- rule, not only the management group-refresh entrypoint.

create or replace function public.management_apply_requirement_teacher_candidate_lock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_requirement_id uuid;
  v_revision_id uuid;
  v_locked_teacher_id uuid;
  v_teacher_count integer;
begin
  select
    card.requirement_id,
    card.schedule_revision_id
  into
    v_requirement_id,
    v_revision_id
  from public.schedule_cards card
  where card.id = new.card_id;

  if v_requirement_id is null or v_revision_id is null then
    return new;
  end if;

  select
    min(placement.teacher_id::text)::uuid,
    count(distinct placement.teacher_id)
  into
    v_locked_teacher_id,
    v_teacher_count
  from public.placements placement
  join public.schedule_cards sibling
    on sibling.id = placement.card_id
  where sibling.schedule_revision_id = v_revision_id
    and sibling.requirement_id = v_requirement_id
    and sibling.id <> new.card_id
    and placement.teacher_id is not null;

  new.reason_codes := array_remove(
    coalesce(new.reason_codes, array[]::text[]),
    'REQUIREMENT_TEACHER_MISMATCH'
  );
  new.details := coalesce(new.details, '{}'::jsonb)
    - 'requirement_teacher_lock_id';

  if coalesce(v_teacher_count, 0) > 0
     and (
       v_teacher_count > 1
       or new.teacher_id is distinct from v_locked_teacher_id
     ) then
    new.reason_codes := new.reason_codes
      || array['REQUIREMENT_TEACHER_MISMATCH']::text[];
    new.status := 'INVALID';
    new.is_complete := false;
    new.details := new.details || jsonb_build_object(
      'requirement_teacher_lock_id',
      v_locked_teacher_id,
      'teacher_continuity_version',
      'M32.3-v1'
    );
  end if;

  return new;
end
$;

drop trigger if exists
  zy_management_requirement_teacher_candidate_lock_trigger
  on public.schedule_card_candidate_assessments;

create trigger zy_management_requirement_teacher_candidate_lock_trigger
before insert or update
on public.schedule_card_candidate_assessments
for each row
execute function public.management_apply_requirement_teacher_candidate_lock();

revoke all
  on function public.management_apply_requirement_teacher_candidate_lock()
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- FRESH GROUP-CANDIDATE POSTPROCESS
-- -------------------------------------------------------------------------
-- M26.6 bundle candidate rebuilding remains authoritative for time, room,
-- teacher occupancy and group overlap. This postprocess adds only the
-- requirement-level teacher continuity rule.

create or replace function public.management_apply_requirement_teacher_lock_to_candidates(
  p_schedule_revision_id uuid,
  p_card_ids uuid[]
)
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_locked integer := 0;
begin
  if p_card_ids is null or cardinality(p_card_ids) = 0 then
    return 0;
  end if;

  -- Remove a previous derived lock marker. Callers invoke this after a fresh
  -- candidate build/revalidation, so the underlying status already represents
  -- all non-lock constraints.
  update public.schedule_card_candidate_assessments assessment
  set
    reason_codes = array_remove(
      coalesce(assessment.reason_codes, array[]::text[]),
      'REQUIREMENT_TEACHER_MISMATCH'
    ),
    details = coalesce(assessment.details, '{}'::jsonb)
      - 'requirement_teacher_lock_id'
  from public.schedule_cards card
  where assessment.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id
    and card.id = any(p_card_ids);

  with resolved_lock as materialized (
    select
      sibling.requirement_id,
      min(placement.teacher_id::text)::uuid as teacher_id,
      count(distinct placement.teacher_id) as teacher_count
    from public.placements placement
    join public.schedule_cards sibling
      on sibling.id = placement.card_id
    where sibling.schedule_revision_id = p_schedule_revision_id
      and placement.teacher_id is not null
    group by sibling.requirement_id
  )
  update public.schedule_card_candidate_assessments assessment
  set
    status = 'INVALID',
    is_complete = false,
    reason_codes = (
      select coalesce(
        array_agg(distinct reason order by reason),
        array[]::text[]
      )
      from unnest(
        coalesce(assessment.reason_codes, array[]::text[])
        || array['REQUIREMENT_TEACHER_MISMATCH']::text[]
      ) reason
    ),
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'requirement_teacher_lock_id',
        lock_row.teacher_id,
        'teacher_continuity_version',
        'M32.3-v1'
      ),
    generated_at = now()
  from public.schedule_cards card
  join resolved_lock lock_row
    on lock_row.requirement_id = card.requirement_id
  where assessment.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id
    and card.id = any(p_card_ids)
    and (
      lock_row.teacher_count > 1
      or assessment.teacher_id is distinct from lock_row.teacher_id
    );

  get diagnostics v_locked = row_count;

  -- Recompute summaries for the touched cards. The existing M22 summary
  -- trigger remains authoritative for provisional_valid_count/is_forced.
  with aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (where assessment.status = 'VALID')::integer
        as valid_count,
      count(*) filter (where assessment.status = 'INVALID')::integer
        as invalid_count,
      count(*) filter (where assessment.status = 'UNRESOLVED')::integer
        as unresolved_count,
      count(*) filter (where assessment.is_complete)::integer
        as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = any(p_card_ids)
    group by assessment.card_id
  )
  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction,
    generated_at
  )
  select
    aggregate.card_id,
    case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    aggregate.valid_count,
    aggregate.invalid_count,
    aggregate.unresolved_count,
    aggregate.complete_candidate_count,
    (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    now()
  from aggregate
  on conflict (card_id) do update
  set
    domain_status = excluded.domain_status,
    valid_count = excluded.valid_count,
    invalid_count = excluded.invalid_count,
    unresolved_count = excluded.unresolved_count,
    complete_candidate_count = excluded.complete_candidate_count,
    is_forced = excluded.is_forced,
    is_contradiction = excluded.is_contradiction,
    generated_at = excluded.generated_at;

  return v_locked;
end
$$;

revoke all
  on function public.management_apply_requirement_teacher_lock_to_candidates(
    uuid, uuid[]
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- DELTA / EXACT REVALIDATION
-- -------------------------------------------------------------------------

create or replace function public.revalidate_management_candidate_assessments(
  p_schedule_revision_id uuid,
  p_assessment_ids uuid[]
)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
  v_card_ids uuid[];
begin
  if p_assessment_ids is null or cardinality(p_assessment_ids) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(distinct assessment.card_id), array[]::uuid[])
  into v_card_ids
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.id = any(p_assessment_ids)
    and card.schedule_revision_id = p_schedule_revision_id;

  if cardinality(v_card_ids) = 0 then
    return 0;
  end if;

  with target as materialized (
    select
      assessment.id,
      assessment.card_id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id,
      card.duration_periods,
      card.requirement_id,
      requirement.instructional_group_id,
      array(
        select reason
        from unnest(coalesce(assessment.reason_codes, array[]::text[])) as reason
        where reason not in (
          'TEACHER_CONFLICT',
          'ROOM_CONFLICT',
          'GROUP_CONFLICT',
          'REQUIREMENT_TEACHER_MISMATCH'
        )
      )::text[] as static_reason_codes
    from public.schedule_card_candidate_assessments assessment
    join public.schedule_cards card
      on card.id = assessment.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where assessment.id = any(p_assessment_ids)
      and card.schedule_revision_id = p_schedule_revision_id
  ),
  recalculated as materialized (
    select
      target.*,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and target.teacher_id is not null
          and placement.teacher_id = target.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and target.room_id is not null
          and placement.room_id = target.room_id
      ) as room_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        join public.course_requirements occupied_requirement
          on occupied_requirement.id = occupied_card.requirement_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and public.management_instructional_groups_conflict(
            target.instructional_group_id,
            occupied_requirement.instructional_group_id
          )
      ) as group_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards sibling
          on sibling.id = placement.card_id
        where sibling.schedule_revision_id = p_schedule_revision_id
          and sibling.requirement_id = target.requirement_id
          and sibling.id <> target.card_id
          and placement.teacher_id is not null
          and placement.teacher_id is distinct from target.teacher_id
      ) as requirement_teacher_mismatch
    from target
  ),
  classified as materialized (
    select
      recalculated.*,
      (
        recalculated.static_reason_codes && array[
          'TEACHER_UNKNOWN',
          'TEACHER_ASSIGNMENT_MISSING',
          'ROOM_UNKNOWN',
          'ROOM_ASSIGNMENT_MISSING',
          'CAPABILITY_UNCONFIRMED',
          'CAPABILITY_UNRESOLVED'
        ]::text[]
      ) as has_unresolved,
      exists (
        select 1
        from unnest(recalculated.static_reason_codes) as reason
        where reason <> all(array[
          'TEACHER_UNKNOWN',
          'TEACHER_ASSIGNMENT_MISSING',
          'ROOM_UNKNOWN',
          'ROOM_ASSIGNMENT_MISSING',
          'CAPABILITY_UNCONFIRMED',
          'CAPABILITY_UNRESOLVED'
        ]::text[])
      ) as has_hard_static
    from recalculated
  ),
  final as materialized (
    select
      classified.*,
      array_cat(
        classified.static_reason_codes,
        array_remove(
          array[
            case when classified.teacher_conflict then 'TEACHER_CONFLICT' end,
            case when classified.room_conflict then 'ROOM_CONFLICT' end,
            case when classified.group_conflict then 'GROUP_CONFLICT' end,
            case when classified.requirement_teacher_mismatch
              then 'REQUIREMENT_TEACHER_MISMATCH' end
          ]::text[],
          null
        )
      )::text[] as new_reason_codes,
      case
        when classified.has_hard_static
          or classified.teacher_conflict
          or classified.room_conflict
          or classified.group_conflict
          or classified.requirement_teacher_mismatch
          then 'INVALID'
        when classified.has_unresolved
          then 'UNRESOLVED'
        else 'VALID'
      end as new_status
    from classified
  )
  update public.schedule_card_candidate_assessments assessment
  set
    status = final.new_status,
    is_complete = (
      final.teacher_id is not null
      and final.room_id is not null
      and not final.has_unresolved
      and not final.requirement_teacher_mismatch
    ),
    reason_codes = final.new_reason_codes,
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'engine_version', 'M32.3-teacher-continuity-v1'
      ),
    generated_at = now()
  from final
  where assessment.id = final.id;

  get diagnostics v_updated = row_count;

  with aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (where assessment.status = 'VALID')::integer
        as valid_count,
      count(*) filter (where assessment.status = 'INVALID')::integer
        as invalid_count,
      count(*) filter (where assessment.status = 'UNRESOLVED')::integer
        as unresolved_count,
      count(*) filter (where assessment.is_complete)::integer
        as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = any(v_card_ids)
    group by assessment.card_id
  )
  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction,
    generated_at
  )
  select
    aggregate.card_id,
    case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    aggregate.valid_count,
    aggregate.invalid_count,
    aggregate.unresolved_count,
    aggregate.complete_candidate_count,
    (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    now()
  from aggregate
  on conflict (card_id) do update
  set
    domain_status = excluded.domain_status,
    valid_count = excluded.valid_count,
    invalid_count = excluded.invalid_count,
    unresolved_count = excluded.unresolved_count,
    complete_candidate_count = excluded.complete_candidate_count,
    is_forced = excluded.is_forced,
    is_contradiction = excluded.is_contradiction,
    generated_at = excluded.generated_at;

  return v_updated;
end
$$;


-- -------------------------------------------------------------------------
-- GROUP REFRESH ENTRYPOINT
-- -------------------------------------------------------------------------

create or replace function public.management_refresh_card_group_candidates(
  p_card_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_count integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_revision_ids uuid[];
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M32.3 candidate refresh requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);
  if v_card_count < 1 or v_card_count > 24 then
    raise exception 'M32.3 candidate refresh requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M32.3 candidate refresh contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_card_count
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception
      'M32.3 candidate refresh requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_apply_requirement_teacher_lock_to_candidates(
    v_revision_id,
    v_card_ids
  );

  return v_card_count;
end
$$;

revoke all
  on function public.management_refresh_card_group_candidates(jsonb)
  from public, anon;

grant execute
  on function public.management_refresh_card_group_candidates(jsonb)
  to authenticated;

comment on function public.management_refresh_card_group_candidates(jsonb) is
  'M32.3 grouped candidate refresh with requirement-level teacher continuity.';


-- -------------------------------------------------------------------------
-- INITIAL DERIVED-STATE REBUILD
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
  v_unplaced_card_ids uuid[];
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
    raise exception 'M32.3 active draft revision not found';
  end if;

  select coalesce(array_agg(card.id), array[]::uuid[])
  into v_unplaced_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  if cardinality(v_unplaced_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_bundle_subset(
      v_revision_id,
      v_unplaced_card_ids
    );

    perform public.management_apply_requirement_teacher_lock_to_candidates(
      v_revision_id,
      v_unplaced_card_ids
    );
  end if;
end
$$;

comment on function public.management_enforce_requirement_teacher_continuity() is
  'M32.3 hard placement invariant: one resolved teacher per course requirement/revision.';

comment on function public.management_apply_requirement_teacher_candidate_lock() is
  'M32.3 universal candidate guard: once a requirement has a resolved teacher placement, different/unknown teacher candidates are invalid.';

comment on function public.management_apply_requirement_teacher_lock_to_candidates(
  uuid, uuid[]
) is
  'M32.3 candidate postprocess: after one resolved teacher is used for a requirement, remaining blocks can only use that teacher.';

commit;

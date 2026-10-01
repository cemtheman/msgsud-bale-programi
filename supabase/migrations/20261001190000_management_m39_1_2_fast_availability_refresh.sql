-- Management M39.1.2
-- Fast teacher-availability candidate reclassification.
--
-- M39.1 originally touched every persisted candidate row for the selected
-- teacher. Each statement then invoked the M32.5 same-requirement policy pass,
-- causing a large secondary fan-out and statement timeout on normal UI saves.
--
-- Availability edits do not change placement-driven continuity policy state.
-- This patch:
--   1. lets the availability RPC suppress only the M32.5 AFTER-statement fan-out;
--   2. reclassifies only newly blocked rows plus rows previously carrying
--      TEACHER_UNAVAILABLE, so removals are also repaired;
--   3. keeps M39.1 and M22 BEFORE-row semantics and M39.1.1 summary UPDATEs active.

begin;

create or replace function public.management_apply_teacher_policy_candidate_batch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(
    current_setting('app.management_skip_teacher_policy_candidate_batch', true),
    ''
  ) = 'on' then
    return null;
  end if;

  -- The policy pass updates candidate rows itself. Prevent recursive work from
  -- the nested UPDATE while still letting the existing M22 BEFORE trigger
  -- normalize resource certainty/reason semantics.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  with impacted_requirement as materialized (
    select distinct
      card.schedule_revision_id,
      card.requirement_id
    from changed_rows changed
    join public.schedule_cards card
      on card.id = changed.card_id
  ),
  policy_state as materialized (
    select
      impacted.schedule_revision_id,
      impacted.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity,
      count(distinct placement.teacher_id) filter (
        where placement.teacher_id is not null
      )::integer as placed_teacher_count,
      (
        array_agg(
          distinct placement.teacher_id
          order by placement.teacher_id
        ) filter (
          where placement.teacher_id is not null
        )
      )[1] as resolved_teacher_id
    from impacted_requirement impacted
    join public.course_requirements requirement
      on requirement.id = impacted.requirement_id
    left join public.schedule_cards placed_card
      on placed_card.schedule_revision_id = impacted.schedule_revision_id
     and placed_card.requirement_id = impacted.requirement_id
    left join public.placements placement
      on placement.card_id = placed_card.id
    group by
      impacted.schedule_revision_id,
      impacted.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity
  ),
  target as materialized (
    select
      assessment.id as assessment_id,
      state.schedule_revision_id,
      state.requirement_id,
      state.teacher_assignment_scope,
      state.teacher_continuity,
      state.placed_teacher_count,
      state.resolved_teacher_id,
      case
        when state.teacher_assignment_scope = 'REQUIREMENT'
         and state.teacher_continuity = 'REQUIRED'
         and state.placed_teacher_count > 1
          then 'REQUIREMENT_TEACHER_CONFLICT'
        when state.teacher_assignment_scope = 'REQUIREMENT'
         and state.teacher_continuity = 'REQUIRED'
         and state.placed_teacher_count = 1
         and assessment.teacher_id is distinct from state.resolved_teacher_id
          then 'REQUIREMENT_TEACHER_MISMATCH'
        else null
      end as policy_reason
    from policy_state state
    join public.schedule_cards card
      on card.schedule_revision_id = state.schedule_revision_id
     and card.requirement_id = state.requirement_id
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = card.id
  )
  update public.schedule_card_candidate_assessments assessment
  set
    reason_codes = (
      select coalesce(
        array_agg(distinct reason order by reason),
        array[]::text[]
      )
      from (
        select existing.reason
        from unnest(
          coalesce(assessment.reason_codes, array[]::text[])
        ) existing(reason)
        where existing.reason not in (
          'REQUIREMENT_TEACHER_MISMATCH',
          'REQUIREMENT_TEACHER_CONFLICT'
        )

        union all

        select target.policy_reason
        where target.policy_reason is not null
      ) combined
    ),
    status = case
      when target.policy_reason is null then 'VALID'
      else 'INVALID'
    end,
    is_complete = target.policy_reason is null,
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'teacher_policy_engine_version', 'M32.5.1-v1',
        'teacher_policy_scope', target.teacher_assignment_scope,
        'teacher_policy_continuity', target.teacher_continuity,
        'teacher_policy_placed_teacher_count', target.placed_teacher_count,
        'teacher_policy_resolved_teacher_id', target.resolved_teacher_id,
        'teacher_policy_reason', target.policy_reason
      ),
    generated_at = now()
  from target
  where assessment.id = target.assessment_id;

  -- Only UPDATE summary rows that already exist. A candidate-domain builder
  -- may have deliberately deleted the summary while rebuilding the card; in
  -- that case the builder owns the later INSERT.
  with impacted_requirement as materialized (
    select distinct
      card.schedule_revision_id,
      card.requirement_id
    from changed_rows changed
    join public.schedule_cards card
      on card.id = changed.card_id
  ),
  impacted_card as materialized (
    select card.id
    from impacted_requirement impacted
    join public.schedule_cards card
      on card.schedule_revision_id = impacted.schedule_revision_id
     and card.requirement_id = impacted.requirement_id
  ),
  aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (
        where assessment.status = 'VALID'
      )::integer as valid_count,
      count(*) filter (
        where assessment.status = 'INVALID'
      )::integer as invalid_count,
      count(*) filter (
        where assessment.status = 'UNRESOLVED'
      )::integer as unresolved_count,
      count(*) filter (
        where assessment.is_complete
      )::integer as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    join impacted_card card
      on card.id = assessment.card_id
    group by assessment.card_id
  )
  update public.schedule_card_domain_summaries summary
  set
    domain_status = case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    valid_count = aggregate.valid_count,
    invalid_count = aggregate.invalid_count,
    unresolved_count = aggregate.unresolved_count,
    complete_candidate_count = aggregate.complete_candidate_count,
    is_forced = (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    is_contradiction = (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    generated_at = now()
  from aggregate
  where summary.card_id = aggregate.card_id;

  return null;
end
$$;

revoke all
  on function public.management_apply_teacher_policy_candidate_batch()
  from public, anon, authenticated;

comment on function public.management_apply_teacher_policy_candidate_batch() is
  'M39.1.2-compatible M32.5.1 teacher-policy candidate enforcement. Availability-only refreshes may suppress the same-requirement fan-out through a transaction-local setting; all ordinary candidate writes retain M32.5.1 behavior.';


create or replace function public.management_set_teacher_unavailable_periods(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_unavailable_periods jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_teacher_name text;
  v_requested_count integer;
  v_distinct_count integer;
  v_candidate_reclassified_card_count integer := 0;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M39.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for share;

  if v_requirement_set_id is null then
    raise exception 'M39.1 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M39.1 teacher hard availability requires DRAFT revision';
  end if;

  select teacher.name
  into v_teacher_name
  from public.teachers teacher
  where teacher.id = p_teacher_id
    and teacher.archived_at is null
    and teacher.operational_status = 'ACTIVE'
  for share;

  if v_teacher_name is null then
    raise exception 'M39.1 active teacher resource not found';
  end if;

  if p_unavailable_periods is null
     or jsonb_typeof(p_unavailable_periods) <> 'array' then
    raise exception
      'M39.1 unavailable periods must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_unavailable_periods) item(value)
    where jsonb_typeof(item.value) <> 'object'
       or coalesce(item.value ->> 'dayOfWeek', '') !~ '^[0-9]+$'
       or coalesce(item.value ->> 'period', '') !~ '^[0-9]+$'
       or (item.value ->> 'dayOfWeek')::integer not between 1 and 5
       or (item.value ->> 'period')::integer not between 1 and 12
  ) then
    raise exception
      'M39.1 unavailable period must use day 1..5 and period 1..12';
  end if;

  select
    count(*)::integer,
    count(distinct (
      (item.value ->> 'dayOfWeek')::integer::text
      || ':'
      || (item.value ->> 'period')::integer::text
    ))::integer
  into
    v_requested_count,
    v_distinct_count
  from jsonb_array_elements(p_unavailable_periods) item(value);

  if v_requested_count <> v_distinct_count then
    raise exception 'M39.1 unavailable periods contain duplicates';
  end if;

  delete from public.management_teacher_unavailable_periods slot
  where slot.requirement_set_id = v_requirement_set_id
    and slot.teacher_id = p_teacher_id;

  insert into public.management_teacher_unavailable_periods (
    requirement_set_id,
    teacher_id,
    day_of_week,
    period
  )
  select
    v_requirement_set_id,
    p_teacher_id,
    (item.value ->> 'dayOfWeek')::integer::smallint,
    (item.value ->> 'period')::integer::smallint
  from jsonb_array_elements(p_unavailable_periods) item(value)
  order by
    (item.value ->> 'dayOfWeek')::integer,
    (item.value ->> 'period')::integer;

  -- Availability changes do not change placement-driven teacher-continuity
  -- policy state. Suppress M32.5's same-requirement fan-out for this targeted
  -- reclassification only; M39.1 + M22 BEFORE-row semantics still run.
  perform set_config(
    'app.management_skip_teacher_policy_candidate_batch',
    'on',
    true
  );

  with reclassified as (
    update public.schedule_card_candidate_assessments assessment
    set generated_at = now()
    from public.schedule_cards card
    where assessment.card_id = card.id
      and card.schedule_revision_id = p_schedule_revision_id
      and assessment.teacher_id = p_teacher_id
      and (
        'TEACHER_UNAVAILABLE' = any(
          coalesce(assessment.reason_codes, array[]::text[])
        )
        or exists (
          select 1
          from public.management_teacher_unavailable_periods slot
          where slot.requirement_set_id = v_requirement_set_id
            and slot.teacher_id = p_teacher_id
            and slot.day_of_week = assessment.day_of_week
            and slot.period between
              assessment.start_period
              and assessment.start_period + card.duration_periods - 1
        )
      )
    returning assessment.card_id
  )
  select count(distinct reclassified.card_id)::integer
  into v_candidate_reclassified_card_count
  from reclassified;

  perform set_config(
    'app.management_skip_teacher_policy_candidate_batch',
    'off',
    true
  );

  select entry.value
  into v_result
  from jsonb_array_elements(
    public.management_list_teacher_load_targets(
      p_schedule_revision_id
    )
  ) entry(value)
  where entry.value ->> 'teacherId' = p_teacher_id::text
  limit 1;

  if v_result is null then
    raise exception 'M39.1 teacher planning result not found';
  end if;

  return v_result || jsonb_build_object(
    'teacherName', v_teacher_name,
    'candidateReclassifiedCardCount',
      coalesce(v_candidate_reclassified_card_count, 0),
    'publishedChanged', false,
    'placementsChanged', false,
    'solverBehaviorChanged', true
  );
end
$$;

revoke all
  on function public.management_set_teacher_unavailable_periods(
    uuid, uuid, jsonb
  )
  from public, anon;

grant execute
  on function public.management_set_teacher_unavailable_periods(
    uuid, uuid, jsonb
  )
  to authenticated;

comment on function public.management_set_teacher_unavailable_periods(
  uuid, uuid, jsonb
) is
  'M39.1.2 targeted hard-availability save. Reclassifies only newly/previously unavailable teacher candidates and avoids unrelated M32.5 requirement-wide fan-out.';

commit;

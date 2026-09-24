-- Management M26.7
-- Read-only blocker diagnosis for one visual bundle / slot.
--
-- Used only after an INVALID drop target is selected. It identifies the actual
-- placed cards responsible for ROOM / TEACHER / GROUP conflicts so stale or
-- hidden occupancy can be distinguished from genuine timetable constraints.

begin;

create or replace function public.management_diagnose_bundle_slot_blockers(
  p_card_ids jsonb,
  p_day_of_week smallint,
  p_start_period smallint
)
returns jsonb
language plpgsql
stable
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
  v_max_duration integer;
  v_rows jsonb;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M26.7 management VIEWER role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.7 blocker diagnosis requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);
  if v_card_count < 1 or v_card_count > 24 then
    raise exception 'M26.7 blocker diagnosis requires 1..24 cards';
  end if;

  if p_day_of_week < 1 or p_day_of_week > 5
     or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M26.7 blocker diagnosis received invalid day/period';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M26.7 blocker diagnosis contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id),
    max(card.duration_periods)
  into
    v_matched_card_count,
    v_revision_ids,
    v_max_duration
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_card_count
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.7 blocker diagnosis requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  with target_groups as (
    select distinct requirement.instructional_group_id
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.id = any(v_card_ids)
  ),
  target_assessment_rooms as (
    select distinct assessment.room_id
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = any(v_card_ids)
      and assessment.day_of_week = p_day_of_week
      and assessment.start_period = p_start_period
      and assessment.room_id is not null
      and 'ROOM_CONFLICT' = any(assessment.reason_codes)
  ),
  target_assessment_teachers as (
    select distinct assessment.teacher_id
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = any(v_card_ids)
      and assessment.day_of_week = p_day_of_week
      and assessment.start_period = p_start_period
      and assessment.teacher_id is not null
      and 'TEACHER_CONFLICT' = any(assessment.reason_codes)
  ),
  blockers as (
    select
      occupied_card.id as card_id,
      subject.name as subject_name,
      instructional_group.name as group_name,
      placement.day_of_week,
      placement.start_period,
      (
        placement.start_period + occupied_card.duration_periods - 1
      )::smallint as end_period,
      teacher.name as teacher_name,
      room.name as room_name,
      array_remove(
        array[
          case
            when placement.room_id in (
              select room_id from target_assessment_rooms
            )
              then 'ROOM_CONFLICT'
          end,
          case
            when placement.teacher_id in (
              select teacher_id from target_assessment_teachers
            )
              then 'TEACHER_CONFLICT'
          end,
          case
            when exists (
              select 1
              from target_groups target
              where public.management_instructional_groups_conflict(
                target.instructional_group_id,
                occupied_requirement.instructional_group_id
              )
            )
              then 'GROUP_CONFLICT'
          end
        ]::text[],
        null
      ) as conflict_types
    from public.placements placement
    join public.schedule_cards occupied_card
      on occupied_card.id = placement.card_id
    join public.course_requirements occupied_requirement
      on occupied_requirement.id = occupied_card.requirement_id
    join public.subjects subject
      on subject.id = occupied_requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = occupied_requirement.instructional_group_id
    left join public.teachers teacher
      on teacher.id = placement.teacher_id
    left join public.rooms room
      on room.id = placement.room_id
    where occupied_card.schedule_revision_id = v_revision_id
      and not (occupied_card.id = any(v_card_ids))
      and placement.day_of_week = p_day_of_week
      and placement.start_period <= p_start_period + v_max_duration - 1
      and (
        placement.start_period + occupied_card.duration_periods - 1
      ) >= p_start_period
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', blocker.card_id,
        'subjectName', blocker.subject_name,
        'groupName', blocker.group_name,
        'dayOfWeek', blocker.day_of_week,
        'startPeriod', blocker.start_period,
        'endPeriod', blocker.end_period,
        'teacherName', blocker.teacher_name,
        'roomName', blocker.room_name,
        'conflictTypes', to_jsonb(blocker.conflict_types)
      )
      order by
        blocker.start_period,
        blocker.subject_name,
        blocker.group_name
    ) filter (where cardinality(blocker.conflict_types) > 0),
    '[]'::jsonb
  )
  into v_rows
  from blockers blocker;

  return v_rows;
end
$$;

revoke all
  on function public.management_diagnose_bundle_slot_blockers(jsonb, smallint, smallint)
  from public, anon;

grant execute
  on function public.management_diagnose_bundle_slot_blockers(jsonb, smallint, smallint)
  to authenticated;

comment on function public.management_diagnose_bundle_slot_blockers(jsonb, smallint, smallint) is
  'M26.7 read-only slot blocker diagnosis for a visual grouped card. Returns actual overlapping placed cards responsible for room, teacher and/or instructional-group conflicts.';

commit;

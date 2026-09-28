-- Management M32.2.1
-- Late-stage PLACE/MOVE delta refresh performance.
--
-- Runtime evidence: with 155/159 cards already placed, placing a remaining
-- multi-period Solfej card could hit the statement timeout. The M15 delta
-- selector still considered candidate rows for cards that were already placed.
-- Those domains are not needed by forced/contradiction propagation: only
-- currently unplaced cards participate in those decisions. A placed card is
-- live-revalidated when the user later moves it.
--
-- Keep the exact same overlap/resource/group rules, but restrict the impacted
-- card set to the unscheduled pool.

begin;

create or replace function public.refresh_management_candidate_domain_delta(
  p_schedule_revision_id uuid,
  p_changed_card_id uuid,
  p_old_day smallint,
  p_old_start smallint,
  p_old_teacher_id uuid,
  p_old_room_id uuid,
  p_new_day smallint,
  p_new_start smallint,
  p_new_teacher_id uuid,
  p_new_room_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_changed_group_id uuid;
  v_changed_duration smallint;
  v_impacted_card_ids uuid[];
  v_assessment_ids uuid[];
begin
  select
    requirement.instructional_group_id,
    card.duration_periods
  into
    v_changed_group_id,
    v_changed_duration
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.id = p_changed_card_id
    and card.schedule_revision_id = p_schedule_revision_id;

  if v_changed_group_id is null or v_changed_duration is null then
    raise exception
      'M32.2.1 changed card not found in revision: %',
      p_changed_card_id;
  end if;

  select coalesce(array_agg(distinct card.id), array[]::uuid[])
  into v_impacted_card_ids
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and card.id <> p_changed_card_id
    -- M32.2.1: candidate domains for already placed cards do not participate
    -- in forced/contradiction decisions. They are refreshed on demand before
    -- a later drag/move, so do not spend mutation time maintaining them.
    and not exists (
      select 1
      from public.placements placed
      where placed.card_id = card.id
    )
    and (
      public.management_instructional_groups_conflict(
        requirement.instructional_group_id,
        v_changed_group_id
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and (
            (p_old_teacher_id is not null and assessment.teacher_id = p_old_teacher_id)
            or
            (p_new_teacher_id is not null and assessment.teacher_id = p_new_teacher_id)
          )
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and (
            (p_old_room_id is not null and assessment.room_id = p_old_room_id)
            or
            (p_new_room_id is not null and assessment.room_id = p_new_room_id)
          )
      )
    );

  if cardinality(v_impacted_card_ids) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(assessment.id), array[]::uuid[])
  into v_assessment_ids
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.card_id = any(v_impacted_card_ids)
    and (
      (
        p_old_day is not null
        and p_old_start is not null
        and assessment.day_of_week = p_old_day
        and assessment.start_period <= (
          p_old_start + v_changed_duration - 1
        )
        and (
          assessment.start_period + card.duration_periods - 1
        ) >= p_old_start
      )
      or
      (
        p_new_day is not null
        and p_new_start is not null
        and assessment.day_of_week = p_new_day
        and assessment.start_period <= (
          p_new_start + v_changed_duration - 1
        )
        and (
          assessment.start_period + card.duration_periods - 1
        ) >= p_new_start
      )
    );

  return public.revalidate_management_candidate_assessments(
    p_schedule_revision_id,
    v_assessment_ids
  );
end
$$;

comment on function public.refresh_management_candidate_domain_delta(
  uuid, uuid, smallint, smallint, uuid, uuid, smallint, smallint, uuid, uuid
) is
  'M32.2.1 delta refresh. Revalidates only overlapping candidate rows for currently unplaced cards; placed-card candidates are refreshed on demand before later move/drag validation.';

revoke all
  on function public.refresh_management_candidate_domain_delta(
    uuid, uuid, smallint, smallint, uuid, uuid, smallint, smallint, uuid, uuid
  )
  from public, anon, authenticated;

commit;

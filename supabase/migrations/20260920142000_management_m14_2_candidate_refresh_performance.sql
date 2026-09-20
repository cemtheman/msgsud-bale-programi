-- Management v0.1 / M14.2
-- Candidate-domain refresh performance rewrite.
--
-- Live MOVE testing still reached statement_timeout after M14.1. The remaining
-- hot path was the full post-mutation candidate refresh: M4 evaluated
-- management_instructional_groups_conflict() recursively for every hypothetical
-- candidate against every occupied placement.
--
-- With ~26k candidate rows this multiplied a small group graph traversal
-- thousands of times. M14.2 computes the instructional-group conflict matrix
-- once per refresh and reuses a materialized occupancy snapshot for teacher,
-- room, and participant overlap checks.
--
-- Functional contract is unchanged:
-- - same VALID / INVALID / UNRESOLVED classification
-- - same hard conflict reasons
-- - same complete-candidate rule
-- - same forced / contradiction summary semantics
-- - no placement, propagation, undo, redo, or publication policy changes

begin;

create index if not exists instructional_group_relations_contains_left_idx
  on public.instructional_group_relations (left_group_id, right_group_id)
  where relation = 'CONTAINS';

create index if not exists instructional_group_relations_contains_right_idx
  on public.instructional_group_relations (right_group_id, left_group_id)
  where relation = 'CONTAINS';

create index if not exists instructional_group_relations_overlaps_left_idx
  on public.instructional_group_relations (left_group_id, right_group_id)
  where relation = 'OVERLAPS';

create or replace function public.refresh_management_candidate_domain(
  p_schedule_revision_id uuid
)
returns void
language plpgsql
as $$
declare
  target_revision_count integer;
begin
  select count(*)
  into target_revision_count
  from public.schedule_revisions
  where id = p_schedule_revision_id
    and status = 'DRAFT';

  if target_revision_count <> 1 then
    raise exception
      'M14.2 candidate refresh requires one DRAFT revision: %',
      p_schedule_revision_id;
  end if;

  delete from public.schedule_card_domain_summaries summary
  using public.schedule_cards card
  where summary.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id;

  delete from public.schedule_card_candidate_assessments assessment
  using public.schedule_cards card
  where assessment.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id;

  with recursive
  target_cards as materialized (
    select
      card.id as card_id,
      card.duration_periods,
      requirement.id as requirement_id,
      requirement.instructional_group_id,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
  ),
  target_requirements as materialized (
    select distinct
      requirement_id,
      teacher_mode,
      resource_mode,
      required_capability
    from target_cards
  ),
  teacher_choices as materialized (
    select
      target.requirement_id,
      assignment.teacher_id,
      null::text as unresolved_code
    from target_requirements target
    join public.course_requirement_teachers assignment
      on assignment.requirement_id = target.requirement_id
    where target.teacher_mode in ('FIXED', 'ELIGIBLE_POOL')

    union all

    select distinct
      target.requirement_id,
      null::uuid,
      case
        when target.teacher_mode = 'UNKNOWN'
          then 'TEACHER_UNKNOWN'
        else 'TEACHER_ASSIGNMENT_MISSING'
      end
    from target_requirements target
    where target.teacher_mode = 'UNKNOWN'
       or (
         target.teacher_mode in ('FIXED', 'ELIGIBLE_POOL')
         and not exists (
           select 1
           from public.course_requirement_teachers assignment
           where assignment.requirement_id = target.requirement_id
         )
       )
  ),
  room_choices as materialized (
    select
      target.requirement_id,
      assignment.room_id,
      null::text as unresolved_code
    from target_requirements target
    join public.course_requirement_rooms assignment
      on assignment.requirement_id = target.requirement_id
    where target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')

    union all

    select distinct
      target.requirement_id,
      room.id,
      null::text
    from target_requirements target
    join public.rooms room
      on target.resource_mode = 'CAPABILITY'
     and target.required_capability = any(room.capabilities)
     and room.knowledge_status = 'CONFIRMED'

    union all

    select distinct
      target.requirement_id,
      room.id,
      'CAPABILITY_UNCONFIRMED'
    from target_requirements target
    join public.rooms room
      on target.resource_mode = 'CAPABILITY'
     and target.required_capability = any(room.capabilities)
     and coalesce(room.knowledge_status, 'UNKNOWN') <> 'CONFIRMED'
    where not exists (
      select 1
      from public.rooms confirmed_room
      where target.required_capability = any(confirmed_room.capabilities)
        and confirmed_room.knowledge_status = 'CONFIRMED'
    )

    union all

    select distinct
      target.requirement_id,
      null::uuid,
      case
        when target.resource_mode = 'UNKNOWN'
          then 'ROOM_UNKNOWN'
        when target.resource_mode = 'CAPABILITY'
          then 'CAPABILITY_UNRESOLVED'
        else 'ROOM_ASSIGNMENT_MISSING'
      end
    from target_requirements target
    where target.resource_mode = 'UNKNOWN'
       or (
         target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')
         and not exists (
           select 1
           from public.course_requirement_rooms assignment
           where assignment.requirement_id = target.requirement_id
         )
       )
       or (
         target.resource_mode = 'CAPABILITY'
         and not exists (
           select 1
           from public.rooms room
           where target.required_capability = any(room.capabilities)
         )
       )
  ),
  occupied as materialized (
    select
      placement.card_id,
      placement.day_of_week,
      placement.start_period,
      (
        placement.start_period + occupied_card.duration_periods - 1
      )::smallint as end_period,
      placement.teacher_id,
      placement.room_id,
      occupied_requirement.instructional_group_id
    from public.placements placement
    join public.schedule_cards occupied_card
      on occupied_card.id = placement.card_id
    join public.course_requirements occupied_requirement
      on occupied_requirement.id = occupied_card.requirement_id
    where occupied_card.schedule_revision_id = p_schedule_revision_id
  ),
  relevant_groups as materialized (
    select distinct instructional_group_id as group_id
    from target_cards

    union

    select distinct instructional_group_id
    from occupied
  ),
  group_descendants(root_group_id, descendant_group_id) as (
    select
      relevant.group_id,
      relevant.group_id
    from relevant_groups relevant

    union

    select
      descendant.root_group_id,
      relation.right_group_id
    from group_descendants descendant
    join public.instructional_group_relations relation
      on relation.left_group_id = descendant.descendant_group_id
     and relation.relation = 'CONTAINS'
  ),
  group_conflict_pairs as materialized (
    -- Same participant set, ancestor/descendant relationship, or composite
    -- groups sharing any descendant.
    select distinct
      left_desc.root_group_id as left_group_id,
      right_desc.root_group_id as right_group_id
    from group_descendants left_desc
    join group_descendants right_desc
      on right_desc.descendant_group_id = left_desc.descendant_group_id

    union

    -- Explicit OVERLAPS from a descendant of the left group to a descendant
    -- of the right group.
    select distinct
      left_desc.root_group_id,
      right_desc.root_group_id
    from group_descendants left_desc
    join public.instructional_group_relations relation
      on relation.left_group_id = left_desc.descendant_group_id
     and relation.relation = 'OVERLAPS'
    join group_descendants right_desc
      on right_desc.descendant_group_id = relation.right_group_id

    union

    -- Explicit OVERLAPS in the reverse orientation.
    select distinct
      left_desc.root_group_id,
      right_desc.root_group_id
    from group_descendants right_desc
    join public.instructional_group_relations relation
      on relation.left_group_id = right_desc.descendant_group_id
     and relation.relation = 'OVERLAPS'
    join group_descendants left_desc
      on left_desc.descendant_group_id = relation.right_group_id
  ),
  raw_assessments as materialized (
    select
      target.card_id,
      target.duration_periods,
      target.instructional_group_id,
      day_number::smallint as day_of_week,
      period_number::smallint as start_period,
      teacher.teacher_id,
      room.room_id,
      teacher.unresolved_code as teacher_unresolved_code,
      room.unresolved_code as room_unresolved_code,
      (period_number + target.duration_periods - 1)::smallint as end_period
    from target_cards target
    cross join generate_series(1, 5) as day_number
    cross join generate_series(1, 12) as period_number
    join teacher_choices teacher
      on teacher.requirement_id = target.requirement_id
    join room_choices room
      on room.requirement_id = target.requirement_id
  ),
  assessed as (
    select
      raw.*,
      (raw.end_period > 12) as outside_day,
      (
        raw.start_period <= 5
        and raw.end_period >= 6
      ) as crosses_lunch,
      exists (
        select 1
        from occupied occupancy
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
          and raw.teacher_id is not null
          and occupancy.teacher_id = raw.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from occupied occupancy
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
          and raw.room_id is not null
          and occupancy.room_id = raw.room_id
      ) as room_conflict,
      exists (
        select 1
        from occupied occupancy
        join group_conflict_pairs conflict
          on conflict.left_group_id = raw.instructional_group_id
         and conflict.right_group_id = occupancy.instructional_group_id
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
      ) as group_conflict
    from raw_assessments raw
  ),
  classified as (
    select
      assessed.*,
      array_remove(
        array[
          case when assessed.outside_day then 'TIME_OUTSIDE_DAY' end,
          case when assessed.crosses_lunch then 'LUNCH_BREAK_CROSSING' end,
          case when assessed.teacher_conflict then 'TEACHER_CONFLICT' end,
          case when assessed.room_conflict then 'ROOM_CONFLICT' end,
          case when assessed.group_conflict then 'GROUP_CONFLICT' end,
          assessed.teacher_unresolved_code,
          assessed.room_unresolved_code
        ]::text[],
        null
      ) as reason_codes,
      case
        when assessed.outside_day
          or assessed.crosses_lunch
          or assessed.teacher_conflict
          or assessed.room_conflict
          or assessed.group_conflict
          then 'INVALID'
        when assessed.teacher_unresolved_code is not null
          or assessed.room_unresolved_code is not null
          then 'UNRESOLVED'
        else 'VALID'
      end as status,
      (
        assessed.teacher_id is not null
        and assessed.room_id is not null
        and assessed.teacher_unresolved_code is null
        and assessed.room_unresolved_code is null
      ) as is_complete
    from assessed
  )
  insert into public.schedule_card_candidate_assessments (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    status,
    is_complete,
    reason_codes,
    details
  )
  select
    classified.card_id,
    classified.day_of_week,
    classified.start_period,
    classified.teacher_id,
    classified.room_id,
    classified.status,
    classified.is_complete,
    classified.reason_codes,
    jsonb_build_object(
      'engine_version', 'M14.2-v0.1',
      'duration_periods', classified.duration_periods,
      'end_period', classified.end_period
    )
  from classified;

  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction
  )
  select
    card.id,
    case
      when count(*) filter (where assessment.status = 'UNRESOLVED') > 0
        then 'UNRESOLVED'
      when count(*) filter (where assessment.status = 'VALID') = 0
        then 'INVALID'
      else 'VALID'
    end,
    count(*) filter (where assessment.status = 'VALID')::integer,
    count(*) filter (where assessment.status = 'INVALID')::integer,
    count(*) filter (where assessment.status = 'UNRESOLVED')::integer,
    count(*) filter (where assessment.is_complete)::integer,
    (
      count(*) filter (where assessment.status = 'VALID') = 1
      and count(*) filter (where assessment.status = 'UNRESOLVED') = 0
    ),
    (
      count(*) filter (where assessment.status = 'VALID') = 0
      and count(*) filter (where assessment.status = 'UNRESOLVED') = 0
    )
  from public.schedule_cards card
  join public.schedule_card_candidate_assessments assessment
    on assessment.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
  group by card.id;
end
$$;

comment on function public.refresh_management_candidate_domain(uuid) is
  'M14.2 candidate refresh. Rebuilds the draft domain using one precomputed instructional-group conflict matrix and one occupancy snapshot per refresh.';

revoke all
  on function public.refresh_management_candidate_domain(uuid)
  from public, anon, authenticated;

commit;

-- M33 hard-readiness diagnostic: active requirements with resource_mode=UNKNOWN
--
-- Read-only. No writes.
-- Purpose: distinguish an explicit room-planning policy from mere evidence in
-- the current baseline. The query does NOT silently classify anything.
--
-- Interpretation:
--   CAPABILITY_CANDIDATE
--     required_capability is already explicit; likely a metadata normalization.
--   FIXED_POOL_CANDIDATE
--     exactly one planning room exists and every current placement uses it.
--   ELIGIBLE_POOL_CANDIDATE
--     multiple planning rooms exist and all current placement rooms are inside
--     that pool.
--   BASELINE_ONLY_SINGLE_ROOM / BASELINE_ONLY_MULTI_ROOM
--     current placements give evidence, but no explicit planning room pool
--     exists; do not auto-classify without a policy decision.
--   POOL_BASELINE_DISAGREE
--     explicit pool and current placement evidence disagree; inspect manually.

with active_revision as (
  select
    revision.id as revision_id,
    revision.requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1
),
unknown_requirement as (
  select
    requirement.id,
    requirement.subject_id,
    requirement.instructional_group_id,
    requirement.course_character,
    requirement.delivery_mode,
    requirement.required_capability
  from active_revision active
  join public.course_requirements requirement
    on requirement.requirement_set_id = active.requirement_set_id
  where requirement.term_status = 'ACTIVE'
    and requirement.resource_mode = 'UNKNOWN'
)
select
  requirement.id as requirement_id,
  subject.name as subject_name,
  instructional_group.name as group_name,
  instructional_group.group_type,
  requirement.course_character,
  requirement.delivery_mode,
  requirement.required_capability,
  card_state.card_count,
  card_state.placed_block_count,
  card_state.distinct_placed_canonical_room_count,
  card_state.placed_rooms,
  pool_state.pool_room_count,
  pool_state.pool_rooms,
  pool_state.all_placed_rooms_in_pool,
  case
    when requirement.required_capability is not null
      then 'CAPABILITY_CANDIDATE'
    when pool_state.pool_room_count = 1
      and pool_state.all_placed_rooms_in_pool
      and card_state.distinct_placed_canonical_room_count = 1
      then 'FIXED_POOL_CANDIDATE'
    when pool_state.pool_room_count > 1
      and pool_state.all_placed_rooms_in_pool
      then 'ELIGIBLE_POOL_CANDIDATE'
    when pool_state.pool_room_count > 0
      and not pool_state.all_placed_rooms_in_pool
      then 'POOL_BASELINE_DISAGREE'
    when pool_state.pool_room_count = 0
      and card_state.distinct_placed_canonical_room_count = 1
      then 'BASELINE_ONLY_SINGLE_ROOM'
    when pool_state.pool_room_count = 0
      and card_state.distinct_placed_canonical_room_count > 1
      then 'BASELINE_ONLY_MULTI_ROOM'
    else 'NO_ROOM_EVIDENCE'
  end as diagnostic_class
from unknown_requirement requirement
join public.subjects subject
  on subject.id = requirement.subject_id
join public.instructional_groups instructional_group
  on instructional_group.id = requirement.instructional_group_id
cross join active_revision active
join lateral (
  select
    count(card.id)::integer as card_count,
    count(placement.id)::integer as placed_block_count,
    count(distinct coalesce(selected_room.canonical_room_id, selected_room.id))
      filter (where placement.room_id is not null)::integer
      as distinct_placed_canonical_room_count,
    coalesce(
      array_agg(
        distinct canonical_room.name
        order by canonical_room.name
      ) filter (where canonical_room.id is not null),
      array[]::text[]
    ) as placed_rooms
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  left join public.rooms selected_room
    on selected_room.id = placement.room_id
  left join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where card.schedule_revision_id = active.revision_id
    and card.requirement_id = requirement.id
) card_state on true
join lateral (
  select
    count(*)::integer as pool_room_count,
    coalesce(
      array_agg(
        distinct canonical_room.name
        order by canonical_room.name
      ),
      array[]::text[]
    ) as pool_rooms,
    not exists (
      select 1
      from public.schedule_cards placed_card
      join public.placements placement
        on placement.card_id = placed_card.id
      join public.rooms placed_selected_room
        on placed_selected_room.id = placement.room_id
      where placed_card.schedule_revision_id = active.revision_id
        and placed_card.requirement_id = requirement.id
        and not exists (
          select 1
          from public.course_requirement_rooms assignment_check
          join public.rooms pool_selected_room
            on pool_selected_room.id = assignment_check.room_id
          where assignment_check.requirement_id = requirement.id
            and coalesce(
              pool_selected_room.canonical_room_id,
              pool_selected_room.id
            ) = coalesce(
              placed_selected_room.canonical_room_id,
              placed_selected_room.id
            )
        )
    ) as all_placed_rooms_in_pool
  from public.course_requirement_rooms assignment
  join public.rooms selected_room
    on selected_room.id = assignment.room_id
  join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where assignment.requirement_id = requirement.id
) pool_state on true
order by
  diagnostic_class,
  instructional_group.name,
  subject.name,
  requirement.id;

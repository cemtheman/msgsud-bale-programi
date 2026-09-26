-- Management / M30.2
-- Targeted cleanup of M29.2/M29.3 room-pool test artifacts.
--
-- Evidence established from production read-only diagnostics:
--   * 5A Turkish baseline room: B1 105A
--   * 5B Turkish baseline room: B1 105B
--   * A 101 was inserted into both requirement pools on 26 Sep 2026
--     during M29 test activity and is unused by current placements.
--
-- Scope is exact. Any unexpected current state aborts the migration.

begin;

create temporary table m30_2_guard on commit drop as
select
  (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
      and term = 1
  )::integer as public_session_count,
  (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  )::integer as public_group_count,
  public.management_public_sessions_hash('2026-2027')
    as public_sessions_hash,
  public.management_public_groups_hash('2026-2027')
    as public_groups_hash;

create temporary table m30_2_context on commit drop as
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
limit 1;

do $$
declare
  v_5a_pool uuid[];
  v_5b_pool uuid[];
begin
  if (select count(*) from m30_2_context) <> 1 then
    raise exception 'M30.2 requires exactly one active 2026-2027 term-1 DRAFT revision';
  end if;

  select array_agg(room_id order by room_id::text)
  into v_5a_pool
  from public.course_requirement_rooms
  where requirement_id =
    'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid;

  select array_agg(room_id order by room_id::text)
  into v_5b_pool
  from public.course_requirement_rooms
  where requirement_id =
    'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid;

  if v_5a_pool is distinct from (
    select array_agg(value order by value::text)
    from unnest(array[
      '8a6ccfb6-75f6-5140-a0f9-60af6f5d382c'::uuid, -- B1 105A
      '17036676-cb7a-5037-bc6d-3357c1ee1a2b'::uuid  -- A 101
    ]) as value
  ) then
    raise exception 'M30.2 5A Turkish room pool changed since diagnostic: %',
      v_5a_pool;
  end if;

  if v_5b_pool is distinct from (
    select array_agg(value order by value::text)
    from unnest(array[
      '384786ce-a825-5b2c-b790-5b4335601b28'::uuid, -- B1 105B
      '17036676-cb7a-5037-bc6d-3357c1ee1a2b'::uuid  -- A 101
    ]) as value
  ) then
    raise exception 'M30.2 5B Turkish room pool changed since diagnostic: %',
      v_5b_pool;
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    join m30_2_context context
      on card.schedule_revision_id = context.revision_id
    join public.placements placement
      on placement.card_id = card.id
    where card.requirement_id in (
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
    )
      and placement.room_id = '17036676-cb7a-5037-bc6d-3357c1ee1a2b'::uuid
  ) then
    raise exception 'M30.2 A 101 is currently used by a target Turkish placement';
  end if;
end
$$;

delete from public.course_requirement_rooms
where requirement_id in (
  'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
  'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
)
  and room_id = '17036676-cb7a-5037-bc6d-3357c1ee1a2b'::uuid;

update public.course_requirements
set
  resource_mode = 'FIXED',
  required_capability = null
where id in (
  'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
  'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
);

do $$
declare
  v_5a_pool uuid[];
  v_5b_pool uuid[];
begin
  select array_agg(room_id order by room_id::text)
  into v_5a_pool
  from public.course_requirement_rooms
  where requirement_id =
    'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid;

  select array_agg(room_id order by room_id::text)
  into v_5b_pool
  from public.course_requirement_rooms
  where requirement_id =
    'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid;

  if v_5a_pool is distinct from array[
    '8a6ccfb6-75f6-5140-a0f9-60af6f5d382c'::uuid
  ] then
    raise exception 'M30.2 failed to restore 5A room pool: %', v_5a_pool;
  end if;

  if v_5b_pool is distinct from array[
    '384786ce-a825-5b2c-b790-5b4335601b28'::uuid
  ] then
    raise exception 'M30.2 failed to restore 5B room pool: %', v_5b_pool;
  end if;

  if exists (
    select 1
    from public.course_requirements
    where id in (
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
    )
      and (
        resource_mode <> 'FIXED'
        or required_capability is not null
      )
  ) then
    raise exception 'M30.2 resource_mode reconciliation failed';
  end if;
end
$$;

do $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  select revision_id
  into v_revision_id
  from m30_2_context;

  select coalesce(
    array_agg(card.id order by card.id::text),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id in (
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
    );

  if cardinality(v_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      v_revision_id,
      v_card_ids
    );
  end if;
end
$$;

update public.schedule_revisions revision
set validation_summary =
  coalesce(revision.validation_summary, '{}'::jsonb)
  || jsonb_build_object(
    'm30_2_room_pool_cleanup', 'PASS',
    'm30_2_engine_version', 'M30.2-v1',
    'm30_2_cleaned_requirement_ids', jsonb_build_array(
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314',
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'
    ),
    'm30_2_removed_room', 'A 101',
    'm30_2_preserved_5a_room', 'B1 105A',
    'm30_2_preserved_5b_room', 'B1 105B'
  )
from m30_2_context context
where revision.id = context.revision_id;

do $$
declare
  before_guard record;
begin
  select *
  into before_guard
  from m30_2_guard;

  if before_guard.public_session_count <> (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
      and term = 1
  ) then
    raise exception 'M30.2 changed public session count';
  end if;

  if before_guard.public_group_count <> (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) then
    raise exception 'M30.2 changed public group count';
  end if;

  if before_guard.public_sessions_hash is distinct from
     public.management_public_sessions_hash('2026-2027') then
    raise exception 'M30.2 changed public session projection';
  end if;

  if before_guard.public_groups_hash is distinct from
     public.management_public_groups_hash('2026-2027') then
    raise exception 'M30.2 changed public group projection';
  end if;
end
$$;

commit;

-- Management / M30.1
-- Targeted cleanup of M29.2/M29.3 teacher-pool test artifacts.
--
-- Evidence established from production read-only diagnostics on 26 Sep 2026:
--   * 5A Türkçe baseline before M29 tests: Türkçe Öğretmeni 2
--   * 5B Türkçe baseline before M29 tests: Türkçe Öğretmeni 1
--   * M29.2/M29.3 temporarily inserted A. Küçüküçerler, Armoni Öğretmeni,
--     and the opposite section's Türkçe teacher into requirement pools.
--   * 5A was left on Türkçe Öğretmeni 1 after the test/undo-redo chain.
--
-- Scope is deliberately exact. Any unexpected current state aborts the migration.

begin;

create temporary table m30_1_guard on commit drop as
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

create temporary table m30_1_context on commit drop as
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
  v_revision_id uuid;
  v_5a_pool uuid[];
  v_5b_pool uuid[];
  v_5a_teacher uuid;
  v_5b_teacher uuid;
begin
  select revision_id
  into v_revision_id
  from m30_1_context;

  if v_revision_id is null then
    raise exception 'M30.1 requires active 2026-2027 term-1 DRAFT revision';
  end if;

  if not exists (
    select 1
    from public.course_requirements requirement
    join m30_1_context context
      on requirement.requirement_set_id = context.requirement_set_id
    where requirement.id = 'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid
  ) then
    raise exception 'M30.1 expected 5A Turkish requirement is not in active draft';
  end if;

  if not exists (
    select 1
    from public.course_requirements requirement
    join m30_1_context context
      on requirement.requirement_set_id = context.requirement_set_id
    where requirement.id = 'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
  ) then
    raise exception 'M30.1 expected 5B Turkish requirement is not in active draft';
  end if;

  select array_agg(assignment.teacher_id order by assignment.teacher_id::text)
  into v_5a_pool
  from public.course_requirement_teachers assignment
  where assignment.requirement_id =
    'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid;

  select array_agg(assignment.teacher_id order by assignment.teacher_id::text)
  into v_5b_pool
  from public.course_requirement_teachers assignment
  where assignment.requirement_id =
    'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid;

  if v_5a_pool is distinct from (
    select array_agg(value order by value::text)
    from unnest(array[
      'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid,
      'bd1c9ae2-0ca9-5271-920a-dbd34ab0da94'::uuid,
      'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid,
      '498d15a8-a7ab-4b26-864d-1090a7f4fe44'::uuid
    ]) as value
  ) then
    raise exception 'M30.1 5A Turkish teacher pool changed since diagnostic: %',
      v_5a_pool;
  end if;

  if v_5b_pool is distinct from (
    select array_agg(value order by value::text)
    from unnest(array[
      'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid,
      'bd1c9ae2-0ca9-5271-920a-dbd34ab0da94'::uuid,
      '498d15a8-a7ab-4b26-864d-1090a7f4fe44'::uuid,
      'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid
    ]) as value
  ) then
    raise exception 'M30.1 5B Turkish teacher pool changed since diagnostic: %',
      v_5b_pool;
  end if;

  select placement.teacher_id
  into v_5a_teacher
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.id = '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid
    and card.schedule_revision_id = v_revision_id;

  if v_5a_teacher is distinct from
     'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid then
    raise exception 'M30.1 5A target placement changed since diagnostic: %',
      v_5a_teacher;
  end if;

  select placement.teacher_id
  into v_5b_teacher
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.id = '212f6366-a4de-4d93-829b-ec78f7970790'::uuid
    and card.schedule_revision_id = v_revision_id;

  if v_5b_teacher is distinct from
     'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid then
    raise exception 'M30.1 5B target placement changed since diagnostic: %',
      v_5b_teacher;
  end if;
end
$$;

-- Restore the one placement that was left altered by the test chain.
do $$
declare
  v_revision_id uuid;
  v_placement_id uuid;
  v_before_day smallint;
  v_before_start smallint;
  v_before_teacher uuid;
  v_before_room uuid;
  v_before_move_transaction_id uuid;
  v_before_created_at timestamptz;
  v_transaction_id uuid;
begin
  select revision_id
  into v_revision_id
  from m30_1_context;

  select
    placement.id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id,
    placement.move_transaction_id,
    placement.created_at
  into
    v_placement_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    v_before_move_transaction_id,
    v_before_created_at
  from public.placements placement
  where placement.card_id =
    '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid
  for update;

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'AUTO',
    'MOVE',
    jsonb_build_object(
      'source', 'M30_1_DATA_REPAIR',
      'engine_version', 'M30.1-teacher-pool-cleanup',
      'card_id', '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid,
      'before', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid,
        'day_of_week', v_before_day,
        'start_period', v_before_start,
        'teacher_id', v_before_teacher,
        'room_id', v_before_room,
        'move_transaction_id', v_before_move_transaction_id,
        'created_at', v_before_created_at
      ),
      'after', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid,
        'day_of_week', v_before_day,
        'start_period', v_before_start,
        'teacher_id', 'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid,
        'room_id', v_before_room
      ),
      'reason', 'REMOVE_M29_2_M29_3_TEST_ARTIFACT',
      'candidate_domain_refresh', 'DEFERRED'
    )
  )
  returning id into v_transaction_id;

  update public.placements
  set
    teacher_id = 'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid,
    move_transaction_id = v_transaction_id,
    updated_at = now()
  where id = v_placement_id;
end
$$;

-- Remove only the six teacher-pool relationships proven to be test artifacts.
delete from public.course_requirement_teachers
where
  (
    requirement_id = 'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid
    and teacher_id = any(array[
      'bd1c9ae2-0ca9-5271-920a-dbd34ab0da94'::uuid, -- A. Küçüküçerler
      'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid, -- Türkçe Öğretmeni 1
      '498d15a8-a7ab-4b26-864d-1090a7f4fe44'::uuid  -- Armoni Öğretmeni
    ])
  )
  or
  (
    requirement_id = 'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
    and teacher_id = any(array[
      'bd1c9ae2-0ca9-5271-920a-dbd34ab0da94'::uuid, -- A. Küçüküçerler
      '498d15a8-a7ab-4b26-864d-1090a7f4fe44'::uuid, -- Armoni Öğretmeni
      'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid  -- Türkçe Öğretmeni 2
    ])
  );

update public.course_requirements
set teacher_mode = 'FIXED'
where id in (
  'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
  'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
);

-- Exact post-cleanup assertions.
do $$
declare
  v_5a_pool uuid[];
  v_5b_pool uuid[];
  v_5a_teacher uuid;
  v_5b_teacher uuid;
begin
  select array_agg(teacher_id order by teacher_id::text)
  into v_5a_pool
  from public.course_requirement_teachers
  where requirement_id =
    'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid;

  select array_agg(teacher_id order by teacher_id::text)
  into v_5b_pool
  from public.course_requirement_teachers
  where requirement_id =
    'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid;

  if v_5a_pool is distinct from array[
    'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid
  ] then
    raise exception 'M30.1 failed to restore 5A teacher pool: %', v_5a_pool;
  end if;

  if v_5b_pool is distinct from array[
    'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid
  ] then
    raise exception 'M30.1 failed to restore 5B teacher pool: %', v_5b_pool;
  end if;

  select teacher_id
  into v_5a_teacher
  from public.placements
  where card_id = '5439a33c-5fb1-4949-99df-9c1e558318a5'::uuid;

  select teacher_id
  into v_5b_teacher
  from public.placements
  where card_id = '212f6366-a4de-4d93-829b-ec78f7970790'::uuid;

  if v_5a_teacher is distinct from
     'bacfcb22-ef03-46f2-81ac-6b74b2f50792'::uuid then
    raise exception 'M30.1 failed to restore 5A placement teacher: %',
      v_5a_teacher;
  end if;

  if v_5b_teacher is distinct from
     'ac6bc843-cec4-489b-819b-04f5ca5c1757'::uuid then
    raise exception 'M30.1 changed 5B placement unexpectedly: %',
      v_5b_teacher;
  end if;

  if exists (
    select 1
    from public.course_requirements
    where id in (
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314'::uuid,
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'::uuid
    )
      and teacher_mode <> 'FIXED'
  ) then
    raise exception 'M30.1 teacher_mode reconciliation failed';
  end if;
end
$$;

-- Rebuild only the active draft cards whose teacher domain changed.
do $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  select revision_id
  into v_revision_id
  from m30_1_context;

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
    'm30_1_teacher_pool_cleanup', 'PASS',
    'm30_1_engine_version', 'M30.1-v1',
    'm30_1_cleaned_requirement_ids', jsonb_build_array(
      'e29f2f44-52dd-4a4f-a6a7-808a9515d314',
      'bd6644d0-bab0-4a16-9276-3eeb6b8bc084'
    ),
    'm30_1_restored_5a_teacher', 'Türkçe Öğretmeni 2',
    'm30_1_preserved_5b_teacher', 'Türkçe Öğretmeni 1'
  )
from m30_1_context context
where revision.id = context.revision_id;

do $$
declare
  before_guard record;
begin
  select *
  into before_guard
  from m30_1_guard;

  if before_guard.public_session_count <> (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
      and term = 1
  ) then
    raise exception 'M30.1 changed public session count';
  end if;

  if before_guard.public_group_count <> (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) then
    raise exception 'M30.1 changed public group count';
  end if;

  if before_guard.public_sessions_hash is distinct from
     public.management_public_sessions_hash('2026-2027') then
    raise exception 'M30.1 changed public session projection';
  end if;

  if before_guard.public_groups_hash is distinct from
     public.management_public_groups_hash('2026-2027') then
    raise exception 'M30.1 changed public group projection';
  end if;
end
$$;

commit;

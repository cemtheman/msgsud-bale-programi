-- Management v0.1 / M4
-- Candidate Domain + Conflict Engine v0.1.
-- This phase evaluates hypothetical card placements only.
-- It does not place cards, propagate forced moves, or publish a schedule.

begin;

create table public.schedule_card_candidate_assessments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null
    references public.schedule_cards(id) on delete cascade,
  day_of_week smallint not null
    check (day_of_week between 1 and 5),
  start_period smallint not null
    check (start_period between 1 and 12),
  teacher_id uuid null
    references public.teachers(id) on delete restrict,
  room_id uuid null
    references public.rooms(id) on delete restrict,
  status text not null
    check (status in ('VALID', 'INVALID', 'UNRESOLVED')),
  is_complete boolean not null,
  reason_codes text[] not null default array[]::text[],
  details jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  constraint schedule_card_candidate_details_object
    check (jsonb_typeof(details) = 'object'),
  constraint schedule_card_candidate_valid_complete
    check (status <> 'VALID' or is_complete),
  constraint schedule_card_candidate_valid_has_no_reasons
    check (status <> 'VALID' or cardinality(reason_codes) = 0),
  constraint schedule_card_candidate_invalid_has_reason
    check (status <> 'INVALID' or cardinality(reason_codes) > 0),
  constraint schedule_card_candidate_unresolved_has_reason
    check (status <> 'UNRESOLVED' or cardinality(reason_codes) > 0)
);

create unique index schedule_card_candidate_identity_idx
  on public.schedule_card_candidate_assessments (
    card_id,
    day_of_week,
    start_period,
    coalesce(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index schedule_card_candidate_card_status_idx
  on public.schedule_card_candidate_assessments (card_id, status);

create index schedule_card_candidate_teacher_idx
  on public.schedule_card_candidate_assessments (teacher_id)
  where teacher_id is not null;

create index schedule_card_candidate_room_idx
  on public.schedule_card_candidate_assessments (room_id)
  where room_id is not null;

comment on table public.schedule_card_candidate_assessments is
  'M4 hypothetical placement assessments. VALID rows are complete time+teacher+room candidates. UNRESOLVED rows may contain null dimensions only to retain diagnostic evidence and are never auto-placeable.';

create table public.schedule_card_domain_summaries (
  card_id uuid primary key
    references public.schedule_cards(id) on delete cascade,
  domain_status text not null
    check (domain_status in ('VALID', 'INVALID', 'UNRESOLVED')),
  valid_count integer not null check (valid_count >= 0),
  invalid_count integer not null check (invalid_count >= 0),
  unresolved_count integer not null check (unresolved_count >= 0),
  complete_candidate_count integer not null check (complete_candidate_count >= 0),
  is_forced boolean not null default false,
  is_contradiction boolean not null default false,
  generated_at timestamptz not null default now(),
  constraint schedule_card_domain_forced_rule
    check (
      is_forced = (
        valid_count = 1
        and unresolved_count = 0
      )
    ),
  constraint schedule_card_domain_contradiction_rule
    check (
      is_contradiction = (
        valid_count = 0
        and unresolved_count = 0
      )
    )
);

comment on table public.schedule_card_domain_summaries is
  'Per-card candidate-domain summary. Any unresolved assessment keeps the domain UNRESOLVED. Forced means exactly one VALID complete candidate and zero UNRESOLVED assessments; M4 does not auto-place it.';

alter table public.schedule_card_candidate_assessments enable row level security;
alter table public.schedule_card_domain_summaries enable row level security;

revoke insert, update, delete
  on public.schedule_card_candidate_assessments
  from anon;
revoke insert, update, delete
  on public.schedule_card_domain_summaries
  from anon;

-- Two instructional groups conflict if they are the same participant set,
-- one contains the other (directly or transitively), their descendant sets
-- intersect, or an explicit OVERLAPS relation connects descendant sets.
-- Mere sibling membership does not imply a conflict; this preserves BALLET/MUSIC
-- and observed parallel subgroup separation unless overlap is explicitly known.
create or replace function public.management_instructional_groups_conflict(
  p_left_group_id uuid,
  p_right_group_id uuid
)
returns boolean
language sql
stable
as $$
  with recursive
  left_desc(id) as (
    select p_left_group_id
    union
    select rel.right_group_id
    from public.instructional_group_relations rel
    join left_desc d on d.id = rel.left_group_id
    where rel.relation = 'CONTAINS'
  ),
  right_desc(id) as (
    select p_right_group_id
    union
    select rel.right_group_id
    from public.instructional_group_relations rel
    join right_desc d on d.id = rel.left_group_id
    where rel.relation = 'CONTAINS'
  )
  select
    exists (
      select 1
      from left_desc l
      join right_desc r on r.id = l.id
    )
    or exists (
      select 1
      from public.instructional_group_relations rel
      join left_desc l on l.id = rel.left_group_id
      join right_desc r on r.id = rel.right_group_id
      where rel.relation = 'OVERLAPS'
    )
    or exists (
      select 1
      from public.instructional_group_relations rel
      join right_desc r on r.id = rel.left_group_id
      join left_desc l on l.id = rel.right_group_id
      where rel.relation = 'OVERLAPS'
    );
$$;

comment on function public.management_instructional_groups_conflict(uuid, uuid) is
  'Participant-overlap predicate for draft scheduling. CONTAINS is traversed transitively; explicit OVERLAPS is honored; unrelated sibling groups remain non-conflicting.';

-- Refreshes candidate assessments for one draft revision.
-- Published schedule_sessions are evidence/read-model rows and intentionally do
-- not block the draft. Only placements already present in this same revision
-- are treated as occupancy conflicts.
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
    raise exception 'M4 candidate refresh requires one DRAFT revision: %', p_schedule_revision_id;
  end if;

  delete from public.schedule_card_domain_summaries summary
  using public.schedule_cards card
  where summary.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id;

  delete from public.schedule_card_candidate_assessments assessment
  using public.schedule_cards card
  where assessment.card_id = card.id
    and card.schedule_revision_id = p_schedule_revision_id;

  with
  target_cards as (
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
  teacher_choices as (
    select
      target.requirement_id,
      assignment.teacher_id,
      null::text as unresolved_code
    from target_cards target
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
    from target_cards target
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
  room_choices as (
    select
      target.requirement_id,
      assignment.room_id,
      null::text as unresolved_code
    from target_cards target
    join public.course_requirement_rooms assignment
      on assignment.requirement_id = target.requirement_id
    where target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')

    union all

    select distinct
      target.requirement_id,
      room.id,
      null::text
    from target_cards target
    join public.rooms room
      on target.resource_mode = 'CAPABILITY'
     and target.required_capability = any(room.capabilities)
     and room.knowledge_status = 'CONFIRMED'

    union all

    select distinct
      target.requirement_id,
      room.id,
      'CAPABILITY_UNCONFIRMED'
    from target_cards target
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
    from target_cards target
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
  raw_assessments as (
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
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> raw.card_id
          and placement.day_of_week = raw.day_of_week
          and placement.start_period <= raw.end_period
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= raw.start_period
          and raw.teacher_id is not null
          and placement.teacher_id = raw.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> raw.card_id
          and placement.day_of_week = raw.day_of_week
          and placement.start_period <= raw.end_period
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= raw.start_period
          and raw.room_id is not null
          and placement.room_id = raw.room_id
      ) as room_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        join public.course_requirements occupied_requirement
          on occupied_requirement.id = occupied_card.requirement_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> raw.card_id
          and placement.day_of_week = raw.day_of_week
          and placement.start_period <= raw.end_period
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= raw.start_period
          and public.management_instructional_groups_conflict(
            raw.instructional_group_id,
            occupied_requirement.instructional_group_id
          )
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
      'engine_version', 'M4-v0.1',
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
  'Rebuild M4 candidate assessments from current draft placements. Does not create or move placements.';

revoke all
  on function public.management_instructional_groups_conflict(uuid, uuid)
  from public;
revoke all
  on function public.refresh_management_candidate_domain(uuid)
  from public;

-- Lock migration bootstrap to the M3 state validated on the remote project.
do $$
declare
  target_revision_id uuid;
  revision_count integer;
  card_count integer;
  card_load integer;
  active_load integer;
begin
  select count(*), min(id)
  into revision_count, target_revision_id
  from public.schedule_revisions
  where status = 'DRAFT'
    and version_number = 1;

  if revision_count <> 1 then
    raise exception 'M4 expected one v1 DRAFT schedule revision, found %', revision_count;
  end if;

  select count(*), coalesce(sum(duration_periods), 0)
  into card_count, card_load
  from public.schedule_cards
  where schedule_revision_id = target_revision_id;

  if card_count <> 289 or card_load <> 514 then
    raise exception 'M4 expected M3 card snapshot 289 cards / 514 periods, found % / %', card_count, card_load;
  end if;

  select coalesce(sum(requirement.weekly_load), 0)
  into active_load
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  where revision.id = target_revision_id
    and requirement.term_status = 'ACTIVE';

  if active_load <> 514 then
    raise exception 'M4 expected active requirement load 514, found %', active_load;
  end if;

  if exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M4 bootstrap requires no placements or move transactions';
  end if;

  perform public.refresh_management_candidate_domain(target_revision_id);
end
$$;

-- Final invariants.
do $$
declare
  target_revision_id uuid;
  card_count integer;
  summary_count integer;
  assessment_count integer;
  valid_count integer;
  invalid_count integer;
  unresolved_count integer;
  published_session_count integer;
begin
  select id
  into target_revision_id
  from public.schedule_revisions
  where status = 'DRAFT'
    and version_number = 1;

  select count(*)
  into card_count
  from public.schedule_cards
  where schedule_revision_id = target_revision_id;

  select count(*)
  into summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = target_revision_id;

  select
    count(*),
    count(*) filter (where assessment.status = 'VALID'),
    count(*) filter (where assessment.status = 'INVALID'),
    count(*) filter (where assessment.status = 'UNRESOLVED')
  into assessment_count, valid_count, invalid_count, unresolved_count
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card on card.id = assessment.card_id
  where card.schedule_revision_id = target_revision_id;

  if summary_count <> card_count then
    raise exception 'M4 expected one domain summary per card: cards %, summaries %', card_count, summary_count;
  end if;

  if assessment_count = 0 then
    raise exception 'M4 produced no candidate assessments';
  end if;

  if valid_count = 0 then
    raise exception 'M4 produced no VALID complete candidates';
  end if;

  if invalid_count = 0 then
    raise exception 'M4 expected structural INVALID assessments for day/lunch boundaries';
  end if;

  if exists (
    select 1
    from public.schedule_card_candidate_assessments
    where status = 'VALID'
      and (
        not is_complete
        or teacher_id is null
        or room_id is null
        or cardinality(reason_codes) <> 0
      )
  ) then
    raise exception 'M4 found invalidly shaped VALID candidates';
  end if;

  if exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    join public.schedule_cards card on card.id = assessment.card_id
    where assessment.status = 'VALID'
      and (
        assessment.start_period + card.duration_periods - 1 > 12
        or (
          assessment.start_period <= 5
          and assessment.start_period + card.duration_periods - 1 >= 6
        )
      )
  ) then
    raise exception 'M4 found VALID candidates crossing a hard time boundary';
  end if;

  if exists (
    select 1
    from public.schedule_card_domain_summaries
    where domain_status = 'UNRESOLVED'
      and unresolved_count = 0
  ) then
    raise exception 'M4 found inconsistent UNRESOLVED domain summary';
  end if;

  if exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M4 must not create placements or move transactions';
  end if;

  select count(*)
  into published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if published_session_count <> 517 then
    raise exception 'M4 changed published schedule projection unexpectedly: %', published_session_count;
  end if;

  update public.schedule_revisions
  set validation_summary = coalesce(validation_summary, '{}'::jsonb) || jsonb_build_object(
    'candidate_engine_version', 'M4-v0.1',
    'candidate_assessment_count', assessment_count,
    'candidate_valid_count', valid_count,
    'candidate_invalid_count', invalid_count,
    'candidate_unresolved_count', unresolved_count,
    'candidate_domain_summary_count', summary_count,
    'candidate_domain_refresh', 'PASS'
  )
  where id = target_revision_id;
end
$$;

commit;

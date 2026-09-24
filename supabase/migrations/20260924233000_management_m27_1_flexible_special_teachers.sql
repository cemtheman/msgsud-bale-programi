-- Management / M27.1
-- Flexible teacher pools for Orkestra and Doğaçlama.
--
-- Product rule:
--   * exactly one dedicated "Orkestra Öğretmeni"
--   * exactly one dedicated "Doğaçlama Öğretmeni"
--   * these lessons may ALSO be assigned to already-existing MUSIC or BALLET
--     teachers, like Birlikte Uygulama / B. Uygulama
--   * never manufacture Orkestra/Doğaçlama Öğretmeni 2/3/... capacity
--
-- Compatibility:
--   * safe whether M27 is applied immediately before this migration or was
--     already applied earlier
--   * known real teacher assignments are preserved
--   * M27-numbered synthetic target teachers are replaced safely
--   * public schedule_sessions/session_groups remain untouched

begin;

create temporary table m271_guard on commit drop as
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

create temporary table m271_context on commit drop as
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
begin
  if (select count(*) from m271_context) <> 1 then
    raise exception
      'M27.1 requires exactly one active 2026-2027 term-1 DRAFT revision';
  end if;
end
$$;

-- Target requirements.
create temporary table m271_targets on commit drop as
select
  requirement.id as requirement_id,
  subject.id as subject_id,
  subject.name as subject_name,
  case
    when lower(btrim(subject.name)) like 'orkestra%'
      then 'ORKESTRA'
    when lower(btrim(subject.name)) like 'doğaçlama%'
      then 'DOGACLAMA'
  end as target_kind,
  case
    when lower(btrim(subject.name)) like 'orkestra%'
      then 'Orkestra Öğretmeni'
    when lower(btrim(subject.name)) like 'doğaçlama%'
      then 'Doğaçlama Öğretmeni'
  end as dedicated_teacher_name
from m271_context context
join public.course_requirements requirement
  on requirement.requirement_set_id = context.requirement_set_id
join public.subjects subject
  on subject.id = requirement.subject_id
where requirement.term_status = 'ACTIVE'
  and (
    lower(btrim(subject.name)) like 'orkestra%'
    or lower(btrim(subject.name)) like 'doğaçlama%'
  );

-- Capture the pre-existing MUSIC/BALLET teacher pool BEFORE adding the two
-- dedicated target teachers. This prevents Orkestra Öğretmeni from becoming
-- Doğaçlama's generic fallback and vice versa.
create temporary table m271_existing_music_dance_teachers on commit drop as
with audience_requirements as (
  select distinct
    requirement.id as requirement_id
  from m271_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  where requirement.term_status = 'ACTIVE'
    and exists (
      select 1
      from public.management_requirement_public_members(requirement.id) member
      where member.target in ('MUSIC', 'BALLET')
    )
),
teacher_evidence as (
  select assignment.teacher_id
  from audience_requirements audience
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = audience.requirement_id

  union

  select placement.teacher_id
  from audience_requirements audience
  join public.schedule_cards card
    on card.requirement_id = audience.requirement_id
  join m271_context context
    on card.schedule_revision_id = context.revision_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id is not null
)
select distinct teacher.id as teacher_id
from teacher_evidence evidence
join public.teachers teacher
  on teacher.id = evidence.teacher_id
where teacher.name !~ '^Orkestra Öğretmeni [0-9]+$'
  and teacher.name !~ '^Doğaçlama Öğretmeni [0-9]+$'
  and teacher.name not in (
    'Orkestra Öğretmeni',
    'Doğaçlama Öğretmeni'
  );

-- Ensure exactly one dedicated row by name for each target kind.
insert into public.teachers (id, name)
select gen_random_uuid(), target.dedicated_teacher_name
from (
  select distinct dedicated_teacher_name
  from m271_targets
) target
where not exists (
  select 1
  from public.teachers teacher
  where teacher.name = target.dedicated_teacher_name
);

create temporary table m271_dedicated on commit drop as
select
  target.target_kind,
  target.dedicated_teacher_name,
  (
    array_agg(teacher.id order by teacher.id::text)
  )[1] as teacher_id
from (
  select distinct target_kind, dedicated_teacher_name
  from m271_targets
) target
join public.teachers teacher
  on teacher.name = target.dedicated_teacher_name
group by target.target_kind, target.dedicated_teacher_name;

-- Numbered synthetic M27 target teachers are not valid resources under M27.1.
create temporary table m271_numbered_synthetic on commit drop as
select teacher.id as teacher_id, teacher.name
from public.teachers teacher
where teacher.name ~ '^Orkestra Öğretmeni [0-9]+$'
   or teacher.name ~ '^Doğaçlama Öğretmeni [0-9]+$';

-- Target requirements may use:
--   * their one dedicated teacher
--   * every pre-existing MUSIC/BALLET teacher
--   * any already-known real teacher already attached to the requirement
-- Existing assignments are preserved except M27 numbered synthetic rows.
delete from public.course_requirement_teachers assignment
using m271_targets target, m271_numbered_synthetic numbered
where assignment.requirement_id = target.requirement_id
  and assignment.teacher_id = numbered.teacher_id;

insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id
)
select distinct
  target.requirement_id,
  dedicated.teacher_id
from m271_targets target
join m271_dedicated dedicated
  on dedicated.target_kind = target.target_kind
where not exists (
  select 1
  from public.course_requirement_teachers existing
  where existing.requirement_id = target.requirement_id
    and existing.teacher_id = dedicated.teacher_id
);

insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id
)
select distinct
  target.requirement_id,
  pool.teacher_id
from m271_targets target
cross join m271_existing_music_dance_teachers pool
where not exists (
  select 1
  from public.course_requirement_teachers existing
  where existing.requirement_id = target.requirement_id
    and existing.teacher_id = pool.teacher_id
);

-- Any target placement that is NULL or still points to an M27 numbered
-- synthetic teacher must be resolved against the flexible pool.
create temporary table m271_reassign_cards on commit drop as
select
  placement.card_id,
  card.requirement_id,
  target.target_kind,
  target.dedicated_teacher_name,
  placement.day_of_week,
  placement.start_period,
  (
    placement.start_period + card.duration_periods - 1
  )::smallint as end_period,
  placement.teacher_id as previous_teacher_id
from m271_context context
join public.schedule_cards card
  on card.schedule_revision_id = context.revision_id
join m271_targets target
  on target.requirement_id = card.requirement_id
join public.placements placement
  on placement.card_id = card.id
where placement.teacher_id is null
   or exists (
     select 1
     from m271_numbered_synthetic numbered
     where numbered.teacher_id = placement.teacher_id
   );

create temporary table m271_reassign_decisions (
  card_id uuid primary key,
  requirement_id uuid not null,
  selected_teacher_id uuid not null
) on commit drop;

do $$
declare
  target record;
  selected_teacher uuid;
begin
  for target in
    select *
    from m271_reassign_cards
    order by
      day_of_week,
      start_period,
      end_period,
      target_kind,
      requirement_id,
      card_id
  loop
    selected_teacher := null;

    -- Prefer the one dedicated teacher, then deterministic existing pool order.
    select candidate.teacher_id
    into selected_teacher
    from (
      select
        assignment.teacher_id,
        case
          when assignment.teacher_id = dedicated.teacher_id then 0
          else 1
        end as preference_rank,
        teacher.name
      from public.course_requirement_teachers assignment
      join public.teachers teacher
        on teacher.id = assignment.teacher_id
      join m271_targets target_requirement
        on target_requirement.requirement_id = assignment.requirement_id
      join m271_dedicated dedicated
        on dedicated.target_kind = target_requirement.target_kind
      where assignment.requirement_id = target.requirement_id
        and not exists (
          select 1
          from m271_numbered_synthetic numbered
          where numbered.teacher_id = assignment.teacher_id
        )
    ) candidate
    where not exists (
      select 1
      from public.placements occupied
      join public.schedule_cards occupied_card
        on occupied_card.id = occupied.card_id
      join m271_context context
        on occupied_card.schedule_revision_id = context.revision_id
      where occupied.teacher_id = candidate.teacher_id
        and occupied.card_id <> target.card_id
        and not exists (
          select 1
          from m271_reassign_cards pending_target
          where pending_target.card_id = occupied.card_id
        )
        and occupied.day_of_week = target.day_of_week
        and occupied.start_period <= target.end_period
        and (
          occupied.start_period + occupied_card.duration_periods - 1
        ) >= target.start_period
    )
    and not exists (
      select 1
      from m271_reassign_decisions pending
      join m271_reassign_cards pending_card
        on pending_card.card_id = pending.card_id
      where pending.selected_teacher_id = candidate.teacher_id
        and pending_card.day_of_week = target.day_of_week
        and pending_card.start_period <= target.end_period
        and pending_card.end_period >= target.start_period
    )
    order by
      candidate.preference_rank,
      candidate.name,
      candidate.teacher_id::text
    limit 1;

    if selected_teacher is null then
      raise exception
        'M27.1 no available dedicated/music/dance teacher for target card %, day %, periods %-%',
        target.card_id,
        target.day_of_week,
        target.start_period,
        target.end_period;
    end if;

    insert into m271_reassign_decisions (
      card_id,
      requirement_id,
      selected_teacher_id
    )
    values (
      target.card_id,
      target.requirement_id,
      selected_teacher
    );
  end loop;
end
$$;

update public.placements placement
set
  teacher_id = decision.selected_teacher_id,
  updated_at = now()
from m271_reassign_decisions decision
where placement.card_id = decision.card_id;

-- Reconcile teacher mode with the flexible pool.
with counts as (
  select
    target.requirement_id,
    count(distinct assignment.teacher_id)::integer as teacher_count
  from m271_targets target
  left join public.course_requirement_teachers assignment
    on assignment.requirement_id = target.requirement_id
  group by target.requirement_id
)
update public.course_requirements requirement
set teacher_mode = case
  when counts.teacher_count = 0 then 'UNKNOWN'
  when counts.teacher_count = 1 then 'FIXED'
  else 'ELIGIBLE_POOL'
end
from counts
where requirement.id = counts.requirement_id;

-- No target placement may remain NULL or use numbered synthetic capacity.
do $$
declare
  v_unresolved integer;
begin
  select count(*)
  into v_unresolved
  from m271_context context
  join public.schedule_cards card
    on card.schedule_revision_id = context.revision_id
  join m271_targets target
    on target.requirement_id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id is null
     or exists (
       select 1
       from m271_numbered_synthetic numbered
       where numbered.teacher_id = placement.teacher_id
     );

  if v_unresolved <> 0 then
    raise exception
      'M27.1 left % target placements unresolved/numbered',
      v_unresolved;
  end if;
end
$$;

-- Refresh candidate domain for all Orkestra/Doğaçlama cards.
do $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  select revision_id
  into v_revision_id
  from m271_context;

  select coalesce(
    array_agg(card.id order by card.id::text),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  join m271_targets target
    on target.requirement_id = card.requirement_id
  where card.schedule_revision_id = v_revision_id;

  if cardinality(v_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      v_revision_id,
      v_card_ids
    );
  end if;
end
$$;

-- Remove orphaned M27-numbered target teachers so Resources shows one
-- dedicated Orkestra and one dedicated Doğaçlama teacher, not stale 1/2/3 rows.
delete from public.teachers teacher
using m271_numbered_synthetic numbered
where teacher.id = numbered.teacher_id
  and not exists (
    select 1
    from public.course_requirement_teachers assignment
    where assignment.teacher_id = teacher.id
  )
  and not exists (
    select 1
    from public.placements placement
    where placement.teacher_id = teacher.id
  )
  and not exists (
    select 1
    from public.schedule_sessions session_row
    where session_row.teacher_id = teacher.id
  )
  and not exists (
    select 1
    from public.management_teacher_name_overrides name_override
    where name_override.teacher_id = teacher.id
  )
  and not exists (
    select 1
    from public.management_resource_reconciliations reconciliation
    where reconciliation.teacher_id = teacher.id
  );

-- Compact audit.
update public.schedule_revisions revision
set validation_summary =
  coalesce(revision.validation_summary, '{}'::jsonb)
  || jsonb_build_object(
    'm27_1_flexible_special_teachers', 'PASS',
    'm27_1_engine_version', 'M27.1-v1',
    'm27_1_target_requirement_count',
      (select count(*) from m271_targets),
    'm27_1_existing_music_dance_pool_size',
      (select count(*) from m271_existing_music_dance_teachers),
    'm27_1_reassigned_card_count',
      (select count(*) from m271_reassign_decisions),
    'm27_1_orchestra_dedicated_count',
      (
        select count(*)
        from public.teachers
        where name = 'Orkestra Öğretmeni'
      ),
    'm27_1_improvisation_dedicated_count',
      (
        select count(*)
        from public.teachers
        where name = 'Doğaçlama Öğretmeni'
      ),
    'm27_1_public_changed', false
  )
from m271_context context
where revision.id = context.revision_id;

-- Public timetable must remain unchanged.
do $$
declare
  guard record;
begin
  select *
  into guard
  from m271_guard;

  if (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
      and term = 1
  ) <> guard.public_session_count then
    raise exception 'M27.1 changed public schedule session count';
  end if;

  if (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) <> guard.public_group_count then
    raise exception 'M27.1 changed public schedule group count';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       is distinct from guard.public_sessions_hash
     or public.management_public_groups_hash('2026-2027')
       is distinct from guard.public_groups_hash then
    raise exception 'M27.1 changed public projection hashes';
  end if;
end
$$;

commit;

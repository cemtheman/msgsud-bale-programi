-- Management / M27.2
-- Canonical cleanup for legacy numbered Orkestra / Doğaçlama placeholders.
--
-- Why:
--   M27.1 removed exact "Orkestra Öğretmeni 1" / "Doğaçlama Öğretmeni 1"
--   rows from target assignments, but historical placeholder spellings may
--   remain (for example "Orkestra Ö.-1") and Resources lists every teachers
--   table row, including management-orphaned legacy identities.
--
-- Product invariant:
--   * one dedicated "Orkestra Öğretmeni"
--   * one dedicated "Doğaçlama Öğretmeni"
--   * target lessons may also use existing MUSIC/BALLET teachers
--   * numbered special placeholder identities are never active management
--     resources
--
-- This migration repairs active DRAFT management references. Historical/public
-- references are left intact if they still exist; the management Resources UI
-- hides such orphaned legacy placeholders instead of presenting them as active
-- teacher resources.

begin;

create temporary table m272_context on commit drop as
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
  if (select count(*) from m272_context) <> 1 then
    raise exception
      'M27.2 requires exactly one active 2026-2027 term-1 DRAFT revision';
  end if;
end
$$;

create temporary table m272_targets on commit drop as
select
  requirement.id as requirement_id,
  case
    when subject.name ilike 'Orkestra%' then 'ORKESTRA'
    else 'DOGACLAMA'
  end as target_kind,
  case
    when subject.name ilike 'Orkestra%' then 'Orkestra Öğretmeni'
    else 'Doğaçlama Öğretmeni'
  end as dedicated_name
from m272_context context
join public.course_requirements requirement
  on requirement.requirement_set_id = context.requirement_set_id
join public.subjects subject
  on subject.id = requirement.subject_id
where requirement.term_status = 'ACTIVE'
  and (
    subject.name ilike 'Orkestra%'
    or subject.name ilike 'Doğaçlama%'
  );

-- Catch both the M27 "Öğretmeni 1" form and earlier student-page-like
-- "Ö.-1" / "Öğretmeni-1" spellings.
create temporary table m272_legacy_teachers on commit drop as
select
  teacher.id as teacher_id,
  teacher.name,
  case
    when teacher.name ilike 'Orkestra%' then 'ORKESTRA'
    else 'DOGACLAMA'
  end as target_kind
from public.teachers teacher
where (
    teacher.name ilike 'Orkestra%'
    or teacher.name ilike 'Doğaçlama%'
  )
  and teacher.name not in (
    'Orkestra Öğretmeni',
    'Doğaçlama Öğretmeni'
  )
  and (
    teacher.name ~ '[0-9]+$'
    or teacher.name ~* 'Ö[.]?[- _]*[0-9]+$'
    or teacher.name ~* 'Öğretmeni[- _]*[0-9]+$'
  );

insert into public.teachers (id, name)
select
  gen_random_uuid(),
  target.dedicated_name
from (
  select distinct dedicated_name
  from m272_targets
) target
where not exists (
  select 1
  from public.teachers teacher
  where teacher.name = target.dedicated_name
);

create temporary table m272_dedicated on commit drop as
select
  target.target_kind,
  target.dedicated_name,
  (
    array_agg(teacher.id order by teacher.id::text)
  )[1] as teacher_id
from (
  select distinct target_kind, dedicated_name
  from m272_targets
) target
join public.teachers teacher
  on teacher.name = target.dedicated_name
group by target.target_kind, target.dedicated_name;

-- Existing MUSIC/BALLET teachers are the flexible fallback pool. Exclude all
-- special placeholder identities from this pool.
create temporary table m272_flexible_pool on commit drop as
with audience_requirements as (
  select distinct requirement.id as requirement_id
  from m272_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  where requirement.term_status = 'ACTIVE'
    and exists (
      select 1
      from public.management_requirement_public_members(requirement.id) member
      where member.target in ('MUSIC', 'BALLET')
    )
),
teacher_ids as (
  select assignment.teacher_id
  from audience_requirements audience
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = audience.requirement_id

  union

  select placement.teacher_id
  from audience_requirements audience
  join public.schedule_cards card
    on card.requirement_id = audience.requirement_id
  join m272_context context
    on card.schedule_revision_id = context.revision_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id is not null
)
select distinct teacher.id as teacher_id
from teacher_ids source
join public.teachers teacher
  on teacher.id = source.teacher_id
where teacher.id not in (
  select teacher_id from m272_legacy_teachers
)
  and teacher.name not in (
    'Orkestra Öğretmeni',
    'Doğaçlama Öğretmeni'
  );

-- Legacy special placeholders must not remain eligible for target requirements.
delete from public.course_requirement_teachers assignment
using m272_targets target, m272_legacy_teachers legacy
where assignment.requirement_id = target.requirement_id
  and assignment.teacher_id = legacy.teacher_id;

-- Ensure the one dedicated identity and the flexible existing pool are eligible.
insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id
)
select
  target.requirement_id,
  dedicated.teacher_id
from m272_targets target
join m272_dedicated dedicated
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
from m272_targets target
cross join m272_flexible_pool pool
where not exists (
  select 1
  from public.course_requirement_teachers existing
  where existing.requirement_id = target.requirement_id
    and existing.teacher_id = pool.teacher_id
);

create temporary table m272_reassign on commit drop as
select
  placement.card_id,
  card.requirement_id,
  target.target_kind,
  placement.day_of_week,
  placement.start_period,
  (
    placement.start_period + card.duration_periods - 1
  )::smallint as end_period
from m272_context context
join public.schedule_cards card
  on card.schedule_revision_id = context.revision_id
join m272_targets target
  on target.requirement_id = card.requirement_id
join public.placements placement
  on placement.card_id = card.id
where placement.teacher_id is null
   or placement.teacher_id in (
     select teacher_id from m272_legacy_teachers
   );

create temporary table m272_decisions (
  card_id uuid primary key,
  teacher_id uuid not null
) on commit drop;

do $$
declare
  target record;
  chosen uuid;
begin
  for target in
    select *
    from m272_reassign
    order by
      day_of_week,
      start_period,
      end_period,
      target_kind,
      requirement_id,
      card_id
  loop
    chosen := null;

    select candidate.teacher_id
    into chosen
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
      join m272_targets target_requirement
        on target_requirement.requirement_id = assignment.requirement_id
      join m272_dedicated dedicated
        on dedicated.target_kind = target_requirement.target_kind
      where assignment.requirement_id = target.requirement_id
        and assignment.teacher_id not in (
          select teacher_id from m272_legacy_teachers
        )
    ) candidate
    where not exists (
      select 1
      from public.placements occupied
      join public.schedule_cards occupied_card
        on occupied_card.id = occupied.card_id
      join m272_context context
        on occupied_card.schedule_revision_id = context.revision_id
      where occupied.teacher_id = candidate.teacher_id
        and occupied.card_id <> target.card_id
        and occupied.card_id not in (
          select card_id from m272_reassign
        )
        and occupied.day_of_week = target.day_of_week
        and occupied.start_period <= target.end_period
        and (
          occupied.start_period + occupied_card.duration_periods - 1
        ) >= target.start_period
    )
    and not exists (
      select 1
      from m272_decisions pending
      join m272_reassign pending_card
        on pending_card.card_id = pending.card_id
      where pending.teacher_id = candidate.teacher_id
        and pending_card.day_of_week = target.day_of_week
        and pending_card.start_period <= target.end_period
        and pending_card.end_period >= target.start_period
    )
    order by
      candidate.preference_rank,
      candidate.name,
      candidate.teacher_id::text
    limit 1;

    if chosen is null then
      raise exception
        'M27.2 no available dedicated/music/dance teacher for target card %, day %, periods %-%',
        target.card_id,
        target.day_of_week,
        target.start_period,
        target.end_period;
    end if;

    insert into m272_decisions (card_id, teacher_id)
    values (target.card_id, chosen);
  end loop;
end
$$;

update public.placements placement
set
  teacher_id = decision.teacher_id,
  updated_at = now()
from m272_decisions decision
where placement.card_id = decision.card_id;

with counts as (
  select
    target.requirement_id,
    count(distinct assignment.teacher_id)::integer as teacher_count
  from m272_targets target
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

-- Active draft invariant: no numbered special placeholder remains in either
-- target requirement assignments or target placements.
do $$
declare
  v_assignment_count integer;
  v_placement_count integer;
begin
  select count(*)
  into v_assignment_count
  from public.course_requirement_teachers assignment
  join m272_targets target
    on target.requirement_id = assignment.requirement_id
  where assignment.teacher_id in (
    select teacher_id from m272_legacy_teachers
  );

  select count(*)
  into v_placement_count
  from m272_context context
  join public.schedule_cards card
    on card.schedule_revision_id = context.revision_id
  join m272_targets target
    on target.requirement_id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id in (
    select teacher_id from m272_legacy_teachers
  );

  if v_assignment_count <> 0 or v_placement_count <> 0 then
    raise exception
      'M27.2 legacy special teacher references remain: assignments %, placements %',
      v_assignment_count,
      v_placement_count;
  end if;
end
$$;

-- Remove rows only when absolutely unreferenced. Rows retained solely by
-- historical/public/audit references are intentionally left in the database;
-- the Resources UI suppresses them as retired management placeholders.
delete from public.teachers teacher
using m272_legacy_teachers legacy
where teacher.id = legacy.teacher_id
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

do $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  select revision_id into v_revision_id from m272_context;

  select coalesce(
    array_agg(card.id order by card.id::text),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  join m272_targets target
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

update public.schedule_revisions revision
set validation_summary =
  coalesce(revision.validation_summary, '{}'::jsonb)
  || jsonb_build_object(
    'm27_2_special_teacher_canonicalization', 'PASS',
    'm27_2_engine_version', 'M27.2-v1',
    'm27_2_legacy_teacher_count',
      (select count(*) from m272_legacy_teachers),
    'm27_2_reassigned_card_count',
      (select count(*) from m272_decisions),
    'm27_2_orchestra_dedicated_count',
      (
        select count(*)
        from public.teachers
        where name = 'Orkestra Öğretmeni'
      ),
    'm27_2_improvisation_dedicated_count',
      (
        select count(*)
        from public.teachers
        where name = 'Doğaçlama Öğretmeni'
      )
  )
from m272_context context
where revision.id = context.revision_id;

commit;

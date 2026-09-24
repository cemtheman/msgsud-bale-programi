-- Management / M27
-- Missing Teacher Completion from Effective Draft Timetable
--
-- Purpose:
--   * scan the active 2026-2027 term-1 draft cards/placements,
--   * preserve every already-known teacher,
--   * complete NULL teacher placements with deterministic inferred teachers,
--   * create enough numbered inferred teachers when simultaneous teaching
--     capacity requires more than one person,
--   * reconcile course_requirement_teachers so Resources exposes the same
--     teacher capacity that the cards actually use.
--
-- Naming contract:
--   <Canonical lesson name> Öğretmeni
--   <Canonical lesson name> Öğretmeni 1 / 2 / 3 ... when concurrency > 1
--
-- Historical student-page rules carried forward:
--   * Türk D. ve Edb. aliases -> Türk Dili ve Edebiyatı Öğretmeni
--   * Din Kültürü aliases -> Din Kültürü Öğretmeni
--   * Müzik Tarihi / Müzik Teorisi / Koro -> one Müzik Öğretmeni identity
--   * Kulüp / Sahne / Birlikte Uygulama do not require inferred teachers
--
-- Safety:
--   * published schedule_sessions/session_groups are NOT modified,
--   * known teacher ids are never replaced,
--   * a known requirement teacher is reused for a NULL placement only when
--     that teacher is actually free for the whole block,
--   * generated teachers are interval-colored so no generated teacher is
--     double-booked in the current draft,
--   * public projection hashes must remain unchanged.

begin;

create temporary table m27_guard on commit drop as
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

create temporary table m27_context on commit drop as
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
  if (select count(*) from m27_context) <> 1 then
    raise exception
      'M27 requires exactly one active 2026-2027 term-1 DRAFT revision';
  end if;
end
$$;

create temporary table m27_eligible_requirements on commit drop as
select
  requirement.id as requirement_id,
  subject.id as subject_id,
  subject.name as subject_name,
  case
    when lower(subject.name) like 'türk d%'
      then 'türk dili ve edebiyatı'
    when lower(subject.name) like 'din kült%'
      then 'din kültürü'
    else lower(btrim(subject.name))
  end as subject_key,
  case
    when lower(btrim(subject.name)) in (
      'müzik tarihi',
      'müzik teorisi',
      'koro'
    )
      then 'müzik öğretmeni'
    when lower(subject.name) like 'türk d%'
      then 'türk dili ve edebiyatı'
    when lower(subject.name) like 'din kült%'
      then 'din kültürü'
    else lower(btrim(subject.name))
  end as teacher_identity,
  case
    when lower(btrim(subject.name)) in (
      'müzik tarihi',
      'müzik teorisi',
      'koro'
    )
      then 'Müzik Öğretmeni'
    when lower(subject.name) like 'türk d%'
      then 'Türk Dili ve Edebiyatı Öğretmeni'
    when lower(subject.name) like 'din kült%'
      then 'Din Kültürü Öğretmeni'
    else btrim(subject.name) || ' Öğretmeni'
  end as teacher_base_name
from m27_context context
join public.course_requirements requirement
  on requirement.requirement_set_id = context.requirement_set_id
join public.subjects subject
  on subject.id = requirement.subject_id
where requirement.term_status = 'ACTIVE'
  and exists (
    select 1
    from public.schedule_cards card
    where card.schedule_revision_id = context.revision_id
      and card.requirement_id = requirement.id
  )
  and lower(btrim(subject.name)) not like 'kulüp%'
  and lower(btrim(subject.name)) not like 'sahne%'
  and lower(btrim(subject.name)) not like 'birlikte uygulama%'
  and lower(btrim(subject.name)) not like 'b. uygulama%';

create temporary table m27_missing_placements on commit drop as
select
  placement.card_id,
  card.requirement_id,
  eligible.subject_name,
  eligible.subject_key,
  eligible.teacher_identity,
  eligible.teacher_base_name,
  placement.day_of_week,
  placement.start_period,
  (
    placement.start_period + card.duration_periods - 1
  )::smallint as end_period
from m27_context context
join public.schedule_cards card
  on card.schedule_revision_id = context.revision_id
join m27_eligible_requirements eligible
  on eligible.requirement_id = card.requirement_id
join public.placements placement
  on placement.card_id = card.id
where placement.teacher_id is null;

create temporary table m27_teacher_decisions (
  card_id uuid primary key,
  requirement_id uuid not null,
  teacher_identity text not null,
  teacher_base_name text not null,
  day_of_week smallint not null,
  start_period smallint not null,
  end_period smallint not null,
  selected_teacher_id uuid null,
  generated_color integer null
) on commit drop;

do $$
declare
  target record;
  selected_teacher uuid;
  color_candidate integer;
begin
  for target in
    select *
    from m27_missing_placements
    order by
      teacher_identity,
      day_of_week,
      start_period,
      end_period,
      requirement_id,
      card_id
  loop
    selected_teacher := null;

    -- Prefer a real/known teacher already attached to this requirement,
    -- but only when that teacher is genuinely free for the complete block.
    select assignment.teacher_id
    into selected_teacher
    from public.course_requirement_teachers assignment
    join public.teachers teacher
      on teacher.id = assignment.teacher_id
    where assignment.requirement_id = target.requirement_id
      and not exists (
        select 1
        from public.placements occupied
        join public.schedule_cards occupied_card
          on occupied_card.id = occupied.card_id
        join m27_context context
          on occupied_card.schedule_revision_id = context.revision_id
        where occupied.teacher_id = assignment.teacher_id
          and occupied.card_id <> target.card_id
          and occupied.day_of_week = target.day_of_week
          and occupied.start_period <= target.end_period
          and (
            occupied.start_period
            + occupied_card.duration_periods
            - 1
          ) >= target.start_period
      )
      and not exists (
        select 1
        from m27_teacher_decisions pending
        where pending.selected_teacher_id = assignment.teacher_id
          and pending.day_of_week = target.day_of_week
          and pending.start_period <= target.end_period
          and pending.end_period >= target.start_period
      )
    order by teacher.name, assignment.teacher_id::text
    limit 1;

    if selected_teacher is not null then
      insert into m27_teacher_decisions (
        card_id,
        requirement_id,
        teacher_identity,
        teacher_base_name,
        day_of_week,
        start_period,
        end_period,
        selected_teacher_id,
        generated_color
      )
      values (
        target.card_id,
        target.requirement_id,
        target.teacher_identity,
        target.teacher_base_name,
        target.day_of_week,
        target.start_period,
        target.end_period,
        selected_teacher,
        null
      );

      continue;
    end if;

    -- No known teacher is safely reusable. Allocate the lowest synthetic
    -- capacity lane not already occupied by an overlapping inferred lesson.
    color_candidate := 1;

    loop
      exit when not exists (
        select 1
        from m27_teacher_decisions pending
        where pending.teacher_identity = target.teacher_identity
          and pending.generated_color = color_candidate
          and pending.day_of_week = target.day_of_week
          and pending.start_period <= target.end_period
          and pending.end_period >= target.start_period
      );

      color_candidate := color_candidate + 1;
    end loop;

    insert into m27_teacher_decisions (
      card_id,
      requirement_id,
      teacher_identity,
      teacher_base_name,
      day_of_week,
      start_period,
      end_period,
      selected_teacher_id,
      generated_color
    )
    values (
      target.card_id,
      target.requirement_id,
      target.teacher_identity,
      target.teacher_base_name,
      target.day_of_week,
      target.start_period,
      target.end_period,
      null,
      color_candidate
    );
  end loop;
end
$$;

-- Requirements with no teacher evidence and currently no placed card still
-- need a teacher resource so they are not permanently UNKNOWN.
create temporary table m27_default_requirements on commit drop as
select
  eligible.requirement_id,
  eligible.teacher_identity,
  eligible.teacher_base_name
from m27_eligible_requirements eligible
where not exists (
    select 1
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = eligible.requirement_id
  )
  and not exists (
    select 1
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    join m27_context context
      on card.schedule_revision_id = context.revision_id
    where card.requirement_id = eligible.requirement_id
      and placement.teacher_id is not null
  )
  and not exists (
    select 1
    from m27_teacher_decisions decision
    where decision.requirement_id = eligible.requirement_id
  );

create temporary table m27_generated_capacity on commit drop as
select
  source.teacher_identity,
  max(source.teacher_base_name) as teacher_base_name,
  max(source.generated_color)::integer as teacher_count
from (
  select
    decision.teacher_identity,
    decision.teacher_base_name,
    decision.generated_color
  from m27_teacher_decisions decision
  where decision.generated_color is not null

  union all

  select
    default_requirement.teacher_identity,
    default_requirement.teacher_base_name,
    1 as generated_color
  from m27_default_requirements default_requirement
) source
group by source.teacher_identity;

create temporary table m27_generated_names on commit drop as
select
  capacity.teacher_identity,
  color.color_number as generated_color,
  case
    when capacity.teacher_count = 1
      then capacity.teacher_base_name
    else capacity.teacher_base_name || ' ' || color.color_number::text
  end as teacher_name,
  false as existed_before
from m27_generated_capacity capacity
cross join lateral generate_series(
  1,
  capacity.teacher_count
) as color(color_number);

update m27_generated_names generated
set existed_before = exists (
  select 1
  from public.teachers teacher
  where teacher.name = generated.teacher_name
);

insert into public.teachers (
  id,
  name
)
select
  gen_random_uuid(),
  generated.teacher_name
from m27_generated_names generated
where not generated.existed_before
  and not exists (
    select 1
    from public.teachers teacher
    where teacher.name = generated.teacher_name
  );

create temporary table m27_generated_teacher_ids on commit drop as
select
  generated.teacher_identity,
  generated.generated_color,
  generated.teacher_name,
  (
    array_agg(
      teacher.id
      order by teacher.id::text
    )
  )[1] as teacher_id
from m27_generated_names generated
join public.teachers teacher
  on teacher.name = generated.teacher_name
group by
  generated.teacher_identity,
  generated.generated_color,
  generated.teacher_name;

update m27_teacher_decisions decision
set selected_teacher_id = generated.teacher_id
from m27_generated_teacher_ids generated
where decision.selected_teacher_id is null
  and decision.generated_color is not null
  and generated.teacher_identity = decision.teacher_identity
  and generated.generated_color = decision.generated_color;

do $$
begin
  if exists (
    select 1
    from m27_teacher_decisions
    where selected_teacher_id is null
  ) then
    raise exception
      'M27 failed to resolve one or more inferred teacher decisions';
  end if;
end
$$;

-- Apply only to placements that are still NULL; known teacher choices are
-- immutable for this migration.
update public.placements placement
set
  teacher_id = decision.selected_teacher_id,
  updated_at = now()
from m27_teacher_decisions decision
where placement.card_id = decision.card_id
  and placement.teacher_id is null;

-- Any teacher already present on a card is valid evidence for its requirement.
-- Reconcile those ids first, including the inferred placements just written.
insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id
)
select distinct
  eligible.requirement_id,
  placement.teacher_id
from m27_eligible_requirements eligible
join public.schedule_cards card
  on card.requirement_id = eligible.requirement_id
join m27_context context
  on card.schedule_revision_id = context.revision_id
join public.placements placement
  on placement.card_id = card.id
where placement.teacher_id is not null
  and not exists (
    select 1
    from public.course_requirement_teachers existing
    where existing.requirement_id = eligible.requirement_id
      and existing.teacher_id = placement.teacher_id
  );

-- A wholly unplaced requirement receives capacity lane 1.
insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id
)
select
  default_requirement.requirement_id,
  generated.teacher_id
from m27_default_requirements default_requirement
join m27_generated_teacher_ids generated
  on generated.teacher_identity = default_requirement.teacher_identity
 and generated.generated_color = 1
where not exists (
  select 1
  from public.course_requirement_teachers existing
  where existing.requirement_id = default_requirement.requirement_id
    and existing.teacher_id = generated.teacher_id
);

-- Teacher mode now reflects the concrete assignment pool.
with assignment_counts as (
  select
    eligible.requirement_id,
    count(assignment.teacher_id)::integer as teacher_count
  from m27_eligible_requirements eligible
  left join public.course_requirement_teachers assignment
    on assignment.requirement_id = eligible.requirement_id
  group by eligible.requirement_id
)
update public.course_requirements requirement
set teacher_mode = case
  when counts.teacher_count = 0 then 'UNKNOWN'
  when counts.teacher_count = 1 then 'FIXED'
  else 'ELIGIBLE_POOL'
end
from assignment_counts counts
where requirement.id = counts.requirement_id;

-- The migration must complete every currently placed eligible lesson.
do $$
declare
  v_missing_placement_count integer;
  v_missing_requirement_count integer;
begin
  select count(*)
  into v_missing_placement_count
  from m27_eligible_requirements eligible
  join public.schedule_cards card
    on card.requirement_id = eligible.requirement_id
  join m27_context context
    on card.schedule_revision_id = context.revision_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id is null;

  if v_missing_placement_count <> 0 then
    raise exception
      'M27 left % placed eligible cards without a teacher',
      v_missing_placement_count;
  end if;

  select count(*)
  into v_missing_requirement_count
  from m27_eligible_requirements eligible
  where not exists (
    select 1
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = eligible.requirement_id
  );

  if v_missing_requirement_count <> 0 then
    raise exception
      'M27 left % eligible requirements without a teacher assignment',
      v_missing_requirement_count;
  end if;
end
$$;

-- No newly completed card may introduce a teacher double-booking.
do $$
declare
  v_conflicts jsonb;
begin
  with conflicts as (
    select
      left_placement.card_id as left_card_id,
      right_placement.card_id as right_card_id,
      left_placement.teacher_id,
      left_placement.day_of_week,
      left_placement.start_period as left_start,
      (
        left_placement.start_period + left_card.duration_periods - 1
      )::smallint as left_end,
      right_placement.start_period as right_start,
      (
        right_placement.start_period + right_card.duration_periods - 1
      )::smallint as right_end
    from public.placements left_placement
    join public.schedule_cards left_card
      on left_card.id = left_placement.card_id
    join public.placements right_placement
      on right_placement.card_id > left_placement.card_id
     and right_placement.teacher_id = left_placement.teacher_id
     and right_placement.day_of_week = left_placement.day_of_week
    join public.schedule_cards right_card
      on right_card.id = right_placement.card_id
    join m27_context context
      on left_card.schedule_revision_id = context.revision_id
     and right_card.schedule_revision_id = context.revision_id
    where left_placement.teacher_id is not null
      and left_placement.start_period
          <= right_placement.start_period + right_card.duration_periods - 1
      and right_placement.start_period
          <= left_placement.start_period + left_card.duration_periods - 1
      and (
        exists (
          select 1
          from m27_teacher_decisions decision
          where decision.card_id = left_placement.card_id
        )
        or exists (
          select 1
          from m27_teacher_decisions decision
          where decision.card_id = right_placement.card_id
        )
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leftCardId', conflict.left_card_id,
        'rightCardId', conflict.right_card_id,
        'teacherId', conflict.teacher_id,
        'dayOfWeek', conflict.day_of_week,
        'leftStart', conflict.left_start,
        'leftEnd', conflict.left_end,
        'rightStart', conflict.right_start,
        'rightEnd', conflict.right_end
      )
      order by
        conflict.day_of_week,
        conflict.left_start,
        conflict.right_start,
        conflict.left_card_id
    ),
    '[]'::jsonb
  )
  into v_conflicts
  from conflicts conflict;

  if jsonb_array_length(v_conflicts) <> 0 then
    raise exception
      'M27 inferred teacher allocation created conflicts: %',
      v_conflicts;
  end if;
end
$$;

-- Rebuild candidate rows for all active requirements whose teacher pool may
-- have been reconciled.
do $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  select revision_id
  into v_revision_id
  from m27_context;

  select coalesce(
    array_agg(card.id order by card.id::text),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  join m27_eligible_requirements eligible
    on eligible.requirement_id = card.requirement_id
  where card.schedule_revision_id = v_revision_id;

  if cardinality(v_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      v_revision_id,
      v_card_ids
    );
  end if;
end
$$;

-- Persist a compact audit in the active revision.
update public.schedule_revisions revision
set validation_summary =
  coalesce(revision.validation_summary, '{}'::jsonb)
  || jsonb_build_object(
    'm27_teacher_completion', 'PASS',
    'm27_engine_version', 'M27-v1',
    'm27_eligible_requirement_count',
      (select count(*) from m27_eligible_requirements),
    'm27_filled_placement_count',
      (select count(*) from m27_teacher_decisions),
    'm27_reused_known_teacher_count',
      (
        select count(*)
        from m27_teacher_decisions
        where generated_color is null
      ),
    'm27_generated_placement_count',
      (
        select count(*)
        from m27_teacher_decisions
        where generated_color is not null
      ),
    'm27_default_requirement_count',
      (select count(*) from m27_default_requirements),
    'm27_generated_teacher_count',
      (select count(*) from m27_generated_names),
    'm27_new_teacher_row_count',
      (
        select count(*)
        from m27_generated_names
        where not existed_before
      ),
    'm27_generated_teachers',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', generated.teacher_name,
              'identity', generated.teacher_identity,
              'capacityLane', generated.generated_color,
              'newRow', not generated.existed_before
            )
            order by
              generated.teacher_identity,
              generated.generated_color
          )
          from m27_generated_names generated
        ),
        '[]'::jsonb
      ),
    'm27_public_changed', false
  )
from m27_context context
where revision.id = context.revision_id;

-- Public timetable must remain byte-for-byte semantically unchanged.
do $$
declare
  guard record;
begin
  select *
  into guard
  from m27_guard;

  if (
    select count(*)
    from public.schedule_sessions
    where academic_year = '2026-2027'
      and term = 1
  ) <> guard.public_session_count then
    raise exception 'M27 changed public schedule session count';
  end if;

  if (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) <> guard.public_group_count then
    raise exception 'M27 changed public schedule group count';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       is distinct from guard.public_sessions_hash
     or public.management_public_groups_hash('2026-2027')
       is distinct from guard.public_groups_hash then
    raise exception 'M27 changed public projection hashes';
  end if;
end
$$;

commit;

-- Management v0.1 / M3
-- Draft schedule revision + deterministic card generation.
-- No solver, placements, propagation, publish action, or published schedule rewrite.

begin;

-- Lock M3 to the exact M2 bootstrap state that was live-validated.
do $$
declare
  requirement_set_count integer;
  requirement_count integer;
  active_requirement_count integer;
  revision_count integer;
  card_count integer;
begin
  select count(*)
  into requirement_set_count
  from public.requirement_sets
  where academic_year = '2026-2027'
    and term = 1
    and version_number = 1
    and status = 'DRAFT';

  if requirement_set_count <> 1 then
    raise exception 'M3 expected exactly one 2026-2027 term-1 v1 DRAFT requirement set, found %', requirement_set_count;
  end if;

  select count(*)
  into requirement_count
  from public.course_requirements cr
  join public.requirement_sets rs on rs.id = cr.requirement_set_id
  where rs.academic_year = '2026-2027'
    and rs.term = 1
    and rs.version_number = 1;

  if requirement_count <> 188 then
    raise exception 'M3 expected 188 M2 requirements, found %', requirement_count;
  end if;

  select count(*)
  into active_requirement_count
  from public.course_requirements cr
  join public.requirement_sets rs on rs.id = cr.requirement_set_id
  where rs.academic_year = '2026-2027'
    and rs.term = 1
    and rs.version_number = 1
    and cr.term_status = 'ACTIVE';

  if active_requirement_count = 0 then
    raise exception 'M3 found no ACTIVE requirements';
  end if;

  select count(*) into revision_count from public.schedule_revisions;
  select count(*) into card_count from public.schedule_cards;

  if revision_count <> 0 or card_count <> 0 then
    raise exception 'M3 requires empty revision/card tables, found revisions %, cards %', revision_count, card_count;
  end if;

  if exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M3 requires empty placements and move_transactions';
  end if;
end
$$;

-- v0.1 partition policy:
--   ACADEMIC/OTHER: 2-period blocks plus a 1-period remainder (5 => 2+2+1).
--   TECHNIQUE: 5 => 3+2, 3 => 2+1; otherwise the academic/default split.
--   REPERTOIRE/REHEARSAL: prefer long blocks up to 3 periods (5 => 3+2, 4 => 3+1).
-- This phase intentionally fixes one partition per requirement before scheduling.
create temporary table m3_partitions on commit drop as
select
  cr.id as requirement_id,
  cr.requirement_set_id,
  cr.weekly_load,
  cr.course_character,
  (
    case
      when cr.course_character in ('REPERTOIRE', 'REHEARSAL') then
        (
          select array_agg(
            case
              when part_index < ((cr.weekly_load + 2) / 3)
                then 3
              when cr.weekly_load % 3 = 0
                then 3
              else cr.weekly_load % 3
            end
            order by part_index
          )::smallint[]
          from generate_series(1, ((cr.weekly_load + 2) / 3)) as part_index
        )
      when cr.course_character = 'TECHNIQUE' and cr.weekly_load = 5 then
        array[3, 2]::smallint[]
      when cr.course_character = 'TECHNIQUE' and cr.weekly_load = 3 then
        array[2, 1]::smallint[]
      else
        (
          select array_agg(
            case
              when part_index <= (cr.weekly_load / 2)
                then 2
              else 1
            end
            order by part_index
          )::smallint[]
          from generate_series(1, ((cr.weekly_load + 1) / 2)) as part_index
        )
    end
  ) as parts
from public.course_requirements cr
join public.requirement_sets rs
  on rs.id = cr.requirement_set_id
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1
  and rs.status = 'DRAFT'
  and cr.term_status = 'ACTIVE';

do $$
declare
  bad_partition_count integer;
begin
  select count(*)
  into bad_partition_count
  from m3_partitions
  where parts is null
     or cardinality(parts) = 0
     or exists (
       select 1
       from unnest(parts) as duration
       where duration < 1 or duration > 3
     )
     or (
       select coalesce(sum(duration), 0)
       from unnest(parts) as duration
     ) <> weekly_load;

  if bad_partition_count <> 0 then
    raise exception 'M3 generated % invalid partitions', bad_partition_count;
  end if;
end
$$;

update public.course_requirements cr
set
  preferred_partition = to_jsonb(part.parts),
  allowed_partitions = jsonb_build_array(to_jsonb(part.parts))
from m3_partitions part
where part.requirement_id = cr.id;

insert into public.schedule_revisions (
  requirement_set_id,
  version_number,
  status,
  validation_summary
)
select
  rs.id,
  1,
  'DRAFT',
  jsonb_build_object(
    'phase', 'M3',
    'partition_policy_version', 'v0.1',
    'partition_mode', 'FIXED',
    'active_requirement_count', (
      select count(*)
      from public.course_requirements cr
      where cr.requirement_set_id = rs.id
        and cr.term_status = 'ACTIVE'
    ),
    'inactive_requirement_count', (
      select count(*)
      from public.course_requirements cr
      where cr.requirement_set_id = rs.id
        and cr.term_status = 'INACTIVE'
    ),
    'card_generation', 'READY'
  )
from public.requirement_sets rs
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1
  and rs.status = 'DRAFT';

insert into public.schedule_cards (
  schedule_revision_id,
  requirement_id,
  block_index,
  duration_periods,
  locked
)
select
  revision.id,
  part.requirement_id,
  expanded.ordinality::smallint,
  expanded.duration::smallint,
  false
from m3_partitions part
join public.schedule_revisions revision
  on revision.requirement_set_id = part.requirement_set_id
 and revision.version_number = 1
 and revision.status = 'DRAFT'
cross join lateral unnest(part.parts)
  with ordinality as expanded(duration, ordinality);

-- Final invariants: every active requirement has exactly its fixed partition,
-- inactive/unknown requirements have no cards, and no placement work has started.
do $$
declare
  active_load integer;
  card_load integer;
  active_requirements_without_cards integer;
  nonactive_requirements_with_cards integer;
  partition_mismatches integer;
  revision_count integer;
  card_count integer;
  published_session_count integer;
  source_evidence_count integer;
begin
  select coalesce(sum(cr.weekly_load), 0)
  into active_load
  from public.course_requirements cr
  join public.requirement_sets rs on rs.id = cr.requirement_set_id
  where rs.academic_year = '2026-2027'
    and rs.term = 1
    and rs.version_number = 1
    and cr.term_status = 'ACTIVE';

  select coalesce(sum(sc.duration_periods), 0)
  into card_load
  from public.schedule_cards sc
  join public.schedule_revisions sr on sr.id = sc.schedule_revision_id
  join public.requirement_sets rs on rs.id = sr.requirement_set_id
  where rs.academic_year = '2026-2027'
    and rs.term = 1
    and rs.version_number = 1
    and sr.version_number = 1
    and sr.status = 'DRAFT';

  if card_load <> active_load then
    raise exception 'M3 card load mismatch: active load %, card load %', active_load, card_load;
  end if;

  select count(*)
  into active_requirements_without_cards
  from public.course_requirements cr
  join public.requirement_sets rs on rs.id = cr.requirement_set_id
  where rs.academic_year = '2026-2027'
    and rs.term = 1
    and rs.version_number = 1
    and cr.term_status = 'ACTIVE'
    and not exists (
      select 1
      from public.schedule_cards sc
      join public.schedule_revisions sr on sr.id = sc.schedule_revision_id
      where sc.requirement_id = cr.id
        and sr.requirement_set_id = cr.requirement_set_id
        and sr.version_number = 1
        and sr.status = 'DRAFT'
    );

  if active_requirements_without_cards <> 0 then
    raise exception 'M3 found % active requirements without cards', active_requirements_without_cards;
  end if;

  select count(*)
  into nonactive_requirements_with_cards
  from public.schedule_cards sc
  join public.course_requirements cr on cr.id = sc.requirement_id
  where cr.term_status <> 'ACTIVE';

  if nonactive_requirements_with_cards <> 0 then
    raise exception 'M3 generated cards for % non-active requirements', nonactive_requirements_with_cards;
  end if;

  select count(*)
  into partition_mismatches
  from public.course_requirements cr
  join m3_partitions part on part.requirement_id = cr.id
  where cr.preferred_partition is distinct from to_jsonb(part.parts)
     or cr.allowed_partitions is distinct from jsonb_build_array(to_jsonb(part.parts));

  if partition_mismatches <> 0 then
    raise exception 'M3 found % persisted partition mismatches', partition_mismatches;
  end if;

  if exists (
    select 1
    from public.course_requirements
    where term_status = 'ACTIVE'
      and course_character in ('ACADEMIC', 'OTHER')
      and weekly_load = 5
      and preferred_partition <> '[2,2,1]'::jsonb
  ) then
    raise exception 'M3 academic/default 5-period partition policy violated';
  end if;

  if exists (
    select 1
    from public.course_requirements
    where term_status = 'ACTIVE'
      and course_character = 'TECHNIQUE'
      and weekly_load = 5
      and preferred_partition <> '[3,2]'::jsonb
  ) then
    raise exception 'M3 technical 5-period partition policy violated';
  end if;

  if exists (
    select 1
    from public.course_requirements
    where term_status = 'ACTIVE'
      and course_character = 'TECHNIQUE'
      and weekly_load = 3
      and preferred_partition <> '[2,1]'::jsonb
  ) then
    raise exception 'M3 technical 3-period partition policy violated';
  end if;

  if exists (
    select 1
    from public.course_requirements
    where term_status = 'ACTIVE'
      and course_character in ('REPERTOIRE', 'REHEARSAL')
      and weekly_load >= 3
      and (preferred_partition ->> 0)::integer <> 3
  ) then
    raise exception 'M3 long-block repertoire/rehearsal policy violated';
  end if;

  select count(*) into revision_count from public.schedule_revisions;
  select count(*) into card_count from public.schedule_cards;

  if revision_count <> 1 then
    raise exception 'M3 expected exactly one schedule revision, found %', revision_count;
  end if;

  if card_count = 0 then
    raise exception 'M3 produced no schedule cards';
  end if;

  if exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M3 must not create placements or move transactions';
  end if;

  select count(*)
  into published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if published_session_count <> 517 then
    raise exception 'M3 published schedule session count changed unexpectedly: %', published_session_count;
  end if;

  select count(*)
  into source_evidence_count
  from public.course_requirement_source_sessions;

  if source_evidence_count <> 517 then
    raise exception 'M3 source evidence count changed unexpectedly: %', source_evidence_count;
  end if;

  update public.schedule_revisions
  set validation_summary = validation_summary || jsonb_build_object(
    'card_count', card_count,
    'active_weekly_load', active_load,
    'card_duration_total', card_load,
    'card_generation', 'PASS'
  )
  where version_number = 1
    and status = 'DRAFT';
end
$$;

commit;

-- Management v0.1 / M2.2
-- Observed requirement bootstrap from the current published 2026-2027 schedule.
-- This creates a DRAFT evidence set only. It does not create schedule revisions,
-- cards, placements, or change the published schedule projection.

begin;

alter table public.instructional_groups
  add column audience_target text null,
  add column subgroup_label text null;

alter table public.instructional_groups
  add constraint instructional_groups_audience_target_check
    check (
      audience_target is null
      or audience_target in ('SECTION', 'BALLET', 'MUSIC')
    ),
  add constraint instructional_groups_shape_check
    check (
      (
        group_type = 'COMPOSITE'
        and audience_target is null
        and subgroup_label is null
      )
      or (
        group_type = 'SECTION'
        and audience_target = 'SECTION'
        and subgroup_label is null
      )
      or (
        group_type = 'BALLET'
        and audience_target = 'BALLET'
        and subgroup_label is null
      )
      or (
        group_type = 'MUSIC'
        and audience_target = 'MUSIC'
        and subgroup_label is null
      )
      or (
        group_type = 'SUBGROUP'
        and audience_target in ('SECTION', 'BALLET', 'MUSIC')
        and subgroup_label is not null
        and length(btrim(subgroup_label)) > 0
      )
    );

comment on column public.instructional_groups.audience_target is
  'Projection target for concrete groups: SECTION, BALLET, MUSIC. Null for composite delivery groups.';
comment on column public.instructional_groups.subgroup_label is
  'Observed subgroup label for SUBGROUP groups; null for parent/composite groups.';

alter table public.course_requirement_teachers
  add column knowledge_status text not null default 'OBSERVED'
    check (knowledge_status in ('CONFIRMED', 'OBSERVED', 'UNKNOWN'));

alter table public.course_requirement_rooms
  add column knowledge_status text not null default 'OBSERVED'
    check (knowledge_status in ('CONFIRMED', 'OBSERVED', 'UNKNOWN'));

create table public.course_requirement_source_sessions (
  requirement_id uuid not null
    references public.course_requirements(id) on delete cascade,
  source_session_id uuid not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (requirement_id, source_session_id),
  constraint course_requirement_source_sessions_evidence_object
    check (jsonb_typeof(evidence) = 'object')
);

create index course_requirement_source_sessions_source_idx
  on public.course_requirement_source_sessions (source_session_id);

alter table public.course_requirement_source_sessions enable row level security;
revoke insert, update, delete
  on public.course_requirement_source_sessions
  from anon;

comment on table public.course_requirement_source_sessions is
  'Historical evidence for OBSERVED requirements. source_session_id intentionally has no FK because published projection rows may later be replaced.';

-- Lock this bootstrap to the exact published snapshot already validated in M1.
do $$
declare
  schedule_count integer;
  session_group_count integer;
  class_group_count integer;
  unexpected_session_types text[];
  unexpected_targets text[];
  uncovered_sessions integer;
begin
  if exists (select 1 from public.requirement_sets) then
    raise exception 'M2.2 bootstrap requires an empty management requirement domain';
  end if;

  select count(*) into schedule_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*) into session_group_count
  from public.session_groups sg
  join public.schedule_sessions ss on ss.id = sg.session_id
  where ss.academic_year = '2026-2027';

  select count(*) into class_group_count
  from public.class_groups
  where academic_year = '2026-2027';

  if schedule_count <> 517 then
    raise exception 'M2.2 expected 517 published sessions, found %', schedule_count;
  end if;

  if session_group_count <> 609 then
    raise exception 'M2.2 expected 609 session-group rows, found %', session_group_count;
  end if;

  if class_group_count <> 16 then
    raise exception 'M2.2 expected 16 class groups, found %', class_group_count;
  end if;

  select array_agg(distinct session_type order by session_type)
  into unexpected_session_types
  from public.schedule_sessions
  where academic_year = '2026-2027'
    and session_type not in ('STANDARD', 'SHARED', 'PARALLEL');

  if unexpected_session_types is not null then
    raise exception 'M2.2 unexpected session types: %', unexpected_session_types;
  end if;

  select array_agg(distinct sg.target order by sg.target)
  into unexpected_targets
  from public.session_groups sg
  join public.schedule_sessions ss on ss.id = sg.session_id
  where ss.academic_year = '2026-2027'
    and sg.target not in ('SECTION', 'BALLET', 'MUSIC');

  if unexpected_targets is not null then
    raise exception 'M2.2 unexpected audience targets: %', unexpected_targets;
  end if;

  select count(*)
  into uncovered_sessions
  from public.schedule_sessions ss
  where ss.academic_year = '2026-2027'
    and not exists (
      select 1
      from public.session_groups sg
      where sg.session_id = ss.id
    );

  if uncovered_sessions <> 0 then
    raise exception 'M2.2 found % published sessions without participant groups', uncovered_sessions;
  end if;
end
$$;

insert into public.requirement_sets (
  academic_year,
  term,
  version_number,
  status
)
values (
  '2026-2027',
  1,
  1,
  'DRAFT'
);

-- Administrative SECTION groups are canonical; discipline/subgroup membership is
-- observed from the current published timetable and remains explicitly OBSERVED.
insert into public.instructional_groups (
  requirement_set_id,
  class_group_id,
  name,
  group_type,
  term_status,
  knowledge_status,
  audience_target,
  subgroup_label
)
select
  rs.id,
  cg.id,
  cg.grade::text || cg.section || ' SECTION',
  'SECTION',
  'ACTIVE',
  'CONFIRMED',
  'SECTION',
  null
from public.requirement_sets rs
join public.class_groups cg
  on cg.academic_year = rs.academic_year
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1;

insert into public.instructional_groups (
  requirement_set_id,
  class_group_id,
  name,
  group_type,
  term_status,
  knowledge_status,
  audience_target,
  subgroup_label
)
select distinct
  rs.id,
  cg.id,
  cg.grade::text || cg.section || ' ' ||
    case sg.target
      when 'BALLET' then 'BALLET'
      when 'MUSIC' then 'MUSIC'
    end,
  case sg.target
    when 'BALLET' then 'BALLET'
    when 'MUSIC' then 'MUSIC'
  end,
  'ACTIVE',
  'OBSERVED',
  case sg.target
    when 'BALLET' then 'BALLET'
    when 'MUSIC' then 'MUSIC'
  end,
  null
from public.requirement_sets rs
join public.schedule_sessions ss
  on ss.academic_year = rs.academic_year
join public.session_groups sg
  on sg.session_id = ss.id
join public.class_groups cg
  on cg.id = sg.class_group_id
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1
  and sg.target in ('BALLET', 'MUSIC');

insert into public.instructional_groups (
  requirement_set_id,
  class_group_id,
  name,
  group_type,
  term_status,
  knowledge_status,
  audience_target,
  subgroup_label
)
select distinct
  rs.id,
  cg.id,
  cg.grade::text || cg.section || ' ' ||
    case sg.target
      when 'SECTION' then 'SECTION'
      when 'BALLET' then 'BALLET'
      when 'MUSIC' then 'MUSIC'
    end ||
    ' / ' || btrim(sg.subgroup),
  'SUBGROUP',
  'ACTIVE',
  'OBSERVED',
  case sg.target
    when 'SECTION' then 'SECTION'
    when 'BALLET' then 'BALLET'
    when 'MUSIC' then 'MUSIC'
  end,
  btrim(sg.subgroup)
from public.requirement_sets rs
join public.schedule_sessions ss
  on ss.academic_year = rs.academic_year
join public.session_groups sg
  on sg.session_id = ss.id
join public.class_groups cg
  on cg.id = sg.class_group_id
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1
  and nullif(btrim(sg.subgroup), '') is not null;

-- Parent SECTION contains observed discipline groups.
insert into public.instructional_group_relations (
  left_group_id,
  right_group_id,
  relation
)
select
  section_group.id,
  child.id,
  'CONTAINS'
from public.instructional_groups section_group
join public.instructional_groups child
  on child.requirement_set_id = section_group.requirement_set_id
 and child.class_group_id = section_group.class_group_id
where section_group.group_type = 'SECTION'
  and child.group_type in ('BALLET', 'MUSIC')
on conflict do nothing;

-- Concrete target parents contain their subgroups.
insert into public.instructional_group_relations (
  left_group_id,
  right_group_id,
  relation
)
select
  parent.id,
  subgroup.id,
  'CONTAINS'
from public.instructional_groups subgroup
join public.instructional_groups parent
  on parent.requirement_set_id = subgroup.requirement_set_id
 and parent.class_group_id = subgroup.class_group_id
 and parent.audience_target = subgroup.audience_target
 and parent.subgroup_label is null
where subgroup.group_type = 'SUBGROUP'
  and (
    (subgroup.audience_target = 'SECTION' and parent.group_type = 'SECTION')
    or (subgroup.audience_target = 'BALLET' and parent.group_type = 'BALLET')
    or (subgroup.audience_target = 'MUSIC' and parent.group_type = 'MUSIC')
  )
on conflict do nothing;

-- BALLET and MUSIC are disjoint participant sets within the same class group.
insert into public.instructional_group_relations (
  left_group_id,
  right_group_id,
  relation
)
select
  ballet.id,
  music.id,
  'DISJOINT'
from public.instructional_groups ballet
join public.instructional_groups music
  on music.requirement_set_id = ballet.requirement_set_id
 and music.class_group_id = ballet.class_group_id
where ballet.group_type = 'BALLET'
  and music.group_type = 'MUSIC'
on conflict do nothing;

create temporary table m2_session_members on commit drop as
select
  sg.session_id,
  ig.id as member_group_id,
  ig.name as member_name
from public.session_groups sg
join public.schedule_sessions ss
  on ss.id = sg.session_id
join public.instructional_groups ig
  on ig.class_group_id = sg.class_group_id
 and ig.audience_target = case sg.target
   when 'SECTION' then 'SECTION'
   when 'BALLET' then 'BALLET'
   when 'MUSIC' then 'MUSIC'
 end
 and (
   (
     nullif(btrim(sg.subgroup), '') is null
     and ig.subgroup_label is null
     and ig.group_type = case sg.target
       when 'SECTION' then 'SECTION'
       when 'BALLET' then 'BALLET'
       when 'MUSIC' then 'MUSIC'
     end
   )
   or (
     nullif(btrim(sg.subgroup), '') is not null
     and ig.group_type = 'SUBGROUP'
     and ig.subgroup_label = btrim(sg.subgroup)
   )
 )
where ss.academic_year = '2026-2027';

do $$
declare
  mapped_members integer;
  mapped_sessions integer;
begin
  select count(*) into mapped_members from m2_session_members;
  select count(distinct session_id) into mapped_sessions from m2_session_members;

  if mapped_members <> 609 then
    raise exception 'M2.2 expected 609 mapped participant rows, found %', mapped_members;
  end if;

  if mapped_sessions <> 517 then
    raise exception 'M2.2 expected all 517 sessions to map to participant groups, found %', mapped_sessions;
  end if;
end
$$;

create temporary table m2_session_shapes on commit drop as
select
  ss.id as session_id,
  ss.subject_id,
  ss.teacher_id,
  ss.room_id,
  ss.session_type,
  count(sm.member_group_id)::integer as member_count,
  string_agg(sm.member_group_id::text, '|' order by sm.member_group_id::text) as member_signature,
  string_agg(sm.member_name, ' + ' order by sm.member_name) as member_names
from public.schedule_sessions ss
join m2_session_members sm
  on sm.session_id = ss.id
where ss.academic_year = '2026-2027'
group by
  ss.id,
  ss.subject_id,
  ss.teacher_id,
  ss.room_id,
  ss.session_type;

-- SHARED/PARALLEL delivery always receives an explicit composite wrapper.
-- STANDARD sessions receive a wrapper only if source data associates more than one participant group.
insert into public.instructional_groups (
  requirement_set_id,
  class_group_id,
  name,
  group_type,
  term_status,
  knowledge_status,
  audience_target,
  subgroup_label
)
select distinct
  rs.id,
  null::uuid,
  shape.session_type || ' • ' || shape.member_names,
  'COMPOSITE',
  'ACTIVE',
  'OBSERVED',
  null,
  null
from m2_session_shapes shape
cross join public.requirement_sets rs
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1
  and (shape.session_type <> 'STANDARD' or shape.member_count <> 1);

insert into public.instructional_group_relations (
  left_group_id,
  right_group_id,
  relation
)
select distinct
  composite.id,
  sm.member_group_id,
  'CONTAINS'
from m2_session_shapes shape
join m2_session_members sm
  on sm.session_id = shape.session_id
join public.instructional_groups composite
  on composite.group_type = 'COMPOSITE'
 and composite.name = shape.session_type || ' • ' || shape.member_names
where shape.session_type <> 'STANDARD'
   or shape.member_count <> 1
on conflict do nothing;

create temporary table m2_effective_sessions on commit drop as
select
  shape.session_id,
  shape.subject_id,
  shape.teacher_id,
  shape.room_id,
  coalesce(room.canonical_room_id, shape.room_id) as effective_room_id,
  shape.session_type,
  case
    when shape.session_type <> 'STANDARD' or shape.member_count <> 1
      then composite.id
    else single_member.member_group_id
  end as effective_group_id,
  shape.member_names
from m2_session_shapes shape
left join public.rooms room
  on room.id = shape.room_id
left join m2_session_members single_member
  on single_member.session_id = shape.session_id
 and shape.member_count = 1
left join public.instructional_groups composite
  on composite.group_type = 'COMPOSITE'
 and composite.name = shape.session_type || ' • ' || shape.member_names;

do $$
declare
  missing_effective_groups integer;
begin
  select count(*)
  into missing_effective_groups
  from m2_effective_sessions
  where effective_group_id is null;

  if missing_effective_groups <> 0 then
    raise exception 'M2.2 found % sessions without an effective instructional group', missing_effective_groups;
  end if;
end
$$;

with aggregated as (
  select
    es.effective_group_id,
    es.subject_id,
    es.session_type,
    count(*)::smallint as weekly_load,
    count(*) filter (where es.teacher_id is null) as null_teacher_count,
    count(distinct es.teacher_id) filter (where es.teacher_id is not null) as teacher_count,
    count(*) filter (where es.room_id is null) as null_room_count,
    count(distinct es.effective_room_id) filter (where es.effective_room_id is not null) as room_count
  from m2_effective_sessions es
  group by
    es.effective_group_id,
    es.subject_id,
    es.session_type
)
insert into public.course_requirements (
  requirement_set_id,
  subject_id,
  instructional_group_id,
  weekly_load,
  preferred_partition,
  allowed_partitions,
  min_distinct_days,
  max_blocks_per_day,
  max_consecutive_periods,
  course_character,
  term_status,
  knowledge_status,
  teacher_mode,
  resource_mode,
  required_capability,
  delivery_mode
)
select
  rs.id,
  agg.subject_id,
  agg.effective_group_id,
  agg.weekly_load,
  '[]'::jsonb,
  '[]'::jsonb,
  null::smallint,
  null::smallint,
  null::smallint,
  case
    when subject.name in (
      'K. Bale',
      'Point',
      'Point/Dans T.',
      'Dans T.',
      'Ritmik',
      'V.Kondisyon',
      'Pilates',
      'Modern Dans'
    ) then 'TECHNIQUE'
    when subject.name = 'Repertuvar' then 'REPERTOIRE'
    when subject.name = 'B. Uygulama' then 'REHEARSAL'
    else 'OTHER'
  end,
  case
    -- Grade-5 B.Uyg is a confirmed term-level inactive overlay.
    -- Keep its observed structural weekly load but do not treat it as active.
    when subject.name = 'B. Uygulama'
      and class_group.grade = 5
      and effective_group.group_type <> 'COMPOSITE'
      then 'INACTIVE'
    else 'ACTIVE'
  end,
  'OBSERVED',
  case
    when agg.null_teacher_count = 0 and agg.teacher_count = 1 then 'FIXED'
    when agg.null_teacher_count = 0 and agg.teacher_count > 1 then 'ELIGIBLE_POOL'
    else 'UNKNOWN'
  end,
  case
    when agg.null_room_count = 0 and agg.room_count = 1 then 'FIXED'
    when agg.null_room_count = 0 and agg.room_count > 1 then 'ELIGIBLE_POOL'
    else 'UNKNOWN'
  end,
  null::text,
  agg.session_type
from aggregated agg
cross join public.requirement_sets rs
join public.instructional_groups effective_group
  on effective_group.id = agg.effective_group_id
left join public.class_groups class_group
  on class_group.id = effective_group.class_group_id
join public.subjects subject
  on subject.id = agg.subject_id
where rs.academic_year = '2026-2027'
  and rs.term = 1
  and rs.version_number = 1;

-- Preserve only observed teacher choices. UNKNOWN requirements intentionally have no rows.
insert into public.course_requirement_teachers (
  requirement_id,
  teacher_id,
  knowledge_status
)
select distinct
  requirement.id,
  es.teacher_id,
  'OBSERVED'
from public.course_requirements requirement
join m2_effective_sessions es
  on es.effective_group_id = requirement.instructional_group_id
 and es.subject_id = requirement.subject_id
 and es.session_type::text = requirement.delivery_mode
where requirement.teacher_mode <> 'UNKNOWN'
  and es.teacher_id is not null;

-- Canonical room IDs are stored for observed room choices. UNKNOWN requirements intentionally have no rows.
insert into public.course_requirement_rooms (
  requirement_id,
  room_id,
  knowledge_status
)
select distinct
  requirement.id,
  es.effective_room_id,
  'OBSERVED'
from public.course_requirements requirement
join m2_effective_sessions es
  on es.effective_group_id = requirement.instructional_group_id
 and es.subject_id = requirement.subject_id
 and es.session_type::text = requirement.delivery_mode
where requirement.resource_mode <> 'UNKNOWN'
  and es.effective_room_id is not null;

insert into public.course_requirement_source_sessions (
  requirement_id,
  source_session_id,
  evidence
)
select
  requirement.id,
  es.session_id,
  jsonb_build_object(
    'academic_year', ss.academic_year,
    'day_of_week', ss.day_of_week,
    'start_time', ss.start_time,
    'end_time', ss.end_time,
    'session_type', ss.session_type,
    'teacher_id', ss.teacher_id,
    'room_id', ss.room_id,
    'participant_groups', es.member_names
  )
from public.course_requirements requirement
join m2_effective_sessions es
  on es.effective_group_id = requirement.instructional_group_id
 and es.subject_id = requirement.subject_id
 and es.session_type::text = requirement.delivery_mode
join public.schedule_sessions ss
  on ss.id = es.session_id;

-- Final invariant checks.
do $$
declare
  evidence_rows integer;
  evidence_sessions integer;
  requirement_rows integer;
  requirements_without_evidence integer;
  active_grade5_buyg integer;
  schedule_count integer;
  session_group_count integer;
begin
  select count(*) into evidence_rows
  from public.course_requirement_source_sessions;

  select count(distinct source_session_id) into evidence_sessions
  from public.course_requirement_source_sessions;

  select count(*) into requirement_rows
  from public.course_requirements;

  select count(*)
  into requirements_without_evidence
  from public.course_requirements requirement
  where not exists (
    select 1
    from public.course_requirement_source_sessions evidence
    where evidence.requirement_id = requirement.id
  );

  select count(*)
  into active_grade5_buyg
  from public.course_requirements requirement
  join public.subjects subject on subject.id = requirement.subject_id
  join public.instructional_groups ig on ig.id = requirement.instructional_group_id
  join public.class_groups cg on cg.id = ig.class_group_id
  where subject.name = 'B. Uygulama'
    and cg.grade = 5
    and requirement.term_status = 'ACTIVE';

  select count(*) into schedule_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*) into session_group_count
  from public.session_groups sg
  join public.schedule_sessions ss on ss.id = sg.session_id
  where ss.academic_year = '2026-2027';

  if requirement_rows = 0 then
    raise exception 'M2.2 produced no observed requirements';
  end if;

  if evidence_rows <> 517 or evidence_sessions <> 517 then
    raise exception 'M2.2 evidence coverage mismatch: rows %, distinct sessions %', evidence_rows, evidence_sessions;
  end if;

  if requirements_without_evidence <> 0 then
    raise exception 'M2.2 found % requirements without source evidence', requirements_without_evidence;
  end if;

  if active_grade5_buyg <> 0 then
    raise exception 'M2.2 grade-5 B.Uyg must not be active in the current term';
  end if;

  if schedule_count <> 517 or session_group_count <> 609 then
    raise exception 'M2.2 modified the published schedule projection unexpectedly';
  end if;

  if exists (select 1 from public.schedule_revisions)
     or exists (select 1 from public.schedule_cards)
     or exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M2.2 must not create revision/card/placement/transaction rows';
  end if;
end
$$;

commit;

-- Management v0.1 / M2.1
-- Resource reconciliation + explicit delivery semantics.
-- Additive only. No schedule session/group mutation.

begin;

alter table public.course_requirements
  add column delivery_mode text not null default 'STANDARD'
  check (delivery_mode in ('STANDARD', 'SHARED', 'PARALLEL'));

comment on column public.course_requirements.delivery_mode is
  'Observed/confirmed teaching delivery semantics for future projection: STANDARD, SHARED, PARALLEL.';

comment on column public.rooms.capabilities is
  'Resource capabilities. In M2.1 values are OBSERVED evidence only unless knowledge_status is CONFIRMED.';

-- Fail fast if the expected live room vocabulary is not present.
do $$
declare
  missing_names text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing_names
  from (
    values
      ('A 101'),
      ('A 105'),
      ('A 106'),
      ('A Salon'),
      ('A-101'),
      ('A-105'),
      ('A105'),
      ('B Salon'),
      ('B1 102'),
      ('B1 104'),
      ('B1 105A'),
      ('B1 105B'),
      ('B1 106'),
      ('B1 206'),
      ('B1-102'),
      ('B1-105A'),
      ('B1206'),
      ('C 109'),
      ('C Salon'),
      ('C-109'),
      ('D Salon'),
      ('SEM')
  ) as expected(name)
  left join public.rooms r on r.name = expected.name
  where r.id is null;

  if missing_names is not null then
    raise exception 'M2.1 expected room names missing: %', missing_names;
  end if;
end
$$;

-- Safe lexical aliases only. These mappings are observed evidence and do not
-- rewrite existing schedule_sessions.room_id values.
update public.rooms alias
set
  canonical_room_id = canonical.id,
  knowledge_status = case
    when alias.knowledge_status = 'CONFIRMED' then 'CONFIRMED'
    else 'OBSERVED'
  end
from public.rooms canonical
where
  (alias.name, canonical.name) in (
    ('A-101', 'A 101'),
    ('A-105', 'A 105'),
    ('A105', 'A 105'),
    ('B1-102', 'B1 102'),
    ('B1-105A', 'B1 105A'),
    ('C-109', 'C 109')
  );

-- Observed capabilities mined from the currently published timetable.
-- OBSERVED must not be interpreted as a hard solver permission.
update public.rooms
set
  capabilities = case name
    when 'A 101' then array['GENERAL_CLASSROOM', 'MUSIC_THEORY']::text[]
    when 'A 105' then array['GENERAL_CLASSROOM', 'INSTRUMENT_RELATED', 'MUSIC_THEORY', 'SOLFEGE']::text[]
    when 'A 106' then array['GENERAL_CLASSROOM']::text[]
    when 'B1 102' then array['GENERAL_CLASSROOM', 'RHYTHMIC', 'SOLFEGE']::text[]
    when 'B1 104' then array['GENERAL_CLASSROOM']::text[]
    when 'B1 105A' then array['GENERAL_CLASSROOM']::text[]
    when 'B1 105B' then array['GENERAL_CLASSROOM']::text[]
    when 'B1 106' then array['GENERAL_CLASSROOM']::text[]
    when 'C 109' then array['GENERAL_CLASSROOM', 'MUSIC_THEORY', 'SOLFEGE']::text[]
    when 'A Salon' then array['CLASSICAL_BALLET', 'DANCE_TECHNIQUE', 'POINT_DANCE_TECHNIQUE', 'REPERTOIRE']::text[]
    when 'B Salon' then array['CLASSICAL_BALLET', 'DANCE_TECHNIQUE', 'POINT_DANCE_TECHNIQUE', 'REPERTOIRE']::text[]
    when 'C Salon' then array['CLASSICAL_BALLET', 'DANCE_TECHNIQUE', 'POINT_DANCE_TECHNIQUE', 'REPERTOIRE']::text[]
    when 'D Salon' then array['CLASSICAL_BALLET', 'DANCE_TECHNIQUE', 'POINT_DANCE_TECHNIQUE', 'REPERTOIRE']::text[]
    else capabilities
  end,
  knowledge_status = case
    when knowledge_status = 'CONFIRMED' then 'CONFIRMED'
    when name in (
      'A 101', 'A 105', 'A 106', 'A Salon', 'B Salon',
      'B1 102', 'B1 104', 'B1 105A', 'B1 105B', 'B1 106',
      'C 109', 'C Salon', 'D Salon'
    ) then 'OBSERVED'
    else knowledge_status
  end
where name in (
  'A 101', 'A 105', 'A 106', 'A Salon', 'B Salon',
  'B1 102', 'B1 104', 'B1 105A', 'B1 105B', 'B1 106',
  'C 109', 'C Salon', 'D Salon'
);

-- Preserve unresolved resources explicitly.
update public.rooms
set knowledge_status = coalesce(knowledge_status, 'UNKNOWN')
where name in ('B1 206', 'B1206', 'SEM');

-- Guardrails: ambiguous labels must remain separate/unmapped.
do $$
declare
  mapped_ambiguous integer;
  alias_failures integer;
begin
  select count(*)
  into mapped_ambiguous
  from public.rooms
  where name in ('B1 206', 'B1206')
    and canonical_room_id is not null;

  if mapped_ambiguous <> 0 then
    raise exception 'M2.1 must not canonicalize B1 206/B1206';
  end if;

  select count(*)
  into alias_failures
  from (
    values
      ('A-101', 'A 101'),
      ('A-105', 'A 105'),
      ('A105', 'A 105'),
      ('B1-102', 'B1 102'),
      ('B1-105A', 'B1 105A'),
      ('C-109', 'C 109')
  ) as expected(alias_name, canonical_name)
  join public.rooms alias on alias.name = expected.alias_name
  join public.rooms canonical on canonical.name = expected.canonical_name
  where alias.canonical_room_id is distinct from canonical.id;

  if alias_failures <> 0 then
    raise exception 'M2.1 canonical room alias verification failed';
  end if;
end
$$;

commit;

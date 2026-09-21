-- Management / M18.4.1
-- Functional room capability taxonomy.
--
-- Previous capability values mixed lesson names (SOLFEGE, CLASSICAL_BALLET,
-- REPERTOIRE, etc.) with physical resource properties. This migration replaces
-- that vocabulary with a small functional room taxonomy:
--
--   GENERAL_CLASSROOM_SMALL_GROUP
--   GENERAL_CLASSROOM_LARGE_GROUP
--   STUDIO_SMALL_GROUP
--   STUDIO_LARGE_GROUP
--   INSTRUMENT_RELATED_CLASSROOM
--
-- We do NOT infer small/large capacity from historical room usage.
-- The only safe semantic mapping is:
--   INSTRUMENT_RELATED -> INSTRUMENT_RELATED_CLASSROOM
--
-- Unsupported observed capabilities are removed and their room profile falls
-- back to UNKNOWN when nothing functional remains.

begin;

-- Fail fast rather than silently rewriting any real CAPABILITY requirement
-- whose legacy meaning cannot be mapped safely.
do $$
begin
  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.resource_mode = 'CAPABILITY'
      and requirement.required_capability is not null
      and requirement.required_capability not in (
        'GENERAL_CLASSROOM_SMALL_GROUP',
        'GENERAL_CLASSROOM_LARGE_GROUP',
        'STUDIO_SMALL_GROUP',
        'STUDIO_LARGE_GROUP',
        'INSTRUMENT_RELATED_CLASSROOM',
        'INSTRUMENT_RELATED'
      )
  ) then
    raise exception
      'M18.4.1 unsupported legacy CAPABILITY requirement exists; manual reconciliation required';
  end if;
end
$$;

-- The one legacy value whose meaning maps directly.
update public.course_requirements
set required_capability = 'INSTRUMENT_RELATED_CLASSROOM'
where resource_mode = 'CAPABILITY'
  and required_capability = 'INSTRUMENT_RELATED';

-- Normalize room capability arrays. New taxonomy values survive; the old
-- INSTRUMENT_RELATED value maps forward; subject-specific legacy values are
-- intentionally dropped.
with normalized as (
  select
    room.id,
    coalesce(
      array_agg(distinct mapped.capability order by mapped.capability)
        filter (where mapped.capability is not null),
      array[]::text[]
    ) as capabilities
  from public.rooms room
  left join lateral (
    select case legacy.capability
      when 'GENERAL_CLASSROOM_SMALL_GROUP'
        then 'GENERAL_CLASSROOM_SMALL_GROUP'
      when 'GENERAL_CLASSROOM_LARGE_GROUP'
        then 'GENERAL_CLASSROOM_LARGE_GROUP'
      when 'STUDIO_SMALL_GROUP'
        then 'STUDIO_SMALL_GROUP'
      when 'STUDIO_LARGE_GROUP'
        then 'STUDIO_LARGE_GROUP'
      when 'INSTRUMENT_RELATED_CLASSROOM'
        then 'INSTRUMENT_RELATED_CLASSROOM'
      when 'INSTRUMENT_RELATED'
        then 'INSTRUMENT_RELATED_CLASSROOM'
      else null
    end as capability
    from unnest(coalesce(room.capabilities, array[]::text[]))
      as legacy(capability)
  ) mapped on true
  group by room.id
)
update public.rooms room
set
  capabilities = normalized.capabilities,
  knowledge_status = case
    when cardinality(normalized.capabilities) = 0
      and cardinality(coalesce(room.capabilities, array[]::text[])) > 0
      then 'UNKNOWN'
    else coalesce(room.knowledge_status, 'UNKNOWN')
  end
from normalized
where normalized.id = room.id
  and (
    room.capabilities is distinct from normalized.capabilities
    or (
      cardinality(normalized.capabilities) = 0
      and cardinality(coalesce(room.capabilities, array[]::text[])) > 0
      and coalesce(room.knowledge_status, 'UNKNOWN') <> 'UNKNOWN'
    )
  );

alter table public.rooms
  drop constraint if exists rooms_functional_capabilities_check;

alter table public.rooms
  add constraint rooms_functional_capabilities_check
  check (
    capabilities <@ array[
      'GENERAL_CLASSROOM_SMALL_GROUP',
      'GENERAL_CLASSROOM_LARGE_GROUP',
      'STUDIO_SMALL_GROUP',
      'STUDIO_LARGE_GROUP',
      'INSTRUMENT_RELATED_CLASSROOM'
    ]::text[]
  );

alter table public.course_requirements
  drop constraint if exists course_requirements_functional_capability_check;

alter table public.course_requirements
  add constraint course_requirements_functional_capability_check
  check (
    resource_mode <> 'CAPABILITY'
    or required_capability = any(array[
      'GENERAL_CLASSROOM_SMALL_GROUP',
      'GENERAL_CLASSROOM_LARGE_GROUP',
      'STUDIO_SMALL_GROUP',
      'STUDIO_LARGE_GROUP',
      'INSTRUMENT_RELATED_CLASSROOM'
    ]::text[])
  );

comment on column public.rooms.capabilities is
  'Functional M18.4.1 room capabilities only: general classroom/studio by small or large group, plus instrument-related classroom. Subject names are not room capabilities.';

comment on column public.course_requirements.required_capability is
  'When resource_mode=CAPABILITY, one functional M18.4.1 room capability required by the course plan.';

commit;

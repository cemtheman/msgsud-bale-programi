-- Management / M23.1
-- Curriculum Evidence Reconciliation
--
-- Corrects exact subject aliases revealed by the first live M23 diagnostic,
-- classifies the conservatory's known field-elective labels against the
-- official TTKB 62 table, and records known local term deviations without
-- pretending that a local deviation changes the official reference.
--
-- This migration is additive/read-only with respect to schedule construction:
-- no requirements, cards, placements, public sessions, or publication locks
-- are changed.

begin;


-- -------------------------------------------------------------------------
-- 1. EXACT ALIAS CORRECTIONS FROM LIVE SCHEDULE EVIDENCE
-- -------------------------------------------------------------------------

with rule_set as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
)
insert into public.curriculum_subject_aliases (
  rule_set_id,
  subject_code,
  source_subject_name
)
select
  rule_set.id,
  alias.subject_code,
  alias.source_subject_name
from rule_set
cross join (
  values
    ('DKAB'::text, 'Din Kült. ve A. Bil.'::text),
    (
      'TC_INKILAP'::text,
      'İnkılap T. ve Atatürkçülük'::text
    )
) alias(subject_code, source_subject_name)
on conflict do nothing;


-- -------------------------------------------------------------------------
-- 2. OFFICIAL SELECTABLE FIELD COURSE CATALOG
-- -------------------------------------------------------------------------
-- TTKB 62 / Tebliğler Dergisi 2803 p.1444 lists these under
-- "SEÇMELİ ALAN DERSLERİ". M23.1 does not infer a per-course compulsory load;
-- the official grade total is four selectable hours.

create table public.curriculum_elective_catalog (
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete cascade,
  elective_code text not null,
  elective_label text not null,
  elective_group text not null
    check (
      elective_group in (
        'FIELD',
        'HUMAN_SOCIETY_SCIENCE',
        'RELIGION_ETHICS_VALUES',
        'CULTURE_ART_SPORT'
      )
    ),
  source_label text not null,
  created_at timestamptz not null default now(),
  primary key (rule_set_id, elective_code),
  constraint curriculum_elective_catalog_not_blank
    check (
      length(btrim(elective_code)) > 0
      and length(btrim(elective_label)) > 0
      and length(btrim(source_label)) > 0
    )
);

create table public.curriculum_elective_subject_mappings (
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete cascade,
  source_subject_name text not null,
  mapping_status text not null
    check (
      mapping_status in (
        'EXACT',
        'COMPOSITE',
        'PROVISIONAL'
      )
    ),
  canonical_codes text[] not null,
  note text null,
  created_at timestamptz not null default now(),
  primary key (rule_set_id, source_subject_name),
  constraint curriculum_elective_subject_mappings_codes
    check (cardinality(canonical_codes) > 0)
);

alter table public.curriculum_elective_catalog
  enable row level security;
alter table public.curriculum_elective_subject_mappings
  enable row level security;

revoke insert, update, delete
  on public.curriculum_elective_catalog
  from anon, authenticated;
revoke insert, update, delete
  on public.curriculum_elective_subject_mappings
  from anon, authenticated;

grant select
  on public.curriculum_elective_catalog
  to authenticated;
grant select
  on public.curriculum_elective_subject_mappings
  to authenticated;

create policy curriculum_elective_catalog_read
  on public.curriculum_elective_catalog
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy curriculum_elective_subject_mappings_read
  on public.curriculum_elective_subject_mappings
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

with rule_set as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
),
catalog (
  elective_code,
  elective_label,
  elective_group,
  source_label
) as (
  values
    (
      'DANS_TEKNIK',
      'Dans Teknik',
      'FIELD',
      'DANS TEKNİK (4)'
    ),
    (
      'TARIHI_DANSLAR',
      'Tarihi Danslar',
      'FIELD',
      'TARİHİ DANSLAR (4)'
    ),
    (
      'DANS_YAZISI',
      'Dans Yazısı',
      'FIELD',
      'DANS YAZISI (4)'
    ),
    (
      'POINT',
      'Point',
      'FIELD',
      'POINT (4)'
    ),
    (
      'RITMIK',
      'Ritmik',
      'FIELD',
      'RİTMİK (4)'
    )
)
insert into public.curriculum_elective_catalog (
  rule_set_id,
  elective_code,
  elective_label,
  elective_group,
  source_label
)
select
  rule_set.id,
  catalog.elective_code,
  catalog.elective_label,
  catalog.elective_group,
  catalog.source_label
from rule_set
cross join catalog;

with rule_set as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
),
mapping (
  source_subject_name,
  mapping_status,
  canonical_codes,
  note
) as (
  values
    (
      'Point'::text,
      'EXACT'::text,
      array['POINT']::text[],
      null::text
    ),
    (
      'Ritmik'::text,
      'EXACT'::text,
      array['RITMIK']::text[],
      null::text
    ),
    (
      'Dans T.'::text,
      'PROVISIONAL'::text,
      array['DANS_TEKNIK']::text[],
      'Current abbreviation is treated as a known field-elective label for quota evidence; exact canonical expansion should be confirmed in management data.'
    ),
    (
      'Point/Dans T.'::text,
      'COMPOSITE'::text,
      array['POINT', 'DANS_TEKNIK']::text[],
      'Combined current timetable label. Counts toward known field-elective hours but is not forced to one canonical elective course.'
    )
)
insert into public.curriculum_elective_subject_mappings (
  rule_set_id,
  source_subject_name,
  mapping_status,
  canonical_codes,
  note
)
select
  rule_set.id,
  mapping.source_subject_name,
  mapping.mapping_status,
  mapping.canonical_codes,
  mapping.note
from rule_set
cross join mapping;


-- -------------------------------------------------------------------------
-- 3. KNOWN LOCAL TERM DEVIATIONS
-- -------------------------------------------------------------------------

create table public.curriculum_local_exceptions (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  program_code text not null,
  grade smallint not null check (grade between 5 and 12),
  subject_code text not null,
  exception_type text not null
    check (
      exception_type in (
        'TERM_LOCAL_DEVIATION',
        'INSTITUTIONAL_CONFIRMATION_PENDING'
      )
    ),
  note text not null,
  does_not_override_reference boolean not null default true,
  created_at timestamptz not null default now(),
  constraint curriculum_local_exceptions_unique
    unique (
      requirement_set_id,
      program_code,
      grade,
      subject_code,
      exception_type
    )
);

alter table public.curriculum_local_exceptions
  enable row level security;

revoke insert, update, delete
  on public.curriculum_local_exceptions
  from anon, authenticated;

grant select
  on public.curriculum_local_exceptions
  to authenticated;

create policy curriculum_local_exceptions_read
  on public.curriculum_local_exceptions
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

insert into public.curriculum_local_exceptions (
  requirement_set_id,
  program_code,
  grade,
  subject_code,
  exception_type,
  note,
  does_not_override_reference
)
select
  requirement_set.id,
  'BALLET',
  5,
  'BIRLIKTE_UYGULAMA',
  'TERM_LOCAL_DEVIATION',
  '5. sınıflarda Birlikte Uygulama bu dönem boyunca uygulanmıyor. Bu kayıt yerel uygulamayı açıklar; TTKB 62 referansındaki 3 saatlik zorunlu yükü MATCH olarak yeniden sınıflandırmaz.',
  true
from public.requirement_sets requirement_set
where requirement_set.academic_year = '2026-2027'
  and requirement_set.term = 1
  and requirement_set.status = 'DRAFT';


-- -------------------------------------------------------------------------
-- 4. FIELD-ELECTIVE QUOTA EVIDENCE ENGINE
-- -------------------------------------------------------------------------

create or replace function public.management_curriculum_elective_evidence_internal(
  p_schedule_revision_id uuid,
  p_program_code text
)
returns table (
  class_group_id uuid,
  class_code text,
  grade smallint,
  section text,
  official_elective_weekly_load smallint,
  known_field_elective_min_weekly_load integer,
  known_field_elective_max_weekly_load integer,
  subgroup_count integer,
  evidence_status text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with revision_meta as (
    select
      revision.requirement_set_id
    from public.schedule_revisions revision
    where revision.id = p_schedule_revision_id
      and revision.status = 'DRAFT'
  ),
  binding as (
    select
      binding.requirement_set_id,
      binding.rule_set_id
    from public.curriculum_requirement_set_bindings binding
    join revision_meta revision
      on revision.requirement_set_id =
        binding.requirement_set_id
    where binding.program_code = p_program_code
      and binding.applicability_status in (
        'REFERENCE',
        'CONFIRMED'
      )
  ),
  ballet_classes as (
    select distinct
      class_group.id as class_group_id,
      (
        class_group.grade::text
        || class_group.section
      )::text as class_code,
      class_group.grade::smallint as grade,
      class_group.section::text as section
    from revision_meta revision
    join public.instructional_groups instructional_group
      on instructional_group.requirement_set_id =
        revision.requirement_set_id
    join public.class_groups class_group
      on class_group.id =
        instructional_group.class_group_id
    where p_program_code = 'BALLET'
      and instructional_group.audience_target = 'BALLET'
      and instructional_group.term_status = 'ACTIVE'
      and class_group.grade between 5 and 8
  ),
  mapped_requirements as (
    select
      requirement.id as requirement_id,
      requirement.weekly_load::integer as weekly_load
    from revision_meta revision
    join public.course_requirements requirement
      on requirement.requirement_set_id =
        revision.requirement_set_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join binding
      on binding.requirement_set_id =
        revision.requirement_set_id
    join public.curriculum_elective_subject_mappings mapping
      on mapping.rule_set_id = binding.rule_set_id
     and mapping.source_subject_name = subject.name
    where requirement.term_status = 'ACTIVE'
  ),
  members as (
    select distinct
      requirement.requirement_id,
      requirement.weekly_load,
      member.class_group_id,
      member.subgroup
    from mapped_requirements requirement
    cross join lateral
      public.management_requirement_public_members(
        requirement.requirement_id
      ) member
    join ballet_classes class_track
      on class_track.class_group_id =
        member.class_group_id
    where member.target in ('SECTION', 'BALLET')
  ),
  common_requirements as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.weekly_load
    from members member
    where member.subgroup is null
  ),
  common_load as (
    select
      common.class_group_id,
      sum(common.weekly_load)::integer as weekly_load
    from common_requirements common
    group by common.class_group_id
  ),
  subgroup_requirements as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.subgroup,
      member.weekly_load
    from members member
    where member.subgroup is not null
  ),
  subgroup_load as (
    select
      subgroup.class_group_id,
      subgroup.subgroup,
      sum(subgroup.weekly_load)::integer as weekly_load
    from subgroup_requirements subgroup
    group by
      subgroup.class_group_id,
      subgroup.subgroup
  ),
  subgroup_stats as (
    select
      subgroup.class_group_id,
      min(subgroup.weekly_load)::integer as min_load,
      max(subgroup.weekly_load)::integer as max_load,
      count(*)::integer as subgroup_count
    from subgroup_load subgroup
    group by subgroup.class_group_id
  )
  select
    class_track.class_group_id,
    class_track.class_code,
    class_track.grade,
    class_track.section,
    grade_total.elective_weekly_load,
    (
      coalesce(common.weekly_load, 0)
      + coalesce(subgroup.min_load, 0)
    )::integer,
    (
      coalesce(common.weekly_load, 0)
      + coalesce(subgroup.max_load, 0)
    )::integer,
    coalesce(subgroup.subgroup_count, 0)::integer,
    case
      when (
        coalesce(common.weekly_load, 0)
        + coalesce(subgroup.min_load, 0)
      ) = grade_total.elective_weekly_load
       and (
        coalesce(common.weekly_load, 0)
        + coalesce(subgroup.max_load, 0)
      ) = grade_total.elective_weekly_load
        then 'MATCH'
      when (
        coalesce(common.weekly_load, 0)
        + coalesce(subgroup.min_load, 0)
      ) > grade_total.elective_weekly_load
        then 'OVER'
      when (
        coalesce(common.weekly_load, 0)
        + coalesce(subgroup.max_load, 0)
      ) < grade_total.elective_weekly_load
        then 'UNDER'
      else 'VARIES'
    end::text
  from ballet_classes class_track
  join binding on true
  join public.curriculum_grade_totals grade_total
    on grade_total.rule_set_id = binding.rule_set_id
   and grade_total.grade = class_track.grade
  left join common_load common
    on common.class_group_id = class_track.class_group_id
  left join subgroup_stats subgroup
    on subgroup.class_group_id = class_track.class_group_id
  order by
    class_track.grade,
    class_track.section
$$;

revoke all
  on function public.management_curriculum_elective_evidence_internal(
    uuid,
    text
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- 5. EXTEND THE EXISTING M23 DIAGNOSTIC WITHOUT WEAKENING AUTH
-- -------------------------------------------------------------------------

alter function public.management_curriculum_compliance_status(
  uuid,
  text
)
rename to management_curriculum_compliance_status_m23;

revoke all
  on function public.management_curriculum_compliance_status_m23(
    uuid,
    text
  )
  from public, anon, authenticated;

create or replace function public.management_curriculum_compliance_status(
  p_schedule_revision_id uuid,
  p_program_code text default 'BALLET'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_revision record;
  v_rule_set_id uuid;
  v_elective_evidence jsonb;
  v_local_exceptions jsonb;
  v_unclassified jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M23.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_curriculum_compliance_status_m23(
      p_schedule_revision_id,
      p_program_code
    );

  select
    revision.requirement_set_id,
    binding.rule_set_id
  into
    v_revision.requirement_set_id,
    v_rule_set_id
  from public.schedule_revisions revision
  join public.curriculum_requirement_set_bindings binding
    on binding.requirement_set_id =
      revision.requirement_set_id
   and binding.program_code = p_program_code
   and binding.applicability_status in (
     'REFERENCE',
     'CONFIRMED'
   )
  where revision.id = p_schedule_revision_id;

  if v_revision.requirement_set_id is null then
    raise exception
      'M23.1 no active curriculum binding for revision %',
      p_schedule_revision_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classGroupId', evidence.class_group_id,
        'classCode', evidence.class_code,
        'grade', evidence.grade,
        'section', evidence.section,
        'officialElectiveWeeklyLoad',
          evidence.official_elective_weekly_load,
        'knownFieldElectiveMinWeeklyLoad',
          evidence.known_field_elective_min_weekly_load,
        'knownFieldElectiveMaxWeeklyLoad',
          evidence.known_field_elective_max_weekly_load,
        'subgroupCount', evidence.subgroup_count,
        'status', evidence.evidence_status
      )
      order by evidence.grade, evidence.section
    ),
    '[]'::jsonb
  )
  into v_elective_evidence
  from public.management_curriculum_elective_evidence_internal(
    p_schedule_revision_id,
    p_program_code
  ) evidence;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grade', exception.grade,
        'subjectCode', exception.subject_code,
        'exceptionType', exception.exception_type,
        'note', exception.note,
        'doesNotOverrideReference',
          exception.does_not_override_reference
      )
      order by exception.grade, exception.subject_code
    ),
    '[]'::jsonb
  )
  into v_local_exceptions
  from public.curriculum_local_exceptions exception
  where exception.requirement_set_id =
      v_revision.requirement_set_id
    and exception.program_code = p_program_code;

  with active_members as (
    select distinct
      class_group.grade,
      class_group.section,
      subject.name as subject_name,
      requirement.weekly_load,
      member.subgroup
    from public.course_requirements requirement
    join public.subjects subject
      on subject.id = requirement.subject_id
    cross join lateral
      public.management_requirement_public_members(
        requirement.id
      ) member
    join public.class_groups class_group
      on class_group.id = member.class_group_id
    where requirement.requirement_set_id =
        v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and class_group.grade between 5 and 8
      and member.target in ('SECTION', 'BALLET')
      and exists (
        select 1
        from public.instructional_groups ballet_group
        where ballet_group.requirement_set_id =
            v_revision.requirement_set_id
          and ballet_group.class_group_id =
            class_group.id
          and ballet_group.audience_target = 'BALLET'
          and ballet_group.term_status = 'ACTIVE'
      )
      and not exists (
        select 1
        from public.curriculum_subject_aliases compulsory
        where compulsory.rule_set_id = v_rule_set_id
          and compulsory.source_subject_name =
            subject.name
      )
      and not exists (
        select 1
        from public.curriculum_elective_subject_mappings elective
        where elective.rule_set_id = v_rule_set_id
          and elective.source_subject_name =
            subject.name
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classCode',
          active.grade::text || active.section,
        'subjectName', active.subject_name,
        'weeklyLoad', active.weekly_load,
        'subgroup', active.subgroup
      )
      order by
        active.grade,
        active.section,
        active.subject_name,
        active.subgroup nulls first
    ),
    '[]'::jsonb
  )
  into v_unclassified
  from active_members active;

  return
    v_base
    || jsonb_build_object(
      'selectableFieldEvidence',
        v_elective_evidence,
      'knownLocalExceptions',
        v_local_exceptions,
      'unmappedActiveSubjects',
        v_unclassified,
      'evidenceInterpretation',
        jsonb_build_object(
          'compulsoryAliasCorrectionsApplied',
            true,
          'fieldElectiveCatalogApplied',
            true,
          'officialElectiveWeeklyLoadSource',
            'TTKB_62_TABLE_TOTAL',
          'knownLocalExceptionChangesReferenceStatus',
            false,
          'genericClubLabelClassifiedAsOfficialElective',
            false
        )
    );
end
$$;

revoke all
  on function public.management_curriculum_compliance_status(
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_curriculum_compliance_status(
    uuid,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_rule_set_id uuid;
  v_revision_id uuid;
  v_requirement_set_id uuid;
  v_alias_count integer;
  v_catalog_count integer;
  v_mapping_count integer;
  v_exception_count integer;
  v_elective_row_count integer;
  v_sessions integer;
  v_groups integer;
  v_placements integer;
begin
  select id
  into v_rule_set_id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU';

  select
    revision.id,
    requirement_set.id
  into
    v_revision_id,
    v_requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id =
      revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  select count(*)
  into v_alias_count
  from public.curriculum_subject_aliases
  where rule_set_id = v_rule_set_id;

  select count(*)
  into v_catalog_count
  from public.curriculum_elective_catalog
  where rule_set_id = v_rule_set_id;

  select count(*)
  into v_mapping_count
  from public.curriculum_elective_subject_mappings
  where rule_set_id = v_rule_set_id;

  select count(*)
  into v_exception_count
  from public.curriculum_local_exceptions
  where requirement_set_id = v_requirement_set_id
    and program_code = 'BALLET';

  if v_alias_count <> 25
     or v_catalog_count <> 5
     or v_mapping_count <> 4
     or v_exception_count <> 1 then
    raise exception
      'M23.1 reference evidence cardinality mismatch: aliases %, catalog %, mappings %, exceptions %',
      v_alias_count,
      v_catalog_count,
      v_mapping_count,
      v_exception_count;
  end if;

  select count(*)
  into v_elective_row_count
  from public.management_curriculum_elective_evidence_internal(
    v_revision_id,
    'BALLET'
  );

  if v_elective_row_count <> 4 then
    raise exception
      'M23.1 expected four BALLET elective evidence rows, found %',
      v_elective_row_count;
  end if;

  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  select count(*)
  into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_sessions <> 517
     or v_groups <> 609
     or v_placements <> 28 then
    raise exception
      'M23.1 changed accepted schedule state: sessions %, groups %, placements %',
      v_sessions,
      v_groups,
      v_placements;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_curriculum_compliance_status_m23(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.1 legacy diagnostic must remain internal';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.management_curriculum_compliance_status(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.1 current diagnostic must remain available to authenticated management users';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M23.1 must not unlock term template apply';
  end if;
end
$$;

commit;

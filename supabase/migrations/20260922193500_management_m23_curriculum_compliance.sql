-- Management / M23
-- Curriculum Compliance v1 — official reference vs effective management timetable.
--
-- Official reference:
--   TTKB decision 62 dated 2024-09-25
--   "Yükseköğretim Kurumları Devlet Konservatuvarı Müzik ve Bale
--    Ortaokulu (Bale Bölümü) Haftalık Ders Çizelgesi"
--   MEB Tebliğler Dergisi 2803 (October 2024), printed page 1444.
--
-- Product contract:
--   * versioned official rule set
--   * explicit internal-subject aliases
--   * binding to a concrete requirement-set version
--   * compare official weekly load to the EFFECTIVE management draft
--   * current management draft is the normalized representation of the
--     student/parent runtime-adjusted timetable established by M19.3
--   * advisory only; does NOT block publication in M23
--
-- Important applicability note:
--   TTKB decision 04 dated 2025-05-09 changed the general İlköğretim
--   Kurumları weekly schedule from 2025-2026, including Rehberlik ve
--   Yönlendirme for grades 5-8. No later official decision specifically
--   superseding decision 62 for the conservatory Bale Bölümü was identified
--   during the 2026-09-22 source review. M23 therefore preserves decision 62
--   as the special-program reference and surfaces the guidance issue as an
--   advisory requiring institutional confirmation.
--
-- SAFETY:
--   * no course requirement mutation
--   * no card / placement mutation
--   * no public schedule mutation
--   * no publication/template unlock
--   * no M20.3 invocation

begin;


-- -------------------------------------------------------------------------
-- VERSIONED RULE SET
-- -------------------------------------------------------------------------

create table public.curriculum_rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  institution_scope text not null,
  program_code text not null,
  source_authority text not null,
  decision_number text not null,
  decision_date date not null,
  source_title text not null,
  source_reference text not null,
  source_url text not null,
  effective_from_academic_year text null,
  effective_to_academic_year text null,
  advisory_only boolean not null default true,
  applicability_note text not null,
  reviewed_at date not null,
  created_at timestamptz not null default now(),
  constraint curriculum_rule_sets_code_not_blank
    check (length(btrim(code)) > 0),
  constraint curriculum_rule_sets_program_not_blank
    check (length(btrim(program_code)) > 0),
  constraint curriculum_rule_sets_source_not_blank
    check (
      length(btrim(source_authority)) > 0
      and length(btrim(source_title)) > 0
      and length(btrim(source_reference)) > 0
      and length(btrim(source_url)) > 0
    )
);

create table public.curriculum_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete cascade,
  grade smallint not null check (grade between 5 and 12),
  subject_code text not null,
  subject_label text not null,
  rule_type text not null default 'EXACT'
    check (rule_type in ('EXACT', 'MINIMUM', 'RANGE')),
  min_weekly_load smallint not null check (min_weekly_load >= 0),
  max_weekly_load smallint not null check (max_weekly_load >= 0),
  curriculum_area text not null
    check (curriculum_area in ('GENERAL', 'FIELD', 'AUXILIARY')),
  display_order smallint not null check (display_order > 0),
  created_at timestamptz not null default now(),
  constraint curriculum_rules_load_order
    check (max_weekly_load >= min_weekly_load),
  constraint curriculum_rules_exact_load
    check (
      rule_type <> 'EXACT'
      or min_weekly_load = max_weekly_load
    ),
  constraint curriculum_rules_subject_not_blank
    check (
      length(btrim(subject_code)) > 0
      and length(btrim(subject_label)) > 0
    ),
  constraint curriculum_rules_unique
    unique (rule_set_id, grade, subject_code)
);

create index curriculum_rules_grade_idx
  on public.curriculum_rules (rule_set_id, grade, display_order);

create table public.curriculum_grade_totals (
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete cascade,
  grade smallint not null check (grade between 5 and 12),
  compulsory_weekly_load smallint not null
    check (compulsory_weekly_load >= 0),
  elective_weekly_load smallint not null
    check (elective_weekly_load >= 0),
  total_weekly_load smallint not null
    check (total_weekly_load >= 0),
  primary key (rule_set_id, grade),
  constraint curriculum_grade_totals_sum
    check (
      total_weekly_load =
        compulsory_weekly_load + elective_weekly_load
    )
);

create table public.curriculum_subject_aliases (
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete cascade,
  subject_code text not null,
  source_subject_name text not null,
  created_at timestamptz not null default now(),
  primary key (rule_set_id, subject_code, source_subject_name),
  constraint curriculum_subject_aliases_name_not_blank
    check (length(btrim(source_subject_name)) > 0)
);

create index curriculum_subject_aliases_name_idx
  on public.curriculum_subject_aliases (
    rule_set_id,
    source_subject_name
  );

create table public.curriculum_requirement_set_bindings (
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  program_code text not null,
  rule_set_id uuid not null
    references public.curriculum_rule_sets(id) on delete restrict,
  applicability_status text not null
    check (
      applicability_status in (
        'REFERENCE',
        'CONFIRMED',
        'SUPERSEDED'
      )
    ),
  note text null,
  bound_at timestamptz not null default now(),
  primary key (requirement_set_id, program_code)
);

comment on table public.curriculum_rule_sets is
  'M23 versioned official curriculum references. advisory_only=true means the rule set informs management but does not itself block publication.';
comment on table public.curriculum_rules is
  'M23 per-grade canonical weekly-load rules. Zero-load EXACT rows intentionally detect subjects that are absent from a grade in the official special-program table.';
comment on table public.curriculum_subject_aliases is
  'M23 exact internal/public subject-name aliases to canonical curriculum subject codes. No fuzzy matching is used.';
comment on table public.curriculum_requirement_set_bindings is
  'M23 explicit binding of one requirement-set version to one curriculum rule set and program.';


-- -------------------------------------------------------------------------
-- READ BOUNDARY
-- -------------------------------------------------------------------------

alter table public.curriculum_rule_sets enable row level security;
alter table public.curriculum_rules enable row level security;
alter table public.curriculum_grade_totals enable row level security;
alter table public.curriculum_subject_aliases enable row level security;
alter table public.curriculum_requirement_set_bindings enable row level security;

revoke insert, update, delete
  on public.curriculum_rule_sets
  from anon, authenticated;
revoke insert, update, delete
  on public.curriculum_rules
  from anon, authenticated;
revoke insert, update, delete
  on public.curriculum_grade_totals
  from anon, authenticated;
revoke insert, update, delete
  on public.curriculum_subject_aliases
  from anon, authenticated;
revoke insert, update, delete
  on public.curriculum_requirement_set_bindings
  from anon, authenticated;

grant select on public.curriculum_rule_sets to authenticated;
grant select on public.curriculum_rules to authenticated;
grant select on public.curriculum_grade_totals to authenticated;
grant select on public.curriculum_subject_aliases to authenticated;
grant select on public.curriculum_requirement_set_bindings to authenticated;

create policy curriculum_rule_sets_read
  on public.curriculum_rule_sets
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy curriculum_rules_read
  on public.curriculum_rules
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy curriculum_grade_totals_read
  on public.curriculum_grade_totals
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy curriculum_subject_aliases_read
  on public.curriculum_subject_aliases
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy curriculum_requirement_set_bindings_read
  on public.curriculum_requirement_set_bindings
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- OFFICIAL 2024 / DECISION 62 BALE-ORTAOKULU REFERENCE
-- -------------------------------------------------------------------------

insert into public.curriculum_rule_sets (
  code,
  institution_scope,
  program_code,
  source_authority,
  decision_number,
  decision_date,
  source_title,
  source_reference,
  source_url,
  effective_from_academic_year,
  effective_to_academic_year,
  advisory_only,
  applicability_note,
  reviewed_at
)
values (
  'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU',
  'YUKSEKOGRETIM_KURUMLARI_DEVLET_KONSERVATUVARI_MUZIK_VE_BALE_ORTAOKULU',
  'BALLET',
  'T.C. Millî Eğitim Bakanlığı Talim ve Terbiye Kurulu Başkanlığı',
  '62',
  '2024-09-25',
  'Yükseköğretim Kurumları Devlet Konservatuvarı Müzik ve Bale Ortaokulu (Bale Bölümü) Haftalık Ders Çizelgesi',
  'MEB Tebliğler Dergisi, Ekim 2024, Sayı 2803, s.1444',
  'https://dhgm.meb.gov.tr/tebligler-dergisi/2024/2803_Ekim_2024.pdf',
  '2024-2025',
  null,
  true,
  '2025-05-09 tarihli TTKB 04 sayılı karar genel İlköğretim Kurumları çizelgesini 2025-2026 itibarıyla değiştirmiştir. 2026-09-22 kaynak taramasında TTKB 62 sayılı özel Devlet Konservatuvarı Bale Bölümü çizelgesini ayrıca yürürlükten kaldıran/değiştiren daha yeni özel karar tespit edilmemiştir. Rehberlik ve Yönlendirme başta olmak üzere genel çizelge değişikliklerinin bu özel çizelgeye etkisi kurum tarafından teyit edilmelidir.',
  '2026-09-22'
);

-- Canonical rules include explicit zeroes where the special table has no
-- compulsory period for that grade. This lets the advisory engine detect both
-- under-load and unexpected over-load relative to the selected reference.
with source as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
),
rule_data (
  subject_code,
  subject_label,
  curriculum_area,
  display_order,
  grade,
  weekly_load
) as (
  values
    ('TURKCE', 'Türkçe', 'GENERAL', 1, 5, 6),
    ('TURKCE', 'Türkçe', 'GENERAL', 1, 6, 5),
    ('TURKCE', 'Türkçe', 'GENERAL', 1, 7, 5),
    ('TURKCE', 'Türkçe', 'GENERAL', 1, 8, 5),

    ('MATEMATIK', 'Matematik', 'GENERAL', 2, 5, 4),
    ('MATEMATIK', 'Matematik', 'GENERAL', 2, 6, 4),
    ('MATEMATIK', 'Matematik', 'GENERAL', 2, 7, 4),
    ('MATEMATIK', 'Matematik', 'GENERAL', 2, 8, 4),

    ('FEN_BILIMLERI', 'Fen Bilimleri', 'GENERAL', 3, 5, 3),
    ('FEN_BILIMLERI', 'Fen Bilimleri', 'GENERAL', 3, 6, 3),
    ('FEN_BILIMLERI', 'Fen Bilimleri', 'GENERAL', 3, 7, 3),
    ('FEN_BILIMLERI', 'Fen Bilimleri', 'GENERAL', 3, 8, 3),

    ('SOSYAL_BILGILER', 'Sosyal Bilgiler', 'GENERAL', 4, 5, 3),
    ('SOSYAL_BILGILER', 'Sosyal Bilgiler', 'GENERAL', 4, 6, 3),
    ('SOSYAL_BILGILER', 'Sosyal Bilgiler', 'GENERAL', 4, 7, 3),
    ('SOSYAL_BILGILER', 'Sosyal Bilgiler', 'GENERAL', 4, 8, 0),

    ('TC_INKILAP', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'GENERAL', 5, 5, 0),
    ('TC_INKILAP', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'GENERAL', 5, 6, 0),
    ('TC_INKILAP', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'GENERAL', 5, 7, 0),
    ('TC_INKILAP', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'GENERAL', 5, 8, 2),

    ('YABANCI_DIL', 'Yabancı Dil', 'GENERAL', 6, 5, 3),
    ('YABANCI_DIL', 'Yabancı Dil', 'GENERAL', 6, 6, 3),
    ('YABANCI_DIL', 'Yabancı Dil', 'GENERAL', 6, 7, 4),
    ('YABANCI_DIL', 'Yabancı Dil', 'GENERAL', 6, 8, 4),

    ('DKAB', 'Din Kültürü ve Ahlak Bilgisi', 'GENERAL', 7, 5, 2),
    ('DKAB', 'Din Kültürü ve Ahlak Bilgisi', 'GENERAL', 7, 6, 2),
    ('DKAB', 'Din Kültürü ve Ahlak Bilgisi', 'GENERAL', 7, 7, 2),
    ('DKAB', 'Din Kültürü ve Ahlak Bilgisi', 'GENERAL', 7, 8, 2),

    ('REHBERLIK', 'Rehberlik ve Kariyer Planlama', 'GENERAL', 8, 5, 0),
    ('REHBERLIK', 'Rehberlik ve Kariyer Planlama', 'GENERAL', 8, 6, 0),
    ('REHBERLIK', 'Rehberlik ve Kariyer Planlama', 'GENERAL', 8, 7, 0),
    ('REHBERLIK', 'Rehberlik ve Kariyer Planlama', 'GENERAL', 8, 8, 1),

    ('KLASIK_BALE', 'Klasik Bale', 'FIELD', 9, 5, 8),
    ('KLASIK_BALE', 'Klasik Bale', 'FIELD', 9, 6, 8),
    ('KLASIK_BALE', 'Klasik Bale', 'FIELD', 9, 7, 10),
    ('KLASIK_BALE', 'Klasik Bale', 'FIELD', 9, 8, 10),

    ('BIRLIKTE_UYGULAMA', 'Birlikte Uygulama', 'AUXILIARY', 10, 5, 3),
    ('BIRLIKTE_UYGULAMA', 'Birlikte Uygulama', 'AUXILIARY', 10, 6, 3),
    ('BIRLIKTE_UYGULAMA', 'Birlikte Uygulama', 'AUXILIARY', 10, 7, 3),
    ('BIRLIKTE_UYGULAMA', 'Birlikte Uygulama', 'AUXILIARY', 10, 8, 3),

    ('VUCUT_KONDISYON', 'Vücut Kondisyon', 'AUXILIARY', 11, 5, 1),
    ('VUCUT_KONDISYON', 'Vücut Kondisyon', 'AUXILIARY', 11, 6, 1),
    ('VUCUT_KONDISYON', 'Vücut Kondisyon', 'AUXILIARY', 11, 7, 1),
    ('VUCUT_KONDISYON', 'Vücut Kondisyon', 'AUXILIARY', 11, 8, 1),

    ('SOLFEJ', 'Solfej', 'AUXILIARY', 12, 5, 2),
    ('SOLFEJ', 'Solfej', 'AUXILIARY', 12, 6, 2),
    ('SOLFEJ', 'Solfej', 'AUXILIARY', 12, 7, 0),
    ('SOLFEJ', 'Solfej', 'AUXILIARY', 12, 8, 0),

    ('PIYANO', 'Piyano', 'AUXILIARY', 13, 5, 1),
    ('PIYANO', 'Piyano', 'AUXILIARY', 13, 6, 1),
    ('PIYANO', 'Piyano', 'AUXILIARY', 13, 7, 1),
    ('PIYANO', 'Piyano', 'AUXILIARY', 13, 8, 1)
)
insert into public.curriculum_rules (
  rule_set_id,
  grade,
  subject_code,
  subject_label,
  rule_type,
  min_weekly_load,
  max_weekly_load,
  curriculum_area,
  display_order
)
select
  source.id,
  rule_data.grade,
  rule_data.subject_code,
  rule_data.subject_label,
  'EXACT',
  rule_data.weekly_load,
  rule_data.weekly_load,
  rule_data.curriculum_area,
  rule_data.display_order
from source
cross join rule_data;

with source as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
)
insert into public.curriculum_grade_totals (
  rule_set_id,
  grade,
  compulsory_weekly_load,
  elective_weekly_load,
  total_weekly_load
)
select source.id, totals.grade, totals.compulsory, 4, totals.total
from source
cross join (
  values
    (5::smallint, 36::smallint, 40::smallint),
    (6::smallint, 35::smallint, 39::smallint),
    (7::smallint, 36::smallint, 40::smallint),
    (8::smallint, 36::smallint, 40::smallint)
) totals(grade, compulsory, total);

with source as (
  select id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU'
),
aliases(subject_code, source_subject_name) as (
  values
    ('TURKCE', 'Türkçe'),
    ('MATEMATIK', 'Matematik'),
    ('FEN_BILIMLERI', 'Fen Bilimleri'),
    ('FEN_BILIMLERI', 'Fen'),
    ('SOSYAL_BILGILER', 'Sosyal Bilgiler'),
    ('TC_INKILAP', 'T.C. İnkılap Tarihi ve Atatürkçülük'),
    ('TC_INKILAP', 'T.C.İnkılap Tarihi ve Atatürkçülük'),
    ('TC_INKILAP', 'İnkılap Tarihi'),
    ('YABANCI_DIL', 'Yabancı Dil'),
    ('YABANCI_DIL', 'İngilizce'),
    ('DKAB', 'Din Kültürü ve Ahlak Bilgisi'),
    ('DKAB', 'DKAB'),
    ('REHBERLIK', 'Rehberlik ve Kariyer Planlama'),
    ('REHBERLIK', 'Rehberlik ve Yönlendirme'),
    ('KLASIK_BALE', 'Klasik Bale'),
    ('KLASIK_BALE', 'K. Bale'),
    ('BIRLIKTE_UYGULAMA', 'Birlikte Uygulama'),
    ('BIRLIKTE_UYGULAMA', 'B. Uygulama'),
    ('VUCUT_KONDISYON', 'Vücut Kondisyon'),
    ('VUCUT_KONDISYON', 'V. Kondisyon'),
    ('VUCUT_KONDISYON', 'V.Kondisyon'),
    ('SOLFEJ', 'Solfej'),
    ('PIYANO', 'Piyano')
)
insert into public.curriculum_subject_aliases (
  rule_set_id,
  subject_code,
  source_subject_name
)
select
  source.id,
  aliases.subject_code,
  aliases.source_subject_name
from source
cross join aliases;


-- Bind the exact current management requirement-set version. Future terms /
-- versions must receive an explicit binding rather than inheriting silently.
insert into public.curriculum_requirement_set_bindings (
  requirement_set_id,
  program_code,
  rule_set_id,
  applicability_status,
  note
)
select
  requirement_set.id,
  'BALLET',
  rule_set.id,
  'REFERENCE',
  'M23 initial reference binding. Advisory only pending institution confirmation of post-2025 general-guidance interaction.'
from public.requirement_sets requirement_set
cross join public.curriculum_rule_sets rule_set
where requirement_set.academic_year = '2026-2027'
  and requirement_set.term = 1
  and requirement_set.status = 'DRAFT'
  and rule_set.code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU';


-- -------------------------------------------------------------------------
-- INTERNAL COMPLIANCE ROW ENGINE
-- -------------------------------------------------------------------------

create or replace function public.management_curriculum_compliance_rows_internal(
  p_schedule_revision_id uuid,
  p_program_code text
)
returns table (
  class_group_id uuid,
  class_code text,
  grade smallint,
  section text,
  subject_code text,
  subject_label text,
  curriculum_area text,
  display_order smallint,
  expected_min_weekly_load smallint,
  expected_max_weekly_load smallint,
  management_min_weekly_load integer,
  management_max_weekly_load integer,
  subgroup_count integer,
  compliance_status text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with revision_meta as (
    select
      revision.id as revision_id,
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
  active_requirements as (
    select
      requirement.id as requirement_id,
      requirement.weekly_load::integer as weekly_load,
      subject_alias.subject_code
    from revision_meta revision
    join public.course_requirements requirement
      on requirement.requirement_set_id =
        revision.requirement_set_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join binding
      on binding.requirement_set_id =
        revision.requirement_set_id
    left join public.curriculum_subject_aliases subject_alias
      on subject_alias.rule_set_id = binding.rule_set_id
     and subject_alias.source_subject_name = subject.name
    where requirement.term_status = 'ACTIVE'
  ),
  raw_members as (
    select distinct
      requirement.requirement_id,
      requirement.subject_code,
      requirement.weekly_load,
      member.class_group_id,
      member.subgroup
    from active_requirements requirement
    cross join lateral
      public.management_requirement_public_members(
        requirement.requirement_id
      ) member
    join ballet_classes class_track
      on class_track.class_group_id =
        member.class_group_id
    where member.target in ('SECTION', 'BALLET')
      and requirement.subject_code is not null
  ),
  common_requirement_ids as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.subject_code,
      member.weekly_load
    from raw_members member
    where member.subgroup is null
  ),
  common_loads as (
    select
      common.class_group_id,
      common.subject_code,
      sum(common.weekly_load)::integer as common_load
    from common_requirement_ids common
    group by
      common.class_group_id,
      common.subject_code
  ),
  subgroup_requirement_ids as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.subject_code,
      member.subgroup,
      member.weekly_load
    from raw_members member
    where member.subgroup is not null
      and not exists (
        select 1
        from common_requirement_ids common
        where common.requirement_id =
            member.requirement_id
          and common.class_group_id =
            member.class_group_id
      )
  ),
  subgroup_loads as (
    select
      subgroup.class_group_id,
      subgroup.subject_code,
      subgroup.subgroup,
      sum(subgroup.weekly_load)::integer as subgroup_load
    from subgroup_requirement_ids subgroup
    group by
      subgroup.class_group_id,
      subgroup.subject_code,
      subgroup.subgroup
  ),
  subgroup_stats as (
    select
      subgroup.class_group_id,
      subgroup.subject_code,
      min(subgroup.subgroup_load)::integer as min_subgroup_load,
      max(subgroup.subgroup_load)::integer as max_subgroup_load,
      count(*)::integer as subgroup_count
    from subgroup_loads subgroup
    group by
      subgroup.class_group_id,
      subgroup.subject_code
  ),
  rules as (
    select
      binding.rule_set_id,
      rule.grade,
      rule.subject_code,
      rule.subject_label,
      rule.curriculum_area,
      rule.display_order,
      rule.min_weekly_load,
      rule.max_weekly_load
    from binding
    join public.curriculum_rules rule
      on rule.rule_set_id = binding.rule_set_id
  ),
  compared as (
    select
      class_track.class_group_id,
      class_track.class_code,
      class_track.grade,
      class_track.section,
      rule.subject_code,
      rule.subject_label,
      rule.curriculum_area,
      rule.display_order,
      rule.min_weekly_load,
      rule.max_weekly_load,
      (
        coalesce(common.common_load, 0)
        + case
            when subgroup.subgroup_count is null
              then 0
            else subgroup.min_subgroup_load
          end
      )::integer as actual_min,
      (
        coalesce(common.common_load, 0)
        + case
            when subgroup.subgroup_count is null
              then 0
            else subgroup.max_subgroup_load
          end
      )::integer as actual_max,
      coalesce(subgroup.subgroup_count, 0)::integer
        as subgroup_count
    from ballet_classes class_track
    join rules rule
      on rule.grade = class_track.grade
    left join common_loads common
      on common.class_group_id =
          class_track.class_group_id
     and common.subject_code =
          rule.subject_code
    left join subgroup_stats subgroup
      on subgroup.class_group_id =
          class_track.class_group_id
     and subgroup.subject_code =
          rule.subject_code
  )
  select
    compared.class_group_id,
    compared.class_code,
    compared.grade,
    compared.section,
    compared.subject_code,
    compared.subject_label,
    compared.curriculum_area,
    compared.display_order,
    compared.min_weekly_load,
    compared.max_weekly_load,
    compared.actual_min,
    compared.actual_max,
    compared.subgroup_count,
    case
      when compared.actual_min >= compared.min_weekly_load
       and compared.actual_max <= compared.max_weekly_load
        then 'MATCH'
      when compared.actual_max < compared.min_weekly_load
        then 'UNDER'
      when compared.actual_min > compared.max_weekly_load
        then 'OVER'
      else 'VARIES'
    end::text as compliance_status
  from compared
  order by
    compared.grade,
    compared.section,
    compared.display_order
$$;

revoke all
  on function public.management_curriculum_compliance_rows_internal(
    uuid,
    text
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- MANAGEMENT / SQL EDITOR DIAGNOSTIC
-- -------------------------------------------------------------------------

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
  v_revision record;
  v_binding record;
  v_rule_set record;
  v_rows jsonb;
  v_classes jsonb;
  v_unmapped jsonb;
  v_summary jsonb;
  v_projection_metadata record;
  v_publication_control record;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M23 management VIEWER role required'
      using errcode = '42501';
  end if;

  if p_program_code <> 'BALLET' then
    raise exception
      'M23 v1 currently supports BALLET only';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.version_number
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception
      'M23 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception
      'M23 compliance diagnostic requires DRAFT revision';
  end if;

  select
    binding.rule_set_id,
    binding.applicability_status,
    binding.note
  into v_binding
  from public.curriculum_requirement_set_bindings binding
  where binding.requirement_set_id =
      v_revision.requirement_set_id
    and binding.program_code = p_program_code
    and binding.applicability_status in (
      'REFERENCE',
      'CONFIRMED'
    );

  if not found then
    raise exception
      'M23 no active curriculum binding for requirement set % / program %',
      v_revision.requirement_set_id,
      p_program_code;
  end if;

  select *
  into v_rule_set
  from public.curriculum_rule_sets rule_set
  where rule_set.id = v_binding.rule_set_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classGroupId', compliance.class_group_id,
        'classCode', compliance.class_code,
        'grade', compliance.grade,
        'section', compliance.section,
        'subjectCode', compliance.subject_code,
        'subjectLabel', compliance.subject_label,
        'curriculumArea', compliance.curriculum_area,
        'expectedMinWeeklyLoad',
          compliance.expected_min_weekly_load,
        'expectedMaxWeeklyLoad',
          compliance.expected_max_weekly_load,
        'managementMinWeeklyLoad',
          compliance.management_min_weekly_load,
        'managementMaxWeeklyLoad',
          compliance.management_max_weekly_load,
        'subgroupCount', compliance.subgroup_count,
        'status', compliance.compliance_status
      )
      order by
        compliance.grade,
        compliance.section,
        compliance.display_order
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.management_curriculum_compliance_rows_internal(
    p_schedule_revision_id,
    p_program_code
  ) compliance;

  select coalesce(
    jsonb_agg(class_row.value order by class_row.class_code),
    '[]'::jsonb
  )
  into v_classes
  from (
    select
      compliance.class_code,
      jsonb_build_object(
        'classGroupId', compliance.class_group_id,
        'classCode', compliance.class_code,
        'grade', compliance.grade,
        'section', compliance.section,
        'status', case
          when count(*) filter (
            where compliance.compliance_status <> 'MATCH'
          ) = 0
            then 'MATCH'
          else 'REVIEW'
        end,
        'mismatchCount', count(*) filter (
          where compliance.compliance_status <> 'MATCH'
        ),
        'officialCompulsoryWeeklyLoad',
          grade_total.compulsory_weekly_load,
        'officialElectiveWeeklyLoad',
          grade_total.elective_weekly_load,
        'officialTotalWeeklyLoad',
          grade_total.total_weekly_load,
        'managementCompulsoryMinWeeklyLoad',
          sum(compliance.management_min_weekly_load),
        'managementCompulsoryMaxWeeklyLoad',
          sum(compliance.management_max_weekly_load),
        'subjects', jsonb_agg(
          jsonb_build_object(
            'subjectCode', compliance.subject_code,
            'subjectLabel', compliance.subject_label,
            'expectedWeeklyLoad',
              compliance.expected_min_weekly_load,
            'managementMinWeeklyLoad',
              compliance.management_min_weekly_load,
            'managementMaxWeeklyLoad',
              compliance.management_max_weekly_load,
            'subgroupCount',
              compliance.subgroup_count,
            'status',
              compliance.compliance_status
          )
          order by compliance.display_order
        )
      ) as value
    from public.management_curriculum_compliance_rows_internal(
      p_schedule_revision_id,
      p_program_code
    ) compliance
    join public.curriculum_grade_totals grade_total
      on grade_total.rule_set_id = v_rule_set.id
     and grade_total.grade = compliance.grade
    group by
      compliance.class_group_id,
      compliance.class_code,
      compliance.grade,
      compliance.section,
      grade_total.compulsory_weekly_load,
      grade_total.elective_weekly_load,
      grade_total.total_weekly_load
  ) class_row;

  select jsonb_build_object(
    'classCount',
      count(distinct compliance.class_group_id),
    'subjectCheckCount',
      count(*),
    'matchCount',
      count(*) filter (
        where compliance.compliance_status = 'MATCH'
      ),
    'underCount',
      count(*) filter (
        where compliance.compliance_status = 'UNDER'
      ),
    'overCount',
      count(*) filter (
        where compliance.compliance_status = 'OVER'
      ),
    'variesCount',
      count(*) filter (
        where compliance.compliance_status = 'VARIES'
      ),
    'mismatchCount',
      count(*) filter (
        where compliance.compliance_status <> 'MATCH'
      )
  )
  into v_summary
  from public.management_curriculum_compliance_rows_internal(
    p_schedule_revision_id,
    p_program_code
  ) compliance;

  with active_requirement_members as (
    select distinct
      requirement.id as requirement_id,
      subject.name as subject_name,
      requirement.weekly_load,
      class_group.id as class_group_id,
      class_group.grade,
      class_group.section,
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
        from public.curriculum_subject_aliases subject_alias
        where subject_alias.rule_set_id =
            v_rule_set.id
          and subject_alias.source_subject_name =
            subject.name
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classCode',
          unmapped.grade::text || unmapped.section,
        'subjectName', unmapped.subject_name,
        'weeklyLoad', unmapped.weekly_load,
        'subgroup', unmapped.subgroup
      )
      order by
        unmapped.grade,
        unmapped.section,
        unmapped.subject_name,
        unmapped.subgroup nulls first
    ),
    '[]'::jsonb
  )
  into v_unmapped
  from active_requirement_members unmapped;

  select
    metadata.runtime_adjustments_required
  into v_projection_metadata
  from public.schedule_projection_metadata metadata
  where metadata.academic_year =
      v_revision.academic_year;

  select
    control.runtime_adjustments_reconciled
  into v_publication_control
  from public.management_publication_controls control
  where control.academic_year =
      v_revision.academic_year;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'requirementSetId',
      v_revision.requirement_set_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'requirementSetVersion',
      v_revision.version_number,
    'programCode', p_program_code,

    'ruleSet', jsonb_build_object(
      'id', v_rule_set.id,
      'code', v_rule_set.code,
      'sourceAuthority',
        v_rule_set.source_authority,
      'decisionNumber',
        v_rule_set.decision_number,
      'decisionDate',
        v_rule_set.decision_date,
      'sourceTitle',
        v_rule_set.source_title,
      'sourceReference',
        v_rule_set.source_reference,
      'sourceUrl',
        v_rule_set.source_url,
      'effectiveFromAcademicYear',
        v_rule_set.effective_from_academic_year,
      'advisoryOnly',
        v_rule_set.advisory_only,
      'applicabilityStatus',
        v_binding.applicability_status,
      'applicabilityNote',
        v_rule_set.applicability_note,
      'reviewedAt',
        v_rule_set.reviewed_at
    ),

    'effectiveScheduleEvidence',
      jsonb_build_object(
        'comparisonSource',
          'MANAGEMENT_EFFECTIVE_DRAFT',
        'studentParentRuntimeOverlayReconciled',
          coalesce(
            v_publication_control.runtime_adjustments_reconciled,
            false
          ),
        'rawPublicProjectionStillNeedsRuntimeAdjustments',
          coalesce(
            v_projection_metadata.runtime_adjustments_required,
            true
          ),
        'interpretation',
          'M19.3 normalized the current student/parent runtime adjustments into this management draft. Temporary date-specific UI changes are not curriculum rules.'
      ),

    'summary', v_summary,
    'classes', v_classes,
    'rows', v_rows,
    'unmappedActiveSubjects', v_unmapped,

    'advisories', jsonb_build_array(
      jsonb_build_object(
        'code',
          'GENERAL_2025_REHBERLIK_APPLICABILITY_REQUIRES_CONFIRMATION',
        'severity', 'INFO',
        'publicationBlocking', false,
        'message',
          'TTKB 04/09.05.2025 changed the general İlköğretim schedule from 2025-2026. The selected special conservatory Bale reference remains TTKB 62/25.09.2024 until institutional applicability is confirmed or a later special decision is identified.'
      )
    ),

    'publicationBlocking', false
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

comment on function public.management_curriculum_compliance_status(uuid, text) is
  'M23 read-only advisory compliance diagnostic. Compares the version-bound official Bale weekly-load reference to the effective management draft, including subgroup load ranges. Does not modify or block publication.';


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_rule_set_id uuid;
  v_current_requirement_set_id uuid;
  v_current_revision_id uuid;
  v_rule_count integer;
  v_alias_count integer;
  v_total_count integer;
  v_binding_count integer;
  v_requirement_count integer;
  v_placement_count integer;
  v_public_session_count integer;
  v_public_group_count integer;
  v_compliance_row_count integer;
begin
  select id
  into v_rule_set_id
  from public.curriculum_rule_sets
  where code =
    'TTKB-2024-62-DEVLET-KONSERVATUVARI-BALE-ORTAOKULU';

  if v_rule_set_id is null then
    raise exception 'M23 rule set was not created';
  end if;

  select count(*)
  into v_rule_count
  from public.curriculum_rules
  where rule_set_id = v_rule_set_id;

  select count(*)
  into v_alias_count
  from public.curriculum_subject_aliases
  where rule_set_id = v_rule_set_id;

  select count(*)
  into v_total_count
  from public.curriculum_grade_totals
  where rule_set_id = v_rule_set_id;

  if v_rule_count <> 52
     or v_alias_count <> 23
     or v_total_count <> 4 then
    raise exception
      'M23 official reference cardinality mismatch: rules %, aliases %, totals %',
      v_rule_count,
      v_alias_count,
      v_total_count;
  end if;

  if exists (
    select 1
    from (
      select
        rule.grade,
        sum(rule.min_weekly_load)::integer as rule_total
      from public.curriculum_rules rule
      where rule.rule_set_id = v_rule_set_id
      group by rule.grade
    ) summed
    join public.curriculum_grade_totals totals
      on totals.rule_set_id = v_rule_set_id
     and totals.grade = summed.grade
    where summed.rule_total <>
      totals.compulsory_weekly_load
  ) then
    raise exception
      'M23 per-subject official load does not sum to compulsory grade total';
  end if;

  select
    requirement_set.id,
    revision.id
  into
    v_current_requirement_set_id,
    v_current_revision_id
  from public.requirement_sets requirement_set
  join public.schedule_revisions revision
    on revision.requirement_set_id =
      requirement_set.id
  where requirement_set.academic_year =
      '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_current_requirement_set_id is null
     or v_current_revision_id is null then
    raise exception
      'M23 current 2026-2027 term-1 draft not found';
  end if;

  select count(*)
  into v_binding_count
  from public.curriculum_requirement_set_bindings binding
  where binding.requirement_set_id =
      v_current_requirement_set_id
    and binding.program_code = 'BALLET'
    and binding.rule_set_id = v_rule_set_id
    and binding.applicability_status = 'REFERENCE';

  if v_binding_count <> 1 then
    raise exception
      'M23 expected one current BALLET curriculum binding, found %',
      v_binding_count;
  end if;

  select count(*)
  into v_requirement_count
  from public.course_requirements requirement
  where requirement.requirement_set_id =
      v_current_requirement_set_id;

  if v_requirement_count <> 192 then
    raise exception
      'M23 changed current requirement cardinality unexpectedly: %',
      v_requirement_count;
  end if;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
      v_current_revision_id;

  if v_placement_count <> 28 then
    raise exception
      'M23 changed current placement cardinality unexpectedly: %',
      v_placement_count;
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_public_group_count
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  if v_public_session_count <> 517
     or v_public_group_count <> 609 then
    raise exception
      'M23 modified public projection unexpectedly: sessions %, groups %',
      v_public_session_count,
      v_public_group_count;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status(
        '2026-2027'
      )
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M23 caused public baseline drift';
  end if;

  -- Installation must not call the role-gated public diagnostic: Supabase
  -- migration sessions are not management users. Validate the same comparison
  -- engine through the private/internal function instead and keep production
  -- authorization unchanged.
  select count(*)
  into v_compliance_row_count
  from public.management_curriculum_compliance_rows_internal(
    v_current_revision_id,
    'BALLET'
  );

  if v_compliance_row_count = 0 then
    raise exception
      'M23 internal compliance engine returned no rows';
  end if;

  if not exists (
    select 1
    from public.curriculum_rule_sets rule_set
    where rule_set.id = v_rule_set_id
      and rule_set.advisory_only
  ) then
    raise exception
      'M23 v1 must remain advisory-only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M23 must not unlock term template apply';
  end if;
end
$$;

commit;

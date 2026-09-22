-- Management / M23.2
-- Curriculum Total-Load Reconciliation
--
-- M23/M23.1 compare individual compulsory subjects and known selectable field
-- courses. M23.2 adds an advisory weekly-load envelope so the management UI can
-- distinguish:
--   * total weekly load
--   * compulsory-reference composition
--   * known field-elective load
--   * still-unclassified local load
-- without treating subgroup ranges as one exact student path.
--
-- No schedule/publication data is mutated.

begin;


-- -------------------------------------------------------------------------
-- LOAD RECONCILIATION ENGINE
-- -------------------------------------------------------------------------

create or replace function public.management_curriculum_load_reconciliation_internal(
  p_schedule_revision_id uuid,
  p_program_code text
)
returns table (
  class_group_id uuid,
  class_code text,
  grade smallint,
  section text,
  official_compulsory_weekly_load smallint,
  official_elective_weekly_load smallint,
  official_total_weekly_load smallint,
  compulsory_min_weekly_load integer,
  compulsory_max_weekly_load integer,
  known_elective_min_weekly_load integer,
  known_elective_max_weekly_load integer,
  unclassified_min_weekly_load integer,
  unclassified_max_weekly_load integer,
  known_total_min_weekly_load integer,
  known_total_max_weekly_load integer,
  compulsory_status text,
  elective_status text,
  total_status text,
  local_exception_count integer
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
  compulsory as (
    select
      compliance.class_group_id,
      compliance.class_code,
      compliance.grade,
      compliance.section,
      sum(compliance.management_min_weekly_load)::integer
        as min_load,
      sum(compliance.management_max_weekly_load)::integer
        as max_load
    from public.management_curriculum_compliance_rows_internal(
      p_schedule_revision_id,
      p_program_code
    ) compliance
    group by
      compliance.class_group_id,
      compliance.class_code,
      compliance.grade,
      compliance.section
  ),
  elective as (
    select
      evidence.class_group_id,
      evidence.known_field_elective_min_weekly_load
        as min_load,
      evidence.known_field_elective_max_weekly_load
        as max_load
    from public.management_curriculum_elective_evidence_internal(
      p_schedule_revision_id,
      p_program_code
    ) evidence
  ),
  unclassified_requirements as (
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
    where requirement.term_status = 'ACTIVE'
      and not exists (
        select 1
        from public.curriculum_subject_aliases compulsory_alias
        where compulsory_alias.rule_set_id =
            binding.rule_set_id
          and compulsory_alias.source_subject_name =
            subject.name
      )
      and not exists (
        select 1
        from public.curriculum_elective_subject_mappings elective_mapping
        where elective_mapping.rule_set_id =
            binding.rule_set_id
          and elective_mapping.source_subject_name =
            subject.name
      )
  ),
  unclassified_members as (
    select distinct
      requirement.requirement_id,
      requirement.weekly_load,
      member.class_group_id,
      member.subgroup
    from unclassified_requirements requirement
    cross join lateral
      public.management_requirement_public_members(
        requirement.requirement_id
      ) member
    join compulsory class_track
      on class_track.class_group_id =
        member.class_group_id
    where member.target in ('SECTION', 'BALLET')
  ),
  unclassified_common_ids as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.weekly_load
    from unclassified_members member
    where member.subgroup is null
  ),
  unclassified_common as (
    select
      common.class_group_id,
      sum(common.weekly_load)::integer as common_load
    from unclassified_common_ids common
    group by common.class_group_id
  ),
  unclassified_subgroup_ids as (
    select distinct
      member.requirement_id,
      member.class_group_id,
      member.subgroup,
      member.weekly_load
    from unclassified_members member
    where member.subgroup is not null
      and not exists (
        select 1
        from unclassified_common_ids common
        where common.requirement_id =
            member.requirement_id
          and common.class_group_id =
            member.class_group_id
      )
  ),
  unclassified_subgroup_load as (
    select
      subgroup.class_group_id,
      subgroup.subgroup,
      sum(subgroup.weekly_load)::integer as subgroup_load
    from unclassified_subgroup_ids subgroup
    group by
      subgroup.class_group_id,
      subgroup.subgroup
  ),
  unclassified_subgroup_stats as (
    select
      subgroup.class_group_id,
      min(subgroup.subgroup_load)::integer as min_load,
      max(subgroup.subgroup_load)::integer as max_load
    from unclassified_subgroup_load subgroup
    group by subgroup.class_group_id
  ),
  class_rows as (
    select
      compulsory.class_group_id,
      compulsory.class_code,
      compulsory.grade,
      compulsory.section,
      grade_total.compulsory_weekly_load,
      grade_total.elective_weekly_load,
      grade_total.total_weekly_load,
      compulsory.min_load as compulsory_min,
      compulsory.max_load as compulsory_max,
      coalesce(elective.min_load, 0)::integer
        as elective_min,
      coalesce(elective.max_load, 0)::integer
        as elective_max,
      (
        coalesce(unclassified_common.common_load, 0)
        + coalesce(
            unclassified_subgroup_stats.min_load,
            0
          )
      )::integer as unclassified_min,
      (
        coalesce(unclassified_common.common_load, 0)
        + coalesce(
            unclassified_subgroup_stats.max_load,
            0
          )
      )::integer as unclassified_max,
      (
        select count(*)::integer
        from revision_meta revision
        join public.curriculum_local_exceptions exception
          on exception.requirement_set_id =
            revision.requirement_set_id
        where exception.program_code = p_program_code
          and exception.grade = compulsory.grade
      ) as local_exception_count
    from compulsory
    join binding on true
    join public.curriculum_grade_totals grade_total
      on grade_total.rule_set_id = binding.rule_set_id
     and grade_total.grade = compulsory.grade
    left join elective
      on elective.class_group_id =
        compulsory.class_group_id
    left join unclassified_common
      on unclassified_common.class_group_id =
        compulsory.class_group_id
    left join unclassified_subgroup_stats
      on unclassified_subgroup_stats.class_group_id =
        compulsory.class_group_id
  )
  select
    class_row.class_group_id,
    class_row.class_code,
    class_row.grade,
    class_row.section,
    class_row.compulsory_weekly_load,
    class_row.elective_weekly_load,
    class_row.total_weekly_load,
    class_row.compulsory_min,
    class_row.compulsory_max,
    class_row.elective_min,
    class_row.elective_max,
    class_row.unclassified_min,
    class_row.unclassified_max,
    (
      class_row.compulsory_min
      + class_row.elective_min
      + class_row.unclassified_min
    )::integer as known_total_min,
    (
      class_row.compulsory_max
      + class_row.elective_max
      + class_row.unclassified_max
    )::integer as known_total_max,
    case
      when class_row.compulsory_min =
           class_row.compulsory_weekly_load
       and class_row.compulsory_max =
           class_row.compulsory_weekly_load
        then 'MATCH'
      when class_row.compulsory_min >
           class_row.compulsory_weekly_load
        then 'OVER'
      when class_row.compulsory_max <
           class_row.compulsory_weekly_load
        then 'UNDER'
      else 'VARIES'
    end::text as compulsory_status,
    case
      when class_row.elective_min =
           class_row.elective_weekly_load
       and class_row.elective_max =
           class_row.elective_weekly_load
        then 'MATCH'
      when class_row.elective_min >
           class_row.elective_weekly_load
        then 'OVER'
      when class_row.elective_max <
           class_row.elective_weekly_load
        then 'UNDER'
      else 'VARIES'
    end::text as elective_status,
    case
      when (
        class_row.compulsory_min
        + class_row.elective_min
        + class_row.unclassified_min
      ) = class_row.total_weekly_load
       and (
        class_row.compulsory_max
        + class_row.elective_max
        + class_row.unclassified_max
      ) = class_row.total_weekly_load
        then 'MATCH'
      when (
        class_row.compulsory_min
        + class_row.elective_min
        + class_row.unclassified_min
      ) > class_row.total_weekly_load
        then 'OVER'
      when (
        class_row.compulsory_max
        + class_row.elective_max
        + class_row.unclassified_max
      ) < class_row.total_weekly_load
        then 'UNDER'
      else 'VARIES'
    end::text as total_status,
    class_row.local_exception_count
  from class_rows class_row
  order by
    class_row.grade,
    class_row.section
$$;

revoke all
  on function public.management_curriculum_load_reconciliation_internal(
    uuid,
    text
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- EXTEND CURRENT DIAGNOSTIC
-- -------------------------------------------------------------------------

alter function public.management_curriculum_compliance_status(
  uuid,
  text
)
rename to management_curriculum_compliance_status_m23_1;

revoke all
  on function public.management_curriculum_compliance_status_m23_1(
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
  v_load_rows jsonb;
  v_load_summary jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M23.2 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_curriculum_compliance_status_m23_1(
      p_schedule_revision_id,
      p_program_code
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classGroupId', load.class_group_id,
        'classCode', load.class_code,
        'grade', load.grade,
        'section', load.section,
        'officialCompulsoryWeeklyLoad',
          load.official_compulsory_weekly_load,
        'officialElectiveWeeklyLoad',
          load.official_elective_weekly_load,
        'officialTotalWeeklyLoad',
          load.official_total_weekly_load,
        'compulsoryMinWeeklyLoad',
          load.compulsory_min_weekly_load,
        'compulsoryMaxWeeklyLoad',
          load.compulsory_max_weekly_load,
        'knownElectiveMinWeeklyLoad',
          load.known_elective_min_weekly_load,
        'knownElectiveMaxWeeklyLoad',
          load.known_elective_max_weekly_load,
        'unclassifiedMinWeeklyLoad',
          load.unclassified_min_weekly_load,
        'unclassifiedMaxWeeklyLoad',
          load.unclassified_max_weekly_load,
        'knownTotalMinWeeklyLoad',
          load.known_total_min_weekly_load,
        'knownTotalMaxWeeklyLoad',
          load.known_total_max_weekly_load,
        'compulsoryStatus',
          load.compulsory_status,
        'electiveStatus',
          load.elective_status,
        'totalStatus',
          load.total_status,
        'localExceptionCount',
          load.local_exception_count
      )
      order by load.grade, load.section
    ),
    '[]'::jsonb
  )
  into v_load_rows
  from public.management_curriculum_load_reconciliation_internal(
    p_schedule_revision_id,
    p_program_code
  ) load;

  select jsonb_build_object(
    'classCount', count(*),
    'totalMatchCount',
      count(*) filter (
        where load.total_status = 'MATCH'
      ),
    'totalUnderCount',
      count(*) filter (
        where load.total_status = 'UNDER'
      ),
    'totalOverCount',
      count(*) filter (
        where load.total_status = 'OVER'
      ),
    'totalVariesCount',
      count(*) filter (
        where load.total_status = 'VARIES'
      ),
    'compulsoryCompositionMismatchCount',
      count(*) filter (
        where load.compulsory_status <> 'MATCH'
      ),
    'electiveCompositionMismatchCount',
      count(*) filter (
        where load.elective_status <> 'MATCH'
      ),
    'classesWithKnownLocalExceptions',
      count(*) filter (
        where load.local_exception_count > 0
      )
  )
  into v_load_summary
  from public.management_curriculum_load_reconciliation_internal(
    p_schedule_revision_id,
    p_program_code
  ) load;

  return
    v_base
    || jsonb_build_object(
      'weeklyLoadReconciliation',
        v_load_rows,
      'weeklyLoadSummary',
        v_load_summary,
      'weeklyLoadInterpretation',
        jsonb_build_object(
          'mode', 'ADVISORY_ENVELOPE',
          'subgroupRangesAreExactStudentPaths',
            false,
          'unclassifiedLoadCountsTowardObservedTotal',
            true,
          'unclassifiedLoadCountsAsOfficialElective',
            false,
          'publicationBlocking',
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
  v_revision_id uuid;
  v_row_count integer;
  v_5a record;
  v_6a record;
  v_7a record;
  v_8a record;
  v_sessions integer;
  v_groups integer;
  v_placements integer;
begin
  select revision.id
  into v_revision_id
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
  into v_row_count
  from public.management_curriculum_load_reconciliation_internal(
    v_revision_id,
    'BALLET'
  );

  if v_row_count <> 4 then
    raise exception
      'M23.2 expected four BALLET load rows, found %',
      v_row_count;
  end if;

  select *
  into v_5a
  from public.management_curriculum_load_reconciliation_internal(
    v_revision_id,
    'BALLET'
  )
  where class_code = '5A';

  select *
  into v_6a
  from public.management_curriculum_load_reconciliation_internal(
    v_revision_id,
    'BALLET'
  )
  where class_code = '6A';

  select *
  into v_7a
  from public.management_curriculum_load_reconciliation_internal(
    v_revision_id,
    'BALLET'
  )
  where class_code = '7A';

  select *
  into v_8a
  from public.management_curriculum_load_reconciliation_internal(
    v_revision_id,
    'BALLET'
  )
  where class_code = '8A';

  if v_5a.known_total_min_weekly_load <> 40
     or v_5a.known_total_max_weekly_load <> 40
     or v_5a.total_status <> 'MATCH'
     or v_5a.local_exception_count <> 1 then
    raise exception
      'M23.2 unexpected 5A reconciliation: min %, max %, status %, exceptions %',
      v_5a.known_total_min_weekly_load,
      v_5a.known_total_max_weekly_load,
      v_5a.total_status,
      v_5a.local_exception_count;
  end if;

  if v_6a.known_total_min_weekly_load <> 41
     or v_6a.known_total_max_weekly_load <> 44
     or v_6a.total_status <> 'OVER' then
    raise exception
      'M23.2 unexpected 6A reconciliation: min %, max %, status %',
      v_6a.known_total_min_weekly_load,
      v_6a.known_total_max_weekly_load,
      v_6a.total_status;
  end if;

  if v_7a.known_total_min_weekly_load <> 40
     or v_7a.known_total_max_weekly_load <> 43
     or v_7a.total_status <> 'VARIES' then
    raise exception
      'M23.2 unexpected 7A reconciliation: min %, max %, status %',
      v_7a.known_total_min_weekly_load,
      v_7a.known_total_max_weekly_load,
      v_7a.total_status;
  end if;

  if v_8a.known_total_min_weekly_load <> 39
     or v_8a.known_total_max_weekly_load <> 39
     or v_8a.total_status <> 'UNDER' then
    raise exception
      'M23.2 unexpected 8A reconciliation: min %, max %, status %',
      v_8a.known_total_min_weekly_load,
      v_8a.known_total_max_weekly_load,
      v_8a.total_status;
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
      'M23.2 changed accepted schedule state: sessions %, groups %, placements %',
      v_sessions,
      v_groups,
      v_placements;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_curriculum_compliance_status_m23_1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.2 legacy diagnostic must remain internal';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.management_curriculum_compliance_status(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.2 current diagnostic must remain available to authenticated management users';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M23.2 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M23.2 must not unlock term template apply';
  end if;
end
$$;

commit;

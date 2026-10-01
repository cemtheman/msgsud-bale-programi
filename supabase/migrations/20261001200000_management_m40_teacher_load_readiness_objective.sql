-- Management M40
-- Teacher load readiness + objective metric integration.
--
-- M39.0 introduced explicit term-scoped min/target/max teacher load inputs.
-- M40 makes those inputs auditable solver data without inventing defaults.
--
-- Readiness rule:
--   * relevant teacher = ACTIVE teacher who is in an active requirement teacher
--     pool OR is used by an active placed card in the selected DRAFT;
--   * every relevant teacher needs an explicit target_load before the
--     teacherLoadBalance objective may be ACTIVE;
--   * minimum_load / maximum_load remain optional SOFT planning bands;
--   * load targets never become hard placement constraints.
--
-- Objective penalty:
--   sum(abs(actual_load - target_load))
--   + soft min/max range violation periods.
--
-- This migration wraps the current M39.1 snapshot and preserves hard
-- availability, immutable snapshot behavior, and explicit human commit.

begin;


-- -------------------------------------------------------------------------
-- A. READ-ONLY TEACHER LOAD HEALTH
-- -------------------------------------------------------------------------

create or replace function public.management_teacher_load_health(
  p_requirement_set_id uuid,
  p_schedule_revision_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M40 management VIEWER role required'
      using errcode = '42501';
  end if;

  if p_requirement_set_id is null then
    raise exception 'M40 requirement set is required';
  end if;

  if p_schedule_revision_id is null then
    select revision.id
    into v_revision_id
    from public.schedule_revisions revision
    where revision.requirement_set_id = p_requirement_set_id
      and revision.status = 'DRAFT'
    order by revision.version_number desc, revision.id
    limit 1;
  else
    select revision.id
    into v_revision_id
    from public.schedule_revisions revision
    where revision.id = p_schedule_revision_id
      and revision.requirement_set_id = p_requirement_set_id
      and revision.status = 'DRAFT';
  end if;

  if v_revision_id is null then
    return jsonb_build_object(
      'ready', false,
      'revisionId', null,
      'relevantTeacherCount', 0,
      'configuredTeacherCount', 0,
      'targetConfiguredTeacherCount', 0,
      'missingTargetTeacherCount', 0,
      'partialTeacherCount', 0,
      'baselineBelowMinimumTeacherCount', 0,
      'baselineAboveMaximumTeacherCount', 0,
      'baselineTargetDeviationPeriods', 0,
      'baselineRangeViolationPeriods', 0,
      'targets', '[]'::jsonb
    );
  end if;

  with
  relevant_teacher as materialized (
    select distinct assignment.teacher_id
    from public.course_requirement_teachers assignment
    join public.course_requirements requirement
      on requirement.id = assignment.requirement_id
    join public.teachers teacher
      on teacher.id = assignment.teacher_id
    where requirement.requirement_set_id = p_requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and teacher.operational_status = 'ACTIVE'
      and teacher.archived_at is null

    union

    select distinct placement.teacher_id
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    join public.teachers teacher
      on teacher.id = placement.teacher_id
    where card.schedule_revision_id = v_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
      and teacher.operational_status = 'ACTIVE'
      and teacher.archived_at is null
  ),
  placed_load as materialized (
    select
      placement.teacher_id,
      coalesce(sum(card.duration_periods), 0)::integer
        as actual_load_periods
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = v_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
    group by placement.teacher_id
  ),
  health as materialized (
    select
      relevant.teacher_id,
      planning.minimum_load,
      planning.target_load,
      planning.maximum_load,
      coalesce(placed.actual_load_periods, 0)::integer
        as actual_load_periods,
      (
        planning.minimum_load is not null
        or planning.target_load is not null
        or planning.maximum_load is not null
      ) as configured,
      (planning.target_load is not null) as target_configured,
      case
        when planning.target_load is null then null
        else abs(
          coalesce(placed.actual_load_periods, 0)
          - planning.target_load
        )::integer
      end as target_deviation_periods,
      case
        when planning.minimum_load is not null
         and coalesce(placed.actual_load_periods, 0)
             < planning.minimum_load
          then (
            planning.minimum_load
            - coalesce(placed.actual_load_periods, 0)
          )::integer
        else 0
      end as below_minimum_by,
      case
        when planning.maximum_load is not null
         and coalesce(placed.actual_load_periods, 0)
             > planning.maximum_load
          then (
            coalesce(placed.actual_load_periods, 0)
            - planning.maximum_load
          )::integer
        else 0
      end as above_maximum_by
    from relevant_teacher relevant
    left join public.management_teacher_planning_inputs planning
      on planning.requirement_set_id = p_requirement_set_id
     and planning.teacher_id = relevant.teacher_id
    left join placed_load placed
      on placed.teacher_id = relevant.teacher_id
  ),
  aggregate as (
    select
      count(*)::integer as relevant_teacher_count,
      count(*) filter (where configured)::integer
        as configured_teacher_count,
      count(*) filter (where target_configured)::integer
        as target_configured_teacher_count,
      count(*) filter (where not target_configured)::integer
        as missing_target_teacher_count,
      count(*) filter (
        where configured and not target_configured
      )::integer as partial_teacher_count,
      count(*) filter (where below_minimum_by > 0)::integer
        as baseline_below_minimum_teacher_count,
      count(*) filter (where above_maximum_by > 0)::integer
        as baseline_above_maximum_teacher_count,
      coalesce(
        sum(target_deviation_periods)
          filter (where target_deviation_periods is not null),
        0
      )::integer as baseline_target_deviation_periods,
      coalesce(
        sum(below_minimum_by + above_maximum_by),
        0
      )::integer as baseline_range_violation_periods
    from health
  )
  select jsonb_build_object(
    'ready',
      aggregate.relevant_teacher_count > 0
      and aggregate.missing_target_teacher_count = 0,
    'revisionId', v_revision_id,
    'relevantTeacherCount', aggregate.relevant_teacher_count,
    'configuredTeacherCount', aggregate.configured_teacher_count,
    'targetConfiguredTeacherCount',
      aggregate.target_configured_teacher_count,
    'missingTargetTeacherCount',
      aggregate.missing_target_teacher_count,
    'partialTeacherCount', aggregate.partial_teacher_count,
    'baselineBelowMinimumTeacherCount',
      aggregate.baseline_below_minimum_teacher_count,
    'baselineAboveMaximumTeacherCount',
      aggregate.baseline_above_maximum_teacher_count,
    'baselineTargetDeviationPeriods',
      aggregate.baseline_target_deviation_periods,
    'baselineRangeViolationPeriods',
      aggregate.baseline_range_violation_periods,
    'targets',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'teacherId', health.teacher_id,
            'minimumLoad', health.minimum_load,
            'targetLoad', health.target_load,
            'maximumLoad', health.maximum_load,
            'actualLoadPeriods', health.actual_load_periods,
            'relevant', true
          )
          order by health.teacher_id
        )
        from health
      ), '[]'::jsonb)
  )
  into v_result
  from aggregate;

  return v_result;
end
$$;

revoke all
  on function public.management_teacher_load_health(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_teacher_load_health(uuid, uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- B. OBJECTIVE CATALOG / VALIDATION
-- -------------------------------------------------------------------------

create or replace function public.management_validate_solver_objective_weights(
  p_weights jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_weights jsonb := coalesce(p_weights, '{}'::jsonb);
  v_unknown_keys text[] := array[]::text[];
  v_invalid_values text[] := array[]::text[];
  v_unsupported_enabled text[] := array[]::text[];
  v_key text;
  v_value jsonb;
  v_integer integer;
  v_normalized jsonb;
  v_positive_supported integer;
begin
  if jsonb_typeof(v_weights) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'normalizedWeights', '{}'::jsonb,
      'unknownKeys', '[]'::jsonb,
      'invalidValues', jsonb_build_array('WEIGHTS_MUST_BE_OBJECT'),
      'unsupportedEnabled', '[]'::jsonb,
      'positiveSupportedObjectiveCount', 0,
      'catalog', '[]'::jsonb
    );
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each(v_weights)
  loop
    if v_key not in (
      'changeCost',
      'preferredTeacherContinuity',
      'teacherIdleGaps',
      'roomStability',
      'teacherLoadBalance',
      'subjectTimePreference'
    ) then
      v_unknown_keys := array_append(v_unknown_keys, v_key);
      continue;
    end if;

    if jsonb_typeof(v_value) <> 'number'
       or v_value::text !~ '^[0-9]+$' then
      v_invalid_values := array_append(v_invalid_values, v_key);
      continue;
    end if;

    v_integer := (v_value::text)::integer;

    if v_integer < 0 or v_integer > 1000 then
      v_invalid_values := array_append(v_invalid_values, v_key);
      continue;
    end if;

    if v_key = 'subjectTimePreference'
       and v_integer > 0 then
      v_unsupported_enabled := array_append(
        v_unsupported_enabled,
        v_key
      );
    end if;
  end loop;

  v_normalized := jsonb_build_object(
    'changeCost',
      case
        when jsonb_typeof(v_weights -> 'changeCost') = 'number'
         and (v_weights -> 'changeCost')::text ~ '^[0-9]+$'
          then (v_weights ->> 'changeCost')::integer
        else 0
      end,
    'preferredTeacherContinuity',
      case
        when jsonb_typeof(v_weights -> 'preferredTeacherContinuity') = 'number'
         and (v_weights -> 'preferredTeacherContinuity')::text ~ '^[0-9]+$'
          then (v_weights ->> 'preferredTeacherContinuity')::integer
        else 0
      end,
    'teacherIdleGaps',
      case
        when jsonb_typeof(v_weights -> 'teacherIdleGaps') = 'number'
         and (v_weights -> 'teacherIdleGaps')::text ~ '^[0-9]+$'
          then (v_weights ->> 'teacherIdleGaps')::integer
        else 0
      end,
    'roomStability',
      case
        when jsonb_typeof(v_weights -> 'roomStability') = 'number'
         and (v_weights -> 'roomStability')::text ~ '^[0-9]+$'
          then (v_weights ->> 'roomStability')::integer
        else 0
      end,
    'teacherLoadBalance',
      case
        when jsonb_typeof(v_weights -> 'teacherLoadBalance') = 'number'
         and (v_weights -> 'teacherLoadBalance')::text ~ '^[0-9]+$'
          then (v_weights ->> 'teacherLoadBalance')::integer
        else 0
      end,
    'subjectTimePreference',
      case
        when jsonb_typeof(v_weights -> 'subjectTimePreference') = 'number'
         and (v_weights -> 'subjectTimePreference')::text ~ '^[0-9]+$'
          then (v_weights ->> 'subjectTimePreference')::integer
        else 0
      end
  );

  select count(*)::integer
  into v_positive_supported
  from jsonb_each(v_normalized) item(key, value)
  where item.key in (
      'changeCost',
      'preferredTeacherContinuity',
      'teacherIdleGaps',
      'roomStability',
      'teacherLoadBalance'
    )
    and (item.value::text)::integer > 0;

  return jsonb_build_object(
    'valid',
      cardinality(v_unknown_keys) = 0
      and cardinality(v_invalid_values) = 0
      and cardinality(v_unsupported_enabled) = 0,
    'normalizedWeights', v_normalized,
    'unknownKeys', to_jsonb(v_unknown_keys),
    'invalidValues', to_jsonb(v_invalid_values),
    'unsupportedEnabled', to_jsonb(v_unsupported_enabled),
    'positiveSupportedObjectiveCount', v_positive_supported,
    'catalog', jsonb_build_array(
      jsonb_build_object(
        'id', 'changeCost',
        'supported', true,
        'meaning',
          'Mevcut programa göre değişen gün/saat/öğretmen/salon kararlarını azaltır.'
      ),
      jsonb_build_object(
        'id', 'preferredTeacherContinuity',
        'supported', true,
        'meaning',
          'BLOCK + PREFERRED derslerde aynı öğretmeni korumayı tercih eder.'
      ),
      jsonb_build_object(
        'id', 'teacherIdleGaps',
        'supported', true,
        'meaning',
          'Öğretmenin aynı gündeki dersleri arasındaki boş ders aralıklarını azaltır.'
      ),
      jsonb_build_object(
        'id', 'roomStability',
        'supported', true,
        'meaning',
          'Aynı requirement bloklarının gereksiz salon değiştirmesini azaltır.'
      ),
      jsonb_build_object(
        'id', 'teacherLoadBalance',
        'supported', true,
        'meaning',
          'Açık hedef yükleri kullanarak öğretmen yüklerini hedefe yaklaştırır; min/max değerleri soft banttır.'
      ),
      jsonb_build_object(
        'id', 'subjectTimePreference',
        'supported', false,
        'missingInput', 'SUBJECT_TIME_PREFERENCES',
        'meaning',
          'Ders bazlı tercih edilen/kaçınılan gün-saat verisi tanımlanmadan etkinleştirilemez.'
      )
    )
  );
end
$$;

revoke all
  on function public.management_validate_solver_objective_weights(jsonb)
  from public, anon;

grant execute
  on function public.management_validate_solver_objective_weights(jsonb)
  to authenticated;


-- ACTIVE load-balance profiles require complete contextual target inputs.
create or replace function public.management_upsert_solver_objective_profile(
  p_profile_id uuid,
  p_requirement_set_id uuid,
  p_name text,
  p_description text,
  p_weights jsonb,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_validation jsonb;
  v_profile_id uuid;
  v_load_health jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M40 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'M33 objective profile name is required';
  end if;

  if p_status not in ('DRAFT', 'ACTIVE', 'ARCHIVED') then
    raise exception 'M33 invalid objective profile status';
  end if;

  if not exists (
    select 1
    from public.requirement_sets requirement_set
    where requirement_set.id = p_requirement_set_id
  ) then
    raise exception 'M33 requirement set not found';
  end if;

  v_validation :=
    public.management_validate_solver_objective_weights(p_weights);

  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception
      'M33 invalid objective weights: %',
      v_validation::text;
  end if;

  if p_status = 'ACTIVE'
     and coalesce(
       (v_validation ->> 'positiveSupportedObjectiveCount')::integer,
       0
     ) = 0 then
    raise exception
      'M33 ACTIVE objective profile requires at least one positive supported objective';
  end if;

  if p_status = 'ACTIVE'
     and coalesce(
       (v_validation -> 'normalizedWeights' ->> 'teacherLoadBalance')::integer,
       0
     ) > 0 then
    v_load_health :=
      public.management_teacher_load_health(
        p_requirement_set_id,
        null
      );

    if not coalesce((v_load_health ->> 'ready')::boolean, false) then
      raise exception
        'M40 teacher load objective requires complete target loads: %',
        v_load_health::text;
    end if;
  end if;

  if p_status = 'ACTIVE' then
    update public.management_solver_objective_profiles profile
    set
      status = 'DRAFT',
      updated_at = now()
    where profile.requirement_set_id = p_requirement_set_id
      and profile.status = 'ACTIVE'
      and (p_profile_id is null or profile.id <> p_profile_id);
  end if;

  if p_profile_id is null then
    insert into public.management_solver_objective_profiles (
      requirement_set_id,
      name,
      description,
      status,
      weights
    )
    values (
      p_requirement_set_id,
      btrim(p_name),
      nullif(btrim(coalesce(p_description, '')), ''),
      p_status,
      v_validation -> 'normalizedWeights'
    )
    returning id into v_profile_id;
  else
    update public.management_solver_objective_profiles profile
    set
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      status = p_status,
      weights = v_validation -> 'normalizedWeights',
      updated_at = now()
    where profile.id = p_profile_id
      and profile.requirement_set_id = p_requirement_set_id
    returning id into v_profile_id;

    if v_profile_id is null then
      raise exception 'M33 objective profile not found in requirement set';
    end if;
  end if;

  return (
    select jsonb_build_object(
      'id', profile.id,
      'requirementSetId', profile.requirement_set_id,
      'name', profile.name,
      'description', profile.description,
      'status', profile.status,
      'weights', profile.weights,
      'validation',
        public.management_validate_solver_objective_weights(profile.weights)
    )
    from public.management_solver_objective_profiles profile
    where profile.id = v_profile_id
  );
end
$$;

revoke all
  on function public.management_upsert_solver_objective_profile(
    uuid, uuid, text, text, jsonb, text
  )
  from public, anon;

grant execute
  on function public.management_upsert_solver_objective_profile(
    uuid, uuid, text, text, jsonb, text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- C. EXTEND RESOURCES LOAD AUDIT
-- -------------------------------------------------------------------------

create or replace function public.management_list_teacher_load_targets(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M40 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M40 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M40 teacher planning audit requires DRAFT revision';
  end if;

  with
  placed_load as (
    select
      placement.teacher_id,
      count(*)::integer as placed_block_count,
      coalesce(sum(card.duration_periods), 0)::integer
        as actual_load_periods
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
    group by placement.teacher_id
  ),
  active_requirements as (
    select
      assignment.teacher_id,
      count(distinct assignment.requirement_id)::integer
        as active_requirement_count
    from public.course_requirement_teachers assignment
    join public.course_requirements requirement
      on requirement.id = assignment.requirement_id
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.term_status = 'ACTIVE'
    group by assignment.teacher_id
  ),
  relevant_teacher as (
    select teacher.id as teacher_id
    from public.teachers teacher
    where teacher.operational_status = 'ACTIVE'
      and teacher.archived_at is null
      and (
        exists (
          select 1
          from active_requirements active
          where active.teacher_id = teacher.id
        )
        or exists (
          select 1
          from placed_load placed
          where placed.teacher_id = teacher.id
        )
      )
  ),
  unavailable as (
    select
      slot.teacher_id,
      count(*)::integer as unavailable_period_count,
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', slot.day_of_week,
          'period', slot.period
        )
        order by slot.day_of_week, slot.period
      ) as unavailable_periods
    from public.management_teacher_unavailable_periods slot
    where slot.requirement_set_id = v_requirement_set_id
    group by slot.teacher_id
  ),
  unavailable_placement as (
    select
      placement.teacher_id,
      count(distinct placement.card_id)::integer
        as unavailable_placed_block_count
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
      and exists (
        select 1
        from public.management_teacher_unavailable_periods slot
        where slot.requirement_set_id = v_requirement_set_id
          and slot.teacher_id = placement.teacher_id
          and slot.day_of_week = placement.day_of_week
          and slot.period between
            placement.start_period
            and placement.start_period + card.duration_periods - 1
      )
    group by placement.teacher_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', teacher.id,
        'minimumLoad', planning.minimum_load,
        'targetLoad', planning.target_load,
        'maximumLoad', planning.maximum_load,
        'configured', (
          planning.minimum_load is not null
          or planning.target_load is not null
          or planning.maximum_load is not null
        ),
        'loadRelevant', relevant.teacher_id is not null,
        'loadTargetReady',
          relevant.teacher_id is not null
          and planning.target_load is not null,
        'targetDeviationPeriods',
          case
            when planning.target_load is null then null
            else abs(
              coalesce(placed.actual_load_periods, 0)
              - planning.target_load
            )::integer
          end,
        'belowMinimumBy',
          case
            when planning.minimum_load is not null
             and coalesce(placed.actual_load_periods, 0)
                 < planning.minimum_load
              then (
                planning.minimum_load
                - coalesce(placed.actual_load_periods, 0)
              )::integer
            else 0
          end,
        'aboveMaximumBy',
          case
            when planning.maximum_load is not null
             and coalesce(placed.actual_load_periods, 0)
                 > planning.maximum_load
              then (
                coalesce(placed.actual_load_periods, 0)
                - planning.maximum_load
              )::integer
            else 0
          end,
        'actualLoadPeriods',
          coalesce(placed.actual_load_periods, 0),
        'placedBlockCount',
          coalesce(placed.placed_block_count, 0),
        'activeRequirementCount',
          coalesce(active.active_requirement_count, 0),
        'unavailablePeriods',
          coalesce(unavailable.unavailable_periods, '[]'::jsonb),
        'unavailablePeriodCount',
          coalesce(unavailable.unavailable_period_count, 0),
        'availabilityConfigured',
          coalesce(unavailable.unavailable_period_count, 0) > 0,
        'unavailablePlacedBlockCount',
          coalesce(
            unavailable_placement.unavailable_placed_block_count,
            0
          )
      )
      order by teacher.name, teacher.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.teachers teacher
  left join public.management_teacher_planning_inputs planning
    on planning.requirement_set_id = v_requirement_set_id
   and planning.teacher_id = teacher.id
  left join placed_load placed
    on placed.teacher_id = teacher.id
  left join active_requirements active
    on active.teacher_id = teacher.id
  left join relevant_teacher relevant
    on relevant.teacher_id = teacher.id
  left join unavailable
    on unavailable.teacher_id = teacher.id
  left join unavailable_placement
    on unavailable_placement.teacher_id = teacher.id
  where teacher.archived_at is null;

  return v_result;
end
$$;

revoke all
  on function public.management_list_teacher_load_targets(uuid)
  from public, anon;

grant execute
  on function public.management_list_teacher_load_targets(uuid)
  to authenticated;


create or replace function public.management_set_teacher_load_targets(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_minimum_load integer,
  p_target_load integer,
  p_maximum_load integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_teacher_name text;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M40 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for share;

  if v_requirement_set_id is null then
    raise exception 'M40 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M40 teacher planning inputs require DRAFT revision';
  end if;

  select teacher.name
  into v_teacher_name
  from public.teachers teacher
  where teacher.id = p_teacher_id
    and teacher.archived_at is null;

  if v_teacher_name is null then
    raise exception 'M40 active teacher resource not found';
  end if;

  if p_minimum_load is not null
     and (p_minimum_load < 0 or p_minimum_load > 60) then
    raise exception 'M40 minimum load must be between 0 and 60';
  end if;

  if p_target_load is not null
     and (p_target_load < 0 or p_target_load > 60) then
    raise exception 'M40 target load must be between 0 and 60';
  end if;

  if p_maximum_load is not null
     and (p_maximum_load < 0 or p_maximum_load > 60) then
    raise exception 'M40 maximum load must be between 0 and 60';
  end if;

  if p_minimum_load is not null
     and p_target_load is not null
     and p_minimum_load > p_target_load then
    raise exception 'M40 minimum load cannot exceed target load';
  end if;

  if p_target_load is not null
     and p_maximum_load is not null
     and p_target_load > p_maximum_load then
    raise exception 'M40 target load cannot exceed maximum load';
  end if;

  if p_minimum_load is not null
     and p_maximum_load is not null
     and p_minimum_load > p_maximum_load then
    raise exception 'M40 minimum load cannot exceed maximum load';
  end if;

  if p_minimum_load is null
     and p_target_load is null
     and p_maximum_load is null then
    delete from public.management_teacher_planning_inputs planning
    where planning.requirement_set_id = v_requirement_set_id
      and planning.teacher_id = p_teacher_id;
  else
    insert into public.management_teacher_planning_inputs (
      requirement_set_id,
      teacher_id,
      minimum_load,
      target_load,
      maximum_load
    )
    values (
      v_requirement_set_id,
      p_teacher_id,
      p_minimum_load::smallint,
      p_target_load::smallint,
      p_maximum_load::smallint
    )
    on conflict (requirement_set_id, teacher_id)
    do update set
      minimum_load = excluded.minimum_load,
      target_load = excluded.target_load,
      maximum_load = excluded.maximum_load,
      updated_at = now();
  end if;

  select entry.value
  into v_result
  from jsonb_array_elements(
    public.management_list_teacher_load_targets(
      p_schedule_revision_id
    )
  ) entry(value)
  where entry.value ->> 'teacherId' = p_teacher_id::text
  limit 1;

  if v_result is null then
    raise exception 'M40 teacher planning result not found';
  end if;

  return v_result || jsonb_build_object(
    'teacherName', v_teacher_name,
    'publishedChanged', false,
    'solverBehaviorChanged', true
  );
end
$$;

revoke all
  on function public.management_set_teacher_load_targets(
    uuid, uuid, integer, integer, integer
  )
  from public, anon;

grant execute
  on function public.management_set_teacher_load_targets(
    uuid, uuid, integer, integer, integer
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- D. M40 SNAPSHOT WRAPPER
-- -------------------------------------------------------------------------

alter function public.management_preview_solver_snapshot(uuid, uuid)
  rename to management_preview_solver_snapshot_m40_base;

revoke all
  on function public.management_preview_solver_snapshot_m40_base(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.management_preview_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_core jsonb;
  v_health jsonb;
  v_catalog jsonb;
  v_missing jsonb;
  v_load_enabled boolean;
  v_load_ready boolean;
  v_profile_ready boolean;
  v_hard_ready boolean;
  v_snapshot_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M40 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_preview_solver_snapshot_m40_base(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_health :=
    public.management_teacher_load_health(
      (v_base -> 'meta' ->> 'requirementSetId')::uuid,
      p_schedule_revision_id
    );

  v_load_ready :=
    coalesce((v_health ->> 'ready')::boolean, false);

  v_load_enabled :=
    coalesce(
      (
        v_base
        -> 'objectiveProfile'
        -> 'weights'
        ->> 'teacherLoadBalance'
      )::integer,
      0
    ) > 0;

  select coalesce(
    jsonb_agg(
      case
        when item.value ->> 'id' = 'teacherLoadBalance' then
          case
            when v_load_ready then
              (item.value
                || jsonb_build_object(
                  'supported', true,
                  'meaning',
                    'Öğretmen yüklerini açık hedeflere yaklaştırır; en az/en fazla değerleri soft banttır.'
                )
              ) - 'missingInput'
            else
              item.value
                || jsonb_build_object(
                  'supported', false,
                  'missingInput',
                    'TEACHER_LOAD_TARGETS_INCOMPLETE',
                  'meaning',
                    'Planlamaya katılan tüm öğretmenlerde hedef yük tanımlandığında kullanılabilir.'
                )
          end
        else item.value
      end
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  into v_catalog
  from jsonb_array_elements(
    coalesce(v_base -> 'objectiveCatalog', '[]'::jsonb)
  ) with ordinality item(value, ordinality);

  select coalesce(
    jsonb_agg(item.value order by item.ordinality),
    '[]'::jsonb
  )
  into v_missing
  from jsonb_array_elements(
    coalesce(
      v_base -> 'readiness' -> 'missingOptionalModelInputs',
      '[]'::jsonb
    )
  ) with ordinality item(value, ordinality)
  where item.value #>> '{}' <> 'TEACHER_LOAD_TARGETS'
    and item.value #>> '{}' <> 'TEACHER_LOAD_TARGETS_INCOMPLETE';

  if not v_load_ready then
    v_missing :=
      v_missing || jsonb_build_array(
        'TEACHER_LOAD_TARGETS_INCOMPLETE'
      );
  end if;

  v_hard_ready :=
    coalesce(
      (v_base -> 'readiness' ->> 'hardInputReady')::boolean,
      false
    );

  v_profile_ready :=
    coalesce(
      (v_base -> 'readiness' ->> 'objectiveProfileReady')::boolean,
      false
    )
    and (not v_load_enabled or v_load_ready);

  v_core :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M40-v1',
      'teacherLoadTargets',
        coalesce(v_health -> 'targets', '[]'::jsonb),
      'teacherLoadReadiness', v_health,
      'baselineMetrics',
        coalesce(v_base -> 'baselineMetrics', '{}'::jsonb)
        || jsonb_build_object(
          'teacherLoadTargetDeviationPeriods',
            coalesce(
              (v_health ->> 'baselineTargetDeviationPeriods')::integer,
              0
            ),
          'teacherLoadRangeViolationPeriods',
            coalesce(
              (v_health ->> 'baselineRangeViolationPeriods')::integer,
              0
            )
        ),
      'objectiveCatalog', v_catalog,
      'readiness',
        coalesce(v_base -> 'readiness', '{}'::jsonb)
        || jsonb_build_object(
          'objectiveProfileReady', v_profile_ready,
          'solverPrototypeReady',
            v_hard_ready and v_profile_ready,
          'teacherLoadReadiness', v_health,
          'missingOptionalModelInputs', v_missing
        )
    );

  v_snapshot_hash := md5(v_core::text);

  return v_core || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_base ->> 'baselineHash'
  );
end
$$;

revoke all
  on function public.management_preview_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_preview_solver_snapshot(uuid, uuid)
  to authenticated;


comment on function public.management_teacher_load_health(uuid, uuid) is
  'M40 contextual teacher-load readiness. Relevant active teachers need explicit target_load before load-balance optimization may be used; min/max remain soft bands.';

comment on function public.management_set_teacher_load_targets(
  uuid, uuid, integer, integer, integer
) is
  'M40 explicit teacher load input. Program/publication are unchanged, but optimizer readiness/score may change.';

comment on function public.management_preview_solver_snapshot(uuid, uuid) is
  'M40 solver snapshot wrapper adding teacher load targets, readiness, baseline load health and contextual load-balance objective support on top of M39.1 hard availability.';

commit;

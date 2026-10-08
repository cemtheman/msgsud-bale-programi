-- M39.3: soft requirement day/start-period preferences and solver objective.

create table if not exists public.management_requirement_time_preferences (
  requirement_id uuid primary key
    references public.course_requirements(id) on delete cascade,
  preferred_days smallint[] not null default array[]::smallint[],
  preferred_start_periods smallint[] not null default array[]::smallint[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_requirement_time_preferences_days_check
    check (preferred_days <@ array[1,2,3,4,5]::smallint[]),
  constraint management_requirement_time_preferences_periods_check
    check (
      preferred_start_periods <@
      array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
    )
);

CREATE OR REPLACE FUNCTION public.management_list_requirement_time_preferences(p_schedule_revision_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M39.3 management VIEWER role required'
      using errcode = '42501';
  end if;

  select revision.requirement_set_id, revision.status
  into v_requirement_set_id, v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M39.3 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.3 time preferences require DRAFT revision';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', preference.requirement_id,
        'preferredDays',
          to_jsonb(preference.preferred_days),
        'preferredStartPeriods',
          to_jsonb(preference.preferred_start_periods)
      )
      order by preference.requirement_id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.management_requirement_time_preferences preference
  join public.course_requirements requirement
    on requirement.id = preference.requirement_id
  where requirement.requirement_set_id = v_requirement_set_id
    and requirement.term_status = 'ACTIVE'
    and (
      cardinality(preference.preferred_days) > 0
      or cardinality(preference.preferred_start_periods) > 0
    );

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.management_preview_solver_snapshot(p_schedule_revision_id uuid, p_objective_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_base jsonb;
  v_core jsonb;
  v_requirement_set_id uuid;
  v_unavailable jsonb;
  v_teacher_load_targets jsonb;
  v_configured_teacher_load_count integer := 0;
  v_subject_time_preferences jsonb;
  v_subject_time_preference_count integer := 0;
  v_readiness jsonb;
  v_rules jsonb;
  v_snapshot_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M39.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_preview_solver_snapshot_m39_base(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_requirement_set_id :=
    (v_base -> 'meta' ->> 'requirementSetId')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', slot.teacher_id,
        'dayOfWeek', slot.day_of_week,
        'period', slot.period
      )
      order by slot.teacher_id, slot.day_of_week, slot.period
    ),
    '[]'::jsonb
  )
  into v_unavailable
  from public.management_teacher_unavailable_periods slot
  where slot.requirement_set_id = v_requirement_set_id;

  with load_target as (
    select entry.value
    from jsonb_array_elements(
      public.management_list_teacher_load_targets(
        p_schedule_revision_id
      )
    ) entry(value)
    where coalesce(
      (entry.value ->> 'configured')::boolean,
      false
    )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'teacherId', load_target.value ->> 'teacherId',
          'minimumLoad',
            case
              when load_target.value ->> 'minimumLoad' is null then null
              else (load_target.value ->> 'minimumLoad')::integer
            end,
          'targetLoad',
            case
              when load_target.value ->> 'targetLoad' is null then null
              else (load_target.value ->> 'targetLoad')::integer
            end,
          'maximumLoad',
            case
              when load_target.value ->> 'maximumLoad' is null then null
              else (load_target.value ->> 'maximumLoad')::integer
            end
        )
        order by load_target.value ->> 'teacherId'
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into
    v_teacher_load_targets,
    v_configured_teacher_load_count
  from load_target;


  select
    coalesce(
      public.management_list_requirement_time_preferences(
        p_schedule_revision_id
      ),
      '[]'::jsonb
    )
  into v_subject_time_preferences;

  v_subject_time_preference_count :=
    jsonb_array_length(v_subject_time_preferences);

  v_core :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M39.3-v1',
      'teacherUnavailablePeriods', v_unavailable,
      'teacherLoadTargets', v_teacher_load_targets,
      'subjectTimePreferences', v_subject_time_preferences
    );

  v_readiness := coalesce(
    v_core -> 'readiness',
    '{}'::jsonb
  );

  v_readiness := jsonb_set(
    v_readiness,
    '{missingOptionalModelInputs}',
    case
      when v_configured_teacher_load_count > 0
       and v_subject_time_preference_count > 0
        then '[]'::jsonb
      when v_configured_teacher_load_count > 0
        then jsonb_build_array('SUBJECT_TIME_PREFERENCES')
      when v_subject_time_preference_count > 0
        then jsonb_build_array('TEACHER_LOAD_TARGETS')
      else jsonb_build_array(
        'TEACHER_LOAD_TARGETS',
        'SUBJECT_TIME_PREFERENCES'
      )
    end,
    true
  );

  v_core := jsonb_set(
    v_core,
    '{readiness}',
    v_readiness,
    true
  );

  v_rules :=
    coalesce(
      v_core #> '{hardConstraintContract,rules}',
      '[]'::jsonb
    );

  if not v_rules @> '["TEACHER_HARD_UNAVAILABLE"]'::jsonb then
    v_rules := v_rules || '["TEACHER_HARD_UNAVAILABLE"]'::jsonb;
  end if;

  v_core := jsonb_set(
    v_core,
    '{hardConstraintContract,rules}',
    v_rules,
    true
  );

  v_snapshot_hash := md5(v_core::text);

  return v_core || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_base ->> 'baselineHash'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.management_set_requirement_time_preferences(p_schedule_revision_id uuid, p_requirement_id uuid, p_preferred_days smallint[], p_preferred_start_periods smallint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_requirement_status text;
  v_days smallint[];
  v_periods smallint[];
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M39.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.requirement_set_id, revision.status
  into v_requirement_set_id, v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for share;

  if v_requirement_set_id is null then
    raise exception 'M39.3 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.3 time preferences require DRAFT revision';
  end if;

  select requirement.term_status
  into v_requirement_status
  from public.course_requirements requirement
  where requirement.id = p_requirement_id
    and requirement.requirement_set_id = v_requirement_set_id
  for share;

  if v_requirement_status is null then
    raise exception 'M39.3 requirement not found in draft';
  end if;

  if v_requirement_status <> 'ACTIVE' then
    raise exception 'M39.3 time preferences require ACTIVE requirement';
  end if;

  select coalesce(
    array_agg(distinct value order by value),
    array[]::smallint[]
  )
  into v_days
  from unnest(
    coalesce(p_preferred_days, array[]::smallint[])
  ) value;

  select coalesce(
    array_agg(distinct value order by value),
    array[]::smallint[]
  )
  into v_periods
  from unnest(
    coalesce(p_preferred_start_periods, array[]::smallint[])
  ) value;

  if not (
    v_days <@ array[1,2,3,4,5]::smallint[]
  ) then
    raise exception 'M39.3 preferred days must be between 1 and 5';
  end if;

  if not (
    v_periods <@
      array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
  ) then
    raise exception 'M39.3 preferred periods must be between 1 and 12';
  end if;

  if cardinality(v_days) = 0
     and cardinality(v_periods) = 0 then
    delete from public.management_requirement_time_preferences
    where requirement_id = p_requirement_id;
  else
    insert into public.management_requirement_time_preferences (
      requirement_id,
      preferred_days,
      preferred_start_periods
    )
    values (
      p_requirement_id,
      v_days,
      v_periods
    )
    on conflict (requirement_id)
    do update set
      preferred_days = excluded.preferred_days,
      preferred_start_periods = excluded.preferred_start_periods,
      updated_at = now();
  end if;

  v_result := jsonb_build_object(
    'requirementId', p_requirement_id,
    'preferredDays', to_jsonb(v_days),
    'preferredStartPeriods', to_jsonb(v_periods),
    'configured',
      cardinality(v_days) > 0 or cardinality(v_periods) > 0,
    'publishedChanged', false,
    'solverBehaviorChanged', true
  );

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.management_validate_solver_objective_weights(p_weights jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      'positiveSupportedObjectiveCount', 0
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

    -- All currently known objective keys are supported.
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
      'teacherLoadBalance',
      'subjectTimePreference'
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
        'meaning', 'Mevcut programa göre değişen gün/saat/öğretmen/salon kararlarını azaltır.'
      ),
      jsonb_build_object(
        'id', 'preferredTeacherContinuity',
        'supported', true,
        'meaning', 'BLOCK + PREFERRED derslerde aynı öğretmeni korumayı tercih eder.'
      ),
      jsonb_build_object(
        'id', 'teacherIdleGaps',
        'supported', true,
        'meaning', 'Öğretmenin aynı gündeki dersleri arasındaki boş ders aralıklarını azaltır.'
      ),
      jsonb_build_object(
        'id', 'roomStability',
        'supported', true,
        'meaning', 'Aynı requirement bloklarının gereksiz salon değiştirmesini azaltır.'
      ),
      jsonb_build_object(
        'id', 'teacherLoadBalance',
        'supported', true,
        'meaning', 'Tanımlı öğretmen yük hedeflerine göre toplam ders saati sapmasını azaltır.'
      ),
      jsonb_build_object(
        'id', 'subjectTimePreference',
        'supported', true,
        'meaning', 'Ders bazlı tercih edilen günleri ve başlangıç saatlerini mümkün olduğunca karşılamayı tercih eder.'
      )
    )
  );
end
$function$;

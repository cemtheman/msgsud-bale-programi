-- Enable teacherLoadBalance as a supported objective and expose configured
-- teacher load targets in the live M39.2 solver snapshot.

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

  v_core :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M39.2-v1',
      'teacherUnavailablePeriods', v_unavailable,
      'teacherLoadTargets', v_teacher_load_targets
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
        then jsonb_build_array('SUBJECT_TIME_PREFERENCES')
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
        'supported', false,
        'missingInput', 'SUBJECT_TIME_PREFERENCES',
        'meaning', 'Ders bazlı tercih edilen/kaçınılan gün-saat verisi tanımlanmadan etkinleştirilemez.'
      )
    )
  );
end
$function$;

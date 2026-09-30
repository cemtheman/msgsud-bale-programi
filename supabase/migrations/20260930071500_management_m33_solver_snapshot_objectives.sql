-- Management M33
-- Solver snapshot + explicit soft-objective foundation.
--
-- This phase does NOT solve or mutate the timetable.
-- It creates a deterministic, immutable solver input contract and an explicit
-- objective-profile model so a future optimizer never invents its own notion
-- of "best".
--
-- Key design rules:
--   * current placements are BASELINE / change-cost input, not ground truth;
--   * candidate assessments are NOT embedded in the solver snapshot because
--     they are occupancy-relative to the current baseline;
--   * hard scheduling inputs and soft objectives are separate;
--   * unsupported objectives cannot be activated;
--   * no objective profile is selected implicitly;
--   * captured snapshots are append-only from application RPCs.

begin;


-- -------------------------------------------------------------------------
-- A. EXPLICIT OBJECTIVE PROFILES
-- -------------------------------------------------------------------------

create table if not exists public.management_solver_objective_profiles (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  name text not null,
  description text null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  weights jsonb not null default '{}'::jsonb
    check (jsonb_typeof(weights) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_solver_objective_profile_name_not_blank
    check (length(btrim(name)) > 0),
  constraint management_solver_objective_profile_name_unique
    unique (requirement_set_id, name)
);

create unique index if not exists
  management_solver_objective_profile_active_unique
on public.management_solver_objective_profiles (requirement_set_id)
where status = 'ACTIVE';

create index if not exists
  management_solver_objective_profile_requirement_set_idx
on public.management_solver_objective_profiles (requirement_set_id, status);

alter table public.management_solver_objective_profiles
  enable row level security;

revoke insert, update, delete
  on public.management_solver_objective_profiles
  from public, anon, authenticated;


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

    if v_key in ('teacherLoadBalance', 'subjectTimePreference')
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
      'roomStability'
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
        'supported', false,
        'missingInput', 'TEACHER_LOAD_TARGETS',
        'meaning', 'Öğretmen minimum/hedef/maksimum yükleri tanımlanmadan etkinleştirilemez.'
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
$$;

revoke all
  on function public.management_validate_solver_objective_weights(jsonb)
  from public, anon;

grant execute
  on function public.management_validate_solver_objective_weights(jsonb)
  to authenticated;


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
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M33 management EDITOR role required'
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


create or replace function public.management_list_solver_objective_profiles(
  p_requirement_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M33 management VIEWER role required'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', profile.id,
        'name', profile.name,
        'description', profile.description,
        'status', profile.status,
        'weights', profile.weights,
        'validation',
          public.management_validate_solver_objective_weights(profile.weights)
      )
      order by
        case profile.status
          when 'ACTIVE' then 0
          when 'DRAFT' then 1
          else 2
        end,
        profile.name,
        profile.id
    )
    from public.management_solver_objective_profiles profile
    where profile.requirement_set_id = p_requirement_set_id
  ), '[]'::jsonb);
end
$$;

revoke all
  on function public.management_list_solver_objective_profiles(uuid)
  from public, anon;

grant execute
  on function public.management_list_solver_objective_profiles(uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- B. IMMUTABLE SNAPSHOT STORAGE
-- -------------------------------------------------------------------------

create table if not exists public.management_solver_snapshots (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  objective_profile_id uuid null
    references public.management_solver_objective_profiles(id) on delete restrict,
  snapshot_version text not null,
  snapshot_hash text not null,
  baseline_hash text not null,
  snapshot jsonb not null
    check (jsonb_typeof(snapshot) = 'object'),
  readiness jsonb not null
    check (jsonb_typeof(readiness) = 'object'),
  created_at timestamptz not null default now(),
  constraint management_solver_snapshots_revision_hash_unique
    unique (schedule_revision_id, snapshot_hash)
);

create index if not exists
  management_solver_snapshots_revision_idx
on public.management_solver_snapshots (
  schedule_revision_id,
  created_at desc
);

alter table public.management_solver_snapshots
  enable row level security;

revoke insert, update, delete
  on public.management_solver_snapshots
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- C. DETERMINISTIC SNAPSHOT PREVIEW
-- -------------------------------------------------------------------------

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
  v_revision record;
  v_profile jsonb := null;
  v_profile_validation jsonb := null;
  v_hard_blockers jsonb := '[]'::jsonb;
  v_hard_blocker_count integer := 0;
  v_requirements jsonb;
  v_cards jsonb;
  v_groups jsonb;
  v_relations jsonb;
  v_teacher_pools jsonb;
  v_room_pools jsonb;
  v_teachers jsonb;
  v_rooms jsonb;
  v_baseline jsonb;
  v_baseline_hash text;
  v_baseline_metrics jsonb;
  v_objective_catalog jsonb;
  v_hard_input_ready boolean;
  v_objective_profile_ready boolean;
  v_snapshot jsonb;
  v_snapshot_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M33 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number,
    revision.status,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M33 schedule revision not found';
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception 'M33 solver snapshot requires DRAFT revision';
  end if;

  if p_objective_profile_id is not null then
    select jsonb_build_object(
      'id', profile.id,
      'name', profile.name,
      'description', profile.description,
      'status', profile.status,
      'weights', profile.weights
    )
    into v_profile
    from public.management_solver_objective_profiles profile
    where profile.id = p_objective_profile_id
      and profile.requirement_set_id = v_revision.requirement_set_id
      and profile.status <> 'ARCHIVED';

    if v_profile is null then
      raise exception
        'M33 objective profile not found, archived, or belongs to another requirement set';
    end if;

    v_profile_validation :=
      public.management_validate_solver_objective_weights(
        v_profile -> 'weights'
      );
  else
    v_profile_validation :=
      public.management_validate_solver_objective_weights('{}'::jsonb);
  end if;

  v_objective_catalog := v_profile_validation -> 'catalog';

  -- Hard-input readiness blockers. These describe missing or contradictory
  -- inputs; they are not an optimizer score.
  with blockers as (
    select
      'TEACHER_REQUIREMENT_UNSPECIFIED'::text as code,
      count(*)::integer as item_count
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement = 'UNSPECIFIED'
    having count(*) > 0

    union all

    select
      'TEACHER_ASSIGNMENT_SCOPE_UNSPECIFIED',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
      and requirement.teacher_assignment_scope = 'UNSPECIFIED'
    having count(*) > 0

    union all

    select
      'REQUIRED_TEACHER_POOL_EMPTY',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement = 'REQUIRED'
      and not exists (
        select 1
        from public.course_requirement_teachers assignment
        join public.teachers teacher
          on teacher.id = assignment.teacher_id
        where assignment.requirement_id = requirement.id
          and teacher.operational_status = 'ACTIVE'
      )
    having count(*) > 0

    union all

    select
      'REQUIRED_TEACHER_CONTINUITY_VIOLATION',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
      and requirement.teacher_assignment_scope = 'REQUIREMENT'
      and requirement.teacher_continuity = 'REQUIRED'
      and (
        select count(distinct placement.teacher_id) filter (
          where placement.teacher_id is not null
        )
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) > 1
    having count(*) > 0

    union all

    select
      'RESOURCE_MODE_UNKNOWN',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.resource_mode = 'UNKNOWN'
    having count(*) > 0

    union all

    select
      'ROOM_POOL_EMPTY',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.resource_mode in ('FIXED', 'ELIGIBLE_POOL')
      and not exists (
        select 1
        from public.course_requirement_rooms assignment
        join public.rooms selected_room
          on selected_room.id = assignment.room_id
        join public.rooms canonical_room
          on canonical_room.id = coalesce(
            selected_room.canonical_room_id,
            selected_room.id
          )
        where assignment.requirement_id = requirement.id
          and canonical_room.operational_status = 'ACTIVE'
      )
    having count(*) > 0

    union all

    select
      'CAPABILITY_ROOM_UNAVAILABLE',
      count(*)::integer
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.resource_mode = 'CAPABILITY'
      and not exists (
        select 1
        from public.rooms room
        where room.canonical_room_id is null
          and room.operational_status = 'ACTIVE'
          and requirement.required_capability = any(
            coalesce(room.capabilities, array[]::text[])
          )
      )
    having count(*) > 0

    union all

    select
      'BASELINE_INACTIVE_TEACHER',
      count(*)::integer
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.teachers teacher
      on teacher.id = placement.teacher_id
    where card.schedule_revision_id = p_schedule_revision_id
      and teacher.operational_status <> 'ACTIVE'
    having count(*) > 0

    union all

    select
      'BASELINE_INACTIVE_ROOM',
      count(*)::integer
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join public.rooms selected_room
      on selected_room.id = placement.room_id
    join public.rooms canonical_room
      on canonical_room.id = coalesce(
        selected_room.canonical_room_id,
        selected_room.id
      )
    where card.schedule_revision_id = p_schedule_revision_id
      and canonical_room.operational_status <> 'ACTIVE'
    having count(*) > 0

    union all

    select
      'BASELINE_TIME_OUT_OF_BOUNDS',
      count(*)::integer
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = p_schedule_revision_id
      and (
        placement.start_period < 1
        or placement.start_period + card.duration_periods - 1 > 12
      )
    having count(*) > 0

    union all

    select
      'BASELINE_LUNCH_CROSSING',
      count(*)::integer
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = p_schedule_revision_id
      and placement.start_period <= 5
      and placement.start_period + card.duration_periods - 1 >= 6
    having count(*) > 0
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', blocker.code,
          'count', blocker.item_count
        )
        order by blocker.code
      ),
      '[]'::jsonb
    )
  into
    v_hard_blocker_count,
    v_hard_blockers
  from blockers blocker;

  v_hard_input_ready := v_hard_blocker_count = 0;

  v_objective_profile_ready :=
    p_objective_profile_id is not null
    and coalesce((v_profile_validation ->> 'valid')::boolean, false)
    and coalesce(
      (v_profile_validation ->> 'positiveSupportedObjectiveCount')::integer,
      0
    ) > 0;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', requirement.id,
        'subjectId', requirement.subject_id,
        'subjectName', subject.name,
        'groupId', requirement.instructional_group_id,
        'groupName', instructional_group.name,
        'groupType', instructional_group.group_type,
        'weeklyLoad', requirement.weekly_load,
        'preferredPartition', requirement.preferred_partition,
        'allowedPartitions', requirement.allowed_partitions,
        'minDistinctDays', requirement.min_distinct_days,
        'maxBlocksPerDay', requirement.max_blocks_per_day,
        'maxConsecutivePeriods', requirement.max_consecutive_periods,
        'courseCharacter', requirement.course_character,
        'deliveryMode', requirement.delivery_mode,
        'teacherRequirement', requirement.teacher_requirement,
        'teacherMode', requirement.teacher_mode,
        'teacherAssignmentScope', requirement.teacher_assignment_scope,
        'teacherContinuity', requirement.teacher_continuity,
        'resourceMode', requirement.resource_mode,
        'requiredCapability', requirement.required_capability
      )
      order by
        instructional_group.name,
        subject.name,
        requirement.id
    ),
    '[]'::jsonb
  )
  into v_requirements
  from public.course_requirements requirement
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where requirement.requirement_set_id = v_revision.requirement_set_id
    and requirement.term_status = 'ACTIVE';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', card.id,
        'requirementId', card.requirement_id,
        'blockIndex', card.block_index,
        'durationPeriods', card.duration_periods,
        'locked', card.locked
      )
      order by card.requirement_id, card.block_index, card.id
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.term_status = 'ACTIVE';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', instructional_group.id,
        'classGroupId', instructional_group.class_group_id,
        'name', instructional_group.name,
        'groupType', instructional_group.group_type,
        'termStatus', instructional_group.term_status,
        'knowledgeStatus', instructional_group.knowledge_status
      )
      order by instructional_group.name, instructional_group.id
    ),
    '[]'::jsonb
  )
  into v_groups
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_revision.requirement_set_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leftGroupId', relation.left_group_id,
        'rightGroupId', relation.right_group_id,
        'relation', relation.relation
      )
      order by
        relation.left_group_id,
        relation.right_group_id,
        relation.relation
    ),
    '[]'::jsonb
  )
  into v_relations
  from public.instructional_group_relations relation
  join public.instructional_groups left_group
    on left_group.id = relation.left_group_id
  where left_group.requirement_set_id =
    v_revision.requirement_set_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', assignment.requirement_id,
        'teacherId', assignment.teacher_id
      )
      order by assignment.requirement_id, assignment.teacher_id
    ),
    '[]'::jsonb
  )
  into v_teacher_pools
  from public.course_requirement_teachers assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id = v_revision.requirement_set_id
    and requirement.term_status = 'ACTIVE';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', assignment.requirement_id,
        'roomId', assignment.room_id
      )
      order by assignment.requirement_id, assignment.room_id
    ),
    '[]'::jsonb
  )
  into v_room_pools
  from public.course_requirement_rooms assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  where requirement.requirement_set_id = v_revision.requirement_set_id
    and requirement.term_status = 'ACTIVE';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', teacher.id,
        'name', teacher.name,
        'operationalStatus', teacher.operational_status
      )
      order by teacher.name, teacher.id
    ),
    '[]'::jsonb
  )
  into v_teachers
  from public.teachers teacher;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', room.id,
        'name', room.name,
        'canonicalRoomId', room.canonical_room_id,
        'capabilities', coalesce(room.capabilities, array[]::text[]),
        'knowledgeStatus', room.knowledge_status,
        'operationalStatus', room.operational_status
      )
      order by room.name, room.id
    ),
    '[]'::jsonb
  )
  into v_rooms
  from public.rooms room;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', card.id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period,
        'teacherId', placement.teacher_id,
        'roomId', placement.room_id
      )
      order by card.id
    ),
    '[]'::jsonb
  )
  into v_baseline
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.term_status = 'ACTIVE';

  v_baseline_hash := md5(v_baseline::text);

  with placed as materialized (
    select
      card.id as card_id,
      card.requirement_id,
      card.duration_periods,
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id,
      placement.room_id
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and requirement.term_status = 'ACTIVE'
  ),
  teacher_day as materialized (
    select
      placed.teacher_id,
      placed.day_of_week,
      min(placed.start_period)::integer as first_period,
      max(
        placed.start_period + placed.duration_periods - 1
      )::integer as last_period,
      sum(placed.duration_periods)::integer as occupied_periods
    from placed
    where placed.teacher_id is not null
    group by placed.teacher_id, placed.day_of_week
  ),
  preferred_continuity as materialized (
    select
      requirement.id,
      greatest(
        count(distinct placed.teacher_id) filter (
          where placed.teacher_id is not null
        ) - 1,
        0
      )::integer as excess_teachers
    from public.course_requirements requirement
    left join placed
      on placed.requirement_id = requirement.id
    where requirement.requirement_set_id =
        v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_assignment_scope = 'BLOCK'
      and requirement.teacher_continuity = 'PREFERRED'
    group by requirement.id
  ),
  room_stability as materialized (
    select
      requirement.id,
      greatest(
        count(distinct placed.room_id) filter (
          where placed.room_id is not null
        ) - 1,
        0
      )::integer as excess_rooms
    from public.course_requirements requirement
    left join placed
      on placed.requirement_id = requirement.id
    where requirement.requirement_set_id =
        v_revision.requirement_set_id
      and requirement.term_status = 'ACTIVE'
    group by requirement.id
  )
  select jsonb_build_object(
    'cardCount', (
      select count(*)::integer
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      where card.schedule_revision_id = p_schedule_revision_id
        and requirement.term_status = 'ACTIVE'
    ),
    'placedCardCount', (
      select count(*)::integer from placed
    ),
    'unplacedCardCount', (
      select count(*)::integer
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      where card.schedule_revision_id = p_schedule_revision_id
        and requirement.term_status = 'ACTIVE'
        and not exists (
          select 1
          from public.placements placement
          where placement.card_id = card.id
        )
    ),
    'lockedCardCount', (
      select count(*)::integer
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      where card.schedule_revision_id = p_schedule_revision_id
        and requirement.term_status = 'ACTIVE'
        and card.locked
    ),
    'changeCost', 0,
    'preferredTeacherContinuityBreaks',
      coalesce((
        select sum(excess_teachers)::integer
        from preferred_continuity
      ), 0),
    'teacherIdleGapPeriods',
      coalesce((
        select sum(
          greatest(
            teacher_day.last_period
            - teacher_day.first_period
            + 1
            - teacher_day.occupied_periods,
            0
          )
        )::integer
        from teacher_day
      ), 0),
    'roomStabilityBreaks',
      coalesce((
        select sum(excess_rooms)::integer
        from room_stability
      ), 0)
  )
  into v_baseline_metrics;

  v_snapshot := jsonb_build_object(
    'snapshotVersion', 'M33-v1',
    'solverEngineStatus', 'SNAPSHOT_ONLY',
    'meta', jsonb_build_object(
      'revisionId', v_revision.id,
      'requirementSetId', v_revision.requirement_set_id,
      'revisionVersion', v_revision.version_number,
      'academicYear', v_revision.academic_year,
      'term', v_revision.term
    ),
    'hardConstraintContract', jsonb_build_object(
      'days', jsonb_build_array(1, 2, 3, 4, 5),
      'periods', jsonb_build_array(
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
      ),
      'rules', jsonb_build_array(
        'TIME_WITHIN_DAY',
        'NO_BLOCK_ACROSS_LUNCH_BOUNDARY',
        'NO_TEACHER_OVERLAP',
        'NO_ROOM_OVERLAP',
        'NO_PARTICIPANT_GROUP_OVERLAP',
        'LOCKED_CARD_PIN',
        'REQUIREMENT_TEACHER_CONTINUITY_REQUIRED',
        'MIN_DISTINCT_DAYS_WHEN_DECLARED',
        'MAX_BLOCKS_PER_DAY_WHEN_DECLARED',
        'MAX_CONSECUTIVE_PERIODS_WHEN_DECLARED'
      )
    ),
    'requirements', v_requirements,
    'cards', v_cards,
    'instructionalGroups', v_groups,
    'instructionalGroupRelations', v_relations,
    'teacherPools', v_teacher_pools,
    'roomPools', v_room_pools,
    'teachers', v_teachers,
    'rooms', v_rooms,
    'baselinePlacements', v_baseline,
    'baselineMetrics', v_baseline_metrics,
    'objectiveProfile', v_profile,
    'objectiveCatalog', v_objective_catalog,
    'candidateDomainIncluded', false,
    'candidateDomainOmissionReason',
      'Candidate assessments are relative to current placement occupancy; solver must derive decision domains from structural inputs instead.',
    'readiness', jsonb_build_object(
      'hardInputReady', v_hard_input_ready,
      'objectiveProfileReady', v_objective_profile_ready,
      'solverPrototypeReady',
        v_hard_input_ready and v_objective_profile_ready,
      'hardBlockers', v_hard_blockers,
      'objectiveProfileValidation', v_profile_validation,
      'missingOptionalModelInputs', jsonb_build_array(
        'TEACHER_LOAD_TARGETS',
        'SUBJECT_TIME_PREFERENCES'
      )
    )
  );

  v_snapshot_hash := md5(v_snapshot::text);

  return v_snapshot || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_baseline_hash
  );
end
$$;

revoke all
  on function public.management_preview_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_preview_solver_snapshot(uuid, uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- D. CAPTURE / READ SNAPSHOT
-- -------------------------------------------------------------------------

create or replace function public.management_capture_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_baseline_hash text;
  v_snapshot_id uuid;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M33 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
  for share;

  if not found then
    raise exception 'M33 capture requires DRAFT revision';
  end if;

  v_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_snapshot_hash := v_snapshot ->> 'snapshotHash';
  v_baseline_hash := v_snapshot ->> 'baselineHash';

  if not coalesce(
    ((v_snapshot -> 'readiness') ->> 'hardInputReady')::boolean,
    false
  ) then
    raise exception
      'M33 snapshot capture blocked by hard input readiness: %',
      (v_snapshot -> 'readiness' -> 'hardBlockers')::text;
  end if;

  insert into public.management_solver_snapshots (
    schedule_revision_id,
    objective_profile_id,
    snapshot_version,
    snapshot_hash,
    baseline_hash,
    snapshot,
    readiness
  )
  values (
    p_schedule_revision_id,
    p_objective_profile_id,
    'M33-v1',
    v_snapshot_hash,
    v_baseline_hash,
    v_snapshot,
    v_snapshot -> 'readiness'
  )
  on conflict (schedule_revision_id, snapshot_hash)
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select snapshot.id
    into v_snapshot_id
    from public.management_solver_snapshots snapshot
    where snapshot.schedule_revision_id = p_schedule_revision_id
      and snapshot.snapshot_hash = v_snapshot_hash;
  end if;

  return jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'revisionId', p_schedule_revision_id,
    'objectiveProfileId', p_objective_profile_id,
    'snapshotVersion', 'M33-v1',
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_baseline_hash,
    'readiness', v_snapshot -> 'readiness',
    'baselineMetrics', v_snapshot -> 'baselineMetrics',
    'solverEngineStatus', 'SNAPSHOT_ONLY',
    'captured', true
  );
end
$$;

revoke all
  on function public.management_capture_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_capture_solver_snapshot(uuid, uuid)
  to authenticated;


create or replace function public.management_get_solver_snapshot(
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M33 management VIEWER role required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'snapshotId', snapshot.id,
    'revisionId', snapshot.schedule_revision_id,
    'objectiveProfileId', snapshot.objective_profile_id,
    'snapshotVersion', snapshot.snapshot_version,
    'snapshotHash', snapshot.snapshot_hash,
    'baselineHash', snapshot.baseline_hash,
    'snapshot', snapshot.snapshot,
    'readiness', snapshot.readiness,
    'createdAt', snapshot.created_at
  )
  into v_result
  from public.management_solver_snapshots snapshot
  where snapshot.id = p_snapshot_id;

  if v_result is null then
    raise exception 'M33 solver snapshot not found';
  end if;

  return v_result;
end
$$;

revoke all
  on function public.management_get_solver_snapshot(uuid)
  from public, anon;

grant execute
  on function public.management_get_solver_snapshot(uuid)
  to authenticated;


comment on table public.management_solver_objective_profiles is
  'M33 explicit human-configured soft-objective profiles. No profile is implicitly selected by the solver foundation.';
comment on table public.management_solver_snapshots is
  'M33 append-only application snapshot store for deterministic solver inputs. Current placements are stored as baseline/change-cost input.';
comment on function public.management_preview_solver_snapshot(uuid, uuid) is
  'M33 deterministic read-only solver snapshot preview. Excludes occupancy-relative candidate assessments and separates baseline placements, hard inputs, readiness, and explicit soft objectives.';
comment on function public.management_capture_solver_snapshot(uuid, uuid) is
  'M33 captures a hard-input-ready solver snapshot without changing timetable placements or publication state. Snapshot rows are not mutable through application RPCs.';

commit;

-- Management M32.3.5
-- Requirement-level teacher reconciliation for REQUIREMENT + REQUIRED policy.
--
-- Purpose:
--   When a requirement already has multiple resolved teachers but policy says
--   one teacher must be used across all blocks, let the user choose one eligible
--   teacher and safely reconcile all currently placed blocks.
--
-- Guarantees:
--   * no automatic winner selection
--   * chosen teacher must already be eligible for the requirement
--   * current day/start/room are preserved
--   * existing M29 resource-preview conflict checks are reused
--   * apply is stale-state protected and atomic
--   * existing M29 bundle history/undo semantics are reused
--   * requirement teacher pool is not expanded or rewritten
--
-- Candidate-policy enforcement for unplaced cards remains a later step.

begin;

create or replace function public.management_preview_requirement_teacher_reconciliation(
  p_requirement_id uuid,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement record;
  v_revision_id uuid;
  v_teacher record;
  v_all_card_ids uuid[];
  v_placed_card_ids uuid[];
  v_changed_card_ids uuid[];
  v_placed_block_count integer := 0;
  v_unplaced_block_count integer := 0;
  v_changed_block_count integer := 0;
  v_current_teacher_count integer := 0;
  v_m29_preview jsonb := '{}'::jsonb;
  v_block_reasons text[] := array[]::text[];
  v_state_token text;
  v_placements jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_requirement_id is null or p_teacher_id is null then
    raise exception 'M32.3.5 requirement and teacher are required';
  end if;

  select
    requirement.id,
    requirement.requirement_set_id,
    requirement.term_status,
    requirement.teacher_requirement,
    requirement.teacher_mode,
    requirement.teacher_assignment_scope,
    requirement.teacher_continuity,
    subject.name as subject_name,
    instructional_group.name as group_name
  into v_requirement
  from public.course_requirements requirement
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where requirement.id = p_requirement_id;

  if not found then
    raise exception 'M32.3.5 requirement not found: %', p_requirement_id;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.requirement_set_id = v_requirement.requirement_set_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M32.3.5 requirement is not part of an active draft';
  end if;

  select
    teacher.id,
    teacher.name,
    teacher.operational_status
  into v_teacher
  from public.teachers teacher
  where teacher.id = p_teacher_id;

  if not found then
    raise exception 'M32.3.5 teacher not found: %', p_teacher_id;
  end if;

  if v_requirement.term_status <> 'ACTIVE' then
    v_block_reasons := array_append(v_block_reasons, 'REQUIREMENT_INACTIVE');
  end if;

  if v_requirement.teacher_requirement not in ('REQUIRED', 'OPTIONAL')
     or v_requirement.teacher_assignment_scope <> 'REQUIREMENT'
     or v_requirement.teacher_continuity <> 'REQUIRED' then
    v_block_reasons := array_append(
      v_block_reasons,
      'POLICY_NOT_REQUIREMENT_REQUIRED'
    );
  end if;

  if v_teacher.operational_status <> 'ACTIVE' then
    v_block_reasons := array_append(v_block_reasons, 'RESOURCE_INACTIVE');
  end if;

  if not exists (
    select 1
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = p_requirement_id
      and assignment.teacher_id = p_teacher_id
  ) then
    v_block_reasons := array_append(v_block_reasons, 'TEACHER_NOT_ELIGIBLE');
  end if;

  select
    coalesce(array_agg(card.id order by card.block_index, card.id), array[]::uuid[])
  into v_all_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if cardinality(v_all_card_ids) = 0 then
    v_block_reasons := array_append(v_block_reasons, 'NO_CARDS');
  end if;

  select
    coalesce(array_agg(card.id order by card.block_index, card.id), array[]::uuid[]),
    count(*)::integer,
    count(distinct placement.teacher_id) filter (
      where placement.teacher_id is not null
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'blockIndex', card.block_index,
          'durationPeriods', card.duration_periods,
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period,
          'teacherId', placement.teacher_id,
          'teacherName', current_teacher.name,
          'roomId', placement.room_id,
          'roomName', room.name,
          'willChange', placement.teacher_id is distinct from p_teacher_id
        )
        order by card.block_index, card.id
      ),
      '[]'::jsonb
    )
  into
    v_placed_card_ids,
    v_placed_block_count,
    v_current_teacher_count,
    v_placements
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  left join public.teachers current_teacher
    on current_teacher.id = placement.teacher_id
  left join public.rooms room
    on room.id = placement.room_id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  v_unplaced_block_count :=
    greatest(cardinality(v_all_card_ids) - v_placed_block_count, 0);

  select
    coalesce(array_agg(card.id order by card.block_index, card.id), array[]::uuid[]),
    count(*)::integer
  into
    v_changed_card_ids,
    v_changed_block_count
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id
    and placement.teacher_id is distinct from p_teacher_id;

  if v_placed_block_count = 0 then
    v_block_reasons := array_append(v_block_reasons, 'NO_PLACED_BLOCKS');
  elsif v_changed_block_count = 0 then
    v_block_reasons := array_append(v_block_reasons, 'NO_CHANGES');
  end if;

  if v_changed_block_count > 24 then
    v_block_reasons := array_append(v_block_reasons, 'TOO_MANY_CHANGED_BLOCKS');
  end if;

  if v_changed_block_count between 1 and 24
     and not ('TEACHER_NOT_ELIGIBLE' = any(v_block_reasons))
     and not ('RESOURCE_INACTIVE' = any(v_block_reasons)) then
    v_m29_preview := public.management_preview_placement_resource_change(
      v_changed_card_ids,
      'TEACHER',
      p_teacher_id
    );

    if jsonb_typeof(v_m29_preview -> 'blockReasons') = 'array' then
      select coalesce(
        array_agg(distinct reason order by reason),
        array[]::text[]
      )
      into v_block_reasons
      from (
        select unnest(v_block_reasons) as reason
        union all
        select jsonb_array_elements_text(v_m29_preview -> 'blockReasons')
      ) reasons;
    end if;
  end if;

  select md5(
    jsonb_build_object(
      'requirementId', p_requirement_id,
      'revisionId', v_revision_id,
      'teacherId', p_teacher_id,
      'teacherStatus', v_teacher.operational_status,
      'policy', jsonb_build_object(
        'teacherRequirement', v_requirement.teacher_requirement,
        'teacherMode', v_requirement.teacher_mode,
        'assignmentScope', v_requirement.teacher_assignment_scope,
        'continuity', v_requirement.teacher_continuity
      ),
      'eligibleTeachers', (
        select coalesce(
          jsonb_agg(
            assignment.teacher_id
            order by assignment.teacher_id
          ),
          '[]'::jsonb
        )
        from public.course_requirement_teachers assignment
        where assignment.requirement_id = p_requirement_id
      ),
      'placements', v_placements
    )::text
  )
  into v_state_token;

  return jsonb_build_object(
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'subjectName', v_requirement.subject_name,
    'groupName', v_requirement.group_name,
    'teacherId', p_teacher_id,
    'teacherName', v_teacher.name,
    'placedBlockCount', v_placed_block_count,
    'unplacedBlockCount', v_unplaced_block_count,
    'changedBlockCount', v_changed_block_count,
    'currentDistinctTeacherCount', v_current_teacher_count,
    'placements', v_placements,
    'canApply', (
      v_changed_block_count > 0
      and cardinality(v_block_reasons) = 0
      and coalesce((v_m29_preview ->> 'canApply')::boolean, false)
    ),
    'blockReasons', to_jsonb(v_block_reasons),
    'conflicts', coalesce(v_m29_preview -> 'conflicts', '[]'::jsonb),
    'stateToken', v_state_token,
    'preservesTime', true,
    'preservesRoom', true,
    'changesTeacherPool', false,
    'previewOnly', true
  );
end
$$;


create or replace function public.management_apply_requirement_teacher_reconciliation(
  p_requirement_id uuid,
  p_teacher_id uuid,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_revision_id uuid;
  v_changed_card_ids uuid[];
  v_m29_preview jsonb;
  v_m29_apply jsonb;
  v_before_rows jsonb := '[]'::jsonb;
  v_before record;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.course_requirements requirement
  where requirement.id = p_requirement_id
  for update;

  if not found then
    raise exception 'M32.3.5 requirement not found: %', p_requirement_id;
  end if;

  v_preview := public.management_preview_requirement_teacher_reconciliation(
    p_requirement_id,
    p_teacher_id
  );

  if p_expected_state_token is null
     or p_expected_state_token is distinct from (v_preview ->> 'stateToken') then
    raise exception 'M32.3.5 reconciliation preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception 'M32.3.5 reconciliation apply blocked';
  end if;

  v_revision_id := (v_preview ->> 'revisionId')::uuid;

  select coalesce(
    array_agg(card.id order by card.block_index, card.id),
    array[]::uuid[]
  )
  into v_changed_card_ids
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id
    and placement.teacher_id is distinct from p_teacher_id;

  if cardinality(v_changed_card_ids) = 0 then
    raise exception 'M32.3.5 reconciliation produced no changed cards';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', placement.card_id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period,
        'teacherId', placement.teacher_id,
        'roomId', placement.room_id
      )
      order by placement.card_id
    ),
    '[]'::jsonb
  )
  into v_before_rows
  from public.placements placement
  where placement.card_id = any(v_changed_card_ids);

  v_m29_preview := public.management_preview_placement_resource_change(
    v_changed_card_ids,
    'TEACHER',
    p_teacher_id
  );

  if coalesce((v_m29_preview ->> 'canApply')::boolean, false) is not true then
    raise exception 'M32.3.5 reconciliation became unsafe before apply';
  end if;

  v_m29_apply := public.management_apply_placement_resource_change(
    v_changed_card_ids,
    'TEACHER',
    p_teacher_id,
    v_m29_preview ->> 'stateToken'
  );

  for v_before in
    select
      (entry.value ->> 'cardId')::uuid as card_id,
      (entry.value ->> 'dayOfWeek')::smallint as day_of_week,
      (entry.value ->> 'startPeriod')::smallint as start_period,
      nullif(entry.value ->> 'teacherId', '')::uuid as teacher_id,
      nullif(entry.value ->> 'roomId', '')::uuid as room_id
    from jsonb_array_elements(v_before_rows) as entry(value)
  loop
    perform public.refresh_management_candidate_domain_delta(
      v_revision_id,
      v_before.card_id,
      v_before.day_of_week,
      v_before.start_period,
      v_before.teacher_id,
      v_before.room_id,
      v_before.day_of_week,
      v_before.start_period,
      p_teacher_id,
      v_before.room_id
    );
  end loop;

  if exists (
    select 1
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = p_requirement_id
      and placement.teacher_id is distinct from p_teacher_id
  ) then
    raise exception 'M32.3.5 reconciliation did not converge to one teacher';
  end if;

  return jsonb_build_object(
    'applied', true,
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'teacherId', p_teacher_id,
    'teacherName', v_preview ->> 'teacherName',
    'changedBlockCount', cardinality(v_changed_card_ids),
    'transactionId', v_m29_apply ->> 'transactionId',
    'preservedTime', true,
    'preservedRoom', true,
    'changedTeacherPool', false,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_preview_requirement_teacher_reconciliation(
    uuid, uuid
  )
  from public, anon;
revoke all
  on function public.management_apply_requirement_teacher_reconciliation(
    uuid, uuid, text
  )
  from public, anon;

grant execute
  on function public.management_preview_requirement_teacher_reconciliation(
    uuid, uuid
  )
  to authenticated;
grant execute
  on function public.management_apply_requirement_teacher_reconciliation(
    uuid, uuid, text
  )
  to authenticated;

comment on function public.management_preview_requirement_teacher_reconciliation(
  uuid, uuid
) is
  'M32.3.5 preview for choosing one eligible teacher across all currently placed blocks of a REQUIREMENT+REQUIRED course while preserving time and room.';

comment on function public.management_apply_requirement_teacher_reconciliation(
  uuid, uuid, text
) is
  'M32.3.5 stale-safe atomic teacher reconciliation. Reuses M29 placement override history/undo, preserves time/room, and delta-refreshes affected candidate domains.';

commit;

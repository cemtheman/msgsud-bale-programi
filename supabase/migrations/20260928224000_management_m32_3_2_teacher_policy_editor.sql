-- Management M32.3.2
-- Teacher assignment policy preview/apply editor contract.
--
-- Policy-only mutation. Does NOT rewrite placements, candidates or published
-- schedule rows. REQUIRED continuity may be selected only when current resolved
-- placements already agree on at most one teacher.

begin;

create or replace function public.management_preview_requirement_teacher_policy(
  p_requirement_id uuid,
  p_teacher_assignment_scope text,
  p_teacher_continuity text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement record;
  v_revision_id uuid;
  v_placed_block_count integer;
  v_distinct_teacher_count integer;
  v_blocks jsonb;
  v_can_apply boolean;
  v_block_reasons jsonb;
  v_state_token text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_teacher_assignment_scope not in (
    'REQUIREMENT',
    'BLOCK',
    'UNSPECIFIED'
  ) then
    raise exception 'M32.3.2 invalid teacher assignment scope';
  end if;

  if p_teacher_continuity not in (
    'REQUIRED',
    'PREFERRED',
    'NONE'
  ) then
    raise exception 'M32.3.2 invalid teacher continuity';
  end if;

  if not (
    (
      p_teacher_assignment_scope = 'REQUIREMENT'
      and p_teacher_continuity = 'REQUIRED'
    )
    or (
      p_teacher_assignment_scope = 'BLOCK'
      and p_teacher_continuity in ('PREFERRED', 'NONE')
    )
    or (
      p_teacher_assignment_scope = 'UNSPECIFIED'
      and p_teacher_continuity = 'NONE'
    )
  ) then
    raise exception 'M32.3.2 invalid teacher policy combination';
  end if;

  select
    requirement.id,
    requirement.requirement_set_id,
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
    raise exception 'M32.3.2 requirement not found: %', p_requirement_id;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.requirement_set_id = v_requirement.requirement_set_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M32.3.2 requirement is not part of an active draft';
  end if;

  select
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
          'teacherName', teacher.name,
          'roomId', placement.room_id
        )
        order by card.block_index
      ) filter (where placement.id is not null),
      '[]'::jsonb
    )
  into
    v_placed_block_count,
    v_distinct_teacher_count,
    v_blocks
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  left join public.teachers teacher
    on teacher.id = placement.teacher_id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  v_can_apply := not (
    p_teacher_assignment_scope = 'REQUIREMENT'
    and p_teacher_continuity = 'REQUIRED'
    and coalesce(v_distinct_teacher_count, 0) > 1
  );

  v_block_reasons := case
    when v_can_apply then '[]'::jsonb
    else jsonb_build_array(
      'Mevcut yerleşmiş bloklarda birden fazla öğretmen kullanılıyor.'
    )
  end;

  v_state_token := md5(
    jsonb_build_object(
      'requirementId', p_requirement_id,
      'revisionId', v_revision_id,
      'currentScope', v_requirement.teacher_assignment_scope,
      'currentContinuity', v_requirement.teacher_continuity,
      'placedBlocks', v_blocks
    )::text
  );

  return jsonb_build_object(
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'subjectName', v_requirement.subject_name,
    'groupName', v_requirement.group_name,
    'currentScope', v_requirement.teacher_assignment_scope,
    'currentContinuity', v_requirement.teacher_continuity,
    'proposedScope', p_teacher_assignment_scope,
    'proposedContinuity', p_teacher_continuity,
    'placedBlockCount', coalesce(v_placed_block_count, 0),
    'distinctResolvedTeacherCount', coalesce(v_distinct_teacher_count, 0),
    'placedBlocks', v_blocks,
    'canApply', v_can_apply,
    'blockReasons', v_block_reasons,
    'stateToken', v_state_token,
    'candidateEnforcementActive', false,
    'previewOnly', true
  );
end
$$;


create or replace function public.management_apply_requirement_teacher_policy(
  p_requirement_id uuid,
  p_teacher_assignment_scope text,
  p_teacher_continuity text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_current_preview jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.course_requirements requirement
  where requirement.id = p_requirement_id
  for update;

  if not found then
    raise exception 'M32.3.2 requirement not found: %', p_requirement_id;
  end if;

  v_preview := public.management_preview_requirement_teacher_policy(
    p_requirement_id,
    p_teacher_assignment_scope,
    p_teacher_continuity
  );

  if p_expected_state_token is null
     or p_expected_state_token is distinct from (v_preview ->> 'stateToken') then
    raise exception 'M32.3.2 teacher policy preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception 'M32.3.2 teacher policy apply blocked';
  end if;

  update public.course_requirements requirement
  set
    teacher_assignment_scope = p_teacher_assignment_scope,
    teacher_continuity = p_teacher_continuity
  where requirement.id = p_requirement_id;

  v_current_preview := public.management_preview_requirement_teacher_policy(
    p_requirement_id,
    p_teacher_assignment_scope,
    p_teacher_continuity
  );

  return jsonb_build_object(
    'applied', true,
    'requirementId', p_requirement_id,
    'teacherAssignmentScope', p_teacher_assignment_scope,
    'teacherContinuity', p_teacher_continuity,
    'placedBlockCount', v_current_preview -> 'placedBlockCount',
    'distinctResolvedTeacherCount',
      v_current_preview -> 'distinctResolvedTeacherCount',
    'candidateEnforcementActive', false,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_preview_requirement_teacher_policy(
    uuid, text, text
  )
  from public, anon;
revoke all
  on function public.management_apply_requirement_teacher_policy(
    uuid, text, text, text
  )
  from public, anon;

grant execute
  on function public.management_preview_requirement_teacher_policy(
    uuid, text, text
  )
  to authenticated;
grant execute
  on function public.management_apply_requirement_teacher_policy(
    uuid, text, text, text
  )
  to authenticated;

comment on function public.management_preview_requirement_teacher_policy(
  uuid, text, text
) is
  'M32.3.2 read-only teacher-policy impact preview. REQUIRED continuity is blocked when current resolved placements already use multiple teachers.';

comment on function public.management_apply_requirement_teacher_policy(
  uuid, text, text, text
) is
  'M32.3.2 policy-only apply with stale-state token. Does not mutate placements, candidates or public schedule rows.';

commit;

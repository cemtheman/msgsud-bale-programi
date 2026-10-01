-- Management / M35.2
-- Fast-path teacher departure.
--
-- M35.1 correctly preserved timetable slots but synchronously rebuilt all
-- affected candidate domains. For teachers serving many requirements this can
-- exceed the API statement timeout and roll the whole departure back.
--
-- This patch keeps teacher departure/undo/redo atomic and fast. Current
-- requirement links and teacher operational state become immediately
-- authoritative; stale persisted candidate rows are rejected by the client
-- against the current requirement teacher pool.

begin;

create or replace function public.management_apply_teacher_departure_state(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope jsonb := coalesce(p_target -> 'scope', '{}'::jsonb);
  v_item jsonb;
  v_requirement_ids uuid[];
  v_current jsonb;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  if not coalesce((p_target ->> 'exists')::boolean, false) then
    raise exception 'M35 teacher departure target must preserve teacher identity';
  end if;

  if not exists (
    select 1 from public.teachers teacher where teacher.id = p_teacher_id
  ) then
    raise exception 'M35 teacher departure target not found';
  end if;

  update public.teachers
  set
    operational_status = p_target ->> 'operationalStatus',
    archived_at = nullif(p_target ->> 'archivedAt', '')::timestamptz
  where id = p_teacher_id;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_target -> 'requirementLinks', '[]'::jsonb)
    )
  loop
    if coalesce((v_item ->> 'linked')::boolean, false) then
      insert into public.course_requirement_teachers (
        requirement_id,
        teacher_id
      )
      values (
        (v_item ->> 'requirementId')::uuid,
        p_teacher_id
      )
      on conflict (requirement_id, teacher_id) do nothing;
    else
      delete from public.course_requirement_teachers assignment
      where assignment.requirement_id =
          (v_item ->> 'requirementId')::uuid
        and assignment.teacher_id = p_teacher_id;
    end if;

    update public.course_requirements requirement
    set teacher_mode = v_item ->> 'teacherMode'
    where requirement.id = (v_item ->> 'requirementId')::uuid;
  end loop;

  select coalesce(
    array_agg(value::uuid order by value::uuid),
    array[]::uuid[]
  )
  into v_requirement_ids
  from jsonb_array_elements_text(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_target -> 'placementLinks', '[]'::jsonb)
    )
  loop
    update public.placements placement
    set
      teacher_id = nullif(v_item ->> 'teacherId', '')::uuid,
      updated_at = clock_timestamp()
    where placement.card_id = (v_item ->> 'cardId')::uuid;

    if not found then
      raise exception 'M35 expected placement is missing for card %',
        v_item ->> 'cardId';
    end if;
  end loop;

  -- M35.2 fast path:
  -- do not rebuild the persisted candidate domain inside the departure
  -- transaction. Rebuilding multiple requirements can exceed the API
  -- statement timeout. Current requirement links + teacher operational state
  -- are authoritative; the client rejects stale candidate rows against those
  -- current links. A later explicit planning mutation can rebuild the domain.

  v_current := public.management_teacher_departure_state(
    p_schedule_revision_id,
    p_teacher_id,
    v_scope
  );

  if v_current is distinct from p_target then
    raise exception
      'M35 teacher departure history replay did not reach exact target state';
  end if;
end
$$;

comment on function public.management_apply_teacher_departure_state(uuid, uuid, jsonb) is
  'M35.2 exact teacher departure replay without synchronous candidate-domain rebuild; avoids statement timeout while preserving slot/history semantics.';

commit;

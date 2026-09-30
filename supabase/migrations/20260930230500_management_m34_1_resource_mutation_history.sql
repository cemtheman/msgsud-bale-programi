-- Management / M34.1
-- History-aware Kaynaklar mutation entry points.
--
-- Every user-visible resource mutation captures exact before/after state and
-- appends one RESOURCE root to move_transactions. Existing M18/M28 primitives
-- remain the mutation authority; these wrappers only add serialization/history.

begin;

create or replace function public.management_set_teacher_display_name_v2(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  v_result := public.management_set_teacher_display_name(
    p_schedule_revision_id,
    p_teacher_id,
    p_display_name
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  if v_before is distinct from v_after then
    v_history_id := public.management_record_resource_history(
      p_schedule_revision_id,
      'TEACHER_NAME',
      'TEACHER',
      p_teacher_id,
      v_before,
      v_after
    );
  end if;

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_set_room_display_name_v2(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_result := public.management_set_room_display_name(
    p_schedule_revision_id,
    p_room_id,
    p_display_name
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  if v_before is distinct from v_after then
    v_history_id := public.management_record_resource_history(
      p_schedule_revision_id,
      'ROOM_NAME',
      'ROOM',
      p_room_id,
      v_before,
      v_after
    );
  end if;

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_create_teacher_resource_v2(
  p_schedule_revision_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_resource_id uuid;
  v_before jsonb := jsonb_build_object('exists', false);
  v_after jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_result := public.management_create_teacher_resource(p_name);
  v_resource_id := (v_result ->> 'id')::uuid;

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    v_resource_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'TEACHER_CREATE',
    'TEACHER',
    v_resource_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_create_room_resource_v2(
  p_schedule_revision_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_resource_id uuid;
  v_before jsonb := jsonb_build_object('exists', false);
  v_after jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_result := public.management_create_room_resource(p_name);
  v_resource_id := (v_result ->> 'id')::uuid;

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    v_resource_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'ROOM_CREATE',
    'ROOM',
    v_resource_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_set_teacher_operational_status_v2(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_operational_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  v_result := public.management_set_teacher_operational_status(
    p_schedule_revision_id,
    p_teacher_id,
    p_operational_status
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  if v_before is distinct from v_after then
    v_history_id := public.management_record_resource_history(
      p_schedule_revision_id,
      'TEACHER_STATUS',
      'TEACHER',
      p_teacher_id,
      v_before,
      v_after
    );
  end if;

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_delete_teacher_resource_v2(
  p_schedule_revision_id uuid,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  if not coalesce((v_before ->> 'exists')::boolean, false) then
    raise exception 'M34 teacher delete target not found';
  end if;

  v_result := public.management_delete_teacher_resource(
    p_teacher_id
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'TEACHER',
    p_teacher_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'TEACHER_DELETE',
    'TEACHER',
    p_teacher_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_delete_room_resource_v2(
  p_schedule_revision_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  if not coalesce((v_before ->> 'exists')::boolean, false) then
    raise exception 'M34 room delete target not found';
  end if;

  v_result := public.management_delete_room_resource(
    p_room_id
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'ROOM_DELETE',
    'ROOM',
    p_room_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_apply_room_profile_v2(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_capabilities text[],
  p_knowledge_status text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_result := public.management_apply_room_profile(
    p_schedule_revision_id,
    p_room_id,
    p_capabilities,
    p_knowledge_status,
    p_expected_state_token
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'ROOM_PROFILE',
    'ROOM',
    p_room_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


create or replace function public.management_apply_room_operational_status_v2(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_operational_status text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_history_id uuid;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  v_before := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_result := public.management_apply_room_operational_status(
    p_schedule_revision_id,
    p_room_id,
    p_operational_status,
    p_expected_state_token
  );

  v_after := public.management_resource_history_state(
    p_schedule_revision_id,
    'ROOM',
    p_room_id
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'ROOM_STATUS',
    'ROOM',
    p_room_id,
    v_before,
    v_after
  );

  return v_result || jsonb_build_object(
    'historyTransactionId', v_history_id
  );
end
$$;


revoke all
  on function public.management_set_teacher_display_name_v2(
    uuid, uuid, text
  )
  from public, anon;
revoke all
  on function public.management_set_room_display_name_v2(
    uuid, uuid, text
  )
  from public, anon;
revoke all
  on function public.management_create_teacher_resource_v2(
    uuid, text
  )
  from public, anon;
revoke all
  on function public.management_create_room_resource_v2(
    uuid, text
  )
  from public, anon;
revoke all
  on function public.management_set_teacher_operational_status_v2(
    uuid, uuid, text
  )
  from public, anon;
revoke all
  on function public.management_delete_teacher_resource_v2(
    uuid, uuid
  )
  from public, anon;
revoke all
  on function public.management_delete_room_resource_v2(
    uuid, uuid
  )
  from public, anon;
revoke all
  on function public.management_apply_room_profile_v2(
    uuid, uuid, text[], text, text
  )
  from public, anon;
revoke all
  on function public.management_apply_room_operational_status_v2(
    uuid, uuid, text, text
  )
  from public, anon;

grant execute
  on function public.management_set_teacher_display_name_v2(
    uuid, uuid, text
  )
  to authenticated;
grant execute
  on function public.management_set_room_display_name_v2(
    uuid, uuid, text
  )
  to authenticated;
grant execute
  on function public.management_create_teacher_resource_v2(
    uuid, text
  )
  to authenticated;
grant execute
  on function public.management_create_room_resource_v2(
    uuid, text
  )
  to authenticated;
grant execute
  on function public.management_set_teacher_operational_status_v2(
    uuid, uuid, text
  )
  to authenticated;
grant execute
  on function public.management_delete_teacher_resource_v2(
    uuid, uuid
  )
  to authenticated;
grant execute
  on function public.management_delete_room_resource_v2(
    uuid, uuid
  )
  to authenticated;
grant execute
  on function public.management_apply_room_profile_v2(
    uuid, uuid, text[], text, text
  )
  to authenticated;
grant execute
  on function public.management_apply_room_operational_status_v2(
    uuid, uuid, text, text
  )
  to authenticated;

comment on function public.management_set_teacher_display_name_v2(
  uuid, uuid, text
) is
  'M34 history-aware draft teacher display-name mutation.';
comment on function public.management_set_room_display_name_v2(
  uuid, uuid, text
) is
  'M34 history-aware draft room display-name mutation.';
comment on function public.management_create_teacher_resource_v2(
  uuid, text
) is
  'M34 history-aware teacher creation tied to one DRAFT revision.';
comment on function public.management_create_room_resource_v2(
  uuid, text
) is
  'M34 history-aware room creation tied to one DRAFT revision.';
comment on function public.management_set_teacher_operational_status_v2(
  uuid, uuid, text
) is
  'M34 history-aware teacher active/inactive mutation.';
comment on function public.management_delete_teacher_resource_v2(
  uuid, uuid
) is
  'M34 history-aware exact teacher deletion; undo restores the same UUID.';
comment on function public.management_delete_room_resource_v2(
  uuid, uuid
) is
  'M34 history-aware exact room deletion; undo restores the same UUID.';
comment on function public.management_apply_room_profile_v2(
  uuid, uuid, text[], text, text
) is
  'M34 history-aware room capability/knowledge apply.';
comment on function public.management_apply_room_operational_status_v2(
  uuid, uuid, text, text
) is
  'M34 history-aware room operational-status apply.';

commit;

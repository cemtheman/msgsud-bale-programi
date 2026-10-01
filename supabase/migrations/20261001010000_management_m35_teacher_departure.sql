-- Management / M35.1
-- Controlled teacher departure / archival.
--
-- Allows an editor to keep lesson day/time/room fixed when a teacher leaves:
-- block future assignment only, clear the teacher from current draft lessons,
-- or logically delete/archive the teacher after clearing current-term links.
-- The operation is atomic and one RESOURCE history root.

begin;

alter table public.teachers
  add column if not exists archived_at timestamptz null;

create index if not exists teachers_archived_at_idx
  on public.teachers (archived_at);

comment on column public.teachers.archived_at is
  'M35 logical deletion marker. Archived teachers remain for FK/history integrity but are hidden from active management inventory.';


create or replace function public.management_teacher_departure_scope(
  p_schedule_revision_id uuid,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
begin
  select revision.requirement_set_id
  into v_requirement_set_id
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M35 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  return jsonb_build_object(
    'requirementIds',
    coalesce(
      (
        select jsonb_agg(link.requirement_id order by link.requirement_id)
        from public.course_requirement_teachers link
        join public.course_requirements requirement
          on requirement.id = link.requirement_id
        where requirement.requirement_set_id = v_requirement_set_id
          and link.teacher_id = p_teacher_id
      ),
      '[]'::jsonb
    ),
    'placementCardIds',
    coalesce(
      (
        select jsonb_agg(placement.card_id order by placement.card_id)
        from public.placements placement
        join public.schedule_cards card
          on card.id = placement.card_id
        where card.schedule_revision_id = p_schedule_revision_id
          and placement.teacher_id = p_teacher_id
      ),
      '[]'::jsonb
    )
  );
end
$$;


create or replace function public.management_teacher_departure_state(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_scope jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_status text;
  v_archived_at timestamptz;
  v_display_name text;
begin
  select
    teacher.name,
    teacher.operational_status,
    teacher.archived_at,
    coalesce(override_row.display_name, teacher.name)
  into
    v_name,
    v_status,
    v_archived_at,
    v_display_name
  from public.teachers teacher
  left join public.management_teacher_name_overrides override_row
    on override_row.schedule_revision_id = p_schedule_revision_id
   and override_row.teacher_id = teacher.id
  where teacher.id = p_teacher_id;

  if v_name is null then
    return jsonb_build_object(
      'exists', false,
      'scope', coalesce(p_scope, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'name', v_name,
    'displayName', v_display_name,
    'operationalStatus', v_status,
    'archivedAt', v_archived_at,
    'scope', coalesce(p_scope, '{}'::jsonb),
    'requirementLinks',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'requirementId', scope_item.requirement_id,
            'linked', exists (
              select 1
              from public.course_requirement_teachers assignment
              where assignment.requirement_id = scope_item.requirement_id
                and assignment.teacher_id = p_teacher_id
            )
          )
          order by scope_item.requirement_id
        )
        from (
          select value::uuid as requirement_id
          from jsonb_array_elements_text(
            coalesce(p_scope -> 'requirementIds', '[]'::jsonb)
          )
        ) scope_item
      ),
      '[]'::jsonb
    ),
    'placementLinks',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', scope_item.card_id,
            'teacherId', placement.teacher_id
          )
          order by scope_item.card_id
        )
        from (
          select value::uuid as card_id
          from jsonb_array_elements_text(
            coalesce(p_scope -> 'placementCardIds', '[]'::jsonb)
          )
        ) scope_item
        left join public.placements placement
          on placement.card_id = scope_item.card_id
      ),
      '[]'::jsonb
    )
  );
end
$$;


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
  v_card_ids uuid[];
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
  end loop;

  select coalesce(
    array_agg(value::uuid order by value::uuid),
    array[]::uuid[]
  )
  into v_requirement_ids
  from jsonb_array_elements_text(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );

  if cardinality(v_requirement_ids) > 0 then
    update public.course_requirements requirement
    set teacher_mode = case (
      select count(*)
      from public.course_requirement_teachers assignment
      where assignment.requirement_id = requirement.id
    )
      when 0 then 'UNKNOWN'
      when 1 then 'FIXED'
      else 'ELIGIBLE_POOL'
    end
    where requirement.id = any(v_requirement_ids);
  end if;

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

  select coalesce(
    array_agg(distinct card_id order by card_id),
    array[]::uuid[]
  )
  into v_card_ids
  from (
    select card.id as card_id
    from public.schedule_cards card
    where card.schedule_revision_id = p_schedule_revision_id
      and cardinality(v_requirement_ids) > 0
      and card.requirement_id = any(v_requirement_ids)

    union

    select value::uuid as card_id
    from jsonb_array_elements_text(
      coalesce(v_scope -> 'placementCardIds', '[]'::jsonb)
    )
  ) affected;

  if cardinality(v_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      p_schedule_revision_id,
      v_card_ids
    );
  end if;

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


create or replace function public.management_history_resource_current_state(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_reference_state jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_operation = 'TEACHER_DEPARTURE' then
    if p_resource_type <> 'TEACHER' then
      raise exception 'M35 teacher departure type mismatch';
    end if;

    return public.management_teacher_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_reference_state -> 'scope'
    );
  end if;

  return public.management_resource_history_state(
    p_schedule_revision_id,
    p_resource_type,
    p_resource_id
  );
end
$$;


create or replace function public.management_history_resource_apply_state(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_operation = 'TEACHER_DEPARTURE' then
    if p_resource_type <> 'TEACHER' then
      raise exception 'M35 teacher departure type mismatch';
    end if;

    perform public.management_apply_teacher_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_target
    );
    return;
  end if;

  perform public.management_apply_resource_history_state(
    p_schedule_revision_id,
    p_operation,
    p_resource_type,
    p_resource_id,
    p_target
  );
end
$$;


create or replace function public.management_preview_teacher_departure(
  p_schedule_revision_id uuid,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_scope jsonb;
  v_state jsonb;
  v_active_requirement_count integer;
  v_assignment_count integer;
  v_placement_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M35 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M35 teacher departure preview requires DRAFT revision';
  end if;

  if not exists (
    select 1
    from public.teachers teacher
    where teacher.id = p_teacher_id
      and teacher.archived_at is null
  ) then
    raise exception 'M35 active teacher resource not found';
  end if;

  v_scope := public.management_teacher_departure_scope(
    p_schedule_revision_id,
    p_teacher_id
  );

  v_state := public.management_teacher_departure_state(
    p_schedule_revision_id,
    p_teacher_id,
    v_scope
  );

  v_assignment_count := jsonb_array_length(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );
  v_placement_count := jsonb_array_length(
    coalesce(v_scope -> 'placementCardIds', '[]'::jsonb)
  );

  select count(*)
  into v_active_requirement_count
  from jsonb_array_elements_text(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  ) item(value)
  join public.course_requirements requirement
    on requirement.id = item.value::uuid
  where requirement.term_status = 'ACTIVE';

  return jsonb_build_object(
    'teacherId', p_teacher_id,
    'teacherName', v_state ->> 'displayName',
    'operationalStatus', v_state ->> 'operationalStatus',
    'assignmentCount', v_assignment_count,
    'activeRequirementCount', v_active_requirement_count,
    'placedBlockCount', v_placement_count,
    'stateToken', md5(v_state::text),
    'publishedChanged', false
  );
end
$$;


create or replace function public.management_apply_teacher_departure(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_mode text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope jsonb;
  v_before jsonb;
  v_after jsonb;
  v_requirement_links jsonb;
  v_placement_links jsonb;
  v_archived_at timestamptz;
  v_history_id uuid;
  v_assignment_count integer;
  v_placement_count integer;
  v_card_ids uuid[];
begin
  if p_mode not in (
    'INACTIVATE_KEEP',
    'INACTIVATE_CLEAR',
    'ARCHIVE_CLEAR'
  ) then
    raise exception 'M35 unsupported teacher departure mode: %', p_mode;
  end if;

  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  perform 1
  from public.teachers teacher
  where teacher.id = p_teacher_id
    and teacher.archived_at is null
  for update;

  if not found then
    raise exception 'M35 active teacher resource not found';
  end if;

  v_scope := public.management_teacher_departure_scope(
    p_schedule_revision_id,
    p_teacher_id
  );

  v_before := public.management_teacher_departure_state(
    p_schedule_revision_id,
    p_teacher_id,
    v_scope
  );

  if md5(v_before::text) is distinct from p_expected_state_token then
    raise exception 'M35 teacher departure preview is stale';
  end if;

  v_after := jsonb_set(
    v_before,
    '{operationalStatus}',
    to_jsonb('INACTIVE'::text),
    true
  );

  if p_mode in ('INACTIVATE_CLEAR', 'ARCHIVE_CLEAR') then
    select coalesce(
      jsonb_agg(
        item.value || jsonb_build_object('linked', false)
        order by item.ordinality
      ),
      '[]'::jsonb
    )
    into v_requirement_links
    from jsonb_array_elements(
      coalesce(v_before -> 'requirementLinks', '[]'::jsonb)
    ) with ordinality as item(value, ordinality);

    select coalesce(
      jsonb_agg(
        item.value || jsonb_build_object('teacherId', null)
        order by item.ordinality
      ),
      '[]'::jsonb
    )
    into v_placement_links
    from jsonb_array_elements(
      coalesce(v_before -> 'placementLinks', '[]'::jsonb)
    ) with ordinality as item(value, ordinality);

    v_after := jsonb_set(
      v_after,
      '{requirementLinks}',
      v_requirement_links,
      true
    );
    v_after := jsonb_set(
      v_after,
      '{placementLinks}',
      v_placement_links,
      true
    );
  end if;

  if p_mode = 'ARCHIVE_CLEAR' then
    v_archived_at := clock_timestamp();
    v_after := jsonb_set(
      v_after,
      '{archivedAt}',
      to_jsonb(v_archived_at),
      true
    );
  else
    v_after := jsonb_set(
      v_after,
      '{archivedAt}',
      'null'::jsonb,
      true
    );
  end if;

  if v_before is not distinct from v_after then
    raise exception 'M35 teacher departure refuses no-op';
  end if;

  perform public.management_apply_teacher_departure_state(
    p_schedule_revision_id,
    p_teacher_id,
    v_after
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'TEACHER_DEPARTURE',
    'TEACHER',
    p_teacher_id,
    v_before,
    v_after
  );

  v_assignment_count := jsonb_array_length(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );
  v_placement_count := jsonb_array_length(
    coalesce(v_scope -> 'placementCardIds', '[]'::jsonb)
  );

  select coalesce(
    array_agg(distinct card.id order by card.id),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id
    and card.requirement_id in (
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
      )
    );

  return jsonb_build_object(
    'applied', true,
    'teacherId', p_teacher_id,
    'teacherName', v_before ->> 'displayName',
    'mode', p_mode,
    'assignmentCount', v_assignment_count,
    'placedBlockCount', v_placement_count,
    'candidateRebuildCardCount', cardinality(v_card_ids),
    'historyTransactionId', v_history_id,
    'archived', p_mode = 'ARCHIVE_CLEAR',
    'publishedChanged', false
  );
end
$$;


create or replace function public.management_record_resource_history(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transaction_id uuid;
  v_resource_name text;
begin
  if p_operation not in (
    'TEACHER_NAME',
    'ROOM_NAME',
    'TEACHER_STATUS',
    'ROOM_PROFILE',
    'ROOM_STATUS',
    'TEACHER_CREATE',
    'ROOM_CREATE',
    'TEACHER_DELETE',
    'ROOM_DELETE',
    'TEACHER_DEPARTURE'
  ) then
    raise exception 'M34 unsupported resource operation: %',
      p_operation;
  end if;

  if p_resource_type not in ('TEACHER', 'ROOM') then
    raise exception 'M34 unsupported resource type: %',
      p_resource_type;
  end if;

  if p_before is not distinct from p_after then
    raise exception 'M34 resource history refuses no-op';
  end if;

  v_resource_name := coalesce(
    p_after ->> 'displayName',
    p_before ->> 'displayName',
    p_after ->> 'name',
    p_before ->> 'name',
    case when p_resource_type = 'TEACHER' then 'Öğretmen' else 'Salon' end
  );

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    p_schedule_revision_id,
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M34.0-v1',
      'resource_operation', p_operation,
      'resource_type', p_resource_type,
      'resource_id', p_resource_id,
      'resource_name', v_resource_name,
      'before', p_before,
      'after', p_after
    )
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end
$$;

create or replace function public.undo_management_resource_transaction(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_history_sequence bigint;
  v_root_source text;
  v_payload jsonb;
  v_operation text;
  v_resource_type text;
  v_resource_id uuid;
  v_resource_name text;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_latest_root_id uuid;
  v_undo_id uuid;
  v_reverted_at timestamptz := clock_timestamp();
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.status,
    root_tx.history_sequence,
    root_tx.payload ->> 'source',
    root_tx.payload
  into
    v_revision_id,
    v_revision_status,
    v_history_sequence,
    v_root_source,
    v_payload
  from public.move_transactions root_tx
  join public.schedule_revisions revision
    on revision.id = root_tx.schedule_revision_id
  where root_tx.id = p_root_transaction_id
    and root_tx.actor_type = 'USER'
    and root_tx.action = 'RESOURCE'
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is null
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  for update of revision, root_tx;

  if v_revision_id is null then
    raise exception 'M34 active RESOURCE root not found: %',
      p_root_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M34 resource undo requires DRAFT revision';
  end if;

  select transaction.id
  into v_latest_root_id
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.action in ('PLACE', 'MOVE', 'REMOVE', 'RESOURCE')
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  order by transaction.history_sequence desc
  limit 1;

  if v_latest_root_id is distinct from p_root_transaction_id then
    raise exception
      'M34 undo is LIFO: latest active root is %, requested %',
      v_latest_root_id,
      p_root_transaction_id;
  end if;

  v_operation := v_payload ->> 'resource_operation';
  v_resource_type := v_payload ->> 'resource_type';
  v_resource_id := nullif(v_payload ->> 'resource_id', '')::uuid;
  v_resource_name := v_payload ->> 'resource_name';
  v_before := v_payload -> 'before';
  v_after := v_payload -> 'after';

  if v_operation is null
     or v_resource_type is null
     or v_resource_id is null
     or v_before is null
     or v_after is null then
    raise exception 'M34 RESOURCE root payload is incomplete';
  end if;

  v_current := public.management_history_resource_current_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_after
  );

  if v_current is distinct from v_after then
    raise exception
      'M34 resource undo is stale; current state no longer matches history';
  end if;

  perform public.management_history_resource_apply_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_before
  );

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'ROOT_UNDO',
      'engine_version', 'M34.0-v1',
      'reverts_root_transaction_id', p_root_transaction_id,
      'reverts_root_source', v_root_source,
      'reverted_root_action', 'RESOURCE',
      'reverted_transaction_count', 1,
      'resource_operation', v_operation,
      'resource_type', v_resource_type,
      'resource_id', v_resource_id,
      'resource_name', v_resource_name,
      'before', v_after,
      'after', v_before
    )
  )
  returning id into v_undo_id;

  update public.move_transactions transaction
  set
    reverted_at = v_reverted_at,
    reverted_by_transaction_id = v_undo_id
  where transaction.id = p_root_transaction_id
    and transaction.reverted_at is null;

  if not found then
    raise exception 'M34 resource undo lost ownership of root transaction';
  end if;

  return v_undo_id;
end
$$;

create or replace function public.redo_management_resource_undo(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_undo_history_sequence bigint;
  v_original_root_id uuid;
  v_original_payload jsonb;
  v_operation text;
  v_resource_type text;
  v_resource_id uuid;
  v_resource_name text;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_latest_redoable_undo_id uuid;
  v_redo_id uuid;
  v_redone_at timestamptz := clock_timestamp();
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.status,
    undo_tx.history_sequence,
    nullif(undo_tx.payload ->> 'reverts_root_transaction_id', '')::uuid
  into
    v_revision_id,
    v_revision_status,
    v_undo_history_sequence,
    v_original_root_id
  from public.move_transactions undo_tx
  join public.schedule_revisions revision
    on revision.id = undo_tx.schedule_revision_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.actor_type = 'USER'
    and undo_tx.action = 'RESOURCE'
    and undo_tx.root_transaction_id is null
    and undo_tx.parent_transaction_id is null
    and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null
  for update of revision, undo_tx;

  if v_revision_id is null or v_original_root_id is null then
    raise exception 'M34 active resource undo not found: %',
      p_undo_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M34 resource redo requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.move_transactions transaction
    where transaction.schedule_revision_id = v_revision_id
      and transaction.actor_type = 'USER'
      and transaction.root_transaction_id is null
      and transaction.parent_transaction_id is null
      and transaction.payload ->> 'source' = 'MANUAL'
      and transaction.history_sequence > v_undo_history_sequence
  ) then
    raise exception
      'M34 redo branch was invalidated by a newer management decision';
  end if;

  select candidate.id
  into v_latest_redoable_undo_id
  from public.move_transactions candidate
  where candidate.schedule_revision_id = v_revision_id
    and candidate.actor_type = 'USER'
    and candidate.root_transaction_id is null
    and candidate.parent_transaction_id is null
    and candidate.payload ->> 'source' = 'ROOT_UNDO'
    and candidate.redone_at is null
    and candidate.redone_by_transaction_id is null
    and not exists (
      select 1
      from public.move_transactions manual_tx
      where manual_tx.schedule_revision_id = v_revision_id
        and manual_tx.actor_type = 'USER'
        and manual_tx.root_transaction_id is null
        and manual_tx.parent_transaction_id is null
        and manual_tx.payload ->> 'source' = 'MANUAL'
        and manual_tx.history_sequence > candidate.history_sequence
    )
  order by candidate.history_sequence desc
  limit 1;

  if v_latest_redoable_undo_id is distinct from p_undo_transaction_id then
    raise exception
      'M34 redo is LIFO: latest redoable undo is %, requested %',
      v_latest_redoable_undo_id,
      p_undo_transaction_id;
  end if;

  select root_tx.payload
  into v_original_payload
  from public.move_transactions root_tx
  where root_tx.id = v_original_root_id
    and root_tx.schedule_revision_id = v_revision_id
    and root_tx.actor_type = 'USER'
    and root_tx.action = 'RESOURCE'
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is not null
    and root_tx.reverted_by_transaction_id = p_undo_transaction_id
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_original_payload is null then
    raise exception 'M34 original resource root is missing';
  end if;

  v_operation := v_original_payload ->> 'resource_operation';
  v_resource_type := v_original_payload ->> 'resource_type';
  v_resource_id :=
    nullif(v_original_payload ->> 'resource_id', '')::uuid;
  v_resource_name := v_original_payload ->> 'resource_name';
  v_before := v_original_payload -> 'before';
  v_after := v_original_payload -> 'after';

  if v_operation is null
     or v_resource_type is null
     or v_resource_id is null
     or v_before is null
     or v_after is null then
    raise exception 'M34 original RESOURCE root payload is incomplete';
  end if;

  v_current := public.management_history_resource_current_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_before
  );

  if v_current is distinct from v_before then
    raise exception
      'M34 resource redo is stale; current state no longer matches undo state';
  end if;

  perform public.management_history_resource_apply_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_after
  );

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'ROOT_REDO',
      'engine_version', 'M34.0-v1',
      'redo_of_undo_transaction_id', p_undo_transaction_id,
      'replays_root_transaction_id', v_original_root_id,
      'resource_operation', v_operation,
      'resource_type', v_resource_type,
      'resource_id', v_resource_id,
      'resource_name', v_resource_name,
      'before', v_before,
      'after', v_after
    )
  )
  returning id into v_redo_id;

  update public.move_transactions undo_tx
  set
    redone_at = v_redone_at,
    redone_by_transaction_id = v_redo_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null;

  if not found then
    raise exception 'M34 resource redo lost ownership of undo transaction';
  end if;

  return v_redo_id;
end
$$;

revoke all on function public.management_teacher_departure_scope(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.management_teacher_departure_state(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_apply_teacher_departure_state(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_history_resource_current_state(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_history_resource_apply_state(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.management_preview_teacher_departure(uuid, uuid)
  from public, anon;
revoke all on function public.management_apply_teacher_departure(uuid, uuid, text, text)
  from public, anon;

grant execute on function public.management_preview_teacher_departure(uuid, uuid)
  to authenticated;
grant execute on function public.management_apply_teacher_departure(uuid, uuid, text, text)
  to authenticated;

comment on function public.management_preview_teacher_departure(uuid, uuid) is
  'M35 preview for retiring/archiving a teacher while preserving lesson slots.';
comment on function public.management_apply_teacher_departure(uuid, uuid, text, text) is
  'M35 atomic teacher departure. Can preserve current assignments, clear teacher links while preserving day/time/room, or archive the teacher. One global RESOURCE history root.';

commit;

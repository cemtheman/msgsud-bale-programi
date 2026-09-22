-- Management / M19.7
-- Read-only public write-contract proof.
--
-- The legacy public projection tables predate the management migration series,
-- so their creation DDL is not available in this repository. Before adding any
-- destructive publication RPC, expose and validate their live write contract:
-- columns, defaults, keys, inbound FKs and triggers.
--
-- This migration does NOT mutate schedule_sessions or session_groups.

begin;

create or replace function public.management_preview_public_write_contract(
  p_academic_year text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule_columns jsonb;
  v_group_columns jsonb;
  v_schedule_constraints jsonb;
  v_group_constraints jsonb;
  v_schedule_inbound_fks jsonb;
  v_group_inbound_fks jsonb;
  v_schedule_triggers jsonb;
  v_group_triggers jsonb;

  v_missing_schedule_columns text[];
  v_missing_group_columns text[];

  v_schedule_id_uuid boolean;
  v_group_id_uuid boolean;
  v_group_session_fk boolean;
  v_unexpected_schedule_inbound_fk_count integer;
  v_unexpected_group_inbound_fk_count integer;
  v_schedule_trigger_count integer;
  v_group_trigger_count integer;

  v_schedule_count integer;
  v_group_count integer;

  v_write_shape_supported boolean;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M19.7 management VIEWER role required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', column_row.column_name,
        'ordinal', column_row.ordinal_position,
        'dataType', column_row.data_type,
        'udtName', column_row.udt_name,
        'nullable', column_row.is_nullable = 'YES',
        'default', column_row.column_default,
        'identity', column_row.is_identity = 'YES',
        'generated', column_row.is_generated
      )
      order by column_row.ordinal_position
    ),
    '[]'::jsonb
  )
  into v_schedule_columns
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'schedule_sessions';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', column_row.column_name,
        'ordinal', column_row.ordinal_position,
        'dataType', column_row.data_type,
        'udtName', column_row.udt_name,
        'nullable', column_row.is_nullable = 'YES',
        'default', column_row.column_default,
        'identity', column_row.is_identity = 'YES',
        'generated', column_row.is_generated
      )
      order by column_row.ordinal_position
    ),
    '[]'::jsonb
  )
  into v_group_columns
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'session_groups';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', constraint_row.conname,
        'type', constraint_row.contype,
        'definition', pg_get_constraintdef(constraint_row.oid, true)
      )
      order by constraint_row.conname
    ),
    '[]'::jsonb
  )
  into v_schedule_constraints
  from pg_constraint constraint_row
  join pg_class table_row
    on table_row.oid = constraint_row.conrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'schedule_sessions';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', constraint_row.conname,
        'type', constraint_row.contype,
        'definition', pg_get_constraintdef(constraint_row.oid, true)
      )
      order by constraint_row.conname
    ),
    '[]'::jsonb
  )
  into v_group_constraints
  from pg_constraint constraint_row
  join pg_class table_row
    on table_row.oid = constraint_row.conrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'session_groups';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'constraintName', constraint_row.conname,
        'fromSchema', from_namespace.nspname,
        'fromTable', from_table.relname,
        'definition', pg_get_constraintdef(constraint_row.oid, true)
      )
      order by from_namespace.nspname, from_table.relname, constraint_row.conname
    ),
    '[]'::jsonb
  )
  into v_schedule_inbound_fks
  from pg_constraint constraint_row
  join pg_class referenced_table
    on referenced_table.oid = constraint_row.confrelid
  join pg_namespace referenced_namespace
    on referenced_namespace.oid = referenced_table.relnamespace
  join pg_class from_table
    on from_table.oid = constraint_row.conrelid
  join pg_namespace from_namespace
    on from_namespace.oid = from_table.relnamespace
  where constraint_row.contype = 'f'
    and referenced_namespace.nspname = 'public'
    and referenced_table.relname = 'schedule_sessions';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'constraintName', constraint_row.conname,
        'fromSchema', from_namespace.nspname,
        'fromTable', from_table.relname,
        'definition', pg_get_constraintdef(constraint_row.oid, true)
      )
      order by from_namespace.nspname, from_table.relname, constraint_row.conname
    ),
    '[]'::jsonb
  )
  into v_group_inbound_fks
  from pg_constraint constraint_row
  join pg_class referenced_table
    on referenced_table.oid = constraint_row.confrelid
  join pg_namespace referenced_namespace
    on referenced_namespace.oid = referenced_table.relnamespace
  join pg_class from_table
    on from_table.oid = constraint_row.conrelid
  join pg_namespace from_namespace
    on from_namespace.oid = from_table.relnamespace
  where constraint_row.contype = 'f'
    and referenced_namespace.nspname = 'public'
    and referenced_table.relname = 'session_groups';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', trigger_row.tgname,
        'definition', pg_get_triggerdef(trigger_row.oid, true),
        'enabled', trigger_row.tgenabled
      )
      order by trigger_row.tgname
    ),
    '[]'::jsonb
  )
  into v_schedule_triggers
  from pg_trigger trigger_row
  join pg_class table_row
    on table_row.oid = trigger_row.tgrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'schedule_sessions'
    and not trigger_row.tgisinternal;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', trigger_row.tgname,
        'definition', pg_get_triggerdef(trigger_row.oid, true),
        'enabled', trigger_row.tgenabled
      )
      order by trigger_row.tgname
    ),
    '[]'::jsonb
  )
  into v_group_triggers
  from pg_trigger trigger_row
  join pg_class table_row
    on table_row.oid = trigger_row.tgrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'session_groups'
    and not trigger_row.tgisinternal;

  select array_agg(required_column order by required_column)
  into v_missing_schedule_columns
  from unnest(array[
    'id',
    'academic_year',
    'day_of_week',
    'start_time',
    'end_time',
    'session_type',
    'notes',
    'subject_id',
    'teacher_id',
    'room_id'
  ]::text[]) required_column
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'schedule_sessions'
      and column_row.column_name = required_column
  );

  select array_agg(required_column order by required_column)
  into v_missing_group_columns
  from unnest(array[
    'id',
    'session_id',
    'class_group_id',
    'target',
    'subgroup'
  ]::text[]) required_column
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'session_groups'
      and column_row.column_name = required_column
  );

  select exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'schedule_sessions'
      and column_row.column_name = 'id'
      and column_row.udt_name = 'uuid'
  )
  into v_schedule_id_uuid;

  select exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'session_groups'
      and column_row.column_name = 'id'
      and column_row.udt_name = 'uuid'
  )
  into v_group_id_uuid;

  select exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_row
      on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row
      on namespace_row.oid = table_row.relnamespace
    join pg_class referenced_table
      on referenced_table.oid = constraint_row.confrelid
    join pg_namespace referenced_namespace
      on referenced_namespace.oid = referenced_table.relnamespace
    where constraint_row.contype = 'f'
      and namespace_row.nspname = 'public'
      and table_row.relname = 'session_groups'
      and referenced_namespace.nspname = 'public'
      and referenced_table.relname = 'schedule_sessions'
  )
  into v_group_session_fk;

  select count(*)
  into v_unexpected_schedule_inbound_fk_count
  from pg_constraint constraint_row
  join pg_class referenced_table
    on referenced_table.oid = constraint_row.confrelid
  join pg_namespace referenced_namespace
    on referenced_namespace.oid = referenced_table.relnamespace
  join pg_class from_table
    on from_table.oid = constraint_row.conrelid
  join pg_namespace from_namespace
    on from_namespace.oid = from_table.relnamespace
  where constraint_row.contype = 'f'
    and referenced_namespace.nspname = 'public'
    and referenced_table.relname = 'schedule_sessions'
    and not (
      from_namespace.nspname = 'public'
      and from_table.relname = 'session_groups'
    );

  select count(*)
  into v_unexpected_group_inbound_fk_count
  from pg_constraint constraint_row
  join pg_class referenced_table
    on referenced_table.oid = constraint_row.confrelid
  join pg_namespace referenced_namespace
    on referenced_namespace.oid = referenced_table.relnamespace
  join pg_class from_table
    on from_table.oid = constraint_row.conrelid
  join pg_namespace from_namespace
    on from_namespace.oid = from_table.relnamespace
  where constraint_row.contype = 'f'
    and referenced_namespace.nspname = 'public'
    and referenced_table.relname = 'session_groups';

  select count(*)
  into v_schedule_trigger_count
  from pg_trigger trigger_row
  join pg_class table_row
    on table_row.oid = trigger_row.tgrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'schedule_sessions'
    and not trigger_row.tgisinternal;

  select count(*)
  into v_group_trigger_count
  from pg_trigger trigger_row
  join pg_class table_row
    on table_row.oid = trigger_row.tgrelid
  join pg_namespace namespace_row
    on namespace_row.oid = table_row.relnamespace
  where namespace_row.nspname = 'public'
    and table_row.relname = 'session_groups'
    and not trigger_row.tgisinternal;

  select count(*)
  into v_schedule_count
  from public.schedule_sessions
  where academic_year = p_academic_year;

  select count(*)
  into v_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = p_academic_year;

  v_write_shape_supported :=
    coalesce(cardinality(v_missing_schedule_columns), 0) = 0
    and coalesce(cardinality(v_missing_group_columns), 0) = 0
    and v_schedule_id_uuid
    and v_group_id_uuid
    and v_group_session_fk
    and v_unexpected_schedule_inbound_fk_count = 0
    and v_unexpected_group_inbound_fk_count = 0
    and v_schedule_trigger_count = 0
    and v_group_trigger_count = 0;

  return jsonb_build_object(
    'academicYear', p_academic_year,
    'writeShapeSupported', v_write_shape_supported,
    'scheduleSessionColumns', v_schedule_columns,
    'sessionGroupColumns', v_group_columns,
    'scheduleSessionConstraints', v_schedule_constraints,
    'sessionGroupConstraints', v_group_constraints,
    'scheduleSessionInboundForeignKeys', v_schedule_inbound_fks,
    'sessionGroupInboundForeignKeys', v_group_inbound_fks,
    'scheduleSessionTriggers', v_schedule_triggers,
    'sessionGroupTriggers', v_group_triggers,
    'checks', jsonb_build_object(
      'missingScheduleSessionColumns',
        coalesce(to_jsonb(v_missing_schedule_columns), '[]'::jsonb),
      'missingSessionGroupColumns',
        coalesce(to_jsonb(v_missing_group_columns), '[]'::jsonb),
      'scheduleSessionIdIsUuid', v_schedule_id_uuid,
      'sessionGroupIdIsUuid', v_group_id_uuid,
      'sessionGroupReferencesScheduleSession', v_group_session_fk,
      'unexpectedScheduleSessionInboundForeignKeyCount',
        v_unexpected_schedule_inbound_fk_count,
      'unexpectedSessionGroupInboundForeignKeyCount',
        v_unexpected_group_inbound_fk_count,
      'scheduleSessionTriggerCount',
        v_schedule_trigger_count,
      'sessionGroupTriggerCount',
        v_group_trigger_count
    ),
    'currentProjection', jsonb_build_object(
      'sessionCount', v_schedule_count,
      'groupCount', v_group_count
    )
  );
end
$$;

revoke all
  on function public.management_preview_public_write_contract(text)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_public_write_contract(text)
  to authenticated;

comment on function public.management_preview_public_write_contract(text) is
  'M19.7 read-only live-schema proof for the legacy public schedule projection tables. Exposes exact column/default/constraint/FK/trigger metadata and whether the tables are structurally safe for a future atomic replacement.';


-- Migration itself must not change the current public projection.
do $$
declare
  v_sessions integer;
  v_groups integer;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M19.7 modified public projection unexpectedly: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;
end
$$;

commit;

-- Management / M21.1.1
-- SQL Editor validation diagnostic for the M21.1 term-aware publication contract.
--
-- The M21.1 preview wrappers intentionally retain management VIEWER semantics.
-- Linked SQL Editor sessions do not carry auth.uid(), so this migration adds a
-- separate read-only diagnostic instead of weakening production authorization.
--
-- SAFETY:
--   * no production preview/apply authorization change
--   * no publication EXECUTE grant
--   * no template apply EXECUTE grant
--   * no schedule/public data mutation

begin;

create or replace function public.management_diagnose_term_publication_contract(
  p_academic_year text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_metadata record;
  v_control record;
  v_session_count integer;
  v_group_count integer;
  v_distinct_term_count integer;
  v_public_term_mismatch_count integer;
  v_term_column_present boolean;
  v_term_column_smallint boolean;
  v_term_column_not_null boolean;
  v_term_constraint_present boolean;
  v_publication_term_column_present boolean;
  v_publication_term_not_null boolean;
  v_publication_term_trigger_present boolean;
  v_projection_wrapper_definition text;
  v_write_contract_definition text;
  v_apply_wrapper_definition text;
  v_projection_wrapper_term_aware boolean;
  v_write_contract_term_aware boolean;
  v_apply_wrapper_term_aware boolean;
  v_baseline jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M21.1.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    metadata.active_term,
    metadata.projection_version,
    metadata.runtime_adjustments_required
  into v_metadata
  from public.schedule_projection_metadata metadata
  where metadata.academic_year = p_academic_year;

  select
    control.active_term,
    control.runtime_adjustments_reconciled
  into v_control
  from public.management_publication_controls control
  where control.academic_year = p_academic_year;

  select
    count(*)::integer,
    count(distinct session_row.term)::integer,
    count(*) filter (
      where v_metadata.active_term is not null
        and session_row.term <> v_metadata.active_term
    )::integer
  into
    v_session_count,
    v_distinct_term_count,
    v_public_term_mismatch_count
  from public.schedule_sessions session_row
  where session_row.academic_year = p_academic_year;

  select count(*)::integer
  into v_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = p_academic_year;

  select
    count(*) = 1,
    bool_and(column_row.udt_name = 'int2'),
    bool_and(column_row.is_nullable = 'NO')
  into
    v_term_column_present,
    v_term_column_smallint,
    v_term_column_not_null
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'schedule_sessions'
    and column_row.column_name = 'term';

  select exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid =
        'public.schedule_sessions'::regclass
      and constraint_row.conname =
        'schedule_sessions_term_check'
      and constraint_row.contype = 'c'
  )
  into v_term_constraint_present;

  select
    count(*) = 1,
    bool_and(column_row.is_nullable = 'NO')
  into
    v_publication_term_column_present,
    v_publication_term_not_null
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'management_publications'
    and column_row.column_name = 'term';

  select exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid =
        'public.management_publications'::regclass
      and trigger_row.tgname =
        'trg_management_publication_sync_term'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
  )
  into v_publication_term_trigger_present;

  select pg_get_functiondef(
    'public.management_preview_public_projection(uuid)'::regprocedure
  )
  into v_projection_wrapper_definition;

  select pg_get_functiondef(
    'public.management_preview_public_write_contract(text)'::regprocedure
  )
  into v_write_contract_definition;

  select pg_get_functiondef(
    'public.management_apply_publication(uuid,text)'::regprocedure
  )
  into v_apply_wrapper_definition;

  v_projection_wrapper_term_aware :=
    position('termAwareProjection' in v_projection_wrapper_definition) > 0
    and position(
      'management_preview_public_projection_m19_6'
      in v_projection_wrapper_definition
    ) > 0;

  v_write_contract_term_aware :=
    position('termContract' in v_write_contract_definition) > 0
    and position(
      'management_preview_public_write_contract_m19_7_1'
      in v_write_contract_definition
    ) > 0;

  v_apply_wrapper_term_aware :=
    position(
      'management_apply_publication_m19_8_term_legacy'
      in v_apply_wrapper_definition
    ) > 0
    and position('active_term' in v_apply_wrapper_definition) > 0
    and position(
      'management_publication_sessions'
      in v_apply_wrapper_definition
    ) > 0;

  v_baseline :=
    public.management_publication_baseline_status(
      p_academic_year
    );

  return jsonb_build_object(
    'academicYear', p_academic_year,
    'publicProjection', jsonb_build_object(
      'sessionCount', v_session_count,
      'groupCount', v_group_count,
      'distinctTermCount', v_distinct_term_count,
      'termMismatchCount', v_public_term_mismatch_count
    ),
    'metadata', jsonb_build_object(
      'activeTerm', v_metadata.active_term,
      'projectionVersion', v_metadata.projection_version,
      'runtimeAdjustmentsRequired',
        v_metadata.runtime_adjustments_required
    ),
    'publicationControl', jsonb_build_object(
      'activeTerm', v_control.active_term,
      'runtimeAdjustmentsReconciled',
        v_control.runtime_adjustments_reconciled
    ),
    'schemaContract', jsonb_build_object(
      'scheduleSessionTermColumnPresent',
        v_term_column_present,
      'scheduleSessionTermSmallint',
        coalesce(v_term_column_smallint, false),
      'scheduleSessionTermNotNull',
        coalesce(v_term_column_not_null, false),
      'scheduleSessionTermConstraintPresent',
        v_term_constraint_present,
      'publicationTermColumnPresent',
        v_publication_term_column_present,
      'publicationTermNotNull',
        coalesce(v_publication_term_not_null, false),
      'publicationTermSyncTriggerPresent',
        v_publication_term_trigger_present
    ),
    'functionContract', jsonb_build_object(
      'projectionWrapperTermAware',
        v_projection_wrapper_term_aware,
      'writeContractTermAware',
        v_write_contract_term_aware,
      'applyWrapperTermAware',
        v_apply_wrapper_term_aware
    ),
    'authorization', jsonb_build_object(
      'publicationApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_apply_publication(uuid,text)',
          'EXECUTE'
        ),
      'legacyPublicationApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_apply_publication_m19_8_term_legacy(uuid,text)',
          'EXECUTE'
        ),
      'templateApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_create_term_from_template(uuid,text,smallint)',
          'EXECUTE'
        )
    ),
    'baseline', v_baseline
  );
end
$$;

revoke all
  on function public.management_diagnose_term_publication_contract(text)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_term_publication_contract(text)
  to authenticated;

comment on function public.management_diagnose_term_publication_contract(text) is
  'M21.1.1 read-only SQL Editor / management diagnostic. Validates live term schema, wrapper installation, authorization locks, active-term alignment and durable public baseline without invoking role-gated publication previews.';


do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication_m19_8_term_legacy(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1.1 legacy publication engine must remain locked';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1.1 must not unlock term template apply';
  end if;
end
$$;

commit;

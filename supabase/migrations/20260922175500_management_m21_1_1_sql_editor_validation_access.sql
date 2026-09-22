-- Management / M21.1.1
-- Allow linked postgres / SQL Editor to run M21.1 read-only validation wrappers.
--
-- SAFETY:
--   * read-only preview/diagnostic access only
--   * no publication EXECUTE grant
--   * no template apply EXECUTE grant
--   * no schedule/public data mutation

begin;

create or replace function public.management_preview_public_projection(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_term smallint;
  v_sessions jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M21.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  select requirement_set.term
  into v_term
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M21.1 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  v_base :=
    public.management_preview_public_projection_m19_6(
      p_schedule_revision_id
    );

  select coalesce(
    jsonb_agg(
      session_row.value
      || jsonb_build_object('term', v_term)
      order by session_row.ordinality
    ),
    '[]'::jsonb
  )
  into v_sessions
  from jsonb_array_elements(
    coalesce(v_base -> 'sessions', '[]'::jsonb)
  ) with ordinality as session_row(value, ordinality);

  return
    jsonb_set(
      v_base,
      '{sessions}',
      v_sessions,
      true
    )
    || jsonb_build_object(
      'publicTerm', v_term,
      'termAwareProjection', true
    );
end
$$;

revoke all
  on function public.management_preview_public_projection(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_public_projection(uuid)
  to authenticated;


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
  v_base jsonb;
  v_term_column_present boolean;
  v_term_column_smallint boolean;
  v_term_column_not_null boolean;
  v_term_constraint_present boolean;
  v_supported boolean;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M21.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_preview_public_write_contract_m19_7_1(
      p_academic_year
    );

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

  v_supported :=
    coalesce((v_base ->> 'writeShapeSupported')::boolean, false)
    and v_term_column_present
    and coalesce(v_term_column_smallint, false)
    and coalesce(v_term_column_not_null, false)
    and v_term_constraint_present;

  return
    jsonb_set(
      v_base,
      '{writeShapeSupported}',
      to_jsonb(v_supported),
      true
    )
    || jsonb_build_object(
      'termContract',
      jsonb_build_object(
        'termColumnPresent', v_term_column_present,
        'termColumnSmallint',
          coalesce(v_term_column_smallint, false),
        'termColumnNotNull',
          coalesce(v_term_column_not_null, false),
        'termConstraintPresent', v_term_constraint_present
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
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1.1 must not unlock term template apply';
  end if;
end
$$;

commit;

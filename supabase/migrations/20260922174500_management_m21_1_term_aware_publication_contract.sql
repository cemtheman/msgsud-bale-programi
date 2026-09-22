-- Management / M21.1
-- Term-aware publication contract.
--
-- M21 made academic_year + term a first-class schedule identity. M21.1 closes
-- the remaining publication seams without enabling publication:
--   * projection preview exposes term on every projected public session
--   * public write-contract explicitly requires schedule_sessions.term
--   * publication audit derives term from its requirement set
--   * the locked M19.8 publication engine is wrapped so a future publication
--     atomically switches the active public term and durable hashes
--
-- SAFETY:
--   * no publication is executed by this migration
--   * no M20.3 invocation
--   * no candidate/resource semantics change
--   * public 2026-2027 rows remain 517 / 609 and term 1
--   * authenticated publication EXECUTE remains revoked

begin;


-- -------------------------------------------------------------------------
-- PUBLICATION AUDIT TERM GUARD
-- -------------------------------------------------------------------------
-- M19.8 predates the M21 term column on management_publications. Keep its
-- locked implementation intact and derive the audit term server-side from the
-- referenced requirement set whenever a future publication is executed.

create or replace function public.management_publication_sync_term()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_term smallint;
begin
  select requirement_set.term
  into v_term
  from public.requirement_sets requirement_set
  where requirement_set.id = new.requirement_set_id;

  if v_term is null then
    raise exception
      'M21.1 publication requirement set missing: %',
      new.requirement_set_id;
  end if;

  if new.term is not null
     and new.term is distinct from v_term then
    raise exception
      'M21.1 publication term % does not match requirement-set term %',
      new.term,
      v_term;
  end if;

  new.term := v_term;
  return new;
end
$$;

drop trigger if exists trg_management_publication_sync_term
  on public.management_publications;

create trigger trg_management_publication_sync_term
before insert or update of requirement_set_id, term
on public.management_publications
for each row
execute function public.management_publication_sync_term();


-- -------------------------------------------------------------------------
-- TERM-AWARE PROJECTION PREVIEW
-- -------------------------------------------------------------------------

alter function public.management_preview_public_projection(uuid)
  rename to management_preview_public_projection_m19_6;

revoke all
  on function public.management_preview_public_projection_m19_6(uuid)
  from public, anon, authenticated;

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
  if not public.has_management_role('VIEWER') then
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

comment on function public.management_preview_public_projection(uuid) is
  'M21.1 term-aware wrapper over the M19.6 projection proof. Every projected session carries the target term while preserving the existing semantic projection hash contract used by the locked M19.8 engine.';


-- -------------------------------------------------------------------------
-- TERM-AWARE PUBLIC WRITE CONTRACT
-- -------------------------------------------------------------------------

alter function public.management_preview_public_write_contract(text)
  rename to management_preview_public_write_contract_m19_7_1;

revoke all
  on function public.management_preview_public_write_contract_m19_7_1(text)
  from public, anon, authenticated;

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
  if not public.has_management_role('VIEWER') then
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

comment on function public.management_preview_public_write_contract(text) is
  'M21.1 term-aware public write proof. Preserves the M19.7.1 schema/trigger/enum checks and additionally requires a constrained NOT NULL smallint schedule_sessions.term column.';


-- -------------------------------------------------------------------------
-- TERM-AWARE LOCKED PUBLICATION WRAPPER
-- -------------------------------------------------------------------------
-- Keep the validated M19.8 implementation as the inner atomic engine. The
-- wrapper adds the M21 term handoff after that engine has produced the public
-- rows and audit, still in the SAME database transaction.

alter function public.management_apply_publication(uuid, text)
  rename to management_apply_publication_m19_8_term_legacy;

revoke all
  on function public.management_apply_publication_m19_8_term_legacy(uuid, text)
  from public, anon, authenticated;

create or replace function public.management_apply_publication(
  p_schedule_revision_id uuid,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_result jsonb;
  v_publication_id uuid;
  v_after_sessions_hash text;
  v_after_groups_hash text;
  v_public_session_count integer;
  v_wrong_term_count integer;
  v_baseline jsonb;
begin
  if not public.has_management_role('ADMIN') then
    raise exception 'M21.1 management ADMIN role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.status as revision_status,
    requirement_set.id as requirement_set_id,
    requirement_set.status as requirement_set_status,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M21.1 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.term not between 1 and 2 then
    raise exception
      'M21.1 publication target term must be 1 or 2';
  end if;

  -- M19.8 remains the authority for locking, stale-token validation,
  -- publication readiness, public replacement, audit creation, freeze/clone,
  -- candidate rebuild and runtime-overlay handoff.
  v_result :=
    public.management_apply_publication_m19_8_term_legacy(
      p_schedule_revision_id,
      p_expected_state_token
    );

  v_publication_id :=
    nullif(v_result ->> 'publicationId', '')::uuid;

  if v_publication_id is null then
    raise exception 'M21.1 inner publication returned no publication id';
  end if;

  -- M19.8 was authored before schedule_sessions.term and therefore inserts
  -- using the M21 default (1). Normalize the newly replaced target-year public
  -- projection to the actual revision term before this transaction commits.
  update public.schedule_sessions session_row
  set term = v_revision.term
  where session_row.academic_year =
    v_revision.academic_year;

  update public.schedule_projection_metadata metadata
  set
    active_term = v_revision.term,
    updated_at = now()
  where metadata.academic_year =
    v_revision.academic_year;

  update public.management_publication_controls control
  set
    active_term = v_revision.term,
    updated_at = now()
  where control.academic_year =
    v_revision.academic_year;

  update public.management_publication_sessions publication_session
  set evidence =
    publication_session.evidence
    || jsonb_build_object('term', v_revision.term)
  where publication_session.publication_id =
    v_publication_id;

  v_after_sessions_hash :=
    public.management_public_sessions_hash(
      v_revision.academic_year
    );

  v_after_groups_hash :=
    public.management_public_groups_hash(
      v_revision.academic_year
    );

  update public.management_publications publication
  set
    term = v_revision.term,
    after_sessions_hash = v_after_sessions_hash,
    after_groups_hash = v_after_groups_hash,
    readiness =
      publication.readiness
      || jsonb_build_object(
        'termLifecycle',
        jsonb_build_object(
          'academicYear', v_revision.academic_year,
          'term', v_revision.term,
          'activePublicTerm', v_revision.term,
          'contract', 'M21.1'
        )
      )
  where publication.id = v_publication_id
    and publication.requirement_set_id =
      v_revision.requirement_set_id;

  if not found then
    raise exception
      'M21.1 publication audit row missing after inner publication';
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions session_row
  where session_row.academic_year =
    v_revision.academic_year;

  select count(*)
  into v_wrong_term_count
  from public.schedule_sessions session_row
  where session_row.academic_year =
      v_revision.academic_year
    and session_row.term <> v_revision.term;

  if v_public_session_count = 0 then
    raise exception
      'M21.1 publication produced no public sessions';
  end if;

  if v_wrong_term_count <> 0 then
    raise exception
      'M21.1 publication term normalization failed: % mismatched rows',
      v_wrong_term_count;
  end if;

  v_baseline :=
    public.management_publication_baseline_status(
      v_revision.academic_year
    );

  if not coalesce(
    (v_baseline ->> 'healthy')::boolean,
    false
  ) then
    raise exception
      'M21.1 post-term publication baseline verification failed';
  end if;

  return
    v_result
    || jsonb_build_object(
      'academicYear', v_revision.academic_year,
      'term', v_revision.term,
      'activePublicTerm', v_revision.term,
      'sessionProjectionHash', v_after_sessions_hash,
      'groupProjectionHash', v_after_groups_hash,
      'termAwarePublication', true
    );
end
$$;

-- Still intentionally LOCKED.
revoke all
  on function public.management_apply_publication(uuid, text)
  from public, anon, authenticated;

comment on function public.management_apply_publication(uuid, text) is
  'M21.1 LOCKED term-aware wrapper over the M19.8 atomic publication engine. Future execution replaces the target academic-year public projection, normalizes all rows to the revision term, records the audit term, switches active_term metadata/control and re-anchors durable after hashes in the same transaction.';


-- -------------------------------------------------------------------------
-- TERM-AWARE PUBLICATION CONTRACT DIAGNOSTIC
-- -------------------------------------------------------------------------

create or replace function public.management_term_publication_contract_status(
  p_academic_year text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with metadata as (
    select active_term, projection_version
    from public.schedule_projection_metadata
    where academic_year = p_academic_year
  ),
  control as (
    select active_term
    from public.management_publication_controls
    where academic_year = p_academic_year
  ),
  public_state as (
    select
      count(*)::integer as session_count,
      count(*) filter (
        where session_row.term <>
          (select active_term from metadata)
      )::integer as metadata_term_mismatch_count,
      count(distinct session_row.term)::integer
        as distinct_term_count
    from public.schedule_sessions session_row
    where session_row.academic_year = p_academic_year
  )
  select jsonb_build_object(
    'academicYear', p_academic_year,
    'metadataActiveTerm',
      (select active_term from metadata),
    'controlActiveTerm',
      (select active_term from control),
    'activeTermAligned',
      (select active_term from metadata)
      is not distinct from
      (select active_term from control),
    'publicSessionCount',
      public_state.session_count,
    'publicDistinctTermCount',
      public_state.distinct_term_count,
    'publicTermMismatchCount',
      public_state.metadata_term_mismatch_count,
    'baseline',
      public.management_publication_baseline_status(
        p_academic_year
      ),
    'publicationApplyGranted',
      has_function_privilege(
        'authenticated',
        'public.management_apply_publication(uuid,text)',
        'EXECUTE'
      ),
    'termAware', true
  )
  from public_state
$$;

revoke all
  on function public.management_term_publication_contract_status(text)
  from public, anon, authenticated;

grant execute
  on function public.management_term_publication_contract_status(text)
  to authenticated;


-- -------------------------------------------------------------------------
-- MIGRATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_sessions integer;
  v_groups integer;
  v_wrong_term integer;
  v_publications integer;
  v_metadata_term smallint;
  v_control_term smallint;
  v_baseline_healthy boolean;
  v_term_column_ok boolean;
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

  select count(*)
  into v_wrong_term
  from public.schedule_sessions
  where academic_year = '2026-2027'
    and term <> 1;

  select count(*)
  into v_publications
  from public.management_publications;

  select active_term
  into v_metadata_term
  from public.schedule_projection_metadata
  where academic_year = '2026-2027';

  select active_term
  into v_control_term
  from public.management_publication_controls
  where academic_year = '2026-2027';

  select coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  )
  into v_baseline_healthy;

  select exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'schedule_sessions'
      and column_row.column_name = 'term'
      and column_row.udt_name = 'int2'
      and column_row.is_nullable = 'NO'
  )
  into v_term_column_ok;

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M21.1 installation modified public projection cardinality: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if v_wrong_term <> 0 then
    raise exception
      'M21.1 expected all current 2026-2027 public rows to remain term 1';
  end if;

  if v_metadata_term is distinct from 1
     or v_control_term is distinct from 1 then
    raise exception
      'M21.1 expected current active term to remain 1';
  end if;

  if not v_baseline_healthy then
    raise exception
      'M21.1 installation caused public baseline drift';
  end if;

  if not v_term_column_ok then
    raise exception
      'M21.1 schedule_sessions.term contract missing';
  end if;

  if v_publications <> 0 then
    raise exception
      'M21.1 must not create publication audit rows';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication_m19_8_term_legacy(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M21.1 legacy publication engine must remain locked';
  end if;
end
$$;

commit;

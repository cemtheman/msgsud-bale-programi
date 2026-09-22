-- Management / M20.3
-- Atomic historical partition alignment apply.
--
-- This migration does NOT execute the alignment. It installs:
--   * token-bearing M20.2 batch preview
--   * one EDITOR apply RPC
--
-- The apply RPC reuses M17.3 for every requirement inside ONE transaction.
-- If any individual structural apply becomes stale or blocked, PostgreSQL rolls
-- back the complete batch.
--
-- M17.3 intentionally writes one STRUCTURE audit/history barrier per aligned
-- requirement. Those rows are part of the existing structural audit contract.

begin;


create or replace function public.management_preview_historical_partition_alignment_v2(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_token text;
  v_alignable_count integer;
  v_blocked_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M20.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  v_preview :=
    public.management_preview_historical_partition_alignment(
      p_schedule_revision_id
    );

  v_alignable_count := coalesce(
    (v_preview #>> '{summary,alignableRequirementCount}')::integer,
    0
  );

  v_blocked_count := coalesce(
    (v_preview #>> '{summary,blockedRequirementCount}')::integer,
    0
  );

  -- M20.2 items already contain each M17.3 exact structureToken plus the
  -- historical target partition. Hash the complete deterministic batch plan.
  v_token := md5(
    jsonb_build_object(
      'revisionId', p_schedule_revision_id,
      'items', coalesce(v_preview -> 'items', '[]'::jsonb)
    )::text
  );

  return
    v_preview
    || jsonb_build_object(
      'alignmentToken', v_token,
      'canApplyBatch',
        v_alignable_count > 0
        and v_blocked_count = 0,
      'applyEndpointPresent', true
    );
end
$$;

revoke all
  on function public.management_preview_historical_partition_alignment_v2(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_historical_partition_alignment_v2(uuid)
  to authenticated;

comment on function public.management_preview_historical_partition_alignment_v2(uuid) is
  'M20.3 token-bearing batch preview for historical partition alignment. Adds an exact batch token over the M20.2/M17.3 plan and exposes canApplyBatch only when every mismatch is safely alignable.';


create or replace function public.management_apply_historical_partition_alignment(
  p_schedule_revision_id uuid,
  p_expected_alignment_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_preview jsonb;
  v_current_token text;
  v_item jsonb;

  v_requirement_id uuid;
  v_weekly_load smallint;
  v_term_status text;
  v_source_partition smallint[];
  v_allowed_partitions jsonb;
  v_structure_token text;
  v_apply_result jsonb;

  v_alignable_count integer;
  v_applied_count integer := 0;
  v_preserved_count integer := 0;
  v_removed_count integer := 0;
  v_created_count integer := 0;

  v_recovery_after jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M20.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_expected_alignment_token is null
     or length(btrim(p_expected_alignment_token)) = 0 then
    raise exception 'M20.3 expected alignment token is required';
  end if;

  -- Serialize against PLACE/MOVE/REMOVE and every M17.3 structural apply.
  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id
    and requirement_set.status = 'DRAFT'
  for update of revision, requirement_set;

  if not found then
    raise exception
      'M20.3 active DRAFT revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M20.3 historical alignment requires DRAFT revision';
  end if;

  v_preview :=
    public.management_preview_historical_partition_alignment_v2(
      p_schedule_revision_id
    );

  v_current_token := v_preview ->> 'alignmentToken';

  if v_current_token is distinct from p_expected_alignment_token then
    raise exception
      'M20.3 historical partition alignment preview is stale';
  end if;

  if not coalesce(
    (v_preview ->> 'canApplyBatch')::boolean,
    false
  ) then
    raise exception
      'M20.3 historical partition alignment batch is not safely applicable: %',
      coalesce(v_preview -> 'summary', '{}'::jsonb)::text;
  end if;

  v_alignable_count := coalesce(
    (v_preview #>> '{summary,alignableRequirementCount}')::integer,
    0
  );

  -- Stable order only affects audit ordering; all mutations remain one DB tx.
  for v_item in
    select item.value
    from jsonb_array_elements(
      coalesce(v_preview -> 'items', '[]'::jsonb)
    ) item(value)
    where item.value ->> 'status' = 'ALIGNABLE'
    order by
      item.value ->> 'subjectName',
      item.value ->> 'groupName',
      item.value ->> 'requirementId'
  loop
    v_requirement_id :=
      (v_item ->> 'requirementId')::uuid;

    select coalesce(
      array_agg(
        element.value::smallint
        order by element.ordinality
      ),
      array[]::smallint[]
    )
    into v_source_partition
    from jsonb_array_elements_text(
      coalesce(v_item -> 'sourcePartition', '[]'::jsonb)
    ) with ordinality as element(value, ordinality);

    v_allowed_partitions :=
      coalesce(
        v_item -> 'proposedAllowedPartitions',
        jsonb_build_array(to_jsonb(v_source_partition))
      );

    v_structure_token :=
      v_item ->> 'structureToken';

    select
      requirement.weekly_load,
      requirement.term_status
    into
      v_weekly_load,
      v_term_status
    from public.course_requirements requirement
    where requirement.id = v_requirement_id
      and requirement.requirement_set_id = (
        select revision.requirement_set_id
        from public.schedule_revisions revision
        where revision.id = p_schedule_revision_id
      );

    if not found then
      raise exception
        'M20.3 requirement disappeared during batch: %',
        v_requirement_id;
    end if;

    if cardinality(v_source_partition) = 0
       or (
         select coalesce(sum(duration), 0)
         from unnest(v_source_partition) duration
       ) <> v_weekly_load then
      raise exception
        'M20.3 historical partition load mismatch for requirement %',
        v_requirement_id;
    end if;

    -- Reuse the already-proven M17.3 atomic structural mutation contract.
    -- It performs its own exact structure-token comparison and canApply check.
    v_apply_result :=
      public.management_apply_requirement_structure(
        v_requirement_id,
        v_weekly_load,
        v_source_partition,
        v_allowed_partitions,
        v_term_status,
        v_structure_token
      );

    if not coalesce(
      (v_apply_result ->> 'applied')::boolean,
      false
    ) then
      raise exception
        'M20.3 M17.3 apply did not confirm requirement %',
        v_requirement_id;
    end if;

    v_applied_count := v_applied_count + 1;
    v_preserved_count :=
      v_preserved_count
      + coalesce(
        (v_apply_result ->> 'preservedCardCount')::integer,
        0
      );
    v_removed_count :=
      v_removed_count
      + coalesce(
        (v_apply_result ->> 'removedCardCount')::integer,
        0
      );
    v_created_count :=
      v_created_count
      + coalesce(
        (v_apply_result ->> 'createdCardCount')::integer,
        0
      );
  end loop;

  if v_applied_count <> v_alignable_count then
    raise exception
      'M20.3 batch count mismatch: preview %, applied %',
      v_alignable_count,
      v_applied_count;
  end if;

  -- Rebuild/evaluate the exact historical placement recovery against the new
  -- block graph before committing. This is still preview-only for placements.
  v_recovery_after :=
    public.management_preview_existing_schedule_recovery(
      p_schedule_revision_id
    );

  return jsonb_build_object(
    'applied', true,
    'revisionId', p_schedule_revision_id,
    'alignedRequirementCount', v_applied_count,
    'preservedCardCount', v_preserved_count,
    'removedCardCount', v_removed_count,
    'createdCardCount', v_created_count,
    'before', v_preview -> 'summary',
    'recoveryAfterAlignment',
      v_recovery_after -> 'summary'
  );
end
$$;

revoke all
  on function public.management_apply_historical_partition_alignment(
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_historical_partition_alignment(
    uuid,
    text
  )
  to authenticated;

comment on function public.management_apply_historical_partition_alignment(uuid, text) is
  'M20.3 EDITOR atomic batch apply. Locks the DRAFT, rechecks the exact M20.2 batch token, then delegates every ALIGNABLE historical partition change to M17.3 inside one transaction. Any stale/blocked item rolls back the whole batch. Returns the new M20.1 exact-recovery summary but does not place cards.';


-- Installing M20.3 must not itself mutate schedule/publication state.
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
      'M20.3 installation modified public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if exists (
    select 1
    from public.management_publications
  ) then
    raise exception
      'M20.3 expected no managed publication during historical recovery';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M20.3 must not unlock publication engine';
  end if;
end
$$;

commit;

-- Management / M20.2
-- Historical partition-alignment preview.
--
-- Reuses:
--   M20.1.1 exact historical recovery diagnostics
--   M17.3 token-bearing structural preview
--
-- No structural mutation is performed here.
-- The function asks: for each untouched PARTITION_MISMATCH requirement,
-- can its preferred block partition be aligned to the observed historical
-- contiguous source blocks without deleting a placed/locked card or requiring
-- an ambiguous human card choice?

begin;

create or replace function public.management_preview_historical_partition_alignment(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recovery jsonb;
  v_requirement jsonb;
  v_requirement_id uuid;
  v_source_partition smallint[];
  v_weekly_load smallint;
  v_term_status text;
  v_current_allowed jsonb;
  v_proposed_allowed jsonb;
  v_structure_preview jsonb;

  v_partition_mismatch_count integer := 0;
  v_alignable_count integer := 0;
  v_blocked_count integer := 0;
  v_alignable_current_card_count integer := 0;
  v_alignable_result_card_count integer := 0;
  v_block_reason_counts jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M20.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.schedule_revisions revision
    join public.requirement_sets requirement_set
      on requirement_set.id = revision.requirement_set_id
    where revision.id = p_schedule_revision_id
      and revision.status = 'DRAFT'
      and requirement_set.status = 'DRAFT'
  ) then
    raise exception
      'M20.2 requires an active DRAFT schedule revision: %',
      p_schedule_revision_id;
  end if;

  v_recovery :=
    public.management_preview_existing_schedule_recovery(
      p_schedule_revision_id
    );

  for v_requirement in
    select value
    from jsonb_array_elements(
      coalesce(v_recovery -> 'requirements', '[]'::jsonb)
    )
    where value ->> 'status' = 'PARTITION_MISMATCH'
    order by
      value ->> 'subjectName',
      value ->> 'groupName',
      value ->> 'requirementId'
  loop
    v_partition_mismatch_count :=
      v_partition_mismatch_count + 1;

    v_requirement_id :=
      (v_requirement ->> 'requirementId')::uuid;

    select coalesce(
      array_agg((element.value)::smallint order by element.ordinality),
      array[]::smallint[]
    )
    into v_source_partition
    from jsonb_array_elements_text(
      coalesce(v_requirement -> 'sourceRunDurations', '[]'::jsonb)
    ) with ordinality as element(value, ordinality);

    select
      requirement.weekly_load,
      requirement.term_status,
      requirement.allowed_partitions
    into
      v_weekly_load,
      v_term_status,
      v_current_allowed
    from public.course_requirements requirement
    where requirement.id = v_requirement_id;

    if v_weekly_load is null then
      raise exception
        'M20.2 requirement disappeared during preview: %',
        v_requirement_id;
    end if;

    if cardinality(v_source_partition) = 0
       or (
         select coalesce(sum(duration), 0)
         from unnest(v_source_partition) duration
       ) <> v_weekly_load then
      v_blocked_count := v_blocked_count + 1;

      v_block_reason_counts :=
        jsonb_set(
          v_block_reason_counts,
          '{SOURCE_PARTITION_LOAD_MISMATCH}',
          to_jsonb(
            coalesce(
              (
                v_block_reason_counts
                ->> 'SOURCE_PARTITION_LOAD_MISMATCH'
              )::integer,
              0
            ) + 1
          ),
          true
        );

      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'requirementId', v_requirement_id,
          'subjectName', v_requirement ->> 'subjectName',
          'groupName', v_requirement ->> 'groupName',
          'status', 'BLOCKED',
          'sourcePartition', to_jsonb(v_source_partition),
          'weeklyLoad', v_weekly_load,
          'blockReasons',
            jsonb_build_array('SOURCE_PARTITION_LOAD_MISMATCH')
        )
      );

      continue;
    end if;

    v_proposed_allowed :=
      coalesce(v_current_allowed, '[]'::jsonb);

    if jsonb_typeof(v_proposed_allowed) <> 'array' then
      v_proposed_allowed := '[]'::jsonb;
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(v_proposed_allowed) alternative
      where alternative = to_jsonb(v_source_partition)
    ) then
      v_proposed_allowed :=
        v_proposed_allowed
        || jsonb_build_array(to_jsonb(v_source_partition));
    end if;

    v_structure_preview :=
      public.management_preview_requirement_structure_v2(
        v_requirement_id,
        v_weekly_load,
        v_source_partition,
        v_proposed_allowed,
        v_term_status
      );

    if coalesce(
      (v_structure_preview ->> 'canApply')::boolean,
      false
    ) then
      v_alignable_count := v_alignable_count + 1;

      v_alignable_current_card_count :=
        v_alignable_current_card_count
        + coalesce(
          (v_structure_preview ->> 'currentCardCount')::integer,
          jsonb_array_length(
            coalesce(v_structure_preview -> 'preservedCards', '[]'::jsonb)
          )
          + jsonb_array_length(
            coalesce(v_structure_preview -> 'removedCards', '[]'::jsonb)
          )
        );

      v_alignable_result_card_count :=
        v_alignable_result_card_count
        + jsonb_array_length(
          coalesce(v_structure_preview -> 'preservedCards', '[]'::jsonb)
        )
        + jsonb_array_length(
          coalesce(v_structure_preview -> 'createdBlocks', '[]'::jsonb)
        );
    else
      v_blocked_count := v_blocked_count + 1;

      for v_requirement in
        select jsonb_build_object('code', reason.value) as value
        from jsonb_array_elements_text(
          coalesce(
            v_structure_preview -> 'blockReasons',
            '[]'::jsonb
          )
        ) reason(value)
      loop
        v_block_reason_counts :=
          jsonb_set(
            v_block_reason_counts,
            array[v_requirement ->> 'code'],
            to_jsonb(
              coalesce(
                (
                  v_block_reason_counts
                  ->> (v_requirement ->> 'code')
                )::integer,
                0
              ) + 1
            ),
            true
          );
      end loop;
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'requirementId', v_requirement_id,
        'subjectName', v_requirement ->> 'subjectName',
        'groupName', v_requirement ->> 'groupName',
        'status',
          case
            when coalesce(
              (v_structure_preview ->> 'canApply')::boolean,
              false
            )
              then 'ALIGNABLE'
            else 'BLOCKED'
          end,
        'weeklyLoad', v_weekly_load,
        'currentPartition',
          v_structure_preview #> '{current,preferredPartition}',
        'sourcePartition', to_jsonb(v_source_partition),
        'proposedAllowedPartitions', v_proposed_allowed,
        'structureToken',
          v_structure_preview -> 'structureToken',
        'preservedCardCount',
          jsonb_array_length(
            coalesce(
              v_structure_preview -> 'preservedCards',
              '[]'::jsonb
            )
          ),
        'removedCardCount',
          jsonb_array_length(
            coalesce(
              v_structure_preview -> 'removedCards',
              '[]'::jsonb
            )
          ),
        'createdCardCount',
          jsonb_array_length(
            coalesce(
              v_structure_preview -> 'createdBlocks',
              '[]'::jsonb
            )
          ),
        'removedPlacedCount',
          coalesce(
            (
              v_structure_preview
              #>> '{impact,removedPlacedCardCount}'
            )::integer,
            0
          ),
        'blockReasons',
          coalesce(
            v_structure_preview -> 'blockReasons',
            '[]'::jsonb
          )
      )
    );
  end loop;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'previewOnly', true,
    'applyEndpointPresent', false,
    'summary', jsonb_build_object(
      'partitionMismatchRequirementCount',
        v_partition_mismatch_count,
      'alignableRequirementCount',
        v_alignable_count,
      'blockedRequirementCount',
        v_blocked_count,
      'alignableCurrentCardCount',
        v_alignable_current_card_count,
      'alignableResultCardCount',
        v_alignable_result_card_count,
      'blockReasonCounts',
        v_block_reason_counts
    ),
    'items', v_items
  );
end
$$;

revoke all
  on function public.management_preview_historical_partition_alignment(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_historical_partition_alignment(uuid)
  to authenticated;

comment on function public.management_preview_historical_partition_alignment(uuid) is
  'M20.2 read-only batch preview. For untouched PARTITION_MISMATCH requirements from M20.1, reuses M17.3 structural preview to test whether the observed historical block partition can safely replace the synthetic draft partition.';


-- Install invariants.
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
      'M20.2 installation modified public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if exists (
    select 1
    from public.management_publications
  ) then
    raise exception
      'M20.2 expected no managed publication during historical recovery';
  end if;
end
$$;

commit;

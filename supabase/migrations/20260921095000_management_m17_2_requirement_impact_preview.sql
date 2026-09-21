-- Management / M17.2
-- Requirement structural impact preview only.
--
-- This migration deliberately introduces NO structural mutation command.
-- It previews weekly-load / partition / term-status changes against the
-- current DRAFT card graph and reports deterministic preservation, creation,
-- removal, placed-card impact, and ambiguity.
--
-- Published schedule_sessions + session_groups remain untouched.

begin;

create or replace function public.management_preview_requirement_structure(
  p_requirement_id uuid,
  p_weekly_load smallint,
  p_preferred_partition smallint[],
  p_allowed_partitions jsonb,
  p_term_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_current_weekly_load smallint;
  v_current_preferred jsonb;
  v_current_allowed jsonb;
  v_current_term_status text;
  v_preferred smallint[] := coalesce(p_preferred_partition, array[]::smallint[]);
  v_allowed jsonb := coalesce(p_allowed_partitions, '[]'::jsonb);
  v_current_card_count integer;
  v_current_placed_count integer;
  v_proposed_card_count integer;
  v_removed_placed_count integer;
  v_candidate_rebuild_count integer;
  v_has_changes boolean;
  v_ambiguity_count integer;
  v_current jsonb;
  v_proposed jsonb;
  v_preserved jsonb;
  v_removed jsonb;
  v_created jsonb;
  v_ambiguities jsonb;
  v_block_reasons jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_term_status not in ('ACTIVE', 'INACTIVE', 'UNKNOWN') then
    raise exception 'M17.2 invalid term status: %', p_term_status;
  end if;

  if p_weekly_load is null or p_weekly_load < 0 then
    raise exception 'M17.2 weekly load must be zero or positive';
  end if;

  if jsonb_typeof(v_allowed) <> 'array' then
    raise exception 'M17.2 allowed partitions must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_allowed) alternative
    where jsonb_typeof(alternative) <> 'array'
       or exists (
         select 1
         from jsonb_array_elements(alternative) element
         where jsonb_typeof(element) <> 'number'
            or element::text !~ '^[0-9]+$'
            or (element::text)::integer <= 0
       )
  ) then
    raise exception 'M17.2 allowed partitions contain an invalid block duration';
  end if;

  if exists (
    select 1
    from unnest(v_preferred) duration
    where duration <= 0
  ) then
    raise exception 'M17.2 preferred partition contains an invalid block duration';
  end if;

  if p_term_status = 'ACTIVE' then
    if p_weekly_load <= 0 then
      raise exception 'M17.2 ACTIVE requirement must have positive weekly load';
    end if;

    if cardinality(v_preferred) = 0 then
      raise exception 'M17.2 ACTIVE requirement requires a preferred partition';
    end if;

    if (
      select coalesce(sum(duration), 0)
      from unnest(v_preferred) duration
    ) <> p_weekly_load then
      raise exception 'M17.2 preferred partition must sum to weekly load';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_allowed) alternative
      where (
        select coalesce(sum((element::text)::integer), 0)
        from jsonb_array_elements(alternative) element
      ) <> p_weekly_load
    ) then
      raise exception 'M17.2 every allowed partition must sum to weekly load';
    end if;
  end if;

  select
    revision.id,
    requirement.weekly_load,
    requirement.preferred_partition,
    requirement.allowed_partitions,
    requirement.term_status
  into
    v_revision_id,
    v_current_weekly_load,
    v_current_preferred,
    v_current_allowed,
    v_current_term_status
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
   and revision.status = 'DRAFT'
  where requirement.id = p_requirement_id
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M17.2 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  select
    count(*),
    count(*) filter (where placement.card_id is not null)
  into
    v_current_card_count,
    v_current_placed_count
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  v_proposed_card_count := case
    when p_term_status = 'ACTIVE' then cardinality(v_preferred)
    else 0
  end;

  with
  current_cards as (
    select
      card.id as card_id,
      card.block_index,
      card.duration_periods,
      placement.card_id is not null as placed,
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id,
      placement.room_id,
      row_number() over (
        partition by card.duration_periods
        order by card.block_index, card.id
      ) as duration_rank
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = p_requirement_id
  ),
  proposed_blocks as (
    select
      proposed.ordinality::smallint as block_index,
      proposed.duration::smallint as duration_periods,
      row_number() over (
        partition by proposed.duration
        order by proposed.ordinality
      ) as duration_rank
    from unnest(
      case
        when p_term_status = 'ACTIVE'
          then v_preferred
        else array[]::smallint[]
      end
    ) with ordinality as proposed(duration, ordinality)
  ),
  matched as (
    select
      current.card_id,
      current.block_index as current_block_index,
      proposed.block_index as proposed_block_index,
      current.duration_periods,
      current.placed,
      current.day_of_week,
      current.start_period,
      current.teacher_id,
      current.room_id
    from current_cards current
    join proposed_blocks proposed
      on proposed.duration_periods = current.duration_periods
     and proposed.duration_rank = current.duration_rank
  ),
  removed as (
    select current.*
    from current_cards current
    left join proposed_blocks proposed
      on proposed.duration_periods = current.duration_periods
     and proposed.duration_rank = current.duration_rank
    where proposed.block_index is null
  ),
  created as (
    select proposed.*
    from proposed_blocks proposed
    left join current_cards current
      on current.duration_periods = proposed.duration_periods
     and current.duration_rank = proposed.duration_rank
    where current.card_id is null
  ),
  duration_summary as (
    select
      duration,
      sum(current_count)::integer as current_count,
      sum(proposed_count)::integer as proposed_count,
      sum(placed_count)::integer as placed_count
    from (
      select
        card.duration_periods::integer as duration,
        count(*)::integer as current_count,
        0::integer as proposed_count,
        count(*) filter (where placement.card_id is not null)::integer as placed_count
      from public.schedule_cards card
      left join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = v_revision_id
        and card.requirement_id = p_requirement_id
      group by card.duration_periods

      union all

      select
        proposed.duration::integer as duration,
        0::integer,
        count(*)::integer,
        0::integer
      from unnest(
        case
          when p_term_status = 'ACTIVE'
            then v_preferred
          else array[]::smallint[]
        end
      ) proposed(duration)
      group by proposed.duration
    ) counts
    group by duration
  ),
  ambiguities as (
    select *
    from duration_summary
    where proposed_count > 0
      and current_count > proposed_count
      and placed_count > 0
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cardId', matched.card_id,
          'currentBlockIndex', matched.current_block_index,
          'proposedBlockIndex', matched.proposed_block_index,
          'durationPeriods', matched.duration_periods,
          'placed', matched.placed,
          'dayOfWeek', matched.day_of_week,
          'startPeriod', matched.start_period,
          'teacherId', matched.teacher_id,
          'roomId', matched.room_id
        )
        order by matched.proposed_block_index
      )
      from matched
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cardId', removed.card_id,
          'currentBlockIndex', removed.block_index,
          'durationPeriods', removed.duration_periods,
          'placed', removed.placed,
          'dayOfWeek', removed.day_of_week,
          'startPeriod', removed.start_period,
          'teacherId', removed.teacher_id,
          'roomId', removed.room_id
        )
        order by removed.block_index
      )
      from removed
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'proposedBlockIndex', created.block_index,
          'durationPeriods', created.duration_periods
        )
        order by created.block_index
      )
      from created
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', 'PLACED_EQUIVALENT_CARD_CHOICE',
          'durationPeriods', ambiguities.duration,
          'currentCount', ambiguities.current_count,
          'proposedCount', ambiguities.proposed_count,
          'placedCount', ambiguities.placed_count,
          'message', 'Aynı süreli birden fazla bloktan hangisinin korunacağı yerleşmiş bir bloğu etkiliyor.'
        )
        order by ambiguities.duration
      )
      from ambiguities
    ), '[]'::jsonb),
    (
      select count(*)
      from removed
      where removed.placed
    ),
    (
      select count(*)
      from ambiguities
    )
  into
    v_preserved,
    v_removed,
    v_created,
    v_ambiguities,
    v_removed_placed_count,
    v_ambiguity_count;

  v_candidate_rebuild_count := v_proposed_card_count;

  v_has_changes :=
    v_current_weekly_load is distinct from p_weekly_load
    or v_current_preferred is distinct from to_jsonb(v_preferred)
    or v_current_allowed is distinct from v_allowed
    or v_current_term_status is distinct from p_term_status;

  if not v_has_changes then
    v_block_reasons := v_block_reasons || jsonb_build_array('NO_CHANGES');
  end if;

  if v_removed_placed_count > 0 then
    v_block_reasons := v_block_reasons
      || jsonb_build_array('PLACED_CARD_REMOVAL_REQUIRED');
  end if;

  if v_ambiguity_count > 0 then
    v_block_reasons := v_block_reasons
      || jsonb_build_array('HUMAN_CARD_CHOICE_REQUIRED');
  end if;

  v_current := jsonb_build_object(
    'weeklyLoad', v_current_weekly_load,
    'preferredPartition', v_current_preferred,
    'allowedPartitions', v_current_allowed,
    'termStatus', v_current_term_status,
    'cardCount', v_current_card_count,
    'placedBlockCount', v_current_placed_count
  );

  v_proposed := jsonb_build_object(
    'weeklyLoad', p_weekly_load,
    'preferredPartition', to_jsonb(v_preferred),
    'allowedPartitions', v_allowed,
    'termStatus', p_term_status,
    'cardCount', v_proposed_card_count
  );

  return jsonb_build_object(
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'hasChanges', v_has_changes,
    'canApply',
      v_has_changes
      and v_removed_placed_count = 0
      and v_ambiguity_count = 0,
    'blockReasons', v_block_reasons,
    'current', v_current,
    'proposed', v_proposed,
    'preservedCards', v_preserved,
    'removedCards', v_removed,
    'createdBlocks', v_created,
    'ambiguities', v_ambiguities,
    'candidateRebuildCardCount', v_candidate_rebuild_count,
    'previewOnly', true
  );
end
$$;

revoke all
  on function public.management_preview_requirement_structure(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_preview_requirement_structure(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text
  )
  to authenticated;

comment on function public.management_preview_requirement_structure(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text
) is
  'M17.2 EDITOR-only read-only preview for requirement structural changes. Reports card preservation/removal/creation, placed-card impact and ambiguity; performs no mutation.';

commit;

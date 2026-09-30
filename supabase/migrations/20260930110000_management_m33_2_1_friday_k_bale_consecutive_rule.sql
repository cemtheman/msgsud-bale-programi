-- Management M33.2.1
-- Align the explicit 5A Friday K. Bale supplemental lesson rule with the
-- confirmed runtime schedule: two consecutive Friday periods.
--
-- Safety:
-- - targets exactly one ACTIVE 2026-2027 / term-1 requirement
-- - requires the current stale value to be max_consecutive_periods = 1
-- - requires two one-period cards in the active DRAFT
-- - does not move placements or change teacher/room assignments
-- - refreshes only the affected candidate domain

begin;

do $$
declare
  v_requirement_id uuid;
  v_requirement_count integer;
  v_revision_id uuid;
  v_card_count integer;
  v_one_period_card_count integer;
  v_friday_placed_count integer;
  v_friday_min_period integer;
  v_friday_max_period integer;
begin
  select count(*)::integer
  into v_requirement_count
  from public.course_requirements requirement
  join public.requirement_sets requirement_set
    on requirement_set.id = requirement.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement.term_status = 'ACTIVE'
    and subject.name = 'K. Bale'
    and instructional_group.name =
      'STANDARD • 5A BALLET • Cuma ek dersi';

  if v_requirement_count = 1 then
    select requirement.id
    into v_requirement_id
    from public.course_requirements requirement
    join public.requirement_sets requirement_set
      on requirement_set.id = requirement.requirement_set_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    where requirement_set.academic_year = '2026-2027'
      and requirement_set.term = 1
      and requirement.term_status = 'ACTIVE'
      and subject.name = 'K. Bale'
      and instructional_group.name =
        'STANDARD • 5A BALLET • Cuma ek dersi'
    limit 1;
  end if;

  if v_requirement_count <> 1 or v_requirement_id is null then
    raise exception
      'M33.2.1 expected exactly one active 5A Friday K. Bale requirement, found %',
      v_requirement_count;
  end if;

  if not exists (
    select 1
    from public.course_requirements requirement
    where requirement.id = v_requirement_id
      and requirement.max_consecutive_periods = 1
  ) then
    raise exception
      'M33.2.1 expected stale max_consecutive_periods=1 for requirement %',
      v_requirement_id;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id = revision.requirement_set_id
  where requirement.id = v_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M33.2.1 active DRAFT revision not found for requirement %',
      v_requirement_id;
  end if;

  select
    count(*)::integer,
    count(*) filter (where card.duration_periods = 1)::integer
  into
    v_card_count,
    v_one_period_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  if v_card_count <> 2 or v_one_period_card_count <> 2 then
    raise exception
      'M33.2.1 expected exactly two one-period cards, found cards %, one-period %',
      v_card_count,
      v_one_period_card_count;
  end if;

  select
    count(*)::integer,
    min(placement.start_period),
    max(placement.start_period)
  into
    v_friday_placed_count,
    v_friday_min_period,
    v_friday_max_period
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id
    and placement.day_of_week = 5;

  if v_friday_placed_count <> 2
     or v_friday_min_period <> 7
     or v_friday_max_period <> 8 then
    raise exception
      'M33.2.1 expected current Friday periods 7 and 8, found count %, min %, max %',
      v_friday_placed_count,
      v_friday_min_period,
      v_friday_max_period;
  end if;

  update public.course_requirements
  set max_consecutive_periods = 2
  where id = v_requirement_id
    and max_consecutive_periods = 1;

  if not found then
    raise exception
      'M33.2.1 requirement update did not affect the expected row';
  end if;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    array(
      select card.id
      from public.schedule_cards card
      where card.schedule_revision_id = v_revision_id
        and card.requirement_id = v_requirement_id
      order by card.block_index, card.id
    )
  );

  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.id = v_requirement_id
      and requirement.max_consecutive_periods is distinct from 2
  ) then
    raise exception
      'M33.2.1 max_consecutive_periods verification failed';
  end if;
end
$$;

commit;

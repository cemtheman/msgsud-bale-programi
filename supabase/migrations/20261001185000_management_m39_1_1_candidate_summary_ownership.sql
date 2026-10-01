-- Management M39.1.1
-- Teacher hard-availability domain-summary ownership fix.
--
-- M32.5.1 established the invariant that candidate-domain builders own
-- creation of schedule_card_domain_summaries rows. AFTER-statement policy
-- triggers may only refresh summary rows that already exist.
--
-- M39.1 accidentally used INSERT ... ON CONFLICT in its availability summary
-- trigger. During a candidate-domain rebuild the builder intentionally deletes
-- the summary, inserts candidate rows, and creates the summary only after the
-- candidate insert completes. The M39.1 AFTER INSERT trigger therefore created
-- that row too early and the builder's final INSERT failed with:
--   duplicate key value violates unique constraint
--   "schedule_card_domain_summaries_pkey"
--
-- This migration restores the ownership rule: availability semantics may
-- UPDATE existing summaries but never create a missing one.

begin;

create or replace function
  public.management_refresh_teacher_availability_domain_summary_batch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  with impacted_card as materialized (
    select distinct changed.card_id
    from changed_rows changed
  ),
  aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (
        where assessment.status = 'VALID'
      )::integer as valid_count,
      count(*) filter (
        where assessment.status = 'INVALID'
      )::integer as invalid_count,
      count(*) filter (
        where assessment.status = 'UNRESOLVED'
      )::integer as unresolved_count,
      count(*) filter (
        where assessment.is_complete
      )::integer as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    join impacted_card card
      on card.card_id = assessment.card_id
    group by assessment.card_id
  )
  update public.schedule_card_domain_summaries summary
  set
    domain_status = case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    valid_count = aggregate.valid_count,
    invalid_count = aggregate.invalid_count,
    unresolved_count = aggregate.unresolved_count,
    complete_candidate_count = aggregate.complete_candidate_count,
    is_forced = (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    is_contradiction = (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    generated_at = now()
  from aggregate
  where summary.card_id = aggregate.card_id;

  return null;
end
$$;

revoke all
  on function
    public.management_refresh_teacher_availability_domain_summary_batch()
  from public, anon, authenticated;

comment on function
  public.management_refresh_teacher_availability_domain_summary_batch()
is
  'M39.1.1 availability summary refresh. Candidate-domain builders own summary creation; this trigger only updates summaries that already exist.';

commit;

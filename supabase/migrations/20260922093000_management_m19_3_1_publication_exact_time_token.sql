-- Management / M19.3.1
-- Include exact publication end-time overrides in the publication state token.
--
-- M19.3 introduced schedule_cards.publication_end_time_override for effective
-- timetable rows such as 5A Piyano 15:30-16:15. The publication stale-state
-- token must cover this field as well.
--
-- This migration does not mutate schedule_sessions or session_groups.

begin;

alter function public.management_publication_state_token(uuid)
  rename to management_publication_state_token_m19_2;

create or replace function public.management_publication_state_token(
  p_schedule_revision_id uuid
)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  with base_token as (
    select public.management_publication_state_token_m19_2(
      p_schedule_revision_id
    ) as value
  ),
  exact_time_overrides as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'publicationEndTimeOverride',
            card.publication_end_time_override
        )
        order by card.id
      ),
      '[]'::jsonb
    ) as value
    from public.schedule_cards card
    where card.schedule_revision_id = p_schedule_revision_id
  )
  select case
    when base_token.value is null then null
    else md5(
      base_token.value
      || '|'
      || exact_time_overrides.value::text
    )
  end
  from base_token, exact_time_overrides
$$;

revoke all
  on function public.management_publication_state_token(uuid)
  from public, anon, authenticated;

comment on function public.management_publication_state_token(uuid) is
  'M19.3.1 publication stale-state token. Extends the M19.2 draft/public baseline token with exact per-card publication end-time overrides.';

-- Public projection remains untouched.
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
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M19.3.1 public projection changed unexpectedly: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;
end
$$;

commit;

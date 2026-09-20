-- Management v0.1 / M10.1
-- Strict anonymous read-boundary hardening.
--
-- M10 smoke showed that the Supabase anon role still held table-level SELECT
-- privilege on management domain tables through pre-existing/default grants.
-- RLS prevented row visibility, so no management data was exposed, but the
-- intended contract is stricter: anon must not have management SELECT privilege
-- at all. This forward migration removes that privilege explicitly while
-- preserving authenticated VIEWER/EDITOR/ADMIN reads through RLS.

begin;

revoke select
  on public.management_memberships
  from public, anon;

revoke select
  on public.requirement_sets,
     public.instructional_groups,
     public.instructional_group_relations,
     public.course_requirements,
     public.course_requirement_teachers,
     public.course_requirement_rooms,
     public.course_requirement_source_sessions,
     public.schedule_revisions,
     public.schedule_cards,
     public.placements,
     public.move_transactions,
     public.schedule_card_candidate_assessments,
     public.schedule_card_domain_summaries
  from public, anon;

-- Reassert the intended authenticated read grants after removing any PUBLIC
-- privilege path. RLS still decides which authenticated users may see rows.
grant select
  on public.management_memberships
  to authenticated;

grant select
  on public.requirement_sets,
     public.instructional_groups,
     public.instructional_group_relations,
     public.course_requirements,
     public.course_requirement_teachers,
     public.course_requirement_rooms,
     public.course_requirement_source_sessions,
     public.schedule_revisions,
     public.schedule_cards,
     public.placements,
     public.move_transactions,
     public.schedule_card_candidate_assessments,
     public.schedule_card_domain_summaries
  to authenticated;

do $$
declare
  v_table text;
  v_placement_count integer;
  v_transaction_count integer;
  v_published_session_count integer;
  v_revision_id uuid;
begin
  foreach v_table in array array[
    'public.management_memberships',
    'public.requirement_sets',
    'public.instructional_groups',
    'public.instructional_group_relations',
    'public.course_requirements',
    'public.course_requirement_teachers',
    'public.course_requirement_rooms',
    'public.course_requirement_source_sessions',
    'public.schedule_revisions',
    'public.schedule_cards',
    'public.placements',
    'public.move_transactions',
    'public.schedule_card_candidate_assessments',
    'public.schedule_card_domain_summaries'
  ]
  loop
    if has_table_privilege('anon', v_table, 'SELECT') then
      raise exception
        'M10.1 anon still has SELECT privilege on %',
        v_table;
    end if;

    if not has_table_privilege('authenticated', v_table, 'SELECT') then
      raise exception
        'M10.1 authenticated lost SELECT privilege on %',
        v_table;
    end if;
  end loop;

  select count(*) into v_placement_count
  from public.placements;

  select count(*) into v_transaction_count
  from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M10.1 requires clean rollback state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  select count(*)
  into v_published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if v_published_session_count <> 517 then
    raise exception
      'M10.1 changed published projection unexpectedly: %',
      v_published_session_count;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1
  limit 1;

  if v_revision_id is null then
    raise exception 'M10.1 expected canonical v1 DRAFT revision';
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'management_anon_read_boundary', 'STRICT_NO_SELECT',
      'management_rbac_smoke_test', 'PENDING'
    )
  where revision.id = v_revision_id;
end
$$;

commit;

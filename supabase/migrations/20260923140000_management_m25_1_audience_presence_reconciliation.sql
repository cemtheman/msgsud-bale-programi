-- Management / M25.1
-- Audience Presence Reconciliation from timetable source headers.
--
-- PURPOSE
--   Record only whether BALLET / MUSIC populations are present in each class.
--   Student counts are intentionally NOT stored: the source counts are used only
--   as presence/absence evidence.
--
-- SOURCE RULES
--   * A/B section and BALLET/MUSIC audience are independent dimensions.
--   * UNKNOWN != ABSENT.
--   * (MÜZİK) A header confirms BALLET + MUSIC are both present in 5A..12A.
--   * (MÜZİK) B header confirms MUSIC is present in 5B..12B,
--     BALLET is absent in 5B..11B, and BALLET is present in 12B.
--   * Existing BALLET A source confirms BALLET in 5A..12A.
--
-- SAFETY
--   * Public schedule_sessions / session_groups are untouched.
--   * Existing requirements/cards/placements/move history are untouched.
--   * M25 is not modified.
--   * This migration creates missing audience parent groups only.
--   * Lesson/source reconciliation remains PENDING after this migration.

begin;

create table public.management_audience_presence_evidence (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  class_group_id uuid not null
    references public.class_groups(id) on delete restrict,
  audience_target text not null
    check (audience_target in ('BALLET', 'MUSIC')),
  presence_status text not null
    check (presence_status in ('PRESENT', 'ABSENT', 'UNKNOWN')),
  source_document text not null,
  evidence_basis text not null,
  created_at timestamptz not null default now(),
  constraint management_audience_presence_source_not_blank
    check (
      length(btrim(source_document)) > 0
      and length(btrim(evidence_basis)) > 0
    ),
  constraint management_audience_presence_unique
    unique (
      requirement_set_id,
      class_group_id,
      audience_target,
      source_document
    )
);

create index management_audience_presence_class_idx
  on public.management_audience_presence_evidence (
    requirement_set_id,
    class_group_id,
    audience_target
  );

alter table public.management_audience_presence_evidence
  enable row level security;

revoke insert, update, delete
  on public.management_audience_presence_evidence
  from anon, authenticated;

grant select
  on public.management_audience_presence_evidence
  to authenticated;

create policy management_audience_presence_evidence_read
  on public.management_audience_presence_evidence
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

comment on table public.management_audience_presence_evidence is
  'Source-backed BALLET/MUSIC presence inventory. Student counts are intentionally excluded; PRESENT/ABSENT/UNKNOWN are distinct states.';

do $$
declare
  v_requirement_set_id uuid;
  v_revision_id uuid;
  v_public_session_count integer;
  v_public_group_count integer;
  v_card_count integer;
  v_placement_count integer;
  v_move_count integer;
  v_requirement_count integer;
  v_group_count_before integer;
  v_group_count_after integer;
  v_inserted_group_count integer;
  v_evidence_count integer;
  v_missing_present_groups integer;
  v_unexpected_absent_groups integer;
  v_public_sessions_hash text;
  v_public_groups_hash text;
begin
  select
    revision.requirement_set_id,
    revision.id
  into
    v_requirement_set_id,
    v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision, requirement_set;

  if v_revision_id is null then
    raise exception 'M25.1 requires the active 2026-2027 term-1 DRAFT';
  end if;

  if v_revision_id <>
       '02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5'::uuid then
    raise exception
      'M25.1 unexpected active DRAFT revision: %',
      v_revision_id;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception 'M25.1 public baseline is not healthy';
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions session_row
  where session_row.academic_year = '2026-2027'
    and session_row.term = 1;

  select count(*)
  into v_public_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027'
    and session_row.term = 1;

  v_public_sessions_hash :=
    public.management_public_sessions_hash('2026-2027');
  v_public_groups_hash :=
    public.management_public_groups_hash('2026-2027');

  if v_public_session_count <> 517
     or v_public_group_count <> 609
     or v_public_sessions_hash <>
       'a0bb49d37440119271457d0f678456d4'
     or v_public_groups_hash <>
       'e9ff78dfe6bc55cc98c5aa589a80142e' then
    raise exception
      'M25.1 public baseline drift: sessions %, groups %, session hash %, group hash %',
      v_public_session_count,
      v_public_group_count,
      v_public_sessions_hash,
      v_public_groups_hash;
  end if;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_move_count
  from public.move_transactions move
  where move.schedule_revision_id = v_revision_id;

  select count(*)
  into v_requirement_count
  from public.course_requirements requirement
  where requirement.requirement_set_id = v_requirement_set_id;

  select count(*)
  into v_group_count_before
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id = v_requirement_set_id;

  if v_card_count <> 299
     or v_placement_count <> 299
     or v_move_count <> 0 then
    raise exception
      'M25.1 clean DRAFT drift: cards %, placements %, moves %',
      v_card_count,
      v_placement_count,
      v_move_count;
  end if;

  create temporary table m25_1_presence_source (
    grade smallint not null,
    section text not null,
    audience_target text not null,
    presence_status text not null,
    source_document text not null,
    evidence_basis text not null
  ) on commit drop;

  -- A branch: all grades contain both audiences.
  insert into m25_1_presence_source
  select
    grade.grade::smallint,
    'A',
    audience.audience_target,
    'PRESENT',
    case audience.audience_target
      when 'MUSIC' then '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
      else '(BALE) A ŞUBESİ DERS PROGRAMI.pdf'
    end,
    case audience.audience_target
      when 'MUSIC' then
        'Source header identifies a non-zero Müzik population for this A section; numeric headcount is not persisted.'
      else
        'Bale A program source confirms a Bale program population for this A section; numeric headcount is not persisted.'
    end
  from generate_series(5, 12) grade(grade)
  cross join (
    values ('BALLET'::text), ('MUSIC'::text)
  ) audience(audience_target);

  -- B branch: music is present in every grade. The same header gives an exact
  -- absence signal for Bale in 5B..11B and confirms Bale presence in 12B.
  insert into m25_1_presence_source
  select
    grade.grade::smallint,
    'B',
    'MUSIC',
    'PRESENT',
    '(MÜZİK) B ŞUBESİ DERS PROGRAMI.pdf',
    'Source header identifies a Müzik population for this B section; numeric headcount is not persisted.'
  from generate_series(5, 12) grade(grade);

  insert into m25_1_presence_source
  select
    grade.grade::smallint,
    'B',
    'BALLET',
    case when grade.grade = 12 then 'PRESENT' else 'ABSENT' end,
    '(MÜZİK) B ŞUBESİ DERS PROGRAMI.pdf',
    case
      when grade.grade = 12 then
        'Source header explicitly identifies a Bale population in 12B; numeric headcount is not persisted.'
      else
        'Source header total is fully accounted for by Müzik and lists no Bale population; recorded as source-confirmed ABSENT.'
    end
  from generate_series(5, 12) grade(grade);

  if (select count(*) from m25_1_presence_source) <> 32 then
    raise exception 'M25.1 source inventory cardinality mismatch';
  end if;

  insert into public.management_audience_presence_evidence (
    requirement_set_id,
    class_group_id,
    audience_target,
    presence_status,
    source_document,
    evidence_basis
  )
  select
    v_requirement_set_id,
    class_group.id,
    source.audience_target,
    source.presence_status,
    source.source_document,
    source.evidence_basis
  from m25_1_presence_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section;

  get diagnostics v_evidence_count = row_count;

  if v_evidence_count <> 32 then
    raise exception
      'M25.1 expected 32 audience-presence evidence rows, inserted %',
      v_evidence_count;
  end if;

  -- A source-confirmed PRESENT audience receives a canonical parent group.
  insert into public.instructional_groups (
    requirement_set_id,
    class_group_id,
    name,
    group_type,
    term_status,
    knowledge_status,
    audience_target,
    subgroup_label
  )
  select
    v_requirement_set_id,
    class_group.id,
    class_group.grade::text || class_group.section || ' ' ||
      source.audience_target,
    source.audience_target,
    'ACTIVE',
    'CONFIRMED',
    source.audience_target,
    null
  from m25_1_presence_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section
  where source.presence_status = 'PRESENT'
    and not exists (
      select 1
      from public.instructional_groups existing
      where existing.requirement_set_id = v_requirement_set_id
        and existing.class_group_id = class_group.id
        and existing.group_type = source.audience_target
        and existing.audience_target = source.audience_target
        and existing.subgroup_label is null
    );

  get diagnostics v_inserted_group_count = row_count;

  -- Presence evidence upgrades existing observed parent identities to confirmed.
  update public.instructional_groups instructional_group
  set knowledge_status = 'CONFIRMED'
  from m25_1_presence_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section
  where source.presence_status = 'PRESENT'
    and instructional_group.requirement_set_id = v_requirement_set_id
    and instructional_group.class_group_id = class_group.id
    and instructional_group.group_type = source.audience_target
    and instructional_group.audience_target = source.audience_target
    and instructional_group.subgroup_label is null;

  -- SECTION is the administrative parent of all concrete audience groups.
  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select
    section_group.id,
    audience_group.id,
    'CONTAINS'
  from public.instructional_groups section_group
  join public.instructional_groups audience_group
    on audience_group.requirement_set_id = section_group.requirement_set_id
   and audience_group.class_group_id = section_group.class_group_id
  where section_group.requirement_set_id = v_requirement_set_id
    and section_group.group_type = 'SECTION'
    and section_group.audience_target = 'SECTION'
    and audience_group.group_type in ('BALLET', 'MUSIC')
    and audience_group.audience_target = audience_group.group_type
    and audience_group.subgroup_label is null
  on conflict do nothing;

  -- BALLET and MUSIC are disjoint participant sets within the same section.
  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select
    ballet.id,
    music.id,
    'DISJOINT'
  from public.instructional_groups ballet
  join public.instructional_groups music
    on music.requirement_set_id = ballet.requirement_set_id
   and music.class_group_id = ballet.class_group_id
  where ballet.requirement_set_id = v_requirement_set_id
    and ballet.group_type = 'BALLET'
    and ballet.audience_target = 'BALLET'
    and ballet.subgroup_label is null
    and music.group_type = 'MUSIC'
    and music.audience_target = 'MUSIC'
    and music.subgroup_label is null
  on conflict do nothing;

  select count(*)
  into v_missing_present_groups
  from m25_1_presence_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section
  where source.presence_status = 'PRESENT'
    and not exists (
      select 1
      from public.instructional_groups instructional_group
      where instructional_group.requirement_set_id = v_requirement_set_id
        and instructional_group.class_group_id = class_group.id
        and instructional_group.group_type = source.audience_target
        and instructional_group.audience_target = source.audience_target
        and instructional_group.subgroup_label is null
        and instructional_group.knowledge_status = 'CONFIRMED'
    );

  if v_missing_present_groups <> 0 then
    raise exception
      'M25.1 found % source-confirmed PRESENT audiences without confirmed parent groups',
      v_missing_present_groups;
  end if;

  -- Never silently convert a structural contradiction into ABSENT.
  select count(*)
  into v_unexpected_absent_groups
  from m25_1_presence_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section
  where source.presence_status = 'ABSENT'
    and exists (
      select 1
      from public.instructional_groups instructional_group
      where instructional_group.requirement_set_id = v_requirement_set_id
        and instructional_group.class_group_id = class_group.id
        and instructional_group.group_type = source.audience_target
        and instructional_group.audience_target = source.audience_target
        and instructional_group.subgroup_label is null
    );

  if v_unexpected_absent_groups <> 0 then
    raise exception
      'M25.1 found % audience groups contradicting source-confirmed ABSENT evidence',
      v_unexpected_absent_groups;
  end if;

  select count(*)
  into v_group_count_after
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id = v_requirement_set_id;

  -- This pass must be structure/evidence-only.
  if (
    select count(*)
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id
  ) <> v_requirement_count then
    raise exception 'M25.1 unexpectedly changed course requirements';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
  ) <> v_card_count then
    raise exception 'M25.1 unexpectedly changed schedule cards';
  end if;

  if (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
  ) <> v_placement_count then
    raise exception 'M25.1 unexpectedly changed placements';
  end if;

  if (
    select count(*)
    from public.move_transactions move
    where move.schedule_revision_id = v_revision_id
  ) <> v_move_count then
    raise exception 'M25.1 unexpectedly changed move history';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       <> v_public_sessions_hash
     or public.management_public_groups_hash('2026-2027')
       <> v_public_groups_hash then
    raise exception 'M25.1 modified the public projection unexpectedly';
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm25_1_audience_presence_reconciliation', 'PASS',
      'audience_presence_source_rows', 32,
      'audience_parent_groups_created', v_inserted_group_count,
      'student_counts_persisted', false,
      'source_lesson_reconciliation', 'PENDING',
      'publication_source_complete', false,
      'public_projection_changed', false,
      'group_count_before', v_group_count_before,
      'group_count_after', v_group_count_after
    )
  where revision.id = v_revision_id;
end
$$;

commit;

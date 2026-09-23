-- Management / M25.2
-- Music-A Source Schedule Normalization + Read-Only Reconciliation Diagnostic
--
-- PURPOSE
--   Normalize the discipline-specific schedule evidence from:
--     (MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf
--   without changing requirements, cards, placements, move history, or the
--   published schedule.
--
-- SOURCE FINDING
--   The PDF contains 29 grade/subject schedules = 96 period cells.
--   28 schedules / 94 period cells are identical to the corresponding B-branch
--   MUSIC schedule. The only source-level difference is:
--     10A MUSIC / Müzik Teorisi -> Friday periods 7-8, room A105
--   whereas the current 10B MUSIC counterpart is Friday periods 4-5.
--
-- IMPORTANT
--   Student headcounts are not persisted or used here.
--   UNKNOWN != ABSENT != UNAVAILABLE.
--   This migration is evidence + diagnostic only. Apply remains PENDING.

begin;

create table public.management_source_schedule_evidence (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  source_document text not null,
  source_page smallint not null default 1 check (source_page > 0),
  grade smallint not null check (grade between 1 and 12),
  section text not null check (section in ('A', 'B')),
  audience_target text not null
    check (audience_target in ('SECTION', 'BALLET', 'MUSIC')),
  subject_name text not null,
  reconciliation_strategy text not null
    check (
      reconciliation_strategy in (
        'COUNTERPART_SCHEDULE',
        'EXPLICIT_SCHEDULE'
      )
    ),
  reference_section text null check (reference_section in ('A', 'B')),
  source_period_count smallint not null check (source_period_count > 0),
  source_schedule jsonb not null,
  created_at timestamptz not null default now(),
  constraint management_source_schedule_subject_not_blank
    check (length(btrim(subject_name)) > 0),
  constraint management_source_schedule_document_not_blank
    check (length(btrim(source_document)) > 0),
  constraint management_source_schedule_array
    check (
      jsonb_typeof(source_schedule) = 'array'
      and jsonb_array_length(source_schedule) = source_period_count
    ),
  constraint management_source_schedule_reference_shape
    check (
      (
        reconciliation_strategy = 'COUNTERPART_SCHEDULE'
        and reference_section is not null
        and reference_section <> section
      )
      or (
        reconciliation_strategy = 'EXPLICIT_SCHEDULE'
        and reference_section is null
      )
    ),
  constraint management_source_schedule_unique
    unique (
      requirement_set_id,
      source_document,
      grade,
      section,
      audience_target,
      subject_name
    )
);

create index management_source_schedule_lookup_idx
  on public.management_source_schedule_evidence (
    requirement_set_id,
    section,
    audience_target,
    grade,
    subject_name
  );

alter table public.management_source_schedule_evidence
  enable row level security;

revoke insert, update, delete
  on public.management_source_schedule_evidence
  from anon, authenticated;

grant select
  on public.management_source_schedule_evidence
  to authenticated;

create policy management_source_schedule_evidence_read
  on public.management_source_schedule_evidence
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

comment on table public.management_source_schedule_evidence is
  'Normalized source-backed subject schedules used for management reconciliation. Student headcounts are intentionally excluded.';

do $$
declare
  v_requirement_set_id uuid;
  v_revision_id uuid;
  v_source_requirement_count integer;
  v_source_period_count integer;
  v_counterpart_count integer;
  v_counterpart_period_count integer;
  v_explicit_count integer;
  v_explicit_period_count integer;
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
    raise exception 'M25.2 requires the active 2026-2027 term-1 DRAFT';
  end if;

  if v_revision_id <>
       '02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5'::uuid then
    raise exception
      'M25.2 unexpected active DRAFT revision: %',
      v_revision_id;
  end if;

  if coalesce(
    (
      select revision.validation_summary
        ->> 'm25_1_audience_presence_reconciliation'
      from public.schedule_revisions revision
      where revision.id = v_revision_id
    ),
    ''
  ) <> 'PASS' then
    raise exception 'M25.2 requires M25.1 PASS';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.move_transactions move
    where move.schedule_revision_id = v_revision_id
  ) <> 0 then
    raise exception 'M25.2 clean DRAFT baseline drift';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       <> 'a0bb49d37440119271457d0f678456d4'
     or public.management_public_groups_hash('2026-2027')
       <> 'e9ff78dfe6bc55cc98c5aa589a80142e' then
    raise exception 'M25.2 public baseline drift';
  end if;

  insert into public.management_source_schedule_evidence (
    requirement_set_id,
    source_document,
    source_page,
    grade,
    section,
    audience_target,
    subject_name,
    reconciliation_strategy,
    reference_section,
    source_period_count,
    source_schedule
  )
  select
    v_requirement_set_id,
    '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf',
    1,
    source.grade,
    source.section,
    source.audience_target,
    source.subject_name,
    source.reconciliation_strategy,
    source.reference_section,
    source.source_period_count,
    source.source_schedule
  from (
    values
    (5, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":7,"r":"B1206"},{"d":5,"p":8,"r":"B1206"}]'::jsonb),
    (5, 'A', 'MUSIC', 'Ritmik', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":4,"r":"B1102"},{"d":5,"p":5,"r":"B1102"}]'::jsonb),
    (5, 'A', 'MUSIC', 'Solfej', 'COUNTERPART_SCHEDULE', 'B', 8, '[{"d":1,"p":7,"r":"A105"},{"d":1,"p":8,"r":"A105"},{"d":1,"p":9,"r":"A105"},{"d":2,"p":7,"r":"A105"},{"d":2,"p":8,"r":"A105"},{"d":2,"p":9,"r":"A105"},{"d":4,"p":7,"r":"B1102"},{"d":4,"p":8,"r":"B1102"}]'::jsonb),
    (6, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":7,"r":"B1206"},{"d":5,"p":8,"r":"B1206"}]'::jsonb),
    (6, 'A', 'MUSIC', 'Ritmik', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":9,"r":"B1102"},{"d":5,"p":10,"r":"B1102"}]'::jsonb),
    (6, 'A', 'MUSIC', 'Solfej', 'COUNTERPART_SCHEDULE', 'B', 8, '[{"d":1,"p":3,"r":"B1102"},{"d":1,"p":4,"r":"B1102"},{"d":1,"p":5,"r":"B1102"},{"d":4,"p":3,"r":"A105"},{"d":4,"p":4,"r":"A105"},{"d":5,"p":1,"r":"A105"},{"d":5,"p":2,"r":"A105"},{"d":5,"p":3,"r":"A105"}]'::jsonb),
    (7, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":4,"r":"B1206"},{"d":5,"p":5,"r":"B1206"}]'::jsonb),
    (7, 'A', 'MUSIC', 'Ritmik', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":7,"r":"B1102"},{"d":5,"p":8,"r":"B1102"}]'::jsonb),
    (7, 'A', 'MUSIC', 'Solfej', 'COUNTERPART_SCHEDULE', 'B', 8, '[{"d":1,"p":3,"r":"C109"},{"d":1,"p":4,"r":"C109"},{"d":2,"p":7,"r":"B1102"},{"d":2,"p":8,"r":"B1102"},{"d":2,"p":9,"r":"B1102"},{"d":4,"p":3,"r":"B1102"},{"d":4,"p":4,"r":"B1102"},{"d":4,"p":5,"r":"B1102"}]'::jsonb),
    (8, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":4,"r":"B1206"},{"d":5,"p":5,"r":"B1206"}]'::jsonb),
    (8, 'A', 'MUSIC', 'Ritmik', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":2,"r":"B1102"},{"d":5,"p":3,"r":"B1102"}]'::jsonb),
    (8, 'A', 'MUSIC', 'Solfej', 'COUNTERPART_SCHEDULE', 'B', 6, '[{"d":1,"p":2,"r":"A105"},{"d":1,"p":3,"r":"A105"},{"d":1,"p":4,"r":"A105"},{"d":5,"p":10,"r":"A105"},{"d":5,"p":11,"r":"A105"},{"d":5,"p":12,"r":"A105"}]'::jsonb),
    (9, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":2,"r":"B1206"},{"d":5,"p":3,"r":"B1206"}]'::jsonb),
    (9, 'A', 'MUSIC', 'Müzik Teorisi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":3,"p":2,"r":"C109"},{"d":3,"p":3,"r":"C109"}]'::jsonb),
    (9, 'A', 'MUSIC', 'ORKESTRA', 'COUNTERPART_SCHEDULE', 'B', 6, '[{"d":2,"p":3},{"d":2,"p":4},{"d":2,"p":5},{"d":4,"p":3},{"d":4,"p":4},{"d":4,"p":5}]'::jsonb),
    (10, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":2,"r":"B1206"},{"d":5,"p":3,"r":"B1206"}]'::jsonb),
    (10, 'A', 'MUSIC', 'Müzik Teorisi', 'EXPLICIT_SCHEDULE', null, 2, '[{"d":5,"p":7,"r":"A105"},{"d":5,"p":8,"r":"A105"}]'::jsonb),
    (10, 'A', 'MUSIC', 'ORKESTRA', 'COUNTERPART_SCHEDULE', 'B', 6, '[{"d":2,"p":3},{"d":2,"p":4},{"d":2,"p":5},{"d":4,"p":3},{"d":4,"p":4},{"d":4,"p":5}]'::jsonb),
    (11, 'A', 'MUSIC', 'Armoni', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":4,"r":"B1105B"},{"d":5,"p":5,"r":"B1105B"}]'::jsonb),
    (11, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":2,"r":"B1206"},{"d":5,"p":3,"r":"B1206"}]'::jsonb),
    (11, 'A', 'MUSIC', 'Müzik Tarihi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":7,"r":"C109"},{"d":5,"p":8,"r":"C109"}]'::jsonb),
    (11, 'A', 'MUSIC', 'Müzik Teorisi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":3,"p":2,"r":"A105"},{"d":3,"p":3,"r":"A105"}]'::jsonb),
    (11, 'A', 'MUSIC', 'ORKESTRA', 'COUNTERPART_SCHEDULE', 'B', 6, '[{"d":2,"p":3},{"d":2,"p":4},{"d":2,"p":5},{"d":4,"p":3},{"d":4,"p":4},{"d":4,"p":5}]'::jsonb),
    (11, 'A', 'MUSIC', 'Çalgı Bilgisi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":2,"p":1,"r":"A105"},{"d":2,"p":2,"r":"A105"}]'::jsonb),
    (12, 'A', 'MUSIC', 'Armoni', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":4,"p":9,"r":"B1102"},{"d":4,"p":10,"r":"B1102"}]'::jsonb),
    (12, 'A', 'MUSIC', 'Koro', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":2,"r":"B1206"},{"d":5,"p":3,"r":"B1206"}]'::jsonb),
    (12, 'A', 'MUSIC', 'Müzik Tarihi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":5,"p":4,"r":"B1105A"},{"d":5,"p":5,"r":"B1105A"}]'::jsonb),
    (12, 'A', 'MUSIC', 'Müzik Teorisi', 'COUNTERPART_SCHEDULE', 'B', 2, '[{"d":2,"p":9,"r":"A101"},{"d":2,"p":10,"r":"A101"}]'::jsonb),
    (12, 'A', 'MUSIC', 'ORKESTRA', 'COUNTERPART_SCHEDULE', 'B', 6, '[{"d":2,"p":3},{"d":2,"p":4},{"d":2,"p":5},{"d":4,"p":3},{"d":4,"p":4},{"d":4,"p":5}]'::jsonb)
  ) source(
    grade,
    section,
    audience_target,
    subject_name,
    reconciliation_strategy,
    reference_section,
    source_period_count,
    source_schedule
  );

  select
    count(*)::integer,
    coalesce(sum(source_period_count), 0)::integer,
    count(*) filter (
      where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    )::integer,
    coalesce(sum(source_period_count) filter (
      where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    ), 0)::integer,
    count(*) filter (
      where reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    )::integer,
    coalesce(sum(source_period_count) filter (
      where reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    ), 0)::integer
  into
    v_source_requirement_count,
    v_source_period_count,
    v_counterpart_count,
    v_counterpart_period_count,
    v_explicit_count,
    v_explicit_period_count
  from public.management_source_schedule_evidence evidence
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf';

  if v_source_requirement_count <> 29
     or v_source_period_count <> 96
     or v_counterpart_count <> 28
     or v_counterpart_period_count <> 94
     or v_explicit_count <> 1
     or v_explicit_period_count <> 2 then
    raise exception
      'M25.2 source normalization mismatch: req %, periods %, counterpart %/%, explicit %/%',
      v_source_requirement_count,
      v_source_period_count,
      v_counterpart_count,
      v_counterpart_period_count,
      v_explicit_count,
      v_explicit_period_count;
  end if;

  if not exists (
    select 1
    from public.management_source_schedule_evidence evidence
    where evidence.requirement_set_id = v_requirement_set_id
      and evidence.source_document =
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
      and evidence.grade = 10
      and evidence.section = 'A'
      and evidence.audience_target = 'MUSIC'
      and evidence.subject_name = 'Müzik Teorisi'
      and evidence.reconciliation_strategy = 'EXPLICIT_SCHEDULE'
      and evidence.source_schedule =
        '[{"d":5,"p":7,"r":"A105"},{"d":5,"p":8,"r":"A105"}]'::jsonb
  ) then
    raise exception 'M25.2 10A Müzik Teorisi source exception is missing';
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm25_2_music_a_source_normalization', 'PASS',
      'music_a_source_document',
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf',
      'music_a_source_requirement_count', 29,
      'music_a_source_period_count', 96,
      'music_a_counterpart_schedule_count', 28,
      'music_a_counterpart_period_count', 94,
      'music_a_explicit_schedule_count', 1,
      'music_a_explicit_period_count', 2,
      'music_a_apply_status', 'PENDING',
      'publication_source_complete', false,
      'public_projection_changed', false
    )
  where revision.id = v_revision_id;
end
$$;

create or replace function public.management_music_a_reconciliation_diagnostic()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
with recursive
latest_draft as (
  select
    revision.id as revision_id,
    revision.requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
),
source_rows as (
  select evidence.*
  from public.management_source_schedule_evidence evidence
  join latest_draft draft
    on draft.requirement_set_id = evidence.requirement_set_id
  where evidence.source_document =
    '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
),
group_tree(requirement_id, group_id) as (
  select
    requirement.id,
    requirement.instructional_group_id
  from public.course_requirements requirement
  join latest_draft draft
    on draft.requirement_set_id = requirement.requirement_set_id

  union

  select
    tree.requirement_id,
    relation.right_group_id
  from group_tree tree
  join public.instructional_group_relations relation
    on relation.left_group_id = tree.group_id
   and relation.relation = 'CONTAINS'
),
counterpart_requirements as (
  select distinct
    source.grade,
    source.subject_name,
    tree.requirement_id
  from source_rows source
  join public.subjects subject
    on subject.name = source.subject_name
  join public.course_requirements requirement
    on requirement.requirement_set_id = source.requirement_set_id
   and requirement.subject_id = subject.id
  join group_tree tree
    on tree.requirement_id = requirement.id
  join public.instructional_groups member_group
    on member_group.id = tree.group_id
  join public.class_groups class_group
    on class_group.id = member_group.class_group_id
  where source.reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    and class_group.academic_year = '2026-2027'
    and class_group.grade = source.grade
    and class_group.section = source.reference_section
    and member_group.audience_target = 'MUSIC'
),
counterpart_units_raw as (
  select
    counterpart.grade,
    counterpart.subject_name,
    placement.day_of_week::integer as day_of_week,
    period.period_number::integer as period_number,
    case
      when placement.room_id is null then null::text
      else regexp_replace(
        upper(coalesce(canonical_room.name, selected_room.name)),
        '[^A-Z0-9]',
        '',
        'g'
      )
    end as room_key
  from counterpart_requirements counterpart
  join latest_draft draft on true
  join public.schedule_cards card
    on card.schedule_revision_id = draft.revision_id
   and card.requirement_id = counterpart.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  cross join lateral generate_series(
    placement.start_period::integer,
    placement.start_period::integer + card.duration_periods::integer - 1
  ) period(period_number)
  left join public.rooms selected_room
    on selected_room.id = placement.room_id
  left join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
),
counterpart_units as (
  select distinct
    grade,
    subject_name,
    day_of_week,
    period_number,
    room_key
  from counterpart_units_raw
),
counterpart_schedules as (
  select
    unit.grade,
    unit.subject_name,
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'd', unit.day_of_week,
          'p', unit.period_number,
          'r', unit.room_key
        )
      )
      order by
        unit.day_of_week,
        unit.period_number,
        unit.room_key nulls first
    ) as schedule
  from counterpart_units unit
  group by unit.grade, unit.subject_name
),
comparisons as (
  select
    source.grade,
    source.subject_name,
    source.reconciliation_strategy,
    source.source_period_count,
    source.source_schedule,
    counterpart.schedule as counterpart_schedule,
    source.source_schedule is not distinct from counterpart.schedule
      as exact_match
  from source_rows source
  left join counterpart_schedules counterpart
    on counterpart.grade = source.grade
   and counterpart.subject_name = source.subject_name
),
a_music_requirements as (
  select distinct tree.requirement_id
  from group_tree tree
  join public.instructional_groups member_group
    on member_group.id = tree.group_id
  join public.class_groups class_group
    on class_group.id = member_group.class_group_id
  where class_group.academic_year = '2026-2027'
    and class_group.section = 'A'
    and member_group.audience_target = 'MUSIC'
),
custom_source as (
  select source.*
  from source_rows source
  where source.reconciliation_strategy = 'EXPLICIT_SCHEDULE'
),
custom_units as (
  select
    source.grade,
    source.subject_name,
    unit.d::smallint as day_of_week,
    unit.p::smallint as period_number,
    unit.r as room_key
  from custom_source source
  cross join lateral jsonb_to_recordset(source.source_schedule)
    as unit(d integer, p integer, r text)
),
custom_group as (
  select instructional_group.id
  from custom_source source
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = source.grade
   and class_group.section = source.section
  join public.instructional_groups instructional_group
    on instructional_group.requirement_set_id = source.requirement_set_id
   and instructional_group.class_group_id = class_group.id
   and instructional_group.group_type = 'MUSIC'
   and instructional_group.audience_target = 'MUSIC'
   and instructional_group.subgroup_label is null
  limit 1
),
custom_group_conflicts as (
  select distinct card.id as card_id
  from custom_units unit
  cross join custom_group target_group
  join latest_draft draft on true
  join public.schedule_cards card
    on card.schedule_revision_id = draft.revision_id
  join public.placements placement
    on placement.card_id = card.id
   and placement.day_of_week = unit.day_of_week
   and unit.period_number between
       placement.start_period
       and placement.start_period + card.duration_periods - 1
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where public.management_instructional_groups_conflict(
    target_group.id,
    requirement.instructional_group_id
  )
),
custom_room_conflicts as (
  select distinct card.id as card_id
  from custom_units unit
  join latest_draft draft on true
  join public.schedule_cards card
    on card.schedule_revision_id = draft.revision_id
  join public.placements placement
    on placement.card_id = card.id
   and placement.day_of_week = unit.day_of_week
   and unit.period_number between
       placement.start_period
       and placement.start_period + card.duration_periods - 1
  join public.rooms selected_room
    on selected_room.id = placement.room_id
  left join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where regexp_replace(
    upper(coalesce(canonical_room.name, selected_room.name)),
    '[^A-Z0-9]',
    '',
    'g'
  ) = unit.room_key
)
select jsonb_build_object(
  'revisionId', (select revision_id from latest_draft),
  'sourceRequirementCount', (select count(*) from source_rows),
  'sourcePeriodCount', (
    select coalesce(sum(source_period_count), 0)
    from source_rows
  ),
  'counterpartRequirementCount', (
    select count(*)
    from comparisons
    where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
  ),
  'counterpartExactMatchCount', (
    select count(*)
    from comparisons
    where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
      and exact_match
  ),
  'counterpartMismatchCount', (
    select count(*)
    from comparisons
    where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
      and not exact_match
  ),
  'counterpartMismatches', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'grade', grade,
          'subject', subject_name,
          'source', source_schedule,
          'counterpart', counterpart_schedule
        )
        order by grade, subject_name
      )
      from comparisons
      where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
        and not exact_match
    ),
    '[]'::jsonb
  ),
  'explicitSchedules', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'grade', grade,
          'subject', subject_name,
          'schedule', source_schedule
        )
        order by grade, subject_name
      )
      from comparisons
      where reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    ),
    '[]'::jsonb
  ),
  'existingAMusicRequirementCount',
    (select count(*) from a_music_requirements),
  'customGroupConflictCardCount',
    (select count(*) from custom_group_conflicts),
  'customRoomConflictCardCount',
    (select count(*) from custom_room_conflicts),
  'draftCardCount', (
    select count(*)
    from public.schedule_cards card
    join latest_draft draft
      on draft.revision_id = card.schedule_revision_id
  ),
  'draftPlacementCount', (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    join latest_draft draft
      on draft.revision_id = card.schedule_revision_id
  ),
  'publicSessionsHash',
    public.management_public_sessions_hash('2026-2027'),
  'publicGroupsHash',
    public.management_public_groups_hash('2026-2027'),
  'applyStatus', 'PENDING'
);
$function$;

revoke all
  on function public.management_music_a_reconciliation_diagnostic()
  from public, anon, authenticated;

commit;

-- Management v0.1 / M1
-- Additive domain schema foundation only.
-- Existing schedule_sessions + session_groups remain the current published read model.
-- No existing schedule rows are rewritten or backfilled by this migration.

begin;

create table public.requirement_sets (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  term smallint not null check (term > 0),
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  parent_id uuid null references public.requirement_sets(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint requirement_sets_parent_not_self
    check (parent_id is null or parent_id <> id),
  constraint requirement_sets_version_unique
    unique (academic_year, term, version_number)
);

create index requirement_sets_status_idx
  on public.requirement_sets (academic_year, term, status);

create table public.instructional_groups (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  class_group_id uuid null
    references public.class_groups(id) on delete restrict,
  name text not null,
  group_type text not null
    check (group_type in ('SECTION', 'BALLET', 'MUSIC', 'SUBGROUP', 'COMPOSITE')),
  term_status text not null
    check (term_status in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  knowledge_status text not null
    check (knowledge_status in ('CONFIRMED', 'OBSERVED', 'UNKNOWN')),
  created_at timestamptz not null default now(),
  constraint instructional_groups_name_not_blank
    check (length(btrim(name)) > 0),
  constraint instructional_groups_name_unique
    unique (requirement_set_id, name)
);

create index instructional_groups_requirement_set_idx
  on public.instructional_groups (requirement_set_id);
create index instructional_groups_class_group_idx
  on public.instructional_groups (class_group_id);

create table public.instructional_group_relations (
  id uuid primary key default gen_random_uuid(),
  left_group_id uuid not null
    references public.instructional_groups(id) on delete cascade,
  right_group_id uuid not null
    references public.instructional_groups(id) on delete cascade,
  relation text not null
    check (relation in ('CONTAINS', 'DISJOINT', 'OVERLAPS')),
  created_at timestamptz not null default now(),
  constraint instructional_group_relations_not_self
    check (left_group_id <> right_group_id),
  constraint instructional_group_relations_unique
    unique (left_group_id, right_group_id, relation)
);

create index instructional_group_relations_right_idx
  on public.instructional_group_relations (right_group_id);

create table public.course_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  subject_id uuid not null
    references public.subjects(id) on delete restrict,
  instructional_group_id uuid not null
    references public.instructional_groups(id) on delete restrict,
  weekly_load smallint not null,
  preferred_partition jsonb not null default '[]'::jsonb,
  allowed_partitions jsonb not null default '[]'::jsonb,
  min_distinct_days smallint null,
  max_blocks_per_day smallint null,
  max_consecutive_periods smallint null,
  course_character text not null
    check (course_character in ('ACADEMIC', 'TECHNIQUE', 'REPERTOIRE', 'REHEARSAL', 'OTHER')),
  term_status text not null
    check (term_status in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  knowledge_status text not null
    check (knowledge_status in ('CONFIRMED', 'OBSERVED', 'UNKNOWN')),
  teacher_mode text not null
    check (teacher_mode in ('FIXED', 'ELIGIBLE_POOL', 'UNKNOWN')),
  resource_mode text not null
    check (resource_mode in ('FIXED', 'ELIGIBLE_POOL', 'CAPABILITY', 'UNKNOWN')),
  required_capability text null,
  created_at timestamptz not null default now(),
  constraint course_requirements_weekly_load_nonnegative
    check (weekly_load >= 0),
  constraint course_requirements_active_load_positive
    check (term_status <> 'ACTIVE' or weekly_load > 0),
  constraint course_requirements_preferred_partition_array
    check (jsonb_typeof(preferred_partition) = 'array'),
  constraint course_requirements_allowed_partitions_array
    check (jsonb_typeof(allowed_partitions) = 'array'),
  constraint course_requirements_min_distinct_days_positive
    check (min_distinct_days is null or min_distinct_days > 0),
  constraint course_requirements_max_blocks_per_day_positive
    check (max_blocks_per_day is null or max_blocks_per_day > 0),
  constraint course_requirements_max_consecutive_periods_positive
    check (max_consecutive_periods is null or max_consecutive_periods > 0),
  constraint course_requirements_capability_present
    check (
      resource_mode <> 'CAPABILITY'
      or (required_capability is not null and length(btrim(required_capability)) > 0)
    ),
  constraint course_requirements_subject_group_unique
    unique (requirement_set_id, subject_id, instructional_group_id)
);

create index course_requirements_requirement_set_idx
  on public.course_requirements (requirement_set_id);
create index course_requirements_group_idx
  on public.course_requirements (instructional_group_id);
create index course_requirements_subject_idx
  on public.course_requirements (subject_id);

create table public.course_requirement_teachers (
  requirement_id uuid not null
    references public.course_requirements(id) on delete cascade,
  teacher_id uuid not null
    references public.teachers(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (requirement_id, teacher_id)
);

create index course_requirement_teachers_teacher_idx
  on public.course_requirement_teachers (teacher_id);

create table public.course_requirement_rooms (
  requirement_id uuid not null
    references public.course_requirements(id) on delete cascade,
  room_id uuid not null
    references public.rooms(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (requirement_id, room_id)
);

create index course_requirement_rooms_room_idx
  on public.course_requirement_rooms (room_id);

create table public.schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  base_revision_id uuid null
    references public.schedule_revisions(id) on delete restrict,
  validation_summary jsonb null,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint schedule_revisions_base_not_self
    check (base_revision_id is null or base_revision_id <> id),
  constraint schedule_revisions_validation_summary_object
    check (
      validation_summary is null
      or jsonb_typeof(validation_summary) = 'object'
    ),
  constraint schedule_revisions_version_unique
    unique (requirement_set_id, version_number)
);

create index schedule_revisions_status_idx
  on public.schedule_revisions (requirement_set_id, status);

create table public.schedule_cards (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  requirement_id uuid not null
    references public.course_requirements(id) on delete restrict,
  block_index smallint not null check (block_index > 0),
  duration_periods smallint not null check (duration_periods > 0),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint schedule_cards_block_unique
    unique (schedule_revision_id, requirement_id, block_index)
);

create index schedule_cards_revision_idx
  on public.schedule_cards (schedule_revision_id);
create index schedule_cards_requirement_idx
  on public.schedule_cards (requirement_id);

create table public.move_transactions (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  root_transaction_id uuid null
    references public.move_transactions(id) on delete restrict,
  parent_transaction_id uuid null
    references public.move_transactions(id) on delete restrict,
  actor_type text not null
    check (actor_type in ('USER', 'AUTO')),
  action text not null
    check (action in ('PLACE', 'MOVE', 'REMOVE', 'LOCK', 'UNLOCK')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint move_transactions_root_not_self
    check (root_transaction_id is null or root_transaction_id <> id),
  constraint move_transactions_parent_not_self
    check (parent_transaction_id is null or parent_transaction_id <> id),
  constraint move_transactions_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index move_transactions_revision_idx
  on public.move_transactions (schedule_revision_id);
create index move_transactions_root_idx
  on public.move_transactions (root_transaction_id);
create index move_transactions_parent_idx
  on public.move_transactions (parent_transaction_id);

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique
    references public.schedule_cards(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 5),
  start_period smallint not null check (start_period > 0),
  teacher_id uuid null
    references public.teachers(id) on delete restrict,
  room_id uuid null
    references public.rooms(id) on delete restrict,
  move_transaction_id uuid null
    references public.move_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index placements_day_period_idx
  on public.placements (day_of_week, start_period);
create index placements_teacher_idx
  on public.placements (teacher_id);
create index placements_room_idx
  on public.placements (room_id);
create index placements_move_transaction_idx
  on public.placements (move_transaction_id);

alter table public.rooms
  add column if not exists canonical_room_id uuid null
    references public.rooms(id) on delete set null,
  add column if not exists capabilities text[] not null default array[]::text[],
  add column if not exists knowledge_status text null;

alter table public.rooms
  add constraint rooms_canonical_not_self
    check (canonical_room_id is null or canonical_room_id <> id),
  add constraint rooms_knowledge_status_check
    check (
      knowledge_status is null
      or knowledge_status in ('CONFIRMED', 'OBSERVED', 'UNKNOWN')
    );

create index rooms_canonical_room_idx
  on public.rooms (canonical_room_id);

alter table public.requirement_sets enable row level security;
alter table public.instructional_groups enable row level security;
alter table public.instructional_group_relations enable row level security;
alter table public.course_requirements enable row level security;
alter table public.course_requirement_teachers enable row level security;
alter table public.course_requirement_rooms enable row level security;
alter table public.schedule_revisions enable row level security;
alter table public.schedule_cards enable row level security;
alter table public.move_transactions enable row level security;
alter table public.placements enable row level security;

-- RLS is intentionally enabled with no browser policies in M1.
-- Management authentication/RBAC and controlled writes are deferred.
-- Explicitly prevent anonymous writes even if broad schema grants exist.
revoke insert, update, delete on public.requirement_sets from anon;
revoke insert, update, delete on public.instructional_groups from anon;
revoke insert, update, delete on public.instructional_group_relations from anon;
revoke insert, update, delete on public.course_requirements from anon;
revoke insert, update, delete on public.course_requirement_teachers from anon;
revoke insert, update, delete on public.course_requirement_rooms from anon;
revoke insert, update, delete on public.schedule_revisions from anon;
revoke insert, update, delete on public.schedule_cards from anon;
revoke insert, update, delete on public.move_transactions from anon;
revoke insert, update, delete on public.placements from anon;

commit;

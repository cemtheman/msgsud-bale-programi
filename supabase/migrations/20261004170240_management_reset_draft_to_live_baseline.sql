-- Management / 4 Oct 2026 live-baseline DRAFT reset
--
-- HISTORICAL / OPERATIONAL MIGRATION RECORD
--
-- This version was executed atomically against the live MSGSÜ management
-- database on 2026-10-04. It archived the heavily edited DRAFT v2 and created
-- clean DRAFT v3 from the verified effective student-program baseline.
--
-- Applied live result:
--   source revision v2:
--     02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5
--     300 cards / 300 placements / 552 move transactions
--     status -> ARCHIVED
--   clean revision v3:
--     16d8cb8e-1ea2-4af2-899c-a9df052bde8c
--     299 cards / 299 placements / 0 move transactions
--     status -> DRAFT
--   discarded test-era card:
--     10A MUSIC / Müzik Teorisi
--
-- Public student schedule was NOT mutated.
-- Verified public baseline:
--   schedule_sessions = 517
--   session_groups     = 609
--   sessions hash      = a0bb49d37440119271457d0f678456d4
--   groups hash        = e9ff78dfe6bc55cc98c5aa589a80142e
--
-- The live operation also created:
--   public.management_live_baseline_reset_runs
-- with VIEWER read access and no authenticated write access.
--
-- IMPORTANT:
-- This reset was deliberately pinned to the then-current live DRAFT and its
-- audit/hash invariants. Replaying that destructive operational reset against
-- another database would be unsafe, so this repository file is a historical
-- parity marker rather than a second reset attempt. The persistent schema
-- created by the operation is reproduced idempotently below.

begin;

create table if not exists public.management_live_baseline_reset_runs (
  id uuid primary key default gen_random_uuid(),
  source_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  clean_revision_id uuid not null unique
    references public.schedule_revisions(id) on delete restrict,
  academic_year text not null,
  term smallint not null,
  source_card_count integer not null,
  clean_card_count integer not null,
  source_placement_count integer not null,
  clean_placement_count integer not null,
  source_move_count integer not null,
  public_session_count integer not null,
  public_group_count integer not null,
  public_sessions_hash text not null,
  public_groups_hash text not null,
  discarded_cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.management_live_baseline_reset_runs
  enable row level security;

revoke insert, update, delete
  on public.management_live_baseline_reset_runs
  from anon, authenticated;

grant select
  on public.management_live_baseline_reset_runs
  to authenticated;

drop policy if exists management_live_baseline_reset_runs_read
  on public.management_live_baseline_reset_runs;

create policy management_live_baseline_reset_runs_read
  on public.management_live_baseline_reset_runs
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

commit;

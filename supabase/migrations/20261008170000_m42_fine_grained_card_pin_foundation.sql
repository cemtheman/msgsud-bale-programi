-- M42 fine-grained card pin foundation.
-- Existing locked=true remains a full pin. New dimensions allow solver-local
-- time/teacher/room preservation independently.

begin;

alter table public.schedule_cards
  add column if not exists time_pinned boolean not null default false,
  add column if not exists teacher_pinned boolean not null default false,
  add column if not exists room_pinned boolean not null default false;

alter function public.management_preview_solver_snapshot(uuid, uuid)
  rename to management_preview_solver_snapshot_m42_base;

create or replace function public.management_preview_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_base jsonb;
  v_cards jsonb;
  v_rules jsonb;
  v_core jsonb;
  v_snapshot_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M42 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base := public.management_preview_solver_snapshot_m42_base(
    p_schedule_revision_id,
    p_objective_profile_id
  );

  select coalesce(
    jsonb_agg(
      card_entry.value || jsonb_build_object(
        'timePinned', card.time_pinned,
        'teacherPinned', card.teacher_pinned,
        'roomPinned', card.room_pinned
      )
      order by card_entry.ordinality
    ),
    '[]'::jsonb
  )
  into v_cards
  from jsonb_array_elements(
    coalesce(v_base -> 'cards', '[]'::jsonb)
  ) with ordinality card_entry(value, ordinality)
  join public.schedule_cards card
    on card.id = (card_entry.value ->> 'id')::uuid
   and card.schedule_revision_id = p_schedule_revision_id;

  v_rules := coalesce(
    v_base #> '{hardConstraintContract,rules}',
    '[]'::jsonb
  );

  if not v_rules @> '["FINE_GRAINED_CARD_PIN"]'::jsonb then
    v_rules := v_rules || '["FINE_GRAINED_CARD_PIN"]'::jsonb;
  end if;

  v_core :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M42-v1',
      'cards', v_cards
    );

  v_core := jsonb_set(
    v_core,
    '{hardConstraintContract,rules}',
    v_rules,
    true
  );

  v_snapshot_hash := md5(v_core::text);

  return v_core || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_base ->> 'baselineHash'
  );
end
$function$;

revoke all
  on function public.management_preview_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_preview_solver_snapshot(uuid, uuid)
  to authenticated;

comment on column public.schedule_cards.time_pinned is
  'M42 solver pin: preserve baseline day/start period while other unpinned dimensions may change.';
comment on column public.schedule_cards.teacher_pinned is
  'M42 solver pin: preserve baseline teacher while other unpinned dimensions may change.';
comment on column public.schedule_cards.room_pinned is
  'M42 solver pin: preserve baseline room while other unpinned dimensions may change.';
comment on function public.management_preview_solver_snapshot(uuid, uuid) is
  'M42 snapshot wrapper adding fine-grained card pin dimensions. Legacy locked=true remains a full pin.';

commit;

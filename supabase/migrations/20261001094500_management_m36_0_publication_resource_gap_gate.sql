-- Management / M36.0
-- Direct publication blockers for placed cards with missing required resources.
--
-- M35.2 intentionally stopped rebuilding candidate-domain summaries inside
-- teacher-departure transactions. Publication safety must therefore validate
-- live placements directly, independently of persisted domain summaries.

begin;

alter function public.management_preview_publication(uuid)
  rename to management_preview_publication_m36_base;

revoke all
  on function public.management_preview_publication_m36_base(uuid)
  from public, anon, authenticated;


create or replace function public.management_preview_publication(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_block_reasons jsonb;
  v_missing_teacher integer;
  v_missing_room integer;
  v_can_publish boolean;
begin
  v_base :=
    public.management_preview_publication_m36_base(
      p_schedule_revision_id
    );

  select count(*)
  into v_missing_teacher
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.teacher_requirement = 'REQUIRED'
    and placement.teacher_id is null;

  select count(*)
  into v_missing_room
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and coalesce(requirement.resource_mode, 'UNKNOWN') <> 'UNKNOWN'
    and placement.room_id is null;

  v_block_reasons :=
    coalesce(v_base -> 'blockReasons', '[]'::jsonb);

  if v_missing_teacher > 0
     and not (
       v_block_reasons
       @> '["MISSING_REQUIRED_TEACHER_PLACEMENT"]'::jsonb
     ) then
    v_block_reasons :=
      v_block_reasons
      || jsonb_build_array('MISSING_REQUIRED_TEACHER_PLACEMENT');
  end if;

  if v_missing_room > 0
     and not (
       v_block_reasons
       @> '["MISSING_REQUIRED_ROOM_PLACEMENT"]'::jsonb
     ) then
    v_block_reasons :=
      v_block_reasons
      || jsonb_build_array('MISSING_REQUIRED_ROOM_PLACEMENT');
  end if;

  v_can_publish := jsonb_array_length(v_block_reasons) = 0;

  return
    v_base
    || jsonb_build_object(
      'canPublish', v_can_publish,
      'canCurrentUserPublish',
        v_can_publish and public.has_management_role('ADMIN'),
      'blockReasons', v_block_reasons,
      'missingRequiredTeacherPlacementCount',
        v_missing_teacher,
      'missingRequiredRoomPlacementCount',
        v_missing_room
    );
end
$$;

revoke all
  on function public.management_preview_publication(uuid)
  from public, anon;

grant execute
  on function public.management_preview_publication(uuid)
  to authenticated;

comment on function public.management_preview_publication(uuid) is
  'M36 publication gate. Extends the established publication preview with live-placement blockers for missing required teachers and rooms, independent of candidate-domain freshness.';

comment on function public.management_preview_publication_m36_base(uuid) is
  'Pre-M36 publication gate retained as an internal base implementation.';

commit;

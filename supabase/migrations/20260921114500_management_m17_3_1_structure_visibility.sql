-- Management / M17.3.1
-- Transaction visibility hardening for structural preview/apply.
--
-- Structural apply serializes on schedule_revisions. The token/preview helpers
-- must take a fresh snapshot after that lock is acquired and must also observe
-- mutations made earlier by the same apply command when returning the new token.
-- VOLATILE supplies the required command-level visibility; these functions
-- remain logically read-only.

begin;

alter function public.management_requirement_structure_state_token(uuid)
  volatile;

alter function public.management_preview_requirement_structure(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text
)
  volatile;

alter function public.management_preview_requirement_structure_v2(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text
)
  volatile;

comment on function public.management_requirement_structure_state_token(uuid) is
  'M17.3.1 structural state fingerprint. VOLATILE for fresh visibility after revision serialization and within structural apply; performs no writes.';

comment on function public.management_preview_requirement_structure_v2(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text
) is
  'M17.3.1 token-bearing structural preview. VOLATILE for fresh serialized-state visibility; read-only and includes locked-card removal guard.';

commit;

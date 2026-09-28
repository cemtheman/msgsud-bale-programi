-- M32.3A teacher-assignment policy audit
-- Safe read-only helper for Supabase SQL Editor.

with active_revision as (
  select revision.id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.created_at desc
  limit 1
)
select public.management_diagnose_teacher_assignment_policy(id)
from active_revision;

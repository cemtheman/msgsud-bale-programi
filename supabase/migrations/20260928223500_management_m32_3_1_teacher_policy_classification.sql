-- Management M32.3.1
-- High-confidence teacher-policy classification.
--
-- Builds on M32.3A without changing placements or candidate domains.
--
-- Confirmed product rules:
--   * SECTION Mathematics chooses one teacher for the whole requirement.
--   * Orchestra is block-flexible, like Ballet/Solfege.
--
-- No timetable mutation. No candidate rebuild. No publication mutation.

begin;

-- Standard section Mathematics: choose once for the whole course/section.
update public.course_requirements requirement
set
  teacher_assignment_scope = 'REQUIREMENT',
  teacher_continuity = 'REQUIRED'
from public.subjects subject,
     public.instructional_groups instructional_group
where subject.id = requirement.subject_id
  and instructional_group.id = requirement.instructional_group_id
  and lower(subject.name) = lower('Matematik')
  and instructional_group.group_type = 'SECTION';

-- Orchestra: each weekly block may legitimately use a different eligible teacher.
update public.course_requirements requirement
set
  teacher_assignment_scope = 'BLOCK',
  teacher_continuity = 'NONE'
from public.subjects subject
where subject.id = requirement.subject_id
  and lower(subject.name) = lower('ORKESTRA');

comment on column public.course_requirements.teacher_assignment_scope is
  'M32.3.1 teacher decision granularity. REQUIREMENT chooses one teacher for all weekly blocks; BLOCK chooses per card; UNSPECIFIED preserves legacy/manual behavior until policy is confirmed.';

commit;

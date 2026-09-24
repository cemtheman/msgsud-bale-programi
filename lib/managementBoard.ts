'use client';

export type ManagementResourceView = 'SINIFLAR' | 'ÖĞRETMENLER' | 'SALONLAR';
export type ManagementStage = 'ORTAOKUL' | 'LISE';
export type ManagementDomainStatus = 'VALID' | 'INVALID' | 'UNRESOLVED';
export type ManagementCandidateStatus = 'VALID' | 'INVALID' | 'UNRESOLVED';
export type ManagementAudienceScope = 'ALL' | 'SECTION' | 'BALLET' | 'MUSIC';

export interface ManagementBoardPlacement {
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  roomName: string | null;
  moveTransactionId: string | null;
}

export interface ManagementBoardCard {
  id: string;
  requirementId: string;
  blockIndex: number;
  durationPeriods: number;
  locked: boolean;
  subjectId: string;
  subjectName: string;
  groupId: string;
  groupName: string;
  groupType: string;
  classCodes: string[];
  audienceTargets: string[];
  weeklyLoad: number;
  teacherMode: string;
  teacherIds: string[];
  teacherNames: string[];
  resourceMode: string;
  roomIds: string[];
  roomNames: string[];
  courseCharacter: string;
  deliveryMode: string;
  knowledgeStatus: string;
  domainStatus: ManagementDomainStatus;
  validCount: number;
  invalidCount: number;
  unresolvedCount: number;
  isForced: boolean;
  isContradiction: boolean;
  placement: ManagementBoardPlacement | null;
}

export interface ManagementBoardRow {
  id: string;
  label: string;
  secondary: string | null;
  classCode?: string;
  classCodes?: string[];
  gradeGroup?: number;
  groupLabel?: string;
  audienceScope?: ManagementAudienceScope;
  availableAudiences?: ManagementAudienceScope[];
  includeSectionCards?: boolean;
}

export interface ManagementBoardData {
  revisionId: string;
  cards: ManagementBoardCard[];
  classRows: ManagementBoardRow[];
  teacherRows: ManagementBoardRow[];
  roomRows: ManagementBoardRow[];
  teacherNamesById: Record<string, string>;
  roomNamesById: Record<string, string>;
}

export interface ManagementBoardDisplayCard {
  id: string;
  card: ManagementBoardCard;
  sourceCardIds: string[];
  classCodes: string[];
  grouped: boolean;
}

export interface ManagementCandidateAssessment {
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string | null;
  roomId: string | null;
  status: ManagementCandidateStatus;
  isComplete: boolean;
  reasonCodes: string[];
}

export interface ManagementCandidateDetail {
  assessments: ManagementCandidateAssessment[];
  reasonCounts: Array<{ code: string; count: number }>;
  validCandidates: ManagementCandidateAssessment[];
}

interface RevisionRow {
  id: string;
  requirement_set_id: string;
}

interface CardRow {
  id: string;
  requirement_id: string;
  block_index: number;
  duration_periods: number;
  locked: boolean;
}

interface RequirementRow {
  id: string;
  subject_id: string;
  instructional_group_id: string;
  weekly_load: number;
  teacher_mode: string;
  resource_mode: string;
  course_character: string;
  delivery_mode: string;
  knowledge_status: string;
}

interface GroupRow {
  id: string;
  class_group_id: string | null;
  name: string;
  group_type: string;
  audience_target: string | null;
}

interface GroupRelationRow {
  left_group_id: string;
  right_group_id: string;
  relation: string;
}

interface ClassGroupRow {
  id: string;
  grade: number;
  section: string;
}

interface NamedRow {
  id: string;
  name: string;
}

interface TeacherNameOverrideRow {
  teacher_id: string;
  display_name: string;
}

interface RoomNameOverrideRow {
  room_id: string;
  display_name: string;
}

interface RequirementTeacherRow {
  requirement_id: string;
  teacher_id: string;
}

interface RequirementRoomRow {
  requirement_id: string;
  room_id: string;
}

interface PlacementRow {
  card_id: string;
  day_of_week: number;
  start_period: number;
  teacher_id: string | null;
  room_id: string | null;
  move_transaction_id: string | null;
}

interface DomainRow {
  card_id: string;
  domain_status: ManagementDomainStatus;
  valid_count: number;
  invalid_count: number;
  unresolved_count: number;
  is_forced: boolean;
  is_contradiction: boolean;
}

interface AssessmentRow {
  day_of_week: number;
  start_period: number;
  teacher_id: string | null;
  room_id: string | null;
  status: ManagementCandidateStatus;
  is_complete: boolean;
  reason_codes: string[];
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

function translateManagementReadError(message: string, fallback: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('statement timeout')
    || normalized.includes('canceling statement due to statement timeout')
    || normalized.includes('query timeout')
  ) {
    return 'Yönetim verisi hazırlanırken işlem beklenenden uzun sürdü ve zaman aşımına uğradı. Lütfen yeniden deneyin.';
  }

  if (normalized.includes('permission denied')) {
    return 'Bu yönetim verisini görüntüleme yetkiniz yok.';
  }

  return fallback;
}

async function authedGet<T>(path: string, accessToken: string): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = '';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
        hint?: string;
      };
      message = body.message ?? body.details ?? body.hint ?? '';
    } catch {
      message = '';
    }

    throw new Error(
      translateManagementReadError(
        message,
        `Yönetim çalışma verisi alınamadı (${response.status}).`,
      ),
    );
  }

  return response.json() as Promise<T>;
}

function classCode(row: ClassGroupRow) {
  return `${row.grade}${row.section}`;
}

function gradeFromClassCode(code: string) {
  const match = code.match(/^(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

export function cardMatchesStage(
  card: ManagementBoardCard,
  stage: ManagementStage,
) {
  if (card.classCodes.length === 0) return true;

  return card.classCodes.some((code) => {
    const grade = gradeFromClassCode(code);
    if (grade === null) return true;
    return stage === 'ORTAOKUL' ? grade <= 8 : grade >= 9;
  });
}

export function cardMatchesAudience(
  card: ManagementBoardCard,
  audience: ManagementAudienceScope,
) {
  if (audience === 'ALL') return true;
  if (audience === 'SECTION') {
    return card.audienceTargets.includes('SECTION');
  }

  // A BALLET / MUSIC program view is a student-program view: students also
  // attend their SECTION lessons. Keep SECTION strict when explicitly chosen,
  // but include common lessons in the discipline-specific program filters.
  return card.audienceTargets.includes(audience)
    || card.audienceTargets.includes('SECTION');
}

function audienceSymbol(audience: ManagementAudienceScope) {
  if (audience === 'SECTION') return '📚';
  if (audience === 'BALLET') return '🩰';
  if (audience === 'MUSIC') return '🎶';
  return '';
}

export function formatInstructionalGroupName(name: string) {
  return name
    .replace(/\bSECTION\b/g, '📚')
    .replace(/\bBALLET\b/g, '🩰')
    .replace(/\bMUSIC\b/g, '🎶')
    .replace(/\bSHARED\b/g, 'Ortak')
    .replace(/\bPARALLEL\b/g, 'Paralel')
    .replace(/\bSTANDARD\b/g, 'Standart')
    .replace(/\s+\/\s+/g, ' · ')
    .replace(/\s+•\s+/g, ' · ');
}

export function translateCandidateReason(code: string) {
  const labels: Record<string, string> = {
    TEACHER_UNKNOWN: 'Öğretmen ataması belirsiz',
    TEACHER_ASSIGNMENT_MISSING: 'Öğretmen ataması eksik',
    ROOM_UNKNOWN: 'Salon ataması belirsiz',
    ROOM_ASSIGNMENT_MISSING: 'Salon ataması eksik',
    CAPABILITY_UNCONFIRMED: 'Gerekli salon özelliği henüz doğrulanmamış',
    CAPABILITY_UNRESOLVED: 'Gerekli salon özelliğine uygun kaynak bulunamadı',
    TIME_OUTSIDE_DAY: 'Ders okul gününün dışına taşıyor',
    LUNCH_BREAK_CROSSING: 'Ders öğle arasını kesiyor',
    TEACHER_CONFLICT: 'Öğretmen aynı saatte başka derste',
    ROOM_CONFLICT: 'Salon aynı saatte kullanımda',
    ROOM_INACTIVE: 'Salon kullanımda değil',
    GROUP_CONFLICT: 'Öğrenci grubu aynı saatte başka derste',
  };

  return labels[code] ?? code.replaceAll('_', ' ').toLocaleLowerCase('tr-TR');
}

export function managementCardStatus(card: ManagementBoardCard) {
  if (card.placement) return 'Yerleşmiş';
  if (card.isContradiction) return 'Çelişki';
  if (card.isForced) return 'Zorunlu';
  if (card.unresolvedCount > 0) return 'Belirsiz';
  return 'Uygun';
}

export function buildManagementRowDisplayCards(
  cards: ManagementBoardCard[],
  view: ManagementResourceView,
): ManagementBoardDisplayCard[] {
  const singleCard = (card: ManagementBoardCard): ManagementBoardDisplayCard => ({
    id: `card:${card.id}`,
    card,
    sourceCardIds: [card.id],
    classCodes: [...card.classCodes],
    grouped: false,
  });

  if (view !== 'SINIFLAR') {
    return cards.map(singleCard);
  }

  const groups = new Map<string, ManagementBoardDisplayCard>();

  cards.forEach((card) => {
    if (!card.placement) {
      groups.set(`card:${card.id}`, singleCard(card));
      return;
    }

    const audienceKey = [...card.audienceTargets].sort().join(',');
    const key = [
      card.subjectId,
      card.placement.dayOfWeek,
      card.placement.startPeriod,
      card.durationPeriods,
      audienceKey,
      card.courseCharacter,
      card.deliveryMode,
    ].join('::');

    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id: `group:${key}`,
        card,
        sourceCardIds: [card.id],
        classCodes: [...card.classCodes],
        grouped: false,
      });
      return;
    }

    existing.sourceCardIds.push(card.id);
    card.classCodes.forEach((code) => {
      if (!existing.classCodes.includes(code)) {
        existing.classCodes.push(code);
      }
    });
    existing.grouped = true;
  });

  return Array.from(groups.values()).map((displayCard) => ({
    ...displayCard,
    sourceCardIds: [...displayCard.sourceCardIds].sort(),
    classCodes: [...displayCard.classCodes].sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true }),
    ),
    grouped: displayCard.sourceCardIds.length > 1,
  }));
}

export function cardBelongsToClassRow(
  card: ManagementBoardCard,
  row: ManagementBoardRow,
) {
  const fallbackClassCode = row.classCode ?? row.id.split('::')[0];
  const rowClassCodes = row.classCodes?.length
    ? row.classCodes
    : [fallbackClassCode];

  if (!card.classCodes.some((code) => rowClassCodes.includes(code))) {
    return false;
  }

  const scope = row.audienceScope ?? 'ALL';
  if (scope === 'ALL') return true;

  if (card.audienceTargets.includes(scope)) {
    return true;
  }

  // Filtered BALLET / MUSIC views represent the student's complete program,
  // so their common SECTION lessons are included there. In the combined view
  // rows stay strict, preventing common lessons from being repeated.
  return Boolean(
    row.includeSectionCards
    && (scope === 'BALLET' || scope === 'MUSIC')
    && card.audienceTargets.includes('SECTION'),
  );
}

export function buildManagementClassRows(
  classGroups: Array<{ grade: number; section: string }>,
  cards: ManagementBoardCard[],
  audiencesByClassCode: Readonly<Record<string, readonly ManagementAudienceScope[]>> = {},
): ManagementBoardRow[] {
  const audienceOrder: ManagementAudienceScope[] = [
    'SECTION',
    'BALLET',
    'MUSIC',
  ];

  const classCodesByGrade = new Map<number, string[]>();
  classGroups.forEach((row) => {
    const code = `${row.grade}${row.section}`;
    const values = classCodesByGrade.get(row.grade) ?? [];
    values.push(code);
    classCodesByGrade.set(row.grade, values);
  });

  const availableAudiencesForClass = (code: string) => {
    if (audiencesByClassCode[code]?.length) {
      return audiencesByClassCode[code];
    }

    return Array.from(new Set(
      cards
        .filter((card) => card.classCodes.includes(code))
        .flatMap((card) => card.audienceTargets)
        .filter(
          (target): target is ManagementAudienceScope =>
            target === 'SECTION'
            || target === 'BALLET'
            || target === 'MUSIC',
        ),
    ));
  };

  return Array.from(classCodesByGrade.entries())
    .sort(([gradeA], [gradeB]) => gradeA - gradeB)
    .flatMap<ManagementBoardRow>(([grade, rawCodes]) => {
      const codes = [...rawCodes].sort((a, b) =>
        a.localeCompare(b, 'tr', { numeric: true }),
      );

      const activeCodes = codes.filter((code) => (
        cards.some((card) => card.classCodes.includes(code))
        || availableAudiencesForClass(code).length > 0
      ));

      if (activeCodes.length === 0) return [];

      return audienceOrder.flatMap<ManagementBoardRow>((scope) => {
        const participantCodes = activeCodes.filter((code) =>
          availableAudiencesForClass(code).includes(scope),
        );

        if (participantCodes.length === 0) return [];

        return [{
          id: `grade-${grade}::${scope}`,
          label: scope === 'SECTION'
            ? '📚 Ortak'
            : scope === 'BALLET'
              ? '🩰 Bale'
              : '🎶 Müzik',
          secondary: participantCodes.join(' + '),
          classCodes: participantCodes,
          gradeGroup: grade,
          groupLabel: `${grade}. Sınıflar`,
          audienceScope: scope,
          availableAudiences: [scope],
          includeSectionCards: false,
        }];
      });
    });
}

export function managementRowsForView(
  data: ManagementBoardData,
  view: ManagementResourceView,
  stage: ManagementStage,
  audience: ManagementAudienceScope = 'ALL',
) {
  const visibleCards = data.cards.filter(
    (card) => cardMatchesStage(card, stage) && cardMatchesAudience(card, audience),
  );

  if (view === 'SINIFLAR') {
    const stageRows = data.classRows.filter((row) => {
      const grade = row.gradeGroup
        ?? gradeFromClassCode(row.classCode ?? row.classCodes?.[0] ?? row.id);
      return grade !== null && (stage === 'ORTAOKUL' ? grade <= 8 : grade >= 9);
    });

    if (audience === 'ALL') return stageRows;

    if (audience === 'SECTION') {
      const seen = new Set<string>();

      return stageRows.flatMap<ManagementBoardRow>((row) => {
        const gradeKey = String(
          row.gradeGroup
          ?? gradeFromClassCode(row.classCode ?? row.classCodes?.[0] ?? row.id),
        );
        if (seen.has(gradeKey) || row.audienceScope !== 'SECTION') return [];

        seen.add(gradeKey);
        return [{
          ...row,
          includeSectionCards: false,
        }];
      });
    }

    // BALLET / MUSIC filters select the corresponding student-program row
    // only. Common SECTION lessons are already included *inside* that row by
    // cardBelongsToClassRow/cardMatchesAudience; sibling audience rows must not
    // leak into the filtered view merely because the class supports the target
    // audience.
    return stageRows
      .filter((row) => row.audienceScope === audience)
      .map((row) => ({
        ...row,
        includeSectionCards: true,
      }));
  }

  if (view === 'ÖĞRETMENLER') {
    const ids = new Set<string>();
    visibleCards.forEach((card) => {
      card.teacherIds.forEach((id) => ids.add(id));
      if (card.placement?.teacherId) ids.add(card.placement.teacherId);
    });
    return data.teacherRows.filter((row) => ids.has(row.id));
  }

  const ids = new Set<string>();
  visibleCards.forEach((card) => {
    card.roomIds.forEach((id) => ids.add(id));
    if (card.placement?.roomId) ids.add(card.placement.roomId);
  });
  return data.roomRows.filter((row) => ids.has(row.id));
}

export function placementBelongsToRow(
  card: ManagementBoardCard,
  row: ManagementBoardRow,
  view: ManagementResourceView,
) {
  if (!card.placement) return false;

  if (view === 'SINIFLAR') {
    return cardBelongsToClassRow(card, row);
  }

  if (view === 'ÖĞRETMENLER') {
    return card.placement.teacherId === row.id;
  }

  return card.placement.roomId === row.id;
}

export async function fetchManagementBoard(
  accessToken: string,
): Promise<ManagementBoardData | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id,requirement_set_id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const [
    cards,
    requirements,
    groups,
    groupRelations,
    classGroups,
    subjects,
    requirementTeachers,
    teachers,
    requirementRooms,
    rooms,
    placements,
    domains,
    teacherNameOverrides,
    roomNameOverrides,
  ] = await Promise.all([
    authedGet<CardRow[]>(
      `schedule_cards?select=id,requirement_id,block_index,duration_periods,locked&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<RequirementRow[]>(
      `course_requirements?select=id,subject_id,instructional_group_id,weekly_load,teacher_mode,resource_mode,course_character,delivery_mode,knowledge_status&requirement_set_id=eq.${revision.requirement_set_id}&term_status=eq.ACTIVE`,
      accessToken,
    ),
    authedGet<GroupRow[]>(
      `instructional_groups?select=id,class_group_id,name,group_type,audience_target&requirement_set_id=eq.${revision.requirement_set_id}`,
      accessToken,
    ),
    authedGet<GroupRelationRow[]>(
      'instructional_group_relations?select=left_group_id,right_group_id,relation',
      accessToken,
    ),
    authedGet<ClassGroupRow[]>(
      'class_groups?select=id,grade,section&academic_year=eq.2026-2027&order=grade.asc,section.asc',
      accessToken,
    ),
    authedGet<NamedRow[]>(
      'subjects?select=id,name',
      accessToken,
    ),
    authedGet<RequirementTeacherRow[]>(
      'course_requirement_teachers?select=requirement_id,teacher_id',
      accessToken,
    ),
    authedGet<NamedRow[]>(
      'teachers?select=id,name',
      accessToken,
    ),
    authedGet<RequirementRoomRow[]>(
      'course_requirement_rooms?select=requirement_id,room_id',
      accessToken,
    ),
    authedGet<NamedRow[]>(
      'rooms?select=id,name',
      accessToken,
    ),
    authedGet<PlacementRow[]>(
      'placements?select=card_id,day_of_week,start_period,teacher_id,room_id,move_transaction_id',
      accessToken,
    ),
    authedGet<DomainRow[]>(
      'schedule_card_domain_summaries?select=card_id,domain_status,valid_count,invalid_count,unresolved_count,is_forced,is_contradiction',
      accessToken,
    ),
    authedGet<TeacherNameOverrideRow[]>(
      `management_teacher_name_overrides?select=teacher_id,display_name&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<RoomNameOverrideRow[]>(
      `management_room_name_overrides?select=room_id,display_name&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
  ]);

  const requirementById = new Map(requirements.map((row) => [row.id, row]));
  const groupById = new Map(groups.map((row) => [row.id, row]));
  const classById = new Map(classGroups.map((row) => [row.id, row]));
  const subjectById = new Map(subjects.map((row) => [row.id, row.name]));
  const teacherOverrideById = new Map(
    teacherNameOverrides.map((row) => [row.teacher_id, row.display_name]),
  );
  const roomOverrideById = new Map(
    roomNameOverrides.map((row) => [row.room_id, row.display_name]),
  );
  const teacherById = new Map(
    teachers.map((row) => [
      row.id,
      teacherOverrideById.get(row.id) ?? row.name,
    ]),
  );
  const roomById = new Map(
    rooms.map((row) => [
      row.id,
      roomOverrideById.get(row.id) ?? row.name,
    ]),
  );
  const placementByCard = new Map(placements.map((row) => [row.card_id, row]));
  const domainByCard = new Map(domains.map((row) => [row.card_id, row]));

  const childGroupsByComposite = new Map<string, string[]>();
  groupRelations
    .filter((row) => row.relation === 'CONTAINS')
    .forEach((row) => {
      const values = childGroupsByComposite.get(row.left_group_id) ?? [];
      values.push(row.right_group_id);
      childGroupsByComposite.set(row.left_group_id, values);
    });

  const classCodesByGroup = new Map<string, string[]>();

  const resolveClassCodes = (groupId: string, seen = new Set<string>()): string[] => {
    const cached = classCodesByGroup.get(groupId);
    if (cached) return cached;

    if (seen.has(groupId)) return [];
    seen.add(groupId);

    const group = groupById.get(groupId);
    if (!group) return [];

    if (group.class_group_id) {
      const classGroup = classById.get(group.class_group_id);
      const value = classGroup ? [classCode(classGroup)] : [];
      classCodesByGroup.set(groupId, value);
      return value;
    }

    const values = new Set<string>();
    (childGroupsByComposite.get(groupId) ?? []).forEach((childId) => {
      resolveClassCodes(childId, new Set(seen)).forEach((code) => values.add(code));
    });

    const result = Array.from(values).sort((a, b) => {
      const gradeA = gradeFromClassCode(a) ?? 99;
      const gradeB = gradeFromClassCode(b) ?? 99;
      return gradeA - gradeB || a.localeCompare(b, 'tr');
    });

    classCodesByGroup.set(groupId, result);
    return result;
  };

  const audienceTargetsByGroup = new Map<string, string[]>();

  const resolveAudienceTargets = (
    groupId: string,
    seen = new Set<string>(),
  ): string[] => {
    const cached = audienceTargetsByGroup.get(groupId);
    if (cached) return cached;

    if (seen.has(groupId)) return [];
    seen.add(groupId);

    const group = groupById.get(groupId);
    if (!group) return [];

    if (group.audience_target) {
      const value = [group.audience_target];
      audienceTargetsByGroup.set(groupId, value);
      return value;
    }

    const values = new Set<string>();
    (childGroupsByComposite.get(groupId) ?? []).forEach((childId) => {
      resolveAudienceTargets(childId, new Set(seen)).forEach((target) => {
        values.add(target);
      });
    });

    const result = Array.from(values).sort();
    audienceTargetsByGroup.set(groupId, result);
    return result;
  };

  const teacherIdsByRequirement = new Map<string, string[]>();
  requirementTeachers.forEach((row) => {
    const values = teacherIdsByRequirement.get(row.requirement_id) ?? [];
    values.push(row.teacher_id);
    teacherIdsByRequirement.set(row.requirement_id, values);
  });

  const roomIdsByRequirement = new Map<string, string[]>();
  requirementRooms.forEach((row) => {
    const values = roomIdsByRequirement.get(row.requirement_id) ?? [];
    values.push(row.room_id);
    roomIdsByRequirement.set(row.requirement_id, values);
  });

  const boardCards: ManagementBoardCard[] = cards.flatMap((card) => {
    const requirement = requirementById.get(card.requirement_id);
    if (!requirement) return [];

    const group = groupById.get(requirement.instructional_group_id);
    if (!group) return [];

    const domain = domainByCard.get(card.id);
    const placement = placementByCard.get(card.id);
    const teacherIds = teacherIdsByRequirement.get(requirement.id) ?? [];
    const roomIds = roomIdsByRequirement.get(requirement.id) ?? [];

    return [{
      id: card.id,
      requirementId: requirement.id,
      blockIndex: card.block_index,
      durationPeriods: card.duration_periods,
      locked: card.locked,
      subjectId: requirement.subject_id,
      subjectName: subjectById.get(requirement.subject_id) ?? 'Ders',
      groupId: group.id,
      groupName: formatInstructionalGroupName(group.name),
      groupType: group.group_type,
      classCodes: resolveClassCodes(group.id),
      audienceTargets: resolveAudienceTargets(group.id),
      weeklyLoad: requirement.weekly_load,
      teacherMode: requirement.teacher_mode,
      teacherIds,
      teacherNames: teacherIds.map((id) => teacherById.get(id) ?? 'Bilinmeyen öğretmen'),
      resourceMode: requirement.resource_mode,
      roomIds,
      roomNames: roomIds.map((id) => roomById.get(id) ?? 'Bilinmeyen salon'),
      courseCharacter: requirement.course_character,
      deliveryMode: requirement.delivery_mode,
      knowledgeStatus: requirement.knowledge_status,
      domainStatus: domain?.domain_status ?? 'UNRESOLVED',
      validCount: domain?.valid_count ?? 0,
      invalidCount: domain?.invalid_count ?? 0,
      unresolvedCount: domain?.unresolved_count ?? 0,
      isForced: domain?.is_forced ?? false,
      isContradiction: domain?.is_contradiction ?? false,
      placement: placement
        ? {
          dayOfWeek: placement.day_of_week,
          startPeriod: placement.start_period,
          teacherId: placement.teacher_id,
          teacherName: placement.teacher_id
            ? teacherById.get(placement.teacher_id) ?? null
            : null,
          roomId: placement.room_id,
          roomName: placement.room_id
            ? roomById.get(placement.room_id) ?? null
            : null,
          moveTransactionId: placement.move_transaction_id,
        }
        : null,
    }];
  });

  boardCards.sort((a, b) => {
    const classA = a.classCodes[0] ?? 'ZZ';
    const classB = b.classCodes[0] ?? 'ZZ';
    return classA.localeCompare(classB, 'tr', { numeric: true })
      || a.subjectName.localeCompare(b.subjectName, 'tr')
      || a.blockIndex - b.blockIndex;
  });

  const audiencesByClassCode: Record<string, ManagementAudienceScope[]> = {};

  groups.forEach((group) => {
    if (
      !group.class_group_id
      || !['SECTION', 'BALLET', 'MUSIC'].includes(group.group_type)
      || !group.audience_target
    ) {
      return;
    }

    const classGroup = classById.get(group.class_group_id);
    if (!classGroup) return;

    const code = classCode(classGroup);
    const target = group.audience_target as ManagementAudienceScope;
    const values = audiencesByClassCode[code] ?? [];
    if (!values.includes(target)) values.push(target);
    audiencesByClassCode[code] = values;
  });

  Object.values(audiencesByClassCode).forEach((values) => {
    values.sort((a, b) => {
      const order: ManagementAudienceScope[] = ['SECTION', 'BALLET', 'MUSIC'];
      return order.indexOf(a) - order.indexOf(b);
    });
  });

  const classRows = buildManagementClassRows(
    classGroups,
    boardCards,
    audiencesByClassCode,
  );

  const teacherRows: ManagementBoardRow[] = teachers
    .map((row) => ({
      id: row.id,
      label: teacherById.get(row.id) ?? row.name,
      secondary: 'Öğretmen',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));

  const roomRows: ManagementBoardRow[] = rooms
    .map((row) => ({
      id: row.id,
      label: roomById.get(row.id) ?? row.name,
      secondary: 'Salon',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));

  return {
    revisionId: revision.id,
    cards: boardCards,
    classRows,
    teacherRows,
    roomRows,
    teacherNamesById: Object.fromEntries(
      teachers.map((row) => [row.id, teacherById.get(row.id) ?? row.name]),
    ),
    roomNamesById: Object.fromEntries(
      rooms.map((row) => [row.id, roomById.get(row.id) ?? row.name]),
    ),
  };
}

export async function fetchManagementCardCandidates(
  accessToken: string,
  cardId: string,
): Promise<ManagementCandidateDetail> {
  const rows = await authedGet<AssessmentRow[]>(
    `schedule_card_candidate_assessments?select=day_of_week,start_period,teacher_id,room_id,status,is_complete,reason_codes&card_id=eq.${cardId}&order=day_of_week.asc,start_period.asc`,
    accessToken,
  );

  const assessments: ManagementCandidateAssessment[] = rows.map((row) => ({
    dayOfWeek: row.day_of_week,
    startPeriod: row.start_period,
    teacherId: row.teacher_id,
    roomId: row.room_id,
    status: row.status,
    isComplete: row.is_complete,
    reasonCodes: row.reason_codes ?? [],
  }));

  const reasonMap = new Map<string, number>();
  assessments.forEach((assessment) => {
    assessment.reasonCodes.forEach((code) => {
      reasonMap.set(code, (reasonMap.get(code) ?? 0) + 1);
    });
  });

  return {
    assessments,
    reasonCounts: Array.from(reasonMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    validCandidates: assessments.filter((assessment) => assessment.status === 'VALID'),
  };
}

'use client';

export type ManagementPlanStage = 'ORTAOKUL' | 'LISE';
export type ManagementPlanTermStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
export type ManagementRoomStrategy = 'SPECIFIC' | 'CAPABILITY' | 'UNKNOWN';

export interface ManagementCoursePlanRow {
  requirementId: string;
  subjectName: string;
  groupName: string;
  groupType: string;
  classCodes: string[];
  weeklyLoad: number;
  preferredPartition: number[];
  allowedPartitions: number[][];
  minDistinctDays: number | null;
  maxBlocksPerDay: number | null;
  maxConsecutivePeriods: number | null;
  courseCharacter: string;
  deliveryMode: string;
  termStatus: ManagementPlanTermStatus;
  knowledgeStatus: string;
  teacherMode: string;
  teacherIds: string[];
  teacherNames: string[];
  resourceMode: string;
  roomIds: string[];
  roomNames: string[];
  placedBlockCount: number;
  requiredCapability: string | null;
}

export interface ManagementCoursePlanOption {
  id: string;
  name: string;
}

export interface ManagementCoursePlanData {
  requirementSetId: string;
  rows: ManagementCoursePlanRow[];
  teacherOptions: ManagementCoursePlanOption[];
  roomOptions: ManagementCoursePlanOption[];
  roomCapabilityOptions: string[];
}

export interface ManagementRequirementStructurePreviewInput {
  requirementId: string;
  weeklyLoad: number;
  preferredPartition: number[];
  allowedPartitions: number[][];
  termStatus: ManagementPlanTermStatus;
}

export interface ManagementRequirementStructureCardImpact {
  cardId: string;
  currentBlockIndex: number;
  proposedBlockIndex?: number;
  durationPeriods: number;
  placed: boolean;
  dayOfWeek: number | null;
  startPeriod: number | null;
  teacherId: string | null;
  roomId: string | null;
}

export interface ManagementRequirementStructureCreatedBlock {
  proposedBlockIndex: number;
  durationPeriods: number;
}

export interface ManagementRequirementStructureAmbiguity {
  code: string;
  durationPeriods: number;
  currentCount: number;
  proposedCount: number;
  placedCount: number;
  message: string;
}

export interface ManagementRequirementStructureSnapshot {
  weeklyLoad: number;
  preferredPartition: number[];
  allowedPartitions: number[][];
  termStatus: ManagementPlanTermStatus;
  cardCount: number;
  placedBlockCount?: number;
}

export interface ManagementRequirementStructurePreview {
  requirementId: string;
  revisionId: string;
  structureToken: string;
  hasChanges: boolean;
  canApply: boolean;
  blockReasons: string[];
  current: ManagementRequirementStructureSnapshot;
  proposed: ManagementRequirementStructureSnapshot;
  preservedCards: ManagementRequirementStructureCardImpact[];
  removedCards: ManagementRequirementStructureCardImpact[];
  createdBlocks: ManagementRequirementStructureCreatedBlock[];
  ambiguities: ManagementRequirementStructureAmbiguity[];
  candidateRebuildCardCount: number;
  previewOnly: boolean;
}

interface RevisionRow {
  id: string;
  requirement_set_id: string;
}

interface RequirementRow {
  id: string;
  subject_id: string;
  instructional_group_id: string;
  weekly_load: number;
  preferred_partition: unknown;
  allowed_partitions: unknown;
  min_distinct_days: number | null;
  max_blocks_per_day: number | null;
  max_consecutive_periods: number | null;
  course_character: string;
  delivery_mode: string;
  term_status: ManagementPlanTermStatus;
  knowledge_status: string;
  teacher_mode: string;
  resource_mode: string;
  required_capability: string | null;
}

interface GroupRow {
  id: string;
  class_group_id: string | null;
  name: string;
  group_type: string;
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

interface RoomOptionRow {
  id: string;
  name: string;
  canonical_room_id: string | null;
  capabilities: string[] | null;
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

interface CardRow {
  id: string;
  requirement_id: string;
}

interface PlacementRow {
  card_id: string;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
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
    throw new Error(`Ders planı verisi alınamadı (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function translateStructurePreviewError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('editor role required')) {
    return 'Bu işlem için düzenleme yetkisi gerekiyor.';
  }

  if (normalized.includes('not part of an active draft')) {
    return 'Bu ders tanımı artık güncel taslak programın parçası değil. Veriyi yenileyin.';
  }

  if (normalized.includes('preferred partition must sum to weekly load')) {
    return 'Tercih edilen blokların toplamı haftalık ders saatine eşit olmalı.';
  }

  if (normalized.includes('every allowed partition must sum to weekly load')) {
    return 'Her alternatif blok yapısının toplamı haftalık ders saatine eşit olmalı.';
  }

  if (normalized.includes('preferred partition must be included in allowed partitions')) {
    return 'Tercih edilen blok yapısı alternatifler arasında da yer almalı.';
  }

  if (normalized.includes('active requirement requires a preferred partition')) {
    return 'Aktif bir ders için tercih edilen blok yapısını belirtin.';
  }

  if (normalized.includes('active requirement must have positive weekly load')) {
    return 'Aktif bir dersin haftalık ders saati sıfırdan büyük olmalı.';
  }

  if (normalized.includes('preview is stale')) {
    return 'Taslak program önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.';
  }

  if (normalized.includes('structural apply blocked')) {
    return 'Bu değişiklik şu anda uygulanamıyor. Etki önizlemesini kontrol edin.';
  }

  if (normalized.includes('removable card became placed or locked')) {
    return 'Etkilenen bloklardan biri önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.';
  }

  if (normalized.includes('structural history barrier')) {
    return 'Ders yapısı değiştiği için bu eski program işlemi artık geri alınamaz veya yinelenemez.';
  }

  if (normalized.includes('structural revert was invalidated')) {
    return 'Ders yapısı değişikliğinden sonra yeni bir yönetim kararı verildiği için bu değişiklik artık otomatik geri alınamaz.';
  }

  if (normalized.includes('structural revert is stale')) {
    return 'Taslak program ders yapısı değişikliğinden sonra değişti. Otomatik geri alma güvenli olmadığı için işlem durduruldu.';
  }

  if (normalized.includes('created card is placed or locked')) {
    return 'Ders yapısıyla eklenen bloklardan biri artık programda kullanılıyor veya kilitli. Önce bu bloğu serbest bırakın.';
  }

  if (
    normalized.includes('m18.4 room strategy change requires all requirement cards to be unplaced')
  ) {
    return 'Salon seçme yöntemini değiştirmek için önce bu dersin programdaki tüm bloklarını kaldırın.';
  }

  if (normalized.includes('m18.4 specific strategy requires at least one room')) {
    return 'Belirli salon seçeneğinde en az bir salon seçin.';
  }

  if (normalized.includes('m18.4 capability strategy requires a capability')) {
    return 'Salon özelliğine göre seçim için gerekli özelliği seçin.';
  }

  if (normalized.includes('m18.4 specific strategy contains an unknown or alias room')) {
    return 'Yalnız ana salon kayıtları seçilebilir.';
  }

  if (normalized.includes('m18.4 invalid room strategy')) {
    return 'Salon seçme yöntemi geçersiz.';
  }

  if (
    normalized.includes('invalid block duration')
    || normalized.includes('must contain arrays only')
  ) {
    return 'Blok yapılarını pozitif tam sayılarla ve geçerli biçimde yazın.';
  }

  return message.includes('M17.2')
    ? 'Etki önizlemesi oluşturulamadı. Veriyi yenileyip yeniden deneyin.'
    : message;
}

async function authedRpc<T>(
  name: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    let detail = 'Ders yapısı etkisi hesaplanamadı.';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
      };
      detail = body.message ?? body.details ?? detail;
    } catch {
      // Keep the user-facing fallback.
    }

    throw new Error(translateStructurePreviewError(detail));
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

function formatGroupName(name: string) {
  return name
    .replace(/\bSECTION\b/g, 'Tüm Sınıf')
    .replace(/\bBALLET\b/g, 'Bale')
    .replace(/\bMUSIC\b/g, 'Müzik')
    .replace(/\bSHARED\b/g, 'Ortak')
    .replace(/\bPARALLEL\b/g, 'Paralel')
    .replace(/\bSTANDARD\b/g, 'Standart')
    .replace(/\s+\/\s+/g, ' · ')
    .replace(/\s+•\s+/g, ' · ');
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => (
    typeof item === 'number' && Number.isFinite(item)
  ));
}

function numberMatrix(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map(numberArray)
    .filter((item) => item.length > 0);
}

export function coursePlanMatchesStage(
  row: ManagementCoursePlanRow,
  stage: ManagementPlanStage,
) {
  if (row.classCodes.length === 0) return true;

  return row.classCodes.some((code) => {
    const grade = gradeFromClassCode(code);
    if (grade === null) return true;
    return stage === 'ORTAOKUL' ? grade <= 8 : grade >= 9;
  });
}

export async function fetchManagementCoursePlan(
  accessToken: string,
): Promise<ManagementCoursePlanData | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id,requirement_set_id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const [
    requirements,
    groups,
    groupRelations,
    classGroups,
    subjects,
    requirementTeachers,
    teachers,
    requirementRooms,
    rooms,
    cards,
    placements,
    teacherNameOverrides,
    roomNameOverrides,
  ] = await Promise.all([
    authedGet<RequirementRow[]>(
      `course_requirements?select=id,subject_id,instructional_group_id,weekly_load,preferred_partition,allowed_partitions,min_distinct_days,max_blocks_per_day,max_consecutive_periods,course_character,delivery_mode,term_status,knowledge_status,teacher_mode,resource_mode,required_capability&requirement_set_id=eq.${revision.requirement_set_id}`,
      accessToken,
    ),
    authedGet<GroupRow[]>(
      `instructional_groups?select=id,class_group_id,name,group_type&requirement_set_id=eq.${revision.requirement_set_id}`,
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
    authedGet<NamedRow[]>('subjects?select=id,name', accessToken),
    authedGet<RequirementTeacherRow[]>(
      'course_requirement_teachers?select=requirement_id,teacher_id',
      accessToken,
    ),
    authedGet<NamedRow[]>('teachers?select=id,name', accessToken),
    authedGet<RequirementRoomRow[]>(
      'course_requirement_rooms?select=requirement_id,room_id',
      accessToken,
    ),
    authedGet<RoomOptionRow[]>(
      'rooms?select=id,name,canonical_room_id,capabilities',
      accessToken,
    ),
    authedGet<CardRow[]>(
      `schedule_cards?select=id,requirement_id&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<PlacementRow[]>(
      'placements?select=card_id',
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

  const childrenByComposite = new Map<string, string[]>();
  groupRelations
    .filter((row) => row.relation === 'CONTAINS')
    .forEach((row) => {
      const values = childrenByComposite.get(row.left_group_id) ?? [];
      values.push(row.right_group_id);
      childrenByComposite.set(row.left_group_id, values);
    });

  const classCodesByGroup = new Map<string, string[]>();

  const resolveClassCodes = (
    groupId: string,
    seen = new Set<string>(),
  ): string[] => {
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
    (childrenByComposite.get(groupId) ?? []).forEach((childId) => {
      resolveClassCodes(childId, new Set(seen)).forEach((code) => values.add(code));
    });

    const result = Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true }),
    );
    classCodesByGroup.set(groupId, result);
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


  const requirementByCardId = new Map(
    cards.map((card) => [card.id, card.requirement_id]),
  );
  const placedBlocksByRequirement = new Map<string, number>();
  placements.forEach((placement) => {
    const requirementId = requirementByCardId.get(placement.card_id);
    if (!requirementId) return;
    placedBlocksByRequirement.set(
      requirementId,
      (placedBlocksByRequirement.get(requirementId) ?? 0) + 1,
    );
  });

  const rows: ManagementCoursePlanRow[] = requirements.flatMap((requirement) => {
    const group = groupById.get(requirement.instructional_group_id);
    if (!group) return [];

    const teacherIds = teacherIdsByRequirement.get(requirement.id) ?? [];
    const roomIds = roomIdsByRequirement.get(requirement.id) ?? [];

    return [{
      requirementId: requirement.id,
      subjectName: subjectById.get(requirement.subject_id) ?? 'Ders',
      groupName: formatGroupName(group.name),
      groupType: group.group_type,
      classCodes: resolveClassCodes(group.id),
      weeklyLoad: requirement.weekly_load,
      preferredPartition: numberArray(requirement.preferred_partition),
      allowedPartitions: numberMatrix(requirement.allowed_partitions),
      minDistinctDays: requirement.min_distinct_days,
      maxBlocksPerDay: requirement.max_blocks_per_day,
      maxConsecutivePeriods: requirement.max_consecutive_periods,
      courseCharacter: requirement.course_character,
      deliveryMode: requirement.delivery_mode,
      termStatus: requirement.term_status,
      knowledgeStatus: requirement.knowledge_status,
      teacherMode: requirement.teacher_mode,
      teacherIds,
      teacherNames: teacherIds.map((id) => teacherById.get(id) ?? 'Bilinmeyen öğretmen'),
      resourceMode: requirement.resource_mode,
      roomIds,
      roomNames: roomIds.map((id) => roomById.get(id) ?? 'Bilinmeyen salon'),
      placedBlockCount: placedBlocksByRequirement.get(requirement.id) ?? 0,
      requiredCapability: requirement.required_capability,
    }];
  });

  rows.sort((a, b) => (
    (a.classCodes[0] ?? 'ZZ').localeCompare(
      b.classCodes[0] ?? 'ZZ',
      'tr',
      { numeric: true },
    )
    || a.subjectName.localeCompare(b.subjectName, 'tr')
    || a.groupName.localeCompare(b.groupName, 'tr')
  ));

  return {
    requirementSetId: revision.requirement_set_id,
    rows,
    teacherOptions: teachers
      .map((teacher) => ({
        id: teacher.id,
        name: teacherById.get(teacher.id) ?? teacher.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    roomOptions: rooms
      .filter((room) => room.canonical_room_id === null)
      .map((room) => ({
        id: room.id,
        name: roomById.get(room.id) ?? room.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    roomCapabilityOptions: Array.from(
      new Set([
        ...rooms
          .filter((room) => room.canonical_room_id === null)
          .flatMap((room) => room.capabilities ?? []),
        ...requirements
          .map((requirement) => requirement.required_capability)
          .filter((value): value is string => Boolean(value)),
      ]),
    ).sort((a, b) => a.localeCompare(b, 'en')),
  };
}

export function previewManagementRequirementStructure(
  accessToken: string,
  input: ManagementRequirementStructurePreviewInput,
) {
  return authedRpc<ManagementRequirementStructurePreview>(
    'management_preview_requirement_structure_v2',
    accessToken,
    {
      p_requirement_id: input.requirementId,
      p_weekly_load: input.weeklyLoad,
      p_preferred_partition: input.preferredPartition,
      p_allowed_partitions: input.allowedPartitions,
      p_term_status: input.termStatus,
    },
  );
}

export interface ManagementRequirementStructureApplyResult {
  applied: boolean;
  requirementId: string;
  revisionId: string;
  historyBarrierTransactionId: string;
  preservedCardCount: number;
  removedCardCount: number;
  createdCardCount: number;
  resultCardCount: number;
  structureToken: string;
}

export function applyManagementRequirementStructure(
  accessToken: string,
  input: ManagementRequirementStructurePreviewInput,
  expectedStructureToken: string,
) {
  return authedRpc<ManagementRequirementStructureApplyResult>(
    'management_apply_requirement_structure_v2',
    accessToken,
    {
      p_requirement_id: input.requirementId,
      p_weekly_load: input.weeklyLoad,
      p_preferred_partition: input.preferredPartition,
      p_allowed_partitions: input.allowedPartitions,
      p_term_status: input.termStatus,
      p_expected_structure_token: expectedStructureToken,
    },
  );
}

export interface ManagementRequirementRoomStrategyResult {
  applied: boolean;
  requirementId: string;
  revisionId: string;
  strategy: ManagementRoomStrategy;
  resourceMode: string;
  roomCount: number;
  requiredCapability: string | null;
  candidateRebuildCardCount: number;
  publishedChanged: false;
}

export function updateManagementRequirementRoomStrategy(
  accessToken: string,
  requirementId: string,
  strategy: ManagementRoomStrategy,
  roomIds: string[],
  requiredCapability: string | null,
) {
  return authedRpc<ManagementRequirementRoomStrategyResult>(
    'management_update_requirement_room_strategy',
    accessToken,
    {
      p_requirement_id: requirementId,
      p_strategy: strategy,
      p_room_ids: roomIds,
      p_required_capability: requiredCapability,
    },
  );
}

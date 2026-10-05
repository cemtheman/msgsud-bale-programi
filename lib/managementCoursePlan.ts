'use client';

import { getFreshManagementAccessToken } from '@/lib/managementAuth';
import { fetchLatestManagementDraftRevision } from '@/lib/managementRevision';

const MANAGEMENT_ROOM_CAPABILITY_IDS = [
  'GENERAL_CLASSROOM_SMALL_GROUP',
  'GENERAL_CLASSROOM_LARGE_GROUP',
  'STUDIO_SMALL_GROUP',
  'STUDIO_LARGE_GROUP',
  'INSTRUMENT_RELATED_CLASSROOM',
] as const;

export type ManagementPlanStage = 'ORTAOKUL' | 'LISE';
export type ManagementPlanTermStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
export type ManagementRoomStrategy = 'SPECIFIC' | 'CAPABILITY' | 'UNKNOWN';
export type ManagementTeacherAssignmentScope =
  | 'REQUIREMENT'
  | 'BLOCK'
  | 'UNSPECIFIED';
export type ManagementTeacherContinuity =
  | 'REQUIRED'
  | 'PREFERRED'
  | 'NONE';
export type ManagementTeacherRequirement =
  | 'REQUIRED'
  | 'OPTIONAL'
  | 'NONE'
  | 'UNSPECIFIED';

export interface ManagementCoursePlanRow {
  requirementId: string;
  subjectId: string;
  subjectName: string;
  groupId: string;
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
  teacherRequirement: ManagementTeacherRequirement;
  teacherAssignmentScope: ManagementTeacherAssignmentScope;
  teacherContinuity: ManagementTeacherContinuity;
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

export interface ManagementTeacherContinuityViolation {
  requirementId: string;
  subjectName: string;
  groupName: string;
  distinctResolvedTeachers: number;
  placedBlocks: number;
}

export interface ManagementCoursePlanData {
  requirementSetId: string;
  revisionId: string;
  rows: ManagementCoursePlanRow[];
  teacherOptions: ManagementCoursePlanOption[];
  roomOptions: ManagementCoursePlanOption[];
  roomCapabilityOptions: string[];
  teacherContinuityViolations: ManagementTeacherContinuityViolation[];
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
  teacher_requirement: ManagementTeacherRequirement;
  teacher_assignment_scope: ManagementTeacherAssignmentScope;
  teacher_continuity: ManagementTeacherContinuity;
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

interface TeacherOptionRow {
  id: string;
  name: string;
  operational_status: 'ACTIVE' | 'INACTIVE';
  archived_at: string | null;
}

interface RoomOptionRow {
  id: string;
  name: string;
  canonical_room_id: string | null;
  capabilities: string[] | null;
  operational_status: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  archived_at: string | null;
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

interface TeacherPolicyAuditResult {
  requiredContinuityViolations?: ManagementTeacherContinuityViolation[];
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
      Authorization: `Bearer ${await getFreshManagementAccessToken(accessToken)}`,
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

  if (normalized.includes('teacher policy preview is stale')) {
    return 'Öğretmen kuralı önizlemeden sonra güncelliğini kaybetti. Etkiyi yeniden hesaplayın.';
  }

  if (normalized.includes('teacher policy apply blocked')) {
    return 'Bu öğretmen kuralı mevcut yerleşimlerle çelişiyor. Önizlemedeki blokları kontrol edin.';
  }

  if (normalized.includes('reconciliation preview is stale')) {
    return 'Öğretmen uzlaştırma önizlemesi güncelliğini kaybetti. Etkiyi yeniden hesaplayın.';
  }

  if (normalized.includes('reconciliation apply blocked')) {
    return 'Bu öğretmenle mevcut blokları aynı saat ve salonlarda uzlaştırmak mümkün değil.';
  }

  if (normalized.includes('reconciliation became unsafe before apply')) {
    return 'Program önizlemeden sonra değişti. Öğretmen uzlaştırmasını yeniden kontrol edin.';
  }

  if (normalized.includes('coordinated preview is stale')) {
    return 'Koordineli öğretmen planı önizlemeden sonra güncelliğini kaybetti. Etkiyi yeniden hesaplayın.';
  }

  if (normalized.includes('coordinated reconciliation apply blocked')) {
    return 'Bu öğretmen dağılımı mevcut programda güvenli biçimde uygulanamıyor.';
  }

  if (normalized.includes('coordinated redo is no longer safe')) {
    return 'Bu koordineli öğretmen değişikliği artık aynı koşullarda yeniden uygulanamıyor.';
  }

  if (normalized.includes('teacher not eligible')) {
    return 'Seçilen öğretmen bu dersin uygun öğretmen havuzunda değil.';
  }

  if (normalized.includes('invalid teacher policy combination')) {
    return 'Öğretmen kuralı kombinasyonu geçersiz.';
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
      Authorization: `Bearer ${await getFreshManagementAccessToken(accessToken)}`,
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
  onStage?: (stage:
    | 'STRUCTURE'
    | 'TEACHERS'
    | 'ROOMS'
    | 'PLACEMENTS'
    | 'CHECKS'
  ) => void,
): Promise<ManagementCoursePlanData | null> {
  const revision = await fetchLatestManagementDraftRevision(accessToken);
  if (!revision) return null;

  // Keep request concurrency bounded. The previous implementation launched
  // fourteen REST/RPC calls at once, which could amplify transient Supabase
  // edge 522 failures into a complete Course Plan load failure.
  onStage?.('STRUCTURE');
  const [requirements, groups, groupRelations] = await Promise.all([
    authedGet<RequirementRow[]>(
      `course_requirements?select=id,subject_id,instructional_group_id,weekly_load,preferred_partition,allowed_partitions,min_distinct_days,max_blocks_per_day,max_consecutive_periods,course_character,delivery_mode,term_status,knowledge_status,teacher_mode,teacher_requirement,teacher_assignment_scope,teacher_continuity,resource_mode,required_capability&requirement_set_id=eq.${revision.requirement_set_id}`,
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
  ]);

  const [classGroups, subjects] = await Promise.all([
    authedGet<ClassGroupRow[]>(
      'class_groups?select=id,grade,section&academic_year=eq.2026-2027&order=grade.asc,section.asc',
      accessToken,
    ),
    authedGet<NamedRow[]>('subjects?select=id,name', accessToken),
  ]);

  onStage?.('TEACHERS');
  const [requirementTeachers, teachers, teacherNameOverrides] = await Promise.all([
    authedGet<RequirementTeacherRow[]>(
      'course_requirement_teachers?select=requirement_id,teacher_id',
      accessToken,
    ),
    authedGet<TeacherOptionRow[]>(
      'teachers?select=id,name,operational_status,archived_at',
      accessToken,
    ),
    authedGet<TeacherNameOverrideRow[]>(
      `management_teacher_name_overrides?select=teacher_id,display_name&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
  ]);

  onStage?.('ROOMS');
  const [requirementRooms, rooms, roomNameOverrides] = await Promise.all([
    authedGet<RequirementRoomRow[]>(
      'course_requirement_rooms?select=requirement_id,room_id',
      accessToken,
    ),
    authedGet<RoomOptionRow[]>(
      'rooms?select=id,name,canonical_room_id,capabilities,operational_status,archived_at',
      accessToken,
    ),
    authedGet<RoomNameOverrideRow[]>(
      `management_room_name_overrides?select=room_id,display_name&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
  ]);

  onStage?.('PLACEMENTS');
  const [cards, placements] = await Promise.all([
    authedGet<CardRow[]>(
      `schedule_cards?select=id,requirement_id&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<PlacementRow[]>(
      'placements?select=card_id',
      accessToken,
    ),
  ]);

  onStage?.('CHECKS');
  const teacherPolicyAudit = await authedRpc<TeacherPolicyAuditResult>(
    'management_diagnose_teacher_assignment_policy',
    accessToken,
    { p_schedule_revision_id: revision.id },
  );

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
      subjectId: requirement.subject_id,
      subjectName: subjectById.get(requirement.subject_id) ?? 'Ders',
      groupId: group.id,
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
      teacherRequirement: requirement.teacher_requirement,
      teacherAssignmentScope: requirement.teacher_assignment_scope,
      teacherContinuity: requirement.teacher_continuity,
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
    revisionId: revision.id,
    rows,
    teacherOptions: teachers
      .filter((teacher) => (
        teacher.operational_status === 'ACTIVE'
        && !teacher.archived_at
      ))
      .map((teacher) => ({
        id: teacher.id,
        name: teacherById.get(teacher.id) ?? teacher.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    roomOptions: rooms
      .filter((room) => (
        room.canonical_room_id === null
        && room.operational_status === 'ACTIVE'
        && !room.archived_at
      ))
      .map((room) => ({
        id: room.id,
        name: roomById.get(room.id) ?? room.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    roomCapabilityOptions: [...MANAGEMENT_ROOM_CAPABILITY_IDS],
    teacherContinuityViolations:
      teacherPolicyAudit.requiredContinuityViolations ?? [],
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


export interface ManagementTeacherPolicyPlacedBlock {
  cardId: string;
  blockIndex: number;
  durationPeriods: number;
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
}

export interface ManagementTeacherPolicyPreview {
  requirementId: string;
  revisionId: string;
  subjectName: string;
  groupName: string;
  currentScope: ManagementTeacherAssignmentScope;
  currentContinuity: ManagementTeacherContinuity;
  proposedScope: ManagementTeacherAssignmentScope;
  proposedContinuity: ManagementTeacherContinuity;
  placedBlockCount: number;
  distinctResolvedTeacherCount: number;
  placedBlocks: ManagementTeacherPolicyPlacedBlock[];
  canApply: boolean;
  blockReasons: string[];
  stateToken: string;
  candidateEnforcementActive: false;
  previewOnly: true;
}

export interface ManagementTeacherPolicyApplyResult {
  applied: true;
  requirementId: string;
  teacherAssignmentScope: ManagementTeacherAssignmentScope;
  teacherContinuity: ManagementTeacherContinuity;
  placedBlockCount: number;
  distinctResolvedTeacherCount: number;
  candidateEnforcementActive: false;
  publishedChanged: false;
}

export function previewManagementRequirementTeacherPolicy(
  accessToken: string,
  requirementId: string,
  teacherAssignmentScope: ManagementTeacherAssignmentScope,
  teacherContinuity: ManagementTeacherContinuity,
) {
  return authedRpc<ManagementTeacherPolicyPreview>(
    'management_preview_requirement_teacher_policy',
    accessToken,
    {
      p_requirement_id: requirementId,
      p_teacher_assignment_scope: teacherAssignmentScope,
      p_teacher_continuity: teacherContinuity,
    },
  );
}

export function applyManagementRequirementTeacherPolicy(
  accessToken: string,
  requirementId: string,
  teacherAssignmentScope: ManagementTeacherAssignmentScope,
  teacherContinuity: ManagementTeacherContinuity,
  expectedStateToken: string,
) {
  return authedRpc<ManagementTeacherPolicyApplyResult>(
    'management_apply_requirement_teacher_policy',
    accessToken,
    {
      p_requirement_id: requirementId,
      p_teacher_assignment_scope: teacherAssignmentScope,
      p_teacher_continuity: teacherContinuity,
      p_expected_state_token: expectedStateToken,
    },
  );
}


export interface ManagementTeacherReconciliationPlacement {
  cardId: string;
  blockIndex: number;
  durationPeriods: number;
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  roomName: string | null;
  willChange: boolean;
}

export interface ManagementTeacherReconciliationConflict {
  cardId: string;
  blockingCardId: string;
  subjectName: string;
  groupName: string;
  dayOfWeek: number;
  startPeriod: number;
  conflictType: string;
}

export interface ManagementTeacherReconciliationPreview {
  requirementId: string;
  revisionId: string;
  subjectName: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  placedBlockCount: number;
  unplacedBlockCount: number;
  changedBlockCount: number;
  currentDistinctTeacherCount: number;
  placements: ManagementTeacherReconciliationPlacement[];
  canApply: boolean;
  blockReasons: string[];
  conflicts: ManagementTeacherReconciliationConflict[];
  stateToken: string;
  preservesTime: true;
  preservesRoom: true;
  changesTeacherPool: false;
  previewOnly: true;
}

export interface ManagementTeacherReconciliationApplyResult {
  applied: true;
  requirementId: string;
  revisionId: string;
  teacherId: string;
  teacherName: string;
  changedBlockCount: number;
  transactionId: string;
  preservedTime: true;
  preservedRoom: true;
  changedTeacherPool: false;
  publishedChanged: false;
}

export function previewManagementRequirementTeacherReconciliation(
  accessToken: string,
  requirementId: string,
  teacherId: string,
) {
  return authedRpc<ManagementTeacherReconciliationPreview>(
    'management_preview_requirement_teacher_reconciliation',
    accessToken,
    {
      p_requirement_id: requirementId,
      p_teacher_id: teacherId,
    },
  );
}

export function applyManagementRequirementTeacherReconciliation(
  accessToken: string,
  requirementId: string,
  teacherId: string,
  expectedStateToken: string,
) {
  return authedRpc<ManagementTeacherReconciliationApplyResult>(
    'management_apply_requirement_teacher_reconciliation',
    accessToken,
    {
      p_requirement_id: requirementId,
      p_teacher_id: teacherId,
      p_expected_state_token: expectedStateToken,
    },
  );
}


export interface ManagementCoordinatedTeacherAssignmentInput {
  requirementId: string;
  teacherId: string;
}

export interface ManagementCoordinatedTeacherAssignmentSummary {
  requirementId: string;
  subjectName: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  placedBlockCount: number;
  unplacedBlockCount: number;
  changedBlockCount: number;
  currentDistinctTeacherCount: number;
}

export interface ManagementCoordinatedTeacherConflict {
  teacherId: string;
  dayOfWeek: number;
  leftCardId: string;
  leftRequirementId: string;
  leftSubjectName: string;
  leftGroupName: string;
  leftStartPeriod: number;
  leftDurationPeriods: number;
  rightCardId: string;
  rightRequirementId: string;
  rightSubjectName: string;
  rightGroupName: string;
  rightStartPeriod: number;
  rightDurationPeriods: number;
  conflictType: 'TEACHER_CONFLICT';
}

export interface ManagementCoordinatedTeacherPreview {
  revisionId: string;
  assignmentCount: number;
  assignments: ManagementCoordinatedTeacherAssignmentSummary[];
  placedBlockCount: number;
  unplacedBlockCount: number;
  changedBlockCount: number;
  canApply: boolean;
  blockReasons: string[];
  conflicts: ManagementCoordinatedTeacherConflict[];
  stateToken: string;
  preservesTime: true;
  preservesRoom: true;
  changesTeacherPools: false;
  evaluationMode: 'FINAL_COORDINATED_STATE';
  previewOnly: true;
}

export interface ManagementCoordinatedTeacherApplyResult {
  applied: true;
  revisionId: string;
  assignmentCount: number;
  changedBlockCount: number;
  bundleId: string;
  transactionId: string;
  assignments: ManagementCoordinatedTeacherAssignmentSummary[];
  preservedTime: true;
  preservedRoom: true;
  changedTeacherPools: false;
  publishedChanged: false;
}

function coordinatedTeacherPayload(
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
) {
  return assignments.map((assignment) => ({
    requirementId: assignment.requirementId,
    teacherId: assignment.teacherId,
  }));
}

export function previewManagementCoordinatedTeacherReconciliation(
  accessToken: string,
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
) {
  return authedRpc<ManagementCoordinatedTeacherPreview>(
    'management_preview_coordinated_teacher_reconciliation',
    accessToken,
    {
      p_assignments: coordinatedTeacherPayload(assignments),
    },
  );
}

export function applyManagementCoordinatedTeacherReconciliation(
  accessToken: string,
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
  expectedStateToken: string,
) {
  return authedRpc<ManagementCoordinatedTeacherApplyResult>(
    'management_apply_coordinated_teacher_reconciliation',
    accessToken,
    {
      p_assignments: coordinatedTeacherPayload(assignments),
      p_expected_state_token: expectedStateToken,
    },
  );
}

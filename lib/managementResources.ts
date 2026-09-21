'use client';

import {
  MANAGEMENT_ROOM_CAPABILITIES,
  isManagementRoomCapability,
} from '@/lib/managementRoomCapabilities';

export type ManagementResourceKnowledgeStatus =
  | 'CONFIRMED'
  | 'OBSERVED'
  | 'UNKNOWN';

export interface ManagementTeacherResourceRow {
  id: string;
  name: string;
  baseName: string;
  nameOverridden: boolean;
  activeRequirementCount: number;
  placedBlockCount: number;
}

export interface ManagementRoomResourceRow {
  id: string;
  name: string;
  baseName: string;
  nameOverridden: boolean;
  canonicalRoomId: string | null;
  canonicalRoomName: string | null;
  aliasCount: number;
  knowledgeStatus: ManagementResourceKnowledgeStatus;
  capabilities: string[];
  activeRequirementCount: number;
  placedBlockCount: number;
}

export interface ManagementResourceInventoryData {
  revisionId: string;
  teachers: ManagementTeacherResourceRow[];
  rooms: ManagementRoomResourceRow[];
  availableCapabilities: string[];
}

interface RevisionRow {
  id: string;
  requirement_set_id: string;
}

interface TeacherRow {
  id: string;
  name: string;
}

interface RoomRow {
  id: string;
  name: string;
  canonical_room_id: string | null;
  knowledge_status: ManagementResourceKnowledgeStatus | null;
  capabilities: string[] | null;
}

interface RequirementRow {
  id: string;
  term_status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  required_capability: string | null;
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
  teacher_id: string | null;
  room_id: string | null;
}

interface TeacherNameOverrideRow {
  teacher_id: string;
  display_name: string;
}

interface RoomNameOverrideRow {
  room_id: string;
  display_name: string;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

async function authedGet<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = 'Kaynak envanteri alınamadı.';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
      };
      message = body.message ?? body.details ?? message;
    } catch {
      // Keep the user-facing fallback.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function authedRpc<T>(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Kaynak adı güncellenemedi.';

    try {
      const errorBody = await response.json() as {
        message?: string;
        details?: string;
      };
      message = errorBody.message ?? errorBody.details ?? message;
    } catch {
      // Keep the user-facing fallback.
    }

    const normalized = message.toLocaleLowerCase('tr-TR');

    if (normalized.includes('editor role required')) {
      throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
    }

    if (normalized.includes('cannot be empty')) {
      throw new Error('Kaynak adı boş bırakılamaz.');
    }

    if (normalized.includes('too long')) {
      throw new Error('Kaynak adı çok uzun.');
    }

    if (normalized.includes('requires draft revision')) {
      throw new Error('Kaynak adı yalnız taslak programda düzenlenebilir.');
    }

    if (normalized.includes('room alias names are not edited')) {
      throw new Error('Takma ad kayıtları Kaynaklar ekranından düzenlenmez.');
    }

    if (normalized.includes('room profile preview is stale')) {
      throw new Error('Salon bilgileri veya taslak program önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.');
    }

    if (normalized.includes('room profile apply blocked')) {
      throw new Error('Bu salon değişikliği mevcut bir program yerleşimini geçersiz kılacağı için uygulanamıyor.');
    }

    if (normalized.includes('invalid room knowledge status')) {
      throw new Error('Salon bilgi durumu geçersiz.');
    }

    if (normalized.includes('invalid room capability')) {
      throw new Error('Salon özelliklerinden biri geçersiz.');
    }

    if (normalized.includes('room aliases are not editable')) {
      throw new Error('Takma ad kayıtlarının salon özellikleri düzenlenmez.');
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function fetchManagementResources(
  accessToken: string,
): Promise<ManagementResourceInventoryData | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id,requirement_set_id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const [
    teachers,
    rooms,
    requirements,
    requirementTeachers,
    requirementRooms,
    cards,
    placements,
    teacherNameOverrides,
    roomNameOverrides,
  ] = await Promise.all([
    authedGet<TeacherRow[]>(
      'teachers?select=id,name&order=name.asc',
      accessToken,
    ),
    authedGet<RoomRow[]>(
      'rooms?select=id,name,canonical_room_id,knowledge_status,capabilities&order=name.asc',
      accessToken,
    ),
    authedGet<RequirementRow[]>(
      `course_requirements?select=id,term_status,required_capability&requirement_set_id=eq.${revision.requirement_set_id}`,
      accessToken,
    ),
    authedGet<RequirementTeacherRow[]>(
      'course_requirement_teachers?select=requirement_id,teacher_id',
      accessToken,
    ),
    authedGet<RequirementRoomRow[]>(
      'course_requirement_rooms?select=requirement_id,room_id',
      accessToken,
    ),
    authedGet<CardRow[]>(
      `schedule_cards?select=id,requirement_id&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<PlacementRow[]>(
      'placements?select=card_id,teacher_id,room_id',
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

  const activeRequirementIds = new Set(
    requirements
      .filter((row) => row.term_status === 'ACTIVE')
      .map((row) => row.id),
  );

  const activeTeacherRequirements = new Map<string, Set<string>>();
  requirementTeachers.forEach((assignment) => {
    if (!activeRequirementIds.has(assignment.requirement_id)) return;
    const ids = activeTeacherRequirements.get(assignment.teacher_id)
      ?? new Set<string>();
    ids.add(assignment.requirement_id);
    activeTeacherRequirements.set(assignment.teacher_id, ids);
  });

  const activeRoomRequirements = new Map<string, Set<string>>();
  requirementRooms.forEach((assignment) => {
    if (!activeRequirementIds.has(assignment.requirement_id)) return;
    const ids = activeRoomRequirements.get(assignment.room_id)
      ?? new Set<string>();
    ids.add(assignment.requirement_id);
    activeRoomRequirements.set(assignment.room_id, ids);
  });

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const teacherPlacedCounts = new Map<string, number>();
  const roomPlacedCounts = new Map<string, number>();

  placements.forEach((placement) => {
    const card = cardById.get(placement.card_id);
    if (!card || !activeRequirementIds.has(card.requirement_id)) return;

    if (placement.teacher_id) {
      teacherPlacedCounts.set(
        placement.teacher_id,
        (teacherPlacedCounts.get(placement.teacher_id) ?? 0) + 1,
      );
    }

    if (placement.room_id) {
      roomPlacedCounts.set(
        placement.room_id,
        (roomPlacedCounts.get(placement.room_id) ?? 0) + 1,
      );
    }
  });

  const teacherOverrideById = new Map(
    teacherNameOverrides.map((row) => [row.teacher_id, row.display_name]),
  );
  const roomOverrideById = new Map(
    roomNameOverrides.map((row) => [row.room_id, row.display_name]),
  );

  const resolvedRoomNameById = new Map(
    rooms.map((room) => [
      room.id,
      roomOverrideById.get(room.id) ?? room.name,
    ]),
  );
  const aliasCountByCanonical = new Map<string, number>();

  rooms.forEach((room) => {
    if (!room.canonical_room_id) return;
    aliasCountByCanonical.set(
      room.canonical_room_id,
      (aliasCountByCanonical.get(room.canonical_room_id) ?? 0) + 1,
    );
  });

  const availableCapabilities = MANAGEMENT_ROOM_CAPABILITIES.map(
    (capability) => capability.id,
  );

  return {
    revisionId: revision.id,
    availableCapabilities,
    teachers: teachers.map((teacher) => {
      const overrideName = teacherOverrideById.get(teacher.id);

      return {
      id: teacher.id,
      name: overrideName ?? teacher.name,
      baseName: teacher.name,
      nameOverridden: Boolean(overrideName),
      activeRequirementCount:
        activeTeacherRequirements.get(teacher.id)?.size ?? 0,
      placedBlockCount:
        teacherPlacedCounts.get(teacher.id) ?? 0,
      };
    }),
    rooms: rooms.map((room) => {
      const overrideName = roomOverrideById.get(room.id);

      return {
      id: room.id,
      name: overrideName ?? room.name,
      baseName: room.name,
      nameOverridden: Boolean(overrideName),
      canonicalRoomId: room.canonical_room_id,
      canonicalRoomName: room.canonical_room_id
        ? resolvedRoomNameById.get(room.canonical_room_id) ?? null
        : null,
      aliasCount: aliasCountByCanonical.get(room.id) ?? 0,
      knowledgeStatus: room.knowledge_status ?? 'UNKNOWN',
      capabilities: Array.isArray(room.capabilities)
        ? room.capabilities.filter(isManagementRoomCapability)
        : [],
      activeRequirementCount:
        activeRoomRequirements.get(room.id)?.size ?? 0,
      placedBlockCount:
        roomPlacedCounts.get(room.id) ?? 0,
      };
    }),
  };
}

export interface ManagementResourceNameUpdateResult {
  resourceType: 'TEACHER' | 'ROOM';
  resourceId: string;
  baseName: string;
  displayName: string;
  overridden: boolean;
  publishedChanged: false;
}

export function updateManagementTeacherDisplayName(
  accessToken: string,
  revisionId: string,
  teacherId: string,
  displayName: string,
) {
  return authedRpc<ManagementResourceNameUpdateResult>(
    'management_set_teacher_display_name',
    accessToken,
    {
      p_schedule_revision_id: revisionId,
      p_teacher_id: teacherId,
      p_display_name: displayName,
    },
  );
}

export function updateManagementRoomDisplayName(
  accessToken: string,
  revisionId: string,
  roomId: string,
  displayName: string,
) {
  return authedRpc<ManagementResourceNameUpdateResult>(
    'management_set_room_display_name',
    accessToken,
    {
      p_schedule_revision_id: revisionId,
      p_room_id: roomId,
      p_display_name: displayName,
    },
  );
}

export interface ManagementRoomProfileRequirementImpact {
  requirementId: string;
  subjectName: string;
  groupName: string;
  requiredCapability: string;
  cardCount: number;
  placedInRoomCount: number;
}

export interface ManagementRoomProfilePlacedImpact {
  cardId: string;
  requirementId: string;
  subjectName: string;
  groupName: string;
  requiredCapability: string;
  dayOfWeek: number;
  startPeriod: number;
}

export interface ManagementRoomProfilePreview {
  roomId: string;
  revisionId: string;
  roomName: string;
  hasChanges: boolean;
  canApply: boolean;
  blockReasons: string[];
  current: {
    capabilities: string[];
    knowledgeStatus: ManagementResourceKnowledgeStatus;
  };
  proposed: {
    capabilities: string[];
    knowledgeStatus: ManagementResourceKnowledgeStatus;
  };
  addedCapabilities: string[];
  removedCapabilities: string[];
  confirmationChanged: boolean;
  affectedCapabilities: string[];
  affectedRequirements: ManagementRoomProfileRequirementImpact[];
  affectedRequirementCount: number;
  affectedCardIds: string[];
  candidateRebuildCardCount: number;
  placedImpacts: ManagementRoomProfilePlacedImpact[];
  placedImpactCount: number;
  stateToken: string;
}

export interface ManagementRoomProfileApplyResult {
  applied: boolean;
  roomId: string;
  revisionId: string;
  candidateRebuildCardCount: number;
  affectedRequirementCount: number;
  publishedChanged: false;
}

export function previewManagementRoomProfile(
  accessToken: string,
  revisionId: string,
  roomId: string,
  capabilities: string[],
  knowledgeStatus: ManagementResourceKnowledgeStatus,
) {
  return authedRpc<ManagementRoomProfilePreview>(
    'management_preview_room_profile',
    accessToken,
    {
      p_schedule_revision_id: revisionId,
      p_room_id: roomId,
      p_capabilities: capabilities,
      p_knowledge_status: knowledgeStatus,
    },
  );
}

export function applyManagementRoomProfile(
  accessToken: string,
  revisionId: string,
  roomId: string,
  capabilities: string[],
  knowledgeStatus: ManagementResourceKnowledgeStatus,
  expectedStateToken: string,
) {
  return authedRpc<ManagementRoomProfileApplyResult>(
    'management_apply_room_profile',
    accessToken,
    {
      p_schedule_revision_id: revisionId,
      p_room_id: roomId,
      p_capabilities: capabilities,
      p_knowledge_status: knowledgeStatus,
      p_expected_state_token: expectedStateToken,
    },
  );
}

'use client';

export type ManagementResourceKnowledgeStatus =
  | 'CONFIRMED'
  | 'OBSERVED'
  | 'UNKNOWN';

export interface ManagementTeacherResourceRow {
  id: string;
  name: string;
  activeRequirementCount: number;
  placedBlockCount: number;
}

export interface ManagementRoomResourceRow {
  id: string;
  name: string;
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
      `course_requirements?select=id,term_status&requirement_set_id=eq.${revision.requirement_set_id}`,
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

  const roomNameById = new Map(
    rooms.map((room) => [room.id, room.name]),
  );
  const aliasCountByCanonical = new Map<string, number>();

  rooms.forEach((room) => {
    if (!room.canonical_room_id) return;
    aliasCountByCanonical.set(
      room.canonical_room_id,
      (aliasCountByCanonical.get(room.canonical_room_id) ?? 0) + 1,
    );
  });

  return {
    revisionId: revision.id,
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      activeRequirementCount:
        activeTeacherRequirements.get(teacher.id)?.size ?? 0,
      placedBlockCount:
        teacherPlacedCounts.get(teacher.id) ?? 0,
    })),
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      canonicalRoomId: room.canonical_room_id,
      canonicalRoomName: room.canonical_room_id
        ? roomNameById.get(room.canonical_room_id) ?? null
        : null,
      aliasCount: aliasCountByCanonical.get(room.id) ?? 0,
      knowledgeStatus: room.knowledge_status ?? 'UNKNOWN',
      capabilities: Array.isArray(room.capabilities)
        ? room.capabilities
        : [],
      activeRequirementCount:
        activeRoomRequirements.get(room.id)?.size ?? 0,
      placedBlockCount:
        roomPlacedCounts.get(room.id) ?? 0,
    })),
  };
}

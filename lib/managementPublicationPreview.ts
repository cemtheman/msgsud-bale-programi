'use client';

import { schoolConfig } from '@/data/scheduleData';
import type { ManagementStage } from '@/lib/managementBoard';

const ACADEMIC_YEAR = '2026-2027';

export interface ManagementPublicationRequirementChange {
  requirementId: string;
  subjectName: string;
  groupName: string;
  classCodes: string[];
  publishedUnits: number;
  draftUnits: number;
  unchangedUnits: number;
  changedUnits: number;
  addedUnits: number;
  removedUnits: number;
}

export interface ManagementPublicationStagePreview {
  stage: ManagementStage;
  publishedUnits: number;
  draftUnits: number;
  unchangedUnits: number;
  changedUnits: number;
  addedUnits: number;
  removedUnits: number;
  affectedRequirementCount: number;
  changes: ManagementPublicationRequirementChange[];
}

export interface ManagementPublicationPreviewData {
  revisionId: string;
  academicYear: string;
  mappingSource: 'BOOTSTRAP_EVIDENCE' | 'MANAGED_PUBLICATION';
  publicationNumber: number | null;
  publicSessionCount: number;
  evidenceSessionCount: number;
  mappedCurrentPublicSessionCount: number;
  missingEvidenceSessionCount: number;
  unmappedCurrentPublicSessionCount: number;
  mappingHealthy: boolean;
  stages: Record<ManagementStage, ManagementPublicationStagePreview>;
}

interface RevisionRow {
  id: string;
  requirement_set_id: string;
}

interface RequirementRow {
  id: string;
  subject_id: string;
  instructional_group_id: string;
}

interface GroupRow {
  id: string;
  class_group_id: string | null;
  name: string;
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

interface EvidenceRow {
  requirement_id: string;
  source_session_id: string;
}

interface PublicationRow {
  id: string;
  publication_number: number;
}

interface PublicationSessionRow {
  requirement_id: string;
  session_id: string;
}

interface RequirementLineageRow {
  child_requirement_id: string;
  parent_requirement_id: string;
}

interface PublicSessionRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  teacher_id: string | null;
  room_id: string | null;
}

interface CardRow {
  id: string;
  requirement_id: string;
  duration_periods: number;
  publication_end_time_override: string | null;
}

interface PlacementRow {
  card_id: string;
  day_of_week: number;
  start_period: number;
  teacher_id: string | null;
  room_id: string | null;
}

interface RoomRow {
  id: string;
  canonical_room_id: string | null;
}

interface Unit {
  requirementId: string;
  signature: string;
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
    let message = 'Yayın karşılaştırması hazırlanamadı.';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
      };
      message = body.message ?? body.details ?? message;
    } catch {
      // Keep fallback.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function classCode(row: ClassGroupRow) {
  return `${row.grade}${row.section}`;
}

function stageMatches(
  classCodes: string[],
  stage: ManagementStage,
) {
  if (classCodes.length === 0) return true;

  return classCodes.some((code) => {
    const match = code.match(/^(\d{1,2})/);
    if (!match) return true;
    const grade = Number(match[1]);
    return stage === 'ORTAOKUL' ? grade <= 8 : grade >= 9;
  });
}

function unitSignature(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  teacherId: string | null,
  roomId: string | null,
) {
  return [
    dayOfWeek,
    startTime,
    endTime,
    teacherId ?? '∅',
    roomId ?? '∅',
  ].join('|');
}

function countSignatures(units: Unit[]) {
  const result = new Map<string, number>();

  units.forEach((unit) => {
    const key = `${unit.requirementId}::${unit.signature}`;
    result.set(key, (result.get(key) ?? 0) + 1);
  });

  return result;
}

function requirementComparison(
  requirementId: string,
  publishedUnits: Unit[],
  draftUnits: Unit[],
) {
  const published = countSignatures(
    publishedUnits.filter((unit) => unit.requirementId === requirementId),
  );
  const draft = countSignatures(
    draftUnits.filter((unit) => unit.requirementId === requirementId),
  );

  const keys = new Set([...published.keys(), ...draft.keys()]);
  let unchangedUnits = 0;

  keys.forEach((key) => {
    unchangedUnits += Math.min(
      published.get(key) ?? 0,
      draft.get(key) ?? 0,
    );
  });

  const publishedCount = Array.from(published.values())
    .reduce((sum, value) => sum + value, 0);
  const draftCount = Array.from(draft.values())
    .reduce((sum, value) => sum + value, 0);

  const publishedUnmatched = publishedCount - unchangedUnits;
  const draftUnmatched = draftCount - unchangedUnits;
  const changedUnits = Math.min(
    publishedUnmatched,
    draftUnmatched,
  );

  return {
    publishedUnits: publishedCount,
    draftUnits: draftCount,
    unchangedUnits,
    changedUnits,
    addedUnits: draftUnmatched - changedUnits,
    removedUnits: publishedUnmatched - changedUnits,
  };
}

export async function fetchManagementPublicationPreview(
  accessToken: string,
): Promise<ManagementPublicationPreviewData | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id,requirement_set_id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const publications = await authedGet<PublicationRow[]>(
    `management_publications?select=id,publication_number&academic_year=eq.${ACADEMIC_YEAR}&order=publication_number.desc&limit=1`,
    accessToken,
  );
  const latestPublication = publications[0] ?? null;

  const [
    requirements,
    groups,
    groupRelations,
    classGroups,
    subjects,
    evidence,
    publicSessions,
    cards,
    placements,
    rooms,
    publicationSessions,
    requirementLineage,
  ] = await Promise.all([
    authedGet<RequirementRow[]>(
      `course_requirements?select=id,subject_id,instructional_group_id&requirement_set_id=eq.${revision.requirement_set_id}`,
      accessToken,
    ),
    authedGet<GroupRow[]>(
      `instructional_groups?select=id,class_group_id,name&requirement_set_id=eq.${revision.requirement_set_id}`,
      accessToken,
    ),
    authedGet<GroupRelationRow[]>(
      'instructional_group_relations?select=left_group_id,right_group_id,relation',
      accessToken,
    ),
    authedGet<ClassGroupRow[]>(
      `class_groups?select=id,grade,section&academic_year=eq.${ACADEMIC_YEAR}`,
      accessToken,
    ),
    authedGet<NamedRow[]>(
      'subjects?select=id,name',
      accessToken,
    ),
    authedGet<EvidenceRow[]>(
      'course_requirement_source_sessions?select=requirement_id,source_session_id',
      accessToken,
    ),
    authedGet<PublicSessionRow[]>(
      `schedule_sessions?select=id,day_of_week,start_time,end_time,teacher_id,room_id&academic_year=eq.${ACADEMIC_YEAR}`,
      accessToken,
    ),
    authedGet<CardRow[]>(
      `schedule_cards?select=id,requirement_id,duration_periods,publication_end_time_override&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
    authedGet<PlacementRow[]>(
      'placements?select=card_id,day_of_week,start_period,teacher_id,room_id',
      accessToken,
    ),
    authedGet<RoomRow[]>(
      'rooms?select=id,canonical_room_id',
      accessToken,
    ),
    latestPublication
      ? authedGet<PublicationSessionRow[]>(
        `management_publication_sessions?select=requirement_id,session_id&publication_id=eq.${latestPublication.id}`,
        accessToken,
      )
      : Promise.resolve([] as PublicationSessionRow[]),
    latestPublication
      ? authedGet<RequirementLineageRow[]>(
        `management_requirement_lineage?select=child_requirement_id,parent_requirement_id&publication_id=eq.${latestPublication.id}`,
        accessToken,
      )
      : Promise.resolve([] as RequirementLineageRow[]),
  ]);

  const requirementById = new Map(
    requirements.map((row) => [row.id, row]),
  );
  const groupById = new Map(groups.map((row) => [row.id, row]));
  const classById = new Map(classGroups.map((row) => [row.id, row]));
  const subjectById = new Map(subjects.map((row) => [row.id, row.name]));
  const publicById = new Map(publicSessions.map((row) => [row.id, row]));
  const placementByCard = new Map(
    placements.map((row) => [row.card_id, row]),
  );
  const canonicalRoomById = new Map(
    rooms.map((room) => [
      room.id,
      room.canonical_room_id ?? room.id,
    ]),
  );

  const childGroups = new Map<string, string[]>();
  groupRelations
    .filter((row) => row.relation === 'CONTAINS')
    .forEach((row) => {
      const values = childGroups.get(row.left_group_id) ?? [];
      values.push(row.right_group_id);
      childGroups.set(row.left_group_id, values);
    });

  const classCodesCache = new Map<string, string[]>();

  const resolveClassCodes = (
    groupId: string,
    seen = new Set<string>(),
  ): string[] => {
    const cached = classCodesCache.get(groupId);
    if (cached) return cached;

    if (seen.has(groupId)) return [];
    seen.add(groupId);

    const group = groupById.get(groupId);
    if (!group) return [];

    if (group.class_group_id) {
      const classGroup = classById.get(group.class_group_id);
      const values = classGroup ? [classCode(classGroup)] : [];
      classCodesCache.set(groupId, values);
      return values;
    }

    const values = new Set<string>();
    (childGroups.get(groupId) ?? []).forEach((childId) => {
      resolveClassCodes(childId, new Set(seen))
        .forEach((value) => values.add(value));
    });

    const result = Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true })
    );
    classCodesCache.set(groupId, result);
    return result;
  };

  const requirementMeta = new Map(
    requirements.map((requirement) => {
      const group = groupById.get(requirement.instructional_group_id);

      return [
        requirement.id,
        {
          subjectName:
            subjectById.get(requirement.subject_id) ?? 'Ders',
          groupName: group?.name ?? 'Grup',
          classCodes: resolveClassCodes(
            requirement.instructional_group_id,
          ),
        },
      ];
    }),
  );

  const mappingSource: ManagementPublicationPreviewData['mappingSource'] =
    latestPublication ? 'MANAGED_PUBLICATION' : 'BOOTSTRAP_EVIDENCE';

  const parentToChildRequirement = new Map(
    requirementLineage.map((row) => [
      row.parent_requirement_id,
      row.child_requirement_id,
    ]),
  );

  const activeMapping: EvidenceRow[] = latestPublication
    ? publicationSessions.flatMap((row) => {
      const childRequirementId = parentToChildRequirement.get(
        row.requirement_id,
      );

      return childRequirementId
        ? [{
          requirement_id: childRequirementId,
          source_session_id: row.session_id,
        }]
        : [];
    })
    : evidence;

  const sourceMappingSessionCount = latestPublication
    ? publicationSessions.length
    : evidence.length;

  const mappingSourceIds = new Set(
    activeMapping.map((row) => row.source_session_id),
  );
  const currentPublicIds = new Set(publicSessions.map((row) => row.id));

  const missingRequirementMappingCount = latestPublication
    ? publicationSessions.filter(
      (row) => !parentToChildRequirement.has(row.requirement_id),
    ).length
    : 0;

  const missingEvidenceSessionCount = (
    activeMapping.filter(
      (row) => !currentPublicIds.has(row.source_session_id),
    ).length
    + missingRequirementMappingCount
  );

  const unmappedCurrentPublicSessionCount = publicSessions.filter(
    (row) => !mappingSourceIds.has(row.id),
  ).length;

  const publishedUnits: Unit[] = activeMapping.flatMap((row) => {
    const session = publicById.get(row.source_session_id);
    if (!session || !requirementById.has(row.requirement_id)) return [];

    const roomId = session.room_id
      ? canonicalRoomById.get(session.room_id) ?? session.room_id
      : null;

    return [{
      requirementId: row.requirement_id,
      signature: unitSignature(
        session.day_of_week,
        normalizeTime(session.start_time),
        normalizeTime(session.end_time),
        session.teacher_id,
        roomId,
      ),
    }];
  });

  const draftUnits: Unit[] = cards.flatMap((card) => {
    const placement = placementByCard.get(card.id);
    if (!placement) return [];

    const result: Unit[] = [];

    for (let offset = 0; offset < card.duration_periods; offset += 1) {
      const periodIndex = placement.start_period - 1 + offset;
      const period = schoolConfig.periods[periodIndex];
      if (!period) continue;

      const roomId = placement.room_id
        ? canonicalRoomById.get(placement.room_id) ?? placement.room_id
        : null;

      result.push({
        requirementId: card.requirement_id,
        signature: unitSignature(
          placement.day_of_week,
          period.start,
          offset === card.duration_periods - 1
            && card.publication_end_time_override
            ? normalizeTime(card.publication_end_time_override)
            : period.end,
          placement.teacher_id,
          roomId,
        ),
      });
    }

    return result;
  });

  const stages = (['ORTAOKUL', 'LISE'] as const).reduce(
    (result, stage) => {
      const requirementIds = requirements
        .filter((requirement) => {
          const meta = requirementMeta.get(requirement.id);
          return meta
            ? stageMatches(meta.classCodes, stage)
            : false;
        })
        .map((requirement) => requirement.id);

      const idSet = new Set(requirementIds);
      const stagePublished = publishedUnits.filter(
        (unit) => idSet.has(unit.requirementId),
      );
      const stageDraft = draftUnits.filter(
        (unit) => idSet.has(unit.requirementId),
      );

      const changes = requirementIds
        .map((requirementId) => {
          const comparison = requirementComparison(
            requirementId,
            stagePublished,
            stageDraft,
          );
          const meta = requirementMeta.get(requirementId);

          return {
            requirementId,
            subjectName: meta?.subjectName ?? 'Ders',
            groupName: meta?.groupName ?? 'Grup',
            classCodes: meta?.classCodes ?? [],
            ...comparison,
          };
        })
        .filter((change) => (
          change.changedUnits > 0
          || change.addedUnits > 0
          || change.removedUnits > 0
        ))
        .sort((a, b) => (
          (
            b.changedUnits
            + b.addedUnits
            + b.removedUnits
          )
          - (
            a.changedUnits
            + a.addedUnits
            + a.removedUnits
          )
          || a.subjectName.localeCompare(b.subjectName, 'tr')
        ));

      const unchangedUnits = requirementIds.reduce(
        (sum, requirementId) => (
          sum + requirementComparison(
            requirementId,
            stagePublished,
            stageDraft,
          ).unchangedUnits
        ),
        0,
      );

      const changedUnits = changes.reduce(
        (sum, change) => sum + change.changedUnits,
        0,
      );
      const addedUnits = changes.reduce(
        (sum, change) => sum + change.addedUnits,
        0,
      );
      const removedUnits = changes.reduce(
        (sum, change) => sum + change.removedUnits,
        0,
      );

      result[stage] = {
        stage,
        publishedUnits: stagePublished.length,
        draftUnits: stageDraft.length,
        unchangedUnits,
        changedUnits,
        addedUnits,
        removedUnits,
        affectedRequirementCount: changes.length,
        changes,
      };

      return result;
    },
    {} as Record<ManagementStage, ManagementPublicationStagePreview>,
  );

  return {
    revisionId: revision.id,
    academicYear: ACADEMIC_YEAR,
    mappingSource,
    publicationNumber: latestPublication?.publication_number ?? null,
    publicSessionCount: publicSessions.length,
    evidenceSessionCount: sourceMappingSessionCount,
    mappedCurrentPublicSessionCount: publishedUnits.length,
    missingEvidenceSessionCount,
    unmappedCurrentPublicSessionCount,
    mappingHealthy:
      missingEvidenceSessionCount === 0
      && unmappedCurrentPublicSessionCount === 0,
    stages,
  };
}

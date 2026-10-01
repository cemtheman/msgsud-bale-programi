'use client';

import { getFreshManagementAccessToken } from '@/lib/managementAuth';

export type ManagementSolverObjectiveKey =
  | 'changeCost'
  | 'preferredTeacherContinuity'
  | 'teacherIdleGaps'
  | 'roomStability'
  | 'teacherLoadBalance'
  | 'subjectTimePreference';

export type ManagementSolverProfileStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type ManagementSolverObjectiveWeights = Record<
  ManagementSolverObjectiveKey,
  number
>;

export interface ManagementSolverObjectiveCatalogItem {
  id: ManagementSolverObjectiveKey;
  supported: boolean;
  meaning: string;
  missingInput?: string;
}

export interface ManagementSolverObjectiveValidation {
  valid: boolean;
  normalizedWeights: ManagementSolverObjectiveWeights;
  unknownKeys: string[];
  invalidValues: string[];
  unsupportedEnabled: string[];
  positiveSupportedObjectiveCount: number;
  catalog: ManagementSolverObjectiveCatalogItem[];
}

export interface ManagementSolverObjectiveProfile {
  id: string;
  requirementSetId?: string;
  name: string;
  description: string | null;
  status: ManagementSolverProfileStatus;
  weights: ManagementSolverObjectiveWeights;
  validation: ManagementSolverObjectiveValidation;
}

export interface ManagementSolverReadinessBlocker {
  code: string;
  count: number;
}

export interface ManagementSolverProvisionalInput {
  code: string;
  count: number;
  meaning?: string;
  hardBlocker?: boolean;
  resolutionStatus?: string;
  withBaselineRoomEvidence?: number;
  withoutBaselineRoomEvidence?: number;
}

export interface ManagementSolverBaselineMetrics {
  cardCount: number;
  placedCardCount: number;
  unplacedCardCount: number;
  lockedCardCount: number;
  changeCost: number;
  preferredTeacherContinuityBreaks: number;
  teacherIdleGapPeriods: number;
  roomStabilityBreaks: number;
  teacherLoadTargetDeviationPeriods?: number;
  teacherLoadRangeViolationPeriods?: number;
}

export interface ManagementSolverRequirement {
  id: string;
  subjectId: string;
  subjectName: string;
  groupId: string;
  groupName: string;
  groupType: string;
  weeklyLoad: number;
  preferredPartition: number[] | null;
  allowedPartitions: number[] | null;
  minDistinctDays: number | null;
  maxBlocksPerDay: number | null;
  maxConsecutivePeriods: number | null;
  courseCharacter: string | null;
  deliveryMode: string | null;
  teacherRequirement: string;
  teacherMode: string;
  teacherAssignmentScope: string;
  teacherContinuity: string;
  resourceMode: string;
  requiredCapability: string | null;
}

export interface ManagementSolverCard {
  id: string;
  requirementId: string;
  blockIndex: number;
  durationPeriods: number;
  locked: boolean;
}

export interface ManagementSolverInstructionalGroup {
  id: string;
  classGroupId: string | null;
  name: string;
  groupType: string;
  termStatus: string;
  knowledgeStatus: string | null;
}

export interface ManagementSolverInstructionalGroupRelation {
  leftGroupId: string;
  rightGroupId: string;
  relation: string;
}

export interface ManagementSolverTeacherPoolEntry {
  requirementId: string;
  teacherId: string;
}

export interface ManagementSolverRoomPoolEntry {
  requirementId: string;
  roomId: string;
}

export interface ManagementSolverTeacher {
  id: string;
  name: string;
  operationalStatus: string;
}

export interface ManagementSolverTeacherUnavailablePeriod {
  teacherId: string;
  dayOfWeek: number;
  period: number;
}

export interface ManagementSolverTeacherLoadTarget {
  teacherId: string;
  minimumLoad: number | null;
  targetLoad: number | null;
  maximumLoad: number | null;
  actualLoadPeriods: number;
  relevant: boolean;
}

export interface ManagementSolverTeacherLoadReadiness {
  ready: boolean;
  relevantTeacherCount: number;
  configuredTeacherCount: number;
  targetConfiguredTeacherCount: number;
  missingTargetTeacherCount: number;
  partialTeacherCount: number;
  baselineBelowMinimumTeacherCount: number;
  baselineAboveMaximumTeacherCount: number;
  baselineTargetDeviationPeriods: number;
  baselineRangeViolationPeriods: number;
}

export interface ManagementSolverRoom {
  id: string;
  name: string;
  canonicalRoomId: string | null;
  capabilities: string[];
  knowledgeStatus: string | null;
  operationalStatus: string;
}

export interface ManagementSolverBaselinePlacement {
  cardId: string;
  dayOfWeek: number | null;
  startPeriod: number | null;
  teacherId: string | null;
  roomId: string | null;
}

export interface ManagementSolverHardConstraintContract {
  days: number[];
  periods: number[];
  rules: string[];
}

export interface ManagementSolverSnapshotPreview {
  snapshotVersion: string;
  solverEngineStatus: 'SNAPSHOT_ONLY' | string;
  snapshotHash: string;
  baselineHash: string;
  meta: {
    revisionId: string;
    requirementSetId: string;
    revisionVersion: number;
    academicYear: string;
    term: number;
  };
  hardConstraintContract: ManagementSolverHardConstraintContract;
  requirements: ManagementSolverRequirement[];
  cards: ManagementSolverCard[];
  instructionalGroups: ManagementSolverInstructionalGroup[];
  instructionalGroupRelations: ManagementSolverInstructionalGroupRelation[];
  teacherPools: ManagementSolverTeacherPoolEntry[];
  roomPools: ManagementSolverRoomPoolEntry[];
  teachers: ManagementSolverTeacher[];
  teacherUnavailablePeriods?: ManagementSolverTeacherUnavailablePeriod[];
  teacherLoadTargets?: ManagementSolverTeacherLoadTarget[];
  teacherLoadReadiness?: ManagementSolverTeacherLoadReadiness;
  rooms: ManagementSolverRoom[];
  baselinePlacements: ManagementSolverBaselinePlacement[];
  baselineMetrics: ManagementSolverBaselineMetrics;
  objectiveProfile: {
    id: string;
    name: string;
    description: string | null;
    status: ManagementSolverProfileStatus;
    weights: ManagementSolverObjectiveWeights;
  } | null;
  objectiveCatalog: ManagementSolverObjectiveCatalogItem[];
  candidateDomainIncluded: boolean;
  candidateDomainOmissionReason: string;
  readiness: {
    hardInputReady: boolean;
    objectiveProfileReady: boolean;
    solverPrototypeReady: boolean;
    hardBlockers: ManagementSolverReadinessBlocker[];
    provisionalInputs?: ManagementSolverProvisionalInput[];
    resourceUnknownSemantics?: string;
    missingOptionalModelInputs: string[];
    teacherLoadReadiness?: ManagementSolverTeacherLoadReadiness;
    objectiveProfileValidation: ManagementSolverObjectiveValidation;
  };
}

export interface ManagementSolverWorkspace {
  revisionId: string;
  requirementSetId: string;
  profiles: ManagementSolverObjectiveProfile[];
  activeProfileId: string | null;
  preview: ManagementSolverSnapshotPreview;
}

export interface ManagementSolverProfileInput {
  profileId: string | null;
  requirementSetId: string;
  name: string;
  description: string | null;
  weights: ManagementSolverObjectiveWeights;
  status: ManagementSolverProfileStatus;
}

interface RpcErrorBody {
  message?: string;
  details?: string;
  hint?: string;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

function translateSolverError(message: string, fallback: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('editor role required')) {
    return 'Bu işlem için düzenleme yetkisi gerekiyor.';
  }

  if (normalized.includes('active objective profile requires at least one positive')) {
    return 'Etkin profil için en az bir hedefe Kapalı dışında bir öncelik verin.';
  }

  if (normalized.includes('unsupported objective')) {
    return 'Henüz veri modeli tamamlanmamış bir hedef etkinleştirilmeye çalışıldı.';
  }

  if (normalized.includes('invalid objective weights')) {
    return 'Optimizasyon hedefleri geçerli değil. Öncelik seçimlerini kontrol edin.';
  }

  if (normalized.includes('objective profile name is required')) {
    return 'Profil adı gerekli.';
  }

  if (normalized.includes('objective profile not found')) {
    return 'Optimizasyon profili artık mevcut değil. Veriyi yenileyin.';
  }

  if (normalized.includes('solver snapshot requires draft')) {
    return 'Optimizasyon hazırlığı yalnız taslak program üzerinde yapılabilir.';
  }

  return message || fallback;
}

async function callSolverRpc<T>(
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
    let message = 'Optimizasyon verisi alınamadı.';
    try {
      const body = await response.json() as RpcErrorBody;
      message = body.message ?? body.details ?? message;
    } catch {
      // Keep fallback.
    }
    throw new Error(translateSolverError(message, 'Optimizasyon işlemi tamamlanamadı.'));
  }

  return response.json() as Promise<T>;
}

export function previewManagementSolverSnapshot(
  accessToken: string,
  revisionId: string,
  objectiveProfileId: string | null,
) {
  return callSolverRpc<ManagementSolverSnapshotPreview>(
    'management_preview_solver_snapshot',
    accessToken,
    {
      p_schedule_revision_id: revisionId,
      p_objective_profile_id: objectiveProfileId,
    },
  );
}

export function listManagementSolverProfiles(
  accessToken: string,
  requirementSetId: string,
) {
  return callSolverRpc<ManagementSolverObjectiveProfile[]>(
    'management_list_solver_objective_profiles',
    accessToken,
    {
      p_requirement_set_id: requirementSetId,
    },
  );
}

export function upsertManagementSolverProfile(
  accessToken: string,
  input: ManagementSolverProfileInput,
) {
  return callSolverRpc<ManagementSolverObjectiveProfile>(
    'management_upsert_solver_objective_profile',
    accessToken,
    {
      p_profile_id: input.profileId,
      p_requirement_set_id: input.requirementSetId,
      p_name: input.name,
      p_description: input.description,
      p_weights: input.weights,
      p_status: input.status,
    },
  );
}

interface SolverRevisionRow {
  id: string;
}

async function authedSolverGet<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${await getFreshManagementAccessToken(accessToken)}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Optimizasyon taslak bilgisi alınamadı.');
  }

  return response.json() as Promise<T>;
}

export async function fetchManagementSolverWorkspace(
  accessToken: string,
  revisionId: string,
): Promise<ManagementSolverWorkspace> {
  const basePreview = await previewManagementSolverSnapshot(
    accessToken,
    revisionId,
    null,
  );

  const requirementSetId = basePreview.meta.requirementSetId;
  const profiles = await listManagementSolverProfiles(
    accessToken,
    requirementSetId,
  );
  const activeProfile = profiles.find((profile) => profile.status === 'ACTIVE') ?? null;
  const preview = activeProfile
    ? await previewManagementSolverSnapshot(
      accessToken,
      revisionId,
      activeProfile.id,
    )
    : basePreview;

  return {
    revisionId,
    requirementSetId,
    profiles,
    activeProfileId: activeProfile?.id ?? null,
    preview,
  };
}


export async function fetchLatestManagementSolverWorkspace(
  accessToken: string,
): Promise<ManagementSolverWorkspace | null> {
  const revisions = await authedSolverGet<SolverRevisionRow[]>(
    'schedule_revisions?select=id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  return fetchManagementSolverWorkspace(accessToken, revision.id);
}

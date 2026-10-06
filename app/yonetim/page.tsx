'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ManagementBoardGrid,
  managementAssessmentMatchesRow,
  type ManagementDropTarget,
  type ManagementGroupDropCandidate,
} from '@/components/management/ManagementBoardGrid';
import { ManagementCardPool } from '@/components/management/ManagementCardPool';
import { ManagementInspector } from '@/components/management/ManagementInspector';
import { ManagementBusyOverlay } from '@/components/management/ManagementBusyOverlay';
import { ManagementConfirmOverlay } from '@/components/management/ManagementConfirmOverlay';
import { ManagementProgramStatus } from '@/components/management/ManagementProgramStatus';
import { ManagementCoursePlan } from '@/components/management/ManagementCoursePlan';
import { ManagementResources } from '@/components/management/ManagementResources';
import { ManagementHelpCenter } from '@/components/management/ManagementHelpCenter';
import { ManagementQuickTour } from '@/components/management/ManagementQuickTour';
import { ManagementPlacementAssistant } from '@/components/management/ManagementPlacementAssistant';
import { ManagementHistoryActions } from '@/components/management/ManagementHistoryActions';
import { ManagementSolverWorkspacePanel } from '@/components/management/ManagementSolverWorkspacePanel';
import { useManagementSession } from '@/hooks/useManagementSession';
import {
  buildManagementRowDisplayCards,
  cardBelongsToClassRow,
  cardHasMissingRequiredRoom,
  cardHasMissingRequiredTeacher,
  cardMatchesProgramResourceFilters,
  cardMatchesAudience,
  cardMatchesStage,
  fetchManagementBoard,
  fetchManagementCardCandidates,
  applyManagementTeacherPolicyToCandidateDetail,
  managementRowsForView,
  translateCandidateReason,
  type ManagementAudienceScope,
  type ManagementBoardData,
  type ManagementCandidateAssessment,
  type ManagementCandidateDetail,
  type ManagementResourceView,
  type ManagementStage,
} from '@/lib/managementBoard';
import {
  fetchManagementOverview,
  type ManagementOverview,
} from '@/lib/managementOverview';
import {
  fetchLatestManagementSolverWorkspace,
  upsertManagementSolverProfile,
  type ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import {
  buildManagementSolverProposalWorkspaceCommands,
  prepareManagementSolverProposalApply,
  translateManagementSolverProposalApplyReason,
} from '@/lib/managementSolverProposal';
import {
  fetchManagementResources,
  previewManagementRoomDeparture,
  previewManagementTeacherDeparture,
  applyManagementRoomDeparture,
  applyManagementTeacherDeparture,
  validateManagementTeacherLoadTargets,
  validateManagementTeacherUnavailablePeriods,
  type ManagementResourceInventoryData,
} from '@/lib/managementResources';
import {
  deriveManagementHealth,
  type ManagementHealthIssue,
} from '@/lib/managementHealth';
import {
  fetchManagementPublicationGate,
  type ManagementPublicationGateData,
} from '@/lib/managementPublicationGate';
import {
  fetchManagementPublicationPreview,
  type ManagementPublicationPreviewData,
} from '@/lib/managementPublicationPreview';
import {
  buildManagementPlacementAssistantGroups,
  buildManagementPlacementAssistantPlan,
  sortManagementPlacementAssistantPlans,
  type ManagementPlacementAssistantGroup,
  type ManagementPlacementAssistantOption,
  type ManagementPlacementAssistantPlan,
  type ManagementPlacementAssistantSlot,
} from '@/lib/managementPlacementAssistant';
import {
  fetchManagementCoursePlan,
  updateManagementRequirementRoomStrategy,
  type ManagementCoursePlanData,
  type ManagementPlanStage,
  type ManagementRoomStrategy,
  type ManagementTeacherAssignmentScope,
  type ManagementTeacherContinuity,
} from '@/lib/managementCoursePlan';
import {
  canUseServerManagementHistoryDescriptor,
  fetchManagementCommandState,
  fetchManagementPlacedCardIds,
  fetchManagementSlotBlockers,
  moveManagementCard,
  moveManagementCardBundle,
  placeManagementCard,
  placeManagementCardBundle,
  previewManagementCandidateForwardImpacts,
  redoManagement,
  redoManagementBundle,
  removeManagementCard,
  removeManagementCardBundle,
  undoManagement,
  undoManagementBundle,
  undoManagementCardGroup,
  updateManagementRequirementTeachers,
  translateManagementPlacementResourceBlockReason,
  type ManagementCommandDescriptor,
  type ManagementCommandState,
  type ManagementRootAction,
} from '@/lib/managementCommands';
import {
  fetchLatestManagementWorkspaceSnapshotV1,
  fetchManagementWorkspaceSnapshotV1,
  type ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  invalidateManagementDraftRevisionCache,
} from '@/lib/managementRevision';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  hydrateManagementWorkspaceInventoryDisplayNamesV1,
  hydrateManagementWorkspaceRequirementCatalogV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  createManagementWorkspaceHistoryV1,
  redoManagementWorkspaceOperationV1,
  undoManagementWorkspaceOperationV1,
  type ManagementWorkspaceHistoryV1,
} from '@/lib/managementWorkspaceHistory';
import {
  executeManagementWorkspaceCommandV1,
  executeManagementWorkspaceCommandsV1,
  previewManagementWorkspaceCommandsV1,
} from '@/lib/managementWorkspaceCommands';
import {
  findManagementWorkspaceParallelBundleV1,
} from '@/lib/managementWorkspaceValidation';
import {
  buildManagementWorkspaceMoveCandidateDetailV1,
  buildManagementWorkspacePlacementCandidateDetailV1,
} from '@/lib/managementWorkspaceCandidates';
import {
  prepareManagementWorkspaceResourceEditV1,
} from '@/lib/managementWorkspaceResources';
import {
  prepareManagementWorkspaceTeacherPolicyV1,
} from '@/lib/managementWorkspaceTeacherPolicy';
import {
  prepareManagementWorkspaceCoordinatedTeacherReconciliationV1,
  prepareManagementWorkspaceTeacherReconciliationV1,
} from '@/lib/managementWorkspaceTeacherReconciliation';
import {
  prepareManagementWorkspaceRequirementStructureV1,
  previewManagementWorkspaceRequirementStructureV1,
} from '@/lib/managementWorkspaceStructure';
import {
  prepareManagementWorkspaceResourceCreateV1,
  prepareManagementWorkspaceResourceDeleteV1,
  prepareManagementWorkspaceRoomDepartureV1,
  prepareManagementWorkspaceRoomNameEditV1,
  prepareManagementWorkspaceRoomProfileV1,
  prepareManagementWorkspaceRoomStatusEditV1,
  prepareManagementWorkspaceTeacherDepartureV1,
  prepareManagementWorkspaceTeacherNameEditV1,
  prepareManagementWorkspaceTeacherStatusEditV1,
  previewManagementWorkspaceRoomDepartureV1,
  previewManagementWorkspaceTeacherDepartureV1,
} from '@/lib/managementWorkspaceInventoryEdits';
import {
  projectManagementBoardFromWorkspaceV1,
} from '@/lib/managementWorkspaceBoardAdapter';
import {
  projectManagementCoursePlanFromWorkspaceV1,
} from '@/lib/managementWorkspaceCoursePlan';
import {
  projectManagementResourcesFromWorkspaceV1,
} from '@/lib/managementWorkspaceInventory';
import {
  commitManagementWorkspaceV1,
  prepareManagementWorkspaceCommitV1,
  translateManagementWorkspaceCommitErrorV1,
} from '@/lib/managementWorkspaceCommit';

const DAYS = [
  { id: 1, label: 'Pzt' },
  { id: 2, label: 'Salı' },
  { id: 3, label: 'Çar' },
  { id: 4, label: 'Per' },
  { id: 5, label: 'Cuma' },
] as const;

const DAY_LONG: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
};

const STAGES: Array<{ id: ManagementStage; label: string }> = [
  { id: 'ORTAOKUL', label: 'Ortaokul' },
  { id: 'LISE', label: 'Lise' },
];

const AUDIENCE_FILTERS: Array<{
  id: ManagementAudienceScope;
  label: string;
  title: string;
}> = [
  { id: 'ALL', label: 'Tümü', title: 'Tüm dersler' },
  { id: 'SECTION', label: '📚', title: 'Ortak / şube dersleri' },
  { id: 'BALLET', label: '🩰', title: 'Bale öğrencileri' },
  { id: 'MUSIC', label: '🎶', title: 'Müzik öğrencileri' },
];

const RESOURCE_VIEWS: Array<{
  id: ManagementResourceView;
  label: string;
}> = [
  { id: 'SINIFLAR', label: 'Sınıflar' },
  { id: 'ÖĞRETMENLER', label: 'Öğretmenler' },
  { id: 'SALONLAR', label: 'Salonlar' },
];

const MANAGEMENT_STARTUP_STEPS = [
  'Sunucuya bağlanılıyor',
  'Oturum doğrulanıyor',
  'Çalışma alanı hazırlanıyor',
  'Ders programı indiriliyor',
  'Hazır',
] as const;


function workspaceIssueLabel(code: string) {
  const labels: Record<string, string> = {
    TIME_OUTSIDE_DAY: 'Ders saati gün sınırlarının dışında',
    LUNCH_BREAK_CROSSING: 'Ders öğle arasını bölüyor',
    LOCKED_CARD_MOVED: 'Kilitli bir ders değiştirilmiş',
    TEACHER_REQUIRED: 'Ders için öğretmen seçilmemiş',
    TEACHER_INACTIVE: 'Seçilen öğretmen kullanılamıyor',
    TEACHER_NOT_ELIGIBLE: 'Seçilen öğretmen bu ders için uygun değil',
    TEACHER_UNAVAILABLE: 'Öğretmen bu saatte uygun değil',
    ROOM_REQUIRED: 'Ders için salon seçilmemiş',
    ROOM_INACTIVE: 'Seçilen salon kullanılamıyor',
    ROOM_NOT_ELIGIBLE: 'Seçilen salon bu ders için uygun değil',
    ROOM_CAPABILITY_MISMATCH: 'Salon dersin ihtiyacını karşılamıyor',
    TEACHER_CONFLICT: 'Öğretmenin aynı saatte başka dersi var',
    ROOM_CONFLICT: 'Salon aynı saatte başka derste kullanılıyor',
    GROUP_CONFLICT: 'Aynı öğrenci grubu için saat çakışması var',
    PARALLEL_BUNDLE_BROKEN: 'Bağlı paralel ders paketi birlikte taşınmalı',
    REQUIREMENT_RESOURCES_REQUIRE_UNPLACED: 'Ders Planı kaynaklarını değiştirmek için ders önce programdan kaldırılıp kaydedilmeli',
    TEACHER_CONTINUITY: 'Dersin öğretmen sürekliliği bozuluyor',
    MAX_BLOCKS_PER_DAY: 'Ders aynı güne fazla sayıda yerleştirilmiş',
    MAX_CONSECUTIVE_PERIODS: 'Ders art arda fazla ders saati oluşturuyor',
    MIN_DISTINCT_DAYS: 'Ders yeterli farklı güne dağıtılmamış',
  };
  return labels[code] ?? 'Program kuralıyla uyuşmayan bir değişiklik var';
}

function workspaceIssueSummary(codes: string[]) {
  const unique = Array.from(new Set(codes.map(workspaceIssueLabel)));
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]}; ${unique[1]}`;
  return `${unique.slice(0, 2).join('; ')} ve ${unique.length - 2} başka sorun`;
}

function roleLabel(role: string | null | undefined) {
  if (role === 'ADMIN') return 'Yönetici';
  if (role === 'EDITOR') return 'Editör';
  if (role === 'VIEWER') return 'Görüntüleyici';
  return 'Yetkisiz';
}

function PartisyonMark({
  className = 'h-7 w-7',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="5.5 3.5 25.5 29"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7 4.5h12.5c6.3 0 10 3.1 10 8.2 0 5.2-3.7 8.3-10 8.3h-6.3v10.5H7V4.5Zm6.2 6v4.6h6.1c2.8 0 4.2-.8 4.2-2.4 0-1.5-1.4-2.2-4.2-2.2h-6.1Z"
        fill="currentColor"
      />
      <path
        d="M8.2 11.5h10.6M8.2 15.7h12.1M8.2 19.9h10.6"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PartisyonBrand({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="flex items-center" aria-label="MSGSÜ İDK Partisyon">
      <img
        src="/brand/msgsu-owl.svg"
        alt=""
        aria-hidden="true"
        className={compact ? 'h-8 w-auto shrink-0' : 'h-12 w-auto shrink-0'}
      />

      <span
        className={`mx-3 w-px shrink-0 bg-slate-300 ${compact ? 'h-8' : 'h-11'}`}
        aria-hidden="true"
      />

      <span className="min-w-0">
        <span className={`block font-bold uppercase text-slate-400 ${compact ? 'text-[7px] tracking-[0.26em]' : 'text-[9px] tracking-[0.3em]'}`}>
          MSGSÜ İDK
        </span>
        <span className="mt-0.5 flex items-end gap-0 whitespace-nowrap">
          <span className="grid shrink-0 place-items-center text-[#1437B8]">
            <PartisyonMark className={compact ? 'h-[18px] w-auto' : 'h-[25px] w-auto'} />
          </span>
          <span className={`relative top-[2px] -ml-[1px] font-black leading-none tracking-[-0.045em] text-[#081736] ${compact ? 'text-[18px]' : 'text-[25px]'}`}>
            artisyon
          </span>
        </span>
      </span>
    </div>
  );
}


function isTransientManagementReadError(reason: unknown) {
  if (!(reason instanceof Error)) return false;

  const message = reason.message.trim().toLocaleLowerCase('tr-TR');
  return (
    message === 'load failed'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network error')
    || message.includes('network request failed')
    || message.includes('network connection was lost')
    || message.includes('status code: 522')
  );
}

async function retryManagementRead<T>(
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (reason: unknown) {
    if (!isTransientManagementReadError(reason)) {
      throw reason;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    return load();
  }
}

function actionNoun(action: ManagementRootAction) {
  if (action === 'PLACE') return 'yerleştirmesi';
  if (action === 'MOVE') return 'taşıması';
  if (action === 'REMOVE') return 'kaldırma işlemi';
  if (action === 'RESOURCE') return 'kaynak değişikliği';
  return 'ders yapısı değişikliği';
}

function resourceHistoryLabel(descriptor: ManagementCommandDescriptor) {
  const resourceName = descriptor.resourceName
    ? `“${descriptor.resourceName}” `
    : '';
  const resourceKind = descriptor.resourceType === 'TEACHER'
    ? 'öğretmen'
    : descriptor.resourceType === 'ROOM'
      ? 'salon'
      : 'kaynak';

  switch (descriptor.resourceOperation) {
    case 'TEACHER_NAME':
      return `${resourceName}öğretmen adı değişikliği`;
    case 'ROOM_NAME':
      return `${resourceName}salon adı değişikliği`;
    case 'TEACHER_STATUS':
      return `${resourceName}öğretmen durumu değişikliği`;
    case 'ROOM_PROFILE':
      return `${resourceName}salon özellikleri değişikliği`;
    case 'ROOM_STATUS':
      return `${resourceName}salon durumu değişikliği`;
    case 'TEACHER_CREATE':
      return `${resourceName}öğretmen ekleme işlemi`;
    case 'ROOM_CREATE':
      return `${resourceName}salon ekleme işlemi`;
    case 'TEACHER_DELETE':
      return `${resourceName}öğretmen silme işlemi`;
    case 'TEACHER_DEPARTURE':
      return `${resourceName}öğretmen ayrılış / atama değişikliği`;
    case 'ROOM_DELETE':
      return `${resourceName}salon silme işlemi`;
    case 'ROOM_DEPARTURE':
      return `${resourceName}salon ayrılış / kullanım değişikliği`;
    default:
      return `${resourceName}${resourceKind} değişikliği`;
  }
}

function commandContextLabel(
  descriptor: ManagementCommandDescriptor | null,
  board: ManagementBoardData | null,
) {
  if (!descriptor) return 'Program işlemi';

  if (descriptor.action === 'STRUCTURE') {
    return 'Ders yapısı değişikliği';
  }

  if (descriptor.action === 'RESOURCE') {
    return resourceHistoryLabel(descriptor);
  }

  const card = descriptor.cardId
    ? board?.cards.find((item) => item.id === descriptor.cardId) ?? null
    : null;

  if (!card) {
    return `Program ${actionNoun(descriptor.action)}`;
  }

  const bundleCards = descriptor.cardIds
    .map((cardId) => board?.cards.find((item) => item.id === cardId) ?? null)
    .filter((item): item is ManagementBoardData['cards'][number] => Boolean(item));
  const bundleAudience = Array.from(new Set(
    bundleCards.flatMap((item) => item.classCodes),
  ))
    .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }))
    .join(' + ');
  const audience = bundleAudience
    || (card.classCodes.length > 0 ? card.classCodes.join(', ') : card.groupName);

  const placement = card.placement;

  if (descriptor.placementResourceType) {
    const isBulk = descriptor.bundleSize > 1;
    const wasEmpty = descriptor.placementResourceBeforeId === null;
    const operationLabel = descriptor.placementResourceType === 'TEACHER'
      ? `${isBulk ? 'toplu ' : ''}öğretmen ${wasEmpty ? 'ataması' : 'değişikliği'}`
      : `${isBulk ? 'toplu ' : ''}salon ${wasEmpty ? 'ataması' : 'değişikliği'}`;
    const targetName = descriptor.placementResourceType === 'TEACHER'
      ? (
        descriptor.placementResourceId
          ? board?.teacherNamesById[descriptor.placementResourceId] ?? null
          : null
      )
      : (
        descriptor.placementResourceId
          ? board?.roomNamesById[descriptor.placementResourceId] ?? null
          : null
      );

    if (isBulk) {
      return `${audience} ${card.subjectName} ${operationLabel}${targetName ? ` · ${targetName}` : ''}`;
    }

    const singlePlacementContext = placement
      ? [
        DAY_LONG[placement.dayOfWeek],
        `${placement.startPeriod}. ders`,
        targetName,
      ].filter(Boolean).join(' · ')
      : targetName ?? '';

    return `${audience} ${card.subjectName} ${operationLabel}${singlePlacementContext ? ` · ${singlePlacementContext}` : ''}`;
  }

  const placementContext = placement
    ? [
      DAY_LONG[placement.dayOfWeek],
      `${placement.startPeriod}. ders`,
      placement.teacherName,
      placement.roomName,
    ].filter(Boolean).join(' · ')
    : '';

  return `${audience} ${card.subjectName} ${actionNoun(descriptor.action)}${placementContext ? ` · ${placementContext}` : ''}`;
}

function completedCommandMessage(
  descriptor: ManagementCommandDescriptor | null,
  board: ManagementBoardData | null,
  mode: 'undo' | 'redo',
) {
  const base = commandContextLabel(descriptor, board);
  const autoText = descriptor && descriptor.autoCount > 0
    ? ` ve buna bağlı ${descriptor.autoCount} otomatik yerleşim`
    : '';

  if (mode === 'undo') {
    return `${base}${autoText} geri alındı.`;
  }

  return `${base}${autoText} yeniden uygulandı.`;
}

function LoginScreen({
  error,
  loading,
  onSubmit,
}: {
  error: string | null;
  loading: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(email, password);
  };

  return (
    <main className="management-workbench-root flex min-h-screen items-center justify-center bg-[#F5F3EE] px-5 py-10 text-slate-900">
      <section className="w-full max-w-[430px] rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <PartisyonBrand />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">
          Yönetim
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          MSGSÜ İstanbul Devlet Konservatuvarı ders programı çalışma alanına erişmek için yönetim hesabınızla giriş yapın.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              E-posta
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              Parola
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Giriş yapılıyor…' : 'Yönetim alanını aç'}
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 block text-center text-xs font-semibold text-slate-400 transition hover:text-slate-700"
        >
          Öğrenci / öğretmen programına dön
        </Link>
      </section>
    </main>
  );
}

export default function ManagementPage() {
  const {
    status,
    session,
    access,
    error,
    login,
    logout,
  } = useManagementSession();

  const [overview, setOverview] = useState<ManagementOverview | null>(null);
  const [board, setBoard] = useState<ManagementBoardData | null>(null);
  const serverBoardRef = useRef<ManagementBoardData | null>(null);
  const workspaceSnapshotRef = useRef<ManagementWorkspaceSnapshotV1 | null>(null);
  const workspaceWorkingCopyRef = useRef<ManagementWorkspaceWorkingCopyV1 | null>(null);
  const workspaceHistoryRef = useRef<ManagementWorkspaceHistoryV1 | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [coursePlan, setCoursePlan] = useState<ManagementCoursePlanData | null>(null);
  const [resources, setResources] = useState<ManagementResourceInventoryData | null>(null);
  const [solverWorkspace, setSolverWorkspace] =
    useState<ManagementSolverWorkspace | null>(null);
  const [publicationPreview, setPublicationPreview] =
    useState<ManagementPublicationPreviewData | null>(null);
  const [publicationGate, setPublicationGate] =
    useState<ManagementPublicationGateData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [startupStep, setStartupStep] = useState(0);
  const [startupComplete, setStartupComplete] = useState(false);

  const [activeSection, setActiveSection] =
    useState<'PROGRAM' | 'PLAN' | 'RESOURCES' | 'SOLVER' | 'STATUS'>('PROGRAM');
  const [activeDay, setActiveDay] = useState(1);
  const [stage, setStage] = useState<ManagementStage>('ORTAOKUL');
  const [resourceView, setResourceView] =
    useState<ManagementResourceView>('SINIFLAR');
  const [programResourceFilters, setProgramResourceFilters] = useState<Array<{
    kind: 'TEACHER' | 'ROOM';
    id: string;
    label: string;
  }>>([]);
  const [programFilterMenu, setProgramFilterMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [programFilterQuery, setProgramFilterQuery] = useState('');
  const [programFilterMode, setProgramFilterMode] =
    useState<'ANY' | 'INTERSECTION'>('ANY');
  const [programGapFilter, setProgramGapFilter] =
    useState<'TEACHER' | 'ROOM' | null>(null);
  const [audienceFilter, setAudienceFilter] =
    useState<ManagementAudienceScope>('ALL');

  const [poolOpen, setPoolOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourChecked, setTourChecked] = useState(false);

  const [placementAssistantOpen, setPlacementAssistantOpen] = useState(false);
  const [placementAssistantPlans, setPlacementAssistantPlans] =
    useState<ManagementPlacementAssistantPlan[]>([]);
  const [placementAssistantLoading, setPlacementAssistantLoading] = useState(false);
  const [placementAssistantImpactChecking, setPlacementAssistantImpactChecking] = useState(false);
  const [placementAssistantWaitingForRefresh, setPlacementAssistantWaitingForRefresh] = useState(false);
  const [placementAssistantSawRefreshLoading, setPlacementAssistantSawRefreshLoading] = useState(false);
  const [placementAssistantAnalyzed, setPlacementAssistantAnalyzed] = useState(false);
  const [placementAssistantStale, setPlacementAssistantStale] = useState(false);
  const [placementAssistantError, setPlacementAssistantError] = useState<string | null>(null);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [candidateDetail, setCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [inspectorIntent, setInspectorIntent] =
    useState<'DETAILS' | 'CANDIDATES' | 'TEACHER' | 'ROOM'>('DETAILS');
  const [inspectorIntentNonce, setInspectorIntentNonce] = useState(0);
  const [candidateFocus, setCandidateFocus] = useState<{
    dayOfWeek: number;
    startPeriod: number;
    candidates: ManagementCandidateAssessment[];
  } | null>(null);

  const [dragCardIds, setDragCardIds] = useState<string[]>([]);
  const [dragStartOffsetsByCardId, setDragStartOffsetsByCardId] =
    useState<Record<string, number>>({});
  const dragCardIdsRef = useRef<string[]>([]);
  const [dragCandidateDetails, setDragCandidateDetails] =
    useState<Record<string, ManagementCandidateDetail>>({});
  const [dragLoading, setDragLoading] = useState(false);
  const dragSequenceRef = useRef(0);

  const [commandState, setCommandState] = useState<ManagementCommandState>({
    undo: null,
    redo: null,
  });
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandActivity, setCommandActivity] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [cardContextMenu, setCardContextMenu] = useState<{
    cardId: string;
    cardIds: string[];
    x: number;
    y: number;
  } | null>(null);
  const inspectorPanelRef = useRef<HTMLDivElement | null>(null);
  const [commandNotice, setCommandNotice] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !session || tourChecked) return;

    setTourChecked(true);

    try {
      if (window.localStorage.getItem('msgsud-management-tour-v1') !== 'done') {
        setActiveSection('PROGRAM');
        setPoolOpen(true);
        setTourStep(0);
        setTourOpen(true);
      }
    } catch {
      // Local storage is optional; the tour can still be started from Help.
    }
  }, [session, status, tourChecked]);

  useEffect(() => {
    if (!cardContextMenu) return;

    const closeMenu = () => setCardContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cardContextMenu]);

  useEffect(() => {
    if (!programFilterMenu) return;

    const closeMenu = () => setProgramFilterMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [programFilterMenu]);

  useEffect(() => {
    if (status !== 'ready' || !session) {
      setOverview(null);
      setBoard(null);
      serverBoardRef.current = null;
      workspaceSnapshotRef.current = null;
      workspaceWorkingCopyRef.current = null;
      workspaceHistoryRef.current = null;
      setWorkspaceDirty(false);
      setCoursePlan(null);
      setResources(null);
      setSolverWorkspace(null);
      setPublicationPreview(null);
      setPublicationGate(null);
      if (status === 'anonymous') {
        setStartupStep(0);
        setStartupComplete(false);
      }
      return;
    }

    let active = true;
    const showStartup = !startupComplete;
    setDataLoading(true);
    setDataError(null);
    if (showStartup) setStartupStep(2);

    void (async () => {
      try {
        // Avoid opening every management data fan-out at once. Several of
        // these loaders issue their own parallel REST requests; starting all
        // of them together can create dozens of simultaneous Supabase calls
        // and has repeatedly produced transient edge 522 responses.
        //
        // Load the Program workspace first, then secondary management panels
        // in small stages. This keeps the existing contracts intact while
        // sharply reducing peak request concurrency.
        const nextWorkspaceSnapshot =
          await fetchLatestManagementWorkspaceSnapshotV1(
            session.accessToken,
          );
        if (!active) return;

        if (showStartup) setStartupStep(3);
        const [nextOverview, nextBoard] = await Promise.all([
          fetchManagementOverview(session.accessToken),
          fetchManagementBoard(session.accessToken),
        ]);
        if (!active) return;

        setOverview(nextOverview);
        serverBoardRef.current = nextBoard;

        if (
          nextBoard
          && nextWorkspaceSnapshot
          && nextWorkspaceSnapshot.identity.revisionId === nextBoard.revisionId
        ) {
          const nextWorkingCopy =
            createManagementWorkspaceWorkingCopyV1(nextWorkspaceSnapshot);
          workspaceSnapshotRef.current = nextWorkspaceSnapshot;
          workspaceWorkingCopyRef.current = nextWorkingCopy;
          workspaceHistoryRef.current = createManagementWorkspaceHistoryV1();
          setWorkspaceDirty(false);
          setBoard(
            projectManagementBoardFromWorkspaceV1(
              nextBoard,
              nextWorkingCopy,
              nextWorkspaceSnapshot,
            ),
          );
        } else {
          workspaceSnapshotRef.current = null;
          workspaceWorkingCopyRef.current = null;
          workspaceHistoryRef.current = null;
          setWorkspaceDirty(false);
          setBoard(nextBoard);
        }

        if (nextBoard) {
          try {
            const nextCommandState = await fetchManagementCommandState(
              session.accessToken,
              nextBoard.revisionId,
            );
            if (!active) return;
            setCommandState(nextCommandState);
          } catch {
            // Server-side history is secondary during startup. Local workspace
            // history becomes authoritative for edits in this session, and a
            // transient history read must never keep Program behind the loader.
            if (!active) return;
            setCommandState({ undo: null, redo: null });
          }
        } else {
          setCommandState({ undo: null, redo: null });
        }

        // The Program workspace is the only startup-critical surface.
        // Plan/Resources/Solver/Status data is lazy-loaded by its own section
        // so transient failures there can never keep the app behind the loader.
        if (showStartup) {
          setStartupStep(4);
          setStartupComplete(true);
        }
      } catch (reason: unknown) {
        if (!active) return;
        setDataError(
          reason instanceof Error
            ? reason.message
            : 'Taslak program verisi alınamadı.',
        );
      } finally {
        if (active) setDataLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshToken, session, status]);

  useEffect(() => {
    if (
      status !== 'ready'
      || !session
      || !startupComplete
      || activeSection !== 'PLAN'
    ) {
      return;
    }

    let active = true;

    void fetchManagementCoursePlan(session.accessToken)
      .then((nextCoursePlan) => {
        if (!active) return;
        if (!nextCoursePlan) {
          setCoursePlan(null);
          return;
        }
        const localWorkingCopy = workspaceWorkingCopyRef.current;
        if (
          localWorkingCopy
          && nextCoursePlan.revisionId
            === localWorkingCopy.baseline.revisionId
          && nextCoursePlan.requirementSetId
            === localWorkingCopy.baseline.requirementSetId
        ) {
          hydrateManagementWorkspaceRequirementCatalogV1(
            localWorkingCopy,
            nextCoursePlan.rows,
          );
        }
        setCoursePlan(nextCoursePlan);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCommandNotice({
          kind: 'info',
          text: reason instanceof Error
            ? `Ders planı şu anda alınamadı: ${reason.message}`
            : 'Ders planı şu anda alınamadı. Biraz sonra yeniden deneyin.',
        });
      });

    return () => {
      active = false;
    };
  }, [activeSection, refreshToken, session, startupComplete, status]);

  useEffect(() => {
    if (
      status !== 'ready'
      || !session
      || !startupComplete
      || activeSection !== 'RESOURCES'
    ) {
      return;
    }

    let active = true;

    void fetchManagementResources(session.accessToken)
      .then((nextResources) => {
        if (!active) return;

        const localWorkingCopy = workspaceWorkingCopyRef.current;
        if (localWorkingCopy && nextResources) {
          hydrateManagementWorkspaceInventoryDisplayNamesV1(
            localWorkingCopy,
            nextResources,
          );
        }

        setResources(nextResources);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCommandNotice({
          kind: 'info',
          text: reason instanceof Error
            ? `Kaynak bilgileri şu anda alınamadı: ${reason.message}`
            : 'Kaynak bilgileri şu anda alınamadı. Biraz sonra yeniden deneyin.',
        });
      });

    return () => {
      active = false;
    };
  }, [activeSection, refreshToken, session, startupComplete, status]);

  useEffect(() => {
    if (
      status !== 'ready'
      || !session
      || !startupComplete
      || activeSection !== 'SOLVER'
    ) {
      return;
    }

    let active = true;

    void fetchLatestManagementSolverWorkspace(session.accessToken)
      .then((nextSolverWorkspace) => {
        if (active) setSolverWorkspace(nextSolverWorkspace);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCommandNotice({
          kind: 'info',
          text: reason instanceof Error
            ? `Tercih ayarları şu anda alınamadı: ${reason.message}`
            : 'Tercih ayarları şu anda alınamadı. Biraz sonra yeniden deneyin.',
        });
      });

    return () => {
      active = false;
    };
  }, [activeSection, refreshToken, session, startupComplete, status]);

  useEffect(() => {
    if (
      status !== 'ready'
      || !session
      || !startupComplete
      || activeSection !== 'STATUS'
    ) {
      return;
    }

    let active = true;

    void (async () => {
      const [previewResult, gateResult] = await Promise.allSettled([
        fetchManagementPublicationPreview(session.accessToken),
        fetchManagementPublicationGate(session.accessToken),
      ]);

      if (!active) return;

      if (previewResult.status === 'fulfilled') {
        setPublicationPreview(previewResult.value);
      }

      if (gateResult.status === 'fulfilled') {
        setPublicationGate(gateResult.value);
      }

      if (
        previewResult.status === 'rejected'
        || gateResult.status === 'rejected'
      ) {
        setCommandNotice({
          kind: 'info',
          text: 'Program durumu kontrollerinin bir bölümü şu anda alınamadı. Ana program etkilenmedi; biraz sonra yeniden deneyebilirsiniz.',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [activeSection, refreshToken, session, startupComplete, status]);

  const localUndoAvailable = Boolean(
    workspaceHistoryRef.current?.undoStack.length,
  );
  const localRedoAvailable = Boolean(
    workspaceHistoryRef.current?.redoStack.length,
  );
  const workspaceLocalSessionActive = Boolean(
    workspaceHistoryRef.current
    && (
      workspaceHistoryRef.current.nextSequence > 1
      || workspaceHistoryRef.current.redoStack.length > 0
    )
  );
  const workspaceOwnsStructureHistory = Boolean(
    workspaceSnapshotRef.current
    && workspaceWorkingCopyRef.current
    && workspaceHistoryRef.current
    && serverBoardRef.current
  );
  const serverUndoAvailable = canUseServerManagementHistoryDescriptor(
    commandState.undo,
    workspaceOwnsStructureHistory,
  );
  const serverRedoAvailable = canUseServerManagementHistoryDescriptor(
    commandState.redo,
    workspaceOwnsStructureHistory,
  );

  useEffect(() => {
    if (!workspaceLocalSessionActive) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [workspaceLocalSessionActive]);

  const visibleCards = useMemo(
    () => board?.cards.filter(
      (card) => cardMatchesStage(card, stage)
        && cardMatchesAudience(card, audienceFilter),
    ) ?? [],
    [audienceFilter, board, stage],
  );

  const visibleMissingTeacherCards = useMemo(
    () => visibleCards.filter(cardHasMissingRequiredTeacher),
    [visibleCards],
  );

  const visibleMissingRoomCards = useMemo(
    () => visibleCards.filter(cardHasMissingRequiredRoom),
    [visibleCards],
  );

  const programCards = useMemo(() => (
    visibleCards
      .filter((card) =>
        cardMatchesProgramResourceFilters(
          card,
          programResourceFilters,
          programFilterMode,
        ))
      .filter((card) => {
        if (!programGapFilter) return true;
        if (!card.placement) return false;

        return programGapFilter === 'TEACHER'
          ? cardHasMissingRequiredTeacher(card)
          : cardHasMissingRequiredRoom(card);
      })
  ), [
    programFilterMode,
    programGapFilter,
    programResourceFilters,
    visibleCards,
  ]);

  const orderedOperationalGapCards = useMemo(() => {
    if (!programGapFilter) return [];

    return [...programCards]
      .filter((card) => Boolean(card.placement))
      .sort((left, right) => (
        (left.placement?.dayOfWeek ?? 0) - (right.placement?.dayOfWeek ?? 0)
        || (left.placement?.startPeriod ?? 0) - (right.placement?.startPeriod ?? 0)
        || left.subjectName.localeCompare(right.subjectName, 'tr')
        || left.groupName.localeCompare(right.groupName, 'tr')
      ));
  }, [programCards, programGapFilter]);

  const selectedOperationalGapIndex = useMemo(
    () => (
      selectedCardId
        ? orderedOperationalGapCards.findIndex((card) => card.id === selectedCardId)
        : -1
    ),
    [orderedOperationalGapCards, selectedCardId],
  );

  const programTeacherFilterOptions = useMemo(() => {
    if (!board) return [];
    const usedIds = new Set(
      board.cards
        .map((card) => card.placement?.teacherId ?? null)
        .filter((value): value is string => Boolean(value)),
    );
    const query = programFilterQuery.trim().toLocaleLowerCase('tr-TR');

    return board.teacherRows
      .filter((row) => usedIds.has(row.id))
      .filter((row) => (
        query.length === 0
        || row.label.toLocaleLowerCase('tr-TR').includes(query)
      ));
  }, [board, programFilterQuery]);

  const programRoomFilterOptions = useMemo(() => {
    if (!board) return [];
    const usedIds = new Set(
      board.cards
        .map((card) => card.placement?.roomId ?? null)
        .filter((value): value is string => Boolean(value)),
    );
    const query = programFilterQuery.trim().toLocaleLowerCase('tr-TR');

    return board.roomRows
      .filter((row) => usedIds.has(row.id))
      .filter((row) => (
        query.length === 0
        || row.label.toLocaleLowerCase('tr-TR').includes(query)
      ));
  }, [board, programFilterQuery]);

  const placementAssistantGroups = useMemo(
    () => buildManagementPlacementAssistantGroups(visibleCards),
    [visibleCards],
  );

  useEffect(() => {
    setPlacementAssistantPlans([]);
    setPlacementAssistantAnalyzed(false);
    setPlacementAssistantStale(false);
    setPlacementAssistantError(null);
  }, [audienceFilter, stage]);

  useEffect(() => {
    if (refreshToken === 0) return;

    setPlacementAssistantPlans([]);
    setPlacementAssistantAnalyzed(false);
    setPlacementAssistantStale(true);
    setPlacementAssistantError(null);
  }, [refreshToken]);

  useEffect(() => {
    if (!placementAssistantWaitingForRefresh) return;

    if (dataLoading) {
      setPlacementAssistantSawRefreshLoading(true);
      return;
    }

    if (placementAssistantSawRefreshLoading) {
      setPlacementAssistantWaitingForRefresh(false);
      setPlacementAssistantSawRefreshLoading(false);
    }
  }, [
    dataLoading,
    placementAssistantSawRefreshLoading,
    placementAssistantWaitingForRefresh,
  ]);

  const rows = useMemo(() => {
    if (!board) return [];

    const baseRows = managementRowsForView(
      board,
      resourceView,
      stage,
      audienceFilter,
    );

    if (
      programResourceFilters.length === 0
      && !programGapFilter
    ) return baseRows;

    if (resourceView === 'SINIFLAR') {
      return baseRows.filter((row) =>
        programCards.some((card) => cardBelongsToClassRow(card, row)),
      );
    }

    if (resourceView === 'ÖĞRETMENLER') {
      const visibleTeacherIds = new Set(
        programCards
          .map((card) => card.placement?.teacherId ?? null)
          .filter((value): value is string => Boolean(value)),
      );
      return baseRows.filter((row) => visibleTeacherIds.has(row.id));
    }

    if (resourceView === 'SALONLAR') {
      const visibleRoomIds = new Set(
        programCards
          .map((card) => card.placement?.roomId ?? null)
          .filter((value): value is string => Boolean(value)),
      );
      return baseRows.filter((row) => visibleRoomIds.has(row.id));
    }

    return baseRows;
  }, [
    audienceFilter,
    board,
    programCards,
    programGapFilter,
    programResourceFilters,
    resourceView,
    stage,
  ]);

  const selectedCard = useMemo(
    () => board?.cards.find((card) => card.id === selectedCardId) ?? null,
    [board, selectedCardId],
  );
  const selectedCards = useMemo(
    () => selectedCardIds
      .map((cardId) => board?.cards.find((card) => card.id === cardId) ?? null)
      .filter((card): card is ManagementBoardData['cards'][number] => Boolean(card)),
    [board, selectedCardIds],
  );
  const selectedClassLabel = useMemo(
    () => Array.from(new Set(
      selectedCards.flatMap((card) => card.classCodes),
    ))
      .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }))
      .join(' + '),
    [selectedCards],
  );

  const previewSelectedCandidate = useCallback((
    candidate: ManagementCandidateAssessment,
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;

    if (!selectedCardId || !localSnapshot || !localWorkingCopy) {
      return {
        applied: true,
        issues: [] as Array<{ code: string }>,
      };
    }

    return previewManagementWorkspaceCommandsV1(
      localSnapshot,
      localWorkingCopy,
      [{
        type: 'SET_PLACEMENT' as const,
        placement: {
          cardId: selectedCardId,
          dayOfWeek: candidate.dayOfWeek,
          startPeriod: candidate.startPeriod,
          teacherId: candidate.teacherId,
          roomId: candidate.roomId,
        },
      }],
    );
  }, [board, selectedCardId]);

  const locallyValidatedCandidateDetail = useMemo(() => {
    if (!candidateDetail) return null;

    const assessments = candidateDetail.assessments.map((assessment) => {
      if (
        assessment.status !== 'VALID'
        || !assessment.isComplete
      ) {
        return assessment;
      }

      const preview = previewSelectedCandidate(assessment);
      if (preview.applied) return assessment;

      const localCodes = preview.issues.map((issue) => issue.code);
      return {
        ...assessment,
        status: 'INVALID' as const,
        isComplete: false,
        reasonCodes: Array.from(new Set([
          ...assessment.reasonCodes,
          ...localCodes,
        ])),
      };
    });

    const reasonMap = new Map<string, number>();
    assessments.forEach((assessment) => {
      assessment.reasonCodes.forEach((code) => {
        reasonMap.set(code, (reasonMap.get(code) ?? 0) + 1);
      });
    });

    return {
      ...candidateDetail,
      assessments,
      validCandidates: assessments.filter(
        (assessment) => assessment.status === 'VALID' && assessment.isComplete,
      ),
      reasonCounts: Array.from(reasonMap.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => (
          right.count - left.count
          || left.code.localeCompare(right.code)
        )),
    };
  }, [
    board,
    candidateDetail,
    previewSelectedCandidate,
    workspaceDirty,
  ]);

  const locallyValidatedCandidateFocus = useMemo(() => {
    if (!candidateFocus) return null;

    return {
      ...candidateFocus,
      candidates: candidateFocus.candidates.filter(
        (candidate) => previewSelectedCandidate(candidate).applied,
      ),
    };
  }, [
    board,
    candidateFocus,
    previewSelectedCandidate,
    workspaceDirty,
  ]);

  const inspectorCard = useMemo(() => {
    if (!selectedCard || !locallyValidatedCandidateDetail) {
      return selectedCard;
    }

    const validCount = locallyValidatedCandidateDetail.assessments.filter(
      (assessment) => assessment.status === 'VALID' && assessment.isComplete,
    ).length;
    const unresolvedCount = locallyValidatedCandidateDetail.assessments.filter(
      (assessment) => assessment.status === 'UNRESOLVED',
    ).length;
    const invalidCount = locallyValidatedCandidateDetail.assessments.length
      - validCount
      - unresolvedCount;

    return {
      ...selectedCard,
      validCount,
      unresolvedCount,
      invalidCount,
    };
  }, [
    locallyValidatedCandidateDetail,
    selectedCard,
  ]);

  const dragCard = useMemo(
    () => board?.cards.find((card) => card.id === dragCardIds[0]) ?? null,
    [board, dragCardIds],
  );


  const healthSnapshot = useMemo(
    () => deriveManagementHealth(board, overview, stage),
    [board, overview, stage],
  );

  const fetchPolicyAwareCandidates = useCallback(async (
    accessToken: string,
    cardId: string,
    sourceBoard: ManagementBoardData | null = board,
  ) => {
    const detail = await retryManagementRead(
      () => fetchManagementCardCandidates(accessToken, cardId),
    );
    const card = sourceBoard?.cards.find((item) => item.id === cardId) ?? null;
    return card
      ? applyManagementTeacherPolicyToCandidateDetail(
        detail,
        card,
        sourceBoard?.teacherOperationalStatusById ?? {},
        sourceBoard?.roomOperationalStatusById ?? {},
      )
      : detail;
  }, [board]);

  const selectCard = (cardId: string, sourceCardIds?: string[]) => {
    const ids = Array.from(new Set(
      sourceCardIds?.length ? sourceCardIds : [cardId],
    ));
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setSelectedCardIds(ids);
    setInspectorIntent('DETAILS');
    setInspectorIntentNonce((value) => value + 1);
    setInspectorOpen(true);
  };

  const openCardInspector = (
    cardId: string,
    sourceCardIds: string[],
    intent: 'DETAILS' | 'CANDIDATES' | 'TEACHER' | 'ROOM' = 'DETAILS',
  ) => {
    selectCard(cardId, sourceCardIds);
    setInspectorIntent(intent);
    setInspectorIntentNonce((value) => value + 1);
    setCardContextMenu(null);
    window.setTimeout(() => {
      inspectorPanelRef.current?.focus();
    }, 0);
  };

  const openCardContextMenu = (
    cardId: string,
    sourceCardIds: string[],
    x: number,
    y: number,
  ) => {
    const width = 168;
    const height = 228;
    setProgramFilterMenu(null);
    setCardContextMenu({
      cardId,
      cardIds: Array.from(new Set(sourceCardIds.length ? sourceCardIds : [cardId])),
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  };

  const toggleProgramResourceFilter = (
    kind: 'TEACHER' | 'ROOM',
    id: string,
    label: string,
  ) => {
    setProgramResourceFilters((current) => {
      const exists = current.some(
        (filter) => filter.kind === kind && filter.id === id,
      );
      if (exists) {
        return current.filter(
          (filter) => !(filter.kind === kind && filter.id === id),
        );
      }

      return [...current, { kind, id, label }];
    });
  };

  const openProgramFilterMenu = (x: number, y: number) => {
    const width = 520;
    const height = 430;
    setCardContextMenu(null);
    setProgramGapFilter(null);
    setProgramFilterQuery('');
    setProgramFilterMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  };

  const openOperationalGap = (
    kind: 'TEACHER' | 'ROOM',
    cardIds?: string[],
  ) => {
    if (!board) return;

    const source = cardIds?.length
      ? cardIds
          .map((cardId) => board.cards.find((card) => card.id === cardId) ?? null)
          .filter((card): card is ManagementBoardData['cards'][number] => Boolean(card))
      : kind === 'TEACHER'
        ? visibleMissingTeacherCards
        : visibleMissingRoomCards;

    const target = source.find((card) => Boolean(card.placement)) ?? source[0] ?? null;

    setActiveSection('PROGRAM');
    setAudienceFilter('ALL');
    setResourceView('SINIFLAR');
    setProgramResourceFilters([]);
    setProgramGapFilter(kind);
    setPoolOpen(false);

    if (!target?.placement) return;

    setStage(cardMatchesStage(target, 'ORTAOKUL') ? 'ORTAOKUL' : 'LISE');
    setActiveDay(target.placement.dayOfWeek);
    openCardInspector(
      target.id,
      [target.id],
      kind === 'TEACHER' ? 'TEACHER' : 'ROOM',
    );
  };

  const openOperationalGapCard = (
    card: ManagementBoardData['cards'][number],
  ) => {
    if (!programGapFilter || !card.placement) return;

    setActiveDay(card.placement.dayOfWeek);
    openCardInspector(
      card.id,
      [card.id],
      programGapFilter === 'TEACHER' ? 'TEACHER' : 'ROOM',
    );
  };

  const stepOperationalGap = (direction: -1 | 1) => {
    if (!programGapFilter || orderedOperationalGapCards.length === 0) return;

    const currentIndex = selectedOperationalGapIndex >= 0
      ? selectedOperationalGapIndex
      : 0;
    const nextIndex = (
      currentIndex
      + direction
      + orderedOperationalGapCards.length
    ) % orderedOperationalGapCards.length;

    openOperationalGapCard(orderedOperationalGapCards[nextIndex]);
  };

  const handleHealthIssueAction = (issue: ManagementHealthIssue) => {
    if (!board || !issue.action) return;

    if (issue.action === 'OPEN_POOL') {
      setActiveSection('PROGRAM');
      setAudienceFilter('ALL');
      setResourceView('SINIFLAR');
      setProgramResourceFilters([]);
      setProgramGapFilter(null);
      setPoolOpen(true);
      setInspectorOpen(false);
      return;
    }

    if (issue.action === 'OPEN_TEACHER') {
      openOperationalGap('TEACHER', issue.cardIds);
      return;
    }

    if (issue.action === 'OPEN_ROOM') {
      openOperationalGap('ROOM', issue.cardIds);
      return;
    }

    const target = issue.cardIds
      ?.map((cardId) => board.cards.find((card) => card.id === cardId) ?? null)
      .find((card): card is ManagementBoardData['cards'][number] => Boolean(card))
      ?? null;

    setActiveSection('PROGRAM');
    setAudienceFilter('ALL');
    setResourceView('SINIFLAR');
    setProgramResourceFilters([]);
    setProgramGapFilter(null);

    if (!target) return;

    if (target.placement) {
      setActiveDay(target.placement.dayOfWeek);
      setPoolOpen(false);
    } else {
      setPoolOpen(true);
    }

    openCardInspector(target.id, [target.id], 'CANDIDATES');
  };

  const openResourceInProgram = (
    kind: 'TEACHER' | 'ROOM',
    resourceId: string,
    resourceName: string,
  ) => {
    if (!board) return;

    const placements = board.cards
      .filter((card) => (
        Boolean(card.placement)
        && (
          kind === 'TEACHER'
            ? card.placement?.teacherId === resourceId
            : card.placement?.roomId === resourceId
        )
      ))
      .sort((left, right) => (
        (left.placement?.dayOfWeek ?? 0) - (right.placement?.dayOfWeek ?? 0)
        || (left.placement?.startPeriod ?? 0) - (right.placement?.startPeriod ?? 0)
      ));

    setActiveSection('PROGRAM');
    setResourceView(kind === 'TEACHER' ? 'ÖĞRETMENLER' : 'SALONLAR');
    setProgramResourceFilters([{
      kind,
      id: resourceId,
      label: resourceName,
    }]);
    setProgramFilterMode('ANY');
    setProgramGapFilter(null);
    setAudienceFilter('ALL');
    setPoolOpen(false);
    setSelectedCardId(null);
    setSelectedCardIds([]);
    setInspectorOpen(false);
    setCandidateFocus(null);

    if (placements.length === 0) return;

    const currentStageHasPlacement = placements.some((card) =>
      cardMatchesStage(card, stage),
    );
    const targetStage = currentStageHasPlacement
      ? stage
      : cardMatchesStage(placements[0], 'ORTAOKUL')
        ? 'ORTAOKUL'
        : 'LISE';

    setStage(targetStage);

    const targetStagePlacements = placements.filter((card) =>
      cardMatchesStage(card, targetStage),
    );
    const currentDayHasPlacement = targetStagePlacements.some(
      (card) => card.placement?.dayOfWeek === activeDay,
    );
    if (!currentDayHasPlacement && targetStagePlacements[0]?.placement) {
      setActiveDay(targetStagePlacements[0].placement.dayOfWeek);
    }
  };

  useEffect(() => {
    if (!selectedCard) return;

    const outsideStageOrAudience = (
      !cardMatchesStage(selectedCard, stage)
      || !cardMatchesAudience(selectedCard, audienceFilter)
    );
    const outsideActiveFilter = (
      (programResourceFilters.length > 0 || Boolean(programGapFilter))
      && !programCards.some((card) => card.id === selectedCard.id)
    );

    if (!outsideStageOrAudience && !outsideActiveFilter) return;

    if (
      programGapFilter
      && !outsideStageOrAudience
      && orderedOperationalGapCards.length > 0
    ) {
      const nextCard = orderedOperationalGapCards[0];
      if (nextCard.id !== selectedCard.id && nextCard.placement) {
        setActiveDay(nextCard.placement.dayOfWeek);
        openCardInspector(
          nextCard.id,
          [nextCard.id],
          programGapFilter === 'TEACHER' ? 'TEACHER' : 'ROOM',
        );
        return;
      }
    }

    setSelectedCardId(null);
    setSelectedCardIds([]);
    setInspectorOpen(false);
  }, [
    audienceFilter,
    orderedOperationalGapCards,
    programCards,
    programGapFilter,
    programResourceFilters.length,
    selectedCard,
    stage,
  ]);

  useEffect(() => {
    setCommandNotice(null);
  }, [selectedCardId]);

  useEffect(() => {
    if (!session || !selectedCardId || status !== 'ready') {
      setCandidateDetail(null);
      setCandidateError(null);
      setCandidateLoading(false);
      return;
    }

    let active = true;
    setCandidateLoading(true);
    setCandidateError(null);

    fetchPolicyAwareCandidates(session.accessToken, selectedCardId)
      .then((detail) => {
        if (!active) return;
        setCandidateDetail(detail);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCandidateError(
          reason instanceof Error
            ? reason.message
            : 'Aday alanı ayrıntıları alınamadı.',
        );
      })
      .finally(() => {
        if (active) setCandidateLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPolicyAwareCandidates, refreshToken, selectedCardId, session, status]);


  const analyzePlacementAssistant = async () => {
    if (
      !session
      || !board
      || !access?.canEdit
      || status !== 'ready'
      || placementAssistantLoading
      || placementAssistantWaitingForRefresh
      || dataLoading
      || commandBusy
    ) {
      return;
    }

    setPlacementAssistantLoading(true);
    setPlacementAssistantError(null);
    setPlacementAssistantPlans([]);
    setPlacementAssistantStale(false);

    try {
      // Always start from a fresh board snapshot. This prevents a just-placed
      // card from being analyzed again while the normal workbench refresh is
      // still catching up. A transient browser/network failure may be retried
      // once because this is a read-only snapshot.
      const freshBoard = await retryManagementRead(
        () => fetchManagementBoard(session.accessToken),
      );
      if (!freshBoard) {
        throw new Error('Güncel program verisi alınamadı.');
      }

      const freshVisibleCards = freshBoard.cards.filter(
        (card) => cardMatchesStage(card, stage)
          && cardMatchesAudience(card, audienceFilter),
      );
      const analyzableGroups = buildManagementPlacementAssistantGroups(
        freshVisibleCards,
      ).filter(
        (group) => (
          group.status === 'SINGLE_OPTION'
          || group.status === 'CHOICES'
        ),
      );
      const nextPlans: ManagementPlacementAssistantPlan[] = [];

      // Assistant analysis is read-only. Candidate domains are maintained by
      // the placement/remove/resource flows themselves; forcing a fresh domain
      // rebuild here made a simple comparison screen depend on an expensive
      // write-heavy RPC and could hit statement timeout. Read the current
      // persisted candidate snapshot instead. The selected option is still
      // revalidated before any placement write.
      for (const group of analyzableGroups) {
        const entries = await Promise.all(
          group.cardIds.map(async (cardId) => [
            cardId,
            await retryManagementRead(
              () => fetchPolicyAwareCandidates(
                session.accessToken,
                cardId,
                freshBoard,
              ),
            ),
          ] as const),
        );

        nextPlans.push(
          buildManagementPlacementAssistantPlan(
            group,
            Object.fromEntries(entries),
            freshBoard.teacherNamesById,
            freshBoard.roomNamesById,
          ),
        );
      }

      const sortedPlans = sortManagementPlacementAssistantPlans(nextPlans);

      // Do not calculate forward-domain impact for every option up front.
      // A single pool card can have 100+ exact options; the previous batch
      // query rescanned the full candidate domain for each scenario and could
      // hit the database statement timeout. Options are now shown immediately.
      // The selected option is forward-impact checked immediately before any
      // placement write.
      setPlacementAssistantPlans(sortedPlans);
      setPlacementAssistantAnalyzed(true);
    } catch (reason: unknown) {
      setPlacementAssistantError(
        reason instanceof Error
          ? reason.message
          : 'Yerleştirme seçenekleri hazırlanamadı.',
      );
      setPlacementAssistantAnalyzed(false);
    } finally {
      setPlacementAssistantLoading(false);
    }
  };

  const beginDrag = (cardId: string, sourceCardIds?: string[]) => {
    if (!session || !access?.canEdit || status !== 'ready') return;

    const baseIds = Array.from(new Set(
      sourceCardIds?.length ? sourceCardIds : [cardId],
    ));
    const localSnapshot = workspaceSnapshotRef.current;
    const parallelBundle = localSnapshot
      ? findManagementWorkspaceParallelBundleV1(localSnapshot, cardId)
      : null;
    const ids = Array.from(new Set(
      parallelBundle
        ? [...baseIds, ...parallelBundle.cardIds]
        : baseIds,
    ));
    const anchorOffset = parallelBundle?.offsetsByCardId[cardId] ?? 0;
    const startOffsetsByCardId = parallelBundle
      ? Object.fromEntries(ids.map((id) => [
        id,
        (parallelBundle.offsetsByCardId[id] ?? anchorOffset) - anchorOffset,
      ]))
      : Object.fromEntries(ids.map((id) => [id, 0]));
    const sequence = dragSequenceRef.current + 1;
    dragSequenceRef.current = sequence;

    dragCardIdsRef.current = ids;
    setDragCardIds(ids);
    setDragStartOffsetsByCardId(startOffsetsByCardId);
    setDragCandidateDetails({});
    setDragLoading(true);
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setSelectedCardIds(ids);
    setCommandNotice(null);

    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localEntries = (
      localSnapshot && localWorkingCopy
    )
      ? ids.map((id) => {
        const placement = localWorkingCopy.placementsByCardId[id];
        const isPlaced = Boolean(
          placement
          && placement.dayOfWeek !== null
          && placement.startPeriod !== null
        );

        return [
          id,
          isPlaced
            ? buildManagementWorkspaceMoveCandidateDetailV1(
              localSnapshot,
              localWorkingCopy,
              id,
            )
            : buildManagementWorkspacePlacementCandidateDetailV1(
              localSnapshot,
              localWorkingCopy,
              id,
            ),
        ] as const;
      })
      : null;

    if (
      localEntries
      && localEntries.every(([, detail]) => detail !== null)
    ) {
      setDragCandidateDetails(
        Object.fromEntries(localEntries) as Record<
          string,
          ManagementCandidateDetail
        >,
      );
      setDragLoading(false);
      return;
    }

    dragCardIdsRef.current = [];
    setDragCardIds([]);
    setDragStartOffsetsByCardId({});
    setDragCandidateDetails({});
    setDragLoading(false);
    setCommandNotice({
      kind: 'error',
      text: 'Yerel aday bilgisi hazırlanamadı. Programı yenileyip tekrar deneyin.',
    });
    setInspectorOpen(true);
  };

  const endDrag = () => {
    dragSequenceRef.current += 1;
    dragCardIdsRef.current = [];
    setDragCardIds([]);
    setDragStartOffsetsByCardId({});
    setDragCandidateDetails({});
    setDragLoading(false);
  };

  useEffect(() => {
    if (dragCardIds.length === 0) return;

    const clearDragSoon = () => {
      window.setTimeout(() => {
        if (dragCardIdsRef.current.length > 0) {
          endDrag();
        }
      }, 0);
    };
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endDrag();
    };

    window.addEventListener('dragend', clearDragSoon);
    window.addEventListener('drop', clearDragSoon);
    window.addEventListener('blur', clearDragSoon);
    window.addEventListener('keydown', clearOnEscape);

    return () => {
      window.removeEventListener('dragend', clearDragSoon);
      window.removeEventListener('drop', clearDragSoon);
      window.removeEventListener('blur', clearDragSoon);
      window.removeEventListener('keydown', clearOnEscape);
    };
  }, [dragCardIds.length]);


  const runCandidateCommand = async (
    candidate: ManagementCandidateAssessment,
    cardOverride?: ManagementBoardData['cards'][number] | null,
  ) => {
    const commandCard = cardOverride ?? selectedCard;

    if (
      !session
      || !access?.canEdit
      || !commandCard
      || commandBusy
    ) {
      return false;
    }

    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      localSnapshot
      && localWorkingCopy
      && localHistory
      && serverBoard
    ) {
      const result = executeManagementWorkspaceCommandV1(
        localSnapshot,
        localWorkingCopy,
        localHistory,
        {
          type: 'SET_PLACEMENT',
          placement: {
            cardId: commandCard.id,
            dayOfWeek: candidate.dayOfWeek,
            startPeriod: candidate.startPeriod,
            teacherId: candidate.teacherId,
            roomId: candidate.roomId,
          },
        },
      );

      if (!result.applied) {
        setCommandNotice({
          kind: 'error',
          text: result.issues.length > 0
            ? `Bu konuma taşınamıyor: ${workspaceIssueSummary(result.issues.map((issue) => issue.code))}.`
            : 'Bu konuma taşınamıyor.',
        });
        return false;
      }

      setBoard(
        projectManagementBoardFromWorkspaceV1(
          serverBoard,
          localWorkingCopy,
          localSnapshot,
        ),
      );
      setWorkspaceDirty(
        diffManagementWorkspaceV1(
          localSnapshot,
          localWorkingCopy,
        ).hasChanges,
      );
      setCandidateFocus(null);
      setActiveDay(candidate.dayOfWeek);
      setCommandNotice({
        kind: 'success',
        text: commandCard.placement
          ? 'Kart yeni yerine taşındı. Değişiklik henüz kaydedilmedi.'
          : 'Kart programa yerleştirildi. Değişiklik henüz kaydedilmedi.',
      });
      return true;
    }

    setCommandBusy(true);
    setCommandActivity(
      commandCard.placement
        ? `${commandCard.subjectName} yeni yerine taşınıyor.`
        : `${commandCard.subjectName} programa yerleştiriliyor.`,
    );
    setCommandNotice(null);

    try {
      const input = {
        cardId: commandCard.id,
        dayOfWeek: candidate.dayOfWeek,
        startPeriod: candidate.startPeriod,
        teacherId: candidate.teacherId,
        roomId: candidate.roomId,
      };

      if (commandCard.placement) {
        await moveManagementCard(session.accessToken, input);
        setCommandNotice({ kind: 'success', text: 'Kart yeni yerine taşındı.' });
      } else {
        await placeManagementCard(session.accessToken, input);
        setCommandNotice({ kind: 'success', text: 'Kart programa yerleştirildi.' });
      }

      setCandidateFocus(null);
      setActiveDay(candidate.dayOfWeek);
      setRefreshToken((value) => value + 1);
      return true;
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'İşlem tamamlanamadı.',
      });
      return false;
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const runDropCandidates = async (
    moves: ManagementGroupDropCandidate[],
  ) => {
    if (!session || !access?.canEdit || !board || commandBusy || moves.length === 0) {
      return false;
    }

    const commands = moves.flatMap(({ cardId, candidate }) => {
      const card = board.cards.find((item) => item.id === cardId);
      if (!card) return [];
      return [{ card, candidate }];
    });

    if (commands.length !== moves.length) {
      setCommandNotice({
        kind: 'error',
        text: 'Birleşik dersin tüm kayıtları için geçerli hedef bulunamadı.',
      });
      return false;
    }

    if (commands.length === 1) {
      return runCandidateCommand(commands[0].candidate, commands[0].card);
    }

    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      localSnapshot
      && localWorkingCopy
      && localHistory
      && serverBoard
    ) {
      const result = executeManagementWorkspaceCommandsV1(
        localSnapshot,
        localWorkingCopy,
        localHistory,
        commands.map(({ card, candidate }) => ({
          type: 'SET_PLACEMENT' as const,
          placement: {
            cardId: card.id,
            dayOfWeek: candidate.dayOfWeek,
            startPeriod: candidate.startPeriod,
            teacherId: candidate.teacherId,
            roomId: candidate.roomId,
          },
        })),
      );

      if (!result.applied) {
        setCommandNotice({
          kind: 'error',
          text: result.issues.length > 0
            ? `Birleşik ders bu konuma taşınamıyor: ${workspaceIssueSummary(result.issues.map((issue) => issue.code))}.`
            : 'Birleşik ders bu konuma taşınamıyor.',
        });
        return false;
      }

      setBoard(
        projectManagementBoardFromWorkspaceV1(
          serverBoard,
          localWorkingCopy,
          localSnapshot,
        ),
      );
      setWorkspaceDirty(
        diffManagementWorkspaceV1(
          localSnapshot,
          localWorkingCopy,
        ).hasChanges,
      );
      setCandidateFocus(null);
      setActiveDay(commands[0].candidate.dayOfWeek);
      setCommandNotice({
        kind: 'success',
        text: `${commands[0].card.subjectName} birlikte taşındı. Değişiklik henüz kaydedilmedi; tek Geri Al ile eski yerine döner.`,
      });
      return true;
    }

    if (workspaceLocalSessionActive) {
      setCommandNotice({
        kind: 'info',
        text: 'Yerel çalışma alanı hazır değilken birleşik ders işlemi güvenli biçimde uygulanamaz.',
      });
      return false;
    }

    const placementStates = commands.map(({ card }) => Boolean(card.placement));
    const allPlaced = placementStates.every(Boolean);
    const allUnplaced = placementStates.every((placed) => !placed);

    if (!allPlaced && !allUnplaced) {
      setCommandNotice({
        kind: 'error',
        text: 'Birleşik dersin kayıtları aynı yerleşim durumunda değil. Programı yenileyip tekrar deneyin.',
      });
      return false;
    }

    const bundleItems = commands.map(({ card, candidate }) => ({
      cardId: card.id,
      dayOfWeek: candidate.dayOfWeek,
      startPeriod: candidate.startPeriod,
      teacherId: candidate.teacherId,
      roomId: candidate.roomId,
    }));

    setCommandBusy(true);
    setCommandActivity(
      allPlaced
        ? `${commands[0].card.subjectName} · ${commands.length} kayıt birlikte taşınıyor.`
        : `${commands[0].card.subjectName} · ${commands.length} kayıt birlikte yerleştiriliyor.`,
    );
    setCommandNotice(null);

    try {
      if (allPlaced) {
        await moveManagementCardBundle(session.accessToken, bundleItems);
      } else {
        await placeManagementCardBundle(session.accessToken, bundleItems);
      }

      setCandidateFocus(null);
      setActiveDay(commands[0].candidate.dayOfWeek);
      setCommandNotice({
        kind: 'success',
        text: allPlaced
          ? `${commands[0].card.subjectName} · ${commands.length} kayıt birlikte taşındı.`
          : `${commands[0].card.subjectName} · ${commands.length} kayıt birlikte yerleştirildi.`,
      });
      setRefreshToken((value) => value + 1);
      return true;
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Birleşik ders işlemi tamamlanamadı.',
      });
      return false;
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const applyPlacementAssistantOption = async (
    option: ManagementPlacementAssistantOption,
  ) => {
    if (workspaceLocalSessionActive) {
      setPlacementAssistantError(
        'Yerel çalışma alanında kaydedilmemiş değişiklik var. Önce geri alın veya çalışma alanını yenileyin.',
      );
      return;
    }

    if (
      !session
      || placementAssistantStale
      || placementAssistantLoading
      || placementAssistantWaitingForRefresh
      || placementAssistantImpactChecking
      || commandBusy
      || !access?.canEdit
    ) {
      return;
    }

    setPlacementAssistantError(null);
    setPlacementAssistantImpactChecking(true);

    try {
      const impacts = await retryManagementRead(
        () => previewManagementCandidateForwardImpacts(
          session.accessToken,
          [{
            id: option.id,
            items: option.moves.map(({ cardId, candidate }) => ({
              cardId,
              dayOfWeek: candidate.dayOfWeek,
              startPeriod: candidate.startPeriod,
              teacherId: candidate.teacherId,
              roomId: candidate.roomId,
            })),
          }],
        ),
      );

      const impact = impacts.find((item) => item.id === option.id) ?? null;

      if (!impact) {
        setPlacementAssistantError(
          'Bu seçeneğin ileri etkisi doğrulanamadı. Program değiştirilmedi; yeniden deneyin.',
        );
        setPlacementAssistantImpactChecking(false);
        return;
      }

      if (!impact.safeToApply) {
        setPlacementAssistantError(
          impact.newContradictionCount > 0
            ? `Bu seçenek ${impact.newContradictionCount} dersi seçeneksiz bırakacağı için uygulanmadı.`
            : 'Bu seçeneğin başka derslere etkisi güvenli değil. Program değiştirilmedi.',
        );
        setPlacementAssistantImpactChecking(false);
        return;
      }
    } catch (reason: unknown) {
      const raw = reason instanceof Error ? reason.message : '';
      const timedOut = raw.toLocaleLowerCase('tr-TR').includes('timeout');

      setPlacementAssistantError(
        timedOut
          ? 'İleri etki kontrolü zaman aşımına uğradı. Program değiştirilmedi; aynı seçeneği yeniden deneyin.'
          : raw || 'İleri etki kontrolü tamamlanamadı. Program değiştirilmedi.',
      );
      setPlacementAssistantImpactChecking(false);
      return;
    }

    setPlacementAssistantImpactChecking(false);
    setPlacementAssistantWaitingForRefresh(true);
    setPlacementAssistantSawRefreshLoading(false);
    setPlacementAssistantPlans([]);
    setPlacementAssistantStale(true);

    const applied = await runDropCandidates(option.moves);

    if (!applied) {
      setPlacementAssistantWaitingForRefresh(false);
      setPlacementAssistantSawRefreshLoading(false);
    }
  };

  const inspectPlacementAssistantGroup = (
    group: ManagementPlacementAssistantGroup,
    slot?: ManagementPlacementAssistantSlot,
  ) => {
    const primaryCardId = group.cardIds[0];
    if (!primaryCardId) return;

    setPlacementAssistantOpen(false);
    setPoolOpen(true);
    setSelectedCardId(primaryCardId);
    setSelectedCardIds(group.cardIds);

    if (slot) {
      setActiveDay(slot.dayOfWeek);
      setCandidateFocus({
        dayOfWeek: slot.dayOfWeek,
        startPeriod: slot.startPeriod,
        candidates: slot.primaryCandidates,
      });
    } else {
      setCandidateFocus(null);
    }

    setInspectorOpen(true);
  };

  const runSelectedCandidateAction = async (
    candidate: ManagementCandidateAssessment,
  ) => {
    if (
      !session
      || !access?.canEdit
      || !board
      || selectedCardIds.length <= 1
    ) {
      await runCandidateCommand(candidate);
      return;
    }

    setCommandNotice(null);

    try {
      const localSnapshot = workspaceSnapshotRef.current;
      const localWorkingCopy = workspaceWorkingCopyRef.current;

      if (!localSnapshot || !localWorkingCopy) {
        throw new Error('Yerel çalışma alanı hazır değil.');
      }

      const details = selectedCardIds.map((cardId) => {
        const placement = localWorkingCopy.placementsByCardId[cardId];
        const isPlaced = Boolean(
          placement
          && placement.dayOfWeek !== null
          && placement.startPeriod !== null
        );
        const detail = isPlaced
          ? buildManagementWorkspaceMoveCandidateDetailV1(
            localSnapshot,
            localWorkingCopy,
            cardId,
          )
          : buildManagementWorkspacePlacementCandidateDetailV1(
            localSnapshot,
            localWorkingCopy,
            cardId,
          );

        if (!detail) {
          throw new Error('Birleşik dersin yerel aday bilgisi hazırlanamadı.');
        }

        return { cardId, detail };
      });

      const moves: ManagementGroupDropCandidate[] = details.flatMap(
        ({ cardId, detail }) => {
          const validAtSlot = detail.assessments.filter((assessment) => (
            assessment.dayOfWeek === candidate.dayOfWeek
            && assessment.startPeriod === candidate.startPeriod
            && assessment.status === 'VALID'
            && assessment.isComplete
          ));

          if (cardId === selectedCardId) {
            const exact = validAtSlot.find((assessment) => (
              assessment.teacherId === candidate.teacherId
              && assessment.roomId === candidate.roomId
            ));
            return exact ? [{ cardId, candidate: exact }] : [];
          }

          const siblingCard = board.cards.find((item) => item.id === cardId) ?? null;
          const currentPlacement = siblingCard?.placement ?? null;

          const preserveCurrentResources = currentPlacement
            ? validAtSlot.find((assessment) => (
              assessment.teacherId === currentPlacement.teacherId
              && assessment.roomId === currentPlacement.roomId
            ))
            : null;

          if (preserveCurrentResources) {
            return [{ cardId, candidate: preserveCurrentResources }];
          }

          const preserveCurrentTeacher = currentPlacement?.teacherId
            ? validAtSlot.filter((assessment) => (
              assessment.teacherId === currentPlacement.teacherId
            ))
            : [];

          if (preserveCurrentTeacher.length === 1) {
            return [{ cardId, candidate: preserveCurrentTeacher[0] }];
          }

          const preserveCurrentRoom = currentPlacement?.roomId
            ? validAtSlot.filter((assessment) => (
              assessment.roomId === currentPlacement.roomId
            ))
            : [];

          if (preserveCurrentRoom.length === 1) {
            return [{ cardId, candidate: preserveCurrentRoom[0] }];
          }

          return validAtSlot.length === 1
            ? [{ cardId, candidate: validAtSlot[0] }]
            : [];
        },
      );

      if (moves.length !== selectedCardIds.length) {
        setCommandNotice({
          kind: 'error',
          text: 'Bu saatte birleşik dersin diğer sınıflarından en az biri için birden fazla eşdeğer kaynak seçeneği kaldı. Mevcut kaynak korunamadığı için otomatik seçim yapılmadı.',
        });
        return;
      }

      await runDropCandidates(moves);
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Birleşik ders için uygun hedefler hazırlanamadı.',
      });
    }
  };

  const resolveDeferredDrop = async (
    target: ManagementDropTarget,
  ) => {
    if (!session || !access?.canEdit || !board || commandBusy) return;

    const cardIds = Array.from(new Set(
      target.cardIds?.length ? target.cardIds : [target.cardId],
    ));
    const row = target.rowId
      ? rows.find((item) => item.id === target.rowId) ?? null
      : null;

    if (!row || cardIds.length === 0) {
      setCommandNotice({
        kind: 'error',
        text: 'Bırakma hedefi artık bulunamıyor. Programı yenileyip tekrar deneyin.',
      });
      return;
    }

    setSelectedCardId(cardIds[0]);
    setSelectedCardIds(cardIds);
    setInspectorOpen(true);
    setCommandNotice({
      kind: 'info',
      text: 'Uygun kaynaklar kontrol ediliyor…',
    });

    try {
      const localSnapshot = workspaceSnapshotRef.current;
      const localWorkingCopy = workspaceWorkingCopyRef.current;

      if (!localSnapshot || !localWorkingCopy) {
        throw new Error('Yerel çalışma alanı hazır değil.');
      }

      const details = cardIds.map((cardId) => {
        const placement = localWorkingCopy.placementsByCardId[cardId];
        const isPlaced = Boolean(
          placement
          && placement.dayOfWeek !== null
          && placement.startPeriod !== null
        );
        const detail = isPlaced
          ? buildManagementWorkspaceMoveCandidateDetailV1(
            localSnapshot,
            localWorkingCopy,
            cardId,
          )
          : buildManagementWorkspacePlacementCandidateDetailV1(
            localSnapshot,
            localWorkingCopy,
            cardId,
          );

        if (!detail) {
          throw new Error('Bırakma hedefinin yerel aday bilgisi hazırlanamadı.');
        }

        return { cardId, detail };
      });

      const resolved = details.map(({ cardId, detail }) => {
        const card = board.cards.find((item) => item.id === cardId) ?? null;
        const validCandidates = card
          ? detail.assessments.filter((assessment) => (
            assessment.dayOfWeek === target.dayOfWeek
            && assessment.startPeriod === target.startPeriod
            && assessment.status === 'VALID'
            && assessment.isComplete
            && managementAssessmentMatchesRow(
              card,
              assessment,
              row,
              resourceView,
            )
          ))
          : [];

        return { cardId, card, validCandidates };
      });

      if (resolved.some(({ card, validCandidates }) => (
        !card || validCandidates.length === 0
      ))) {
        setCommandNotice({
          kind: 'error',
          text: 'Bu saat birleşik dersin tüm sınıfları için uygun değil.',
        });
        return;
      }

      if (resolved.every(({ validCandidates }) => validCandidates.length === 1)) {
        await runDropCandidates(
          resolved.map(({ cardId, validCandidates }) => ({
            cardId,
            candidate: validCandidates[0],
          })),
        );
        return;
      }

      const primary = resolved[0];
      setCandidateFocus({
        dayOfWeek: target.dayOfWeek,
        startPeriod: target.startPeriod,
        candidates: primary.validCandidates,
      });
      setCommandNotice({
        kind: 'info',
        text: 'Bu saatte birden fazla öğretmen/salon seçeneği var. Ayrıntılardan uygun kaynağı seçin.',
      });
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Bırakma hedefi hazırlanamadı.',
      });
    }
  };

  const handleDropNeedsAttention = async (target: ManagementDropTarget) => {
    const targetCardIds = Array.from(new Set(
      target.cardIds?.length ? target.cardIds : [target.cardId],
    ));

    setSelectedCardId(target.cardId);
    setSelectedCardIds(targetCardIds);
    setInspectorOpen(true);

    if (target.state === 'LOADING') {
      void resolveDeferredDrop(target);
      return;
    }

    if (target.state === 'AMBIGUOUS') {
      setCandidateFocus({
        dayOfWeek: target.dayOfWeek,
        startPeriod: target.startPeriod,
        candidates: target.validCandidates,
      });
      setCommandNotice(null);
      return;
    }

    setCandidateFocus(null);

    const reason = target.reasonCodes[0]
      ? translateCandidateReason(target.reasonCodes[0])
      : null;

    if (target.state === 'UNRESOLVED') {
      setCommandNotice({
        kind: 'info',
        text: reason
          ? `Bu konum henüz belirsiz: ${reason}.`
          : 'Bu konum henüz belirsiz olduğu için doğrudan bırakılamıyor.',
      });
      return;
    }

    if (target.state === 'INVALID') {
      if (!session) {
        setCommandNotice({
          kind: 'error',
          text: reason
            ? `Bu konum uygun değil: ${reason}.`
            : 'Bu konum kart için uygun değil.',
        });
        return;
      }

      setCommandNotice({
        kind: 'info',
        text: 'Bu konumu engelleyen yerleşimler kontrol ediliyor…',
      });

      try {
        const blockers = await fetchManagementSlotBlockers(
          session.accessToken,
          targetCardIds,
          target.dayOfWeek,
          target.startPeriod,
        );

        if (blockers.length === 0) {
          setCommandNotice({
            kind: 'error',
            text: reason
              ? `Bu konum uygun değil: ${reason}.`
              : 'Bu konum kart için uygun değil.',
          });
          return;
        }

        const blockerText = blockers
          .slice(0, 3)
          .map((blocker) => {
            const resource = [
              blocker.roomName,
              blocker.teacherName,
            ].filter(Boolean).join(' · ');
            const types = blocker.conflictTypes
              .map((type) => translateCandidateReason(type))
              .join(' + ');

            return `${blocker.subjectName} / ${blocker.groupName}${resource ? ` · ${resource}` : ''}${types ? ` [${types}]` : ''}`;
          })
          .join(' | ');

        setCommandNotice({
          kind: 'error',
          text: `Bu konumu engelleyen yerleşim: ${blockerText}${blockers.length > 3 ? ` (+${blockers.length - 3})` : ''}.`,
        });
      } catch (diagnosticError: unknown) {
        setCommandNotice({
          kind: 'error',
          text: diagnosticError instanceof Error
            ? diagnosticError.message
            : reason
              ? `Bu konum uygun değil: ${reason}.`
              : 'Bu konum kart için uygun değil.',
        });
      }
    }
  };

  const requestRemove = () => {
    if (
      !access?.canEdit
      || selectedCards.length === 0
      || !selectedCards.every((card) => Boolean(card.placement))
      || commandBusy
    ) {
      return;
    }

    setRemoveConfirmOpen(true);
  };

  const removeCardsNow = async (cardIds: string[]) => {
    if (!session || !access?.canEdit || !board || commandBusy) {
      return false;
    }

    const uniqueIds = Array.from(new Set(cardIds));
    const cardsBeingRemoved = uniqueIds
      .map((cardId) => board.cards.find((card) => card.id === cardId) ?? null)
      .filter((card): card is ManagementBoardData['cards'][number] => Boolean(card));

    if (
      cardsBeingRemoved.length !== uniqueIds.length
      || cardsBeingRemoved.length === 0
      || !cardsBeingRemoved.every((card) => Boolean(card.placement))
    ) {
      return false;
    }

    const primaryCard = cardsBeingRemoved[0];
    const classLabel = Array.from(new Set(
      cardsBeingRemoved.flatMap((card) => card.classCodes),
    ))
      .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }))
      .join(' + ');

    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      localSnapshot
      && localWorkingCopy
      && localHistory
      && serverBoard
    ) {
      const result = uniqueIds.length === 1
        ? executeManagementWorkspaceCommandV1(
          localSnapshot,
          localWorkingCopy,
          localHistory,
          {
            type: 'REMOVE_PLACEMENT',
            cardId: primaryCard.id,
          },
        )
        : executeManagementWorkspaceCommandsV1(
          localSnapshot,
          localWorkingCopy,
          localHistory,
          uniqueIds.map((cardId) => ({
            type: 'REMOVE_PLACEMENT' as const,
            cardId,
          })),
        );

      if (!result.applied) {
        setCommandNotice({
          kind: 'error',
          text: result.issues.length > 0
            ? `Ders programdan kaldırılamıyor: ${workspaceIssueSummary(result.issues.map((issue) => issue.code))}.`
            : 'Ders programdan kaldırılamıyor.',
        });
        return false;
      }

      setBoard(
        projectManagementBoardFromWorkspaceV1(
          serverBoard,
          localWorkingCopy,
          localSnapshot,
        ),
      );
      setWorkspaceDirty(
        diffManagementWorkspaceV1(
          localSnapshot,
          localWorkingCopy,
        ).hasChanges,
      );
      setCommandNotice({
        kind: 'success',
        text: uniqueIds.length > 1
          ? `${classLabel || primaryCard.groupName} ${primaryCard.subjectName} programdan kaldırıldı. Değişiklik henüz kaydedilmedi; tek Geri Al ile geri getirilebilir.`
          : `${classLabel || primaryCard.groupName} ${primaryCard.subjectName} programdan kaldırıldı. Değişiklik henüz kaydedilmedi.`,
      });
      return true;
    }

    if (workspaceLocalSessionActive) {
      setCommandNotice({
        kind: 'info',
        text: 'Yerel çalışma alanında kaydedilmemiş değişiklik var. Toplu veya eski veritabanı yazma işlemleri şu anda kilitli.',
      });
      return false;
    }

    setCommandBusy(true);
    setCommandActivity(
      cardsBeingRemoved.length > 1
        ? `${primaryCard.subjectName} · ${cardsBeingRemoved.length} kayıt programdan kaldırılıyor.`
        : `${primaryCard.subjectName} programdan kaldırılıyor.`,
    );
    setCommandNotice(null);

    try {
      if (cardsBeingRemoved.length > 1) {
        await removeManagementCardBundle(
          session.accessToken,
          cardsBeingRemoved.map((card) => card.id),
        );
      } else {
        await removeManagementCard(session.accessToken, primaryCard.id);
      }

      setCommandNotice({
        kind: 'success',
        text: `${classLabel || primaryCard.groupName} ${primaryCard.subjectName} programdan kaldırıldı ve havuza geri döndü.`,
      });
      setRefreshToken((value) => value + 1);
      return true;
    } catch (reason: unknown) {
      const originalMessage = reason instanceof Error
        ? reason.message
        : 'Kart kaldırılamadı.';

      try {
        const stillPlacedIds = new Set(
          await fetchManagementPlacedCardIds(
            session.accessToken,
            cardsBeingRemoved.map((card) => card.id),
          ),
        );

        const placedCount = cardsBeingRemoved.filter(
          (card) => stillPlacedIds.has(card.id),
        ).length;

        if (placedCount === 0) {
          setCommandNotice({
            kind: 'success',
            text: `${classLabel || primaryCard.groupName} ${primaryCard.subjectName} programdan kaldırıldı. Bağlantı cevabı eksik kaldığı için ekran güncel durumla yeniden eşitleniyor.`,
          });
          setRefreshToken((value) => value + 1);
          return true;
        }

        if (placedCount !== cardsBeingRemoved.length) {
          setCommandNotice({
            kind: 'info',
            text: 'Kart grubunun yerleşim durumu işlem sırasında değişti. Yeni bir yazma işlemi uygulanmadı; ekran sunucudaki güncel durumla yenileniyor.',
          });
          setRefreshToken((value) => value + 1);
          return false;
        }
      } catch {
        // Reconciliation is read-only and best-effort. Preserve the original
        // command error when the network is still unavailable.
      }

      setCommandNotice({
        kind: 'error',
        text: originalMessage,
      });

      // A failed write response can still be ambiguous at the browser/network
      // layer. Refresh so the next user action never relies on stale placement
      // state.
      setRefreshToken((value) => value + 1);
      return false;
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const runRemove = async () => {
    setRemoveConfirmOpen(false);
    await removeCardsNow(selectedCards.map((card) => card.id));
  };

  const returnDraggedCardsToPool = () => {
    const cardIds = [...dragCardIdsRef.current];
    endDrag();

    if (cardIds.length === 0) {
      setCommandNotice({
        kind: 'info',
        text: 'Sürüklenen dersin kimliği güncellendi. Kartı yeniden sürükleyin.',
      });
      return;
    }

    void removeCardsNow(cardIds);
  };

  const runUndo = async () => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      localSnapshot
      && localWorkingCopy
      && localHistory
      && serverBoard
      && localHistory.undoStack.length > 0
    ) {
      const localOperation = undoManagementWorkspaceOperationV1(
        localWorkingCopy,
        localHistory,
      );
      setBoard(
        projectManagementBoardFromWorkspaceV1(
          serverBoard,
          localWorkingCopy,
          localSnapshot,
        ),
      );
      setWorkspaceDirty(
        diffManagementWorkspaceV1(
          localSnapshot,
          localWorkingCopy,
        ).hasChanges,
      );
      if (localOperation?.kind === 'SET_INVENTORY_RESOURCE') {
        setResources((current) => current ? { ...current } : current);
      }
      setCommandNotice({
        kind: 'success',
        text: localOperation?.kind === 'SET_REQUIREMENT_RESOURCES'
          ? 'Ders Planı kaynak değişikliği geri alındı.'
          : localOperation?.kind === 'SET_INVENTORY_RESOURCE'
            ? 'Kaynaklar değişikliği geri alındı.'
            : 'Program değişikliği geri alındı.',
      });
      return;
    }

    const descriptor = serverUndoAvailable ? commandState.undo : null;

    if (
      !session
      || !access?.canEdit
      || !descriptor
      || commandBusy
    ) {
      return;
    }

    setCommandBusy(true);
    setCommandActivity(`${commandContextLabel(descriptor, board)} geri alınıyor.`);
    setCommandNotice(null);

    try {
      if (descriptor.bundleId) {
        await undoManagementBundle(session.accessToken, descriptor.transactionId);
      } else {
        const legacyDisplayGroup = (
          descriptor.action === 'REMOVE'
          && descriptor.cardId
          && board
        )
          ? buildManagementRowDisplayCards(
            board.cards.filter((card) => !card.placement),
            'SINIFLAR',
          ).find((displayCard) =>
            displayCard.sourceCardIds.includes(descriptor.cardId!),
          ) ?? null
          : null;

        if (
          legacyDisplayGroup?.grouped
          && legacyDisplayGroup.sourceCardIds.length > 1
        ) {
          await undoManagementCardGroup(
            session.accessToken,
            legacyDisplayGroup.sourceCardIds,
          );
        } else {
          await undoManagement(session.accessToken, descriptor.transactionId);
        }
      }
      // The descriptor used for this click is now stale. Clear history
      // actions immediately so a fast second click cannot target the same
      // root while the workspace refresh is still in flight.
      setCommandState({ undo: null, redo: null });
      setCommandNotice({
        kind: 'success',
        text: completedCommandMessage(descriptor, board, 'undo'),
      });
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Geri alma işlemi tamamlanamadı.',
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const runRedo = async () => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      localSnapshot
      && localWorkingCopy
      && localHistory
      && serverBoard
      && localHistory.redoStack.length > 0
    ) {
      const localOperation = redoManagementWorkspaceOperationV1(
        localWorkingCopy,
        localHistory,
      );
      setBoard(
        projectManagementBoardFromWorkspaceV1(
          serverBoard,
          localWorkingCopy,
          localSnapshot,
        ),
      );
      setWorkspaceDirty(
        diffManagementWorkspaceV1(
          localSnapshot,
          localWorkingCopy,
        ).hasChanges,
      );
      if (localOperation?.kind === 'SET_INVENTORY_RESOURCE') {
        setResources((current) => current ? { ...current } : current);
      }
      setCommandNotice({
        kind: 'success',
        text: localOperation?.kind === 'SET_REQUIREMENT_RESOURCES'
          ? 'Ders Planı kaynak değişikliği yeniden uygulandı.'
          : localOperation?.kind === 'SET_INVENTORY_RESOURCE'
            ? 'Kaynaklar değişikliği yeniden uygulandı.'
            : 'Program değişikliği yeniden uygulandı.',
      });
      return;
    }

    const descriptor = serverRedoAvailable ? commandState.redo : null;

    if (
      !session
      || !access?.canEdit
      || !descriptor
      || commandBusy
    ) {
      return;
    }

    setCommandBusy(true);
    setCommandActivity(`${commandContextLabel(descriptor, board)} yeniden uygulanıyor.`);
    setCommandNotice(null);

    try {
      if (descriptor.bundleId) {
        await redoManagementBundle(session.accessToken, descriptor.transactionId);
      } else {
        await redoManagement(session.accessToken, descriptor.transactionId);
      }
      // REDO also invalidates the descriptor that was just used. Keep both
      // history buttons disabled until fresh server state arrives.
      setCommandState({ undo: null, redo: null });
      setCommandNotice({
        kind: 'success',
        text: completedCommandMessage(descriptor, board, 'redo'),
      });
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Yineleme işlemi tamamlanamadı.',
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const updateLocalRequirementTeachers = async (
    requirementId: string,
    teacherIds: string[],
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      !access?.canEdit
      || !localSnapshot
      || !localWorkingCopy
      || !localHistory
      || !serverBoard
    ) {
      throw new Error('Yerel çalışma alanı hazır değil.');
    }

    const current =
      localWorkingCopy.requirementResourcesById[requirementId] ?? null;
    if (!current) {
      throw new Error('Ders Planı kaynak tanımı bulunamadı.');
    }

    const normalizedTeacherIds = Array.from(new Set(teacherIds))
      .sort((a, b) => a.localeCompare(b));

    const result = executeManagementWorkspaceCommandV1(
      localSnapshot,
      localWorkingCopy,
      localHistory,
      {
        type: 'SET_REQUIREMENT_RESOURCES',
        resource: {
          ...current,
          teacherIds: normalizedTeacherIds,
          teacherMode: normalizedTeacherIds.length === 0
            ? 'UNKNOWN'
            : normalizedTeacherIds.length === 1
              ? 'FIXED'
              : 'ELIGIBLE_POOL',
        },
      },
    );

    if (!result.applied) {
      throw new Error(
        result.issues.length > 0
          ? `Ders Planı güncellenemiyor: ${workspaceIssueSummary(
            result.issues.map((issue) => issue.code),
          )}.`
          : 'Ders Planı güncellenemiyor.',
      );
    }

    setBoard(
      projectManagementBoardFromWorkspaceV1(
        serverBoard,
        localWorkingCopy,
        localSnapshot,
      ),
    );
    setWorkspaceDirty(
      diffManagementWorkspaceV1(
        localSnapshot,
        localWorkingCopy,
      ).hasChanges,
    );
    setCommandNotice({
      kind: 'success',
      text: 'Öğretmen havuzu yerel çalışma alanında güncellendi.',
    });
  };

  const updateLocalRequirementRoomStrategy = async (
    requirementId: string,
    strategy: ManagementRoomStrategy,
    roomIds: string[],
    requiredCapability: string | null,
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      !access?.canEdit
      || !localSnapshot
      || !localWorkingCopy
      || !localHistory
      || !serverBoard
    ) {
      throw new Error('Yerel çalışma alanı hazır değil.');
    }

    const current =
      localWorkingCopy.requirementResourcesById[requirementId] ?? null;
    if (!current) {
      throw new Error('Ders Planı kaynak tanımı bulunamadı.');
    }

    const normalizedRoomIds = Array.from(new Set(roomIds))
      .sort((a, b) => a.localeCompare(b));

    let resourceMode = 'UNKNOWN';
    let nextRoomIds: string[] = [];
    let nextCapability: string | null = null;

    if (strategy === 'SPECIFIC') {
      if (normalizedRoomIds.length === 0) {
        throw new Error('En az bir salon seçilmelidir.');
      }
      resourceMode = normalizedRoomIds.length === 1
        ? 'FIXED'
        : 'ELIGIBLE_POOL';
      nextRoomIds = normalizedRoomIds;
    } else if (strategy === 'CAPABILITY') {
      if (!requiredCapability) {
        throw new Error('Salon özelliği seçilmelidir.');
      }
      resourceMode = 'CAPABILITY';
      nextCapability = requiredCapability;
    }

    const result = executeManagementWorkspaceCommandV1(
      localSnapshot,
      localWorkingCopy,
      localHistory,
      {
        type: 'SET_REQUIREMENT_RESOURCES',
        resource: {
          ...current,
          resourceMode,
          roomIds: nextRoomIds,
          requiredCapability: nextCapability,
        },
      },
    );

    if (!result.applied) {
      throw new Error(
        result.issues.length > 0
          ? `Salon tanımı güncellenemiyor: ${workspaceIssueSummary(
            result.issues.map((issue) => issue.code),
          )}.`
          : 'Salon tanımı güncellenemiyor.',
      );
    }

    setBoard(
      projectManagementBoardFromWorkspaceV1(
        serverBoard,
        localWorkingCopy,
        localSnapshot,
      ),
    );
    setWorkspaceDirty(
      diffManagementWorkspaceV1(
        localSnapshot,
        localWorkingCopy,
      ).hasChanges,
    );
    setCommandNotice({
      kind: 'success',
      text: 'Salon stratejisi yerel çalışma alanında güncellendi.',
    });
  };

  const previewLocalRequirementTeacherPolicy = async (
    requirementId: string,
    scope: ManagementTeacherAssignmentScope,
    continuity: ManagementTeacherContinuity,
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;

    if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
      throw new Error('Yerel çalışma alanı hazır değil.');
    }

    return prepareManagementWorkspaceTeacherPolicyV1(
      localSnapshot,
      localWorkingCopy,
      requirementId,
      scope,
      continuity,
    ).preview;
  };

  const applyLocalRequirementTeacherPolicy = async (
    requirementId: string,
    scope: ManagementTeacherAssignmentScope,
    continuity: ManagementTeacherContinuity,
    expectedStateToken: string,
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      !access?.canEdit
      || !localSnapshot
      || !localWorkingCopy
      || !localHistory
      || !serverBoard
    ) {
      throw new Error('Yerel çalışma alanı hazır değil.');
    }

    const prepared = prepareManagementWorkspaceTeacherPolicyV1(
      localSnapshot,
      localWorkingCopy,
      requirementId,
      scope,
      continuity,
    );

    if (prepared.preview.stateToken !== expectedStateToken) {
      throw new Error(
        'Öğretmen kuralı önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
      );
    }

    if (!prepared.preview.canApply) {
      throw new Error(
        prepared.preview.blockReasons[0]
          ?? 'Öğretmen kuralı uygulanamıyor.',
      );
    }

    const result = executeManagementWorkspaceCommandV1(
      localSnapshot,
      localWorkingCopy,
      localHistory,
      {
        type: 'SET_REQUIREMENT_RESOURCES',
        resource: prepared.resource,
      },
    );

    if (!result.applied) {
      throw new Error(
        result.issues.length > 0
          ? `Öğretmen kuralı uygulanamıyor: ${workspaceIssueSummary(
            result.issues.map((issue) => issue.code),
          )}.`
          : 'Öğretmen kuralı uygulanamıyor.',
      );
    }

    setBoard(
      projectManagementBoardFromWorkspaceV1(
        serverBoard,
        localWorkingCopy,
        localSnapshot,
      ),
    );
    setWorkspaceDirty(
      diffManagementWorkspaceV1(
        localSnapshot,
        localWorkingCopy,
      ).hasChanges,
    );
    setCommandNotice({
      kind: 'success',
      text: 'Öğretmen kuralı yerel çalışma alanında güncellendi.',
    });
  };

  const applyLocalInventoryCommand = (
    command: Parameters<typeof executeManagementWorkspaceCommandV1>[3],
    successText: string,
  ) => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;
    const localHistory = workspaceHistoryRef.current;
    const serverBoard = serverBoardRef.current;

    if (
      !access?.canEdit
      || !localSnapshot
      || !localWorkingCopy
      || !localHistory
      || !serverBoard
    ) {
      throw new Error('Yerel çalışma alanı hazır değil.');
    }

    const result = executeManagementWorkspaceCommandV1(
      localSnapshot,
      localWorkingCopy,
      localHistory,
      command,
    );

    if (!result.applied) {
      throw new Error(
        result.issues.length > 0
          ? `Kaynak değişikliği uygulanamıyor: ${workspaceIssueSummary(
            result.issues.map((issue) => issue.code),
          )}.`
          : 'Kaynak değişikliği uygulanamıyor.',
      );
    }

    setBoard(
      projectManagementBoardFromWorkspaceV1(
        serverBoard,
        localWorkingCopy,
        localSnapshot,
      ),
    );
    setWorkspaceDirty(
      diffManagementWorkspaceV1(
        localSnapshot,
        localWorkingCopy,
      ).hasChanges,
    );
    setResources((current) => current ? { ...current } : current);
    setCommandNotice({
      kind: 'success',
      text: successText,
    });
  };

  const assertServerResourceMutationAllowed = () => {
    if (workspaceLocalSessionActive) {
      throw new Error(
        'Kaydedilmemiş yerel değişiklikler varken bu Kaynaklar işlemi kullanılamaz. Önce ana Kaydet veya Geri Al yapın.',
      );
    }
  };

  const saveWorkspace = async () => {
    const localSnapshot = workspaceSnapshotRef.current;
    const localWorkingCopy = workspaceWorkingCopyRef.current;

    if (
      !session
      || !access?.canEdit
      || !localSnapshot
      || !localWorkingCopy
      || !workspaceDirty
      || commandBusy
    ) {
      return;
    }

    const prepared = prepareManagementWorkspaceCommitV1(
      localSnapshot,
      localWorkingCopy,
    );

    if (!prepared.ready || !prepared.payload) {
      setCommandNotice({
        kind: prepared.issues.length > 0 ? 'error' : 'info',
        text: prepared.issues.length > 0
          ? `Kaydetmeden önce şu durumu düzeltin: ${workspaceIssueSummary(prepared.issues.map((issue) => issue.code))}.`
          : 'Kaydedilecek değişiklik yok.',
      });
      return;
    }

    setCommandBusy(true);
    setCommandActivity(
      `${prepared.payload.changes.length} değişiklik kontrol edilip kaydediliyor.`,
    );
    setCommandNotice(null);

    try {
      const result = await commitManagementWorkspaceV1(
        session.accessToken,
        prepared.payload,
      );

      // The successful DB commit becomes the new local baseline immediately.
      // Do not wait for the broad management refresh, otherwise the short-lived
      // draft revision cache or stale inspector state can make the previous
      // placement look like the baseline for the next edit.
      invalidateManagementDraftRevisionCache();

      const [freshSnapshot, freshBoard] = await Promise.all([
        fetchManagementWorkspaceSnapshotV1(
          session.accessToken,
          result.revisionId,
        ),
        fetchManagementBoard(session.accessToken),
      ]);

      if (
        !freshBoard
        || freshSnapshot.identity.snapshotHash !== result.snapshotHash
        || freshSnapshot.identity.baselineHash !== result.baselineHash
      ) {
        throw new Error(
          'Kaydedilen programın güncel hali yeniden okunamadı. Değişiklikler kaydedildi; ekranı yenileyin.',
        );
      }

      const freshWorkingCopy =
        createManagementWorkspaceWorkingCopyV1(freshSnapshot);

      workspaceSnapshotRef.current = freshSnapshot;
      workspaceWorkingCopyRef.current = freshWorkingCopy;
      workspaceHistoryRef.current = createManagementWorkspaceHistoryV1();
      serverBoardRef.current = freshBoard;

      setBoard(
        projectManagementBoardFromWorkspaceV1(
          freshBoard,
          freshWorkingCopy,
          freshSnapshot,
        ),
      );
      setWorkspaceDirty(false);
      setCommandState({ undo: null, redo: null });

      // Candidate/inspector state belongs to the previous baseline and must not
      // leak into the next edit.
      setCandidateFocus(null);
      setCandidateDetail(null);
      setCandidateError(null);
      setCandidateLoading(false);
      setDragCandidateDetails({});
      setDragLoading(false);
      dragCardIdsRef.current = [];
      setDragCardIds([]);

      setCommandNotice({
        kind: 'success',
        text: [
          result.changedCardCount > 0
            ? `${result.changedCardCount} program değişikliği`
            : null,
          result.changedRequirementCount > 0
            ? `${result.changedRequirementCount} ders planı değişikliği`
            : null,
          result.changedResourceCount > 0
            ? `${result.changedResourceCount} kaynak değişikliği`
            : null,
          (result.changedStructureCount ?? 0) > 0
            ? `${result.changedStructureCount} ders yapısı değişikliği`
            : null,
        ].filter(Boolean).join(' + ') + ' kaydedildi.',
      });

      // Refresh the secondary management panels after the fresh Program
      // baseline is already established.
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      const raw = reason instanceof Error
        ? reason.message
        : 'Yerel çalışma alanı kaydedilemedi.';
      setCommandNotice({
        kind: 'error',
        text: translateManagementWorkspaceCommitErrorV1(raw),
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  if (status === 'loading') {
    return (
      <main className="management-workbench-root min-h-screen bg-[#F5F3EE]">
        <ManagementBusyOverlay
          title="Partisyon hazırlanıyor"
          steps={[...MANAGEMENT_STARTUP_STEPS]}
          activeStep={startupStep}
        />
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <LoginScreen
        error={error}
        loading={false}
        onSubmit={async (email, password) => {
          setStartupComplete(false);
          setStartupStep(1);
          await login(email, password);
        }}
      />
    );
  }

  if (status === 'forbidden') {
    return (
      <main className="management-workbench-root flex min-h-screen items-center justify-center bg-[#F5F3EE] px-5 py-10 text-slate-900">
        <section className="w-full max-w-[520px] rounded-[28px] border border-amber-200 bg-white p-7 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
            Erişim sınırı
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            Bu hesap Yönetim üyesi değil
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Oturum açıldı ancak aktif Görüntüleyici, Editör veya Yönetici yetkisi bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
          >
            Oturumu kapat
          </button>
        </section>
      </main>
    );
  }

  const projectedCoursePlan = (
    coursePlan
    && workspaceWorkingCopyRef.current
  )
    ? projectManagementCoursePlanFromWorkspaceV1(
      coursePlan,
      workspaceWorkingCopyRef.current,
    )
    : coursePlan;

  const projectedResources = (
    resources
    && workspaceWorkingCopyRef.current
  )
    ? projectManagementResourcesFromWorkspaceV1(
      resources,
      workspaceWorkingCopyRef.current,
      workspaceSnapshotRef.current,
    )
    : resources;

  const visiblePlacedCount = visibleCards.filter((card) => card.placement).length;
  const visibleUnplacedCount = visibleCards.length - visiblePlacedCount;
  const showInspector = inspectorOpen && Boolean(selectedCard);

  const startQuickTour = () => {
    setHelpOpen(false);
    setActiveSection('PROGRAM');
    setPoolOpen(true);
    setTourStep(0);
    setTourOpen(true);
  };

  const changeTourStep = (nextStep: number) => {
    setActiveSection('PROGRAM');

    if (nextStep === 0) {
      setPoolOpen(true);
    }

    if (nextStep === 3 && !showInspector) {
      const tourCard = visibleCards.find((card) => Boolean(card.placement)) ?? null;
      if (tourCard) {
        selectCard(tourCard.id);
      }
    }

    setTourStep(nextStep);
  };

  const dismissQuickTour = () => {
    setTourOpen(false);
    try {
      window.localStorage.setItem('msgsud-management-tour-v1', 'done');
    } catch {
      // Local storage may be unavailable in restricted browser contexts.
    }
  };

  const workbenchColumns = [
    poolOpen ? '260px' : null,
    'minmax(0, 1fr)',
    showInspector ? '300px' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className="management-workbench-root flex h-[100dvh] min-w-[1180px] flex-col overflow-hidden bg-[#F4F2ED] text-slate-900">
      <div className="management-portrait-note">
        Yönetim çalışma alanı yatay ekran için tasarlandı.
      </div>

      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-[60px] items-center gap-6 px-5">
          <div className="flex h-full items-center gap-6">
            <PartisyonBrand compact />

            <nav className="flex h-full items-end gap-1 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveSection('PROGRAM');
                  setProgramResourceFilters([]);
                  setProgramGapFilter(null);
                }}
                className={
                  activeSection === 'PROGRAM'
                    ? 'relative -mb-px inline-flex h-[38px] items-center rounded-t-[11px] border border-slate-200 border-b-white bg-white px-3 text-[12px] font-bold text-slate-950 shadow-[0_-1px_0_rgba(15,23,42,0.02)]'
                    : 'inline-flex h-[36px] items-center rounded-t-[11px] border border-transparent px-3 text-[12px] font-semibold text-slate-400 transition hover:border-slate-100 hover:bg-slate-50/80 hover:text-slate-700'
                }
              >
                Program
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('PLAN')}
                className={
                  activeSection === 'PLAN'
                    ? 'relative -mb-px inline-flex h-[38px] items-center rounded-t-[11px] border border-slate-200 border-b-white bg-white px-3 text-[12px] font-bold text-slate-950 shadow-[0_-1px_0_rgba(15,23,42,0.02)]'
                    : 'inline-flex h-[36px] items-center rounded-t-[11px] border border-transparent px-3 text-[12px] font-semibold text-slate-400 transition hover:border-slate-100 hover:bg-slate-50/80 hover:text-slate-700'
                }
              >
                Ders Planı
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('RESOURCES')}
                className={
                  activeSection === 'RESOURCES'
                    ? 'relative -mb-px inline-flex h-[38px] items-center rounded-t-[11px] border border-slate-200 border-b-white bg-white px-3 text-[12px] font-bold text-slate-950 shadow-[0_-1px_0_rgba(15,23,42,0.02)]'
                    : 'inline-flex h-[36px] items-center rounded-t-[11px] border border-transparent px-3 text-[12px] font-semibold text-slate-400 transition hover:border-slate-100 hover:bg-slate-50/80 hover:text-slate-700'
                }
              >
                Kaynaklar
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('SOLVER')}
                className={
                  activeSection === 'SOLVER'
                    ? 'relative -mb-px inline-flex h-[38px] items-center rounded-t-[11px] border border-slate-200 border-b-white bg-white px-3 text-[12px] font-bold text-slate-950 shadow-[0_-1px_0_rgba(15,23,42,0.02)]'
                    : 'inline-flex h-[36px] items-center rounded-t-[11px] border border-transparent px-3 text-[12px] font-semibold text-slate-400 transition hover:border-slate-100 hover:bg-slate-50/80 hover:text-slate-700'
                }
              >
                Öncelikler
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('STATUS')}
                className={
                  activeSection === 'STATUS'
                    ? 'relative -mb-px inline-flex h-[38px] items-center rounded-t-[11px] border border-slate-200 border-b-white bg-white px-3 text-[12px] font-bold text-slate-950 shadow-[0_-1px_0_rgba(15,23,42,0.02)]'
                    : 'inline-flex h-[36px] items-center rounded-t-[11px] border border-transparent px-3 text-[12px] font-semibold text-slate-400 transition hover:border-slate-100 hover:bg-slate-50/80 hover:text-slate-700'
                }
              >
                Program Durumu
              </button>
            </nav>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-[210px] truncate text-[10px] font-medium text-slate-400 xl:block">
              {session?.email}
              {overview ? ` · Taslak v${overview.versionNumber}` : ''}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">
              {roleLabel(access?.role)}
            </span>
            {access?.canEdit && (
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">
                Düzenleme açık
              </span>
            )}
            {workspaceDirty && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">
                Kaydedilmemiş değişiklik
              </span>
            )}
            {access?.canEdit && workspaceDirty && (
              <button
                type="button"
                onClick={() => void saveWorkspace()}
                disabled={commandBusy || dataLoading}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-50"
                title="Yerel program değişikliklerini tek işlem olarak kaydet"
              >
                Kaydet
              </button>
            )}
            {access?.canEdit && (
              <ManagementHistoryActions
                undoAvailable={(localUndoAvailable || serverUndoAvailable) && !dataLoading}
                redoAvailable={(localRedoAvailable || serverRedoAvailable) && !dataLoading}
                busy={commandBusy || dataLoading}
                undoTitle={localUndoAvailable
                  ? 'Yerel program değişikliğini geri al'
                  : serverUndoAvailable && commandState.undo
                    ? `${commandContextLabel(commandState.undo, board)}${commandState.undo.bundleSize > 1 ? ` · ${commandState.undo.bundleSize} kayıt` : ''}${commandState.undo.autoCount > 0 ? ` + ${commandState.undo.autoCount} otomatik` : ''} geri al`
                    : 'Geri alınabilecek işlem yok'}
                redoTitle={localRedoAvailable
                  ? 'Yerel program değişikliğini yeniden uygula'
                  : serverRedoAvailable && commandState.redo
                    ? `${commandContextLabel(commandState.redo, board)}${commandState.redo.bundleSize > 1 ? ` · ${commandState.redo.bundleSize} kayıt` : ''}${commandState.redo.autoCount > 0 ? ` + ${commandState.redo.autoCount} otomatik` : ''} yeniden uygula`
                    : 'Yinelenecek işlem yok'}
                onUndo={() => void runUndo()}
                onRedo={() => void runRedo()}
              />
            )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Partisyon yardım merkezini aç"
            >
              ? Yardım
            </button>
            <button
              type="button"
              onClick={() => {
                if (workspaceDirty) {
                  setCommandNotice({
                    kind: 'info',
                    text: 'Kaydedilmemiş değişiklikler var. Yenilemeden önce değişiklikleri kaydedin veya Geri Al ile geri alın.',
                  });
                  return;
                }
                setRefreshToken((value) => value + 1);
              }}
              disabled={dataLoading}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {dataLoading ? 'Yenileniyor…' : 'Yenile'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (workspaceDirty) {
                  setCommandNotice({
                    kind: 'info',
                    text: 'Kaydedilmemiş değişiklikler var. Çıkmadan önce değişiklikleri kaydedin veya Geri Al ile geri alın.',
                  });
                  return;
                }
                void logout();
              }}
              className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-slate-800"
            >
              Çıkış
            </button>
          </div>
        </div>

        {activeSection === 'PROGRAM' && (
          <div className="flex h-[50px] min-w-0 items-center gap-2 border-t border-slate-100 px-3">
            <button
              type="button"
              onClick={() => setPoolOpen((value) => !value)}
              onDragOver={(event) => {
                if (!dragCard || !dragCard.placement || commandBusy) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!dragCard || !dragCard.placement || commandBusy) return;
                event.preventDefault();
                returnDraggedCardsToPool();
              }}
              className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                dragCard?.placement
                  ? 'border-[#A63D48] bg-[#A63D48]/10 text-[#A63D48] ring-2 ring-[#A63D48]/15'
                  : poolOpen
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {dragCard?.placement
                ? 'Havuza bırak · programdan kaldır'
                : `Ders Havuzu · ${visibleUnplacedCount}`}
            </button>
  
            <div className="flex rounded-xl border border-slate-200 bg-white p-1">
              {STAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStage(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                    stage === item.id
                      ? 'bg-[#A63D48] text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
  
            <div className="flex rounded-xl border border-slate-200 bg-white p-1">
              {AUDIENCE_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAudienceFilter(item.id)}
                  className={`flex h-[32px] min-w-[42px] items-center justify-center rounded-lg px-3 font-bold transition ${
                    item.id === 'ALL' ? 'text-[10px]' : 'text-[18px] leading-none'
                  } ${
                    audienceFilter === item.id
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title={item.title}
                  aria-label={item.title}
                >
                  {item.label}
                </button>
              ))}
            </div>
  
            <div className="flex rounded-xl bg-slate-100 p-1">
              {DAYS.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setActiveDay(day.id)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                    activeDay === day.id
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title={DAY_LONG[day.id]}
                >
                  {day.label}
                </button>
              ))}
            </div>
  
            <div className="mx-auto flex rounded-xl border border-slate-200 bg-white p-1">
              {RESOURCE_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setResourceView(view.id)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                    resourceView === view.id
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
  
            {(visibleMissingTeacherCards.length > 0
              || visibleMissingRoomCards.length > 0
              || Boolean(programGapFilter)) && (
              <div className="flex shrink-0 items-center gap-1">
                {(visibleMissingTeacherCards.length > 0 || programGapFilter === 'TEACHER') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (programGapFilter === 'TEACHER') {
                        setProgramGapFilter(null);
                        return;
                      }
                      openOperationalGap('TEACHER');
                    }}
                    className={`rounded-xl border px-2.5 py-2 text-[9px] font-black transition ${
                      programGapFilter === 'TEACHER'
                        ? 'border-rose-700 bg-rose-700 text-white'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                    title="Öğretmensiz yerleşimleri göster"
                  >
                    Öğretmensiz · {visibleMissingTeacherCards.length}
                  </button>
                )}
                {(visibleMissingRoomCards.length > 0 || programGapFilter === 'ROOM') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (programGapFilter === 'ROOM') {
                        setProgramGapFilter(null);
                        return;
                      }
                      openOperationalGap('ROOM');
                    }}
                    className={`rounded-xl border px-2.5 py-2 text-[9px] font-black transition ${
                      programGapFilter === 'ROOM'
                        ? 'border-amber-700 bg-amber-700 text-white'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                    title="Salonsuz yerleşimleri göster"
                  >
                    Salonsuz · {visibleMissingRoomCards.length}
                  </button>
                )}
              </div>
            )}

            {programGapFilter && orderedOperationalGapCards.length > 0 && (
              <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => stepOperationalGap(-1)}
                  className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  title="Önceki eksik kayıt"
                >
                  ‹
                </button>
                <span className="min-w-[44px] px-1 text-center text-[9px] font-black text-slate-600">
                  {selectedOperationalGapIndex >= 0
                    ? selectedOperationalGapIndex + 1
                    : 1}
                  {' / '}
                  {orderedOperationalGapCards.length}
                </span>
                <button
                  type="button"
                  onClick={() => stepOperationalGap(1)}
                  className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  title="Sonraki eksik kayıt"
                >
                  ›
                </button>
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2 text-[9px] font-semibold text-slate-500 max-[1360px]:hidden">
              {programResourceFilters.length > 0 || programGapFilter ? (
                <>
                  <span>{programCards.length} yerleşim</span>
                  <span className="text-slate-300">·</span>
                  <span>{programGapFilter ? 'eksik kaynak filtresi' : 'kaynak filtresi'}</span>
                </>
              ) : (
                <>
                  <span>{visiblePlacedCount} yerleşmiş</span>
                  <span className="text-slate-300">·</span>
                  <span>{visibleUnplacedCount} havuzda</span>
                  <span className="text-slate-300">·</span>
                  <span>{overview?.activeMoveCount ?? 0} işlem</span>
                </>
              )}
            </div>
  
            <button
              type="button"
              onClick={() => setPlacementAssistantOpen(true)}
              disabled={dataLoading || commandBusy}
              className="shrink-0 whitespace-nowrap rounded-xl border border-[#A63D48]/25 bg-white px-3 py-2 text-[10px] font-black text-[#A63D48] transition hover:border-[#A63D48]/45 hover:bg-[#A63D48]/5 disabled:cursor-not-allowed disabled:opacity-35"
              title="Tek seçenekli dersler için güvenli yerleşim önerileri"
            >
              ✦ Asistan
            </button>

            {selectedCard && !showInspector && (
              <button
                type="button"
                onClick={() => setInspectorOpen(true)}
                className="max-w-[150px] truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Ayrıntılar · {selectedCard.subjectName}
              </button>
            )}
  
          </div>
        )}
      </header>

      {dataError && (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {dataError}
        </div>
      )}

      {commandNotice && (activeSection !== 'PROGRAM' || !showInspector) && (
        <div className="fixed right-4 top-20 z-[96] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,0.18)]">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                commandNotice.kind === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : commandNotice.kind === 'error'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {commandNotice.kind === 'success'
                ? '✓'
                : commandNotice.kind === 'error'
                  ? '!'
                  : 'i'}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-900">
                {commandNotice.kind === 'success'
                  ? 'İşlem tamamlandı'
                  : commandNotice.kind === 'error'
                    ? 'İşlem tamamlanamadı'
                    : 'Bilgi'}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-slate-600">
                {commandNotice.text}
              </p>

              {commandNotice.kind === 'success'
                && !workspaceOwnsStructureHistory
                && commandState.undo?.action === 'STRUCTURE' && (
                <button
                  type="button"
                  onClick={() => void runUndo()}
                  disabled={commandBusy}
                  className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  ↶ Ders yapısı değişikliğini geri al
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCommandNotice(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              aria-label="Bildirimi kapat"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {programFilterMenu && (
        <div
          className="fixed z-[124] w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
          style={{ left: programFilterMenu.x, top: programFilterMenu.y }}
          role="dialog"
          aria-label="Program kaynak filtresi"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Filtre ekle
              </p>
              <p className="mt-0.5 text-[12px] font-black text-slate-900">
                Öğretmen ve salon
              </p>
              <p className="mt-1 text-[9px] font-medium leading-4 text-slate-500">
                Çoklu seçimlerin nasıl birleşeceğini aşağıdaki eşleşme modundan seçin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setProgramFilterMenu(null)}
              className="rounded-lg px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Filtre menüsünü kapat"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 pt-3">
            <button
              type="button"
              onClick={() => setProgramFilterMode('ANY')}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                programFilterMode === 'ANY'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block text-[10px] font-black">
                Herhangi biri · VEYA
              </span>
              <span className={`mt-0.5 block text-[9px] font-medium leading-4 ${
                programFilterMode === 'ANY' ? 'text-slate-300' : 'text-slate-500'
              }`}>
                Seçilen öğretmen veya salonlardan herhangi biri eşleşsin.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setProgramFilterMode('INTERSECTION')}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                programFilterMode === 'INTERSECTION'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block text-[10px] font-black">
                Kesişim · VE
              </span>
              <span className={`mt-0.5 block text-[9px] font-medium leading-4 ${
                programFilterMode === 'INTERSECTION' ? 'text-slate-300' : 'text-slate-500'
              }`}>
                Öğretmen grubundan biri ve salon grubundan biri aynı derste eşleşsin.
              </span>
            </button>
          </div>

          <div className="px-4 pt-3">
            <input
              autoFocus
              type="search"
              value={programFilterQuery}
              onChange={(event) => setProgramFilterQuery(event.target.value)}
              placeholder="Öğretmen veya salon ara…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Öğretmenler
                </p>
                <span className="text-[9px] font-bold text-slate-400">
                  {programTeacherFilterOptions.length}
                </span>
              </div>
              <div className="management-scrollbar max-h-[255px] space-y-1 overflow-y-auto pr-1">
                {programTeacherFilterOptions.map((option) => {
                  const selected = programResourceFilters.some(
                    (filter) => filter.kind === 'TEACHER' && filter.id === option.id,
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleProgramResourceFilter(
                        'TEACHER',
                        option.id,
                        option.label,
                      )}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[10px] font-bold transition ${
                        selected
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="shrink-0 text-[10px]">
                        {selected ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
                {programTeacherFilterOptions.length === 0 && (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-[10px] font-semibold text-slate-400">
                    Eşleşen öğretmen yok.
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Salonlar
                </p>
                <span className="text-[9px] font-bold text-slate-400">
                  {programRoomFilterOptions.length}
                </span>
              </div>
              <div className="management-scrollbar max-h-[255px] space-y-1 overflow-y-auto pr-1">
                {programRoomFilterOptions.map((option) => {
                  const selected = programResourceFilters.some(
                    (filter) => filter.kind === 'ROOM' && filter.id === option.id,
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleProgramResourceFilter(
                        'ROOM',
                        option.id,
                        option.label,
                      )}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[10px] font-bold transition ${
                        selected
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="shrink-0 text-[10px]">
                        {selected ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
                {programRoomFilterOptions.length === 0 && (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-[10px] font-semibold text-slate-400">
                    Eşleşen salon yok.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-[9px] font-semibold text-slate-400">
              {programResourceFilters.length} filtre seçili · {programFilterMode === 'ANY' ? 'VEYA' : 'VE'}
            </span>
            <button
              type="button"
              onClick={() => setProgramResourceFilters([])}
              disabled={programResourceFilters.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-35"
            >
              Tüm filtreleri temizle
            </button>
          </div>
        </div>
      )}

      {cardContextMenu && (
        <div
          className="fixed z-[120] w-[168px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
          style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
          role="menu"
          aria-label="Ders kartı işlemleri"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => openCardInspector(
              cardContextMenu.cardId,
              cardContextMenu.cardIds,
              'DETAILS',
            )}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <span aria-hidden="true">✎</span>
            Düzenle
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openCardInspector(
              cardContextMenu.cardId,
              cardContextMenu.cardIds,
              'CANDIDATES',
            )}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <span aria-hidden="true">↔</span>
            Alternatif yerler
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!access?.canEdit || commandBusy}
            onClick={() => openCardInspector(
              cardContextMenu.cardId,
              cardContextMenu.cardIds,
              'TEACHER',
            )}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true">Ö</span>
            Öğretmeni değiştir
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!access?.canEdit || commandBusy}
            onClick={() => openCardInspector(
              cardContextMenu.cardId,
              cardContextMenu.cardIds,
              'ROOM',
            )}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true">S</span>
            Salonu değiştir
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!access?.canEdit || commandBusy}
            onClick={() => {
              setSelectedCardId(cardContextMenu.cardId);
              setSelectedCardIds(cardContextMenu.cardIds);
              setCandidateFocus(null);
              setCardContextMenu(null);
              setRemoveConfirmOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true">×</span>
            Kaldır
          </button>
        </div>
      )}

      {activeSection === 'PROGRAM' ? (
        <section
          className="grid min-h-0 flex-1 gap-2.5 p-2.5"
          style={{ gridTemplateColumns: workbenchColumns }}
        >
          {poolOpen && (
            <ManagementCardPool
              cards={visibleCards}
              totalUnplaced={overview?.unplacedCount ?? visibleUnplacedCount}
              selectedCardId={selectedCardId}
              onSelect={selectCard}
              onClose={() => setPoolOpen(false)}
              canEdit={access?.canEdit === true}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
              returnDropActive={Boolean(dragCard?.placement) && !commandBusy}
              onReturnDrop={returnDraggedCardsToPool}
            />
          )}
  
          <div
            data-tour-target="program-area"
            className="flex min-h-0 min-w-0 flex-col"
          >
            <div
              className="mb-2 flex h-8 shrink-0 items-center justify-between px-1"
              onContextMenu={(event) => {
                event.preventDefault();
                openProgramFilterMenu(event.clientX, event.clientY);
              }}
              title="Sağ tıklayarak öğretmen / salon filtresi ekleyin"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {RESOURCE_VIEWS.find((view) => view.id === resourceView)?.label}
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} · {DAY_LONG[activeDay]}
                </span>
                {programResourceFilters.map((filter) => (
                  <button
                    key={`${filter.kind}:${filter.id}`}
                    type="button"
                    onClick={() => toggleProgramResourceFilter(
                      filter.kind,
                      filter.id,
                      filter.label,
                    )}
                    className="max-w-[220px] shrink-0 truncate rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700 hover:bg-blue-100"
                    title={`${filter.label} filtresini kaldır`}
                  >
                    {filter.kind === 'TEACHER' ? 'Öğretmen' : 'Salon'} · {filter.label} ×
                  </button>
                ))}
              </div>
  
              <span className="shrink-0 text-[9px] font-medium text-slate-400">
                {programCards.length} kart · {rows.length} kaynak satırı
              </span>
            </div>
  
            <ManagementBoardGrid
              rows={rows}
              cards={programCards}
              view={resourceView}
              activeDay={activeDay}
              selectedCardId={selectedCardId}
              onSelect={selectCard}
              canEdit={access?.canEdit === true}
              dragCard={dragCard}
              dragCardIds={dragCardIds}
              dragStartOffsetsByCardId={dragStartOffsetsByCardId}
              dragCandidateDetails={dragCandidateDetails}
              dragLoading={dragLoading}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
              validateDropTarget={(target) => {
                if (
                  target.state !== 'VALID'
                  || !target.groupCandidates
                  || target.groupCandidates.length === 0
                ) {
                  return target;
                }

                const localSnapshot = workspaceSnapshotRef.current;
                const localWorkingCopy = workspaceWorkingCopyRef.current;

                if (!localSnapshot || !localWorkingCopy) {
                  return target;
                }

                const preview = previewManagementWorkspaceCommandsV1(
                  localSnapshot,
                  localWorkingCopy,
                  target.groupCandidates.map(({ cardId, candidate }) => ({
                    type: 'SET_PLACEMENT' as const,
                    placement: {
                      cardId,
                      dayOfWeek: candidate.dayOfWeek,
                      startPeriod: candidate.startPeriod,
                      teacherId: candidate.teacherId,
                      roomId: candidate.roomId,
                    },
                  })),
                );

                if (preview.applied) {
                  return target;
                }

                return {
                  ...target,
                  state: 'INVALID' as const,
                  validCandidates: [],
                  reasonCodes: Array.from(new Set(
                    preview.issues.map((issue) => issue.code),
                  )),
                };
              }}
              onDropCandidates={(moves) => {
                endDrag();
                void runDropCandidates(moves);
              }}
              onDropNeedsAttention={(target) => {
                endDrag();
                void handleDropNeedsAttention(target);
              }}
              onCardContextMenu={openCardContextMenu}
            />
          </div>
  
          {showInspector && (
            <div
              ref={inspectorPanelRef}
              tabIndex={-1}
              className="h-full min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
              aria-label="Ders ayrıntıları"
            >
            <ManagementInspector
              card={inspectorCard}
              cardIds={selectedCardIds}
              candidateDetail={locallyValidatedCandidateDetail}
              candidateLoading={candidateLoading}
              candidateError={candidateError}
              candidateFocus={locallyValidatedCandidateFocus}
              teacherNamesById={board?.teacherNamesById ?? {}}
              roomNamesById={board?.roomNamesById ?? {}}
              planRow={
                selectedCard
                  ? projectedCoursePlan?.rows.find(
                    (row) => row.requirementId === selectedCard.requirementId,
                  ) ?? null
                  : null
              }
              planStage={stage}
              teacherOptions={coursePlan?.teacherOptions ?? []}
              roomOptions={coursePlan?.roomOptions ?? []}
              roomCapabilityOptions={coursePlan?.roomCapabilityOptions ?? []}
              canEdit={access?.canEdit === true}
              commandBusy={commandBusy}
              commandNotice={commandNotice}
              openIntent={inspectorIntent}
              openIntentNonce={inspectorIntentNonce}
              onCandidateAction={(candidate) => {
                void runSelectedCandidateAction(candidate);
              }}
              onPreviewPlacementResource={async (
                cardIds,
                resourceType,
                resourceId,
              ) => {
                if (!session || !access?.canEdit) {
                  throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
                }

                const localSnapshot = workspaceSnapshotRef.current;
                const localWorkingCopy = workspaceWorkingCopyRef.current;

                if (!localSnapshot || !localWorkingCopy) {
                  throw new Error('Yerel çalışma alanı hazır değil.');
                }

                return prepareManagementWorkspaceResourceEditV1(
                  localSnapshot,
                  localWorkingCopy,
                  cardIds,
                  resourceType,
                  resourceId,
                ).preview;
              }}
              onApplyPlacementResource={async (
                cardIds,
                resourceType,
                resourceId,
                expectedStateToken,
              ) => {
                if (!session || !access?.canEdit) {
                  throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
                }

                const localSnapshot = workspaceSnapshotRef.current;
                const localWorkingCopy = workspaceWorkingCopyRef.current;
                const localHistory = workspaceHistoryRef.current;
                const serverBoard = serverBoardRef.current;

                if (
                  !localSnapshot
                  || !localWorkingCopy
                  || !localHistory
                  || !serverBoard
                ) {
                  throw new Error('Yerel çalışma alanı hazır değil.');
                }

                const prepared = prepareManagementWorkspaceResourceEditV1(
                  localSnapshot,
                  localWorkingCopy,
                  cardIds,
                  resourceType,
                  resourceId,
                );

                if (prepared.preview.stateToken !== expectedStateToken) {
                  throw new Error(
                    'Kaynak değişikliği önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
                  );
                }

                if (!prepared.preview.canApply || prepared.commands.length === 0) {
                  throw new Error('Kaynak değişikliği artık uygulanamıyor.');
                }

                const result = executeManagementWorkspaceCommandsV1(
                  localSnapshot,
                  localWorkingCopy,
                  localHistory,
                  prepared.commands,
                );

                if (!result.applied) {
                  throw new Error(
                    result.issues.length > 0
                      ? `Kaynak değişikliği uygulanamıyor: ${workspaceIssueSummary(
                        result.issues.map((issue) => issue.code),
                      )}.`
                      : 'Kaynak değişikliği uygulanamıyor.',
                  );
                }

                setBoard(
                  projectManagementBoardFromWorkspaceV1(
                    serverBoard,
                    localWorkingCopy,
                    localSnapshot,
                  ),
                );
                setWorkspaceDirty(
                  diffManagementWorkspaceV1(
                    localSnapshot,
                    localWorkingCopy,
                  ).hasChanges,
                );
                setCandidateFocus(null);
                setCandidateDetail(null);

                setCommandNotice({
                  kind: 'success',
                  text: resourceType === 'TEACHER'
                    ? `${prepared.preview.affectedCardCount} yerleşimde öğretmen yerel olarak güncellendi.`
                    : `${prepared.preview.affectedCardCount} yerleşimde salon yerel olarak güncellendi.`,
                });
              }}
              onUpdatePlanTeachers={async (requirementId, teacherIds) => {
                await updateLocalRequirementTeachers(
                  requirementId,
                  teacherIds,
                );
              }}
              onUpdatePlanRoomStrategy={async (
                requirementId,
                strategy,
                roomIds,
                requiredCapability,
              ) => {
                await updateLocalRequirementRoomStrategy(
                  requirementId,
                  strategy,
                  roomIds,
                  requiredCapability,
                );
              }}
              onRemove={requestRemove}
              onClose={() => setInspectorOpen(false)}
            />
            </div>
          )}
        </section>
      ) : activeSection === 'PLAN' ? (
        <ManagementCoursePlan
          data={projectedCoursePlan}
          canEdit={access?.canEdit === true}
          onOpenProgram={(requirementId, planStage: ManagementPlanStage) => {
            const card = board?.cards.find(
              (item) => item.requirementId === requirementId,
            );

            setStage(planStage);
            setProgramResourceFilters([]);
            setProgramGapFilter(null);
            setActiveSection('PROGRAM');

            if (card) {
              setSelectedCardId(card.id);
              setSelectedCardIds([card.id]);
              setInspectorOpen(true);
              setCandidateFocus(null);
              if (card.placement) {
                setActiveDay(card.placement.dayOfWeek);
              }
            }
          }}
          onUpdateTeachers={async (requirementId, teacherIds) => {
            await updateLocalRequirementTeachers(
              requirementId,
              teacherIds,
            );
          }}
          onUpdateTeacherPolicyPreview={async (
            requirementId,
            scope,
            continuity,
          ) => previewLocalRequirementTeacherPolicy(
            requirementId,
            scope,
            continuity,
          )}
          onUpdateTeacherPolicy={async (
            requirementId,
            scope,
            continuity,
            expectedStateToken,
          ) => {
            await applyLocalRequirementTeacherPolicy(
              requirementId,
              scope,
              continuity,
              expectedStateToken,
            );
          }}
          onPreviewTeacherReconciliation={async (
            requirementId,
            teacherId,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return prepareManagementWorkspaceTeacherReconciliationV1(
              localSnapshot,
              localWorkingCopy,
              requirementId,
              teacherId,
            ).preview;
          }}
          onApplyTeacherReconciliation={async (
            requirementId,
            teacherId,
            expectedStateToken,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;
            if (
              !access?.canEdit
              || !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceTeacherReconciliationV1(
              localSnapshot,
              localWorkingCopy,
              requirementId,
              teacherId,
            );
            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Öğretmen uzlaştırma önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.',
              );
            }
            if (!prepared.preview.canApply) {
              throw new Error(
                'Bu öğretmenle blokları mevcut gün, saat ve salonlarda uzlaştırmak mümkün değil.',
              );
            }

            const result = executeManagementWorkspaceCommandsV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.commands,
            );
            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Öğretmen uzlaştırması uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Öğretmen uzlaştırması uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );
            setCandidateFocus(null);
            setCandidateDetail(null);
            setCommandNotice({
              kind: 'success',
              text: `${prepared.preview.changedBlockCount} blok yerel çalışma alanında aynı öğretmenle uzlaştırıldı. Gün, saat ve salonlar korundu; ana Kaydet ile veritabanına yazılacak.`,
            });
          }}
          onPreviewCoordinatedTeacherReconciliation={async (assignments) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(
              localSnapshot,
              localWorkingCopy,
              assignments,
            ).preview;
          }}
          onApplyCoordinatedTeacherReconciliation={async (
            assignments,
            expectedStateToken,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;
            if (
              !access?.canEdit
              || !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared =
              prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(
                localSnapshot,
                localWorkingCopy,
                assignments,
              );
            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Koordineli öğretmen planı önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.',
              );
            }
            if (!prepared.preview.canApply) {
              throw new Error(
                'Bu öğretmen dağılımı mevcut programda güvenli biçimde uygulanamıyor.',
              );
            }

            const result = executeManagementWorkspaceCommandsV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.commands,
            );
            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Koordineli öğretmen planı uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Koordineli öğretmen planı uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );
            setCandidateFocus(null);
            setCandidateDetail(null);
            setCommandNotice({
              kind: 'success',
              text: `${prepared.preview.changedBlockCount} blokta öğretmen dağılımı yerel çalışma alanında uzlaştırıldı. Gün, saat ve salonlar korundu; ana Kaydet ile veritabanına yazılacak.`,
            });
          }}
          onUpdateRoomStrategy={async (
            requirementId,
            strategy,
            roomIds,
            requiredCapability,
          ) => {
            await updateLocalRequirementRoomStrategy(
              requirementId,
              strategy,
              roomIds,
              requiredCapability,
            );
          }}
          onPreviewStructure={async (input) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return previewManagementWorkspaceRequirementStructureV1(
              localSnapshot,
              localWorkingCopy,
              input,
            );
          }}
          onApplyStructure={async (input, expectedStructureToken) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;
            if (
              !access?.canEdit
              || !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceRequirementStructureV1(
              localSnapshot,
              localWorkingCopy,
              input,
              expectedStructureToken,
            );
            const result = executeManagementWorkspaceCommandV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.command,
            );

            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Ders yapısı uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Ders yapısı uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );
            setCandidateFocus(null);
            setCandidateDetail(null);
            setCommandNotice({
              kind: 'success',
              text: `Ders yapısı yerel çalışma alanında güncellendi. ${prepared.preview.preservedCards.length} kart korundu, ${prepared.preview.removedCards.length} kart kaldırıldı, ${prepared.preview.createdBlocks.length} yeni kart oluşturuldu; ana Kaydet ile veritabanına yazılacak.`,
            });
          }}
        />
      ) : activeSection === 'RESOURCES' ? (
        <ManagementResources
          data={projectedResources}
          canEdit={access?.canEdit === true}
          onUpdateTeacherName={async (teacherId, displayName) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceTeacherNameEditV1(
              localWorkingCopy,
              teacherId,
              displayName,
            );
            applyLocalInventoryCommand(
              prepared.command,
              `Öğretmen adı yerel çalışma alanında “${prepared.resource.displayName}” olarak güncellendi.`,
            );
          }}
          onUpdateRoomName={async (roomId, displayName) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceRoomNameEditV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              displayName,
            );
            applyLocalInventoryCommand(
              prepared.command,
              `Salon adı yerel çalışma alanında “${prepared.resource.displayName}” olarak güncellendi.`,
            );
          }}
          onCreateTeacher={async (name) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const resourceId = crypto.randomUUID();
            const prepared = prepareManagementWorkspaceResourceCreateV1(
              localWorkingCopy,
              'TEACHER',
              resourceId,
              name,
            );
            applyLocalInventoryCommand(
              prepared.command,
              `Öğretmen “${name.trim()}” yerel çalışma alanına eklendi. Ana Kaydet ile veritabanına yazılacak.`,
            );
          }}
          onCreateRoom={async (name) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const resourceId = crypto.randomUUID();
            const prepared = prepareManagementWorkspaceResourceCreateV1(
              localWorkingCopy,
              'ROOM',
              resourceId,
              name,
            );
            applyLocalInventoryCommand(
              prepared.command,
              `Salon “${name.trim()}” yerel çalışma alanına eklendi. Ana Kaydet ile veritabanına yazılacak.`,
            );
          }}
          onSetTeacherStatus={async (teacherId, operationalStatus) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceTeacherStatusEditV1(
              localWorkingCopy,
              teacherId,
              operationalStatus,
            );
            applyLocalInventoryCommand(
              prepared.command,
              operationalStatus === 'ACTIVE'
                ? 'Öğretmen yerel çalışma alanında atamaya açıldı.'
                : 'Öğretmen yerel çalışma alanında atamaya kapatıldı.',
            );
          }}
          onUpdateTeacherLoadTargets={async (teacherId, input) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const validationError = validateManagementTeacherLoadTargets(input);
            if (validationError) {
              throw new Error(validationError);
            }

            const current = localWorkingCopy.teacherPlanningById[teacherId];
            if (!current) {
              throw new Error('Öğretmen planlama girdisi bulunamadı.');
            }

            const label = [
              input.minimumLoad ?? '–',
              input.targetLoad ?? '–',
              input.maximumLoad ?? '–',
            ].join(' / ');

            applyLocalInventoryCommand(
              {
                type: 'SET_TEACHER_PLANNING',
                planning: {
                  teacherId,
                  minimumLoad: input.minimumLoad,
                  targetLoad: input.targetLoad,
                  maximumLoad: input.maximumLoad,
                },
              },
              (
                input.minimumLoad !== null
                || input.targetLoad !== null
                || input.maximumLoad !== null
              )
                ? `Öğretmen yük hedefleri yerel çalışma alanında ${label} olarak güncellendi. Ana Kaydet ile veritabanına yazılacak.`
                : 'Öğretmen yük hedefleri yerel çalışma alanında temizlendi. Ana Kaydet ile veritabanına yazılacak.',
            );
          }}
          onUpdateTeacherUnavailablePeriods={async (
            teacherId,
            unavailablePeriods,
          ) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const validationError = validateManagementTeacherUnavailablePeriods(
              unavailablePeriods,
            );
            if (validationError) {
              throw new Error(validationError);
            }

            applyLocalInventoryCommand(
              {
                type: 'SET_TEACHER_AVAILABILITY',
                availability: {
                  teacherId,
                  unavailablePeriods,
                },
              },
              unavailablePeriods.length > 0
                ? `${unavailablePeriods.length} uygun olmayan ders saati yerel çalışma alanında güncellendi. Mevcut program otomatik taşınmadı; ana Kaydet ile veritabanına yazılacak.`
                : 'Öğretmenin uygunluk kısıtları yerel çalışma alanında temizlendi. Ana Kaydet ile veritabanına yazılacak.',
            );
          }}
          onPreviewTeacherDeparture={async (teacherId, intent) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            if (intent === 'ARCHIVE') {
              assertServerResourceMutationAllowed();
              return previewManagementTeacherDeparture(
                session.accessToken,
                resources.revisionId,
                teacherId,
              );
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return previewManagementWorkspaceTeacherDepartureV1(
              localSnapshot,
              localWorkingCopy,
              teacherId,
            );
          }}
          onApplyTeacherDeparture={async (
            teacherId,
            mode,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            if (mode === 'ARCHIVE_CLEAR') {
              assertServerResourceMutationAllowed();
              setCommandBusy(true);
              setCommandActivity(
                'Öğretmen kaydı derslerden ayrılıp arşivleniyor.',
              );

              try {
                const result = await applyManagementTeacherDeparture(
                  session.accessToken,
                  resources.revisionId,
                  teacherId,
                  mode,
                  expectedStateToken,
                );
                setCommandNotice({
                  kind: 'success',
                  text: `“${result.teacherName}” aktif kaynaklardan silindi. ${result.placedBlockCount} program bloğu gün/saat/salon korunarak öğretmensiz bırakıldı.`,
                });
                setRefreshToken((value) => value + 1);
              } finally {
                setCommandBusy(false);
                setCommandActivity(null);
              }
              return;
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;
            if (
              !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceTeacherDepartureV1(
              localSnapshot,
              localWorkingCopy,
              teacherId,
              mode,
            );
            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Öğretmen değişikliği önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
              );
            }

            const result = executeManagementWorkspaceCommandsV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.commands,
            );
            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Öğretmen değişikliği uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Öğretmen değişikliği uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );
            setResources((current) => current ? { ...current } : current);
            setCandidateFocus(null);
            setCandidateDetail(null);
            setCommandNotice({
              kind: 'success',
              text: mode === 'INACTIVATE_CLEAR'
                ? `“${prepared.preview.teacherName}” yerel çalışma alanında atamaya kapatıldı. ${prepared.preview.placedBlockCount} program bloğu aynı gün/saat/salonda öğretmensiz bırakıldı. Ana Kaydet ile veritabanına yazılacak.`
                : `“${prepared.preview.teacherName}” yerel çalışma alanında yeni atamalara kapatıldı; mevcut ${prepared.preview.placedBlockCount} program bloğundaki öğretmen korundu. Ana Kaydet ile veritabanına yazılacak.`,
            });
          }}
          onDeleteTeacher={async (teacherId) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceResourceDeleteV1(
              localWorkingCopy,
              'TEACHER',
              teacherId,
            );
            applyLocalInventoryCommand(
              prepared.command,
              'Öğretmen kaydı yerel çalışma alanından kaldırıldı. Ana Kaydet ile veritabanından silinecek.',
            );
          }}
          onPreviewRoomDeparture={async (roomId) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return previewManagementWorkspaceRoomDepartureV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
            );
          }}
          onApplyRoomDeparture={async (
            roomId,
            mode,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            if (mode === 'ARCHIVE_CLEAR') {
              assertServerResourceMutationAllowed();
              setCommandBusy(true);
              setCommandActivity(
                'Salon kaydı derslerden ayrılıp arşivleniyor.',
              );

              try {
                const serverPreview = await previewManagementRoomDeparture(
                  session.accessToken,
                  resources.revisionId,
                  roomId,
                );
                const result = await applyManagementRoomDeparture(
                  session.accessToken,
                  resources.revisionId,
                  roomId,
                  mode,
                  serverPreview.stateToken,
                );

                setCommandNotice({
                  kind: 'success',
                  text: `“${result.roomName}” aktif kaynaklardan silindi. ${result.placedBlockCount} program bloğu gün/saat/öğretmen korunarak salonsuz bırakıldı.`,
                });
                setRefreshToken((value) => value + 1);
              } finally {
                setCommandBusy(false);
                setCommandActivity(null);
              }
              return;
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;
            if (
              !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceRoomDepartureV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              mode,
            );

            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Salon değişikliği önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
              );
            }

            const result = executeManagementWorkspaceCommandsV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.commands,
            );
            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Salon değişikliği uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Salon değişikliği uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );
            setResources((current) => current ? { ...current } : current);
            setCandidateFocus(null);
            setCandidateDetail(null);
            setCommandNotice({
              kind: 'success',
              text: mode === 'OUT_OF_SERVICE_CLEAR'
                ? `“${prepared.preview.roomName}” yerel çalışma alanında kullanım dışına alındı. ${prepared.preview.placedBlockCount} program bloğu aynı gün/saat/öğretmenle salonsuz bırakıldı. Ana Kaydet ile veritabanına yazılacak.`
                : `“${prepared.preview.roomName}” yerel çalışma alanında yeni kullanımlara kapatıldı; mevcut ${prepared.preview.placedBlockCount} program bloğundaki salon korundu. Ana Kaydet ile veritabanına yazılacak.`,
            });
          }}
          onDeleteRoom={async (roomId) => {
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceResourceDeleteV1(
              localWorkingCopy,
              'ROOM',
              roomId,
            );
            applyLocalInventoryCommand(
              prepared.command,
              'Salon kaydı yerel çalışma alanından kaldırıldı. Ana Kaydet ile veritabanından silinecek.',
            );
          }}
          onOpenProgramResource={openResourceInProgram}
          onPreviewRoomProfile={async (
            roomId,
            capabilities,
            knowledgeStatus,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return prepareManagementWorkspaceRoomProfileV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              capabilities,
              knowledgeStatus,
            ).preview;
          }}
          onApplyRoomProfile={async (
            roomId,
            capabilities,
            knowledgeStatus,
            expectedStateToken,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceRoomProfileV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              capabilities,
              knowledgeStatus,
            );
            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Salon özellikleri önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.',
              );
            }
            if (!prepared.preview.canApply) {
              throw new Error(
                'Bu salon değişikliği mevcut bir program yerleşimini geçersiz kıldığı için uygulanamıyor.',
              );
            }

            applyLocalInventoryCommand(
              prepared.command,
              `Salon özellikleri yerel çalışma alanında güncellendi. ${prepared.preview.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden değerlendirilecek; ana Kaydet ile veritabanına yazılacak.`,
            );
          }}
          onPreviewRoomStatus={async (roomId, operationalStatus) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return prepareManagementWorkspaceRoomStatusEditV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              operationalStatus,
            ).preview;
          }}
          onApplyRoomStatus={async (
            roomId,
            operationalStatus,
            expectedStateToken,
          ) => {
            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            if (!access?.canEdit || !localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceRoomStatusEditV1(
              localSnapshot,
              localWorkingCopy,
              roomId,
              operationalStatus,
            );

            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Salon durumu önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
              );
            }
            if (!prepared.preview.canApply) {
              throw new Error(
                prepared.preview.blockReasons[0] === 'ROOM_INACTIVE'
                  ? 'Salon mevcut programda kullanıldığı için kullanım dışına alınamaz.'
                  : 'Salon durumu uygulanamıyor.',
              );
            }

            const statusLabel = operationalStatus === 'MAINTENANCE'
              ? 'Tadilatta'
              : operationalStatus === 'OUT_OF_SERVICE'
                ? 'Kullanım dışı'
                : 'Aktif';

            applyLocalInventoryCommand(
              prepared.plan.command,
              `Salon durumu yerel çalışma alanında “${statusLabel}” olarak güncellendi.`,
            );
          }}
        />
      ) : activeSection === 'SOLVER' ? (
        <ManagementSolverWorkspacePanel
          key={`solver-${refreshToken}-${solverWorkspace?.preview.snapshotHash ?? 'empty'}`}
          data={solverWorkspace}
          canEdit={access?.canEdit === true && !workspaceLocalSessionActive}
          busy={commandBusy}
          onSave={async (input) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity(
              input.status === 'ACTIVE'
                ? 'Tercih ayarları kullanıma alınıyor.'
                : 'Tercih ayarları kaydediliyor.',
            );

            try {
              const result = await upsertManagementSolverProfile(
                session.accessToken,
                input,
              );
              setCommandNotice({
                kind: 'success',
                text: result.status === 'ACTIVE'
                  ? `“${result.name}” ayarları kullanıma alındı.`
                  : `“${result.name}” ayarları taslak olarak kaydedildi.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onApplyProposal={async (proposal) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Program önerisi güncel programla doğrulanıyor.');

            try {
              const currentWorkspace = await fetchLatestManagementSolverWorkspace(
                session.accessToken,
              );
              const plan = prepareManagementSolverProposalApply(
                proposal,
                currentWorkspace,
              );

              if (!plan.canApply) {
                throw new Error(
                  translateManagementSolverProposalApplyReason(
                    plan.reasons[0] ?? 'UNKNOWN',
                  ),
                );
              }

              const localSnapshot = workspaceSnapshotRef.current;
              const localWorkingCopy = workspaceWorkingCopyRef.current;
              const localHistory = workspaceHistoryRef.current;
              const serverBoard = serverBoardRef.current;

              if (
                !localSnapshot
                || !localWorkingCopy
                || !localHistory
                || !serverBoard
              ) {
                throw new Error('Yerel çalışma alanı hazır değil.');
              }

              if (
                localSnapshot.identity.snapshotHash !== proposal.snapshotHash
                || localSnapshot.identity.baselineHash !== proposal.baselineHash
              ) {
                throw new Error(
                  'Programın yerel çalışma alanı öneri oluşturulduktan sonra değişti. Seçeneği yeniden hesaplayın.',
                );
              }

              setCommandActivity(
                `${plan.items.length} ders yerel çalışma alanında doğrulanıyor.`,
              );

              const result = executeManagementWorkspaceCommandsV1(
                localSnapshot,
                localWorkingCopy,
                localHistory,
                buildManagementSolverProposalWorkspaceCommands(plan),
              );

              if (!result.applied) {
                throw new Error(
                  result.issues.length > 0
                    ? `Öneri yerel programa uygulanamıyor: ${workspaceIssueSummary(
                      result.issues.map((issue) => issue.code),
                    )}.`
                    : 'Öneri yerel programa uygulanamıyor.',
                );
              }

              setBoard(
                projectManagementBoardFromWorkspaceV1(
                  serverBoard,
                  localWorkingCopy,
                  localSnapshot,
                ),
              );
              setWorkspaceDirty(
                diffManagementWorkspaceV1(
                  localSnapshot,
                  localWorkingCopy,
                ).hasChanges,
              );

              // Any legacy server descriptor predates the local proposal batch.
              // The proposal now belongs exclusively to shared workspace history.
              setCommandState({ undo: null, redo: null });
              setCommandNotice({
                kind: 'success',
                text: `${plan.items.length} ders için önerilen yerleşim yerel çalışma alanına uygulandı. Ana Kaydet ile veritabanına yazılacak; Geri Al ile tek adımda geri alınabilir.`,
              });
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
        />
      ) : (
        <ManagementProgramStatus
          snapshot={healthSnapshot}
          versionNumber={overview?.versionNumber ?? null}
          stage={stage}
          onStageChange={setStage}
          publicationPreview={publicationPreview}
          publicationGate={publicationGate}
          cards={board?.cards ?? []}
          teacherOptions={coursePlan?.teacherOptions ?? []}
          roomOptions={coursePlan?.roomOptions ?? []}
          canEdit={access?.canEdit === true}
          commandBusy={commandBusy}
          onIssueAction={handleHealthIssueAction}
          onOperationalQueueAction={(kind, cardId) => {
            openOperationalGap(kind, [cardId]);
          }}
          onBulkPreview={async (cardIds, resourceType, resourceId) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;

            if (!localSnapshot || !localWorkingCopy) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            return prepareManagementWorkspaceResourceEditV1(
              localSnapshot,
              localWorkingCopy,
              cardIds,
              resourceType,
              resourceId,
            ).preview;
          }}
          onBulkApply={async (
            cardIds,
            resourceType,
            resourceId,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            const localSnapshot = workspaceSnapshotRef.current;
            const localWorkingCopy = workspaceWorkingCopyRef.current;
            const localHistory = workspaceHistoryRef.current;
            const serverBoard = serverBoardRef.current;

            if (
              !localSnapshot
              || !localWorkingCopy
              || !localHistory
              || !serverBoard
            ) {
              throw new Error('Yerel çalışma alanı hazır değil.');
            }

            const prepared = prepareManagementWorkspaceResourceEditV1(
              localSnapshot,
              localWorkingCopy,
              cardIds,
              resourceType,
              resourceId,
            );

            if (prepared.preview.stateToken !== expectedStateToken) {
              throw new Error(
                'Toplu atama önizlemeden sonra değişti. Lütfen yeniden kontrol edin.',
              );
            }

            if (!prepared.preview.canApply || prepared.commands.length === 0) {
              throw new Error(
                prepared.preview.blockReasons[0]
                  ? translateManagementPlacementResourceBlockReason(
                    prepared.preview.blockReasons[0],
                  )
                  : 'Toplu atama artık uygulanamıyor.',
              );
            }

            const result = executeManagementWorkspaceCommandsV1(
              localSnapshot,
              localWorkingCopy,
              localHistory,
              prepared.commands,
            );

            if (!result.applied) {
              throw new Error(
                result.issues.length > 0
                  ? `Toplu atama uygulanamıyor: ${workspaceIssueSummary(
                    result.issues.map((issue) => issue.code),
                  )}.`
                  : 'Toplu atama uygulanamıyor.',
              );
            }

            setBoard(
              projectManagementBoardFromWorkspaceV1(
                serverBoard,
                localWorkingCopy,
                localSnapshot,
              ),
            );
            setWorkspaceDirty(
              diffManagementWorkspaceV1(
                localSnapshot,
                localWorkingCopy,
              ).hasChanges,
            );

            setCommandNotice({
              kind: 'success',
              text: resourceType === 'TEACHER'
                ? `${prepared.preview.affectedCardCount} yerleşimde öğretmen yerel olarak güncellendi.`
                : `${prepared.preview.affectedCardCount} yerleşimde salon yerel olarak güncellendi.`,
            });

            return {
              applied: true,
              resourceType,
              resourceId,
              resourceName: prepared.preview.resourceName,
              affectedCardCount: prepared.preview.affectedCardCount,
              poolExpansionCount: 0,
              outsidePlanningPoolCount: 0,
              requirementWideExpansionCount:
                prepared.preview.requirementWideExpansionCount,
              planningPoolChanged: false,
              transactionId: prepared.preview.stateToken,
              publishedChanged: false as const,
            };
          }}
        />
      )}

      <ManagementPlacementAssistant
        open={placementAssistantOpen}
        scopeLabel={`${stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} · ${AUDIENCE_FILTERS.find((item) => item.id === audienceFilter)?.title ?? 'Tüm dersler'}`}
        groups={placementAssistantGroups}
        plans={placementAssistantPlans}
        loading={placementAssistantLoading}
        analyzed={placementAssistantAnalyzed}
        stale={placementAssistantStale}
        error={placementAssistantError}
        canEdit={access?.canEdit === true && !workspaceLocalSessionActive}
        commandBusy={commandBusy || placementAssistantImpactChecking}
        refreshing={
          dataLoading
          || placementAssistantWaitingForRefresh
          || placementAssistantImpactChecking
        }
        onAnalyze={() => {
          void analyzePlacementAssistant();
        }}
        onApply={(_group, option) => {
          void applyPlacementAssistantOption(option);
        }}
        onInspect={inspectPlacementAssistantGroup}
        onClose={() => setPlacementAssistantOpen(false)}
      />

      <ManagementHelpCenter
        open={helpOpen}
        activeSection={activeSection}
        onClose={() => setHelpOpen(false)}
        onNavigate={(section) => setActiveSection(section)}
        onStartTour={startQuickTour}
      />

      <ManagementQuickTour
        open={tourOpen}
        step={tourStep}
        onStepChange={changeTourStep}
        onClose={dismissQuickTour}
        onFinish={dismissQuickTour}
      />

      {removeConfirmOpen && selectedCard?.placement && selectedCards.length > 0 && (
        <ManagementConfirmOverlay
          title="Programdan kaldırılsın mı?"
          detail={`${selectedClassLabel || selectedCard.groupName} ${selectedCard.subjectName} ${selectedCards.length > 1 ? `(${selectedCards.length} kayıt)` : ''} mevcut yerleşiminden kaldırılacak ve ders havuzuna geri dönecek.`}
          confirmLabel="Kaldır"
          busy={commandBusy}
          onConfirm={() => {
            void runRemove();
          }}
          onCancel={() => setRemoveConfirmOpen(false)}
        />
      )}

      {!startupComplete && dataLoading && (
        <ManagementBusyOverlay
          title="Partisyon hazırlanıyor"
          steps={[...MANAGEMENT_STARTUP_STEPS]}
          activeStep={startupStep}
        />
      )}

      {commandBusy && (
        <ManagementBusyOverlay
          detail={commandActivity ?? 'Program güncelleniyor.'}
        />
      )}
    </main>
  );
}

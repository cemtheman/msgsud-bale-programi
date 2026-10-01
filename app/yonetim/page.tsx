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
  prepareManagementSolverProposalApply,
  translateManagementSolverProposalApplyReason,
} from '@/lib/managementSolverProposal';
import {
  applyManagementRoomOperationalStatus,
  applyManagementRoomProfile,
  createManagementRoomResource,
  createManagementTeacherResource,
  deleteManagementRoomResource,
  deleteManagementTeacherResource,
  fetchManagementResources,
  previewManagementRoomOperationalStatus,
  previewManagementRoomProfile,
  previewManagementRoomDeparture,
  previewManagementTeacherDeparture,
  applyManagementRoomDeparture,
  applyManagementTeacherDeparture,
  setManagementTeacherOperationalStatus,
  updateManagementRoomDisplayName,
  updateManagementTeacherDisplayName,
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
  attachManagementPlacementAssistantForwardImpacts,
  buildManagementPlacementAssistantGroups,
  buildManagementPlacementAssistantPlan,
  sortManagementPlacementAssistantPlans,
  type ManagementPlacementAssistantGroup,
  type ManagementPlacementAssistantOption,
  type ManagementPlacementAssistantPlan,
  type ManagementPlacementAssistantSlot,
} from '@/lib/managementPlacementAssistant';
import {
  applyManagementRequirementStructure,
  applyManagementRequirementTeacherPolicy,
  applyManagementRequirementTeacherReconciliation,
  applyManagementCoordinatedTeacherReconciliation,
  fetchManagementCoursePlan,
  previewManagementRequirementStructure,
  previewManagementRequirementTeacherPolicy,
  previewManagementRequirementTeacherReconciliation,
  previewManagementCoordinatedTeacherReconciliation,
  updateManagementRequirementRoomStrategy,
  type ManagementCoursePlanData,
  type ManagementPlanStage,
} from '@/lib/managementCoursePlan';
import {
  fetchManagementCommandState,
  fetchManagementSlotBlockers,
  moveManagementCard,
  moveManagementCardBundle,
  placeManagementCard,
  placeManagementCardBundle,
  previewManagementPlacementResourceChange,
  applyManagementPlacementResourceChange,
  applyManagementSolverProposalBundle,
  previewManagementCandidateForwardImpacts,
  redoManagement,
  redoManagementBundle,
  removeManagementCard,
  removeManagementCardBundle,
  refreshManagementCardGroupCandidates,
  undoManagement,
  undoManagementBundle,
  undoManagementCardGroup,
  updateManagementRequirementTeachers,
  type ManagementCommandDescriptor,
  type ManagementCommandState,
  type ManagementForwardImpact,
  type ManagementRootAction,
} from '@/lib/managementCommands';

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

function roleLabel(role: string | null | undefined) {
  if (role === 'ADMIN') return 'Yönetici';
  if (role === 'EDITOR') return 'Editör';
  if (role === 'VIEWER') return 'Görüntüleyici';
  return 'Yetkisiz';
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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A63D48]">
          PARTİSYON
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
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
      setCoursePlan(null);
      setResources(null);
      setSolverWorkspace(null);
      setPublicationPreview(null);
      setPublicationGate(null);
      return;
    }

    let active = true;
    setDataLoading(true);
    setDataError(null);

    Promise.all([
      fetchManagementOverview(session.accessToken),
      fetchManagementBoard(session.accessToken),
      fetchManagementCoursePlan(session.accessToken),
      fetchManagementResources(session.accessToken),
      fetchLatestManagementSolverWorkspace(session.accessToken),
      fetchManagementPublicationPreview(session.accessToken),
      fetchManagementPublicationGate(session.accessToken),
    ])
      .then(async ([
        nextOverview,
        nextBoard,
        nextCoursePlan,
        nextResources,
        nextSolverWorkspace,
        nextPublicationPreview,
        nextPublicationGate,
      ]) => {
        if (!active) return;

        setOverview(nextOverview);
        setBoard(nextBoard);
        setCoursePlan(nextCoursePlan);
        setResources(nextResources);
        setSolverWorkspace(nextSolverWorkspace);
        setPublicationPreview(nextPublicationPreview);
        setPublicationGate(nextPublicationGate);

        if (nextBoard) {
          const nextCommandState = await fetchManagementCommandState(
            session.accessToken,
            nextBoard.revisionId,
          );
          if (active) setCommandState(nextCommandState);
        } else {
          setCommandState({
            undo: null,
            redo: null,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDataError(
          reason instanceof Error
            ? reason.message
            : 'Taslak program verisi alınamadı.',
        );
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken, session, status]);

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
    const detail = await fetchManagementCardCandidates(accessToken, cardId);
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
    if (
      selectedCard
      && (
        !cardMatchesStage(selectedCard, stage)
        || !cardMatchesAudience(selectedCard, audienceFilter)
        || (
          (programResourceFilters.length > 0 || Boolean(programGapFilter))
          && !programCards.some((card) => card.id === selectedCard.id)
        )
      )
    ) {
      setSelectedCardId(null);
      setSelectedCardIds([]);
      setInspectorOpen(false);
    }
  }, [
    audienceFilter,
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
      // still catching up.
      const freshBoard = await fetchManagementBoard(session.accessToken);
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

      // Deliberately sequential: each refresh can be expensive and later
      // M32 phases may add many more pool cards. Avoid a database fan-out.
      for (const group of analyzableGroups) {
        await refreshManagementCardGroupCandidates(
          session.accessToken,
          group.cardIds,
        );

        const entries = await Promise.all(
          group.cardIds.map(async (cardId) => [
            cardId,
            await fetchPolicyAwareCandidates(session.accessToken, cardId, freshBoard),
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
      const impactScenarios = sortedPlans
        .flatMap((plan) => plan.exactOptions)
        .map((option) => ({
          id: option.id,
          items: option.moves.map(({ cardId, candidate }) => ({
            cardId,
            dayOfWeek: candidate.dayOfWeek,
            startPeriod: candidate.startPeriod,
            teacherId: candidate.teacherId,
            roomId: candidate.roomId,
          })),
        }));

      const impacts: ManagementForwardImpact[] = [];
      for (let index = 0; index < impactScenarios.length; index += 60) {
        impacts.push(
          ...await previewManagementCandidateForwardImpacts(
            session.accessToken,
            impactScenarios.slice(index, index + 60),
          ),
        );
      }

      setPlacementAssistantPlans(
        attachManagementPlacementAssistantForwardImpacts(
          sortedPlans,
          impacts,
        ),
      );
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

    const ids = Array.from(new Set(
      sourceCardIds?.length ? sourceCardIds : [cardId],
    ));
    const sequence = dragSequenceRef.current + 1;
    dragSequenceRef.current = sequence;

    setDragCardIds(ids);
    setDragCandidateDetails({});
    setDragLoading(true);
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setSelectedCardIds(ids);
    setCommandNotice(null);

    void refreshManagementCardGroupCandidates(
      session.accessToken,
      ids,
    )
      .then(() => Promise.all(
        ids.map(async (id) => [
          id,
          await fetchPolicyAwareCandidates(session.accessToken, id),
        ] as const),
      ))
      .then((entries) => {
        if (dragSequenceRef.current !== sequence) return;
        setDragCandidateDetails(Object.fromEntries(entries));
      })
      .catch((reason: unknown) => {
        if (dragSequenceRef.current !== sequence) return;
        setDragCardIds([]);
        setDragCandidateDetails({});
        setCommandNotice({
          kind: 'error',
          text: reason instanceof Error
            ? reason.message
            : 'Sürükleme için aday alanı hazırlanamadı.',
        });
        setInspectorOpen(true);
      })
      .finally(() => {
        if (dragSequenceRef.current === sequence) {
          setDragLoading(false);
        }
      });
  };

  const endDrag = () => {
    dragSequenceRef.current += 1;
    setDragCardIds([]);
    setDragCandidateDetails({});
    setDragLoading(false);
  };

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
    if (
      placementAssistantStale
      || placementAssistantLoading
      || placementAssistantWaitingForRefresh
      || commandBusy
      || !access?.canEdit
    ) {
      return;
    }

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
      const details = await Promise.all(
        selectedCardIds.map(async (cardId) => ({
          cardId,
          detail: await fetchPolicyAwareCandidates(session.accessToken, cardId, board),
        })),
      );

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

          return validAtSlot.length === 1
            ? [{ cardId, candidate: validAtSlot[0] }]
            : [];
        },
      );

      if (moves.length !== selectedCardIds.length) {
        setCommandNotice({
          kind: 'error',
          text: 'Bu saat, birleşik dersin tüm sınıfları için tek ve kesin bir hedef oluşturmuyor. Uygun hedefi program üzerinde sürükle-bırak ile seçin.',
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
      const details = await Promise.all(
        cardIds.map(async (cardId) => ({
          cardId,
          detail: await fetchPolicyAwareCandidates(session.accessToken, cardId, board),
        })),
      );

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
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error ? reason.message : 'Kart kaldırılamadı.',
      });
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
    const cardIds = [...dragCardIds];
    endDrag();
    void removeCardsNow(cardIds);
  };

  const runUndo = async () => {
    const descriptor = commandState.undo;

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
    const descriptor = commandState.redo;

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

  if (status === 'loading') {
    return (
      <main className="management-workbench-root flex min-h-screen items-center justify-center bg-[#F5F3EE] text-sm font-semibold text-slate-400">
        Yönetim alanı hazırlanıyor…
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <LoginScreen
        error={error}
        loading={false}
        onSubmit={async (email, password) => {
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
        <div className="flex h-[46px] items-center gap-5 px-5">
          <div className="flex h-full items-center gap-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A63D48]">
              Partisyon
            </span>

            <nav className="flex h-full items-center gap-5">
              <button
                type="button"
                onClick={() => {
                  setActiveSection('PROGRAM');
                  setProgramResourceFilters([]);
                  setProgramGapFilter(null);
                }}
                className={
                  activeSection === 'PROGRAM'
                    ? 'h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950'
                    : 'h-full px-1 text-[12px] font-semibold text-slate-400 hover:text-slate-700'
                }
              >
                Program
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('PLAN')}
                className={
                  activeSection === 'PLAN'
                    ? 'h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950'
                    : 'h-full px-1 text-[12px] font-semibold text-slate-400 hover:text-slate-700'
                }
              >
                Ders Planı
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('RESOURCES')}
                className={
                  activeSection === 'RESOURCES'
                    ? 'h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950'
                    : 'h-full px-1 text-[12px] font-semibold text-slate-400 hover:text-slate-700'
                }
              >
                Kaynaklar
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('SOLVER')}
                className={
                  activeSection === 'SOLVER'
                    ? 'h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950'
                    : 'h-full px-1 text-[12px] font-semibold text-slate-400 hover:text-slate-700'
                }
              >
                Öncelikler
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('STATUS')}
                className={
                  activeSection === 'STATUS'
                    ? 'h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950'
                    : 'h-full px-1 text-[12px] font-semibold text-slate-400 hover:text-slate-700'
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
            {access?.canEdit && (
              <ManagementHistoryActions
                undoAvailable={Boolean(commandState.undo) && !dataLoading}
                redoAvailable={Boolean(commandState.redo) && !dataLoading}
                busy={commandBusy || dataLoading}
                undoTitle={commandState.undo
                  ? `${commandContextLabel(commandState.undo, board)}${commandState.undo.bundleSize > 1 ? ` · ${commandState.undo.bundleSize} kayıt` : ''}${commandState.undo.autoCount > 0 ? ` + ${commandState.undo.autoCount} otomatik` : ''} geri al`
                  : 'Geri alınabilecek işlem yok'}
                redoTitle={commandState.redo
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
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={dataLoading}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {dataLoading ? 'Yenileniyor…' : 'Yenile'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
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
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
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
              dragCandidateDetails={dragCandidateDetails}
              dragLoading={dragLoading}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
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
              card={selectedCard}
              cardIds={selectedCardIds}
              candidateDetail={candidateDetail}
              candidateLoading={candidateLoading}
              candidateError={candidateError}
              candidateFocus={candidateFocus}
              teacherNamesById={board?.teacherNamesById ?? {}}
              roomNamesById={board?.roomNamesById ?? {}}
              planRow={
                selectedCard
                  ? coursePlan?.rows.find(
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
                return previewManagementPlacementResourceChange(
                  session.accessToken,
                  cardIds,
                  resourceType,
                  resourceId,
                );
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

                setCommandBusy(true);
                setCommandActivity(
                  resourceType === 'TEACHER'
                    ? 'Öğretmen değişikliğinin güvenli uygulaması yapılıyor.'
                    : 'Salon değişikliğinin güvenli uygulaması yapılıyor.',
                );

                try {
                  const result = await applyManagementPlacementResourceChange(
                    session.accessToken,
                    cardIds,
                    resourceType,
                    resourceId,
                    expectedStateToken,
                  );
                  setCommandNotice({
                    kind: 'success',
                    text: resourceType === 'TEACHER'
                      ? `Öğretmen “${result.resourceName}” olarak değiştirildi. ${result.affectedCardCount} kart güncellendi.`
                      : `Salon “${result.resourceName}” olarak değiştirildi. ${result.affectedCardCount} kart güncellendi.`,
                  });
                  setRefreshToken((value) => value + 1);
                } finally {
                  setCommandBusy(false);
                  setCommandActivity(null);
                }
              }}
              onUpdatePlanTeachers={async (requirementId, teacherIds) => {
                if (!session || !access?.canEdit) {
                  throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
                }
                setCommandBusy(true);
                setCommandActivity('Dersin öğretmen tanımı güncelleniyor.');
                try {
                  await updateManagementRequirementTeachers(
                    session.accessToken,
                    requirementId,
                    teacherIds,
                  );
                  setCommandNotice({
                    kind: 'success',
                    text: 'Öğretmen tanımı güncellendi; uygun program yerleri yeniden hesaplandı.',
                  });
                  setRefreshToken((value) => value + 1);
                } finally {
                  setCommandBusy(false);
                  setCommandActivity(null);
                }
              }}
              onUpdatePlanRoomStrategy={async (
                requirementId,
                strategy,
                roomIds,
                requiredCapability,
              ) => {
                if (!session || !access?.canEdit) {
                  throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
                }
                setCommandBusy(true);
                setCommandActivity('Dersin salon tanımı güncelleniyor.');
                try {
                  const result = await updateManagementRequirementRoomStrategy(
                    session.accessToken,
                    requirementId,
                    strategy,
                    roomIds,
                    requiredCapability,
                  );
                  setCommandNotice({
                    kind: 'success',
                    text: `Salon tanımı güncellendi. ${result.candidateRebuildCardCount} ders bloğu yeniden değerlendirildi.`,
                  });
                  setRefreshToken((value) => value + 1);
                } finally {
                  setCommandBusy(false);
                  setCommandActivity(null);
                }
              }}
              onRemove={requestRemove}
              onClose={() => setInspectorOpen(false)}
            />
            </div>
          )}
        </section>
      ) : activeSection === 'PLAN' ? (
        <ManagementCoursePlan
          data={coursePlan}
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
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Ders planındaki öğretmen tanımı güncelleniyor.');

            try {
              await updateManagementRequirementTeachers(
                session.accessToken,
                requirementId,
                teacherIds,
              );
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onUpdateTeacherPolicyPreview={async (
            requirementId,
            scope,
            continuity,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRequirementTeacherPolicy(
              session.accessToken,
              requirementId,
              scope,
              continuity,
            );
          }}
          onUpdateTeacherPolicy={async (
            requirementId,
            scope,
            continuity,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Öğretmen kuralı güvenli biçimde güncelleniyor.');

            try {
              await applyManagementRequirementTeacherPolicy(
                session.accessToken,
                requirementId,
                scope,
                continuity,
                expectedStateToken,
              );
              setCommandNotice({
                kind: 'success',
                text: 'Öğretmen kuralı kaydedildi. Mevcut yerleşimler değiştirilmedi.',
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewTeacherReconciliation={async (
            requirementId,
            teacherId,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRequirementTeacherReconciliation(
              session.accessToken,
              requirementId,
              teacherId,
            );
          }}
          onApplyTeacherReconciliation={async (
            requirementId,
            teacherId,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Dersin öğretmeni tüm bloklarda uzlaştırılıyor.');

            try {
              const result = await applyManagementRequirementTeacherReconciliation(
                session.accessToken,
                requirementId,
                teacherId,
                expectedStateToken,
              );
              setCommandNotice({
                kind: 'success',
                text: `${result.changedBlockCount} blok aynı öğretmenle uzlaştırıldı. Gün, saat ve salonlar korundu.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewCoordinatedTeacherReconciliation={async (assignments) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementCoordinatedTeacherReconciliation(
              session.accessToken,
              assignments,
            );
          }}
          onApplyCoordinatedTeacherReconciliation={async (
            assignments,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Birbirine bağlı öğretmen kararları birlikte uygulanıyor.');

            try {
              const result = await applyManagementCoordinatedTeacherReconciliation(
                session.accessToken,
                assignments,
                expectedStateToken,
              );
              setCommandNotice({
                kind: 'success',
                text: `${result.changedBlockCount} blokta öğretmen dağılımı birlikte uzlaştırıldı. Gün, saat ve salonlar korundu.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onUpdateRoomStrategy={async (
            requirementId,
            strategy,
            roomIds,
            requiredCapability,
          ) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Ders planındaki salon seçme yöntemi güncelleniyor.');

            try {
              const result = await updateManagementRequirementRoomStrategy(
                session.accessToken,
                requirementId,
                strategy,
                roomIds,
                requiredCapability,
              );
              setCommandNotice({
                kind: 'success',
                text: strategy === 'CAPABILITY'
                  ? `Salon seçimi “özelliğe göre” olarak güncellendi. ${result.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden hesaplandı.`
                  : strategy === 'SPECIFIC'
                    ? `Salon seçimi güncellendi. ${result.roomCount} ana salon tanımlandı ve ${result.candidateRebuildCardCount} ders bloğu yeniden hesaplandı.`
                    : `Salon bilgisi belirsiz olarak işaretlendi. ${result.candidateRebuildCardCount} ders bloğu yeniden hesaplandı.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewStructure={async (input) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRequirementStructure(
              session.accessToken,
              input,
            );
          }}
          onApplyStructure={async (input, expectedStructureToken) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Ders yapısı güvenli biçimde uygulanıyor.');

            try {
              await applyManagementRequirementStructure(
                session.accessToken,
                input,
                expectedStructureToken,
              );
              setCommandNotice({
                kind: 'success',
                text: 'Ders yapısı güncellendi. Program kartları yeni plana göre yenilendi.',
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
        />
      ) : activeSection === 'RESOURCES' ? (
        <ManagementResources
          data={resources}
          canEdit={access?.canEdit === true}
          onUpdateTeacherName={async (teacherId, displayName) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Öğretmenin taslak adı güncelleniyor.');

            try {
              const result = await updateManagementTeacherDisplayName(
                session.accessToken,
                resources.revisionId,
                teacherId,
                displayName,
              );
              setCommandNotice({
                kind: 'success',
                text: result.overridden
                  ? `Öğretmen adı taslakta “${result.displayName}” olarak güncellendi. Yayınlanan program değişmedi.`
                  : 'Öğretmen adı orijinal yayınlanan ada döndürüldü.',
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onUpdateRoomName={async (roomId, displayName) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Salonun taslak adı güncelleniyor.');

            try {
              const result = await updateManagementRoomDisplayName(
                session.accessToken,
                resources.revisionId,
                roomId,
                displayName,
              );
              setCommandNotice({
                kind: 'success',
                text: result.overridden
                  ? `Salon adı taslakta “${result.displayName}” olarak güncellendi. Yayınlanan program değişmedi.`
                  : 'Salon adı orijinal yayınlanan ada döndürüldü.',
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onCreateTeacher={async (name) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Öğretmen kaydı ekleniyor.');

            try {
              await createManagementTeacherResource(
                session.accessToken,
                resources.revisionId,
                name,
              );
              setCommandNotice({ kind: 'success', text: `Öğretmen “${name}” kaynaklara eklendi.` });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onCreateRoom={async (name) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Salon kaydı ekleniyor.');

            try {
              await createManagementRoomResource(
                session.accessToken,
                resources.revisionId,
                name,
              );
              setCommandNotice({ kind: 'success', text: `Salon “${name}” kaynaklara eklendi.` });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onSetTeacherStatus={async (teacherId, operationalStatus) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Öğretmen durumu güncelleniyor.');

            try {
              const result = await setManagementTeacherOperationalStatus(
                session.accessToken,
                resources.revisionId,
                teacherId,
                operationalStatus,
              );
              setCommandNotice({
                kind: 'success',
                text: operationalStatus === 'ACTIVE'
                  ? `Öğretmen atamaya açıldı. ${result.candidateRebuildCardCount} ders bloğu yeniden değerlendirildi.`
                  : `Öğretmen atamaya kapatıldı. ${result.candidateRebuildCardCount} ders bloğu yeniden değerlendirildi.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewTeacherDeparture={async (teacherId) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementTeacherDeparture(
              session.accessToken,
              resources.revisionId,
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

            setCommandBusy(true);
            setCommandActivity(
              mode === 'ARCHIVE_CLEAR'
                ? 'Öğretmen kaydı derslerden ayrılıp arşivleniyor.'
                : mode === 'INACTIVATE_CLEAR'
                  ? 'Öğretmen derslerden çıkarılıp atamaya kapatılıyor.'
                  : 'Öğretmen yeni atamalara kapatılıyor.',
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
                text: mode === 'ARCHIVE_CLEAR'
                  ? `“${result.teacherName}” aktif kaynaklardan silindi. ${result.placedBlockCount} program bloğu gün/saat/salon korunarak öğretmensiz bırakıldı.`
                  : mode === 'INACTIVATE_CLEAR'
                    ? `“${result.teacherName}” atamaya kapatıldı. ${result.placedBlockCount} program bloğu gün/saat/salon korunarak öğretmensiz bırakıldı.`
                    : `“${result.teacherName}” yeni atamalara kapatıldı; mevcut ${result.placedBlockCount} program bloğundaki öğretmen kaydı korundu.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onDeleteTeacher={async (teacherId) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Kullanılmayan öğretmen kaydı siliniyor.');

            try {
              await deleteManagementTeacherResource(
                session.accessToken,
                resources.revisionId,
                teacherId,
              );
              setCommandNotice({
                kind: 'success',
                text: 'Kullanılmayan öğretmen kaydı silindi.',
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewRoomDeparture={async (roomId) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRoomDeparture(
              session.accessToken,
              resources.revisionId,
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

            setCommandBusy(true);
            setCommandActivity(
              mode === 'ARCHIVE_CLEAR'
                ? 'Salon kaydı derslerden ayrılıp arşivleniyor.'
                : mode === 'OUT_OF_SERVICE_CLEAR'
                  ? 'Salon derslerden çıkarılıp kullanım dışına alınıyor.'
                  : 'Salon yeni kullanımlara kapatılıyor.',
            );

            try {
              const result = await applyManagementRoomDeparture(
                session.accessToken,
                resources.revisionId,
                roomId,
                mode,
                expectedStateToken,
              );

              setCommandNotice({
                kind: 'success',
                text: mode === 'ARCHIVE_CLEAR'
                  ? `“${result.roomName}” aktif kaynaklardan silindi. ${result.placedBlockCount} program bloğu gün/saat/öğretmen korunarak salonsuz bırakıldı.`
                  : mode === 'OUT_OF_SERVICE_CLEAR'
                    ? `“${result.roomName}” kullanım dışına alındı. ${result.placedBlockCount} program bloğu gün/saat/öğretmen korunarak salonsuz bırakıldı.`
                    : `“${result.roomName}” yeni kullanımlara kapatıldı; mevcut ${result.placedBlockCount} program bloğundaki salon kaydı korundu.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onDeleteRoom={async (roomId) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Salon kaydı siliniyor.');

            try {
              await deleteManagementRoomResource(
                session.accessToken,
                resources.revisionId,
                roomId,
              );
              setCommandNotice({ kind: 'success', text: 'Kullanılmayan salon kaydı silindi.' });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onOpenProgramResource={openResourceInProgram}
          onPreviewRoomProfile={async (
            roomId,
            capabilities,
            knowledgeStatus,
          ) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRoomProfile(
              session.accessToken,
              resources.revisionId,
              roomId,
              capabilities,
              knowledgeStatus,
            );
          }}
          onApplyRoomProfile={async (
            roomId,
            capabilities,
            knowledgeStatus,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Salon özellikleri güvenli biçimde uygulanıyor.');

            try {
              const result = await applyManagementRoomProfile(
                session.accessToken,
                resources.revisionId,
                roomId,
                capabilities,
                knowledgeStatus,
                expectedStateToken,
              );
              setCommandNotice({
                kind: 'success',
                text: `Salon özellikleri güncellendi. ${result.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden değerlendirildi.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
          onPreviewRoomStatus={async (roomId, operationalStatus) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            return previewManagementRoomOperationalStatus(
              session.accessToken,
              resources.revisionId,
              roomId,
              operationalStatus,
            );
          }}
          onApplyRoomStatus={async (
            roomId,
            operationalStatus,
            expectedStateToken,
          ) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }

            setCommandBusy(true);
            setCommandActivity('Salon durumu güvenli biçimde uygulanıyor.');

            try {
              const result = await applyManagementRoomOperationalStatus(
                session.accessToken,
                resources.revisionId,
                roomId,
                operationalStatus,
                expectedStateToken,
              );

              const statusLabel = operationalStatus === 'MAINTENANCE'
                ? 'Tadilatta'
                : operationalStatus === 'OUT_OF_SERVICE'
                  ? 'Kullanım dışı'
                  : 'Aktif';

              setCommandNotice({
                kind: 'success',
                text: `Salon durumu “${statusLabel}” olarak güncellendi. ${result.candidateRebuildCardCount} ders bloğunun uygun yerleri yeniden değerlendirildi.`,
              });
              setRefreshToken((value) => value + 1);
            } finally {
              setCommandBusy(false);
              setCommandActivity(null);
            }
          }}
        />
      ) : activeSection === 'SOLVER' ? (
        <ManagementSolverWorkspacePanel
          key={`solver-${refreshToken}-${solverWorkspace?.preview.snapshotHash ?? 'empty'}`}
          data={solverWorkspace}
          canEdit={access?.canEdit === true}
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

              setCommandActivity(
                `${plan.items.length} ders tek işlem olarak güncelleniyor.`,
              );

              await applyManagementSolverProposalBundle(
                session.accessToken,
                {
                  items: plan.items,
                  expectedBaselineHash: proposal.baselineHash,
                },
              );

              // The old history descriptor predates this proposal bundle.
              // Disable it until the refreshed transaction state is loaded.
              setCommandState({ undo: null, redo: null });
              setCommandNotice({
                kind: 'success',
                text: `${plan.items.length} ders için önerilen yerleşim uygulandı. İşlem Geri Al ile tek adımda geri alınabilir.`,
              });
              setRefreshToken((value) => value + 1);
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
          onIssueAction={handleHealthIssueAction}
          onOperationalQueueAction={(kind, cardId) => {
            openOperationalGap(kind, [cardId]);
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
        canEdit={access?.canEdit === true}
        commandBusy={commandBusy}
        refreshing={dataLoading || placementAssistantWaitingForRefresh}
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

      {commandBusy && (
        <ManagementBusyOverlay
          detail={commandActivity ?? 'Program güncelleniyor.'}
        />
      )}
    </main>
  );
}

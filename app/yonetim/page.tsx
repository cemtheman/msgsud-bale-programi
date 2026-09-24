'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { useManagementSession } from '@/hooks/useManagementSession';
import {
  buildManagementRowDisplayCards,
  cardMatchesAudience,
  cardMatchesStage,
  fetchManagementBoard,
  fetchManagementCardCandidates,
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
  applyManagementRoomOperationalStatus,
  applyManagementRoomProfile,
  createManagementRoomResource,
  createManagementTeacherResource,
  deleteManagementRoomResource,
  deleteManagementTeacherResource,
  fetchManagementResources,
  previewManagementRoomOperationalStatus,
  previewManagementRoomProfile,
  setManagementTeacherOperationalStatus,
  updateManagementRoomDisplayName,
  updateManagementTeacherDisplayName,
  type ManagementResourceInventoryData,
} from '@/lib/managementResources';
import { deriveManagementHealth } from '@/lib/managementHealth';
import {
  fetchManagementPublicationGate,
  type ManagementPublicationGateData,
} from '@/lib/managementPublicationGate';
import {
  fetchManagementPublicationPreview,
  type ManagementPublicationPreviewData,
} from '@/lib/managementPublicationPreview';
import {
  applyManagementRequirementStructure,
  fetchManagementCoursePlan,
  previewManagementRequirementStructure,
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
  return 'ders yapısı değişikliği';
}

function commandContextLabel(
  descriptor: ManagementCommandDescriptor | null,
  board: ManagementBoardData | null,
) {
  if (!descriptor) return 'Program işlemi';

  if (descriptor.action === 'STRUCTURE') {
    return 'Ders yapısı değişikliği';
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

  return `${audience} ${card.subjectName} ${actionNoun(descriptor.action)}`;
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
          MSGSÜ Ders Programı
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Yönetim
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Taslak program çalışma alanına erişmek için yönetim hesabınızla giriş yapın.
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
  const [publicationPreview, setPublicationPreview] =
    useState<ManagementPublicationPreviewData | null>(null);
  const [publicationGate, setPublicationGate] =
    useState<ManagementPublicationGateData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [activeSection, setActiveSection] = useState<'PROGRAM' | 'PLAN' | 'RESOURCES' | 'STATUS'>('PROGRAM');
  const [activeDay, setActiveDay] = useState(1);
  const [stage, setStage] = useState<ManagementStage>('ORTAOKUL');
  const [resourceView, setResourceView] =
    useState<ManagementResourceView>('SINIFLAR');
  const [audienceFilter, setAudienceFilter] =
    useState<ManagementAudienceScope>('ALL');

  const [poolOpen, setPoolOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [candidateDetail, setCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
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
  const [commandNotice, setCommandNotice] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !session) {
      setOverview(null);
      setBoard(null);
      setCoursePlan(null);
      setResources(null);
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
      fetchManagementPublicationPreview(session.accessToken),
      fetchManagementPublicationGate(session.accessToken),
    ])
      .then(async ([
        nextOverview,
        nextBoard,
        nextCoursePlan,
        nextResources,
        nextPublicationPreview,
        nextPublicationGate,
      ]) => {
        if (!active) return;

        setOverview(nextOverview);
        setBoard(nextBoard);
        setCoursePlan(nextCoursePlan);
        setResources(nextResources);
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

  const rows = useMemo(
    () => (
      board
        ? managementRowsForView(board, resourceView, stage, audienceFilter)
        : []
    ),
    [audienceFilter, board, resourceView, stage],
  );

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

  const selectCard = (cardId: string, sourceCardIds?: string[]) => {
    const ids = Array.from(new Set(
      sourceCardIds?.length ? sourceCardIds : [cardId],
    ));
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setSelectedCardIds(ids);
    setInspectorOpen(true);
  };

  useEffect(() => {
    if (
      selectedCard
      && (
        !cardMatchesStage(selectedCard, stage)
        || !cardMatchesAudience(selectedCard, audienceFilter)
      )
    ) {
      setSelectedCardId(null);
      setSelectedCardIds([]);
      setInspectorOpen(false);
    }
  }, [audienceFilter, selectedCard, stage]);

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

    fetchManagementCardCandidates(session.accessToken, selectedCardId)
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
  }, [refreshToken, selectedCardId, session, status]);


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
          await fetchManagementCardCandidates(session.accessToken, id),
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
      return;
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
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'İşlem tamamlanamadı.',
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
  };

  const runDropCandidates = async (
    moves: ManagementGroupDropCandidate[],
  ) => {
    if (!session || !access?.canEdit || !board || commandBusy || moves.length === 0) {
      return;
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
      return;
    }

    if (commands.length === 1) {
      await runCandidateCommand(commands[0].candidate, commands[0].card);
      return;
    }

    const placementStates = commands.map(({ card }) => Boolean(card.placement));
    const allPlaced = placementStates.every(Boolean);
    const allUnplaced = placementStates.every((placed) => !placed);

    if (!allPlaced && !allUnplaced) {
      setCommandNotice({
        kind: 'error',
        text: 'Birleşik dersin kayıtları aynı yerleşim durumunda değil. Programı yenileyip tekrar deneyin.',
      });
      return;
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
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error
          ? reason.message
          : 'Birleşik ders işlemi tamamlanamadı.',
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
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
          detail: await fetchManagementCardCandidates(session.accessToken, cardId),
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
          detail: await fetchManagementCardCandidates(session.accessToken, cardId),
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

  const runRemove = async () => {
    if (
      !session
      || !access?.canEdit
      || selectedCards.length === 0
      || !selectedCards.every((card) => Boolean(card.placement))
      || commandBusy
    ) {
      return;
    }

    const cardsBeingRemoved = [...selectedCards];
    const primaryCard = cardsBeingRemoved[0];

    setRemoveConfirmOpen(false);
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
        text: `${selectedClassLabel || primaryCard.groupName} ${primaryCard.subjectName} programdan kaldırıldı ve havuza geri döndü.`,
      });
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error ? reason.message : 'Kart kaldırılamadı.',
      });
    } finally {
      setCommandBusy(false);
      setCommandActivity(null);
    }
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
              Yönetim
            </span>

            <nav className="flex h-full items-center gap-5">
              <button
                type="button"
                onClick={() => setActiveSection('PROGRAM')}
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
          <div className="flex h-[50px] items-center gap-2.5 border-t border-slate-100 px-4">
            <button
              type="button"
              onClick={() => setPoolOpen((value) => !value)}
              className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                poolOpen
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Ders Havuzu · {visibleUnplacedCount}
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
  
            <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-500">
              <span>{visiblePlacedCount} yerleşmiş</span>
              <span className="text-slate-300">·</span>
              <span>{visibleUnplacedCount} havuzda</span>
              <span className="text-slate-300">·</span>
              <span>{overview?.activeMoveCount ?? 0} işlem</span>
            </div>
  
            {selectedCard && !showInspector && (
              <button
                type="button"
                onClick={() => setInspectorOpen(true)}
                className="max-w-[150px] truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Ayrıntılar · {selectedCard.subjectName}
              </button>
            )}
  
            {access?.canEdit ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void runUndo()}
                  disabled={!commandState.undo || commandBusy}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  title={commandState.undo
                    ? `${commandContextLabel(commandState.undo, board)} geri al`
                    : 'Geri alınabilecek işlem yok'}
                >
                  ↶ Geri Al
                </button>
                <button
                  type="button"
                  onClick={() => void runRedo()}
                  disabled={!commandState.redo || commandBusy}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  title={commandState.redo
                    ? `${commandContextLabel(commandState.redo, board)} yeniden uygula`
                    : 'Yinelenecek işlem yok'}
                >
                  ↷ Yinele
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-slate-400">
                Salt okunur
              </span>
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
              <p className="text-[11px] font-black text-slate-900">
                {commandNotice.kind === 'success'
                  ? 'İşlem tamamlandı'
                  : commandNotice.kind === 'error'
                    ? 'İşlem tamamlanamadı'
                    : 'Bilgi'}
              </p>
              <p className="mt-1 text-[10px] font-medium leading-5 text-slate-600">
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
            />
          )}
  
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 flex h-8 shrink-0 items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {RESOURCE_VIEWS.find((view) => view.id === resourceView)?.label}
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} · {DAY_LONG[activeDay]}
                </span>
              </div>
  
              <span className="text-[9px] font-medium text-slate-400">
                {visibleCards.length} kart · {rows.length} kaynak satırı
              </span>
            </div>
  
            <ManagementBoardGrid
              rows={rows}
              cards={visibleCards}
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
            />
          </div>
  
          {showInspector && (
            <ManagementInspector
              card={selectedCard}
              candidateDetail={candidateDetail}
              candidateLoading={candidateLoading}
              candidateError={candidateError}
              candidateFocus={candidateFocus}
              teacherNamesById={board?.teacherNamesById ?? {}}
              roomNamesById={board?.roomNamesById ?? {}}
              canEdit={access?.canEdit === true}
              commandBusy={commandBusy}
              commandNotice={commandNotice}
              onCandidateAction={(candidate) => {
                void runSelectedCandidateAction(candidate);
              }}
              onRemove={requestRemove}
              onClose={() => setInspectorOpen(false)}
            />
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
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }
            await createManagementTeacherResource(session.accessToken, name);
            setCommandNotice({ kind: 'success', text: `Öğretmen “${name}” kaynaklara eklendi.` });
            setRefreshToken((value) => value + 1);
          }}
          onCreateRoom={async (name) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }
            await createManagementRoomResource(session.accessToken, name);
            setCommandNotice({ kind: 'success', text: `Salon “${name}” kaynaklara eklendi.` });
            setRefreshToken((value) => value + 1);
          }}
          onSetTeacherStatus={async (teacherId, operationalStatus) => {
            if (!session || !access?.canEdit || !resources) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }
            const result = await setManagementTeacherOperationalStatus(
              session.accessToken,
              resources.revisionId,
              teacherId,
              operationalStatus,
            );
            setCommandNotice({
              kind: 'success',
              text: operationalStatus === 'ACTIVE'
                ? `Öğretmen yeniden aktif göreve alındı. ${result.candidateRebuildCardCount} ders bloğu yeniden değerlendirildi.`
                : `Öğretmen pasif hale getirildi. ${result.candidateRebuildCardCount} ders bloğu yeniden değerlendirildi.`,
            });
            setRefreshToken((value) => value + 1);
          }}
          onDeleteTeacher={async (teacherId) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }
            await deleteManagementTeacherResource(session.accessToken, teacherId);
            setCommandNotice({ kind: 'success', text: 'Kullanılmayan öğretmen kaydı silindi.' });
            setRefreshToken((value) => value + 1);
          }}
          onDeleteRoom={async (roomId) => {
            if (!session || !access?.canEdit) {
              throw new Error('Bu işlem için düzenleme yetkisi gerekiyor.');
            }
            await deleteManagementRoomResource(session.accessToken, roomId);
            setCommandNotice({ kind: 'success', text: 'Kullanılmayan salon kaydı silindi.' });
            setRefreshToken((value) => value + 1);
          }}
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
      ) : (
        <ManagementProgramStatus
          snapshot={healthSnapshot}
          versionNumber={overview?.versionNumber ?? null}
          stage={stage}
          onStageChange={setStage}
          publicationPreview={publicationPreview}
          publicationGate={publicationGate}
        />
      )}

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

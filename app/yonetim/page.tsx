'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ManagementBoardGrid,
  type ManagementDropTarget,
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
  cardMatchesStage,
  fetchManagementBoard,
  fetchManagementCardCandidates,
  managementRowsForView,
  translateCandidateReason,
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
  fetchManagementResources,
  previewManagementRoomOperationalStatus,
  previewManagementRoomProfile,
  updateManagementRoomDisplayName,
  updateManagementTeacherDisplayName,
  type ManagementResourceInventoryData,
} from '@/lib/managementResources';
import { deriveManagementHealth } from '@/lib/managementHealth';
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
  moveManagementCard,
  placeManagementCard,
  redoManagement,
  removeManagementCard,
  undoManagement,
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

  const audience = card.classCodes.length > 0
    ? card.classCodes.join(', ')
    : card.groupName;

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
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [activeSection, setActiveSection] = useState<'PROGRAM' | 'PLAN' | 'RESOURCES' | 'STATUS'>('PROGRAM');
  const [activeDay, setActiveDay] = useState(1);
  const [stage, setStage] = useState<ManagementStage>('ORTAOKUL');
  const [resourceView, setResourceView] =
    useState<ManagementResourceView>('SINIFLAR');

  const [poolOpen, setPoolOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [candidateDetail, setCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateFocus, setCandidateFocus] = useState<{
    dayOfWeek: number;
    startPeriod: number;
    candidates: ManagementCandidateAssessment[];
  } | null>(null);

  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragCandidateDetail, setDragCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
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
    ])
      .then(async ([
        nextOverview,
        nextBoard,
        nextCoursePlan,
        nextResources,
        nextPublicationPreview,
      ]) => {
        if (!active) return;

        setOverview(nextOverview);
        setBoard(nextBoard);
        setCoursePlan(nextCoursePlan);
        setResources(nextResources);
        setPublicationPreview(nextPublicationPreview);

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
    () => board?.cards.filter((card) => cardMatchesStage(card, stage)) ?? [],
    [board, stage],
  );

  const rows = useMemo(
    () => (
      board
        ? managementRowsForView(board, resourceView, stage)
        : []
    ),
    [board, resourceView, stage],
  );

  const selectedCard = useMemo(
    () => board?.cards.find((card) => card.id === selectedCardId) ?? null,
    [board, selectedCardId],
  );

  const dragCard = useMemo(
    () => board?.cards.find((card) => card.id === dragCardId) ?? null,
    [board, dragCardId],
  );


  const healthSnapshot = useMemo(
    () => deriveManagementHealth(board, overview, stage),
    [board, overview, stage],
  );

  const selectCard = (cardId: string) => {
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setInspectorOpen(true);
  };

  useEffect(() => {
    if (selectedCard && !cardMatchesStage(selectedCard, stage)) {
      setSelectedCardId(null);
      setInspectorOpen(false);
    }
  }, [selectedCard, stage]);

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


  const beginDrag = (cardId: string) => {
    if (!session || !access?.canEdit || status !== 'ready') return;

    const sequence = dragSequenceRef.current + 1;
    dragSequenceRef.current = sequence;

    setDragCardId(cardId);
    setDragCandidateDetail(null);
    setDragLoading(true);
    setCandidateFocus(null);
    setSelectedCardId(cardId);
    setCommandNotice(null);

    void fetchManagementCardCandidates(session.accessToken, cardId)
      .then((detail) => {
        if (dragSequenceRef.current !== sequence) return;
        setDragCandidateDetail(detail);
      })
      .catch((reason: unknown) => {
        if (dragSequenceRef.current !== sequence) return;
        setDragCandidateDetail(null);
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
    setDragCardId(null);
    setDragCandidateDetail(null);
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
      || !candidate.teacherId
      || !candidate.roomId
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

  const handleDropNeedsAttention = (target: ManagementDropTarget) => {
    setSelectedCardId(target.cardId);
    setInspectorOpen(true);

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
      setCommandNotice({
        kind: 'error',
        text: reason
          ? `Bu konum uygun değil: ${reason}.`
          : 'Bu konum kart için uygun değil.',
      });
    }
  };

  const requestRemove = () => {
    if (
      !access?.canEdit
      || !selectedCard?.placement
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
      || !selectedCard?.placement
      || commandBusy
    ) {
      return;
    }

    const cardBeingRemoved = selectedCard;

    setRemoveConfirmOpen(false);
    setCommandBusy(true);
    setCommandActivity(`${cardBeingRemoved.subjectName} programdan kaldırılıyor.`);
    setCommandNotice(null);

    try {
      await removeManagementCard(session.accessToken, cardBeingRemoved.id);
      setCommandNotice({
        kind: 'success',
        text: `${cardBeingRemoved.classCodes.join(', ') || cardBeingRemoved.groupName} ${cardBeingRemoved.subjectName} programdan kaldırıldı ve havuza geri döndü.`,
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
      await undoManagement(session.accessToken, descriptor.transactionId);
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
      await redoManagement(session.accessToken, descriptor.transactionId);
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
    poolOpen ? '292px' : null,
    'minmax(0, 1fr)',
    showInspector ? '316px' : null,
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
          <div className="flex h-[54px] items-center gap-3 border-t border-slate-100 px-5">
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
          className="grid min-h-0 flex-1 gap-3 p-3"
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
              dragCandidateDetail={dragCandidateDetail}
              dragLoading={dragLoading}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
              onDropCandidate={(candidate) => {
                const card = dragCard;
                endDrag();
                if (card) {
                  void runCandidateCommand(candidate, card);
                }
              }}
              onDropNeedsAttention={(target) => {
                endDrag();
                handleDropNeedsAttention(target);
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
                void runCandidateCommand(candidate);
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
        />
      )}

      {removeConfirmOpen && selectedCard?.placement && (
        <ManagementConfirmOverlay
          title="Programdan kaldırılsın mı?"
          detail={`${selectedCard.classCodes.join(', ') || selectedCard.groupName} ${selectedCard.subjectName} mevcut yerleşiminden kaldırılacak ve ders havuzuna geri dönecek.`}
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

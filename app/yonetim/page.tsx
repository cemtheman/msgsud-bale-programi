'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ManagementBoardGrid,
  type ManagementDropTarget,
} from '@/components/management/ManagementBoardGrid';
import { ManagementCardPool } from '@/components/management/ManagementCardPool';
import { ManagementInspector } from '@/components/management/ManagementInspector';
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
  fetchManagementCommandState,
  moveManagementCard,
  placeManagementCard,
  redoManagement,
  removeManagementCard,
  undoManagement,
  type ManagementCommandState,
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
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

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

  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragCandidateDetail, setDragCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
  const [dragLoading, setDragLoading] = useState(false);
  const dragSequenceRef = useRef(0);

  const [commandState, setCommandState] = useState<ManagementCommandState>({
    undoTransactionId: null,
    undoLabel: null,
    redoTransactionId: null,
    redoLabel: null,
  });
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandNotice, setCommandNotice] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !session) {
      setOverview(null);
      setBoard(null);
      return;
    }

    let active = true;
    setDataLoading(true);
    setDataError(null);

    Promise.all([
      fetchManagementOverview(session.accessToken),
      fetchManagementBoard(session.accessToken),
    ])
      .then(async ([nextOverview, nextBoard]) => {
        if (!active) return;

        setOverview(nextOverview);
        setBoard(nextBoard);

        if (nextBoard) {
          const nextCommandState = await fetchManagementCommandState(
            session.accessToken,
            nextBoard.revisionId,
          );
          if (active) setCommandState(nextCommandState);
        } else {
          setCommandState({
            undoTransactionId: null,
            undoLabel: null,
            redoTransactionId: null,
            redoLabel: null,
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

  const selectCard = (cardId: string) => {
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
    }
  };

  const handleDropNeedsAttention = (target: ManagementDropTarget) => {
    setSelectedCardId(target.cardId);
    setInspectorOpen(true);

    if (target.state === 'AMBIGUOUS') {
      setCommandNotice({
        kind: 'info',
        text: `Bu başlangıç saati için ${target.validCandidates.length} farklı uygun öğretmen/salon seçeneği var. Sağdaki uygun adaylardan birini seçin.`,
      });
      return;
    }

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

  const runRemove = async () => {
    if (
      !session
      || !access?.canEdit
      || !selectedCard?.placement
      || commandBusy
    ) {
      return;
    }

    if (!window.confirm('Bu kartı programdan kaldırmak istiyor musunuz?')) {
      return;
    }

    setCommandBusy(true);
    setCommandNotice(null);

    try {
      await removeManagementCard(session.accessToken, selectedCard.id);
      setCommandNotice({
        kind: 'success',
        text: 'Kart programdan kaldırıldı ve havuza geri döndü.',
      });
      setRefreshToken((value) => value + 1);
    } catch (reason: unknown) {
      setCommandNotice({
        kind: 'error',
        text: reason instanceof Error ? reason.message : 'Kart kaldırılamadı.',
      });
    } finally {
      setCommandBusy(false);
    }
  };

  const runUndo = async () => {
    if (
      !session
      || !access?.canEdit
      || !commandState.undoTransactionId
      || commandBusy
    ) {
      return;
    }

    setCommandBusy(true);
    setCommandNotice(null);

    try {
      await undoManagement(session.accessToken, commandState.undoTransactionId);
      setCommandNotice({
        kind: 'success',
        text: 'Son program işlemi geri alındı.',
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
    }
  };

  const runRedo = async () => {
    if (
      !session
      || !access?.canEdit
      || !commandState.redoTransactionId
      || commandBusy
    ) {
      return;
    }

    setCommandBusy(true);
    setCommandNotice(null);

    try {
      await redoManagement(session.accessToken, commandState.redoTransactionId);
      setCommandNotice({
        kind: 'success',
        text: 'Geri alınan program işlemi yeniden uygulandı.',
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
              <button className="h-full border-b-2 border-slate-950 px-1 text-[12px] font-bold text-slate-950">
                Program
              </button>
              <button disabled className="h-full px-1 text-[12px] font-semibold text-slate-300">
                Ders Yükleri
              </button>
              <button disabled className="h-full px-1 text-[12px] font-semibold text-slate-300">
                Kaynaklar
              </button>
              <button disabled className="h-full px-1 text-[12px] font-semibold text-slate-300">
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
                disabled={!commandState.undoTransactionId || commandBusy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                title={commandState.undoLabel
                  ? `Son işlemi geri al: ${commandState.undoLabel}`
                  : 'Geri alınabilecek işlem yok'}
              >
                ↶ Geri Al
              </button>
              <button
                type="button"
                onClick={() => void runRedo()}
                disabled={!commandState.redoTransactionId || commandBusy}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                title={commandState.redoLabel
                  ? `İşlemi yeniden uygula: ${commandState.redoLabel}`
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
      </header>

      {dataError && (
        <div className="mx-3 mt-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {dataError}
        </div>
      )}

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
            teacherNamesById={board?.teacherNamesById ?? {}}
            roomNamesById={board?.roomNamesById ?? {}}
            canEdit={access?.canEdit === true}
            commandBusy={commandBusy}
            commandNotice={commandNotice}
            onCandidateAction={(candidate) => {
              void runCandidateCommand(candidate);
            }}
            onRemove={() => {
              void runRemove();
            }}
            onClose={() => setInspectorOpen(false)}
          />
        )}
      </section>
    </main>
  );
}

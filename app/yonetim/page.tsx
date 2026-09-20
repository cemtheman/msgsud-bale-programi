'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ManagementBoardGrid } from '@/components/management/ManagementBoardGrid';
import { ManagementCardPool } from '@/components/management/ManagementCardPool';
import { ManagementInspector } from '@/components/management/ManagementInspector';
import { useManagementSession } from '@/hooks/useManagementSession';
import {
  cardMatchesStage,
  fetchManagementBoard,
  fetchManagementCardCandidates,
  managementRowsForView,
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
  { id: 1, label: 'Pazartesi' },
  { id: 2, label: 'Salı' },
  { id: 3, label: 'Çarşamba' },
  { id: 4, label: 'Perşembe' },
  { id: 5, label: 'Cuma' },
] as const;

const STAGES: Array<{ id: ManagementStage; label: string }> = [
  { id: 'ORTAOKUL', label: 'Ortaokul' },
  { id: 'LISE', label: 'Lise' },
];

const RESOURCE_VIEWS: ManagementResourceView[] = [
  'SINIFLAR',
  'ÖĞRETMENLER',
  'SALONLAR',
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
        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A63D48]">
            MSGSÜ Ders Programı
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Yönetim
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Taslak program çalışma alanına erişmek için yönetim hesabınızla giriş yapın.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-600">
              E-posta
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-600">
              Parola
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Giriş yapılıyor…' : 'Yönetim alanını aç'}
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 block text-center text-xs font-bold text-slate-400 transition hover:text-slate-700"
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

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [candidateDetail, setCandidateDetail] =
    useState<ManagementCandidateDetail | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [commandState, setCommandState] = useState<ManagementCommandState>({
    undoTransactionId: null,
    undoLabel: null,
    redoTransactionId: null,
    redoLabel: null,
  });
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandNotice, setCommandNotice] = useState<{
    kind: 'success' | 'error';
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

  useEffect(() => {
    if (
      selectedCard
      && !cardMatchesStage(selectedCard, stage)
    ) {
      setSelectedCardId(null);
    }
  }, [selectedCard, stage]);


  useEffect(() => {
    // İşlem sonucu seçili karta aittir; başka karta geçildiğinde eski başarı/
    // hata mesajını yeni kartın ayrıntılarında göstermeyelim.
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

  const runCandidateCommand = async (
    candidate: ManagementCandidateAssessment,
  ) => {
    if (
      !session
      || !access?.canEdit
      || !selectedCard
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
        cardId: selectedCard.id,
        dayOfWeek: candidate.dayOfWeek,
        startPeriod: candidate.startPeriod,
        teacherId: candidate.teacherId,
        roomId: candidate.roomId,
      };

      if (selectedCard.placement) {
        await moveManagementCard(session.accessToken, input);
        setCommandNotice({
          kind: 'success',
          text: 'Kart yeni yerine taşındı.',
        });
      } else {
        await placeManagementCard(session.accessToken, input);
        setCommandNotice({
          kind: 'success',
          text: 'Kart programa yerleştirildi.',
        });
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
        text: reason instanceof Error
          ? reason.message
          : 'Kart kaldırılamadı.',
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
      await undoManagement(
        session.accessToken,
        commandState.undoTransactionId,
      );
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
      await redoManagement(
        session.accessToken,
        commandState.redoTransactionId,
      );
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

  const activeDayLabel = useMemo(
    () => DAYS.find((day) => day.id === activeDay)?.label ?? '',
    [activeDay],
  );

  if (status === 'loading') {
    return (
      <main className="management-workbench-root flex min-h-screen items-center justify-center bg-[#F5F3EE] text-sm font-bold text-slate-400">
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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            Erişim sınırı
          </p>
          <h1 className="mt-2 text-2xl font-black">
            Bu hesap Yönetim üyesi değil
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Oturum açıldı ancak aktif Görüntüleyici, Editör veya Yönetici yetkisi bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-6 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white"
          >
            Oturumu kapat
          </button>
        </section>
      </main>
    );
  }

  const visiblePlacedCount = visibleCards.filter((card) => card.placement).length;
  const visibleUnplacedCount = visibleCards.length - visiblePlacedCount;

  return (
    <main className="management-workbench-root min-h-screen min-w-[1180px] bg-[#F3F1EB] text-slate-900">
      <div className="management-portrait-note">
        Yönetim çalışma alanı yatay ekran için tasarlandı.
      </div>

      <header className="border-b border-slate-200 bg-white/95 px-6 pt-5 backdrop-blur">
        <div className="flex items-start justify-between gap-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#A63D48]">
              MSGSÜ Ders Programı
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight">
                Yönetim Çalışma Alanı
              </h1>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {roleLabel(access?.role)}
              </span>
              {access?.canEdit ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                  Düzenleme yetkisi
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                  Salt okunur
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {session?.email}
              {overview ? ` · Taslak v${overview.versionNumber}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={dataLoading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {dataLoading ? 'Yenileniyor…' : 'Veriyi yenile'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold text-white hover:bg-slate-800"
            >
              Çıkış
            </button>
          </div>
        </div>

        <nav className="mt-5 flex gap-7 text-sm font-black">
          <button className="border-b-2 border-slate-950 pb-3 text-slate-950">
            Program
          </button>
          <button disabled className="pb-3 text-slate-300">
            Ders Yükleri
          </button>
          <button disabled className="pb-3 text-slate-300">
            Kaynaklar
          </button>
          <button disabled className="pb-3 text-slate-300">
            Program Durumu
          </button>
        </nav>
      </header>

      <section className="border-b border-slate-200 bg-[#FAF9F6] px-6 py-3">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
              {STAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStage(item.id)}
                  className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                    stage === item.id
                      ? 'bg-[#A63D48] text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1 rounded-2xl bg-slate-200/70 p-1">
              {DAYS.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setActiveDay(day.id)}
                  className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                    activeDay === day.id
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {RESOURCE_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setResourceView(view)}
                className={`rounded-xl px-3 py-2 text-[11px] font-black tracking-wide transition ${
                  resourceView === view
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </section>

      {dataError && (
        <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {dataError}
        </div>
      )}

      <section className="grid min-h-[680px] grid-cols-[310px_minmax(0,1fr)_320px] gap-4 p-4">
        <ManagementCardPool
          cards={visibleCards}
          totalUnplaced={overview?.unplacedCount ?? visibleUnplacedCount}
          selectedCardId={selectedCardId}
          onSelect={setSelectedCardId}
        />

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {resourceView}
              </p>
              <h2 className="mt-0.5 text-lg font-black">
                {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} · {activeDayLabel}
              </h2>
            </div>
            <div className="flex gap-2 text-[10px] font-black">
              <span className="rounded-full bg-white px-3 py-1.5 text-slate-600 shadow-sm">
                {visibleCards.length} kart
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
                {visiblePlacedCount} yerleşmiş
              </span>
              <span className="rounded-full bg-slate-200/70 px-3 py-1.5 text-slate-600">
                {visibleUnplacedCount} yerleşmemiş
              </span>
            </div>
          </div>

          <ManagementBoardGrid
            rows={rows}
            cards={visibleCards}
            view={resourceView}
            activeDay={activeDay}
            selectedCardId={selectedCardId}
            onSelect={setSelectedCardId}
          />
        </div>

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
        />
      </section>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <span>Geçmiş: {overview?.activeMoveCount ?? '—'} aktif işlem</span>
            <span>Yerleşmiş: {overview?.placedCount ?? '—'}</span>
            <span>Yerleşmemiş: {overview?.unplacedCount ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            {access?.canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => void runUndo()}
                  disabled={!commandState.undoTransactionId || commandBusy}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                  title={commandState.undoLabel
                    ? `Son işlemi geri al: ${commandState.undoLabel}`
                    : 'Geri alınabilecek işlem yok'}
                >
                  Geri Al
                </button>
                <button
                  type="button"
                  onClick={() => void runRedo()}
                  disabled={!commandState.redoTransactionId || commandBusy}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                  title={commandState.redoLabel
                    ? `İşlemi yeniden uygula: ${commandState.redoLabel}`
                    : 'Yinelenecek işlem yok'}
                >
                  Yinele
                </button>
              </>
            ) : (
              <span className="text-[11px] font-bold text-slate-400">
                Salt okunur oturum
              </span>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

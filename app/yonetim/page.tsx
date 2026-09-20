'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useManagementSession } from '@/hooks/useManagementSession';
import {
  fetchManagementOverview,
  type ManagementOverview,
} from '@/lib/managementOverview';

const DAYS = [
  { id: 1, label: 'Pazartesi' },
  { id: 2, label: 'Salı' },
  { id: 3, label: 'Çarşamba' },
  { id: 4, label: 'Perşembe' },
  { id: 5, label: 'Cuma' },
] as const;

const PERIODS = Array.from({ length: 12 }, (_, index) => index + 1);

type ResourceView = 'SINIFLAR' | 'ÖĞRETMENLER' | 'SALONLAR';

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
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A63D48]">MSGSÜ Ders Programı</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Yönetim</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Taslak program çalışma alanına erişmek için yönetim hesabınızla giriş yapın.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-600">E-posta</span>
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
            <span className="mb-1.5 block text-xs font-extrabold text-slate-600">Parola</span>
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
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewToken, setOverviewToken] = useState(0);
  const [activeDay, setActiveDay] = useState(1);
  const [resourceView, setResourceView] = useState<ResourceView>('SINIFLAR');

  useEffect(() => {
    if (status !== 'ready' || !session) {
      setOverview(null);
      return;
    }

    let active = true;
    setOverviewLoading(true);
    setOverviewError(null);

    fetchManagementOverview(session.accessToken)
      .then((value) => {
        if (!active) return;
        setOverview(value);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setOverviewError(
          reason instanceof Error ? reason.message : 'Taslak program özeti alınamadı.',
        );
      })
      .finally(() => {
        if (active) setOverviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [overviewToken, session, status]);

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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Erişim sınırı</p>
          <h1 className="mt-2 text-2xl font-black">Bu hesap Yönetim üyesi değil</h1>
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

  const dayPlacementCount = overview?.placementsByDay[activeDay] ?? 0;

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
              <h1 className="text-2xl font-black tracking-tight">Yönetim Çalışma Alanı</h1>
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
              onClick={() => setOverviewToken((value) => value + 1)}
              disabled={overviewLoading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {overviewLoading ? 'Yenileniyor…' : 'Veriyi yenile'}
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
          <button className="border-b-2 border-slate-950 pb-3 text-slate-950">Program</button>
          <button disabled className="pb-3 text-slate-300">Ders Yükleri</button>
          <button disabled className="pb-3 text-slate-300">Kaynaklar</button>
          <button disabled className="pb-3 text-slate-300">Program Durumu</button>
        </nav>
      </header>

      <section className="border-b border-slate-200 bg-[#FAF9F6] px-6 py-3">
        <div className="flex items-center justify-between gap-8">
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

          <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {(['SINIFLAR', 'ÖĞRETMENLER', 'SALONLAR'] as ResourceView[]).map((view) => (
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

      {overviewError && (
        <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {overviewError}
        </div>
      )}

      <section className="grid min-h-[650px] grid-cols-[270px_minmax(0,1fr)_300px] gap-4 p-4">
        <aside className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Kart Havuzu</p>
              <h2 className="mt-1 text-lg font-black">Yerleşmemiş</h2>
            </div>
            <span className="rounded-xl bg-slate-950 px-3 py-1.5 text-sm font-black text-white">
              {overview?.unplacedCount ?? '—'}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-[10px] font-black uppercase text-emerald-700">Zorunlu</p>
              <p className="mt-1 text-xl font-black text-emerald-950">{overview?.forcedCount ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
              <p className="text-[10px] font-black uppercase text-amber-700">Belirsiz</p>
              <p className="mt-1 text-xl font-black text-amber-950">{overview?.unresolvedCount ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3">
              <p className="text-[10px] font-black uppercase text-rose-700">Çelişki</p>
              <p className="mt-1 text-xl font-black text-rose-950">{overview?.contradictionCount ?? '—'}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-[10px] font-black uppercase text-slate-500">Kilitli</p>
              <p className="mt-1 text-xl font-black text-slate-900">{overview?.lockedCount ?? '—'}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            Kart ayrıntıları ve sürükle-bırak bu canlı taslak özetinin üzerine bağlanacak.
          </div>
        </aside>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                {resourceView}
              </p>
              <h2 className="mt-1 text-lg font-black">{activeDayLabel}</h2>
            </div>
            <div className="flex gap-2 text-[11px] font-black">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                {overview?.cardCount ?? '—'} kart
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
                {overview?.placedCount ?? '—'} yerleşmiş
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50">
                {PERIODS.map((period) => (
                  <div
                    key={period}
                    className="border-r border-slate-200 px-2 py-3 text-center text-[11px] font-black text-slate-500 last:border-r-0"
                  >
                    {period}
                  </div>
                ))}
              </div>

              <div className="flex min-h-[470px] items-center justify-center p-8">
                <div className="max-w-[470px] text-center">
                  <p className="text-sm font-black text-slate-800">
                    {dayPlacementCount === 0
                      ? 'Bu gün için taslak yerleşim yok.'
                      : `Bu gün için ${dayPlacementCount} yerleşim var.`}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Yatay ders saati ızgarası canlı taslak program verisine bağlı. Sınıf / öğretmen / salon satırları bir sonraki veri bağlama aşamasında bu yüzeye eklenecek.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Ayrıntılar</p>
          <h2 className="mt-1 text-lg font-black">Kart seçimi</h2>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Erişim</p>
              <p className="mt-1 text-sm font-black">{roleLabel(access?.role)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {access?.canEdit
                  ? 'Yerleştir / Taşı / Kaldır / Geri Al / Yinele işlemleri kontrollü yönetim komutlarıyla çalışır.'
                  : 'Bu oturum yalnız yönetim taslak verisini okuyabilir.'}
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-500">
                Kart seçildiğinde aday alanı, öğretmen, salon ve “Neden değil?” açıklamaları burada gösterilecek.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <span>Geçmiş: {overview?.activeMoveCount ?? '—'} aktif işlem</span>
            <span>Yerleşmiş: {overview?.placedCount ?? '—'}</span>
            <span>Yerleşmemiş: {overview?.unplacedCount ?? '—'}</span>
          </div>
          <div className="text-[11px] font-bold text-slate-400">
            Geri Al / Yinele hazır · Arayüz komutları henüz bağlanmadı
          </div>
        </div>
      </footer>
    </main>
  );
}

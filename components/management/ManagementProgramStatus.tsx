'use client';

import type {
  ManagementHealthIssue,
  ManagementHealthSnapshot,
  ManagementIssueOrigin,
  ManagementReadinessStatus,
} from '@/lib/managementHealth';

function statusMeta(status: ManagementReadinessStatus) {
  if (status === 'YAYINA_HAZIR') {
    return {
      label: 'YAYINA HAZIR',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      description: 'Yayın engeli veya açık uyarı görünmüyor.',
    };
  }

  if (status === 'UYARILARLA_HAZIR') {
    return {
      label: 'UYARILARLA HAZIR',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      description: 'Yayını engellemeyen veri borçları veya uyarılar bulunuyor.',
    };
  }

  return {
    label: 'YAYIN ENGELLİ',
    className: 'border-rose-200 bg-rose-50 text-rose-900',
    description: 'Yayın öncesinde çözülmesi gereken en az bir engel bulunuyor.',
  };
}

function originLabel(origin?: ManagementIssueOrigin) {
  if (origin === 'TOUCHED_INHERITED') return 'Dokunulmuş devralınmış';
  if (origin === 'INTRODUCED') return 'Bu taslakta oluştu';
  if (origin === 'INHERITED') return 'Devralınmış';
  return null;
}

function IssueCard({ issue }: { issue: ManagementHealthIssue }) {
  const isBlocker = issue.severity === 'BLOCKER';
  const origin = originLabel(issue.origin);

  return (
    <div
      className={
        isBlocker
          ? 'rounded-2xl border border-rose-200 bg-rose-50/70 p-4'
          : 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                isBlocker
                  ? 'rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-700'
                  : 'rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-700'
              }
            >
              {isBlocker ? 'Engel' : 'Uyarı'}
            </span>

            {origin && (
              <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-500">
                {origin}
              </span>
            )}
          </div>

          <h3 className="mt-2 text-sm font-bold text-slate-900">
            {issue.title}
          </h3>
          <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">
            {issue.detail}
          </p>
        </div>

        <span
          className={
            isBlocker
              ? 'shrink-0 rounded-2xl bg-white px-3 py-2 text-lg font-black text-rose-700'
              : 'shrink-0 rounded-2xl bg-white px-3 py-2 text-lg font-black text-amber-700'
          }
        >
          {issue.count}
        </span>
      </div>
    </div>
  );
}

export function ManagementProgramStatus({
  snapshot,
  versionNumber,
}: {
  snapshot: ManagementHealthSnapshot | null;
  versionNumber: number | null;
}) {
  if (!snapshot) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Program durumu hazırlanıyor…
        </div>
      </section>
    );
  }

  const meta = statusMeta(snapshot.status);
  const blockerCount = snapshot.blockers.reduce((sum, issue) => sum + issue.count, 0);
  const warningCount = snapshot.warnings.reduce((sum, issue) => sum + issue.count, 0);

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1120px] space-y-4">
        <div className={['rounded-[24px] border p-5 shadow-sm', meta.className].join(' ')}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Program Durumu
              </p>
              <h2 className="mt-1 text-2xl font-black">
                {meta.label}
              </h2>
              <p className="mt-2 max-w-[650px] text-sm font-medium leading-6 opacity-80">
                {meta.description}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">
                Taslak
              </p>
              <p className="mt-1 text-sm font-black">
                v{versionNumber ?? '–'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              Yerleşim
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {snapshot.placedCount} / {snapshot.totalCards}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              kart programda
            </p>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">
              Yayın engeli
            </p>
            <p className="mt-2 text-2xl font-black text-rose-700">
              {blockerCount}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              çözülmesi gereken kayıt
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">
              Uyarı
            </p>
            <p className="mt-2 text-2xl font-black text-amber-700">
              {warningCount}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              yayını tek başına engellemeyen
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Yayın engelleri
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Önce bunları çöz
                  </h3>
                </div>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-black text-rose-700">
                  {snapshot.blockers.length} başlık
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {snapshot.blockers.length > 0 ? (
                  snapshot.blockers.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))
                ) : (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    Yayını engelleyen bir durum görünmüyor.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Uyarılar
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Veri borçları ve dikkat noktaları
                  </h3>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700">
                  {snapshot.warnings.length} başlık
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {snapshot.warnings.length > 0 ? (
                  snapshot.warnings.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    Açık uyarı görünmüyor.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                M16 kontrol kapsamı
              </p>
              <div className="mt-3 space-y-2 text-[11px] font-medium leading-5 text-slate-600">
                <p>✓ Tüm ders kartları yerleştirildi mi?</p>
                <p>✓ Çelişkiye düşmüş kart var mı?</p>
                <p>✓ Dokunulmuş kartlarda belirsiz veri kaldı mı?</p>
                <p>✓ Dokunulmamış veri borçları uyarı olarak ayrıldı mı?</p>
              </div>
            </div>

            <div className="rounded-[22px] border border-blue-200 bg-blue-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                Yayın henüz bağlı değil
              </p>
              <p className="mt-2 text-[11px] font-medium leading-5 text-blue-800">
                Bu ekran yalnız sağlık kontrolünü gösterir. Öğrenci ve öğretmen programları bu taslaktan henüz etkilenmez.
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Sorun kökeni
              </p>
              <div className="mt-3 space-y-2 text-[10px] font-medium leading-4 text-slate-500">
                <p><strong className="text-slate-700">Devralınmış:</strong> yönetim taslağından önce var olan veri borcu.</p>
                <p><strong className="text-slate-700">Dokunulmuş devralınmış:</strong> bu taslakta işlem görmüş eski veri sorunu.</p>
                <p><strong className="text-slate-700">Bu taslakta oluştu:</strong> baseline farkı doğrulandığında kullanılacak.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

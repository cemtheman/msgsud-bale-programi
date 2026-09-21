'use client';

import type { ManagementStage } from '@/lib/managementBoard';
import type {
  ManagementHealthIssue,
  ManagementHealthSnapshot,
  ManagementIssueOrigin,
  ManagementReadinessStatus,
} from '@/lib/managementHealth';

function statusMeta(status: ManagementReadinessStatus) {
  if (status === 'YAYINA_HAZIR') {
    return {
      label: 'Yayına hazır',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      description: 'Programda yayın öncesinde tamamlanması gereken bir eksik görünmüyor.',
    };
  }

  if (status === 'UYARILARLA_HAZIR') {
    return {
      label: 'Hazır, ancak kontrol edilmesi gerekenler var',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      description: 'Program yayımlanabilir durumda; yine de aşağıdaki bilgi eksiklerini gözden geçirmeniz iyi olur.',
    };
  }

  return {
    label: 'Henüz yayına hazır değil',
    className: 'border-rose-200 bg-rose-50 text-rose-900',
    description: 'Program tamamlanmadan önce aşağıdaki eksiklerin giderilmesi gerekiyor.',
  };
}

function originLabel(origin?: ManagementIssueOrigin) {
  if (origin === 'TOUCHED_INHERITED') return 'Bu taslakta işlem gördü';
  if (origin === 'INTRODUCED') return 'Bu taslakta oluştu';
  if (origin === 'INHERITED') return 'Mevcut veriden geliyor';
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
              {isBlocker ? 'Tamamlanmalı' : 'Dikkat'}
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
  stage,
  onStageChange,
}: {
  snapshot: ManagementHealthSnapshot | null;
  versionNumber: number | null;
  stage: ManagementStage;
  onStageChange: (stage: ManagementStage) => void;
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
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Program durumu
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} için sağlık ve eksik kontrolü
            </p>
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {([
              { id: 'ORTAOKUL', label: 'Ortaokul' },
              { id: 'LISE', label: 'Lise' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onStageChange(item.id)}
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
        </div>

        <div className={['rounded-[24px] border p-5 shadow-sm', meta.className].join(' ')}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Programın durumu
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
                Çalışılan taslak
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
              Programlanan dersler
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {snapshot.placedCount} / {snapshot.totalCards}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              ders kartı yerleştirildi
            </p>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">
              Tamamlanması gereken
            </p>
            <p className="mt-2 text-2xl font-black text-rose-700">
              {blockerCount}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              kayıt
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">
              Bilgi eksiği
            </p>
            <p className="mt-2 text-2xl font-black text-amber-700">
              {warningCount}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">
              kontrol edilmesi önerilen kayıt
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Önce tamamlanması gerekenler
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Programı tamamlamak için
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
                    Tamamlanması gereken bir durum görünmüyor.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Kontrol edilmesi önerilenler
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Eksik veya doğrulanmamış bilgiler
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
                    Kontrol edilmesi gereken ek bir bilgi görünmüyor.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Bu sayfa neyi kontrol ediyor?
              </p>
              <div className="mt-3 space-y-2 text-[11px] font-medium leading-5 text-slate-600">
                <p>✓ Tüm derslere programda yer verildi mi?</p>
                <p>✓ Her ders için geçerli bir yerleşim seçeneği var mı?</p>
                <p>✓ Düzenlenen derslerde eksik öğretmen veya salon bilgisi kaldı mı?</p>
                <p>✓ Mevcut veriden gelen eksikler ayrı bir dikkat notu olarak gösterildi mi?</p>
              </div>
            </div>

            <div className="rounded-[22px] border border-blue-200 bg-blue-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                Bu ekran taslağı kontrol eder
              </p>
              <p className="mt-2 text-[11px] font-medium leading-5 text-blue-800">
                Burada yaptığınız kontroller henüz öğrenci ve öğretmen programlarını değiştirmez. Yayınlama ayrı bir adım olarak eklenecek.
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Bu bilgi nereden geliyor?
              </p>
              <div className="mt-3 space-y-2 text-[10px] font-medium leading-4 text-slate-500">
                <p><strong className="text-slate-700">Mevcut veriden geliyor:</strong> bu taslak üzerinde çalışmaya başlamadan önce de eksik olan bilgi.</p>
                <p><strong className="text-slate-700">Bu taslakta işlem gördü:</strong> önceden var olan eksik bilgiye bu taslakta müdahale edildi.</p>
                <p><strong className="text-slate-700">Bu taslakta oluştu:</strong> ileride başlangıç durumu ile karşılaştırma kesinleştirildiğinde bu etiket kullanılacak.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

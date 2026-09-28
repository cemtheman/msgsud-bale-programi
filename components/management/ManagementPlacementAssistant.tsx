'use client';

import type {
  ManagementPlacementAssistantGroup,
  ManagementPlacementAssistantSuggestion,
} from '@/lib/managementPlacementAssistant';

const DAY_LABELS: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
};

function classLabel(values: string[]) {
  return values.length > 0 ? values.join(' + ') : 'Ortak grup';
}

export function ManagementPlacementAssistant({
  open,
  scopeLabel,
  groups,
  suggestions,
  reviewCount,
  loading,
  analyzed,
  stale,
  error,
  canEdit,
  commandBusy,
  onAnalyze,
  onApply,
  onClose,
}: {
  open: boolean;
  scopeLabel: string;
  groups: ManagementPlacementAssistantGroup[];
  suggestions: ManagementPlacementAssistantSuggestion[];
  reviewCount: number;
  loading: boolean;
  analyzed: boolean;
  stale: boolean;
  error: string | null;
  canEdit: boolean;
  commandBusy: boolean;
  onAnalyze: () => void;
  onApply: (suggestion: ManagementPlacementAssistantSuggestion) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const singleOptionCount = groups.filter(
    (group) => group.status === 'SINGLE_OPTION',
  ).length;
  const choiceCount = groups.filter(
    (group) => group.status === 'CHOICES',
  ).length;
  const infoMissingCount = groups.filter(
    (group) => group.status === 'INFO_MISSING',
  ).length;
  const problemCount = groups.filter(
    (group) => group.status === 'PROBLEM',
  ).length;

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/25 p-5 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Yerleştirme Asistanı"
    >
      <section className="flex max-h-[calc(100vh-2.5rem)] w-full max-w-[820px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-[#FCFBF8] shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
        <header className="flex items-start justify-between gap-5 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A63D48]">
              Partisyon · Yerleştirme Asistanı
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Önce kesin olanları yerleştirin
            </h2>
            <p className="mt-2 max-w-[610px] text-[11px] font-medium leading-5 text-slate-500">
              {scopeLabel}. Asistan yalnız tek ve kesin seçeneği doğrulanabilen dersleri önerir.
              Birden fazla olasılık veya eksik bilgi varsa kararı size bırakır.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            Kapat
          </button>
        </header>

        <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-4 gap-2.5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700">
                Tek seçenek
              </p>
              <p className="mt-1 text-xl font-black text-emerald-950">
                {singleOptionCount}
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-emerald-700">
                önce doğrulanacak
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-blue-700">
                Seçim gerekiyor
              </p>
              <p className="mt-1 text-xl font-black text-blue-950">
                {choiceCount}
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-blue-700">
                birden fazla uygun yol
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">
                Bilgi eksik
              </p>
              <p className="mt-1 text-xl font-black text-amber-950">
                {infoMissingCount}
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-amber-700">
                önce bilgi tamamlanmalı
              </p>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-wide text-rose-700">
                Sorunlu
              </p>
              <p className="mt-1 text-xl font-black text-rose-950">
                {problemCount}
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 text-rose-700">
                ayrıca incelenmeli
              </p>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-base font-black text-emerald-900">
                Bu görünümde havuzda ders kalmadı.
              </p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-emerald-700">
                Yerleştirme Asistanı şu anda uygulanacak bir ders bulamıyor.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-slate-900">
                    Güvenli önerileri doğrula
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
                    Yalnız “Tek seçenek” görünen derslerin gün, saat, öğretmen ve salon bilgisi
                    güncel aday alanından yeniden kontrol edilir. Bu kontrol düzenleme yetkisi gerektirir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAnalyze}
                  disabled={!canEdit || loading || commandBusy || singleOptionCount === 0}
                  className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {loading
                    ? 'Kontrol ediliyor…'
                    : analyzed || stale
                      ? 'Yeniden kontrol et'
                      : 'Önerileri hazırla'}
                </button>
              </div>

              {error && (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold leading-5 text-rose-700">
                  {error}
                </div>
              )}

              {stale && (
                <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-semibold leading-5 text-blue-800">
                  Program değişti. Kalan öneriler uygulanmadan önce yeniden kontrol edilmeli.
                </div>
              )}

              {analyzed && !loading && !stale && (
                <div className="mt-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Doğrulanmış öneriler
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {suggestions.length} ders güvenle önerilebiliyor
                      </p>
                    </div>
                    {reviewCount > 0 && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700">
                        {reviewCount} tek seçenek yeniden inceleme istiyor
                      </span>
                    )}
                  </div>

                  {suggestions.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {suggestions.map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[12px] font-black text-slate-950">
                                  {suggestion.subjectName}
                                </p>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">
                                  {classLabel(suggestion.classCodes)}
                                </span>
                                {suggestion.durationPeriods > 1 && (
                                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">
                                    ×{suggestion.durationPeriods} ders
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 text-[11px] font-black text-emerald-800">
                                {DAY_LABELS[suggestion.dayOfWeek] ?? String(suggestion.dayOfWeek) + '. gün'}
                                {' · '}
                                {suggestion.startPeriod}. ders
                              </p>
                              <p className="mt-1 text-[9px] font-semibold leading-4 text-slate-500">
                                {suggestion.teacherLabels.join(' · ')}
                                {' · '}
                                {suggestion.roomLabels.join(' · ')}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => onApply(suggestion)}
                              disabled={!canEdit || commandBusy}
                              className="shrink-0 rounded-xl bg-emerald-800 px-4 py-2.5 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Bu öneriyi uygula
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-[11px] font-semibold leading-5 text-slate-500">
                      Tek seçenek olarak görünen derslerin hiçbiri şu anda tam ve kesin bir
                      otomatik öneriye dönüşmedi. Kararsız kaynakları kullanıcı seçimiyle çözmek gerekiyor.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Güvenlik kuralı
            </p>
            <p className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">
              Asistan kendi başına programı değiştirmez. Bir öneri uygulandığında program durumu
              değişebileceği için kalan öneriler otomatik olarak geçersiz sayılır ve yeniden kontrol edilir.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

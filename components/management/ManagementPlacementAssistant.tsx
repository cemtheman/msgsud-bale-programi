'use client';

import { useState } from 'react';
import type {
  ManagementPlacementAssistantGroup,
  ManagementPlacementAssistantOption,
  ManagementPlacementAssistantPlan,
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
  plans,
  loading,
  analyzed,
  stale,
  error,
  canEdit,
  commandBusy,
  refreshing,
  onAnalyze,
  onApply,
  onInspect,
  onClose,
}: {
  open: boolean;
  scopeLabel: string;
  groups: ManagementPlacementAssistantGroup[];
  plans: ManagementPlacementAssistantPlan[];
  loading: boolean;
  analyzed: boolean;
  stale: boolean;
  error: string | null;
  canEdit: boolean;
  commandBusy: boolean;
  refreshing: boolean;
  onAnalyze: () => void;
  onApply: (
    group: ManagementPlacementAssistantGroup,
    option: ManagementPlacementAssistantOption,
  ) => void;
  onInspect: (group: ManagementPlacementAssistantGroup) => void;
  onClose: () => void;
}) {
  const [expandedPlanIds, setExpandedPlanIds] = useState<string[]>([]);

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
  const analyzableCount = singleOptionCount + choiceCount;

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/25 p-5 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Yerleştirme Asistanı"
    >
      <section className="flex max-h-[calc(100vh-2.5rem)] w-full max-w-[900px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-[#FCFBF8] shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
        <header className="flex items-start justify-between gap-5 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A63D48]">
              Partisyon · Yerleştirme Asistanı
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              En kısıtlı dersten başlayın
            </h2>
            <p className="mt-2 max-w-[660px] text-[11px] font-medium leading-5 text-slate-500">
              {scopeLabel}. Asistan havuzdaki derslerin güncel uygun saatlerini karşılaştırır ve
              daha az seçeneği olan dersi önce gösterir. Saat seçimi size aittir.
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
                karar gerektirmeyebilir
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
                seçenekler karşılaştırılacak
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
                    Güncel seçenekleri hesapla
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
                    Yerleştirilebilir derslerin aday alanı yeniden hesaplanır. Sonuçlar
                    en az ortak uygun saatten en çoğa doğru sıralanır.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAnalyze}
                  disabled={!canEdit || loading || refreshing || commandBusy || analyzableCount === 0}
                  className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {refreshing
                    ? 'Program güncelleniyor…'
                    : loading
                      ? 'Hesaplanıyor…'
                      : analyzed || stale
                        ? 'Yeniden hesapla'
                        : 'Seçenekleri hazırla'}
                </button>
              </div>

              {error && (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold leading-5 text-rose-700">
                  {error}
                </div>
              )}

              {stale && (
                <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-semibold leading-5 text-blue-800">
                  Program değişti. Önce seçenekleri yeniden hesaplayın.
                </div>
              )}

              {analyzed && !loading && !stale && (
                <div className="mt-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Yerleştirme sırası
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {plans.length} ders güncel aday alanıyla karşılaştırıldı
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
                      Üstteki dersler daha az ortak uygun saate sahip olduğu için önce ele alınır.
                    </p>
                  </div>

                  <div className="mt-3 space-y-3">
                    {plans.map((plan, index) => {
                      const expanded = expandedPlanIds.includes(plan.group.id);
                      const visibleOptions = expanded
                        ? plan.exactOptions
                        : plan.exactOptions.slice(0, 5);
                      const hiddenOptionCount = Math.max(
                        0,
                        plan.exactOptions.length - visibleOptions.length,
                      );
                      const directlyForced = (
                        plan.commonSlotCount === 1
                        && plan.exactOptions.length === 1
                        && plan.resourceChoiceSlotCount === 0
                      );

                      return (
                        <article
                          key={plan.group.id}
                          className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white">
                              {index + 1}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[13px] font-black text-slate-950">
                                  {plan.group.subjectName}
                                </p>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">
                                  {classLabel(plan.group.classCodes)}
                                </span>
                                {plan.group.durationPeriods > 1 && (
                                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">
                                    ×{plan.group.durationPeriods} ders
                                  </span>
                                )}
                                {directlyForced && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">
                                    Tek kesin seçenek
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                                  {plan.commonSlotCount} ortak uygun saat
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                  {plan.exactOptions.length} doğrudan uygulanabilir
                                </span>
                                {plan.resourceChoiceSlotCount > 0 && (
                                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                    {plan.resourceChoiceSlotCount} saatte kaynak seçimi gerekir
                                  </span>
                                )}
                              </div>

                              {plan.commonSlotCount === 0 ? (
                                <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[10px] font-semibold leading-5 text-rose-700">
                                  Güncel kontrolde bu birleşik ders için ortak uygun saat bulunamadı.
                                  Ayrıntıları incelemek gerekiyor.
                                </div>
                              ) : plan.exactOptions.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {visibleOptions.map((option) => (
                                    <div
                                      key={option.id}
                                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-black text-slate-900">
                                          {DAY_LABELS[option.dayOfWeek] ?? String(option.dayOfWeek) + '. gün'}
                                          {' · '}
                                          {option.startPeriod}. ders
                                        </p>
                                        <p className="mt-0.5 truncate text-[8px] font-semibold text-slate-500">
                                          {option.teacherLabels.join(' · ')}
                                          {' · '}
                                          {option.roomLabels.join(' · ')}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => onApply(plan.group, option)}
                                        disabled={!canEdit || commandBusy}
                                        className="shrink-0 rounded-lg bg-emerald-800 px-3 py-2 text-[9px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
                                      >
                                        Uygula
                                      </button>
                                    </div>
                                  ))}

                                  {plan.exactOptions.length > 5 && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedPlanIds((current) => (
                                        current.includes(plan.group.id)
                                          ? current.filter((id) => id !== plan.group.id)
                                          : [...current, plan.group.id]
                                      ))}
                                      className="text-[9px] font-black text-[#A63D48] hover:underline"
                                    >
                                      {expanded
                                        ? 'Daha az göster'
                                        : String(hiddenOptionCount) + ' seçenek daha göster'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] font-semibold leading-5 text-amber-800">
                                  Uygun saat var; ancak öğretmen veya salon seçimi hâlâ gerekiyor.
                                  Asistan sizin yerinize kaynak seçmez.
                                </div>
                              )}

                              {(plan.resourceChoiceSlotCount > 0 || plan.commonSlotCount === 0) && (
                                <button
                                  type="button"
                                  onClick={() => onInspect(plan.group)}
                                  className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-black text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                >
                                  Ayrıntılarda incele
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Güvenlik kuralı
            </p>
            <p className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">
              Asistan sıralama ve seçenek sunar; sizin yerinize karar vermez. Bir seçenek
              uygulandığında kalan sonuçlar geçersiz sayılır ve yeni programa göre tekrar hesaplanır.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

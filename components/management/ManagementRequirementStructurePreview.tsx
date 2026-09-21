'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementCoursePlanRow,
  ManagementPlanStage,
  ManagementPlanTermStatus,
  ManagementRequirementStructurePreview,
  ManagementRequirementStructurePreviewInput,
} from '@/lib/managementCoursePlan';

function partitionText(value: number[]) {
  return value.length > 0 ? value.join(' + ') : '—';
}

function allowedPartitionText(value: number[][]) {
  return value.length > 0
    ? value.map((item) => item.join(' + ')).join('; ')
    : '';
}

function parsePartition(value: string) {
  const normalized = value.trim();
  if (!normalized) return [];

  const parts = normalized
    .split('+')
    .map((item) => Number(item.trim()));

  if (
    parts.some((item) => (
      !Number.isInteger(item)
      || item <= 0
      || item > 12
    ))
  ) {
    throw new Error('Blok yapısını 2 + 2 + 1 gibi pozitif tam sayılarla yazın.');
  }

  return parts;
}

function parseAllowedPartitions(value: string) {
  const normalized = value.trim();
  if (!normalized) return [];

  return normalized
    .split(';')
    .map((item) => parsePartition(item))
    .filter((item) => item.length > 0);
}

function termLabel(value: ManagementPlanTermStatus) {
  if (value === 'ACTIVE') return 'Bu dönem aktif';
  if (value === 'INACTIVE') return 'Bu dönem kapalı';
  return 'Dönem durumu belirsiz';
}

function impactReasonLabel(code: string) {
  if (code === 'NO_CHANGES') return 'Henüz mevcut plandan farklı bir değişiklik yok.';
  if (code === 'PLACED_CARD_REMOVAL_REQUIRED') {
    return 'Kaldırılması gereken bloklardan en az biri programda yerleşmiş.';
  }
  if (code === 'HUMAN_CARD_CHOICE_REQUIRED') {
    return 'Hangi eşdeğer bloğun korunacağı insan kararı gerektiriyor.';
  }
  return code;
}

function cardLabel(
  duration: number,
  index: number | undefined,
) {
  return index
    ? `Blok ${index} · ${duration} ders saati`
    : `${duration} ders saatlik blok`;
}

export function ManagementRequirementStructurePreview({
  row,
  stage,
  onClose,
  onOpenProgram,
  onPreview,
}: {
  row: ManagementCoursePlanRow;
  stage: ManagementPlanStage;
  onClose: () => void;
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void;
  onPreview: (
    input: ManagementRequirementStructurePreviewInput,
  ) => Promise<ManagementRequirementStructurePreview>;
}) {
  const [weeklyLoad, setWeeklyLoad] = useState(String(row.weeklyLoad));
  const [preferredPartition, setPreferredPartition] = useState(
    row.preferredPartition.join(' + '),
  );
  const [allowedPartitions, setAllowedPartitions] = useState(
    allowedPartitionText(row.allowedPartitions),
  );
  const [termStatus, setTermStatus] = useState<ManagementPlanTermStatus>(
    row.termStatus,
  );
  const [preview, setPreview] =
    useState<ManagementRequirementStructurePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const audience = row.classCodes.length > 0
    ? row.classCodes.join(', ')
    : row.groupName;

  const draftSummary = useMemo<{
    input: ManagementRequirementStructurePreviewInput | null;
    error: string | null;
  }>(() => {
    try {
      const load = Number(weeklyLoad);
      const preferred = parsePartition(preferredPartition);
      const allowed = parseAllowedPartitions(allowedPartitions);

      if (!Number.isInteger(load) || load < 0) {
        return {
          input: null,
          error: 'Haftalık ders saati sıfır veya pozitif tam sayı olmalı.',
        };
      }

      if (termStatus === 'ACTIVE') {
        if (load <= 0) {
          return {
            input: null,
            error: 'Aktif bir dersin haftalık saati sıfır olamaz.',
          };
        }

        const preferredTotal = preferred.reduce((sum, item) => sum + item, 0);
        if (preferredTotal !== load) {
          return {
            input: null,
            error: `Tercih edilen blokların toplamı ${preferredTotal}; haftalık saat ${load} olmalı.`,
          };
        }

        const invalidAllowed = allowed.find(
          (item) => item.reduce((sum, duration) => sum + duration, 0) !== load,
        );
        if (invalidAllowed) {
          return {
            input: null,
            error: 'Alternatif blok yapılarının her biri haftalık ders saatine eşit olmalı.',
          };
        }
      }

      return {
        input: {
          requirementId: row.requirementId,
          weeklyLoad: load,
          preferredPartition: preferred,
          allowedPartitions: allowed,
          termStatus,
        },
        error: null,
      };
    } catch (reason: unknown) {
      return {
        input: null,
        error: reason instanceof Error
          ? reason.message
          : 'Blok yapısı okunamadı.',
      };
    }
  }, [
    allowedPartitions,
    preferredPartition,
    row.requirementId,
    termStatus,
    weeklyLoad,
  ]);

  const runPreview = async () => {
    if (!draftSummary.input || previewing) return;

    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);

    try {
      setPreview(await onPreview(draftSummary.input));
    } catch (reason: unknown) {
      setPreviewError(
        reason instanceof Error
          ? reason.message
          : 'Etki önizlemesi oluşturulamadı.',
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
      <div className="management-scrollbar max-h-[92vh] w-full max-w-[920px] overflow-y-auto rounded-[28px] border border-white/80 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Ders Yapısı · Etki Önizlemesi
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              {row.subjectName} · {audience}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Haftalık saat, blok yapısı ve dönem durumunun program kartlarına etkisini kaydetmeden önce görün.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={previewing}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Kapat
          </button>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-[10px] font-black text-blue-800">
                Yalnızca önizleme
              </p>
              <p className="mt-1 text-[10px] font-medium leading-5 text-blue-700">
                Bu ekranda hiçbir ders tanımı, kart veya program yerleşimi değiştirilmez.
              </p>
            </div>

            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Haftalık ders saati
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={weeklyLoad}
                onChange={(event) => {
                  setWeeklyLoad(event.target.value);
                  setPreview(null);
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Tercih edilen blok yapısı
              </span>
              <input
                type="text"
                value={preferredPartition}
                onChange={(event) => {
                  setPreferredPartition(event.target.value);
                  setPreview(null);
                }}
                placeholder="2 + 2 + 1"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 focus:bg-white"
              />
              <p className="mt-1 text-[9px] font-medium text-slate-400">
                Örnek: 2 + 2 + 1 veya 3 + 2
              </p>
            </label>

            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                İzin verilen alternatifler
              </span>
              <input
                type="text"
                value={allowedPartitions}
                onChange={(event) => {
                  setAllowedPartitions(event.target.value);
                  setPreview(null);
                }}
                placeholder="2 + 2 + 1; 3 + 2"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 focus:bg-white"
              />
              <p className="mt-1 text-[9px] font-medium text-slate-400">
                Alternatifleri noktalı virgülle ayırın. Boş bırakılabilir.
              </p>
            </label>

            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Dönem durumu
              </span>
              <select
                value={termStatus}
                onChange={(event) => {
                  setTermStatus(event.target.value as ManagementPlanTermStatus);
                  setPreview(null);
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 focus:bg-white"
              >
                <option value="ACTIVE">Bu dönem aktif</option>
                <option value="INACTIVE">Bu dönem kapalı</option>
                <option value="UNKNOWN">Dönem durumu belirsiz</option>
              </select>
            </label>

            {draftSummary.error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-bold leading-5 text-rose-700">
                {draftSummary.error}
              </div>
            )}

            {previewError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-bold leading-5 text-rose-700">
                {previewError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={previewing || !draftSummary.input}
              className="w-full rounded-xl bg-slate-950 px-4 py-3 text-[11px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {previewing ? 'Etki hesaplanıyor…' : 'Etkiyi hesapla'}
            </button>
          </div>

          <div className="space-y-4">
            {!preview ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
                <div>
                  <p className="text-sm font-black text-slate-600">
                    Önizleme henüz hesaplanmadı
                  </p>
                  <p className="mt-2 max-w-[420px] text-[11px] font-medium leading-5 text-slate-400">
                    Sol tarafta denemek istediğiniz yapıyı girin. Sistem hangi blokların korunacağını, oluşacağını veya kaldırılacağını gösterecek.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Şimdi
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {preview.current.weeklyLoad} saat
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-slate-600">
                      {partitionText(preview.current.preferredPartition)}
                    </p>
                    <p className="mt-2 text-[10px] font-medium text-slate-500">
                      {preview.current.cardCount} blok · {preview.current.placedBlockCount ?? 0} yerleşmiş
                    </p>
                    <p className="mt-1 text-[9px] font-medium text-slate-400">
                      {termLabel(preview.current.termStatus)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-blue-500">
                      Sonra
                    </p>
                    <p className="mt-2 text-lg font-black text-blue-950">
                      {preview.proposed.weeklyLoad} saat
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-blue-800">
                      {preview.proposed.termStatus === 'ACTIVE'
                        ? partitionText(preview.proposed.preferredPartition)
                        : 'Program kartı oluşturulmayacak'}
                    </p>
                    <p className="mt-2 text-[10px] font-medium text-blue-700">
                      {preview.proposed.cardCount} blok
                    </p>
                    <p className="mt-1 text-[9px] font-medium text-blue-500">
                      {termLabel(preview.proposed.termStatus)}
                    </p>
                  </div>
                </div>

                <div className={`rounded-2xl border p-4 ${
                  preview.canApply
                    ? 'border-emerald-200 bg-emerald-50'
                    : preview.hasChanges
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-slate-50'
                }`}>
                  <p className={`text-[11px] font-black ${
                    preview.canApply
                      ? 'text-emerald-800'
                      : preview.hasChanges
                        ? 'text-amber-800'
                        : 'text-slate-700'
                  }`}>
                    {preview.canApply
                      ? 'Bu değişiklik uygulanabilir görünüyor.'
                      : preview.hasChanges
                        ? 'Bu değişiklik doğrudan uygulanamaz.'
                        : 'Mevcut ders yapısıyla aynı.'}
                  </p>

                  {preview.blockReasons.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {preview.blockReasons.map((reason) => (
                        <p
                          key={reason}
                          className="text-[10px] font-medium leading-5 text-slate-600"
                        >
                          • {impactReasonLabel(reason)}
                        </p>
                      ))}
                    </div>
                  )}

                  {preview.blockReasons.includes('PLACED_CARD_REMOVAL_REQUIRED') && (
                    <button
                      type="button"
                      onClick={() => onOpenProgram(row.requirementId, stage)}
                      className="mt-3 text-[10px] font-black text-blue-700 hover:text-blue-900"
                    >
                      Programda göster →
                    </button>
                  )}
                </div>

                {preview.ambiguities.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[10px] font-black text-amber-900">
                      İnsan kararı gerekiyor
                    </p>
                    <div className="mt-2 space-y-2">
                      {preview.ambiguities.map((item) => (
                        <div
                          key={`${item.code}:${item.durationPeriods}`}
                          className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"
                        >
                          <p className="text-[10px] font-bold text-amber-900">
                            {item.durationPeriods} saatlik bloklar
                          </p>
                          <p className="mt-1 text-[9px] font-medium leading-4 text-amber-700">
                            {item.currentCount} mevcut → {item.proposedCount} kalacak · {item.placedCount} yerleşmiş. {item.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Korunacak
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {preview.preservedCards.length}
                    </p>
                    <div className="mt-2 space-y-1">
                      {preview.preservedCards.slice(0, 5).map((card) => (
                        <p key={card.cardId} className="text-[9px] font-medium text-slate-500">
                          {cardLabel(card.durationPeriods, card.proposedBlockIndex)}
                          {card.placed ? ' · programda' : ''}
                        </p>
                      ))}
                      {preview.preservedCards.length > 5 && (
                        <p className="text-[9px] font-bold text-slate-400">
                          +{preview.preservedCards.length - 5} blok daha
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-rose-500">
                      Kaldırılacak
                    </p>
                    <p className="mt-1 text-xl font-black text-rose-900">
                      {preview.removedCards.length}
                    </p>
                    <div className="mt-2 space-y-1">
                      {preview.removedCards.slice(0, 5).map((card) => (
                        <p key={card.cardId} className="text-[9px] font-medium text-rose-700">
                          {cardLabel(card.durationPeriods, card.currentBlockIndex)}
                          {card.placed ? ' · YERLEŞMİŞ' : ''}
                        </p>
                      ))}
                      {preview.removedCards.length > 5 && (
                        <p className="text-[9px] font-bold text-rose-500">
                          +{preview.removedCards.length - 5} blok daha
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">
                      Yeni
                    </p>
                    <p className="mt-1 text-xl font-black text-emerald-900">
                      {preview.createdBlocks.length}
                    </p>
                    <div className="mt-2 space-y-1">
                      {preview.createdBlocks.slice(0, 5).map((block) => (
                        <p
                          key={block.proposedBlockIndex}
                          className="text-[9px] font-medium text-emerald-700"
                        >
                          {cardLabel(
                            block.durationPeriods,
                            block.proposedBlockIndex,
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Yeniden hesaplama kapsamı
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-slate-700">
                    {preview.candidateRebuildCardCount} kart
                  </p>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-400">
                    Yalnız bu ders tanımının sonuçtaki kartları yeniden değerlendirilecek. Diğer derslerin uygun yer hesaplarına dokunulmayacak.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-medium leading-5 text-slate-500">
                  Bu ekran bir karar önizlemesidir. Bu aşamada “Uygula” işlemi yoktur; ders planında kalıcı yapısal değişiklik yapılmaz.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

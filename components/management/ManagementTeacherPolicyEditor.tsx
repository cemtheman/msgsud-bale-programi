'use client';

import { useEffect, useState } from 'react';
import {
  type ManagementCoursePlanRow,
  type ManagementPlanStage,
  type ManagementTeacherAssignmentScope,
  type ManagementTeacherContinuity,
  type ManagementTeacherPolicyPreview,
  type ManagementTeacherReconciliationPreview,
} from '@/lib/managementCoursePlan';

const DAY_LABELS: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
};

function reconciliationReasonLabel(code: string) {
  const labels: Record<string, string> = {
    CARD_LOCKED: 'Etkilenen bloklardan biri kilitli.',
    RESOURCE_INACTIVE: 'Seçilen öğretmen atamaya kapalı.',
    TEACHER_CONFLICT: 'Seçilen öğretmenin aynı saatte başka bir dersi var.',
    TEACHER_NOT_ELIGIBLE: 'Seçilen öğretmen bu dersin uygun öğretmen havuzunda değil.',
    POLICY_NOT_REQUIREMENT_REQUIRED: 'Bu ders tüm bloklarda aynı öğretmen kuralında değil.',
    REQUIREMENT_INACTIVE: 'Bu ders bu dönem aktif değil.',
    NO_PLACED_BLOCKS: 'Uzlaştırılacak yerleşmiş blok yok.',
    NO_CHANGES: 'Bütün yerleşmiş bloklar zaten bu öğretmeni kullanıyor.',
    TOO_MANY_CHANGED_BLOCKS: 'Tek işlem için çok fazla blok etkileniyor.',
  };

  return labels[code] ?? code;
}

type PolicyChoice =
  | 'SAME_TEACHER'
  | 'FLEXIBLE_PREFERRED'
  | 'FLEXIBLE'
  | 'UNSPECIFIED';

function policyChoice(
  scope: ManagementTeacherAssignmentScope,
  continuity: ManagementTeacherContinuity,
): PolicyChoice {
  if (scope === 'REQUIREMENT' && continuity === 'REQUIRED') {
    return 'SAME_TEACHER';
  }
  if (scope === 'BLOCK' && continuity === 'PREFERRED') {
    return 'FLEXIBLE_PREFERRED';
  }
  if (scope === 'BLOCK' && continuity === 'NONE') {
    return 'FLEXIBLE';
  }
  return 'UNSPECIFIED';
}

function policyValues(choice: PolicyChoice): {
  scope: ManagementTeacherAssignmentScope;
  continuity: ManagementTeacherContinuity;
} {
  if (choice === 'SAME_TEACHER') {
    return { scope: 'REQUIREMENT', continuity: 'REQUIRED' };
  }
  if (choice === 'FLEXIBLE_PREFERRED') {
    return { scope: 'BLOCK', continuity: 'PREFERRED' };
  }
  if (choice === 'FLEXIBLE') {
    return { scope: 'BLOCK', continuity: 'NONE' };
  }
  return { scope: 'UNSPECIFIED', continuity: 'NONE' };
}

const OPTIONS: Array<{
  id: PolicyChoice;
  title: string;
  detail: string;
}> = [
  {
    id: 'SAME_TEACHER',
    title: 'Tüm bloklarda aynı öğretmen',
    detail: 'Öğretmen havuzundan bir öğretmen seçilir; haftanın tüm blokları aynı öğretmenle yürütülür.',
  },
  {
    id: 'FLEXIBLE_PREFERRED',
    title: 'Bloklar esnek, aynı öğretmen tercih edilsin',
    detail: 'Farklı öğretmenlere izin verilir; otomatik planlama mümkünse öğretmen sürekliliğini tercih eder.',
  },
  {
    id: 'FLEXIBLE',
    title: 'Her blok ayrı öğretmen seçebilir',
    detail: 'Her haftalık blok uygun öğretmen havuzundan bağımsız seçim yapabilir.',
  },
  {
    id: 'UNSPECIFIED',
    title: 'Henüz belirlenmedi',
    detail: 'Manuel çalışma devam eder; tam otomatik planlama için bu kural daha sonra netleştirilmelidir.',
  },
];

export function ManagementTeacherPolicyEditor({
  row,
  stage,
  onClose,
  onOpenProgram,
  onPreview,
  onApply,
  onPreviewReconciliation,
  onApplyReconciliation,
}: {
  row: ManagementCoursePlanRow;
  stage: ManagementPlanStage;
  onClose: () => void;
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void;
  onPreview: (
    requirementId: string,
    scope: ManagementTeacherAssignmentScope,
    continuity: ManagementTeacherContinuity,
  ) => Promise<ManagementTeacherPolicyPreview>;
  onApply: (
    requirementId: string,
    scope: ManagementTeacherAssignmentScope,
    continuity: ManagementTeacherContinuity,
    expectedStateToken: string,
  ) => Promise<void>;
  onPreviewReconciliation: (
    requirementId: string,
    teacherId: string,
  ) => Promise<ManagementTeacherReconciliationPreview>;
  onApplyReconciliation: (
    requirementId: string,
    teacherId: string,
    expectedStateToken: string,
  ) => Promise<void>;
}) {
  const initial = policyChoice(
    row.teacherAssignmentScope,
    row.teacherContinuity,
  );
  const [choice, setChoice] = useState<PolicyChoice>(initial);
  const [preview, setPreview] = useState<ManagementTeacherPolicyPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciliationTeacherId, setReconciliationTeacherId] =
    useState<string | null>(null);
  const [reconciliationPreview, setReconciliationPreview] =
    useState<ManagementTeacherReconciliationPreview | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationApplying, setReconciliationApplying] = useState(false);
  const [reconciliationError, setReconciliationError] =
    useState<string | null>(null);

  useEffect(() => {
    setChoice(initial);
    setPreview(null);
    setError(null);
    setReconciliationTeacherId(null);
    setReconciliationPreview(null);
    setReconciliationError(null);
  }, [initial, row.requirementId]);

  const runPreview = async () => {
    if (previewing || applying) return;

    const next = policyValues(choice);
    setPreviewing(true);
    setError(null);

    try {
      setPreview(await onPreview(
        row.requirementId,
        next.scope,
        next.continuity,
      ));
    } catch (reason: unknown) {
      setPreview(null);
      setError(
        reason instanceof Error
          ? reason.message
          : 'Öğretmen kuralının etkisi hesaplanamadı.',
      );
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    if (!preview || !preview.canApply || applying || previewing) return;

    setApplying(true);
    setError(null);
    try {
      await onApply(
        row.requirementId,
        preview.proposedScope,
        preview.proposedContinuity,
        preview.stateToken,
      );
      onClose();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Öğretmen kuralı kaydedilemedi.',
      );
    } finally {
      setApplying(false);
    }
  };

  const runReconciliationPreview = async () => {
    if (!reconciliationTeacherId || reconciling || reconciliationApplying) {
      return;
    }

    setReconciling(true);
    setReconciliationError(null);

    try {
      setReconciliationPreview(await onPreviewReconciliation(
        row.requirementId,
        reconciliationTeacherId,
      ));
    } catch (reason: unknown) {
      setReconciliationPreview(null);
      setReconciliationError(
        reason instanceof Error
          ? reason.message
          : 'Öğretmen uzlaştırmasının etkisi hesaplanamadı.',
      );
    } finally {
      setReconciling(false);
    }
  };

  const applyReconciliation = async () => {
    if (
      !reconciliationPreview
      || !reconciliationPreview.canApply
      || reconciliationApplying
      || reconciling
    ) {
      return;
    }

    setReconciliationApplying(true);
    setReconciliationError(null);

    try {
      await onApplyReconciliation(
        row.requirementId,
        reconciliationPreview.teacherId,
        reconciliationPreview.stateToken,
      );
      onClose();
    } catch (reason: unknown) {
      setReconciliationError(
        reason instanceof Error
          ? reason.message
          : 'Öğretmen uzlaştırması uygulanamadı.',
      );
    } finally {
      setReconciliationApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[680px] rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              Öğretmen Kuralı
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {row.subjectName} · {row.classCodes.join(' + ') || row.groupName}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Öğretmen seçiminin haftalık bloklar arasında nasıl davranacağını belirleyin.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={previewing || applying || reconciling || reconciliationApplying}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Kapat
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-[10px] font-medium leading-5 text-blue-800">
          Bu kural öğretmen havuzunu değiştirmez. Mevcut yerleşimler de otomatik
          olarak yeniden yazılmaz; önce etki önizlemesi yapılır.
        </div>

        <div className="mt-4 space-y-2">
          {OPTIONS.map((option) => {
            const selected = choice === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setChoice(option.id);
                  setPreview(null);
                  setError(null);
                  setReconciliationTeacherId(null);
                  setReconciliationPreview(null);
                  setReconciliationError(null);
                }}
                disabled={previewing || applying || reconciling || reconciliationApplying}
                className={
                  selected
                    ? 'w-full rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-left text-white'
                    : 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-700 hover:bg-slate-50'
                }
              >
                <p className="text-[11px] font-black">{option.title}</p>
                <p className={
                  selected
                    ? 'mt-1 text-[9px] font-medium leading-4 text-slate-300'
                    : 'mt-1 text-[9px] font-medium leading-4 text-slate-500'
                }>
                  {option.detail}
                </p>
              </button>
            );
          })}
        </div>

        {preview && (
          <div className={'mt-4 rounded-2xl border p-4 ' + (
            preview.canApply
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          )}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={'text-[10px] font-black ' + (
                  preview.canApply ? 'text-emerald-800' : 'text-amber-800'
                )}>
                  {preview.canApply
                    ? 'Bu kural mevcut programla uyumlu.'
                    : 'Bu kural mevcut yerleşimlerle çelişiyor.'}
                </p>
                <p className="mt-1 text-[9px] font-medium text-slate-600">
                  {preview.placedBlockCount} yerleşmiş blok · {' '}
                  {preview.distinctResolvedTeacherCount} farklı öğretmen
                </p>
              </div>

              {preview.placedBlockCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProgram(row.requirementId, stage);
                  }}
                  className="shrink-0 text-[9px] font-black text-blue-700 hover:text-blue-900"
                >
                  Programda göster →
                </button>
              )}
            </div>

            {preview.blockReasons.length > 0 && (
              <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-[9px] font-bold text-amber-800">
                {preview.blockReasons.join(' ')}
              </div>
            )}

            {preview.placedBlocks.length > 0 && (
              <div className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto">
                {preview.placedBlocks.map((block) => (
                  <div
                    key={block.cardId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-[9px]"
                  >
                    <span className="font-black text-slate-700">
                      Blok {block.blockIndex} · {DAY_LABELS[block.dayOfWeek] ?? (String(block.dayOfWeek) + '. gün')} · {block.startPeriod}. ders
                    </span>
                    <span className="font-semibold text-slate-500">
                      {block.teacherName ?? 'Öğretmen belirsiz'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview
          && !preview.canApply
          && preview.proposedScope === 'REQUIREMENT'
          && preview.proposedContinuity === 'REQUIRED'
          && preview.distinctResolvedTeacherCount > 1
          && row.teacherIds.length > 0 && (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div>
              <p className="text-[10px] font-black text-violet-900">
                Öğretmenleri uzlaştır
              </p>
              <p className="mt-1 text-[9px] font-medium leading-4 text-violet-800">
                Dersin uygun öğretmenlerinden birini seçin. Partisyon önce tüm
                yerleşmiş blokların gün, saat ve salonunu koruyarak bu öğretmene
                geçirmenin mümkün olup olmadığını kontrol eder.
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {row.teacherIds.map((teacherId, index) => {
                const selected = reconciliationTeacherId === teacherId;
                return (
                  <button
                    key={teacherId}
                    type="button"
                    onClick={() => {
                      setReconciliationTeacherId(teacherId);
                      setReconciliationPreview(null);
                      setReconciliationError(null);
                    }}
                    disabled={reconciling || reconciliationApplying}
                    className={
                      selected
                        ? 'rounded-xl border border-violet-900 bg-violet-900 px-3 py-2.5 text-left text-[10px] font-black text-white'
                        : 'rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-left text-[10px] font-black text-violet-900 hover:bg-violet-100'
                    }
                  >
                    {row.teacherNames[index] ?? 'Öğretmen'}
                  </button>
                );
              })}
            </div>

            {reconciliationPreview && (
              <div className={'mt-3 rounded-xl border p-3 ' + (
                reconciliationPreview.canApply
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50'
              )}>
                <p className={'text-[10px] font-black ' + (
                  reconciliationPreview.canApply
                    ? 'text-emerald-800'
                    : 'text-amber-800'
                )}>
                  {reconciliationPreview.canApply
                    ? 'Mevcut saat ve salonlar korunarak uzlaştırılabilir.'
                    : 'Bu öğretmenle mevcut yerleşimlerin tamamı korunamıyor.'}
                </p>
                <p className="mt-1 text-[9px] font-medium text-slate-600">
                  {reconciliationPreview.changedBlockCount} blokta öğretmen değişecek
                  {reconciliationPreview.unplacedBlockCount > 0
                    ? ` · ${reconciliationPreview.unplacedBlockCount} blok henüz yerleşmemiş`
                    : ''}
                </p>

                {reconciliationPreview.blockReasons.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {reconciliationPreview.blockReasons.map((reason) => (
                      <p
                        key={reason}
                        className="text-[9px] font-bold text-amber-800"
                      >
                        {reconciliationReasonLabel(reason)}
                      </p>
                    ))}
                  </div>
                )}

                {reconciliationPreview.conflicts.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {reconciliationPreview.conflicts.map((conflict) => (
                      <div
                        key={conflict.cardId + ':' + conflict.blockingCardId}
                        className="rounded-lg bg-white/80 px-2.5 py-2 text-[9px] text-slate-700"
                      >
                        <span className="font-black">
                          {DAY_LABELS[conflict.dayOfWeek] ?? conflict.dayOfWeek}
                          {' · '}
                          {conflict.startPeriod}. ders
                        </span>
                        {' — '}
                        {conflict.subjectName} · {conflict.groupName}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 max-h-[160px] space-y-1.5 overflow-y-auto">
                  {reconciliationPreview.placements.map((block) => (
                    <div
                      key={block.cardId}
                      className="flex items-center justify-between gap-3 rounded-lg bg-white/75 px-2.5 py-2 text-[9px]"
                    >
                      <span className="font-black text-slate-700">
                        Blok {block.blockIndex} · {' '}
                        {DAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek} · {' '}
                        {block.startPeriod}. ders
                      </span>
                      <span className={
                        block.willChange
                          ? 'font-bold text-violet-700'
                          : 'font-semibold text-slate-500'
                      }>
                        {block.willChange
                          ? `${block.teacherName ?? 'Belirsiz'} → ${reconciliationPreview.teacherName}`
                          : reconciliationPreview.teacherName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reconciliationError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                {reconciliationError}
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void runReconciliationPreview()}
                disabled={
                  !reconciliationTeacherId
                  || reconciling
                  || reconciliationApplying
                }
                className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-[9px] font-black text-violet-900 hover:bg-violet-100 disabled:opacity-40"
              >
                {reconciling ? 'Kontrol ediliyor…' : 'Uzlaştırmayı kontrol et'}
              </button>
              <button
                type="button"
                onClick={() => void applyReconciliation()}
                disabled={
                  !reconciliationPreview?.canApply
                  || reconciling
                  || reconciliationApplying
                }
                className="rounded-xl bg-violet-900 px-3 py-2 text-[9px] font-black text-white hover:bg-violet-800 disabled:opacity-35"
              >
                {reconciliationApplying
                  ? 'Uygulanıyor…'
                  : 'Tüm bloklarda bu öğretmeni kullan'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="max-w-[390px] text-[9px] font-medium leading-4 text-slate-500">
            “Aynı öğretmen” seçeneği mevcut bloklarda farklı öğretmenler varsa
            kaydedilmez; önce bu yerleşimlerin uzlaştırılması gerekir.
          </p>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={previewing || applying || reconciling || reconciliationApplying}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {previewing ? 'Kontrol ediliyor…' : 'Etkiyi kontrol et'}
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={
                !preview?.canApply
                || previewing
                || applying
                || reconciling
                || reconciliationApplying
              }
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {applying ? 'Kaydediliyor…' : 'Kuralı kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  type ManagementCoordinatedTeacherAssignmentInput,
  type ManagementCoordinatedTeacherPreview,
  type ManagementCoursePlanRow,
  type ManagementTeacherContinuityViolation,
} from '@/lib/managementCoursePlan';

const DAY_LABELS: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
};

function blockerLabel(code: string) {
  const labels: Record<string, string> = {
    TEACHER_CONFLICT: 'Öğretmen çakışması var.',
    CARD_LOCKED: 'Değişmesi gereken bloklardan biri kilitli.',
    RESOURCE_INACTIVE: 'Seçilen öğretmenlerden biri atamaya kapalı.',
    TEACHER_NOT_ELIGIBLE: 'Seçilen öğretmen dersin uygun öğretmen havuzunda değil.',
    POLICY_NOT_REQUIREMENT_REQUIRED: 'Derslerden birinin öğretmen kuralı bu işlemle uyumlu değil.',
    NO_CHANGES: 'Bu seçim programda değişiklik oluşturmuyor.',
  };
  return labels[code] ?? code;
}

export function ManagementTeacherContinuityResolver({
  violations,
  rows,
  onClose,
  onPreview,
  onApply,
}: {
  violations: ManagementTeacherContinuityViolation[];
  rows: ManagementCoursePlanRow[];
  onClose: () => void;
  onPreview: (
    assignments: ManagementCoordinatedTeacherAssignmentInput[],
  ) => Promise<ManagementCoordinatedTeacherPreview>;
  onApply: (
    assignments: ManagementCoordinatedTeacherAssignmentInput[],
    expectedStateToken: string,
  ) => Promise<void>;
}) {
  const violationRows = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.requirementId, row]));
    return violations
      .map((violation) => ({
        violation,
        row: byId.get(violation.requirementId) ?? null,
      }))
      .filter((item): item is {
        violation: ManagementTeacherContinuityViolation;
        row: ManagementCoursePlanRow;
      } => Boolean(item.row));
  }, [rows, violations]);

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [preview, setPreview] =
    useState<ManagementCoordinatedTeacherPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignments = violationRows.flatMap(({ row }) => {
    const teacherId = selected[row.requirementId];
    return teacherId
      ? [{ requirementId: row.requirementId, teacherId }]
      : [];
  });

  const complete = assignments.length === violationRows.length
    && violationRows.length > 0;

  const choose = (requirementId: string, teacherId: string) => {
    setSelected((current) => ({
      ...current,
      [requirementId]: teacherId,
    }));
    setPreview(null);
    setError(null);
  };

  const runPreview = async () => {
    if (!complete || previewing || applying) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await onPreview(assignments));
    } catch (reason: unknown) {
      setPreview(null);
      setError(
        reason instanceof Error
          ? reason.message
          : 'Koordineli öğretmen planı hesaplanamadı.',
      );
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    if (!preview?.canApply || previewing || applying) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(assignments, preview.stateToken);
      onClose();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Koordineli öğretmen planı uygulanamadı.',
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[98] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[780px] rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.26)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-500">
              Öğretmen Sürekliliği
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              Çakışan dersleri birlikte uzlaştır
            </h3>
            <p className="mt-1 max-w-[620px] text-[11px] font-medium leading-5 text-slate-500">
              Birbirini karşılıklı bloke eden dersler tek tek değil, önerilen
              son durum birlikte değerlendirilir. Gün, saat ve salonlar korunur.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={previewing || applying}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Kapat
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {violationRows.map(({ violation, row }) => (
            <div
              key={row.requirementId}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black text-slate-900">
                    {row.subjectName} · {row.classCodes.join(' + ') || row.groupName}
                  </p>
                  <p className="mt-1 text-[9px] font-medium text-slate-500">
                    {violation.placedBlocks} yerleşmiş blok · mevcut programda
                    {' '}{violation.distinctResolvedTeachers} farklı öğretmen
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[8px] font-black text-violet-700">
                  Tek öğretmen gerekli
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {row.teacherIds.map((teacherId, index) => {
                  const active = selected[row.requirementId] === teacherId;
                  return (
                    <button
                      key={teacherId}
                      type="button"
                      onClick={() => choose(row.requirementId, teacherId)}
                      disabled={previewing || applying}
                      className={
                        active
                          ? 'rounded-xl border border-slate-950 bg-slate-950 px-3 py-2.5 text-left text-[10px] font-black text-white'
                          : 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[10px] font-black text-slate-700 hover:bg-slate-100'
                      }
                    >
                      {row.teacherNames[index] ?? 'Öğretmen'}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {preview && (
          <div className={'mt-4 rounded-2xl border p-4 ' + (
            preview.canApply
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          )}>
            <p className={'text-[10px] font-black ' + (
              preview.canApply ? 'text-emerald-800' : 'text-amber-800'
            )}>
              {preview.canApply
                ? 'Bu koordineli dağılım uygulanabilir.'
                : 'Bu dağılım hâlâ çakışma oluşturuyor.'}
            </p>
            <p className="mt-1 text-[9px] font-medium text-slate-600">
              {preview.changedBlockCount} blokta yalnız öğretmen değişecek ·
              gün, saat ve salon korunacak
            </p>

            <div className="mt-3 space-y-1.5">
              {preview.assignments.map((assignment) => (
                <div
                  key={assignment.requirementId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-[9px]"
                >
                  <span className="font-black text-slate-700">
                    {assignment.groupName} · {assignment.subjectName}
                  </span>
                  <span className="font-bold text-violet-700">
                    {assignment.teacherName} · {assignment.changedBlockCount} blok değişir
                  </span>
                </div>
              ))}
            </div>

            {preview.blockReasons.length > 0 && (
              <div className="mt-3 space-y-1">
                {preview.blockReasons.map((reason) => (
                  <p key={reason} className="text-[9px] font-bold text-amber-800">
                    {blockerLabel(reason)}
                  </p>
                ))}
              </div>
            )}

            {preview.conflicts.length > 0 && (
              <div className="mt-3 max-h-[160px] space-y-1.5 overflow-y-auto">
                {preview.conflicts.map((conflict) => (
                  <div
                    key={conflict.leftCardId + ':' + conflict.rightCardId}
                    className="rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-[9px] text-slate-700"
                  >
                    <span className="font-black">
                      {DAY_LABELS[conflict.dayOfWeek] ?? conflict.dayOfWeek}
                      {' · '}
                      {Math.min(conflict.leftStartPeriod, conflict.rightStartPeriod)}. ders
                    </span>
                    {' — '}
                    {conflict.leftGroupName} / {conflict.rightGroupName}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="max-w-[430px] text-[9px] font-medium leading-4 text-slate-500">
            Partisyon seçim yapmaz. Öğretmenleri siz belirlersiniz; sistem son
            durumu birlikte kontrol eder ve tek işlem olarak geri alınabilir
            biçimde uygular.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={!complete || previewing || applying}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-35"
            >
              {previewing ? 'Kontrol ediliyor…' : 'Son durumu kontrol et'}
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!preview?.canApply || previewing || applying}
              className="rounded-xl bg-violet-900 px-4 py-2.5 text-[10px] font-black text-white hover:bg-violet-800 disabled:opacity-35"
            >
              {applying ? 'Uygulanıyor…' : 'Koordineli uygula'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

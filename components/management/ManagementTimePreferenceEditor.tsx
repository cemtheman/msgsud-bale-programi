'use client';

import { useMemo, useState } from 'react';
import type { ManagementCoursePlanRow } from '@/lib/managementCoursePlan';

const DAYS = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
] as const;

const PERIODS = Array.from({ length: 12 }, (_, index) => index + 1);

export function ManagementTimePreferenceEditor({
  row,
  onClose,
  onSave,
}: {
  row: ManagementCoursePlanRow;
  onClose: () => void;
  onSave: (
    requirementId: string,
    preferredDays: number[],
    preferredStartPeriods: number[],
  ) => Promise<void>;
}) {
  const [days, setDays] = useState<number[]>([...row.preferredDays]);
  const [periods, setPeriods] = useState<number[]>([
    ...row.preferredStartPeriods,
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = useMemo(() => (
    [...row.preferredDays].sort((a, b) => a - b).join(',')
      !== [...days].sort((a, b) => a - b).join(',')
    || [...row.preferredStartPeriods].sort((a, b) => a - b).join(',')
      !== [...periods].sort((a, b) => a - b).join(',')
  ), [days, periods, row.preferredDays, row.preferredStartPeriods]);

  const toggle = (
    value: number,
    current: number[],
    setter: (next: number[]) => void,
  ) => {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].sort((a, b) => a - b),
    );
    setError(null);
  };

  const save = async () => {
    if (saving || !changed) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(row.requirementId, days, periods);
      onClose();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Zaman tercihleri kaydedilemedi.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-[680px] rounded-[28px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#A63D48]">
              Zaman Tercihi
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {row.subjectName} · {row.classCodes.join(', ') || row.groupName}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Bu tercihler zorunlu kural değildir; otomatik planlama mümkün olduğunda bunlara yaklaşır.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Kapat
          </button>
        </div>

        <div className="p-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Tercih edilen günler
                </p>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  Hiç gün seçmezseniz haftanın bütün günleri eşit kabul edilir.
                </p>
              </div>
              {days.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDays([])}
                  disabled={saving}
                  className="text-[10px] font-black text-slate-400 hover:text-slate-700"
                >
                  Temizle
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {DAYS.map((day) => {
                const selected = days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggle(day.value, days, setDays)}
                    disabled={saving}
                    className={selected
                      ? 'rounded-xl border border-slate-950 bg-slate-950 px-2 py-2.5 text-[10px] font-black text-white'
                      : 'rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-black text-slate-600 hover:bg-slate-50'}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Tercih edilen başlangıç dersleri
                </p>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  Yakın saatler daha düşük sapma alır; hiç seçim yoksa saat tercihi uygulanmaz.
                </p>
              </div>
              {periods.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPeriods([])}
                  disabled={saving}
                  className="text-[10px] font-black text-slate-400 hover:text-slate-700"
                >
                  Temizle
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {PERIODS.map((period) => {
                const selected = periods.includes(period);
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => toggle(period, periods, setPeriods)}
                    disabled={saving}
                    className={selected
                      ? 'rounded-xl border border-[#A63D48] bg-[#A63D48] px-2 py-2.5 text-[10px] font-black text-white'
                      : 'rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-black text-slate-600 hover:bg-slate-50'}
                  >
                    {period}. ders
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-[10px] font-black text-blue-900">Puanlama davranışı</p>
            <p className="mt-1 text-[10px] font-medium leading-4 text-blue-800">
              Seçili gün dışında kalan her blok bir sapma puanı alır. Saat seçiminde tercih edilen başlangıç saatine olan ders-saat uzaklığı puanlanır.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <p className="text-[10px] font-medium text-slate-500">
            {days.length === 0 && periods.length === 0
              ? 'Tercih kaldırılacak'
              : `${days.length} gün · ${periods.length} başlangıç saati`}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !changed}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:opacity-35"
          >
            {saving ? 'Kaydediliyor…' : 'Zaman tercihini kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

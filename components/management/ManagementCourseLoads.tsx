'use client';

import { useMemo, useState } from 'react';
import {
  deriveManagementCourseLoads,
  type ManagementCourseLoadRow,
  type ManagementLoadStatus,
} from '@/lib/managementLoads';
import type {
  ManagementBoardData,
  ManagementStage,
} from '@/lib/managementBoard';

type LoadFilter = 'EKSİK' | 'TAMAMLANAN' | 'TÜMÜ';

const LOAD_FILTERS: Array<{ id: LoadFilter; label: string }> = [
  { id: 'EKSİK', label: 'Eksik olanlar' },
  { id: 'TAMAMLANAN', label: 'Tamamlananlar' },
  { id: 'TÜMÜ', label: 'Tümü' },
];

function statusMeta(status: ManagementLoadStatus) {
  if (status === 'TAMAMLANDI') {
    return {
      label: 'Tamamlandı',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (status === 'BASLANMADI') {
    return {
      label: 'Başlanmadı',
      className: 'bg-slate-100 text-slate-600',
    };
  }

  if (status === 'FAZLA') {
    return {
      label: 'Fazla',
      className: 'bg-rose-100 text-rose-700',
    };
  }

  return {
    label: 'Eksik',
    className: 'bg-amber-100 text-amber-700',
  };
}

function classLabel(row: ManagementCourseLoadRow) {
  if (row.classCodes.length > 0) return row.classCodes.join(', ');
  return 'Ortak grup';
}

export function ManagementCourseLoads({
  board,
}: {
  board: ManagementBoardData | null;
}) {
  const [stage, setStage] = useState<ManagementStage>('ORTAOKUL');
  const [filter, setFilter] = useState<LoadFilter>('EKSİK');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('TÜMÜ');

  const summary = useMemo(
    () => deriveManagementCourseLoads(board, stage),
    [board, stage],
  );

  const classOptions = useMemo(() => {
    if (!summary) return [];

    const values = new Set<string>();
    summary.rows.forEach((row) => {
      row.classCodes.forEach((code) => values.add(code));
    });

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true }),
    );
  }, [summary]);

  const visibleRows = useMemo(() => {
    if (!summary) return [];

    const normalized = query.trim().toLocaleLowerCase('tr-TR');

    return summary.rows.filter((row) => {
      if (
        filter === 'EKSİK'
        && row.status === 'TAMAMLANDI'
      ) {
        return false;
      }

      if (
        filter === 'TAMAMLANAN'
        && row.status !== 'TAMAMLANDI'
      ) {
        return false;
      }

      if (
        classFilter !== 'TÜMÜ'
        && !row.classCodes.includes(classFilter)
      ) {
        return false;
      }

      if (!normalized) return true;

      return [
        row.subjectName,
        row.groupName,
        row.classCodes.join(' '),
        row.teacherNames.join(' '),
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(normalized);
    });
  }, [classFilter, filter, query, summary]);

  if (!summary) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Ders yükleri hazırlanıyor…
        </div>
      </section>
    );
  }

  const progress = summary.requiredLoad > 0
    ? Math.min((summary.placedLoad / summary.requiredLoad) * 100, 100)
    : 0;

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1160px] space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Ders Yükleri
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Haftalık ders saatleri
              </h2>
              <p className="mt-2 max-w-[680px] text-sm font-medium leading-6 text-slate-500">
                Her ders için haftalık gereken saat ile programa yerleştirilen saatleri karşılaştırın.
              </p>
            </div>

            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setStage('ORTAOKUL');
                  setClassFilter('TÜMÜ');
                }}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                  stage === 'ORTAOKUL'
                    ? 'bg-[#A63D48] text-white'
                    : 'text-slate-500 hover:bg-white'
                }`}
              >
                Ortaokul
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage('LISE');
                  setClassFilter('TÜMÜ');
                }}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                  stage === 'LISE'
                    ? 'bg-[#A63D48] text-white'
                    : 'text-slate-500 hover:bg-white'
                }`}
              >
                Lise
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                Genel ilerleme
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-black">
                  {summary.placedLoad} / {summary.requiredLoad}
                </p>
                <p className="text-[10px] font-semibold text-slate-300">
                  ders saati
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">
                Kalan
              </p>
              <p className="mt-2 text-2xl font-black text-amber-900">
                {summary.remainingLoad}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-amber-700">
                ders saati
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700">
                Tamamlanan
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-900">
                {summary.completeRequirements}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                ders yükü
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                Eksik kalan
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {summary.incompleteRequirements}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                ders yükü
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {LOAD_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${
                    filter === item.id
                      ? 'bg-slate-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ders, sınıf veya öğretmen ara"
                  className="w-[260px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                />

                <select
                  value={classFilter}
                  onChange={(event) => setClassFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white"
                  aria-label="Sınıf filtresi"
                >
                  <option value="TÜMÜ">Tüm sınıflar</option>
                  {classOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400">
                Bu filtrelere uyan ders yükü yok.
              </div>
            ) : (
              visibleRows.map((row) => {
                const meta = statusMeta(row.status);
                const rowProgress = row.weeklyLoad > 0
                  ? Math.min((row.placedLoad / row.weeklyLoad) * 100, 100)
                  : 0;

                return (
                  <div
                    key={row.requirementId}
                    className="grid grid-cols-[180px_minmax(0,1fr)_220px_140px] items-center gap-4 px-4 py-3.5"
                  >
                    <div>
                      <p className="text-[11px] font-black text-slate-900">
                        {classLabel(row)}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                        {row.groupName}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[12px] font-bold text-slate-900">
                          {row.subjectName}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black ${meta.className}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[9px] font-medium text-slate-400">
                        {row.teacherNames.length > 0
                          ? row.teacherNames.join(', ')
                          : 'Öğretmen bilgisi tamamlanmamış'}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold">
                        <span className="text-slate-500">
                          {row.placedLoad} / {row.weeklyLoad} saat
                        </span>
                        <span className="text-slate-400">
                          {row.placedBlocks} / {row.totalBlocks} blok
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            row.status === 'TAMAMLANDI'
                              ? 'bg-emerald-500'
                              : row.status === 'FAZLA'
                                ? 'bg-rose-500'
                                : 'bg-amber-400'
                          }`}
                          style={{ width: `${rowProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right">
                      {row.status === 'TAMAMLANDI' ? (
                        <span className="text-[10px] font-bold text-emerald-700">
                          Tam
                        </span>
                      ) : row.status === 'FAZLA' ? (
                        <span className="text-[10px] font-bold text-rose-700">
                          +{row.extraLoad} saat fazla
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700">
                          {row.remainingLoad} saat eksik
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  coursePlanMatchesStage,
  type ManagementCoursePlanData,
  type ManagementCoursePlanRow,
  type ManagementPlanStage,
  type ManagementPlanTermStatus,
} from '@/lib/managementCoursePlan';

type PlanFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

function termMeta(status: ManagementPlanTermStatus) {
  if (status === 'ACTIVE') {
    return {
      label: 'Bu dönem aktif',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (status === 'INACTIVE') {
    return {
      label: 'Bu dönem kapalı',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  return {
    label: 'Dönem durumu belirsiz',
    className: 'bg-amber-100 text-amber-700',
  };
}

function knowledgeLabel(value: string) {
  if (value === 'CONFIRMED') return 'Doğrulandı';
  if (value === 'OBSERVED') return 'Mevcut programdan alındı';
  return 'Doğrulanmayı bekliyor';
}

function characterLabel(value: string) {
  const labels: Record<string, string> = {
    ACADEMIC: 'Akademik',
    TECHNIQUE: 'Teknik',
    REPERTOIRE: 'Repertuvar',
    REHEARSAL: 'Birlikte çalışma',
    OTHER: 'Diğer',
  };

  return labels[value] ?? value;
}

function deliveryLabel(value: string) {
  const labels: Record<string, string> = {
    STANDARD: 'Standart',
    SHARED: 'Ortak',
    PARALLEL: 'Paralel',
  };

  return labels[value] ?? value;
}

function partitionLabel(row: ManagementCoursePlanRow) {
  if (row.preferredPartition.length === 0) return 'Henüz tanımlanmadı';
  return row.preferredPartition.join(' + ');
}

function teacherLabel(row: ManagementCoursePlanRow) {
  if (row.teacherMode === 'UNKNOWN' || row.teacherNames.length === 0) {
    return 'Öğretmen henüz belirlenmemiş';
  }

  return row.teacherNames.join(', ');
}

function roomLabel(row: ManagementCoursePlanRow) {
  if (row.resourceMode === 'UNKNOWN') {
    return 'Salon henüz belirlenmemiş';
  }

  if (row.resourceMode === 'CAPABILITY') {
    return row.requiredCapability
      ? `Uygun özellik: ${row.requiredCapability}`
      : 'Uygun salon özelliği aranıyor';
  }

  if (row.roomNames.length === 0) {
    return 'Salon henüz belirlenmemiş';
  }

  return row.roomNames.join(', ');
}

function audienceLabel(row: ManagementCoursePlanRow) {
  return row.classCodes.length > 0
    ? row.classCodes.join(', ')
    : 'Ortak grup';
}

export function ManagementCoursePlan({
  data,
  onOpenProgram,
}: {
  data: ManagementCoursePlanData | null;
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void;
}) {
  const [stage, setStage] = useState<ManagementPlanStage>('ORTAOKUL');
  const [filter, setFilter] = useState<PlanFilter>('ACTIVE');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('TÜMÜ');

  const stageRows = useMemo(
    () => data?.rows.filter((row) => coursePlanMatchesStage(row, stage)) ?? [],
    [data, stage],
  );

  const classOptions = useMemo(() => {
    const values = new Set<string>();
    stageRows.forEach((row) => row.classCodes.forEach((code) => values.add(code)));
    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true }),
    );
  }, [stageRows]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');

    return stageRows.filter((row) => {
      if (filter === 'ACTIVE' && row.termStatus !== 'ACTIVE') return false;
      if (filter === 'INACTIVE' && row.termStatus === 'ACTIVE') return false;

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
        row.roomNames.join(' '),
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(normalized);
    });
  }, [classFilter, filter, query, stageRows]);

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Ders planı hazırlanıyor…
        </div>
      </section>
    );
  }

  const activeCount = stageRows.filter((row) => row.termStatus === 'ACTIVE').length;
  const inactiveCount = stageRows.filter((row) => row.termStatus !== 'ACTIVE').length;
  const missingTeacherCount = stageRows.filter((row) => (
    row.termStatus === 'ACTIVE'
    && (row.teacherMode === 'UNKNOWN' || row.teacherNames.length === 0)
  )).length;
  const missingRoomCount = stageRows.filter((row) => (
    row.termStatus === 'ACTIVE'
    && (
      row.resourceMode === 'UNKNOWN'
      || (
        row.resourceMode !== 'CAPABILITY'
        && row.roomNames.length === 0
      )
    )
  )).length;

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1220px] space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Ders Planı
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Programa hangi dersler yerleştirilecek?
              </h2>
              <p className="mt-2 max-w-[760px] text-sm font-medium leading-6 text-slate-500">
                Haftalık ders saati, blok yapısı, öğrenci grubu, öğretmen ve salon tanımları burada görülür. Program ekranı bu tanımları haftaya yerleştirir.
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

          <div className="mt-5 grid grid-cols-4 gap-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                Aktif ders tanımı
              </p>
              <p className="mt-2 text-2xl font-black">{activeCount}</p>
              <p className="mt-1 text-[10px] font-medium text-slate-300">
                programa kart üretir
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                Bu dönem kapalı
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">{inactiveCount}</p>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                programa yerleştirilmez
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">
                Öğretmen eksik
              </p>
              <p className="mt-2 text-2xl font-black text-amber-900">{missingTeacherCount}</p>
              <p className="mt-1 text-[10px] font-medium text-amber-700">
                aktif ders tanımı
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-amber-700">
                Salon eksik
              </p>
              <p className="mt-2 text-2xl font-black text-amber-900">{missingRoomCount}</p>
              <p className="mt-1 text-[10px] font-medium text-amber-700">
                aktif ders tanımı
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter('ACTIVE')}
                className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${
                  filter === 'ACTIVE'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Aktif dersler
              </button>
              <button
                type="button"
                onClick={() => setFilter('INACTIVE')}
                className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${
                  filter === 'INACTIVE'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Dönem dışı / belirsiz
              </button>
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`rounded-full px-3 py-2 text-[10px] font-bold transition ${
                  filter === 'ALL'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tümü
              </button>

              <div className="ml-auto flex items-center gap-2">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ders, sınıf, öğretmen veya salon ara"
                  className="w-[300px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
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

          <div className="grid grid-cols-[135px_minmax(190px,1.1fr)_160px_minmax(180px,1fr)_minmax(180px,1fr)_135px] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            <span>Grup</span>
            <span>Ders</span>
            <span>Haftalık plan</span>
            <span>Öğretmen</span>
            <span>Salon</span>
            <span>Dönem</span>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400">
                Bu filtrelere uyan ders tanımı yok.
              </div>
            ) : (
              visibleRows.map((row) => {
                const term = termMeta(row.termStatus);

                return (
                  <div
                    key={row.requirementId}
                    className="grid grid-cols-[135px_minmax(190px,1.1fr)_160px_minmax(180px,1fr)_minmax(180px,1fr)_135px] items-center gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-900">
                        {audienceLabel(row)}
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
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">
                          {knowledgeLabel(row.knowledgeStatus)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[9px] font-medium text-slate-400">
                        {characterLabel(row.courseCharacter)} · {deliveryLabel(row.deliveryMode)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-black text-slate-900">
                        {row.weeklyLoad} saat
                      </p>
                      <p className="mt-1 text-[9px] font-semibold text-slate-500">
                        Blok: {partitionLabel(row)}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className={`truncate text-[10px] font-semibold ${
                        row.teacherMode === 'UNKNOWN'
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}>
                        {teacherLabel(row)}
                      </p>
                      {row.teacherMode === 'ELIGIBLE_POOL' && (
                        <p className="mt-1 text-[9px] font-medium text-slate-400">
                          Seçilebilir havuz
                        </p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className={`truncate text-[10px] font-semibold ${
                        row.resourceMode === 'UNKNOWN'
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}>
                        {roomLabel(row)}
                      </p>
                      {row.resourceMode === 'ELIGIBLE_POOL' && (
                        <p className="mt-1 text-[9px] font-medium text-slate-400">
                          Seçilebilir havuz
                        </p>
                      )}
                    </div>

                    <div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[8px] font-black ${term.className}`}>
                        {term.label}
                      </span>

                      {row.termStatus === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => onOpenProgram(row.requirementId, stage)}
                          className="mt-2 block text-[9px] font-bold text-blue-700 hover:text-blue-900"
                        >
                          Programda göster →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-medium leading-5 text-blue-800">
          Bu ilk sürüm ders planını güvenli biçimde gösterir. Haftalık saat, blok yapısı, öğretmen veya salon tanımını değiştirmek kart yapısını ve aday alanlarını etkilediği için düzenleme işlemleri ayrı bir kontrollü adımda bağlanacak.
        </div>
      </div>
    </section>
  );
}

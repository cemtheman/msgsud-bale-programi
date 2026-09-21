'use client';

import { useEffect, useMemo, useState } from 'react';
import { ManagementRequirementStructurePreview } from '@/components/management/ManagementRequirementStructurePreview';
import { ManagementRoomStrategyEditor } from '@/components/management/ManagementRoomStrategyEditor';
import {
  coursePlanMatchesStage,
  type ManagementCoursePlanData,
  type ManagementCoursePlanRow,
  type ManagementPlanStage,
  type ManagementPlanTermStatus,
  type ManagementRoomStrategy,
  type ManagementRequirementStructurePreview as ManagementRequirementStructurePreviewResult,
  type ManagementRequirementStructurePreviewInput,
} from '@/lib/managementCoursePlan';

type PlanFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';
type PlanViewMode = 'SUBJECT' | 'CLASS';
type EditKind = 'TEACHER' | 'ROOM';

interface PlanGroup {
  key: string;
  title: string;
  subtitle: string;
  rows: ManagementCoursePlanRow[];
  totalWeeklyLoad: number;
  missingTeacherCount: number;
  missingRoomCount: number;
}

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

function rowHasMissingTeacher(row: ManagementCoursePlanRow) {
  return (
    row.termStatus === 'ACTIVE'
    && (row.teacherMode === 'UNKNOWN' || row.teacherNames.length === 0)
  );
}

function rowHasMissingRoom(row: ManagementCoursePlanRow) {
  return (
    row.termStatus === 'ACTIVE'
    && (
      row.resourceMode === 'UNKNOWN'
      || (
        row.resourceMode !== 'CAPABILITY'
        && row.roomNames.length === 0
      )
    )
  );
}

function makeGroup(
  key: string,
  title: string,
  subtitle: string,
  rows: ManagementCoursePlanRow[],
): PlanGroup {
  return {
    key,
    title,
    subtitle,
    rows,
    totalWeeklyLoad: rows.reduce((sum, row) => sum + row.weeklyLoad, 0),
    missingTeacherCount: rows.filter(rowHasMissingTeacher).length,
    missingRoomCount: rows.filter(rowHasMissingRoom).length,
  };
}

function requirementRow(
  row: ManagementCoursePlanRow,
  firstColumn: 'GROUP' | 'SUBJECT',
  stage: ManagementPlanStage,
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void,
  canEdit: boolean,
  onEditTeacher: (row: ManagementCoursePlanRow) => void,
  onEditRoom: (row: ManagementCoursePlanRow) => void,
  onEditStructure: (row: ManagementCoursePlanRow) => void,
) {
  const term = termMeta(row.termStatus);

  return (
    <div
      key={row.requirementId}
      className="grid grid-cols-[minmax(170px,1.05fr)_150px_minmax(180px,1fr)_minmax(180px,1fr)_145px] items-center gap-3 border-t border-slate-100 px-4 py-3.5"
    >
      <div className="min-w-0">
        {firstColumn === 'GROUP' ? (
          <>
            <p className="text-[11px] font-black text-slate-900">
              {audienceLabel(row)}
            </p>
            <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
              {row.groupName}
            </p>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[11px] font-black text-slate-900">
                {row.subjectName}
              </p>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">
                {knowledgeLabel(row.knowledgeStatus)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
              {characterLabel(row.courseCharacter)} · {deliveryLabel(row.deliveryMode)}
            </p>
          </>
        )}
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
          rowHasMissingTeacher(row)
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
          rowHasMissingRoom(row)
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

        {canEdit && (
          <div className="mt-2 flex flex-wrap gap-1">
            {row.termStatus === 'ACTIVE' && (
              <>
                <button
                  type="button"
                  onClick={() => onEditTeacher(row)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  Öğretmen
                </button>
                <button
                  type="button"
                  onClick={() => onEditRoom(row)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[8px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  Salon
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onEditStructure(row)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[8px] font-bold text-blue-700 hover:bg-blue-100"
            >
              Ders yapısı
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ManagementCoursePlan({
  data,
  onOpenProgram,
  canEdit,
  onUpdateTeachers,
  onUpdateRoomStrategy,
  onPreviewStructure,
  onApplyStructure,
}: {
  data: ManagementCoursePlanData | null;
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void;
  canEdit: boolean;
  onUpdateTeachers: (
    requirementId: string,
    teacherIds: string[],
  ) => Promise<void>;
  onUpdateRoomStrategy: (
    requirementId: string,
    strategy: ManagementRoomStrategy,
    roomIds: string[],
    requiredCapability: string | null,
  ) => Promise<void>;
  onPreviewStructure: (
    input: ManagementRequirementStructurePreviewInput,
  ) => Promise<ManagementRequirementStructurePreviewResult>;
  onApplyStructure: (
    input: ManagementRequirementStructurePreviewInput,
    expectedStructureToken: string,
  ) => Promise<void>;
}) {
  const [stage, setStage] = useState<ManagementPlanStage>('ORTAOKUL');
  const [filter, setFilter] = useState<PlanFilter>('ACTIVE');
  const [viewMode, setViewMode] = useState<PlanViewMode>('SUBJECT');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('TÜMÜ');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<ManagementCoursePlanRow | null>(null);
  const [editKind, setEditKind] = useState<EditKind | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [structureRow, setStructureRow] =
    useState<ManagementCoursePlanRow | null>(null);
  const [roomStrategyRow, setRoomStrategyRow] =
    useState<ManagementCoursePlanRow | null>(null);

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

  const subjectGroups = useMemo(() => {
    const grouped = new Map<string, ManagementCoursePlanRow[]>();

    visibleRows.forEach((row) => {
      const values = grouped.get(row.subjectName) ?? [];
      values.push(row);
      grouped.set(row.subjectName, values);
    });

    return Array.from(grouped.entries())
      .map(([subjectName, rows]) => {
        const classCodes = new Set<string>();
        rows.forEach((row) => row.classCodes.forEach((code) => classCodes.add(code)));
        const sortedCodes = Array.from(classCodes).sort((a, b) =>
          a.localeCompare(b, 'tr', { numeric: true }),
        );

        return makeGroup(
          `subject:${subjectName}`,
          subjectName,
          sortedCodes.length > 0
            ? sortedCodes.join(', ')
            : 'Ortak / birleşik grup',
          rows,
        );
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  }, [visibleRows]);

  const classGroups = useMemo(() => {
    const grouped = new Map<string, ManagementCoursePlanRow[]>();

    visibleRows.forEach((row) => {
      const key = row.classCodes.length > 0
        ? row.classCodes.join(', ')
        : row.groupName;
      const values = grouped.get(key) ?? [];
      values.push(row);
      grouped.set(key, values);
    });

    return Array.from(grouped.entries())
      .map(([label, rows]) => makeGroup(
        `class:${label}`,
        label,
        `${rows.length} ders tanımı`,
        rows,
      ))
      .sort((a, b) => a.title.localeCompare(
        b.title,
        'tr',
        { numeric: true },
      ));
  }, [visibleRows]);

  const groups = viewMode === 'SUBJECT' ? subjectGroups : classGroups;

  useEffect(() => {
    setExpandedKeys(new Set());
  }, [stage, filter, viewMode, classFilter]);

  useEffect(() => {
    if (!query.trim()) return;
    setExpandedKeys(new Set(groups.map((group) => group.key)));
  }, [groups, query]);

  const toggleGroup = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };


  const openEditor = (row: ManagementCoursePlanRow, kind: EditKind) => {
    setEditRow(row);
    setEditKind(kind);
    setSelectedIds(kind === 'TEACHER' ? row.teacherIds : row.roomIds);
    setSaveError(null);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditRow(null);
    setEditKind(null);
    setSelectedIds([]);
    setSaveError(null);
  };

  const toggleSelectedId = (id: string) => {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    ));
  };

  const saveAssignment = async () => {
    if (!editRow || !editKind || saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      await onUpdateTeachers(editRow.requirementId, selectedIds);
      setEditRow(null);
      setEditKind(null);
      setSelectedIds([]);
      setSaveError(null);
    } catch (reason: unknown) {
      setSaveError(
        reason instanceof Error
          ? reason.message
          : 'Değişiklik kaydedilemedi.',
      );
    } finally {
      setSaving(false);
    }
  };

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
  const subjectCount = new Set(
    stageRows
      .filter((row) => row.termStatus === 'ACTIVE')
      .map((row) => row.subjectName),
  ).size;
  const missingTeacherCount = stageRows.filter(rowHasMissingTeacher).length;
  const missingRoomCount = stageRows.filter(rowHasMissingRoom).length;

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
                Varsayılan görünümde aynı dersin hangi sınıf ve gruplar tarafından alınacağı birlikte görülür. İsterseniz aynı planı sınıf / grup açısından da inceleyebilirsiniz.
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
                Ders
              </p>
              <p className="mt-2 text-2xl font-black">{subjectCount}</p>
              <p className="mt-1 text-[10px] font-medium text-slate-300">
                aktif ders başlığı
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                Ders tanımı
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">{activeCount}</p>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                sınıf / grup yükümlülüğü
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
              <div className="mr-2 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('SUBJECT')}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                    viewMode === 'SUBJECT'
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-500 hover:bg-white'
                  }`}
                >
                  Derslere göre
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('CLASS')}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${
                    viewMode === 'CLASS'
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-500 hover:bg-white'
                  }`}
                >
                  Sınıf / gruba göre
                </button>
              </div>

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
                  className="w-[280px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
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
            {groups.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-slate-400">
                Bu filtrelere uyan ders tanımı yok.
              </div>
            ) : (
              groups.map((group) => {
                const expanded = expandedKeys.has(group.key);

                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[12px] font-black text-slate-500">
                        {expanded ? '−' : '+'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13px] font-black text-slate-950">
                            {group.title}
                          </h3>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500">
                            {group.rows.length} {viewMode === 'SUBJECT' ? 'grup' : 'ders'}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-black text-blue-700">
                            {group.totalWeeklyLoad} saat
                          </span>
                          {group.missingTeacherCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black text-amber-700">
                              {group.missingTeacherCount} öğretmen eksik
                            </span>
                          )}
                          {group.missingRoomCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black text-amber-700">
                              {group.missingRoomCount} salon eksik
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[9px] font-medium text-slate-400">
                          {group.subtitle}
                        </p>
                      </div>

                      <span className="shrink-0 text-[9px] font-bold text-slate-400">
                        {expanded ? 'Kapat' : 'Aç'}
                      </span>
                    </button>

                    {expanded && (
                      <div className="bg-slate-50/40">
                        <div className="grid grid-cols-[minmax(170px,1.05fr)_150px_minmax(180px,1fr)_minmax(180px,1fr)_145px] gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
                          <span>{viewMode === 'SUBJECT' ? 'Sınıf / grup' : 'Ders'}</span>
                          <span>Haftalık plan</span>
                          <span>Öğretmen</span>
                          <span>Salon</span>
                          <span>Dönem</span>
                        </div>

                        {group.rows.map((row) => requirementRow(
                          row,
                          viewMode === 'SUBJECT' ? 'GROUP' : 'SUBJECT',
                          stage,
                          onOpenProgram,
                          canEdit,
                          (row) => openEditor(row, 'TEACHER'),
                          (row) => setRoomStrategyRow(row),
                          (row) => setStructureRow(row),
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-medium leading-5 text-blue-800">
          Öğretmen ve salon atamaları kontrollü biçimde düzenlenebilir. Haftalık saat, blok yapısı ve dönem durumu için “Ders yapısı” önizlemesi değişikliğin kartlara etkisini kaydetmeden gösterir.
        </div>
      </div>

      {structureRow && (
        <ManagementRequirementStructurePreview
          row={structureRow}
          stage={stage}
          onClose={() => setStructureRow(null)}
          onOpenProgram={(requirementId, targetStage) => {
            setStructureRow(null);
            onOpenProgram(requirementId, targetStage);
          }}
          onPreview={onPreviewStructure}
          onApply={onApplyStructure}
        />
      )}

      {roomStrategyRow && (
        <ManagementRoomStrategyEditor
          row={roomStrategyRow}
          stage={stage}
          roomOptions={data.roomOptions}
          capabilityOptions={data.roomCapabilityOptions}
          onClose={() => setRoomStrategyRow(null)}
          onOpenProgram={(requirementId, targetStage) => {
            setRoomStrategyRow(null);
            onOpenProgram(requirementId, targetStage);
          }}
          onSave={onUpdateRoomStrategy}
        />
      )}

      {editRow && editKind === 'TEACHER' && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[560px] rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  Ders Planını Düzenle
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {editRow.subjectName} · {audienceLabel(editRow)}
                </h3>
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Öğretmen seçimi
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                Kapat
              </button>
            </div>

            <div className={`mt-4 rounded-2xl border p-3 ${
              editRow.placedBlockCount > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
            }`}>
              <p className={`text-[10px] font-black ${
                editRow.placedBlockCount > 0
                  ? 'text-amber-800'
                  : 'text-emerald-800'
              }`}>
                {editRow.placedBlockCount > 0
                  ? `${editRow.placedBlockCount} blok şu anda programda yerleşmiş.`
                  : 'Programda yerleşmiş blok yok.'}
              </p>
              <p className="mt-1 text-[10px] font-medium leading-4 text-slate-600">
                {editRow.placedBlockCount > 0
                  ? 'Mevcut programı sessizce geçersiz kılmamak için önce bu dersin yerleşimlerini Program ekranından kaldırın.'
                  : 'Değişiklik kaydedildiğinde yalnız bu dersin uygun yerleri yeniden hesaplanacak.'}
              </p>

              {editRow.placedBlockCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    closeEditor();
                    onOpenProgram(editRow.requirementId, stage);
                  }}
                  className="mt-2 text-[10px] font-black text-blue-700 hover:text-blue-900"
                >
                  Programda göster →
                </button>
              )}
            </div>

            <div className="mt-4">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Uygun öğretmenler
              </p>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                Bir seçim sabit atama, birden fazla seçim seçilebilir havuz oluşturur. Hiç seçim yapmazsanız bilgi belirsiz olarak işaretlenir.
              </p>

              <div className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
                {data.teacherOptions.map((option) => {
                  const selected = selectedIds.includes(option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleSelectedId(option.id)}
                      disabled={saving || editRow.placedBlockCount > 0}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[10px] font-bold transition ${
                        selected
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <span>{option.name}</span>
                      <span>{selected ? 'Seçildi' : 'Seç'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {saveError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                {saveError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="text-[10px] font-medium text-slate-500">
                {selectedIds.length === 0
                  ? 'Belirsiz bırakılacak'
                  : selectedIds.length === 1
                    ? 'Sabit atama'
                    : `${selectedIds.length} seçenekli havuz`}
              </div>

              <button
                type="button"
                onClick={() => void saveAssignment()}
                disabled={saving || editRow.placedBlockCount > 0}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {saving ? 'Kaydediliyor…' : 'Değişikliği kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

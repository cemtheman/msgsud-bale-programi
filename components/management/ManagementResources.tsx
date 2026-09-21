'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementResourceInventoryData,
  ManagementResourceKnowledgeStatus,
  ManagementRoomResourceRow,
  ManagementTeacherResourceRow,
} from '@/lib/managementResources';

type ResourceTab = 'TEACHERS' | 'ROOMS';

function knowledgeMeta(status: ManagementResourceKnowledgeStatus) {
  if (status === 'CONFIRMED') {
    return {
      label: 'Doğrulanmış',
      className: 'bg-emerald-50 text-emerald-700',
    };
  }

  if (status === 'OBSERVED') {
    return {
      label: 'Mevcut veriden',
      className: 'bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'Belirsiz',
    className: 'bg-slate-100 text-slate-600',
  };
}

function capabilityLabel(value: string) {
  const labels: Record<string, string> = {
    GENERAL_CLASSROOM: 'Genel derslik',
    MUSIC_THEORY: 'Müzik teorisi',
    INSTRUMENT_RELATED: 'Çalgı ilişkili',
    SOLFEGE: 'Solfej',
    RHYTHMIC: 'Ritmik',
    CLASSICAL_BALLET: 'Klasik bale',
    DANCE_TECHNIQUE: 'Dans tekniği',
    POINT_DANCE_TECHNIQUE: 'Point / dans tekniği',
    REPERTOIRE: 'Repertuvar',
  };

  return labels[value]
    ?? value
      .replaceAll('_', ' ')
      .toLocaleLowerCase('tr-TR')
      .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

function teacherState(row: ManagementTeacherResourceRow) {
  if (row.activeRequirementCount === 0 && row.placedBlockCount === 0) {
    return {
      label: 'Kullanım yok',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  if (row.activeRequirementCount === 0 && row.placedBlockCount > 0) {
    return {
      label: 'Atama kontrolü',
      className: 'bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'Aktif',
    className: 'bg-emerald-50 text-emerald-700',
  };
}

function roomType(row: ManagementRoomResourceRow) {
  if (row.canonicalRoomId) return 'Takma ad';
  if (row.aliasCount > 0) return 'Ana kayıt';
  return 'Salon';
}

export function ManagementResources({
  data,
}: {
  data: ManagementResourceInventoryData | null;
}) {
  const [tab, setTab] = useState<ResourceTab>('TEACHERS');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');

  const filteredTeachers = useMemo(
    () => (
      data?.teachers.filter((row) => (
        normalizedQuery.length === 0
        || row.name.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
      )) ?? []
    ),
    [data?.teachers, normalizedQuery],
  );

  const filteredRooms = useMemo(
    () => (
      data?.rooms.filter((row) => {
        if (normalizedQuery.length === 0) return true;

        const haystack = [
          row.name,
          row.canonicalRoomName ?? '',
          ...row.capabilities.map(capabilityLabel),
        ]
          .join(' ')
          .toLocaleLowerCase('tr-TR');

        return haystack.includes(normalizedQuery);
      }) ?? []
    ),
    [data?.rooms, normalizedQuery],
  );

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Kaynak envanteri hazırlanıyor…
        </div>
      </section>
    );
  }

  const assignedTeacherCount = data.teachers.filter(
    (row) => row.activeRequirementCount > 0,
  ).length;

  const usedTeacherCount = data.teachers.filter(
    (row) => row.placedBlockCount > 0,
  ).length;

  const canonicalRooms = data.rooms.filter(
    (row) => !row.canonicalRoomId,
  );

  const confirmedRoomCount = canonicalRooms.filter(
    (row) => row.knowledgeStatus === 'CONFIRMED',
  ).length;

  const usedRoomCount = canonicalRooms.filter(
    (row) => row.placedBlockCount > 0,
  ).length;

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1180px] space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Kaynaklar
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Öğretmen ve salon envanteri
              </h2>
              <p className="mt-2 max-w-[720px] text-sm font-medium leading-6 text-slate-500">
                Ders Planı ve Program tarafından kullanılan öğretmen ve salon kayıtlarını,
                mevcut atamaları ve programdaki fiilî kullanımı tek yerde gösterir.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                M18.1
              </p>
              <p className="mt-1 text-[11px] font-bold text-slate-700">
                Salt okunur envanter
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('TEACHERS')}
              className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${
                tab === 'TEACHERS'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Öğretmenler · {data.teachers.length}
            </button>
            <button
              type="button"
              onClick={() => setTab('ROOMS')}
              className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${
                tab === 'ROOMS'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Salonlar · {canonicalRooms.length}
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'TEACHERS'
              ? 'Öğretmen ara…'
              : 'Salon veya özellik ara…'}
            className="w-[300px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </div>

        {tab === 'TEACHERS' ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Öğretmen kaydı
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {data.teachers.length}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Aktif derse atanmış
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {assignedTeacherCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Programda kullanılan
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {usedTeacherCount}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(260px,1fr)_140px_150px_140px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                <span>Öğretmen</span>
                <span className="text-right">Aktif ders</span>
                <span className="text-right">Programdaki blok</span>
                <span className="text-right">Durum</span>
              </div>

              {filteredTeachers.length > 0 ? (
                filteredTeachers.map((row) => {
                  const state = teacherState(row);

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(260px,1fr)_140px_150px_140px] items-center border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-slate-900">
                          {row.name}
                        </p>
                        <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                          Öğretmen kaydı
                        </p>
                      </div>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.activeRequirementCount}
                      </p>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.placedBlockCount}
                      </p>

                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${state.className}`}>
                          {state.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-sm font-semibold text-slate-400">
                  Aramanızla eşleşen öğretmen bulunamadı.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Ana salon kaydı
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {canonicalRooms.length}
                </p>
                <p className="mt-1 text-[9px] font-medium text-slate-400">
                  {data.rooms.length - canonicalRooms.length} takma ad ayrıca korunuyor
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Özelliği doğrulanmış
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {confirmedRoomCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Programda kullanılan
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {usedRoomCount}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(180px,0.8fr)_120px_150px_minmax(260px,1.4fr)_100px_120px] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                <span>Salon</span>
                <span>Tür</span>
                <span>Bilgi durumu</span>
                <span>Özellikler</span>
                <span className="text-right">Aktif ders</span>
                <span className="text-right">Program</span>
              </div>

              {filteredRooms.length > 0 ? (
                filteredRooms.map((row) => {
                  const knowledge = knowledgeMeta(row.knowledgeStatus);

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(180px,0.8fr)_120px_150px_minmax(260px,1.4fr)_100px_120px] items-center gap-0 border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-slate-900">
                          {row.name}
                        </p>
                        {row.canonicalRoomName && (
                          <p className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                            → {row.canonicalRoomName}
                          </p>
                        )}
                        {!row.canonicalRoomId && row.aliasCount > 0 && (
                          <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                            {row.aliasCount} takma ad bağlı
                          </p>
                        )}
                      </div>

                      <p className="text-[10px] font-bold text-slate-600">
                        {roomType(row)}
                      </p>

                      <div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${knowledge.className}`}>
                          {knowledge.label}
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-wrap gap-1">
                        {row.capabilities.length > 0 ? (
                          row.capabilities.slice(0, 4).map((capability) => (
                            <span
                              key={capability}
                              className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-600"
                            >
                              {capabilityLabel(capability)}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] font-semibold text-slate-400">
                            Özellik tanımı yok
                          </span>
                        )}
                        {row.capabilities.length > 4 && (
                          <span className="rounded-full bg-slate-50 px-2 py-1 text-[8px] font-bold text-slate-400">
                            +{row.capabilities.length - 4}
                          </span>
                        )}
                      </div>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.activeRequirementCount}
                      </p>

                      <p className="text-right text-[11px] font-black text-slate-700">
                        {row.placedBlockCount}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-sm font-semibold text-slate-400">
                  Aramanızla eşleşen salon bulunamadı.
                </div>
              )}
            </div>
          </>
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
            Bu aşama envanteri görünür kılar
          </p>
          <p className="mt-1 text-[10px] font-medium leading-5 text-blue-800">
            M18.1 kaynak kayıtlarını değiştirmez. Öğretmen ve salon düzenleme kuralları,
            aday alanına etkileri ve güvenli değişiklik akışı ayrı bir sonraki adımda ele alınacak.
          </p>
        </div>
      </div>
    </section>
  );
}

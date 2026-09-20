'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  managementCardStatus,
  type ManagementBoardCard,
} from '@/lib/managementBoard';

type QueueFilter =
  | 'ÇALIŞILABİLİR'
  | 'ZORUNLU'
  | 'BELİRSİZ'
  | 'ÇELİŞKİ'
  | 'TÜMÜ';

const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'ÇALIŞILABİLİR', label: 'Çalışılabilir' },
  { id: 'ZORUNLU', label: 'Zorunlu' },
  { id: 'BELİRSİZ', label: 'Belirsiz' },
  { id: 'ÇELİŞKİ', label: 'Çelişki' },
  { id: 'TÜMÜ', label: 'Tümü' },
];

function matchesQueue(card: ManagementBoardCard, filter: QueueFilter) {
  if (filter === 'ÇALIŞILABİLİR') {
    return card.validCount > 0 && !card.isContradiction;
  }
  if (filter === 'ZORUNLU') return card.isForced;
  if (filter === 'BELİRSİZ') return card.unresolvedCount > 0;
  if (filter === 'ÇELİŞKİ') return card.isContradiction;
  return true;
}

function statusClass(card: ManagementBoardCard) {
  if (card.isContradiction) return 'bg-rose-100 text-rose-700';
  if (card.isForced) return 'bg-emerald-100 text-emerald-700';
  if (card.unresolvedCount > 0) return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

export function ManagementCardPool({
  cards,
  totalUnplaced,
  selectedCardId,
  onSelect,
  onClose,
  canEdit,
  onDragStart,
  onDragEnd,
}: {
  cards: ManagementBoardCard[];
  totalUnplaced: number;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
  onClose: () => void;
  canEdit: boolean;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
}) {
  const [query, setQuery] = useState('');
  const [queueFilter, setQueueFilter] =
    useState<QueueFilter>('ÇALIŞILABİLİR');
  const [classFilter, setClassFilter] = useState('TÜMÜ');

  const unplacedCards = useMemo(
    () => cards.filter((card) => !card.placement),
    [cards],
  );

  const classOptions = useMemo(() => {
    const values = new Set<string>();
    unplacedCards.forEach((card) => {
      card.classCodes.forEach((code) => values.add(code));
    });
    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, 'tr', { numeric: true }),
    );
  }, [unplacedCards]);

  useEffect(() => {
    if (
      classFilter !== 'TÜMÜ'
      && !classOptions.includes(classFilter)
    ) {
      setClassFilter('TÜMÜ');
    }
  }, [classFilter, classOptions]);

  const queueCounts = useMemo(() => {
    return Object.fromEntries(
      QUEUE_FILTERS.map((filter) => [
        filter.id,
        unplacedCards.filter((card) => matchesQueue(card, filter.id)).length,
      ]),
    ) as Record<QueueFilter, number>;
  }, [unplacedCards]);

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');

    return unplacedCards
      .filter((card) => matchesQueue(card, queueFilter))
      .filter((card) => (
        classFilter === 'TÜMÜ'
        || card.classCodes.includes(classFilter)
      ))
      .filter((card) => {
        if (!normalized) return true;

        return [
          card.subjectName,
          card.groupName,
          card.classCodes.join(' '),
          card.teacherNames.join(' '),
          card.roomNames.join(' '),
        ]
          .join(' ')
          .toLocaleLowerCase('tr-TR')
          .includes(normalized);
      })
      .sort((a, b) => {
        if (a.isForced !== b.isForced) return a.isForced ? -1 : 1;

        const aTightness = a.validCount > 0 ? a.validCount : 9999;
        const bTightness = b.validCount > 0 ? b.validCount : 9999;

        return aTightness - bTightness
          || a.unresolvedCount - b.unresolvedCount
          || (a.classCodes[0] ?? 'ZZ').localeCompare(
            b.classCodes[0] ?? 'ZZ',
            'tr',
            { numeric: true },
          )
          || a.subjectName.localeCompare(b.subjectName, 'tr')
          || a.blockIndex - b.blockIndex;
      });
  }, [classFilter, query, queueFilter, unplacedCards]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Ders Havuzu
            </p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Çalışma kuyruğu
              </h2>
              <span className="text-[10px] font-semibold text-slate-400">
                {unplacedCards.length} / {totalUnplaced} yerleşmemiş
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            title="Ders havuzunu daralt"
          >
            ‹
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUEUE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setQueueFilter(filter.id)}
              className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold transition ${
                queueFilter === filter.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter.label} · {queueCounts[filter.id]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-[1fr_98px] gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ders, öğretmen, salon ara"
            className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
          />

          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-semibold text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white"
            aria-label="Sınıf filtresi"
          >
            <option value="TÜMÜ">Tüm sınıflar</option>
            {classOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between text-[9px] font-medium text-slate-400">
          <span>
            {filteredCards.length} kart gösteriliyor
          </span>
          {queueFilter === 'ÇALIŞILABİLİR' && (
            <span>{canEdit ? 'Sürükleyip programa bırakabilirsiniz' : 'En az seçeneği olan önce'}</span>
          )}
        </div>
      </div>

      <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {filteredCards.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs font-medium text-slate-400">
            Bu çalışma görünümüne uyan kart yok.
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredCards.map((card) => {
              const selected = card.id === selectedCardId;
              const classLabel = card.classCodes.length > 0
                ? card.classCodes.join(', ')
                : 'Ortak grup';

              return (
                <button
                  key={card.id}
                  type="button"
                  draggable={canEdit && !card.locked}
                  onDragStart={(event) => {
                    if (!canEdit || card.locked) {
                      event.preventDefault();
                      return;
                    }

                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', card.id);
                    onDragStart(card.id);
                  }}
                  onDragEnd={onDragEnd}
                  onClick={() => onSelect(card.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    canEdit && !card.locked ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${
                    selected
                      ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                          selected
                            ? 'bg-white/10 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {classLabel}
                        </span>
                        <p className="truncate text-[12px] font-bold">
                          {card.subjectName}
                        </p>
                      </div>

                      <p className={`mt-1 truncate text-[10px] font-medium ${
                        selected ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        {card.groupName}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${
                        selected
                          ? 'bg-white/10 text-white'
                          : statusClass(card)
                      }`}>
                        {managementCardStatus(card)}
                      </span>
                      <span className={`rounded-md px-1.5 py-1 text-[9px] font-bold ${
                        selected
                          ? 'bg-white/10 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        ×{card.durationPeriods}
                      </span>
                    </div>
                  </div>

                  <div className={`mt-1.5 flex items-center justify-between gap-2 text-[9px] font-medium ${
                    selected ? 'text-slate-300' : 'text-slate-400'
                  }`}>
                    <span className="truncate">
                      {card.teacherNames[0] ?? 'Öğretmen belirsiz'}
                    </span>
                    {card.validCount > 0 && (
                      <span className="shrink-0">
                        {card.validCount} uygun yer
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

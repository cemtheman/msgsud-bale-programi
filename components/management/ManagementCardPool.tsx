'use client';

import { useMemo, useState } from 'react';
import {
  managementCardStatus,
  type ManagementBoardCard,
} from '@/lib/managementBoard';

type StatusFilter = 'TÜMÜ' | 'ZORUNLU' | 'BELİRSİZ' | 'UYGUN' | 'ÇELİŞKİ';

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'TÜMÜ', label: 'Tümü' },
  { id: 'ZORUNLU', label: 'Zorunlu' },
  { id: 'BELİRSİZ', label: 'Belirsiz' },
  { id: 'UYGUN', label: 'Uygun' },
  { id: 'ÇELİŞKİ', label: 'Çelişki' },
];

function statusKey(card: ManagementBoardCard): Exclude<StatusFilter, 'TÜMÜ'> {
  if (card.isContradiction) return 'ÇELİŞKİ';
  if (card.isForced) return 'ZORUNLU';
  if (card.unresolvedCount > 0) return 'BELİRSİZ';
  return 'UYGUN';
}

function statusClass(card: ManagementBoardCard) {
  if (card.isContradiction) return 'bg-rose-100 text-rose-800';
  if (card.isForced) return 'bg-emerald-100 text-emerald-800';
  if (card.unresolvedCount > 0) return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

function durationLabel(duration: number) {
  return duration === 1 ? '1 ders saati' : `${duration} ders saati`;
}

export function ManagementCardPool({
  cards,
  totalUnplaced,
  selectedCardId,
  onSelect,
}: {
  cards: ManagementBoardCard[];
  totalUnplaced: number;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TÜMÜ');

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');

    return cards
      .filter((card) => !card.placement)
      .filter((card) => {
        if (statusFilter === 'TÜMÜ') return true;
        return statusKey(card) === statusFilter;
      })
      .filter((card) => {
        if (!normalized) return true;

        const haystack = [
          card.subjectName,
          card.groupName,
          card.classCodes.join(' '),
          card.teacherNames.join(' '),
          card.roomNames.join(' '),
        ]
          .join(' ')
          .toLocaleLowerCase('tr-TR');

        return haystack.includes(normalized);
      })
      .sort((a, b) => {
        const weight = (card: ManagementBoardCard) => {
          if (card.isContradiction) return 0;
          if (card.isForced) return 1;
          if (card.unresolvedCount > 0) return 2;
          return 3;
        };

        return weight(a) - weight(b)
          || (a.classCodes[0] ?? 'ZZ').localeCompare(
            b.classCodes[0] ?? 'ZZ',
            'tr',
            { numeric: true },
          )
          || a.subjectName.localeCompare(b.subjectName, 'tr')
          || a.blockIndex - b.blockIndex;
      });
  }, [cards, query, statusFilter]);

  return (
    <aside className="flex min-h-0 flex-col rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              Kart Havuzu
            </p>
            <h2 className="mt-1 text-lg font-black">Yerleşmemiş</h2>
          </div>
          <div className="text-right">
            <span className="rounded-xl bg-slate-950 px-3 py-1.5 text-sm font-black text-white">
              {cards.filter((card) => !card.placement).length}
            </span>
            <p className="mt-1 text-[10px] font-bold text-slate-400">
              toplam {totalUnplaced}
            </p>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Kart ara</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ders, sınıf, öğretmen veya salon ara"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`rounded-full px-2.5 py-1.5 text-[10px] font-black transition ${
                statusFilter === filter.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredCards.length === 0 ? (
          <div className="m-2 rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400">
            Bu filtreye uyan kart yok.
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredCards.map((card) => {
              const selected = card.id === selectedCardId;

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelect(card.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    selected
                      ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-black">{card.subjectName}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                            selected ? 'bg-white/15 text-white' : statusClass(card)
                          }`}
                        >
                          {managementCardStatus(card)}
                        </span>
                      </div>
                      <p className={`mt-1 truncate text-[11px] font-bold ${
                        selected ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        {card.groupName}
                      </p>
                    </div>

                    <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${
                      selected
                        ? 'bg-white/10 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      ×{card.durationPeriods}
                    </span>
                  </div>

                  <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold ${
                    selected ? 'text-slate-300' : 'text-slate-400'
                  }`}>
                    <span>{card.classCodes.length > 0 ? card.classCodes.join(', ') : 'Ortak grup'}</span>
                    <span>·</span>
                    <span>{durationLabel(card.durationPeriods)}</span>
                    <span>·</span>
                    <span>{card.teacherNames[0] ?? 'Öğretmen belirsiz'}</span>
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

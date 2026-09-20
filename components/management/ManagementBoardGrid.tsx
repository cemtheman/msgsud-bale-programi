'use client';

import {
  placementBelongsToRow,
  type ManagementBoardCard,
  type ManagementBoardRow,
  type ManagementResourceView,
} from '@/lib/managementBoard';

const PERIODS = [
  { number: 1, time: '08:20' },
  { number: 2, time: '09:10' },
  { number: 3, time: '10:00' },
  { number: 4, time: '10:50' },
  { number: 5, time: '11:40' },
  { number: 6, time: '13:00' },
  { number: 7, time: '13:50' },
  { number: 8, time: '14:40' },
  { number: 9, time: '15:30' },
  { number: 10, time: '16:20' },
  { number: 11, time: '17:10' },
  { number: 12, time: '18:00' },
] as const;

function cardClass(card: ManagementBoardCard) {
  if (card.courseCharacter === 'TECHNIQUE') {
    return 'border-sky-200 bg-sky-100 text-sky-950';
  }

  if (card.courseCharacter === 'REPERTOIRE') {
    return 'border-violet-200 bg-violet-100 text-violet-950';
  }

  if (card.courseCharacter === 'REHEARSAL') {
    return 'border-rose-200 bg-rose-100 text-rose-950';
  }

  return 'border-amber-200 bg-amber-100 text-amber-950';
}

function packCards(cards: ManagementBoardCard[]) {
  const laneEnds: number[] = [];

  return [...cards]
    .sort((a, b) => {
      const startA = a.placement?.startPeriod ?? 99;
      const startB = b.placement?.startPeriod ?? 99;
      return startA - startB || b.durationPeriods - a.durationPeriods;
    })
    .map((card) => {
      const start = card.placement?.startPeriod ?? 1;
      const end = start + card.durationPeriods - 1;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }

      return { card, lane };
    });
}

export function ManagementBoardGrid({
  rows,
  cards,
  view,
  activeDay,
  selectedCardId,
  onSelect,
}: {
  rows: ManagementBoardRow[];
  cards: ManagementBoardCard[];
  view: ManagementResourceView;
  activeDay: number;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}) {
  const dayCards = cards.filter(
    (card) => card.placement?.dayOfWeek === activeDay,
  );

  return (
    <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="management-scrollbar h-full overflow-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[160px_repeat(12,minmax(70px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Kaynak
            </div>
            {PERIODS.map((period) => (
              <div
                key={period.number}
                className="border-r border-slate-200 px-1 py-2 text-center last:border-r-0"
              >
                <p className="text-[10px] font-semibold text-slate-600">
                  {period.number}. ders
                </p>
                <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                  {period.time}
                </p>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-black text-slate-700">
                  Bu görünümde listelenecek kaynak yok.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Kartlardaki doğrulanmış öğretmen veya salon atamaları tamamlandıkça burada görünecek.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {rows.map((row) => {
                const rowCards = dayCards.filter((card) =>
                  placementBelongsToRow(card, row, view),
                );
                const packed = packCards(rowCards);
                const laneCount = packed.length === 0
                  ? 1
                  : Math.max(...packed.map((item) => item.lane)) + 1;
                const rowHeight = Math.max(54, laneCount * 42 + 12);

                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[160px_minmax(880px,1fr)] border-b border-slate-100 last:border-b-0"
                  >
                    <div
                      className="sticky left-0 z-10 flex border-r border-slate-200 bg-white px-4 py-3"
                      style={{ minHeight: rowHeight }}
                    >
                      <div className="min-w-0 self-center">
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          {row.label}
                        </p>
                        {row.secondary && (
                          <p className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                            {row.secondary}
                          </p>
                        )}
                      </div>
                    </div>

                    <div
                      className="relative"
                      style={{ minHeight: rowHeight }}
                    >
                      <div className="absolute inset-0 grid grid-cols-12">
                        {PERIODS.map((period) => (
                          <div
                            key={period.number}
                            className="border-r border-slate-100 last:border-r-0"
                          />
                        ))}
                      </div>

                      {packed.map(({ card, lane }) => {
                        const placement = card.placement;
                        if (!placement) return null;

                        const left = ((placement.startPeriod - 1) / 12) * 100;
                        const width = (card.durationPeriods / 12) * 100;
                        const selected = card.id === selectedCardId;

                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => onSelect(card.id)}
                            className={`absolute overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${
                              cardClass(card)
                            } ${
                              selected
                                ? 'ring-2 ring-slate-950 ring-offset-1'
                                : 'hover:brightness-[0.98]'
                            }`}
                            style={{
                              left: `calc(${left}% + 3px)`,
                              width: `calc(${width}% - 6px)`,
                              top: 6 + lane * 42,
                              height: 36,
                            }}
                            title={`${card.subjectName} · ${card.groupName}`}
                          >
                            <p className="truncate text-[10px] font-semibold">
                              {card.subjectName}
                            </p>
                            <p className="truncate text-[8px] font-medium opacity-65">
                              {card.groupName}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

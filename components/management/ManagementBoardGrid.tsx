'use client';

import {
  cardBelongsToClassRow,
  placementBelongsToRow,
  type ManagementBoardCard,
  type ManagementBoardRow,
  type ManagementCandidateAssessment,
  type ManagementCandidateDetail,
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

export type ManagementDropState =
  | 'VALID'
  | 'AMBIGUOUS'
  | 'UNRESOLVED'
  | 'INVALID'
  | 'CURRENT'
  | 'LOADING'
  | 'NONE';

export interface ManagementDropTarget {
  cardId: string;
  dayOfWeek: number;
  startPeriod: number;
  state: ManagementDropState;
  validCandidates: ManagementCandidateAssessment[];
  reasonCodes: string[];
}

function cardClass(card: ManagementBoardCard) {
  const hasSection = card.audienceTargets.includes('SECTION');
  const hasBallet = card.audienceTargets.includes('BALLET');
  const hasMusic = card.audienceTargets.includes('MUSIC');

  // Audience is the primary visual language of the timetable:
  // 📚 common lessons = amber, 🩰 ballet = sky, 🎶 music = violet.
  if (hasMusic && !hasBallet && !hasSection) {
    return 'border-violet-200 bg-violet-100 text-violet-950';
  }

  if (hasBallet && !hasMusic && !hasSection) {
    return 'border-sky-200 bg-sky-100 text-sky-950';
  }

  if (hasSection && !hasBallet && !hasMusic) {
    return 'border-amber-200 bg-amber-100 text-amber-950';
  }

  if (card.courseCharacter === 'REHEARSAL') {
    return 'border-rose-200 bg-rose-100 text-rose-950';
  }

  return 'border-slate-200 bg-slate-100 text-slate-950';
}

function compactCardGroupName(card: ManagementBoardCard) {
  const normalizedSubject = card.subjectName.toLocaleLowerCase('tr-TR');

  return card.groupName
    .split(' · ')
    .filter((part) => (
      part.toLocaleLowerCase('tr-TR') !== normalizedSubject
      && part !== 'Standart'
    ))
    .join(' · ');
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

function assessmentMatchesRow(
  card: ManagementBoardCard,
  assessment: ManagementCandidateAssessment,
  row: ManagementBoardRow,
  view: ManagementResourceView,
) {
  if (view === 'SINIFLAR') {
    return cardBelongsToClassRow(card, row);
  }

  if (view === 'ÖĞRETMENLER') {
    return assessment.teacherId === row.id;
  }

  return assessment.roomId === row.id;
}

function dropTargetForCell({
  card,
  detail,
  row,
  view,
  activeDay,
  startPeriod,
  loading,
}: {
  card: ManagementBoardCard;
  detail: ManagementCandidateDetail | null;
  row: ManagementBoardRow;
  view: ManagementResourceView;
  activeDay: number;
  startPeriod: number;
  loading: boolean;
}): ManagementDropTarget {
  if (
    view === 'SINIFLAR'
    && !cardBelongsToClassRow(card, row)
  ) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'NONE',
      validCandidates: [],
      reasonCodes: [],
    };
  }

  if (loading || !detail) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'LOADING',
      validCandidates: [],
      reasonCodes: [],
    };
  }

  const assessments = detail.assessments.filter(
    (assessment) => (
      assessment.dayOfWeek === activeDay
      && assessment.startPeriod === startPeriod
      && assessmentMatchesRow(card, assessment, row, view)
    ),
  );

  const validCandidates = assessments.filter(
    (assessment) => (
      assessment.status === 'VALID'
      && assessment.isComplete
      && Boolean(assessment.teacherId)
      && Boolean(assessment.roomId)
    ),
  );

  const isCurrent = Boolean(
    card.placement
    && card.placement.dayOfWeek === activeDay
    && card.placement.startPeriod === startPeriod
    && (
      view === 'SINIFLAR'
      || (
        view === 'ÖĞRETMENLER'
        && card.placement.teacherId === row.id
      )
      || (
        view === 'SALONLAR'
        && card.placement.roomId === row.id
      )
    )
  );

  if (isCurrent) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'CURRENT',
      validCandidates,
      reasonCodes: [],
    };
  }

  if (validCandidates.length === 1) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'VALID',
      validCandidates,
      reasonCodes: [],
    };
  }

  if (validCandidates.length > 1) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'AMBIGUOUS',
      validCandidates,
      reasonCodes: [],
    };
  }

  const unresolved = assessments.filter(
    (assessment) => assessment.status === 'UNRESOLVED',
  );

  if (unresolved.length > 0) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'UNRESOLVED',
      validCandidates: [],
      reasonCodes: Array.from(
        new Set(unresolved.flatMap((assessment) => assessment.reasonCodes)),
      ),
    };
  }

  const invalid = assessments.filter(
    (assessment) => assessment.status === 'INVALID',
  );

  if (invalid.length > 0) {
    return {
      cardId: card.id,
      dayOfWeek: activeDay,
      startPeriod,
      state: 'INVALID',
      validCandidates: [],
      reasonCodes: Array.from(
        new Set(invalid.flatMap((assessment) => assessment.reasonCodes)),
      ),
    };
  }

  return {
    cardId: card.id,
    dayOfWeek: activeDay,
    startPeriod,
    state: 'NONE',
    validCandidates: [],
    reasonCodes: [],
  };
}

function targetClass(state: ManagementDropState) {
  if (state === 'VALID') {
    return 'border-emerald-400 bg-emerald-100/85 text-emerald-800';
  }

  if (state === 'AMBIGUOUS') {
    return 'border-blue-400 bg-blue-100/85 text-blue-800';
  }

  if (state === 'UNRESOLVED') {
    return 'border-amber-400 bg-amber-100/85 text-amber-800';
  }

  if (state === 'INVALID') {
    return 'border-rose-300 bg-rose-50/80 text-rose-600';
  }

  if (state === 'CURRENT') {
    return 'border-slate-300 bg-slate-100/80 text-slate-500';
  }

  if (state === 'LOADING') {
    return 'border-slate-200 bg-slate-50/80 text-slate-400';
  }

  return 'border-transparent bg-transparent text-transparent';
}

function targetLabel(state: ManagementDropState) {
  if (state === 'VALID') return 'Bırak';
  if (state === 'AMBIGUOUS') return 'Seçim';
  if (state === 'UNRESOLVED') return 'Belirsiz';
  if (state === 'INVALID') return 'Uygun değil';
  if (state === 'CURRENT') return 'Mevcut';
  if (state === 'LOADING') return '…';
  return '';
}

export function ManagementBoardGrid({
  rows,
  cards,
  view,
  activeDay,
  selectedCardId,
  onSelect,
  canEdit,
  dragCard,
  dragCandidateDetail,
  dragLoading,
  onDragStart,
  onDragEnd,
  onDropCandidate,
  onDropNeedsAttention,
}: {
  rows: ManagementBoardRow[];
  cards: ManagementBoardCard[];
  view: ManagementResourceView;
  activeDay: number;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
  canEdit: boolean;
  dragCard: ManagementBoardCard | null;
  dragCandidateDetail: ManagementCandidateDetail | null;
  dragLoading: boolean;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onDropCandidate: (candidate: ManagementCandidateAssessment) => void;
  onDropNeedsAttention: (target: ManagementDropTarget) => void;
}) {
  const dayCards = cards.filter(
    (card) => card.placement?.dayOfWeek === activeDay,
  );

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {dragCard && (
        <div className="pointer-events-none absolute left-3 top-3 z-40 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur">
          {dragLoading
            ? `${dragCard.subjectName} için uygun yerler hazırlanıyor…`
            : `${dragCard.subjectName} · başlangıç saatleri işaretlendi`}
        </div>
      )}

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
                <p className="text-sm font-semibold text-slate-700">
                  Bu görünümde listelenecek kaynak yok.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Kartlardaki doğrulanmış öğretmen veya salon atamaları tamamlandıkça burada görünecek.
                </p>
              </div>
            </div>
          ) : (
            <div>
              {rows.map((row, rowIndex) => {
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
                    className={`grid grid-cols-[160px_minmax(880px,1fr)] border-b border-slate-100 last:border-b-0 ${
                      view === 'SINIFLAR'
                      && rowIndex > 0
                      && (rows[rowIndex - 1].classCode ?? rows[rowIndex - 1].id.split('::')[0])
                        !== (row.classCode ?? row.id.split('::')[0])
                        ? 'border-t-2 border-t-slate-200'
                        : ''
                    }`}
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
                            className={`absolute overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition ${
                              canEdit && !card.locked
                                ? 'cursor-grab active:cursor-grabbing'
                                : ''
                            } ${cardClass(card)} ${
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
                            {compactCardGroupName(card) && (
                              <p className="truncate text-[8px] font-medium opacity-60">
                                {compactCardGroupName(card)}
                              </p>
                            )}
                          </button>
                        );
                      })}

                      {dragCard && (
                        <div className="absolute inset-0 z-30 grid grid-cols-12">
                          {PERIODS.map((period) => {
                            const target = dropTargetForCell({
                              card: dragCard,
                              detail: dragCandidateDetail,
                              row,
                              view,
                              activeDay,
                              startPeriod: period.number,
                              loading: dragLoading,
                            });
                            const droppable = target.state !== 'NONE'
                              && target.state !== 'LOADING'
                              && target.state !== 'CURRENT';

                            return (
                              <div
                                key={period.number}
                                onDragOver={(event) => {
                                  if (!droppable) return;
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(event) => {
                                  if (!droppable) return;
                                  event.preventDefault();

                                  if (
                                    target.state === 'VALID'
                                    && target.validCandidates.length === 1
                                  ) {
                                    onDropCandidate(target.validCandidates[0]);
                                    return;
                                  }

                                  onDropNeedsAttention(target);
                                }}
                                className={`m-1 flex min-w-0 items-center justify-center rounded-lg border border-dashed text-center text-[8px] font-bold transition ${
                                  targetClass(target.state)
                                }`}
                                title={targetLabel(target.state)}
                              >
                                <span className="truncate px-1">
                                  {targetLabel(target.state)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
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

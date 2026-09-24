'use client';

import {
  buildManagementRowDisplayCards,
  cardBelongsToClassRow,
  placementBelongsToRow,
  type ManagementBoardCard,
  type ManagementBoardDisplayCard,
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
  cardIds?: string[];
  rowId?: string;
  dayOfWeek: number;
  startPeriod: number;
  state: ManagementDropState;
  validCandidates: ManagementCandidateAssessment[];
  reasonCodes: string[];
}

export interface ManagementGroupDropCandidate {
  cardId: string;
  candidate: ManagementCandidateAssessment;
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

function packCards(cards: ManagementBoardDisplayCard[]) {
  const laneEnds: number[] = [];

  return [...cards]
    .sort((a, b) => {
      const startA = a.card.placement?.startPeriod ?? 99;
      const startB = b.card.placement?.startPeriod ?? 99;
      return startA - startB || b.card.durationPeriods - a.card.durationPeriods;
    })
    .map((displayCard) => {
      const start = displayCard.card.placement?.startPeriod ?? 1;
      const end = start + displayCard.card.durationPeriods - 1;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }

      return { displayCard, lane };
    });
}

export function managementAssessmentMatchesRow(
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
      && managementAssessmentMatchesRow(card, assessment, row, view)
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

function groupDropTargetForCell({
  cards,
  detailsByCardId,
  row,
  view,
  activeDay,
  startPeriod,
  loading,
}: {
  cards: ManagementBoardCard[];
  detailsByCardId: Record<string, ManagementCandidateDetail>;
  row: ManagementBoardRow;
  view: ManagementResourceView;
  activeDay: number;
  startPeriod: number;
  loading: boolean;
}): ManagementDropTarget & {
  groupCandidates: ManagementGroupDropCandidate[];
} {
  const primaryCard = cards[0];

  if (!primaryCard) {
    return {
      cardId: '',
      dayOfWeek: activeDay,
      startPeriod,
      state: 'NONE',
      validCandidates: [],
      reasonCodes: [],
      groupCandidates: [],
    };
  }

  const targets = cards.map((card) => ({
    card,
    target: dropTargetForCell({
      card,
      detail: detailsByCardId[card.id] ?? null,
      row,
      view,
      activeDay,
      startPeriod,
      loading,
    }),
  }));

  const reasonCodes = Array.from(new Set(
    targets.flatMap(({ target }) => target.reasonCodes),
  ));

  const result = (
    state: ManagementDropState,
    groupCandidates: ManagementGroupDropCandidate[] = [],
    validCandidates: ManagementCandidateAssessment[] = groupCandidates.map(
      ({ candidate }) => candidate,
    ),
  ) => ({
    cardId: primaryCard.id,
    cardIds: cards.map((card) => card.id),
    rowId: row.id,
    dayOfWeek: activeDay,
    startPeriod,
    state,
    validCandidates,
    reasonCodes,
    groupCandidates,
  });

  if (loading || targets.some(({ target }) => target.state === 'LOADING')) {
    return result('LOADING');
  }

  if (targets.every(({ target }) => target.state === 'CURRENT')) {
    return result('CURRENT');
  }

  if (targets.some(({ target }) => target.state === 'INVALID')) {
    return result('INVALID');
  }

  if (targets.some(({ target }) => target.state === 'UNRESOLVED')) {
    return result('UNRESOLVED');
  }

  if (targets.some(({ target }) => target.state === 'AMBIGUOUS')) {
    return result(
      'AMBIGUOUS',
      [],
      targets[0]?.target.validCandidates ?? [],
    );
  }

  if (targets.some(({ target }) => target.state === 'NONE')) {
    return result('NONE');
  }

  const groupCandidates = targets.flatMap(({ card, target }) => (
    target.state === 'VALID' && target.validCandidates.length === 1
      ? [{ cardId: card.id, candidate: target.validCandidates[0] }]
      : []
  ));

  if (groupCandidates.length === cards.length) {
    return result('VALID', groupCandidates);
  }

  return result('NONE');
}

function isFootprintAnchorState(state: ManagementDropState) {
  return state === 'VALID'
    || state === 'AMBIGUOUS'
    || state === 'CURRENT';
}

function resolveFootprintTarget<
  T extends { startPeriod: number; state: ManagementDropState }
>(
  targets: T[],
  period: number,
  duration: number,
) {
  const own = targets.find((target) => target.startPeriod === period) ?? null;

  if (!own) {
    return {
      target: null,
      continuation: false,
    };
  }

  if (isFootprintAnchorState(own.state) || duration <= 1) {
    return {
      target: own,
      continuation: false,
    };
  }

  const earliestStart = Math.max(1, period - duration + 1);

  for (let start = period - 1; start >= earliestStart; start -= 1) {
    const candidate = targets.find((target) => target.startPeriod === start);
    if (
      candidate
      && isFootprintAnchorState(candidate.state)
      && start + duration - 1 >= period
    ) {
      return {
        target: candidate,
        continuation: true,
      };
    }
  }

  return {
    target: own,
    continuation: false,
  };
}

function targetClass(state: ManagementDropState) {
  if (state === 'VALID') {
    return 'border-emerald-400 bg-emerald-100/85 text-emerald-800';
  }

  if (state === 'AMBIGUOUS') {
    // The time slot is valid; only teacher/room selection remains.
    // Keep all placeable time slots in the same green visual language.
    return 'border-emerald-400 bg-emerald-100/85 text-emerald-800';
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
  if (state === 'AMBIGUOUS') return 'Uygun';
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
  dragCardIds,
  dragCandidateDetails,
  dragLoading,
  onDragStart,
  onDragEnd,
  onDropCandidates,
  onDropNeedsAttention,
}: {
  rows: ManagementBoardRow[];
  cards: ManagementBoardCard[];
  view: ManagementResourceView;
  activeDay: number;
  selectedCardId: string | null;
  onSelect: (cardId: string, sourceCardIds?: string[]) => void;
  canEdit: boolean;
  dragCard: ManagementBoardCard | null;
  dragCardIds: string[];
  dragCandidateDetails: Record<string, ManagementCandidateDetail>;
  dragLoading: boolean;
  onDragStart: (cardId: string, sourceCardIds?: string[]) => void;
  onDragEnd: () => void;
  onDropCandidates: (candidates: ManagementGroupDropCandidate[]) => void;
  onDropNeedsAttention: (target: ManagementDropTarget) => void;
}) {
  const dayCards = cards.filter(
    (card) => card.placement?.dayOfWeek === activeDay,
  );

  const dragCards = dragCardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter((card): card is ManagementBoardCard => Boolean(card));

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {dragCard && (
        <div className="pointer-events-none absolute left-3 top-3 z-40 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur">
          {dragLoading
            ? `${dragCard.subjectName} için uygun yerler hazırlanıyor…`
            : dragCardIds.length > 1
              ? `${dragCard.subjectName} · ${dragCardIds.length} kayıt birlikte taşınacak`
              : `${dragCard.subjectName} · başlangıç saatleri işaretlendi`}
        </div>
      )}

      <div className="management-scrollbar h-full overflow-auto">
        <div className="min-w-[948px]">
          <div className="grid grid-cols-[132px_repeat(12,minmax(68px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Sınıf / Alan
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
                const displayCards = buildManagementRowDisplayCards(rowCards, view);
                const packed = packCards(displayCards);
                const laneCount = packed.length === 0
                  ? 1
                  : Math.max(...packed.map((item) => item.lane)) + 1;
                const compactSectionRow = view === 'SINIFLAR'
                  && row.audienceScope === 'SECTION'
                  && row.includeSectionCards === false;
                const laneStep = 34;
                const cardHeight = 30;
                const rowHeight = Math.max(
                  44,
                  laneCount * laneStep + 8,
                );
                const rowGroupKey = row.gradeGroup
                  ?? row.classCode
                  ?? row.classCodes?.[0]
                  ?? row.id.split('::')[0];
                const previousGroupKey = rowIndex > 0
                  ? (
                    rows[rowIndex - 1].gradeGroup
                    ?? rows[rowIndex - 1].classCode
                    ?? rows[rowIndex - 1].classCodes?.[0]
                    ?? rows[rowIndex - 1].id.split('::')[0]
                  )
                  : null;
                const startsClassGroup = rowIndex === 0
                  || previousGroupKey !== rowGroupKey;

                return (
                  <div
                    key={row.id}
                    className={`grid grid-cols-[132px_minmax(816px,1fr)] ${
                      startsClassGroup && rowIndex > 0
                        ? 'border-t-4 border-t-[#F4F2ED]'
                        : 'border-t border-t-slate-100'
                    } last:border-b-0`}
                  >
                    <div
                      className={`sticky left-0 z-10 flex border-r border-slate-200 px-3 ${
                        compactSectionRow ? 'bg-amber-50/35 py-2' : 'bg-white py-2'
                      }`}
                      style={{ minHeight: rowHeight }}
                    >
                      <div className="min-w-0 self-center">
                        {startsClassGroup && row.groupLabel && (
                          <p className="truncate text-[10px] font-bold text-slate-800">
                            {row.groupLabel}
                          </p>
                        )}
                        <p className={`truncate text-[9px] font-semibold ${
                          startsClassGroup && row.groupLabel
                            ? 'mt-0.5 text-slate-500'
                            : 'text-slate-600'
                        }`}>
                          {row.label}
                          {row.secondary ? ` · ${row.secondary}` : ''}
                        </p>
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

                      {packed.map(({ displayCard, lane }) => {
                        const card = displayCard.card;
                        const placement = card.placement;
                        if (!placement) return null;

                        const left = ((placement.startPeriod - 1) / 12) * 100;
                        const width = (card.durationPeriods / 12) * 100;
                        const selected = displayCard.sourceCardIds.includes(
                          selectedCardId ?? '',
                        );
                        const sourceCards = displayCard.sourceCardIds
                          .map((cardId) => cards.find((item) => item.id === cardId))
                          .filter((item): item is ManagementBoardCard => Boolean(item));
                        const draggable = canEdit
                          && sourceCards.length === displayCard.sourceCardIds.length
                          && sourceCards.every((item) => !item.locked);
                        const secondaryLabel = displayCard.grouped
                          ? displayCard.classCodes.join(' + ')
                          : compactCardGroupName(card);

                        return (
                          <button
                            key={displayCard.id}
                            type="button"
                            draggable={draggable}
                            onDragStart={(event) => {
                              if (!draggable) {
                                event.preventDefault();
                                return;
                              }

                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', card.id);
                              onDragStart(card.id, displayCard.sourceCardIds);
                            }}
                            onDragEnd={onDragEnd}
                            onClick={() => onSelect(card.id, displayCard.sourceCardIds)}
                            className={`absolute overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition ${
                              draggable
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
                              top: 4 + lane * laneStep,
                              height: cardHeight,
                            }}
                            title={
                              displayCard.grouped
                                ? `${card.subjectName} · ${displayCard.classCodes.join(' + ')} · ${displayCard.sourceCardIds.length} kayıt`
                                : `${card.subjectName} · ${card.groupName}`
                            }
                          >
                            <p className="truncate text-[9.5px] font-semibold leading-tight">
                              {card.subjectName}
                            </p>
                            {secondaryLabel && (
                              <p className="mt-0.5 truncate text-[7.5px] font-medium leading-tight opacity-55">
                                {secondaryLabel}
                              </p>
                            )}
                          </button>
                        );
                      })}

                      {dragCard && (() => {
                        const duration = Math.max(
                          1,
                          ...dragCards.map((card) => card.durationPeriods),
                        );
                        const targets = PERIODS.map((period) =>
                          groupDropTargetForCell({
                            cards: dragCards,
                            detailsByCardId: dragCandidateDetails,
                            row,
                            view,
                            activeDay,
                            startPeriod: period.number,
                            loading: dragLoading,
                          }),
                        );

                        return (
                          <div className="absolute inset-0 z-30 grid grid-cols-12">
                            {PERIODS.map((period) => {
                              const footprint = resolveFootprintTarget(
                                targets,
                                period.number,
                                duration,
                              );
                              const target = footprint.target;

                              if (!target) {
                                return <div key={period.number} />;
                              }

                              const droppable = target.state !== 'NONE'
                                && target.state !== 'CURRENT';
                              const anchorLabel = targetLabel(target.state);
                              const label = footprint.continuation
                                ? ''
                                : (
                                  duration > 1
                                  && isFootprintAnchorState(target.state)
                                    ? `${anchorLabel} ×${duration}`
                                    : anchorLabel
                                );

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
                                      && target.groupCandidates.length === dragCards.length
                                    ) {
                                      onDropCandidates(target.groupCandidates);
                                      return;
                                    }

                                    onDropNeedsAttention(target);
                                  }}
                                  className={`m-1 flex min-w-0 items-center justify-center rounded-lg border border-dashed text-center text-[8px] font-bold transition ${
                                    targetClass(target.state)
                                  } ${
                                    footprint.continuation
                                      ? 'opacity-75'
                                      : ''
                                  }`}
                                  title={
                                    footprint.continuation
                                      ? `${targetLabel(target.state)} · ${target.startPeriod}. derste başlayan ${duration} derslik blok`
                                      : target.state === 'AMBIGUOUS'
                                        ? 'Uygun · öğretmen/salon seçimi gerekli'
                                        : duration > 1
                                          ? `${targetLabel(target.state)} · ${duration} derslik blok`
                                          : targetLabel(target.state)
                                  }
                                >
                                  <span className="truncate px-1">
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
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

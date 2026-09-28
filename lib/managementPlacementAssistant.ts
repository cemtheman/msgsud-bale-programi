import {
  buildManagementRowDisplayCards,
  type ManagementBoardCard,
  type ManagementCandidateAssessment,
  type ManagementCandidateDetail,
} from '@/lib/managementBoard';

export type ManagementPlacementAssistantGroupStatus =
  | 'SINGLE_OPTION'
  | 'CHOICES'
  | 'INFO_MISSING'
  | 'PROBLEM';

export interface ManagementPlacementAssistantGroup {
  id: string;
  cardIds: string[];
  subjectName: string;
  classCodes: string[];
  durationPeriods: number;
  status: ManagementPlacementAssistantGroupStatus;
}

export interface ManagementPlacementAssistantMove {
  cardId: string;
  candidate: ManagementCandidateAssessment;
}

export interface ManagementPlacementAssistantSuggestion {
  id: string;
  cardIds: string[];
  subjectName: string;
  classCodes: string[];
  durationPeriods: number;
  dayOfWeek: number;
  startPeriod: number;
  moves: ManagementPlacementAssistantMove[];
  teacherLabels: string[];
  roomLabels: string[];
}

function groupStatus(cards: ManagementBoardCard[]): ManagementPlacementAssistantGroupStatus {
  if (
    cards.length === 0
    || cards.some((card) => card.locked || card.isContradiction)
  ) {
    return 'PROBLEM';
  }

  if (
    cards.every((card) => card.validCount > 0)
    && cards.every((card) => card.isForced)
  ) {
    return 'SINGLE_OPTION';
  }

  if (cards.every((card) => card.validCount > 0)) {
    return 'CHOICES';
  }

  if (cards.some((card) => card.unresolvedCount > 0)) {
    return 'INFO_MISSING';
  }

  return 'PROBLEM';
}

export function buildManagementPlacementAssistantGroups(
  cards: ManagementBoardCard[],
): ManagementPlacementAssistantGroup[] {
  const unplaced = cards.filter((card) => !card.placement);
  const cardById = new Map(unplaced.map((card) => [card.id, card]));

  return buildManagementRowDisplayCards(unplaced, 'SINIFLAR')
    .map((displayCard) => {
      const sourceCards = displayCard.sourceCardIds
        .map((cardId) => cardById.get(cardId) ?? null)
        .filter((card): card is ManagementBoardCard => Boolean(card));

      return {
        id: displayCard.id,
        cardIds: displayCard.sourceCardIds,
        subjectName: displayCard.card.subjectName,
        classCodes: displayCard.classCodes,
        durationPeriods: displayCard.card.durationPeriods,
        status: groupStatus(sourceCards),
      };
    })
    .sort((a, b) => (
      a.classCodes.join(' ').localeCompare(
        b.classCodes.join(' '),
        'tr',
        { numeric: true },
      )
      || a.subjectName.localeCompare(b.subjectName, 'tr')
    ));
}

function uniqueValidCandidates(detail: ManagementCandidateDetail) {
  const seen = new Set<string>();

  return detail.assessments.filter((assessment) => {
    if (assessment.status !== 'VALID' || !assessment.isComplete) return false;

    const key = [
      assessment.dayOfWeek,
      assessment.startPeriod,
      assessment.teacherId ?? '∅',
      assessment.roomId ?? '∅',
    ].join(':');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slotKey(candidate: ManagementCandidateAssessment) {
  return `${candidate.dayOfWeek}:${candidate.startPeriod}`;
}

export function buildSafeManagementPlacementSuggestion(
  group: ManagementPlacementAssistantGroup,
  detailsByCardId: Readonly<Record<string, ManagementCandidateDetail>>,
  teacherNamesById: Readonly<Record<string, string>>,
  roomNamesById: Readonly<Record<string, string>>,
): ManagementPlacementAssistantSuggestion | null {
  if (group.status !== 'SINGLE_OPTION' || group.cardIds.length === 0) {
    return null;
  }

  const candidatesByCardId = new Map<string, ManagementCandidateAssessment[]>();

  for (const cardId of group.cardIds) {
    const detail = detailsByCardId[cardId];
    if (!detail) return null;

    const valid = uniqueValidCandidates(detail);
    if (valid.length === 0) return null;
    candidatesByCardId.set(cardId, valid);
  }

  const [firstCardId, ...otherCardIds] = group.cardIds;
  const firstCandidates = candidatesByCardId.get(firstCardId) ?? [];
  let commonSlots = new Set(firstCandidates.map(slotKey));

  for (const cardId of otherCardIds) {
    const cardSlots = new Set(
      (candidatesByCardId.get(cardId) ?? []).map(slotKey),
    );
    commonSlots = new Set(
      Array.from(commonSlots).filter((key) => cardSlots.has(key)),
    );
  }

  if (commonSlots.size !== 1) return null;

  const [commonSlot] = Array.from(commonSlots);
  const [dayText, periodText] = commonSlot.split(':');
  const dayOfWeek = Number(dayText);
  const startPeriod = Number(periodText);
  const moves: ManagementPlacementAssistantMove[] = [];

  for (const cardId of group.cardIds) {
    const atSlot = (candidatesByCardId.get(cardId) ?? []).filter(
      (candidate) => (
        candidate.dayOfWeek === dayOfWeek
        && candidate.startPeriod === startPeriod
      ),
    );

    // A single time with multiple teacher/room combinations still requires
    // a human choice. Do not call that an automatic suggestion.
    if (atSlot.length !== 1) return null;
    moves.push({ cardId, candidate: atSlot[0] });
  }

  const teacherLabels = Array.from(new Set(
    moves.map(({ candidate }) => (
      candidate.teacherId
        ? teacherNamesById[candidate.teacherId] ?? 'Öğretmen'
        : 'Öğretmen daha sonra kesinleşebilir'
    )),
  ));

  const roomLabels = Array.from(new Set(
    moves.map(({ candidate }) => (
      candidate.roomId
        ? roomNamesById[candidate.roomId] ?? 'Salon'
        : 'Salon daha sonra kesinleşebilir'
    )),
  ));

  return {
    id: group.id,
    cardIds: group.cardIds,
    subjectName: group.subjectName,
    classCodes: group.classCodes,
    durationPeriods: group.durationPeriods,
    dayOfWeek,
    startPeriod,
    moves,
    teacherLabels,
    roomLabels,
  };
}

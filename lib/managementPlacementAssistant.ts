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

export interface ManagementPlacementAssistantOption {
  id: string;
  dayOfWeek: number;
  startPeriod: number;
  moves: ManagementPlacementAssistantMove[];
  teacherLabels: string[];
  roomLabels: string[];
}

export interface ManagementPlacementAssistantSlot {
  id: string;
  dayOfWeek: number;
  startPeriod: number;
  exactOption: ManagementPlacementAssistantOption | null;
  primaryCandidates: ManagementCandidateAssessment[];
}

export interface ManagementPlacementAssistantPlan {
  group: ManagementPlacementAssistantGroup;
  commonSlotCount: number;
  slots: ManagementPlacementAssistantSlot[];
  exactOptions: ManagementPlacementAssistantOption[];
  resourceChoiceSlotCount: number;
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

function candidateLabels(
  moves: ManagementPlacementAssistantMove[],
  teacherNamesById: Readonly<Record<string, string>>,
  roomNamesById: Readonly<Record<string, string>>,
) {
  return {
    teacherLabels: Array.from(new Set(
      moves.map(({ candidate }) => (
        candidate.teacherId
          ? teacherNamesById[candidate.teacherId] ?? 'Öğretmen'
          : 'Öğretmen daha sonra kesinleşebilir'
      )),
    )),
    roomLabels: Array.from(new Set(
      moves.map(({ candidate }) => (
        candidate.roomId
          ? roomNamesById[candidate.roomId] ?? 'Salon'
          : 'Salon daha sonra kesinleşebilir'
      )),
    )),
  };
}

export function buildManagementPlacementAssistantPlan(
  group: ManagementPlacementAssistantGroup,
  detailsByCardId: Readonly<Record<string, ManagementCandidateDetail>>,
  teacherNamesById: Readonly<Record<string, string>>,
  roomNamesById: Readonly<Record<string, string>>,
): ManagementPlacementAssistantPlan {
  if (group.cardIds.length === 0) {
    return {
      group,
      commonSlotCount: 0,
      slots: [],
      exactOptions: [],
      resourceChoiceSlotCount: 0,
    };
  }

  const candidatesByCardId = new Map<string, ManagementCandidateAssessment[]>();

  for (const cardId of group.cardIds) {
    const detail = detailsByCardId[cardId];
    if (!detail) {
      return {
        group,
        commonSlotCount: 0,
        exactOptions: [],
        resourceChoiceSlotCount: 0,
      };
    }

    const valid = uniqueValidCandidates(detail);
    if (valid.length === 0) {
      return {
        group,
        commonSlotCount: 0,
        exactOptions: [],
        resourceChoiceSlotCount: 0,
      };
    }

    candidatesByCardId.set(cardId, valid);
  }

  const [firstCardId, ...otherCardIds] = group.cardIds;
  let commonSlots = new Set(
    (candidatesByCardId.get(firstCardId) ?? []).map(slotKey),
  );

  for (const cardId of otherCardIds) {
    const cardSlots = new Set(
      (candidatesByCardId.get(cardId) ?? []).map(slotKey),
    );
    commonSlots = new Set(
      Array.from(commonSlots).filter((key) => cardSlots.has(key)),
    );
  }

  const orderedSlots = Array.from(commonSlots)
    .map((key) => {
      const [dayText, periodText] = key.split(':');
      return {
        key,
        dayOfWeek: Number(dayText),
        startPeriod: Number(periodText),
      };
    })
    .sort((a, b) => (
      a.dayOfWeek - b.dayOfWeek
      || a.startPeriod - b.startPeriod
    ));

  const slots: ManagementPlacementAssistantSlot[] = [];
  const exactOptions: ManagementPlacementAssistantOption[] = [];
  let resourceChoiceSlotCount = 0;

  for (const slot of orderedSlots) {
    const moves: ManagementPlacementAssistantMove[] = [];
    let exact = true;
    const primaryCandidates = (candidatesByCardId.get(firstCardId) ?? []).filter(
      (candidate) => (
        candidate.dayOfWeek === slot.dayOfWeek
        && candidate.startPeriod === slot.startPeriod
      ),
    );

    for (const cardId of group.cardIds) {
      const atSlot = (candidatesByCardId.get(cardId) ?? []).filter(
        (candidate) => (
          candidate.dayOfWeek === slot.dayOfWeek
          && candidate.startPeriod === slot.startPeriod
        ),
      );

      if (atSlot.length !== 1) {
        exact = false;
        break;
      }

      moves.push({ cardId, candidate: atSlot[0] });
    }

    if (!exact) {
      resourceChoiceSlotCount += 1;
      slots.push({
        id: `${group.id}:${slot.key}`,
        dayOfWeek: slot.dayOfWeek,
        startPeriod: slot.startPeriod,
        exactOption: null,
        primaryCandidates,
      });
      continue;
    }

    const labels = candidateLabels(
      moves,
      teacherNamesById,
      roomNamesById,
    );

    const exactOption: ManagementPlacementAssistantOption = {
      id: `${group.id}:${slot.key}`,
      dayOfWeek: slot.dayOfWeek,
      startPeriod: slot.startPeriod,
      moves,
      ...labels,
    };

    exactOptions.push(exactOption);
    slots.push({
      id: exactOption.id,
      dayOfWeek: slot.dayOfWeek,
      startPeriod: slot.startPeriod,
      exactOption,
      primaryCandidates,
    });
  }

  return {
    group,
    commonSlotCount: orderedSlots.length,
    slots,
    exactOptions,
    resourceChoiceSlotCount,
  };
}

export function sortManagementPlacementAssistantPlans(
  plans: ManagementPlacementAssistantPlan[],
) {
  return [...plans].sort((a, b) => (
    // Zero means the fresh candidate pass found a problem; surface it first.
    a.commonSlotCount - b.commonSlotCount
    || a.group.classCodes.join(' ').localeCompare(
      b.group.classCodes.join(' '),
      'tr',
      { numeric: true },
    )
    || a.group.subjectName.localeCompare(b.group.subjectName, 'tr')
  ));
}

export function buildSafeManagementPlacementSuggestion(
  group: ManagementPlacementAssistantGroup,
  detailsByCardId: Readonly<Record<string, ManagementCandidateDetail>>,
  teacherNamesById: Readonly<Record<string, string>>,
  roomNamesById: Readonly<Record<string, string>>,
): ManagementPlacementAssistantSuggestion | null {
  const plan = buildManagementPlacementAssistantPlan(
    group,
    detailsByCardId,
    teacherNamesById,
    roomNamesById,
  );

  if (
    plan.commonSlotCount !== 1
    || plan.exactOptions.length !== 1
    || plan.resourceChoiceSlotCount !== 0
  ) {
    return null;
  }

  const option = plan.exactOptions[0];

  return {
    id: group.id,
    cardIds: group.cardIds,
    subjectName: group.subjectName,
    classCodes: group.classCodes,
    durationPeriods: group.durationPeriods,
    dayOfWeek: option.dayOfWeek,
    startPeriod: option.startPeriod,
    moves: option.moves,
    teacherLabels: option.teacherLabels,
    roomLabels: option.roomLabels,
  };
}

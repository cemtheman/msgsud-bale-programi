'use client';

import {
  cardHasMissingRequiredRoom,
  cardHasMissingRequiredTeacher,
  cardMatchesStage,
  type ManagementBoardCard,
  type ManagementStage,
} from '@/lib/managementBoard';

export type ManagementOperationalQueueKind = 'TEACHER' | 'ROOM';

export interface ManagementOperationalQueueItem {
  id: string;
  kind: ManagementOperationalQueueKind;
  cardId: string;
  subjectName: string;
  groupName: string;
  classCodes: string[];
  dayOfWeek: number;
  startPeriod: number;
  durationPeriods: number;
  fixedResourceLabel: string | null;
}

export interface ManagementOperationalQueue {
  items: ManagementOperationalQueueItem[];
  teacherCount: number;
  roomCount: number;
  totalCount: number;
}

function queueItem(
  card: ManagementBoardCard,
  kind: ManagementOperationalQueueKind,
): ManagementOperationalQueueItem | null {
  if (!card.placement) return null;

  return {
    id: `${kind}:${card.id}`,
    kind,
    cardId: card.id,
    subjectName: card.subjectName,
    groupName: card.groupName,
    classCodes: card.classCodes,
    dayOfWeek: card.placement.dayOfWeek,
    startPeriod: card.placement.startPeriod,
    durationPeriods: card.durationPeriods,
    fixedResourceLabel: kind === 'TEACHER'
      ? card.placement.roomName
      : card.placement.teacherName,
  };
}

function compareQueueItems(
  left: ManagementOperationalQueueItem,
  right: ManagementOperationalQueueItem,
) {
  const kindPriority: Record<ManagementOperationalQueueKind, number> = {
    TEACHER: 0,
    ROOM: 1,
  };

  return (
    left.dayOfWeek - right.dayOfWeek
    || left.startPeriod - right.startPeriod
    || left.subjectName.localeCompare(right.subjectName, 'tr')
    || left.groupName.localeCompare(right.groupName, 'tr')
    || kindPriority[left.kind] - kindPriority[right.kind]
  );
}

export function buildManagementOperationalQueue(
  cards: readonly ManagementBoardCard[],
  stage: ManagementStage,
): ManagementOperationalQueue {
  const stageCards = cards.filter((card) => cardMatchesStage(card, stage));
  const items: ManagementOperationalQueueItem[] = [];

  stageCards.forEach((card) => {
    if (cardHasMissingRequiredTeacher(card)) {
      const item = queueItem(card, 'TEACHER');
      if (item) items.push(item);
    }

    if (cardHasMissingRequiredRoom(card)) {
      const item = queueItem(card, 'ROOM');
      if (item) items.push(item);
    }
  });

  items.sort(compareQueueItems);

  const teacherCount = items.filter((item) => item.kind === 'TEACHER').length;
  const roomCount = items.filter((item) => item.kind === 'ROOM').length;

  return {
    items,
    teacherCount,
    roomCount,
    totalCount: items.length,
  };
}

import { describe, expect, it } from 'vitest';
import {
  buildManagementClassRows,
  cardBelongsToClassRow,
  type ManagementBoardCard,
} from '@/lib/managementBoard';

function card(
  id: string,
  audienceTargets: string[],
): ManagementBoardCard {
  return {
    id,
    requirementId: `req-${id}`,
    blockIndex: 1,
    durationPeriods: 1,
    locked: false,
    subjectId: `subject-${id}`,
    subjectName: id,
    groupId: `group-${id}`,
    groupName: id,
    groupType: 'STANDARD',
    classCodes: ['5A'],
    audienceTargets,
    weeklyLoad: 1,
    teacherMode: 'UNKNOWN',
    teacherIds: [],
    teacherNames: [],
    resourceMode: 'UNKNOWN',
    roomIds: [],
    roomNames: [],
    courseCharacter: 'OTHER',
    deliveryMode: 'STANDARD',
    knowledgeStatus: 'OBSERVED',
    domainStatus: 'VALID',
    validCount: 1,
    invalidCount: 0,
    unresolvedCount: 0,
    isForced: false,
    isContradiction: false,
    placement: {
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: null,
      teacherName: null,
      roomId: null,
      roomName: null,
      moveTransactionId: null,
    },
  };
}

describe('management class rows for mixed ballet/music sections', () => {
  it('splits a mixed class into Bale and Müzik rows', () => {
    const cards = [
      card('bale', ['BALLET']),
      card('music', ['MUSIC']),
      card('culture', ['SECTION']),
    ];

    const rows = buildManagementClassRows(
      [{ grade: 5, section: 'A' }],
      cards,
    );

    expect(rows).toEqual([
      {
        id: '5A::BALLET',
        label: '5A · Bale',
        secondary: 'Ortaokul',
        classCode: '5A',
        audienceScope: 'BALLET',
      },
      {
        id: '5A::MUSIC',
        label: '5A · Müzik',
        secondary: 'Ortaokul',
        classCode: '5A',
        audienceScope: 'MUSIC',
      },
    ]);

    expect(cardBelongsToClassRow(cards[0], rows[0])).toBe(true);
    expect(cardBelongsToClassRow(cards[0], rows[1])).toBe(false);
    expect(cardBelongsToClassRow(cards[1], rows[0])).toBe(false);
    expect(cardBelongsToClassRow(cards[1], rows[1])).toBe(true);

    // SECTION lessons belong to both student populations.
    expect(cardBelongsToClassRow(cards[2], rows[0])).toBe(true);
    expect(cardBelongsToClassRow(cards[2], rows[1])).toBe(true);
  });

  it('keeps a single row when only one population exists', () => {
    const musicCard = card('music-only', ['MUSIC']);

    const rows = buildManagementClassRows(
      [{ grade: 5, section: 'B' }],
      [musicCard],
    );

    expect(rows).toEqual([
      {
        id: '5B',
        label: '5B',
        secondary: 'Ortaokul',
        classCode: '5B',
        audienceScope: 'ALL',
      },
    ]);
  });
});

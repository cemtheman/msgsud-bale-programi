import { describe, expect, it } from 'vitest';
import {
  buildManagementClassRows,
  cardBelongsToClassRow,
  managementRowsForView,
  type ManagementBoardCard,
  type ManagementBoardData,
  type ManagementBoardRow,
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

function board(cards: ManagementBoardCard[]): ManagementBoardData {
  return {
    revisionId: 'revision',
    cards,
    classRows: buildManagementClassRows(
      [{ grade: 5, section: 'A' }],
      cards,
    ),
    teacherRows: [],
    roomRows: [],
    teacherNamesById: {},
    roomNamesById: {},
  };
}

describe('management class audience rows', () => {
  it('keeps one compact class row in the combined view', () => {
    const cards = [
      card('bale', ['BALLET']),
      card('music', ['MUSIC']),
      card('culture', ['SECTION']),
    ];

    expect(buildManagementClassRows(
      [{ grade: 5, section: 'A' }],
      cards,
    )).toEqual([
      {
        id: '5A',
        label: '5A',
        secondary: 'Ortaokul',
        classCode: '5A',
        audienceScope: 'ALL',
      },
    ]);
  });

  it('creates strict symbolic rows when an audience filter is selected', () => {
    const cards = [
      card('bale', ['BALLET']),
      card('music', ['MUSIC']),
      card('culture', ['SECTION']),
    ];
    const data = board(cards);

    expect(managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'SECTION',
    )[0]).toMatchObject({
      id: '5A::SECTION',
      label: '5A · 📚',
      audienceScope: 'SECTION',
    });

    expect(managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'BALLET',
    )[0]).toMatchObject({
      id: '5A::BALLET',
      label: '5A · 🩰',
      audienceScope: 'BALLET',
    });

    expect(managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'MUSIC',
    )[0]).toMatchObject({
      id: '5A::MUSIC',
      label: '5A · 🎶',
      audienceScope: 'MUSIC',
    });

    const sectionRow: ManagementBoardRow = {
      id: '5A::SECTION',
      label: '5A · 📚',
      secondary: 'Ortaokul',
      classCode: '5A',
      audienceScope: 'SECTION',
    };
    const balletRow: ManagementBoardRow = {
      ...sectionRow,
      id: '5A::BALLET',
      label: '5A · 🩰',
      audienceScope: 'BALLET',
    };
    const musicRow: ManagementBoardRow = {
      ...sectionRow,
      id: '5A::MUSIC',
      label: '5A · 🎶',
      audienceScope: 'MUSIC',
    };

    expect(cardBelongsToClassRow(cards[2], sectionRow)).toBe(true);
    expect(cardBelongsToClassRow(cards[2], balletRow)).toBe(false);
    expect(cardBelongsToClassRow(cards[0], balletRow)).toBe(true);
    expect(cardBelongsToClassRow(cards[0], musicRow)).toBe(false);
    expect(cardBelongsToClassRow(cards[1], musicRow)).toBe(true);
  });
  it('keeps a source-confirmed audience row even before lesson cards exist', () => {
    const data: ManagementBoardData = {
      ...board([]),
      classRows: buildManagementClassRows(
        [{ grade: 12, section: 'B' }],
        [],
        { '12B': ['SECTION', 'MUSIC', 'BALLET'] },
      ),
    };

    expect(managementRowsForView(
      data,
      'SINIFLAR',
      'LISE',
      'BALLET',
    )).toEqual([
      {
        id: '12B::BALLET',
        label: '12B · 🩰',
        secondary: 'Lise',
        classCode: '12B',
        audienceScope: 'BALLET',
        availableAudiences: ['SECTION', 'MUSIC', 'BALLET'],
      },
    ]);
  });

});

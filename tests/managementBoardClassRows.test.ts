import { describe, expect, it } from 'vitest';
import {
  buildManagementClassRows,
  buildManagementRowDisplayCards,
  cardBelongsToClassRow,
  managementRowsForView,
  type ManagementBoardCard,
  type ManagementBoardData,
} from '@/lib/managementBoard';

function card(
  id: string,
  audienceTargets: string[],
  classCodes: string[] = ['5A'],
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
    classCodes,
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

function board(
  cards: ManagementBoardCard[],
  audiencesByClassCode: Readonly<Record<string, readonly ('SECTION' | 'BALLET' | 'MUSIC')[]>>,
): ManagementBoardData {
  return {
    revisionId: 'revision',
    cards,
    classRows: buildManagementClassRows(
      [
        { grade: 5, section: 'A' },
        { grade: 5, section: 'B' },
      ],
      cards,
      audiencesByClassCode,
    ),
    teacherRows: [],
    roomRows: [],
    teacherNamesById: {},
    roomNamesById: {},
  };
}

describe('management grade-group audience rows', () => {
  const audiences = {
    '5A': ['SECTION', 'BALLET', 'MUSIC'] as const,
    '5B': ['SECTION', 'MUSIC'] as const,
  };

  const cards = [
    card('culture-5A', ['SECTION'], ['5A']),
    card('culture-5B', ['SECTION'], ['5B']),
    card('ballet-5A', ['BALLET'], ['5A']),
    card('music-shared', ['MUSIC'], ['5A', '5B']),
  ];

  it('groups A/B classes into one grade block with strict audience subrows', () => {
    expect(buildManagementClassRows(
      [
        { grade: 5, section: 'A' },
        { grade: 5, section: 'B' },
      ],
      cards,
      audiences,
    )).toEqual([
      {
        id: 'grade-5::SECTION',
        label: '📚 Ortak',
        secondary: '5A + 5B',
        classCodes: ['5A', '5B'],
        gradeGroup: 5,
        groupLabel: '5. Sınıflar',
        audienceScope: 'SECTION',
        availableAudiences: ['SECTION'],
        includeSectionCards: false,
      },
      {
        id: 'grade-5::BALLET',
        label: '🩰 Bale',
        secondary: '5A',
        classCodes: ['5A'],
        gradeGroup: 5,
        groupLabel: '5. Sınıflar',
        audienceScope: 'BALLET',
        availableAudiences: ['BALLET'],
        includeSectionCards: false,
      },
      {
        id: 'grade-5::MUSIC',
        label: '🎶 Müzik',
        secondary: '5A + 5B',
        classCodes: ['5A', '5B'],
        gradeGroup: 5,
        groupLabel: '5. Sınıflar',
        audienceScope: 'MUSIC',
        availableAudiences: ['MUSIC'],
        includeSectionCards: false,
      },
    ]);
  });

  it('renders common, ballet and music cards once in the combined grade block', () => {
    const data = board(cards, audiences);
    const rows = managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'ALL',
    );

    expect(rows.map((row) => row.audienceScope)).toEqual([
      'SECTION',
      'BALLET',
      'MUSIC',
    ]);

    expect(cards.filter((item) => cardBelongsToClassRow(item, rows[0]))
      .map((item) => item.id)).toEqual([
      'culture-5A',
      'culture-5B',
    ]);
    expect(cards.filter((item) => cardBelongsToClassRow(item, rows[1]))
      .map((item) => item.id)).toEqual([
      'ballet-5A',
    ]);
    expect(cards.filter((item) => cardBelongsToClassRow(item, rows[2]))
      .map((item) => item.id)).toEqual([
      'music-shared',
    ]);
  });

  it('keeps focused student-program filters complete without sibling rows', () => {
    const data = board(cards, audiences);

    const balletRows = managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'BALLET',
    );
    expect(balletRows).toHaveLength(1);
    expect(balletRows[0]).toMatchObject({
      id: 'grade-5::BALLET',
      secondary: '5A',
      includeSectionCards: true,
    });
    expect(cards.filter((item) => cardBelongsToClassRow(item, balletRows[0]))
      .map((item) => item.id)).toEqual([
      'culture-5A',
      'ballet-5A',
    ]);

    const musicRows = managementRowsForView(
      data,
      'SINIFLAR',
      'ORTAOKUL',
      'MUSIC',
    );
    expect(musicRows).toHaveLength(1);
    expect(musicRows[0]).toMatchObject({
      id: 'grade-5::MUSIC',
      secondary: '5A + 5B',
      includeSectionCards: true,
    });
    expect(cards.filter((item) => cardBelongsToClassRow(item, musicRows[0]))
      .map((item) => item.id)).toEqual([
      'culture-5A',
      'culture-5B',
      'music-shared',
    ]);
  });

  it('coalesces the same placed common lesson across sibling classes for display only', () => {
    const turkish5A = {
      ...card('turkish-5A', ['SECTION'], ['5A']),
      subjectId: 'subject-turkish',
      subjectName: 'Türkçe',
      groupName: 'Türkçe · 5A',
    };
    const turkish5B = {
      ...card('turkish-5B', ['SECTION'], ['5B']),
      subjectId: 'subject-turkish',
      subjectName: 'Türkçe',
      groupName: 'Türkçe · 5B',
    };

    const displayCards = buildManagementRowDisplayCards(
      [turkish5A, turkish5B],
      'SINIFLAR',
    );

    expect(displayCards).toHaveLength(1);
    expect(displayCards[0]).toMatchObject({
      grouped: true,
      sourceCardIds: ['turkish-5A', 'turkish-5B'],
      classCodes: ['5A', '5B'],
    });
    expect(displayCards[0].card.id).toBe('turkish-5A');
    expect(turkish5A.classCodes).toEqual(['5A']);
    expect(turkish5B.classCodes).toEqual(['5B']);
  });

  it('keeps different slots separate and never aggregates teacher or room views', () => {
    const turkish5A = {
      ...card('turkish-5A', ['SECTION'], ['5A']),
      subjectId: 'subject-turkish',
      subjectName: 'Türkçe',
    };
    const turkish5B = {
      ...card('turkish-5B', ['SECTION'], ['5B']),
      subjectId: 'subject-turkish',
      subjectName: 'Türkçe',
      placement: {
        ...card('slot-source', ['SECTION'], ['5B']).placement!,
        startPeriod: 2,
      },
    };

    expect(buildManagementRowDisplayCards(
      [turkish5A, turkish5B],
      'SINIFLAR',
    )).toHaveLength(2);

    const sameSlot5B = {
      ...turkish5B,
      placement: {
        ...turkish5B.placement!,
        startPeriod: 1,
      },
    };

    expect(buildManagementRowDisplayCards(
      [turkish5A, sameSlot5B],
      'ÖĞRETMENLER',
    )).toHaveLength(2);
  });

  it('keeps a source-confirmed audience row even before lesson cards exist', () => {
    const classRows = buildManagementClassRows(
      [
        { grade: 12, section: 'A' },
        { grade: 12, section: 'B' },
      ],
      [],
      {
        '12A': ['SECTION', 'BALLET', 'MUSIC'],
        '12B': ['SECTION', 'BALLET', 'MUSIC'],
      },
    );

    const data: ManagementBoardData = {
      revisionId: 'revision',
      cards: [],
      classRows,
      teacherRows: [],
      roomRows: [],
      teacherNamesById: {},
      roomNamesById: {},
    };

    expect(managementRowsForView(
      data,
      'SINIFLAR',
      'LISE',
      'BALLET',
    )).toEqual([
      {
        id: 'grade-12::BALLET',
        label: '🩰 Bale',
        secondary: '12A + 12B',
        classCodes: ['12A', '12B'],
        gradeGroup: 12,
        groupLabel: '12. Sınıflar',
        audienceScope: 'BALLET',
        availableAudiences: ['BALLET'],
        includeSectionCards: true,
      },
    ]);
  });
});

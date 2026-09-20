'use client';

import {
  cardMatchesStage,
  type ManagementBoardCard,
  type ManagementBoardData,
  type ManagementStage,
} from '@/lib/managementBoard';

export type ManagementLoadStatus =
  | 'TAMAMLANDI'
  | 'EKSIK'
  | 'BASLANMADI'
  | 'FAZLA';

export interface ManagementCourseLoadRow {
  requirementId: string;
  subjectName: string;
  groupName: string;
  classCodes: string[];
  teacherNames: string[];
  weeklyLoad: number;
  placedLoad: number;
  remainingLoad: number;
  extraLoad: number;
  placedBlocks: number;
  totalBlocks: number;
  status: ManagementLoadStatus;
}

export interface ManagementCourseLoadSummary {
  rows: ManagementCourseLoadRow[];
  requiredLoad: number;
  placedLoad: number;
  remainingLoad: number;
  completeRequirements: number;
  incompleteRequirements: number;
}

export function deriveManagementCourseLoads(
  board: ManagementBoardData | null,
  stage: ManagementStage,
): ManagementCourseLoadSummary | null {
  if (!board) return null;

  const cards = board.cards.filter((card) => cardMatchesStage(card, stage));
  const byRequirement = new Map<string, ManagementBoardCard[]>();

  cards.forEach((card) => {
    const values = byRequirement.get(card.requirementId) ?? [];
    values.push(card);
    byRequirement.set(card.requirementId, values);
  });

  const rows: ManagementCourseLoadRow[] = Array.from(byRequirement.entries())
    .map(([requirementId, requirementCards]) => {
      const first = requirementCards[0];
      const weeklyLoad = first.weeklyLoad;
      const placedLoad = requirementCards
        .filter((card) => Boolean(card.placement))
        .reduce((sum, card) => sum + card.durationPeriods, 0);
      const remainingLoad = Math.max(weeklyLoad - placedLoad, 0);
      const extraLoad = Math.max(placedLoad - weeklyLoad, 0);

      let status: ManagementLoadStatus = 'EKSIK';
      if (placedLoad === 0) status = 'BASLANMADI';
      if (placedLoad === weeklyLoad) status = 'TAMAMLANDI';
      if (placedLoad > weeklyLoad) status = 'FAZLA';

      return {
        requirementId,
        subjectName: first.subjectName,
        groupName: first.groupName,
        classCodes: first.classCodes,
        teacherNames: first.teacherNames,
        weeklyLoad,
        placedLoad,
        remainingLoad,
        extraLoad,
        placedBlocks: requirementCards.filter((card) => Boolean(card.placement)).length,
        totalBlocks: requirementCards.length,
        status,
      };
    })
    .sort((a, b) => (
      (a.classCodes[0] ?? 'ZZ').localeCompare(
        b.classCodes[0] ?? 'ZZ',
        'tr',
        { numeric: true },
      )
      || a.subjectName.localeCompare(b.subjectName, 'tr')
      || a.groupName.localeCompare(b.groupName, 'tr')
    ));

  const requiredLoad = rows.reduce((sum, row) => sum + row.weeklyLoad, 0);
  const placedLoad = rows.reduce((sum, row) => sum + row.placedLoad, 0);
  const remainingLoad = rows.reduce((sum, row) => sum + row.remainingLoad, 0);

  return {
    rows,
    requiredLoad,
    placedLoad,
    remainingLoad,
    completeRequirements: rows.filter((row) => row.status === 'TAMAMLANDI').length,
    incompleteRequirements: rows.filter((row) => row.status !== 'TAMAMLANDI').length,
  };
}

'use client';

import {
  cardMatchesStage,
  type ManagementBoardData,
  type ManagementStage,
} from '@/lib/managementBoard';
import type { ManagementOverview } from '@/lib/managementOverview';

export type ManagementReadinessStatus =
  | 'YAYINA_HAZIR'
  | 'UYARILARLA_HAZIR'
  | 'YAYIN_ENGELLI';

export type ManagementIssueOrigin =
  | 'INTRODUCED'
  | 'INHERITED'
  | 'TOUCHED_INHERITED';

export interface ManagementHealthIssue {
  id: string;
  severity: 'BLOCKER' | 'WARNING';
  title: string;
  detail: string;
  count: number;
  origin?: ManagementIssueOrigin;
}

export interface ManagementHealthSnapshot {
  status: ManagementReadinessStatus;
  blockers: ManagementHealthIssue[];
  warnings: ManagementHealthIssue[];
  checkedCount: number;
  placedCount: number;
  totalCards: number;
}

export function deriveManagementHealth(
  board: ManagementBoardData | null,
  overview: ManagementOverview | null,
  stage?: ManagementStage,
): ManagementHealthSnapshot | null {
  if (!board || !overview) return null;

  const touched = new Set(overview.touchedCardIds);
  const cards = stage
    ? cards.filter((card) => cardMatchesStage(card, stage))
    : board.cards;

  const unplacedTouched = cards.filter(
    (card) => !card.placement && touched.has(card.id),
  );
  const unplacedUntouched = cards.filter(
    (card) => !card.placement && !touched.has(card.id),
  );

  const contradictionTouched = cards.filter(
    (card) => card.isContradiction && touched.has(card.id),
  );
  const contradictionUntouched = cards.filter(
    (card) => card.isContradiction && !touched.has(card.id),
  );

  const unresolvedTouched = cards.filter(
    (card) => (
      card.unresolvedCount > 0
      && touched.has(card.id)
      && !card.isContradiction
    ),
  );

  const unresolvedInherited = cards.filter(
    (card) => (
      card.unresolvedCount > 0
      && !touched.has(card.id)
      && !card.isContradiction
    ),
  );

  const blockers: ManagementHealthIssue[] = [];
  const warnings: ManagementHealthIssue[] = [];

  if (unplacedUntouched.length > 0) {
    blockers.push({
      id: 'unplaced-inherited',
      severity: 'BLOCKER',
      title: 'Programda henüz yeri olmayan dersler',
      detail: 'Bu derslerin programda bir gün ve saat seçimi yapılmalı.',
      count: unplacedUntouched.length,
      origin: 'INHERITED',
    });
  }

  if (unplacedTouched.length > 0) {
    blockers.push({
      id: 'unplaced-touched',
      severity: 'BLOCKER',
      title: 'Düzenlenmiş ama hâlâ yerleştirilmemiş dersler',
      detail: 'Bu derslerde değişiklik yapılmış ancak son durumda programda geçerli bir yeri kalmamış.',
      count: unplacedTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (contradictionUntouched.length > 0) {
    blockers.push({
      id: 'contradiction-inherited',
      severity: 'BLOCKER',
      title: 'Uygun yer bulunamayan dersler',
      detail: 'Bu dersler için mevcut kurallara göre geçerli bir gün, saat, öğretmen ve salon birleşimi kalmamış.',
      count: contradictionUntouched.length,
      origin: 'INHERITED',
    });
  }

  if (contradictionTouched.length > 0) {
    blockers.push({
      id: 'contradiction-touched',
      severity: 'BLOCKER',
      title: 'Değişiklik sonrası uygun yeri kalmayan dersler',
      detail: 'Bu derslerde yapılan değişiklikten sonra geçerli bir yerleşim seçeneği kalmamış.',
      count: contradictionTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (unresolvedTouched.length > 0) {
    blockers.push({
      id: 'unresolved-touched',
      severity: 'BLOCKER',
      title: 'Düzenlenen derslerde eksik bilgi var',
      detail: 'Bu derslerde öğretmen, salon veya kaynak bilgisi tamamlanmadan program yayımlanamaz.',
      count: unresolvedTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (unresolvedInherited.length > 0) {
    warnings.push({
      id: 'unresolved-inherited',
      severity: 'WARNING',
      title: 'Tamamlanmamış öğretmen veya salon bilgileri',
      detail: 'Mevcut veriden gelen bazı öğretmen veya salon bilgileri eksik. Bu kayıtlar henüz düzenlenmediği için ayrı bir dikkat notu olarak izleniyor.',
      count: unresolvedInherited.length,
      origin: 'INHERITED',
    });
  }

  const status: ManagementReadinessStatus = blockers.length > 0
    ? 'YAYIN_ENGELLI'
    : warnings.length > 0
      ? 'UYARILARLA_HAZIR'
      : 'YAYINA_HAZIR';

  return {
    status,
    blockers,
    warnings,
    checkedCount: cards.length,
    placedCount: cards.filter((card) => Boolean(card.placement)).length,
    totalCards: cards.length,
  };
}

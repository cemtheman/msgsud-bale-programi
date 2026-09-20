'use client';

import type { ManagementBoardData } from '@/lib/managementBoard';
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
): ManagementHealthSnapshot | null {
  if (!board || !overview) return null;

  const touched = new Set(overview.touchedCardIds);

  const unplacedTouched = board.cards.filter(
    (card) => !card.placement && touched.has(card.id),
  );
  const unplacedUntouched = board.cards.filter(
    (card) => !card.placement && !touched.has(card.id),
  );

  const contradictionTouched = board.cards.filter(
    (card) => card.isContradiction && touched.has(card.id),
  );
  const contradictionUntouched = board.cards.filter(
    (card) => card.isContradiction && !touched.has(card.id),
  );

  const unresolvedTouched = board.cards.filter(
    (card) => (
      card.unresolvedCount > 0
      && touched.has(card.id)
      && !card.isContradiction
    ),
  );

  const unresolvedInherited = board.cards.filter(
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
      title: 'Yerleşmemiş ders kartları',
      detail: 'Tüm zorunlu ders kartları yerleştirilmeden program yayına hazır sayılamaz.',
      count: unplacedUntouched.length,
      origin: 'INHERITED',
    });
  }

  if (unplacedTouched.length > 0) {
    blockers.push({
      id: 'unplaced-touched',
      severity: 'BLOCKER',
      title: 'Müdahale edilmiş ama yerleşmemiş kartlar',
      detail: 'Üzerinde işlem yapılmış bu kartların programda geçerli bir yerleşimi bulunmuyor.',
      count: unplacedTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (contradictionUntouched.length > 0) {
    blockers.push({
      id: 'contradiction-inherited',
      severity: 'BLOCKER',
      title: 'Çelişkiye düşmüş kartlar',
      detail: 'Bu kartların geçerli ve tamamlanabilir bir aday alanı kalmamış.',
      count: contradictionUntouched.length,
      origin: 'INHERITED',
    });
  }

  if (contradictionTouched.length > 0) {
    blockers.push({
      id: 'contradiction-touched',
      severity: 'BLOCKER',
      title: 'Müdahale sonrası çelişkiye düşmüş kartlar',
      detail: 'İşlem görmüş bu kartların geçerli ve tamamlanabilir bir aday alanı kalmamış.',
      count: contradictionTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (unresolvedTouched.length > 0) {
    blockers.push({
      id: 'unresolved-touched',
      severity: 'BLOCKER',
      title: 'Müdahale edilmiş kartlarda belirsiz veri',
      detail: 'Dokunulmuş kartlarda öğretmen, salon veya kaynak bilgisi belirsiz kaldığı için yayın engellenir.',
      count: unresolvedTouched.length,
      origin: 'TOUCHED_INHERITED',
    });
  }

  if (unresolvedInherited.length > 0) {
    warnings.push({
      id: 'unresolved-inherited',
      severity: 'WARNING',
      title: 'Devralınmış veri belirsizlikleri',
      detail: 'Dokunulmamış eski veri belirsizlikleri veri borcu olarak izlenir; tek başına yayını engellemez.',
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
    checkedCount: board.cards.length,
    placedCount: overview.placedCount,
    totalCards: overview.cardCount,
  };
}

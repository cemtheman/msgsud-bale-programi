import type {
  ManagementBundleCandidateInput,
} from '@/lib/managementCommands';
import type {
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import type {
  ManagementOptimizationResult,
} from '@/lib/managementSolverPrototype';

export interface ManagementSolverProposalApplyPlan {
  canApply: boolean;
  items: ManagementBundleCandidateInput[];
  reasons: string[];
}

export function prepareManagementSolverProposalApply(
  result: ManagementOptimizationResult,
  currentWorkspace: ManagementSolverWorkspace | null,
): ManagementSolverProposalApplyPlan {
  const reasons: string[] = [];

  if (result.status !== 'IMPROVED') {
    reasons.push('PROPOSAL_NOT_IMPROVED');
  }

  if (!currentWorkspace) {
    reasons.push('WORKSPACE_NOT_AVAILABLE');
  } else {
    if (
      currentWorkspace.preview.snapshotHash
      !== result.snapshotHash
    ) {
      reasons.push('SNAPSHOT_CHANGED');
    }

    if (
      currentWorkspace.preview.baselineHash
      !== result.baselineHash
    ) {
      reasons.push('BASELINE_CHANGED');
    }
  }

  const items = result.placements
    .filter((placement) => !placement.baseline)
    .map((placement) => ({
      cardId: placement.cardId,
      dayOfWeek: placement.dayOfWeek,
      startPeriod: placement.startPeriod,
      teacherId: placement.teacherId,
      roomId: placement.roomId,
    }))
    .sort((left, right) => left.cardId.localeCompare(right.cardId));

  if (items.length === 0) {
    reasons.push('NO_CHANGED_PLACEMENTS');
  }

  // M26.8 bundle RPC contract is 1..24 cards. M40-v1 currently
  // accepts at most eight local-improvement moves, so exceeding this
  // limit indicates that the proposal/apply contracts drifted apart.
  if (items.length > 24) {
    reasons.push('BUNDLE_LIMIT_EXCEEDED');
  }

  return {
    canApply: reasons.length === 0,
    items,
    reasons,
  };
}

export function translateManagementSolverProposalApplyReason(
  reason: string,
) {
  switch (reason) {
    case 'PROPOSAL_NOT_IMPROVED':
      return 'Uygulanacak daha iyi bir program seçeneği yok.';
    case 'WORKSPACE_NOT_AVAILABLE':
      return 'Programın güncel durumu alınamadı.';
    case 'SNAPSHOT_CHANGED':
    case 'BASELINE_CHANGED':
      return 'Program, öneri oluşturulduktan sonra değişti. Seçeneği yeniden hesaplayın.';
    case 'NO_CHANGED_PLACEMENTS':
      return 'Öneride uygulanacak bir ders değişikliği yok.';
    case 'BUNDLE_LIMIT_EXCEEDED':
      return 'Öneri tek işlemde güvenle uygulanabilecek değişiklik sınırını aşıyor.';
    default:
      return 'Öneri şu anda uygulanamıyor.';
  }
}

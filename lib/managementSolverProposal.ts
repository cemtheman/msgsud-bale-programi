import type {
  ManagementBundleCandidateInput,
} from '@/lib/managementCommands';
import type {
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import type {
  ManagementOptimizationResult,
} from '@/lib/managementSolverPrototype';
import type {
  ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';

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
    default:
      return 'Öneri şu anda uygulanamıyor.';
  }
}


export function buildManagementSolverProposalWorkspaceCommands(
  plan: ManagementSolverProposalApplyPlan,
): ManagementWorkspaceCommandV1[] {
  if (!plan.canApply) return [];

  return plan.items.map((item) => ({
    type: 'SET_PLACEMENT' as const,
    placement: {
      cardId: item.cardId,
      dayOfWeek: item.dayOfWeek,
      startPeriod: item.startPeriod,
      teacherId: item.teacherId,
      roomId: item.roomId,
    },
  }));
}

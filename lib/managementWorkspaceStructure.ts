import type {
  ManagementRequirementStructureAmbiguity,
  ManagementRequirementStructureCardImpact,
  ManagementRequirementStructureCreatedBlock,
  ManagementRequirementStructurePreview,
  ManagementRequirementStructurePreviewInput,
} from '@/lib/managementCoursePlan';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import type {
  ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import {
  cloneManagementWorkspaceCardV1,
  cloneManagementWorkspacePlacementV1,
  cloneManagementWorkspaceRequirementStructureV1,
  getManagementWorkspaceRequirementStructureBundleV1,
  type ManagementWorkspaceCardStateV1,
  type ManagementWorkspaceRequirementStructureBundleV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function sameNumbers(left: number[], right: number[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameMatrix(left: number[][], right: number[][]) {
  return left.length === right.length
    && left.every((partition, index) =>
      sameNumbers(partition, right[index] ?? []),
    );
}

function validateActiveStructureInput(
  input: ManagementRequirementStructurePreviewInput,
) {
  if (input.termStatus !== 'ACTIVE') {
    throw new Error(
      'Dersin aktif/pasif dönem durumu bu çalışma alanı fazında değiştirilemez. Bu işlem ayrı lifecycle sınırında ele alınacak.',
    );
  }

  if (!Number.isInteger(input.weeklyLoad) || input.weeklyLoad <= 0) {
    throw new Error('Aktif dersin haftalık yükü pozitif tam sayı olmalı.');
  }

  if (input.preferredPartition.length === 0) {
    throw new Error('Aktif ders için tercih edilen blok dağılımı gerekli.');
  }

  const validatePartition = (partition: number[]) => {
    if (
      partition.length === 0
      || partition.some((duration) =>
        !Number.isInteger(duration) || duration <= 0 || duration > 12
      )
    ) {
      throw new Error('Blok süreleri 1–12 arasında pozitif tam sayı olmalı.');
    }
    if (partition.reduce((sum, duration) => sum + duration, 0)
        !== input.weeklyLoad) {
      throw new Error('Her blok dağılımının toplamı haftalık yüke eşit olmalı.');
    }
  };

  validatePartition(input.preferredPartition);
  input.allowedPartitions.forEach(validatePartition);

  if (
    input.allowedPartitions.length > 0
    && !input.allowedPartitions.some((partition) =>
      sameNumbers(partition, input.preferredPartition),
    )
  ) {
    throw new Error(
      'Tercih edilen blok dağılımı izin verilen dağılımlar içinde bulunmalı.',
    );
  }
}

function structureToken(
  snapshot: ManagementWorkspaceSnapshotV1,
  bundle: ManagementWorkspaceRequirementStructureBundleV1,
  input: ManagementRequirementStructurePreviewInput,
) {
  return JSON.stringify({
    engine: 'LOCAL_STRUCTURE_V1',
    revisionId: snapshot.identity.revisionId,
    snapshotHash: snapshot.identity.snapshotHash,
    requirementId: input.requirementId,
    current: bundle.structure,
    cards: bundle.cards.map((card) => ({
      id: card.id,
      blockIndex: card.blockIndex,
      durationPeriods: card.durationPeriods,
      locked: card.locked,
    })),
    placements: bundle.placements.map((placement) => ({
      cardId: placement.cardId,
      dayOfWeek: placement.dayOfWeek,
      startPeriod: placement.startPeriod,
      teacherId: placement.teacherId,
      roomId: placement.roomId,
    })),
    proposed: {
      weeklyLoad: input.weeklyLoad,
      preferredPartition: input.preferredPartition,
      allowedPartitions: input.allowedPartitions,
      termStatus: input.termStatus,
    },
  });
}

function durationRankedCards(
  cards: ManagementWorkspaceCardStateV1[],
) {
  const byDuration = new Map<number, ManagementWorkspaceCardStateV1[]>();
  cards
    .slice()
    .sort((a, b) => a.blockIndex - b.blockIndex || a.id.localeCompare(b.id))
    .forEach((card) => {
      const values = byDuration.get(card.durationPeriods) ?? [];
      values.push(card);
      byDuration.set(card.durationPeriods, values);
    });
  return byDuration;
}

function proposedByDuration(partition: number[]) {
  const byDuration = new Map<
    number,
    Array<{ proposedBlockIndex: number; durationPeriods: number }>
  >();

  partition.forEach((durationPeriods, index) => {
    const values = byDuration.get(durationPeriods) ?? [];
    values.push({
      proposedBlockIndex: index + 1,
      durationPeriods,
    });
    byDuration.set(durationPeriods, values);
  });

  return byDuration;
}

export function previewManagementWorkspaceRequirementStructureV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  input: ManagementRequirementStructurePreviewInput,
): ManagementRequirementStructurePreview {
  validateActiveStructureInput(input);

  const requirement = snapshot.requirements.find(
    (item) => item.id === input.requirementId,
  );
  if (!requirement) {
    throw new Error(
      'Bu ders ACTIVE workspace snapshot içinde değil. Aktif/pasif lifecycle geçişi ayrı ele alınmalıdır.',
    );
  }

  const bundle = getManagementWorkspaceRequirementStructureBundleV1(
    workingCopy,
    input.requirementId,
  );
  if (!bundle) {
    throw new Error('Yerel ders yapısı bulunamadı.');
  }

  const currentByDuration = durationRankedCards(bundle.cards);
  const proposed = proposedByDuration(input.preferredPartition);

  const preservedCards: ManagementRequirementStructureCardImpact[] = [];
  const removedCards: ManagementRequirementStructureCardImpact[] = [];
  const createdBlocks: ManagementRequirementStructureCreatedBlock[] = [];
  const ambiguities: ManagementRequirementStructureAmbiguity[] = [];

  const durations = Array.from(new Set([
    ...currentByDuration.keys(),
    ...proposed.keys(),
  ])).sort((a, b) => a - b);

  durations.forEach((duration) => {
    const currentCards = currentByDuration.get(duration) ?? [];
    const proposedBlocks = proposed.get(duration) ?? [];
    const matchedCount = Math.min(
      currentCards.length,
      proposedBlocks.length,
    );

    for (let index = 0; index < matchedCount; index += 1) {
      const card = currentCards[index];
      const target = proposedBlocks[index];
      const placement = workingCopy.placementsByCardId[card.id];
      preservedCards.push({
        cardId: card.id,
        currentBlockIndex: card.blockIndex,
        proposedBlockIndex: target.proposedBlockIndex,
        durationPeriods: card.durationPeriods,
        placed: Boolean(
          placement
          && placement.dayOfWeek !== null
          && placement.startPeriod !== null
        ),
        dayOfWeek: placement?.dayOfWeek ?? null,
        startPeriod: placement?.startPeriod ?? null,
        teacherId: placement?.teacherId ?? null,
        roomId: placement?.roomId ?? null,
      });
    }

    currentCards.slice(matchedCount).forEach((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      removedCards.push({
        cardId: card.id,
        currentBlockIndex: card.blockIndex,
        durationPeriods: card.durationPeriods,
        placed: Boolean(
          placement
          && placement.dayOfWeek !== null
          && placement.startPeriod !== null
        ),
        dayOfWeek: placement?.dayOfWeek ?? null,
        startPeriod: placement?.startPeriod ?? null,
        teacherId: placement?.teacherId ?? null,
        roomId: placement?.roomId ?? null,
      });
    });

    proposedBlocks.slice(matchedCount).forEach((block) => {
      createdBlocks.push({ ...block });
    });

    const placedCount = currentCards.filter((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      return Boolean(
        placement
        && placement.dayOfWeek !== null
        && placement.startPeriod !== null
      );
    }).length;

    if (
      proposedBlocks.length > 0
      && currentCards.length > proposedBlocks.length
      && placedCount > 0
    ) {
      ambiguities.push({
        code: 'PLACED_EQUIVALENT_CARD_CHOICE',
        durationPeriods: duration,
        currentCount: currentCards.length,
        proposedCount: proposedBlocks.length,
        placedCount,
        message:
          'Aynı süreli birden fazla bloktan hangisinin korunacağı yerleşmiş bir bloğu etkiliyor.',
      });
    }
  });

  preservedCards.sort(
    (a, b) =>
      (a.proposedBlockIndex ?? a.currentBlockIndex)
      - (b.proposedBlockIndex ?? b.currentBlockIndex),
  );
  removedCards.sort((a, b) => a.currentBlockIndex - b.currentBlockIndex);
  createdBlocks.sort((a, b) => a.proposedBlockIndex - b.proposedBlockIndex);

  const hasChanges = (
    bundle.structure.weeklyLoad !== input.weeklyLoad
    || !sameNumbers(
      bundle.structure.preferredPartition,
      input.preferredPartition,
    )
    || !sameMatrix(
      bundle.structure.allowedPartitions,
      input.allowedPartitions,
    )
  );

  const removedPlacedCount = removedCards.filter((card) => card.placed).length;
  const removedLockedCount = removedCards.filter(
    (impact) => workingCopy.cardsById[impact.cardId]?.locked,
  ).length;

  const blockReasons = [
    ...(!hasChanges ? ['NO_CHANGES'] : []),
    ...(removedPlacedCount > 0
      ? ['PLACED_CARD_REMOVAL_REQUIRED']
      : []),
    ...(ambiguities.length > 0
      ? ['HUMAN_CARD_CHOICE_REQUIRED']
      : []),
    ...(removedLockedCount > 0
      ? ['LOCKED_CARD_REMOVAL_REQUIRED']
      : []),
  ];

  return {
    requirementId: input.requirementId,
    revisionId: snapshot.identity.revisionId,
    structureToken: structureToken(snapshot, bundle, input),
    hasChanges,
    canApply:
      hasChanges
      && removedPlacedCount === 0
      && ambiguities.length === 0
      && removedLockedCount === 0,
    blockReasons,
    current: {
      weeklyLoad: bundle.structure.weeklyLoad,
      preferredPartition: [...bundle.structure.preferredPartition],
      allowedPartitions: bundle.structure.allowedPartitions.map(
        (partition) => [...partition],
      ),
      termStatus: 'ACTIVE',
      cardCount: bundle.cards.length,
      placedBlockCount: bundle.placements.filter(
        (placement) =>
          placement.dayOfWeek !== null
          && placement.startPeriod !== null,
      ).length,
    },
    proposed: {
      weeklyLoad: input.weeklyLoad,
      preferredPartition: [...input.preferredPartition],
      allowedPartitions: input.allowedPartitions.map(
        (partition) => [...partition],
      ),
      termStatus: 'ACTIVE',
      cardCount: input.preferredPartition.length,
    },
    preservedCards,
    removedCards,
    createdBlocks,
    ambiguities,
    candidateRebuildCardCount: input.preferredPartition.length,
    previewOnly: true,
  };
}

export function prepareManagementWorkspaceRequirementStructureV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  input: ManagementRequirementStructurePreviewInput,
  expectedStructureToken: string,
): {
  preview: ManagementRequirementStructurePreview;
  command: ManagementWorkspaceCommandV1;
} {
  const preview = previewManagementWorkspaceRequirementStructureV1(
    snapshot,
    workingCopy,
    input,
  );

  if (preview.structureToken !== expectedStructureToken) {
    throw new Error(
      'Ders yapısı önizlemeden sonra değişti. Etkiyi yeniden hesaplayın.',
    );
  }
  if (!preview.canApply) {
    throw new Error(
      preview.blockReasons[0]
        ?? 'Ders yapısı bu haliyle yerel çalışma alanına uygulanamıyor.',
    );
  }

  const current = getManagementWorkspaceRequirementStructureBundleV1(
    workingCopy,
    input.requirementId,
  );
  if (!current) throw new Error('Yerel ders yapısı bulunamadı.');

  const preservedById = new Map(
    preview.preservedCards.map((impact) => [impact.cardId, impact]),
  );
  const cards = current.cards
    .filter((card) => preservedById.has(card.id))
    .map((card) => {
      const impact = preservedById.get(card.id)!;
      return cloneManagementWorkspaceCardV1({
        ...card,
        blockIndex: impact.proposedBlockIndex ?? card.blockIndex,
      });
    });

  const placements = current.placements
    .filter((placement) => preservedById.has(placement.cardId))
    .map(cloneManagementWorkspacePlacementV1);

  preview.createdBlocks.forEach((created) => {
    const cardId = globalThis.crypto.randomUUID();
    cards.push({
      id: cardId,
      requirementId: input.requirementId,
      blockIndex: created.proposedBlockIndex,
      durationPeriods: created.durationPeriods,
      locked: false,
      baselineExists: false,
    });
    placements.push({
      cardId,
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });
  });

  cards.sort(
    (a, b) => a.blockIndex - b.blockIndex || a.id.localeCompare(b.id),
  );

  const bundle: ManagementWorkspaceRequirementStructureBundleV1 = {
    structure: cloneManagementWorkspaceRequirementStructureV1({
      requirementId: input.requirementId,
      weeklyLoad: input.weeklyLoad,
      preferredPartition: [...input.preferredPartition],
      allowedPartitions: input.allowedPartitions.map(
        (partition) => [...partition],
      ),
      termStatus: 'ACTIVE',
    }),
    cards,
    placements,
  };

  return {
    preview,
    command: {
      type: 'SET_REQUIREMENT_STRUCTURE',
      requirementId: input.requirementId,
      bundle,
    },
  };
}

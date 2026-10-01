'use client';

import { useState } from 'react';
import { ManagementPublicationGate } from '@/components/management/ManagementPublicationGate';
import { ManagementPublicationPreview } from '@/components/management/ManagementPublicationPreview';
import type {
  ManagementBoardCard,
  ManagementStage,
} from '@/lib/managementBoard';
import {
  translateManagementPlacementResourceBlockReason,
  type ManagementPlacementResourceApplyResult,
  type ManagementPlacementResourcePreview,
  type ManagementPlacementResourceType,
} from '@/lib/managementCommands';
import type { ManagementCoursePlanOption } from '@/lib/managementCoursePlan';
import {
  buildManagementOperationalQueue,
  operationalQueueCardIds,
  type ManagementOperationalQueueKind,
} from '@/lib/managementOperations';
import type {
  ManagementPublicationBlockReason,
  ManagementPublicationGateData,
  ManagementPublicationWarningReason,
} from '@/lib/managementPublicationGate';
import type { ManagementPublicationPreviewData } from '@/lib/managementPublicationPreview';
import type {
  ManagementHealthIssue,
  ManagementHealthSnapshot,
  ManagementIssueOrigin,
  ManagementReadinessStatus,
} from '@/lib/managementHealth';

function statusMeta(status: ManagementReadinessStatus) {
  if (status === 'YAYINA_HAZIR') {
    return {
      label: 'Yayına hazır',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      description: 'Programda yayın öncesinde tamamlanması gereken bir eksik görünmüyor.',
    };
  }

  if (status === 'UYARILARLA_HAZIR') {
    return {
      label: 'Hazır, ancak kontrol edilmesi gerekenler var',
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      description: 'Program yayımlanabilir durumda; yine de aşağıdaki bilgi eksiklerini gözden geçirmeniz iyi olur.',
    };
  }

  return {
    label: 'Henüz yayına hazır değil',
    className: 'border-rose-200 bg-rose-50 text-rose-900',
    description: 'Program tamamlanmadan önce aşağıdaki eksiklerin giderilmesi gerekiyor.',
  };
}

const DAY_SHORT: Record<number, string> = {
  1: 'Pzt',
  2: 'Sal',
  3: 'Çar',
  4: 'Per',
  5: 'Cuma',
};

function originLabel(origin?: ManagementIssueOrigin) {
  if (origin === 'TOUCHED_INHERITED') return 'Bu taslakta işlem gördü';
  if (origin === 'INTRODUCED') return 'Bu taslakta oluştu';
  if (origin === 'INHERITED') return 'Mevcut veriden geliyor';
  return null;
}

function IssueCard({
  issue,
  onAction,
}: {
  issue: ManagementHealthIssue;
  onAction?: (issue: ManagementHealthIssue) => void;
}) {
  const isBlocker = issue.severity === 'BLOCKER';
  const origin = originLabel(issue.origin);

  return (
    <div
      className={
        isBlocker
          ? 'rounded-2xl border border-rose-200 bg-rose-50/70 p-4'
          : 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                isBlocker
                  ? 'rounded-full bg-rose-100 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-rose-700'
                  : 'rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700'
              }
            >
              {isBlocker ? 'Tamamlanmalı' : 'Dikkat'}
            </span>

            {origin && (
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                {origin}
              </span>
            )}
          </div>

          <h3 className="mt-2 text-sm font-bold text-slate-900">
            {issue.title}
          </h3>
          <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">
            {issue.detail}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={
              isBlocker
                ? 'rounded-2xl bg-white px-3 py-2 text-lg font-black text-rose-700'
                : 'rounded-2xl bg-white px-3 py-2 text-lg font-black text-amber-700'
            }
          >
            {issue.count}
          </span>
          {issue.action && issue.actionLabel && onAction && (
            <button
              type="button"
              onClick={() => onAction(issue)}
              className={
                isBlocker
                  ? 'rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black text-rose-700 transition hover:bg-rose-100'
                  : 'rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-black text-amber-800 transition hover:bg-amber-100'
              }
            >
              {issue.actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ManagementProgramStatus({
  snapshot,
  versionNumber,
  stage,
  onStageChange,
  publicationPreview,
  publicationGate,
  cards,
  teacherOptions,
  roomOptions,
  canEdit,
  commandBusy,
  onIssueAction,
  onOperationalQueueAction,
  onBulkPreview,
  onBulkApply,
}: {
  snapshot: ManagementHealthSnapshot | null;
  versionNumber: number | null;
  stage: ManagementStage;
  onStageChange: (stage: ManagementStage) => void;
  publicationPreview: ManagementPublicationPreviewData | null;
  publicationGate: ManagementPublicationGateData | null;
  cards: ManagementBoardCard[];
  teacherOptions: ManagementCoursePlanOption[];
  roomOptions: ManagementCoursePlanOption[];
  canEdit: boolean;
  commandBusy: boolean;
  onIssueAction?: (issue: ManagementHealthIssue) => void;
  onOperationalQueueAction?: (
    kind: ManagementOperationalQueueKind,
    cardId: string,
  ) => void;
  onBulkPreview?: (
    cardIds: string[],
    resourceType: ManagementPlacementResourceType,
    resourceId: string,
  ) => Promise<ManagementPlacementResourcePreview>;
  onBulkApply?: (
    cardIds: string[],
    resourceType: ManagementPlacementResourceType,
    resourceId: string,
    expectedStateToken: string,
  ) => Promise<ManagementPlacementResourceApplyResult>;
}) {
  const [bulkKind, setBulkKind] = useState<ManagementOperationalQueueKind | null>(null);
  const [bulkSelectedCardIds, setBulkSelectedCardIds] = useState<string[]>([]);
  const [bulkResourceId, setBulkResourceId] = useState('');
  const [bulkPreview, setBulkPreview] =
    useState<ManagementPlacementResourcePreview | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const operationalQueue = buildManagementOperationalQueue(cards, stage);
  const bulkQueueItems = bulkKind
    ? operationalQueue.items.filter((item) => item.kind === bulkKind)
    : [];
  const bulkResourceOptions = bulkKind === 'TEACHER'
    ? teacherOptions
    : roomOptions;
  const selectedBulkCount = bulkSelectedCardIds.length;

  if (!snapshot) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-400 shadow-sm">
          Program durumu hazırlanıyor…
        </div>
      </section>
    );
  }

  const meta = statusMeta(snapshot.status);
  const blockerCount = snapshot.blockers.reduce((sum, issue) => sum + issue.count, 0);
  const warningCount = snapshot.warnings.reduce((sum, issue) => sum + issue.count, 0);
  const resetBulkPreview = () => {
    setBulkPreview(null);
    setBulkError(null);
  };

  const openBulkOperation = (kind: ManagementOperationalQueueKind) => {
    const cardIds = operationalQueueCardIds(operationalQueue, kind);

    setBulkKind(kind);
    setBulkSelectedCardIds(cardIds);
    setBulkResourceId('');
    setBulkPreview(null);
    setBulkError(null);
  };

  const closeBulkOperation = () => {
    if (bulkLoading || bulkApplying) return;
    setBulkKind(null);
    setBulkSelectedCardIds([]);
    setBulkResourceId('');
    setBulkPreview(null);
    setBulkError(null);
  };

  const runBulkPreview = async () => {
    if (
      !bulkKind
      || bulkSelectedCardIds.length === 0
      || !bulkResourceId
      || !onBulkPreview
      || bulkLoading
      || bulkApplying
    ) return;

    setBulkLoading(true);
    setBulkError(null);
    try {
      setBulkPreview(await onBulkPreview(
        bulkSelectedCardIds,
        bulkKind,
        bulkResourceId,
      ));
    } catch (reason: unknown) {
      setBulkPreview(null);
      setBulkError(
        reason instanceof Error
          ? reason.message
          : 'Toplu atama etkisi hesaplanamadı.',
      );
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulkApply = async () => {
    if (
      !bulkKind
      || !bulkPreview
      || !bulkPreview.canApply
      || !bulkResourceId
      || !onBulkApply
      || bulkApplying
      || bulkLoading
    ) return;

    setBulkApplying(true);
    setBulkError(null);
    try {
      await onBulkApply(
        bulkSelectedCardIds,
        bulkKind,
        bulkResourceId,
        bulkPreview.stateToken,
      );
      setBulkKind(null);
      setBulkSelectedCardIds([]);
      setBulkResourceId('');
      setBulkPreview(null);
    } catch (reason: unknown) {
      setBulkError(
        reason instanceof Error
          ? reason.message
          : 'Toplu atama uygulanamadı.',
      );
    } finally {
      setBulkApplying(false);
    }
  };
  const nonOperationalBlockers = snapshot.blockers.filter(
    (issue) => (
      issue.id !== 'placed-teacher-missing'
      && issue.id !== 'placed-room-missing'
    ),
  );

  const healthBlockerIds = new Set(snapshot.blockers.map((issue) => issue.id));
  const healthWarningIds = new Set(snapshot.warnings.map((issue) => issue.id));

  const suppressedPublicationBlockReasons: ManagementPublicationBlockReason[] = [
    ...(healthBlockerIds.has('unplaced-untouched')
      || healthBlockerIds.has('unplaced-touched')
      ? ['UNPLACED_CARDS' as const]
      : []),
    ...(healthBlockerIds.has('contradiction-untouched')
      || healthBlockerIds.has('contradiction-touched')
      ? ['CONTRADICTIONS' as const]
      : []),
    ...(healthBlockerIds.has('unresolved-touched')
      ? ['UNRESOLVED_TOUCHED' as const]
      : []),
    ...(healthBlockerIds.has('placed-teacher-missing')
      ? ['MISSING_REQUIRED_TEACHER_PLACEMENT' as const]
      : []),
    ...(healthBlockerIds.has('placed-room-missing')
      ? ['MISSING_REQUIRED_ROOM_PLACEMENT' as const]
      : []),
  ];

  const suppressedPublicationWarningReasons: ManagementPublicationWarningReason[] = [
    ...(healthWarningIds.has('unresolved-inherited')
      ? ['UNRESOLVED_INHERITED' as const]
      : []),
  ];

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-[1220px] space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              Program durumu
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} için genel durum ve eksikler
            </p>
          </div>

          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {([
              { id: 'ORTAOKUL', label: 'Ortaokul' },
              { id: 'LISE', label: 'Lise' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onStageChange(item.id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  stage === item.id
                    ? 'bg-[#A63D48] text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className={['rounded-[24px] border p-5 shadow-sm', meta.className].join(' ')}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
                Programın durumu
              </p>
              <h2 className="mt-1 text-2xl font-black">
                {meta.label}
              </h2>
              <p className="mt-2 max-w-[650px] text-sm font-medium leading-6 opacity-80">
                {meta.description}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide opacity-60">
                Çalışılan taslak
              </p>
              <p className="mt-1 text-sm font-black">
                v{versionNumber ?? '–'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
              Programlanan dersler
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {snapshot.placedCount} / {snapshot.totalCards}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              ders kartı yerleştirildi
            </p>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wide text-rose-500">
              Tamamlanması gereken
            </p>
            <p className="mt-2 text-2xl font-black text-rose-700">
              {blockerCount}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              kayıt
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">
              Bilgi eksiği
            </p>
            <p className="mt-2 text-2xl font-black text-amber-700">
              {warningCount}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              kontrol edilmesi önerilen kayıt
            </p>
          </div>
        </div>

        {operationalQueue.totalCount > 0 && (
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Operasyon kuyruğu
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-900">
                  Kaynağı tamamlanacak dersler
                </h3>
                <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">
                  Gün ve saat sırasıyla ilerleyin. Kaynak tamamlandığında kayıt bu listeden otomatik çıkar.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {operationalQueue.teacherCount > 0 && (
                  <>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700">
                      Öğretmensiz · {operationalQueue.teacherCount}
                    </span>
                    {operationalQueue.teacherCount > 1 && (
                      <button
                        type="button"
                        onClick={() => openBulkOperation('TEACHER')}
                        disabled={!canEdit || commandBusy}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
                      >
                        Öğretmenleri toplu ata
                      </button>
                    )}
                  </>
                )}
                {operationalQueue.roomCount > 0 && (
                  <>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-800">
                      Salonsuz · {operationalQueue.roomCount}
                    </span>
                    {operationalQueue.roomCount > 1 && (
                      <button
                        type="button"
                        onClick={() => openBulkOperation('ROOM')}
                        disabled={!canEdit || commandBusy}
                        className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-black text-amber-800 transition hover:bg-amber-50 disabled:opacity-40"
                      >
                        Salonları toplu ata
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="management-scrollbar mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {operationalQueue.items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[34px_minmax(0,1fr)_150px_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[10px] font-black text-slate-500 shadow-sm">
                    {index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={
                          item.kind === 'TEACHER'
                            ? 'shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-700'
                            : 'shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800'
                        }
                      >
                        {item.kind === 'TEACHER' ? 'Öğretmen' : 'Salon'}
                      </span>
                      <p className="truncate text-[11px] font-black text-slate-900">
                        {item.subjectName}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">
                      {item.groupName}
                      {item.classCodes.length > 0
                        ? ` · ${item.classCodes.join(' + ')}`
                        : ''}
                    </p>
                  </div>

                  <div className="text-[10px] font-semibold text-slate-500">
                    <p className="font-black text-slate-700">
                      {DAY_SHORT[item.dayOfWeek] ?? `Gün ${item.dayOfWeek}`} · {item.startPeriod}. ders
                    </p>
                    <p className="mt-0.5 truncate">
                      {item.kind === 'TEACHER'
                        ? `Salon: ${item.fixedResourceLabel ?? 'belirsiz'}`
                        : `Öğretmen: ${item.fixedResourceLabel ?? 'belirsiz'}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOperationalQueueAction?.(
                      item.kind,
                      item.cardId,
                    )}
                    disabled={!onOperationalQueueAction}
                    className={
                      item.kind === 'TEACHER'
                        ? 'rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-40'
                        : 'rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-40'
                    }
                  >
                    Aç ve ata
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {bulkKind && (
          <div className="fixed inset-0 z-[126] flex items-center justify-center bg-slate-950/35 p-4">
            <div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.28)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Toplu operasyon
                  </p>
                  <h3 className="mt-1 text-lg font-black text-slate-950">
                    {bulkKind === 'TEACHER'
                      ? 'Öğretmensiz derslere öğretmen ata'
                      : 'Salonsuz derslere salon ata'}
                  </h3>
                  <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
                    Seçilen kayıtların mevcut gün ve saatleri korunur. Önce tek bir etki önizlemesi hesaplanır.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBulkOperation}
                  disabled={bulkLoading || bulkApplying}
                  className="rounded-xl px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30"
                >
                  ×
                </button>
              </div>

              <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Dersler · {selectedBulkCount} / {bulkQueueItems.length}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkSelectedCardIds(
                            bulkSelectedCardIds.length === bulkQueueItems.length
                              ? []
                              : bulkQueueItems.map((item) => item.cardId),
                          );
                          resetBulkPreview();
                        }}
                        className="text-[9px] font-black text-blue-700 hover:underline"
                      >
                        {bulkSelectedCardIds.length === bulkQueueItems.length
                          ? 'Seçimi kaldır'
                          : 'Tümünü seç'}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {bulkQueueItems.map((item) => {
                        const checked = bulkSelectedCardIds.includes(item.cardId);
                        return (
                          <label
                            key={item.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                              checked
                                ? 'border-blue-200 bg-blue-50/70'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setBulkSelectedCardIds((current) => (
                                  checked
                                    ? current.filter((id) => id !== item.cardId)
                                    : [...current, item.cardId]
                                ));
                                resetBulkPreview();
                              }}
                              className="h-4 w-4 accent-blue-700"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] font-black text-slate-900">
                                {item.subjectName} · {item.groupName}
                              </p>
                              <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500">
                                {DAY_SHORT[item.dayOfWeek] ?? `Gün ${item.dayOfWeek}`} · {item.startPeriod}. ders
                                {' · '}
                                {bulkKind === 'TEACHER'
                                  ? `Salon: ${item.fixedResourceLabel ?? 'belirsiz'}`
                                  : `Öğretmen: ${item.fixedResourceLabel ?? 'belirsiz'}`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {bulkKind === 'TEACHER' ? 'Atanacak öğretmen' : 'Atanacak salon'}
                      </label>
                      <select
                        value={bulkResourceId}
                        onChange={(event) => {
                          setBulkResourceId(event.target.value);
                          resetBulkPreview();
                        }}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-slate-400"
                      >
                        <option value="">Seçin…</option>
                        {bulkResourceOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => void runBulkPreview()}
                      disabled={
                        !canEdit
                        || commandBusy
                        || bulkLoading
                        || bulkApplying
                        || selectedBulkCount === 0
                        || !bulkResourceId
                        || !onBulkPreview
                      }
                      className="w-full rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:opacity-35"
                    >
                      {bulkLoading ? 'Hesaplanıyor…' : 'Etkiyi hesapla'}
                    </button>

                    {bulkError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-bold leading-5 text-rose-700">
                        {bulkError}
                      </div>
                    )}

                    {bulkPreview && (
                      <div className={`rounded-2xl border p-3 ${
                        bulkPreview.canApply
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-rose-200 bg-rose-50'
                      }`}>
                        <p className={`text-[10px] font-black ${
                          bulkPreview.canApply ? 'text-emerald-800' : 'text-rose-800'
                        }`}>
                          {bulkPreview.canApply
                            ? 'Uygulanabilir'
                            : 'Bu seçim güvenli uygulanamıyor'}
                        </p>
                        <div className="mt-2 space-y-1 text-[9px] font-semibold leading-4 text-slate-600">
                          <p>Seçilen: {selectedBulkCount} kayıt</p>
                          <p>Etkilenen: {bulkPreview.affectedCardCount} kart</p>
                          <p>Ders tanımı: {bulkPreview.affectedRequirementCount}</p>
                          {bulkPreview.requirementWideExpansionCount > 0 && (
                            <p className="font-black text-amber-700">
                              Süreklilik nedeniyle {bulkPreview.requirementWideExpansionCount} ek kart kapsama giriyor.
                            </p>
                          )}
                          {bulkPreview.outsidePlanningPoolCount > 0 && (
                            <p className="font-black text-amber-700">
                              {bulkPreview.outsidePlanningPoolCount} seçim mevcut Ders Planı havuzunun dışında.
                            </p>
                          )}
                          {bulkPreview.poolExpansionCount > 0 && (
                            <p className="font-black text-amber-700">
                              Ders Planı havuzu {bulkPreview.poolExpansionCount} kaynak bağlantısıyla genişleyecek.
                            </p>
                          )}
                        </div>

                        {bulkPreview.blockReasons.length > 0 && (
                          <div className="mt-2 space-y-1 rounded-xl bg-white/70 px-2.5 py-2 text-[9px] font-bold text-rose-700">
                            {bulkPreview.blockReasons.map((reason) => (
                              <p key={reason}>• {translateManagementPlacementResourceBlockReason(reason)}</p>
                            ))}
                          </div>
                        )}

                        {bulkPreview.conflicts.length > 0 && (
                          <div className="mt-2 space-y-1 rounded-xl bg-white/70 px-2.5 py-2 text-[9px] font-semibold text-rose-700">
                            {bulkPreview.conflicts.slice(0, 5).map((conflict) => (
                              <p key={`${conflict.cardId}:${conflict.blockingCardId}:${conflict.conflictType}`}>
                                • {conflict.subjectName} · {DAY_SHORT[conflict.dayOfWeek] ?? conflict.dayOfWeek}. gün · {conflict.startPeriod}. ders
                              </p>
                            ))}
                            {bulkPreview.conflicts.length > 5 && (
                              <p>+ {bulkPreview.conflicts.length - 5} çakışma daha</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <p className="text-[9px] font-semibold text-slate-400">
                  Önizlemeden sonra seçim değişirse etki yeniden hesaplanır.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeBulkOperation}
                    disabled={bulkLoading || bulkApplying}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => void runBulkApply()}
                    disabled={
                      !bulkPreview
                      || !bulkPreview.canApply
                      || bulkLoading
                      || bulkApplying
                      || commandBusy
                      || !onBulkApply
                    }
                    className="rounded-xl bg-blue-700 px-4 py-2 text-[10px] font-black text-white hover:bg-blue-600 disabled:opacity-35"
                  >
                    {bulkApplying ? 'Uygulanıyor…' : 'Toplu uygula'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ManagementPublicationGate
          data={publicationGate}
          suppressedBlockReasons={suppressedPublicationBlockReasons}
          suppressedWarningReasons={suppressedPublicationWarningReasons}
        />

        <ManagementPublicationPreview
          data={publicationPreview}
          stage={stage}
          health={snapshot}
        />

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-4">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Önce tamamlanması gerekenler
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Programı tamamlamak için
                  </h3>
                </div>
                {nonOperationalBlockers.length > 0 && (
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700">
                    {nonOperationalBlockers.length} başlık
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {nonOperationalBlockers.length > 0 ? (
                  nonOperationalBlockers.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} onAction={onIssueAction} />
                  ))
                ) : (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    {operationalQueue.totalCount > 0
                      ? 'Diğer tamamlanması gereken kayıtlar görünmüyor; kaynak eksikleri operasyon kuyruğunda.'
                      : 'Tamamlanması gereken bir durum görünmüyor.'}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Kontrol edilmesi önerilenler
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    Eksik veya doğrulanmamış bilgiler
                  </h3>
                </div>
                {snapshot.warnings.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                    {snapshot.warnings.length} başlık
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {snapshot.warnings.length > 0 ? (
                  snapshot.warnings.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} onAction={onIssueAction} />
                  ))
                ) : (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    Kontrol edilmesi gereken ek bir bilgi görünmüyor.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside>
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                Bu sayfa neyi kontrol ediyor?
              </p>
              <div className="mt-3 space-y-2 text-[11px] font-medium leading-5 text-slate-600">
                <p>✓ Tüm derslere programda yer verildi mi?</p>
                <p>✓ Her ders için geçerli bir yerleşim seçeneği var mı?</p>
                <p>✓ Düzenlenen derslerde eksik öğretmen veya salon bilgisi kaldı mı?</p>
                <p>✓ Mevcut veriden gelen eksikler ayrı bir dikkat notu olarak gösterildi mi?</p>
              </div>

              <div className="my-4 border-t border-slate-100" />

              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                Taslak ve yayın
              </p>
              <p className="mt-2 text-[11px] font-medium leading-5 text-slate-600">
                Bu ekran yalnız taslağı kontrol eder. Öğrenci ve öğretmen programları
                burada değişmez; gerçek yayınlama ayrıca ve kontrollü biçimde yapılır.
              </p>

              <div className="my-4 border-t border-slate-100" />

              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                Bilgi etiketleri
              </p>
              <div className="mt-3 space-y-2 text-[11px] font-medium leading-5 text-slate-500">
                <p><strong className="text-slate-700">Mevcut veriden geliyor:</strong> taslak başlamadan önce de eksikti.</p>
                <p><strong className="text-slate-700">Bu taslakta işlem gördü:</strong> mevcut eksikliğe bu taslakta müdahale edildi.</p>
                <p><strong className="text-slate-700">Bu taslakta oluştu:</strong> taslak sırasında oluşan yeni eksikliği gösterir.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

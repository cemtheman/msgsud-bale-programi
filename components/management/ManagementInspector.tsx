'use client';

import { useEffect, useMemo, useState } from 'react';
import { ManagementRoomStrategyEditor } from '@/components/management/ManagementRoomStrategyEditor';
import {
  managementCardStatus,
  translateCandidateReason,
  type ManagementBoardCard,
  type ManagementCandidateAssessment,
  type ManagementCandidateDetail,
} from '@/lib/managementBoard';
import type {
  ManagementPlacementResourcePreview,
  ManagementPlacementResourceType,
} from '@/lib/managementCommands';
import type {
  ManagementCoursePlanOption,
  ManagementCoursePlanRow,
  ManagementPlanStage,
  ManagementRoomStrategy,
} from '@/lib/managementCoursePlan';

const DAY_LABELS: Record<number, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
};

function assignmentModeLabel(value: string) {
  if (value === 'FIXED') return 'Sabit';
  if (value === 'ELIGIBLE_POOL') return 'Seçilebilir havuz';
  if (value === 'CAPABILITY') return 'Özelliğe göre';
  return 'Belirsiz';
}

function courseCharacterLabel(value: string) {
  if (value === 'TECHNIQUE') return 'Teknik';
  if (value === 'REPERTOIRE') return 'Repertuvar';
  if (value === 'REHEARSAL') return 'Prova';
  if (value === 'ACADEMIC') return 'Akademik';
  return 'Diğer';
}

function deliveryModeLabel(value: string) {
  if (value === 'SHARED') return 'Ortak';
  if (value === 'PARALLEL') return 'Paralel';
  return 'Standart';
}

function statusBadge(card: ManagementBoardCard) {
  if (card.isContradiction) {
    return 'bg-rose-100 text-rose-800';
  }

  if (card.isForced) {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (card.unresolvedCount > 0) {
    return 'bg-amber-100 text-amber-800';
  }

  if (card.placement) {
    return 'bg-blue-100 text-blue-800';
  }

  return 'bg-slate-100 text-slate-700';
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 py-1.5 text-[11px]">
      <dt className="font-medium text-slate-400">{label}</dt>
      <dd className="min-w-0 font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

export function ManagementInspector({
  card,
  cardIds,
  candidateDetail,
  candidateLoading,
  candidateError,
  candidateFocus,
  teacherNamesById,
  roomNamesById,
  planRow,
  planStage,
  teacherOptions,
  roomOptions,
  roomCapabilityOptions,
  canEdit,
  commandBusy,
  commandNotice,
  onCandidateAction,
  onPreviewPlacementResource,
  onApplyPlacementResource,
  onUpdatePlanTeachers,
  onUpdatePlanRoomStrategy,
  onRemove,
  onClose,
}: {
  card: ManagementBoardCard | null;
  cardIds: string[];
  candidateDetail: ManagementCandidateDetail | null;
  candidateLoading: boolean;
  candidateError: string | null;
  candidateFocus: {
    dayOfWeek: number;
    startPeriod: number;
    candidates: ManagementCandidateAssessment[];
  } | null;
  teacherNamesById: Record<string, string>;
  roomNamesById: Record<string, string>;
  planRow: ManagementCoursePlanRow | null;
  planStage: ManagementPlanStage;
  teacherOptions: ManagementCoursePlanOption[];
  roomOptions: ManagementCoursePlanOption[];
  roomCapabilityOptions: string[];
  canEdit: boolean;
  commandBusy: boolean;
  commandNotice: { kind: 'success' | 'error' | 'info'; text: string } | null;
  onCandidateAction: (candidate: ManagementCandidateAssessment) => void;
  onPreviewPlacementResource: (
    cardIds: string[],
    resourceType: ManagementPlacementResourceType,
    resourceId: string,
  ) => Promise<ManagementPlacementResourcePreview>;
  onApplyPlacementResource: (
    cardIds: string[],
    resourceType: ManagementPlacementResourceType,
    resourceId: string,
    expectedStateToken: string,
  ) => Promise<void>;
  onUpdatePlanTeachers: (
    requirementId: string,
    teacherIds: string[],
  ) => Promise<void>;
  onUpdatePlanRoomStrategy: (
    requirementId: string,
    strategy: ManagementRoomStrategy,
    roomIds: string[],
    requiredCapability: string | null,
  ) => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const focusTeacherIds = useMemo(
    () => Array.from(new Set(
      (candidateFocus?.candidates ?? [])
        .map((candidate) => candidate.teacherId)
        .filter((value): value is string => Boolean(value)),
    )),
    [candidateFocus],
  );

  const [focusTeacherId, setFocusTeacherId] = useState<string | null>(null);
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [showGeneralCandidates, setShowGeneralCandidates] = useState(false);
  const [placementEditMode, setPlacementEditMode] = useState<'TEACHER' | 'ROOM' | null>(null);
  const [placementChoiceId, setPlacementChoiceId] = useState<string | null>(null);
  const [planTeacherOpen, setPlanTeacherOpen] = useState(false);
  const [planRoomOpen, setPlanRoomOpen] = useState(false);
  const [planTeacherIds, setPlanTeacherIds] = useState<string[]>([]);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const focusCandidatesForTeacher = useMemo(
    () => (
      focusTeacherId
        ? (candidateFocus?.candidates ?? []).filter(
          (candidate) => candidate.teacherId === focusTeacherId,
        )
        : []
    ),
    [candidateFocus, focusTeacherId],
  );

  const focusRoomIds = useMemo(
    () => Array.from(new Set(
      focusCandidatesForTeacher
        .map((candidate) => candidate.roomId)
        .filter((value): value is string => Boolean(value)),
    )),
    [focusCandidatesForTeacher],
  );

  const focusCandidate = useMemo(
    () => (
      focusTeacherId && focusRoomId
        ? focusCandidatesForTeacher.find(
          (candidate) => candidate.roomId === focusRoomId,
        ) ?? null
        : null
    ),
    [focusCandidatesForTeacher, focusRoomId, focusTeacherId],
  );


  const [placementResourcePreview, setPlacementResourcePreview] =
    useState<ManagementPlacementResourcePreview | null>(null);
  const [placementResourceError, setPlacementResourceError] =
    useState<string | null>(null);
  const [placementResourcePreviewing, setPlacementResourcePreviewing] =
    useState(false);
  const [placementResourceApplying, setPlacementResourceApplying] =
    useState(false);

  const activeCardIds = useMemo(
    () => (
      cardIds.length > 0
        ? cardIds
        : card
          ? [card.id]
          : []
    ),
    [card, cardIds],
  );

  const placementResourceOptions = useMemo(() => {
    const placement = card?.placement;
    if (!placement || !placementEditMode) return [];

    if (placementEditMode === 'TEACHER') {
      return teacherOptions.filter(
        (option) => option.id !== placement.teacherId,
      );
    }

    return roomOptions.filter(
      (option) => option.id !== placement.roomId,
    );
  }, [
    card?.placement,
    placementEditMode,
    roomOptions,
    teacherOptions,
  ]);

  const openPlanTeacherEditor = () => {
    if (!planRow) return;
    setPlanTeacherIds(planRow.teacherIds);
    setPlanError(null);
    setPlanTeacherOpen(true);
  };

  const togglePlanTeacher = (teacherId: string) => {
    setPlanTeacherIds((current) => (
      current.includes(teacherId)
        ? current.filter((value) => value !== teacherId)
        : [...current, teacherId]
    ));
    setPlanError(null);
  };

  const savePlanTeachers = async () => {
    if (!planRow || planSaving || planRow.placedBlockCount > 0) return;

    setPlanSaving(true);
    setPlanError(null);
    try {
      await onUpdatePlanTeachers(planRow.requirementId, planTeacherIds);
      setPlanTeacherOpen(false);
    } catch (reason: unknown) {
      setPlanError(
        reason instanceof Error
          ? reason.message
          : 'Öğretmen tanımı güncellenemedi.',
      );
    } finally {
      setPlanSaving(false);
    }
  };

  const previewPlacementResource = async () => {
    if (
      !placementEditMode
      || !placementChoiceId
      || activeCardIds.length === 0
      || placementResourcePreviewing
      || placementResourceApplying
    ) {
      return;
    }

    setPlacementResourcePreviewing(true);
    setPlacementResourceError(null);
    setPlacementResourcePreview(null);

    try {
      setPlacementResourcePreview(
        await onPreviewPlacementResource(
          activeCardIds,
          placementEditMode,
          placementChoiceId,
        ),
      );
    } catch (reason: unknown) {
      setPlacementResourceError(
        reason instanceof Error
          ? reason.message
          : 'Değişikliğin etkisi hesaplanamadı.',
      );
    } finally {
      setPlacementResourcePreviewing(false);
    }
  };

  const applyPlacementResource = async () => {
    if (
      !placementEditMode
      || !placementChoiceId
      || !placementResourcePreview?.canApply
      || activeCardIds.length === 0
      || placementResourceApplying
      || placementResourcePreviewing
    ) {
      return;
    }

    setPlacementResourceApplying(true);
    setPlacementResourceError(null);

    try {
      await onApplyPlacementResource(
        activeCardIds,
        placementEditMode,
        placementChoiceId,
        placementResourcePreview.stateToken,
      );
      setPlacementEditMode(null);
      setPlacementChoiceId(null);
      setPlacementResourcePreview(null);
    } catch (reason: unknown) {
      setPlacementResourceError(
        reason instanceof Error
          ? reason.message
          : 'Kaynak değişikliği uygulanamadı.',
      );
    } finally {
      setPlacementResourceApplying(false);
    }
  };

  useEffect(() => {
    if (!candidateFocus) {
      setFocusTeacherId(null);
      setFocusRoomId(null);
      return;
    }

    setFocusTeacherId(
      focusTeacherIds.length === 1 ? focusTeacherIds[0] : null,
    );
    setFocusRoomId(null);
  }, [candidateFocus, focusTeacherIds]);

  useEffect(() => {
    if (!candidateFocus || !focusTeacherId) {
      setFocusRoomId(null);
      return;
    }

    setFocusRoomId(
      focusRoomIds.length === 1 ? focusRoomIds[0] : null,
    );
  }, [candidateFocus, focusRoomIds, focusTeacherId]);


  useEffect(() => {
    setShowGeneralCandidates(false);
  }, [
    card?.id,
    card?.placement?.dayOfWeek,
    card?.placement?.startPeriod,
    card?.placement?.teacherId,
    card?.placement?.roomId,
  ]);


  useEffect(() => {
    setPlacementEditMode(null);
    setPlacementChoiceId(null);
    setPlacementResourcePreview(null);
    setPlacementResourceError(null);
    setPlanTeacherOpen(false);
    setPlanRoomOpen(false);
    setPlanError(null);
  }, [
    card?.id,
    card?.placement?.dayOfWeek,
    card?.placement?.startPeriod,
    card?.placement?.teacherId,
    card?.placement?.roomId,
  ]);

  if (!card) {
    return (
      <aside className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ayrıntılar</p>
            <h2 className="mt-0.5 text-base font-bold">Kart seçimi</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700" title="Ayrıntıları kapat">×</button>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4">
          <p className="text-xs font-bold leading-5 text-slate-500">
            Havuzdan veya program ızgarasından bir kart seçin. Ders, grup, öğretmen, salon ve aday alanı bilgileri burada gösterilir.
          </p>
        </div>
      </aside>
    );
  }

  const placement = card.placement;

  const renderCandidate = (
    candidate: ManagementCandidateAssessment,
    index: number,
  ) => {
    const isCurrent = Boolean(
      placement
      && candidate.dayOfWeek === placement.dayOfWeek
      && candidate.startPeriod === placement.startPeriod
      && candidate.teacherId === placement.teacherId
      && candidate.roomId === placement.roomId
    );
    const actionable = Boolean(
      canEdit
      && candidate.isComplete
      && !card.locked
      && !isCurrent
    );

    return (
      <div
        key={`${candidate.dayOfWeek}-${candidate.startPeriod}-${candidate.teacherId ?? 'x'}-${candidate.roomId ?? 'x'}-${index}`}
        className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black text-emerald-950">
            {DAY_LABELS[candidate.dayOfWeek]} · {candidate.startPeriod}. ders
          </p>
          <p className="mt-0.5 truncate text-[9px] font-semibold text-emerald-700">
            {candidate.teacherId
              ? teacherNamesById[candidate.teacherId] ?? 'Öğretmen'
              : 'Öğretmen belirsiz'}
            {' · '}
            {candidate.roomId
              ? roomNamesById[candidate.roomId] ?? 'Salon'
              : 'Salon belirsiz'}
          </p>
        </div>

        {isCurrent ? (
          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[9px] font-black text-emerald-700">
            Mevcut
          </span>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => onCandidateAction(candidate)}
            disabled={!actionable || commandBusy}
            className="shrink-0 rounded-lg bg-emerald-800 px-2.5 py-1.5 text-[9px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {placement ? 'Taşı' : 'Yerleştir'}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="management-scrollbar h-full min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ayrıntılar</p>
          <h2 className="mt-0.5 truncate text-base font-bold">{card.subjectName}</h2>
          <p className="mt-1 text-[10px] font-medium text-slate-500">{card.groupName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
            statusBadge(card)
          }`}>
            {managementCardStatus(card)}
          </span>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700" title="Ayrıntıları kapat">×</button>
        </div>
      </div>

      <dl className="mt-4 border-t border-slate-100 pt-3">
        <MetaRow
          label="Sınıf"
          value={card.classCodes.length > 0 ? card.classCodes.join(', ') : 'Ortak grup'}
        />
        <MetaRow
          label="Blok"
          value={`${card.blockIndex}. blok · ${card.durationPeriods} ders saati`}
        />
        <MetaRow
          label="Haftalık"
          value={`${card.weeklyLoad} ders saati`}
        />
        <MetaRow
          label="Ders türü"
          value={courseCharacterLabel(card.courseCharacter)}
        />
        <MetaRow
          label="İşleyiş"
          value={deliveryModeLabel(card.deliveryMode)}
        />
        <MetaRow
          label="Öğretmen"
          value={
            card.teacherNames.length > 0
              ? `${card.teacherNames.join(', ')} · ${assignmentModeLabel(card.teacherMode)}`
              : 'Belirsiz'
          }
        />
        <MetaRow
          label="Salon"
          value={
            card.roomNames.length > 0
              ? `${card.roomNames.join(', ')} · ${assignmentModeLabel(card.resourceMode)}`
              : 'Belirsiz'
          }
        />
      </dl>

      {planRow && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Ders planı kaynakları
              </p>
              <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">
                Ders Planı sayfasındaki öğretmen havuzu ve salon seçme yöntemini buradan da düzenleyebilirsiniz.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openPlanTeacherEditor}
              disabled={!canEdit || commandBusy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-35"
            >
              Öğretmen tanımı
            </button>
            <button
              type="button"
              onClick={() => {
                setPlanError(null);
                setPlanRoomOpen(true);
              }}
              disabled={!canEdit || commandBusy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-35"
            >
              Salon tanımı
            </button>
          </div>

          {planRow.placedBlockCount > 0 && (
            <p className="mt-2 text-[9px] font-medium leading-4 text-amber-700">
              Bu dersin {planRow.placedBlockCount} bloğu programda. Mevcut kartın öğretmen/salonunu aşağıdaki “Yerleşimi düzenle” bölümünden değiştirebilirsiniz; ders planı havuzunu değiştirmek için tüm blokların havuzda olması gerekir.
            </p>
          )}
        </div>
      )}

      {placement && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">
                Mevcut yerleşim
              </p>
              <p className="mt-1 text-xs font-black text-blue-950">
                {DAY_LABELS[placement.dayOfWeek]} · {placement.startPeriod}. ders
              </p>
              <p className="mt-1 text-[10px] font-semibold text-blue-700">
                {placement.teacherName ?? 'Öğretmen belirsiz'} · {placement.roomName ?? 'Salon belirsiz'}
              </p>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={onRemove}
                disabled={commandBusy || card.locked}
                className="shrink-0 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Kaldır
              </button>
            )}
          </div>
        </div>
      )}


      {placement && !candidateFocus && canEdit && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Yerleşimi düzenle
          </p>
          <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">
            Gün veya saati değiştirmek için kartı çizelgede sürükleyin. Öğretmen veya salonu değiştirmek için kaynağı seçin; sistem mevcut slot üzerindeki etkisini ve çakışmaları önce hesaplar.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPlacementEditMode('TEACHER');
                setPlacementChoiceId(null);
                setPlacementResourcePreview(null);
                setPlacementResourceError(null);
              }}
              disabled={teacherOptions.length <= (placement.teacherId ? 1 : 0) || commandBusy || card.locked}
              className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${
                placementEditMode === 'TEACHER'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              Öğretmen değiştir
              <span className="ml-1 text-[9px] opacity-65">
                · {Math.max(0, teacherOptions.length - (placement.teacherId ? 1 : 0))}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPlacementEditMode('ROOM');
                setPlacementChoiceId(null);
                setPlacementResourcePreview(null);
                setPlacementResourceError(null);
              }}
              disabled={roomOptions.length <= (placement.roomId ? 1 : 0) || commandBusy || card.locked}
              className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${
                placementEditMode === 'ROOM'
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              Salon değiştir
              <span className="ml-1 text-[9px] opacity-65">
                · {Math.max(0, roomOptions.length - (placement.roomId ? 1 : 0))}
              </span>
            </button>
          </div>

          {placementEditMode && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    {placementEditMode === 'TEACHER' ? 'Yeni öğretmen' : 'Yeni salon'}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    {placementEditMode === 'TEACHER'
                      ? `Salon sabit: ${placement.roomName ?? 'Salon belirsiz'}`
                      : `Öğretmen sabit: ${placement.teacherName ?? 'Öğretmen belirsiz'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlacementEditMode(null);
                    setPlacementChoiceId(null);
                    setPlacementResourcePreview(null);
                    setPlacementResourceError(null);
                  }}
                  className="text-[9px] font-bold text-slate-400 hover:text-slate-700"
                >
                  Vazgeç
                </button>
              </div>

              <div className="mt-3 max-h-[210px] space-y-1.5 overflow-y-auto pr-1">
                {placementResourceOptions.map((option) => {
                  const selected = placementChoiceId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setPlacementChoiceId(option.id);
                        setPlacementResourcePreview(null);
                        setPlacementResourceError(null);
                      }}
                      disabled={placementResourcePreviewing || placementResourceApplying}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[10px] font-bold transition ${
                        selected
                          ? placementEditMode === 'ROOM'
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{option.name}</span>
                      <span>{selected ? 'Seçildi' : 'Seç'}</span>
                    </button>
                  );
                })}
              </div>

              {placementResourceError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                  {placementResourceError}
                </div>
              )}

              {placementResourcePreview && (
                <div className={`mt-3 rounded-xl border p-3 ${
                  placementResourcePreview.canApply
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}>
                  <p className={`text-[10px] font-black ${
                    placementResourcePreview.canApply
                      ? 'text-emerald-800'
                      : 'text-amber-900'
                  }`}>
                    {placementResourcePreview.canApply
                      ? 'Bu değişiklik mevcut programı bozmadan uygulanabilir.'
                      : 'Bu değişiklik şu anda uygulanamaz.'}
                  </p>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-600">
                    {placementResourcePreview.affectedCardCount} kart · {placementResourcePreview.affectedRequirementCount} ders tanımı
                    {placementResourcePreview.poolExpansionCount > 0
                      ? ` · ${placementResourcePreview.poolExpansionCount} öğretmen/salon havuzu genişleyecek`
                      : ''}
                  </p>

                  {placementResourcePreview.blockReasons.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {placementResourcePreview.blockReasons.map((reason) => (
                        <p key={reason} className="text-[9px] font-bold text-amber-800">
                          • {reason === 'TEACHER_CONFLICT'
                            ? 'Öğretmen aynı saatte başka derste.'
                            : reason === 'ROOM_CONFLICT'
                              ? 'Salon aynı saatte başka derste kullanılıyor.'
                              : reason === 'RESOURCE_INACTIVE'
                                ? 'Seçilen kaynak aktif değil.'
                                : reason === 'CAPABILITY_MISMATCH'
                                  ? 'Salon dersin gerekli özelliğini karşılamıyor.'
                                  : reason === 'CARD_LOCKED'
                                    ? 'Kart kilitli.'
                                    : reason === 'NO_CHANGES'
                                      ? 'Kaynak zaten bu yerleşimde kullanılıyor.'
                                      : reason}
                        </p>
                      ))}
                    </div>
                  )}

                  {placementResourcePreview.conflicts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {placementResourcePreview.conflicts.slice(0, 4).map((conflict) => (
                        <p
                          key={`${conflict.cardId}-${conflict.blockingCardId}-${conflict.conflictType}`}
                          className="text-[9px] font-semibold text-slate-600"
                        >
                          {conflict.subjectName} · {conflict.groupName} · {DAY_LABELS[conflict.dayOfWeek]} {conflict.startPeriod}. ders
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void previewPlacementResource()}
                  disabled={
                    !placementChoiceId
                    || placementResourcePreviewing
                    || placementResourceApplying
                    || commandBusy
                    || card.locked
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-700 disabled:opacity-35"
                >
                  {placementResourcePreviewing
                    ? 'Etki hesaplanıyor…'
                    : placementResourcePreview
                      ? 'Etkiyi yeniden hesapla'
                      : 'Etkiyi hesapla'}
                </button>

                {placementResourcePreview?.canApply && (
                  <button
                    type="button"
                    onClick={() => void applyPlacementResource()}
                    disabled={placementResourceApplying || placementResourcePreviewing || commandBusy}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black text-white disabled:opacity-35 ${
                      placementEditMode === 'ROOM'
                        ? 'bg-emerald-800'
                        : 'bg-slate-950'
                    }`}
                  >
                    {placementResourceApplying ? 'Uygulanıyor…' : 'Değişikliği uygula'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {planTeacherOpen && planRow && (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  Ders Planını Düzenle
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {planRow.subjectName} · {planRow.classCodes.join(', ') || planRow.groupName}
                </h3>
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  Öğretmen seçimi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlanTeacherOpen(false)}
                disabled={planSaving}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500"
              >
                Kapat
              </button>
            </div>

            <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
              <div className={`rounded-2xl border p-3 ${
                planRow.placedBlockCount > 0
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}>
                <p className={`text-[10px] font-black ${
                  planRow.placedBlockCount > 0 ? 'text-amber-800' : 'text-emerald-800'
                }`}>
                  {planRow.placedBlockCount > 0
                    ? `${planRow.placedBlockCount} blok şu anda programda yerleşmiş.`
                    : 'Programda yerleşmiş blok yok.'}
                </p>
                <p className="mt-1 text-[10px] font-medium leading-4 text-slate-600">
                  {planRow.placedBlockCount > 0
                    ? 'Ders planı öğretmen havuzunu değiştirmek için önce bu dersin tüm bloklarını programdan kaldırın. Mevcut slotta öğretmen değişikliği için kart ayrıntılarındaki “Yerleşimi düzenle” bölümünü kullanın.'
                    : 'Bir seçim sabit atama, birden fazla seçim seçilebilir havuz oluşturur.'}
                </p>
              </div>

              <div className="mt-4 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                {teacherOptions.map((option) => {
                  const selected = planTeacherIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => togglePlanTeacher(option.id)}
                      disabled={planSaving || planRow.placedBlockCount > 0}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[10px] font-bold transition ${
                        selected
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <span>{option.name}</span>
                      <span>{selected ? 'Seçildi' : 'Seç'}</span>
                    </button>
                  );
                })}
              </div>

              {planError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                  {planError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
              <p className="text-[10px] font-medium text-slate-500">
                {planTeacherIds.length === 0
                  ? 'Belirsiz'
                  : planTeacherIds.length === 1
                    ? 'Sabit atama'
                    : `${planTeacherIds.length} seçenekli havuz`}
              </p>
              <button
                type="button"
                onClick={() => void savePlanTeachers()}
                disabled={planSaving || planRow.placedBlockCount > 0}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-35"
              >
                {planSaving ? 'Kaydediliyor…' : 'Değişikliği kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {planRoomOpen && planRow && (
        <ManagementRoomStrategyEditor
          row={planRow}
          stage={planStage}
          roomOptions={roomOptions}
          capabilityOptions={roomCapabilityOptions}
          onClose={() => setPlanRoomOpen(false)}
          onOpenProgram={() => setPlanRoomOpen(false)}
          onSave={onUpdatePlanRoomStrategy}
        />
      )}

      {commandNotice && (
        <div
          className={`mt-4 rounded-2xl border px-3 py-2.5 text-xs font-bold ${
            commandNotice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : commandNotice.kind === 'info'
                ? 'border-blue-200 bg-blue-50 text-blue-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {commandNotice.text}
        </div>
      )}


      {candidateFocus && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
              Bu hücre için seçim
            </p>
            <p className="mt-1 text-xs font-black text-blue-950">
              {DAY_LABELS[candidateFocus.dayOfWeek]} · {candidateFocus.startPeriod}. ders
            </p>
            <p className="mt-1 text-[10px] font-medium text-blue-700">
              Yalnızca kararsız kalan bilgiyi seçin.
            </p>
          </div>

          <div className="mt-4">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Öğretmen
            </p>

            {focusTeacherIds.length === 1 ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700">
                {teacherNamesById[focusTeacherIds[0]] ?? 'Öğretmen'}
                <span className="ml-2 text-[9px] font-semibold text-slate-400">
                  Sabit
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {focusTeacherIds.map((teacherId) => (
                  <button
                    key={teacherId}
                    type="button"
                    onClick={() => setFocusTeacherId(teacherId)}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                      focusTeacherId === teacherId
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {teacherNamesById[teacherId] ?? 'Öğretmen'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Salon
            </p>

            {!focusTeacherId ? (
              <p className="mt-2 rounded-xl bg-white/70 px-3 py-2.5 text-[10px] font-semibold text-slate-400">
                Önce öğretmeni seçin.
              </p>
            ) : focusRoomIds.length === 1 ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700">
                {roomNamesById[focusRoomIds[0]] ?? 'Salon'}
                <span className="ml-2 text-[9px] font-semibold text-slate-400">
                  Tek uygun salon
                </span>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {focusRoomIds.map((roomId) => (
                  <button
                    key={roomId}
                    type="button"
                    onClick={() => setFocusRoomId(roomId)}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                      focusRoomId === roomId
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    {roomNamesById[roomId] ?? 'Salon'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-blue-100 pt-3">
            {focusCandidate ? (
              <p className="mb-2 text-[10px] font-semibold text-slate-500">
                {teacherNamesById[focusCandidate.teacherId ?? ''] ?? 'Öğretmen'}
                {' · '}
                {roomNamesById[focusCandidate.roomId ?? ''] ?? 'Salon'}
              </p>
            ) : (
              <p className="mb-2 text-[10px] font-semibold text-slate-400">
                Seçimi tamamlayın.
              </p>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  if (focusCandidate) onCandidateAction(focusCandidate);
                }}
                disabled={!focusCandidate || commandBusy || card.locked}
                className="w-full rounded-xl bg-emerald-800 px-3 py-2.5 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {placement ? 'Taşı' : 'Yerleştir'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          Aday alanı
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-emerald-50 p-2.5">
            <p className="text-[9px] font-black uppercase text-emerald-700">Uygun</p>
            <p className="mt-1 text-lg font-black text-emerald-950">{card.validCount}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-2.5">
            <p className="text-[9px] font-black uppercase text-amber-700">Belirsiz</p>
            <p className="mt-1 text-lg font-black text-amber-950">{card.unresolvedCount}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-2.5">
            <p className="text-[9px] font-black uppercase text-slate-500">Geçersiz</p>
            <p className="mt-1 text-lg font-black text-slate-900">{card.invalidCount}</p>
          </div>
        </div>
      </div>

      {candidateLoading && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
          Adaylar yükleniyor…
        </div>
      )}

      {candidateError && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          {candidateError}
        </div>
      )}

      {!candidateLoading && !candidateError && candidateDetail && (
        <>
          <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Neden değil?
            </p>

            {candidateDetail.reasonCounts.length === 0 ? (
              <div className="mt-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                Bu kartın aday alanında açıklanması gereken bir engel yok.
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {candidateDetail.reasonCounts.slice(0, 8).map((reason) => (
                  <div
                    key={reason.code}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <span className="text-[10px] font-bold leading-4 text-slate-600">
                      {translateCandidateReason(reason.code)}
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-500">
                      {reason.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!placement && !candidateFocus && candidateDetail.validCandidates.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Alternatif yerleşimler
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">
                    {placement
                      ? 'Mevcut yerleşimi değiştirmek için kartı çizelgede sürükleyin. İsterseniz ayrıntılı aday listesini de açabilirsiniz.'
                      : 'Kartı çizelgeye sürüklemek en hızlı yöntemdir. Ayrıntılı aday listesi isteğe bağlıdır.'}
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-slate-600">
                  {candidateDetail.validCandidates.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowGeneralCandidates((value) => !value)}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {showGeneralCandidates ? 'Aday listesini gizle' : 'Aday listesini göster'}
              </button>

              {showGeneralCandidates && (
                <div className="mt-3 space-y-1.5">
                  {candidateDetail.validCandidates
                    .slice(0, 12)
                    .map(renderCandidate)}
                  {candidateDetail.validCandidates.length > 12 && (
                    <p className="px-1 pt-1 text-[9px] font-bold text-slate-400">
                      +{candidateDetail.validCandidates.length - 12} uygun aday daha
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

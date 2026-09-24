'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  managementCardStatus,
  translateCandidateReason,
  type ManagementBoardCard,
  type ManagementCandidateAssessment,
  type ManagementCandidateDetail,
} from '@/lib/managementBoard';

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
  candidateDetail,
  candidateLoading,
  candidateError,
  candidateFocus,
  teacherNamesById,
  roomNamesById,
  canEdit,
  commandBusy,
  commandNotice,
  onCandidateAction,
  onRemove,
  onClose,
}: {
  card: ManagementBoardCard | null;
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
  canEdit: boolean;
  commandBusy: boolean;
  commandNotice: { kind: 'success' | 'error' | 'info'; text: string } | null;
  onCandidateAction: (candidate: ManagementCandidateAssessment) => void;
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


  const placementTeacherCandidates = useMemo(() => {
    const placement = card?.placement;
    if (!placement || !candidateDetail) return [];

    const byTeacher = new Map<string, ManagementCandidateAssessment>();

    candidateDetail.validCandidates.forEach((candidate) => {
      if (
        candidate.isComplete
        && candidate.dayOfWeek === placement.dayOfWeek
        && candidate.startPeriod === placement.startPeriod
        && candidate.roomId === placement.roomId
        && candidate.teacherId
        && candidate.teacherId !== placement.teacherId
      ) {
        byTeacher.set(candidate.teacherId, candidate);
      }
    });

    return Array.from(byTeacher.values());
  }, [candidateDetail, card?.placement]);

  const placementRoomCandidates = useMemo(() => {
    const placement = card?.placement;
    if (!placement || !candidateDetail) return [];

    const byRoom = new Map<string, ManagementCandidateAssessment>();

    candidateDetail.validCandidates.forEach((candidate) => {
      if (
        candidate.isComplete
        && candidate.dayOfWeek === placement.dayOfWeek
        && candidate.startPeriod === placement.startPeriod
        && candidate.teacherId === placement.teacherId
        && candidate.roomId
        && candidate.roomId !== placement.roomId
      ) {
        byRoom.set(candidate.roomId, candidate);
      }
    });

    return Array.from(byRoom.values());
  }, [candidateDetail, card?.placement]);

  const placementSelectedCandidate = useMemo(() => {
    if (!placementEditMode || !placementChoiceId) return null;

    const candidates = placementEditMode === 'TEACHER'
      ? placementTeacherCandidates
      : placementRoomCandidates;

    return candidates.find((candidate) => (
      placementEditMode === 'TEACHER'
        ? candidate.teacherId === placementChoiceId
        : candidate.roomId === placementChoiceId
    )) ?? null;
  }, [
    placementChoiceId,
    placementEditMode,
    placementRoomCandidates,
    placementTeacherCandidates,
  ]);

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
            Gün veya saati değiştirmek için kartı çizelgede sürükleyin. Aynı slotta yalnız öğretmen ya da salonu değiştirebilirsiniz.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPlacementEditMode('TEACHER');
                setPlacementChoiceId(null);
              }}
              disabled={placementTeacherCandidates.length === 0 || commandBusy || card.locked}
              className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${
                placementEditMode === 'TEACHER'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              Öğretmen değiştir
              <span className="ml-1 text-[9px] opacity-65">
                {placementTeacherCandidates.length > 0
                  ? `· ${placementTeacherCandidates.length}`
                  : '· yok'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPlacementEditMode('ROOM');
                setPlacementChoiceId(null);
              }}
              disabled={placementRoomCandidates.length === 0 || commandBusy || card.locked}
              className={`rounded-xl border px-3 py-2.5 text-[10px] font-bold transition ${
                placementEditMode === 'ROOM'
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              Salon değiştir
              <span className="ml-1 text-[9px] opacity-65">
                {placementRoomCandidates.length > 0
                  ? `· ${placementRoomCandidates.length}`
                  : '· yok'}
              </span>
            </button>
          </div>

          {placementEditMode === 'TEACHER' && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Yeni öğretmen
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    Salon sabit: {placement.roomName ?? 'Salon'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlacementEditMode(null);
                    setPlacementChoiceId(null);
                  }}
                  className="text-[9px] font-bold text-slate-400 hover:text-slate-700"
                >
                  Vazgeç
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {placementTeacherCandidates.map((candidate) => (
                  <button
                    key={candidate.teacherId}
                    type="button"
                    onClick={() => setPlacementChoiceId(candidate.teacherId)}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                      placementChoiceId === candidate.teacherId
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {candidate.teacherId
                      ? teacherNamesById[candidate.teacherId] ?? 'Öğretmen'
                      : 'Öğretmen'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (placementSelectedCandidate) onCandidateAction(placementSelectedCandidate);
                }}
                disabled={!placementSelectedCandidate || commandBusy || card.locked}
                className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Öğretmeni değiştir
              </button>
            </div>
          )}

          {placementEditMode === 'ROOM' && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                    Yeni salon
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">
                    Öğretmen sabit: {placement.teacherName ?? 'Öğretmen'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlacementEditMode(null);
                    setPlacementChoiceId(null);
                  }}
                  className="text-[9px] font-bold text-slate-400 hover:text-slate-700"
                >
                  Vazgeç
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {placementRoomCandidates.map((candidate) => (
                  <button
                    key={candidate.roomId}
                    type="button"
                    onClick={() => setPlacementChoiceId(candidate.roomId)}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                      placementChoiceId === candidate.roomId
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    {candidate.roomId
                      ? roomNamesById[candidate.roomId] ?? 'Salon'
                      : 'Salon'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (placementSelectedCandidate) onCandidateAction(placementSelectedCandidate);
                }}
                disabled={!placementSelectedCandidate || commandBusy || card.locked}
                className="mt-3 w-full rounded-xl bg-emerald-800 px-3 py-2.5 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Salonu değiştir
              </button>
            </div>
          )}
        </div>
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

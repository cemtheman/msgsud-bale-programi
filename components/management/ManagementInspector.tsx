'use client';

import {
  managementCardStatus,
  translateCandidateReason,
  type ManagementBoardCard,
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
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 py-1.5 text-[11px]">
      <dt className="font-bold text-slate-400">{label}</dt>
      <dd className="min-w-0 font-bold text-slate-700">{value}</dd>
    </div>
  );
}

export function ManagementInspector({
  card,
  candidateDetail,
  candidateLoading,
  candidateError,
  teacherNamesById,
  roomNamesById,
}: {
  card: ManagementBoardCard | null;
  candidateDetail: ManagementCandidateDetail | null;
  candidateLoading: boolean;
  candidateError: string | null;
  teacherNamesById: Record<string, string>;
  roomNamesById: Record<string, string>;
}) {
  if (!card) {
    return (
      <aside className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
          Ayrıntılar
        </p>
        <h2 className="mt-1 text-lg font-black">Kart seçimi</h2>

        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4">
          <p className="text-xs font-bold leading-5 text-slate-500">
            Havuzdan veya program ızgarasından bir kart seçin. Ders, grup, öğretmen, salon ve aday alanı bilgileri burada gösterilir.
          </p>
        </div>
      </aside>
    );
  }

  const placement = card.placement;

  return (
    <aside className="min-h-0 overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
            Ayrıntılar
          </p>
          <h2 className="mt-1 truncate text-lg font-black">{card.subjectName}</h2>
          <p className="mt-1 text-[11px] font-bold text-slate-500">{card.groupName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
          statusBadge(card)
        }`}>
          {managementCardStatus(card)}
        </span>
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

          {candidateDetail.validCandidates.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Uygun adaylar
              </p>
              <div className="mt-2 space-y-1.5">
                {candidateDetail.validCandidates.slice(0, 8).map((candidate, index) => (
                  <div
                    key={`${candidate.dayOfWeek}-${candidate.startPeriod}-${candidate.teacherId ?? 'x'}-${candidate.roomId ?? 'x'}-${index}`}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2"
                  >
                    <p className="text-[10px] font-black text-emerald-950">
                      {DAY_LABELS[candidate.dayOfWeek]} · {candidate.startPeriod}. ders
                    </p>
                    <p className="mt-0.5 text-[9px] font-semibold text-emerald-700">
                      {candidate.teacherId
                        ? teacherNamesById[candidate.teacherId] ?? 'Öğretmen'
                        : 'Öğretmen belirsiz'}
                      {' · '}
                      {candidate.roomId
                        ? roomNamesById[candidate.roomId] ?? 'Salon'
                        : 'Salon belirsiz'}
                    </p>
                  </div>
                ))}
                {candidateDetail.validCandidates.length > 8 && (
                  <p className="px-1 pt-1 text-[9px] font-bold text-slate-400">
                    +{candidateDetail.validCandidates.length - 8} uygun aday daha
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

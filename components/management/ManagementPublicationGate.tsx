'use client';

import type {
  ManagementPublicationBlockReason,
  ManagementPublicationGateData,
  ManagementPublicationWarningReason,
} from '@/lib/managementPublicationGate';

interface ReasonMeta {
  title: string;
  detail: string;
}

const BLOCK_META: Record<ManagementPublicationBlockReason, ReasonMeta> = {
  PUBLICATION_CONTROL_MISSING: {
    title: 'Yayın kontrol kaydı bulunamadı',
    detail: 'Akademik yıl için güvenli yayın kontrol kaydı olmadan yayın açılamaz.',
  },
  RUNTIME_ADJUSTMENTS_PENDING: {
    title: 'Eski program düzeltmeleri henüz taşınmadı',
    detail: 'Öğrenci görünümündeki runtime düzeltmeler yönetim modeline alınmadan yayın açılamaz.',
  },
  PUBLIC_BASELINE_DRIFT: {
    title: 'Mevcut yayın beklenen baseline’dan farklı',
    detail: 'Yayındaki program güvenli başlangıç imzasından ayrılmış. Önce farkın kaynağı doğrulanmalı.',
  },
  UNPLACED_CARDS: {
    title: 'Yerleştirilmemiş ders kartları var',
    detail: 'Taslakta bütün aktif ders kartlarının gün ve saat yerleşimi tamamlanmalı.',
  },
  DOMAIN_SUMMARY_MISSING: {
    title: 'Aday alanı özeti eksik',
    detail: 'Bazı ders kartlarının geçerli yerleşim alanı henüz hesaplanmamış.',
  },
  CONTRADICTIONS: {
    title: 'Geçerli yerleşimi kalmayan dersler var',
    detail: 'Bazı ders kartları mevcut kurallar altında hiçbir geçerli aday konuma sahip değil.',
  },
  UNRESOLVED_TOUCHED: {
    title: 'Düzenlenen derslerde eksik kaynak bilgisi var',
    detail: 'İşlem görmüş derslerde öğretmen, salon veya kaynak belirsizliği devam ediyor.',
  },
  INVALID_PERIOD_RANGE: {
    title: 'Geçersiz saat aralığı var',
    detail: 'Bir veya daha fazla yerleşim okulun tanımlı ders saati sınırlarının dışına taşıyor.',
  },
  PUBLIC_MEMBER_MAPPING_MISSING: {
    title: 'Yayın hedefi çözülemeyen ders var',
    detail: 'Bir ders tanımı öğrenci programındaki SECTION/BALLET/MUSIC hedeflerine güvenle açılamıyor.',
  },
  INACTIVE_ROOM_PLACEMENT: {
    title: 'Aktif olmayan salonda ders var',
    detail: 'Tadilatta veya kullanım dışı bir salon üzerinde yerleşim bulunduğu için yayın kapalı.',
  },
};

const WARNING_META: Record<ManagementPublicationWarningReason, ReasonMeta> = {
  UNRESOLVED_INHERITED: {
    title: 'Mevcut veriden gelen eksik kaynak bilgileri var',
    detail: 'Henüz düzenlenmemiş bazı derslerde öğretmen veya salon bilgisi eksik. Sunucu bunu uyarı olarak izliyor.',
  },
};

function reasonCount(
  reason: ManagementPublicationBlockReason | ManagementPublicationWarningReason,
  data: ManagementPublicationGateData,
) {
  if (reason === 'UNPLACED_CARDS') return data.unplacedCards;
  if (reason === 'DOMAIN_SUMMARY_MISSING') return data.missingDomainSummaryCount;
  if (reason === 'CONTRADICTIONS') return data.contradictionCount;
  if (reason === 'UNRESOLVED_TOUCHED') return data.unresolvedTouchedCount;
  if (reason === 'UNRESOLVED_INHERITED') return data.unresolvedInheritedCount;
  if (reason === 'INVALID_PERIOD_RANGE') return data.invalidPeriodCount;
  if (reason === 'PUBLIC_MEMBER_MAPPING_MISSING') return data.memberlessRequirementCount;
  if (reason === 'INACTIVE_ROOM_PLACEMENT') return data.inactiveRoomPlacementCount;
  return 1;
}

export function ManagementPublicationGate({
  data,
}: {
  data: ManagementPublicationGateData | null;
}) {
  if (!data) {
    return (
      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-400">
          Sunucu yayın güvenliği hazırlanıyor…
        </p>
      </div>
    );
  }

  const blocked = !data.canPublish;
  const baselineCurrentSessions = data.baseline.currentSessionCount ?? '–';
  const baselineExpectedSessions = data.baseline.expectedSessionCount ?? '–';
  const baselineCurrentGroups = data.baseline.currentGroupCount ?? '–';
  const baselineExpectedGroups = data.baseline.expectedGroupCount ?? '–';

  return (
    <div className={[
      'rounded-[22px] border p-4 shadow-sm',
      blocked
        ? 'border-rose-200 bg-white'
        : 'border-emerald-200 bg-white',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            M19.4 · Sunucu yayın güvenliği
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            Tüm program için yayın kapısı
          </h3>
          <p className="mt-1 max-w-[720px] text-[11px] font-medium leading-5 text-slate-500">
            Bu kontrol bütün taslağı birlikte değerlendirir. Yalnız seçili Ortaokul
            veya Lise görünümüne bakılarak yayın açılamaz.
          </p>
          <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-600">
            Kapsam: Tüm program · Ortaokul + Lise
          </span>
        </div>

        <span className={[
          'shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-black',
          blocked
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        ].join(' ')}>
          {blocked ? 'Yayın kapalı' : 'Sunucu kontrolleri geçti'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Taslak
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {data.placedCards} / {data.totalCards}
          </p>
          <p className="text-[8px] font-medium text-slate-500">
            kart yerleşmiş
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Yayın projeksiyonu
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {data.projectedSessionCount}
          </p>
          <p className="text-[8px] font-medium text-slate-500">
            oturum
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Katılımcı satırı
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {data.projectedGroupCount}
          </p>
          <p className="text-[8px] font-medium text-slate-500">
            session-group
          </p>
        </div>

        <div className={[
          'rounded-2xl border p-3',
          data.baseline.healthy
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-rose-200 bg-rose-50',
        ].join(' ')}>
          <p className={[
            'text-[8px] font-black uppercase tracking-wide',
            data.baseline.healthy ? 'text-emerald-600' : 'text-rose-600',
          ].join(' ')}>
            Yayın dayanağı
          </p>
          <p className={[
            'mt-1 text-lg font-black',
            data.baseline.healthy ? 'text-emerald-800' : 'text-rose-800',
          ].join(' ')}>
            {data.baseline.healthy ? 'Sağlam' : 'Fark var'}
          </p>
          <p className="text-[8px] font-medium text-slate-500">
            {baselineCurrentSessions}/{baselineExpectedSessions} oturum ·{' '}
            {baselineCurrentGroups}/{baselineExpectedGroups} grup
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={[
          'rounded-full border px-2.5 py-1 text-[9px] font-bold',
          data.runtimeAdjustmentsReconciled
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700',
        ].join(' ')}>
          Runtime düzeltmeleri: {data.runtimeAdjustmentsReconciled ? 'uzlaştırıldı' : 'bekliyor'}
        </span>

        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-bold text-slate-600">
          Baseline: {data.baseline.source}
        </span>

        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-bold text-slate-600">
          Revision v{data.revisionVersion}
        </span>
      </div>

      {data.blockReasons.length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-black uppercase tracking-wide text-rose-600">
            Yayını şu anda engelleyenler
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {data.blockReasons.map((reason) => {
              const meta = BLOCK_META[reason] ?? {
                title: reason,
                detail: 'Sunucu bu durumu yayın engeli olarak işaretledi.',
              };

              return (
                <div
                  key={reason}
                  className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black text-rose-900">
                        {meta.title}
                      </p>
                      <p className="mt-1 text-[9px] font-medium leading-4 text-rose-700">
                        {meta.detail}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-sm font-black text-rose-700">
                      {reasonCount(reason, data)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.warningReasons.length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-black uppercase tracking-wide text-amber-600">
            Yayın öncesi uyarılar
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {data.warningReasons.map((reason) => {
              const meta = WARNING_META[reason] ?? {
                title: reason,
                detail: 'Sunucu bu durumu yayın öncesi uyarı olarak işaretledi.',
              };

              return (
                <div
                  key={reason}
                  className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black text-amber-900">
                        {meta.title}
                      </p>
                      <p className="mt-1 text-[9px] font-medium leading-4 text-amber-800">
                        {meta.detail}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-sm font-black text-amber-700">
                      {reasonCount(reason, data)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!blocked && (
        <div className={[
          'mt-4 rounded-2xl border p-4',
          data.canCurrentUserPublish
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50',
        ].join(' ')}>
          <p className={[
            'text-[10px] font-black',
            data.canCurrentUserPublish ? 'text-emerald-900' : 'text-amber-900',
          ].join(' ')}>
            {data.canCurrentUserPublish
              ? 'Sunucu ve yönetici yetkisi yayın için hazır.'
              : 'Sunucu kontrolleri geçti; yayın işlemi için ADMIN yetkisi gerekir.'}
          </p>
          <p className={[
            'mt-1 text-[10px] font-medium leading-5',
            data.canCurrentUserPublish ? 'text-emerald-800' : 'text-amber-800',
          ].join(' ')}>
            Bu ekranda henüz yayın komutu yok. Gerçek mutation, revision lifecycle ve
            atomik replacement sözleşmesi tamamlandıktan sonra ayrıca açılacak.
          </p>
        </div>
      )}
    </div>
  );
}

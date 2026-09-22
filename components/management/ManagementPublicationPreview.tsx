'use client';

import type {
  ManagementPublicationPreviewData,
  ManagementPublicationRequirementChange,
} from '@/lib/managementPublicationPreview';
import {
  formatInstructionalGroupName,
  type ManagementStage,
} from '@/lib/managementBoard';
import type { ManagementHealthSnapshot } from '@/lib/managementHealth';

function changeMagnitude(
  change: ManagementPublicationRequirementChange,
) {
  return (
    change.changedUnits
    + change.addedUnits
    + change.removedUnits
  );
}

export function ManagementPublicationPreview({
  data,
  stage,
  health,
}: {
  data: ManagementPublicationPreviewData | null;
  stage: ManagementStage;
  health: ManagementHealthSnapshot;
}) {
  if (!data) {
    return (
      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-400">
          Yayın karşılaştırması hazırlanıyor…
        </p>
      </div>
    );
  }

  const preview = data.stages[stage];
  const hasChanges = (
    preview.changedUnits > 0
    || preview.addedUnits > 0
    || preview.removedUnits > 0
  );

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            M19.1 · Yayın öncesi karşılaştırma
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} · Mevcut yayın → Bu taslak
          </h3>
          <p className="mt-1 max-w-[680px] text-[11px] font-medium leading-5 text-slate-500">
            Yerleşmiş taslak dersleri gerçek ders saatlerine açılarak mevcut
            yayın oturumlarıyla karşılaştırılır. Bu ekran hiçbir şeyi yayımlamaz.
          </p>
          <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-bold text-slate-600">
            Kaynak: {data.mappingSource === 'MANAGED_PUBLICATION'
              ? `Yönetilen yayın #${data.publicationNumber ?? '—'}`
              : 'Başlangıç eşlemesi'}
          </span>
        </div>

        <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-black ${
          data.mappingHealthy
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {data.mappingHealthy
            ? 'Kaynak eşlemesi sağlam'
            : 'Kaynak eşlemesi kontrol edilmeli'}
        </span>
      </div>

      {!data.mappingHealthy && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[10px] font-black text-rose-800">
            Mevcut yayın ile karşılaştırma eşlemesi artık birebir değil.
          </p>
          <p className="mt-1 text-[10px] font-medium leading-5 text-rose-700">
            {data.missingEvidenceSessionCount} eşlenmiş oturum mevcut yayında veya güncel taslak zincirinde bulunamadı ·{' '}
            {data.unmappedCurrentPublicSessionCount} mevcut yayın oturumu karşılaştırma eşlemesinde yok.
            Bu durum çözülmeden yayınlama adımı güvenli biçimde açılamaz.
          </p>
        </div>
      )}

      {health.status === 'YAYIN_ENGELLI' && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[10px] font-black text-amber-900">
            Bu karşılaştırma henüz tamamlanmamış bir taslağı gösteriyor.
          </p>
          <p className="mt-1 text-[10px] font-medium leading-5 text-amber-800">
            {stage === 'ORTAOKUL' ? 'Ortaokul' : 'Lise'} kapsamında {health.totalCards - health.placedCount} ders kartı henüz yerleşmediği için
            “yayından çıkacak” sayısı geçici olarak yüksek görünebilir. Bu rakamlar
            final yayın kararı değil, taslağın şu anki halinin mevcut yayına göre farkıdır.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-5 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Mevcut yayın
          </p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {preview.publishedUnits}
          </p>
          <p className="text-[8px] font-medium text-slate-400">
            ders saati
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Taslak
          </p>
          <p className="mt-1 text-xl font-black text-slate-900">
            {preview.draftUnits}
          </p>
          <p className="text-[8px] font-medium text-slate-400">
            yerleşmiş ders saati
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-blue-600">
            Değişecek
          </p>
          <p className="mt-1 text-xl font-black text-blue-800">
            {preview.changedUnits}
          </p>
          <p className="text-[8px] font-medium text-blue-600">
            ders saati
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-emerald-600">
            Eklenecek
          </p>
          <p className="mt-1 text-xl font-black text-emerald-800">
            {preview.addedUnits}
          </p>
          <p className="text-[8px] font-medium text-emerald-600">
            ders saati
          </p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-rose-600">
            Bu haliyle yayından çıkacak
          </p>
          <p className="mt-1 text-xl font-black text-rose-800">
            {preview.removedUnits}
          </p>
          <p className="text-[8px] font-medium text-rose-600">
            ders saati
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] items-end gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
              Etkilenen ders tanımları
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
              {preview.affectedRequirementCount} ders tanımında yayın farkı var · {preview.unchangedUnits} saat aynı
            </p>
          </div>

          <p className="text-right text-[8px] font-black uppercase tracking-wide text-blue-600">
            Değişecek
          </p>
          <p className="text-right text-[8px] font-black uppercase tracking-wide text-emerald-600">
            Eklenecek
          </p>
          <p className="text-right text-[8px] font-black uppercase tracking-wide text-rose-600">
            Çıkacak
          </p>
        </div>

        {hasChanges ? (
          <div className="divide-y divide-slate-100">
            {preview.changes.slice(0, 8).map((change) => (
              <div
                key={change.requirementId}
                className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] items-center gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold text-slate-800">
                    {change.subjectName}
                    {' · '}
                    {change.classCodes.join(', ') || change.groupName}
                  </p>
                  <p className="mt-0.5 truncate text-[8px] font-medium text-slate-400">
                    {formatInstructionalGroupName(change.groupName)} · Toplam {changeMagnitude(change)} saatlik yayın farkı
                  </p>
                </div>

                <p className="text-right text-[9px] font-bold text-blue-700">
                  {change.changedUnits > 0
                    ? `${change.changedUnits} değişir`
                    : '—'}
                </p>
                <p className="text-right text-[9px] font-bold text-emerald-700">
                  {change.addedUnits > 0
                    ? `+${change.addedUnits}`
                    : '—'}
                </p>
                <p className="text-right text-[9px] font-bold text-rose-700">
                  {change.removedUnits > 0
                    ? `−${change.removedUnits}`
                    : '—'}
                </p>
              </div>
            ))}

            {preview.changes.length > 8 && (
              <div className="px-3 py-2 text-center text-[9px] font-semibold text-slate-400">
                + {preview.changes.length - 8} ders tanımı daha
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-sm font-bold text-emerald-700">
              Taslak ile mevcut yayın arasında fark görünmüyor.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
        <p className="text-[9px] font-semibold leading-4 text-blue-800">
          Bu bölüm yalnız karşılaştırma yapar. Gerçek yayınlama ayrı sunucu
          güvenlik kapısı, state-token ve atomik publication sözleşmesiyle korunur.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementCoursePlanOption,
  ManagementCoursePlanRow,
  ManagementPlanStage,
  ManagementRoomStrategy,
} from '@/lib/managementCoursePlan';

const CAPABILITY_LABELS: Record<string, string> = {
  GENERAL_CLASSROOM: 'Genel derslik',
  MUSIC_THEORY: 'Müzik teorisi',
  INSTRUMENT_RELATED: 'Çalgı ilişkili',
  SOLFEGE: 'Solfej',
  RHYTHMIC: 'Ritmik',
  CLASSICAL_BALLET: 'Klasik bale',
  DANCE_TECHNIQUE: 'Dans tekniği',
  POINT_DANCE_TECHNIQUE: 'Point / dans tekniği',
  REPERTOIRE: 'Repertuvar',
};

function capabilityLabel(value: string) {
  return CAPABILITY_LABELS[value]
    ?? value
      .replaceAll('_', ' ')
      .toLocaleLowerCase('tr-TR')
      .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

function initialStrategy(row: ManagementCoursePlanRow): ManagementRoomStrategy {
  if (row.resourceMode === 'CAPABILITY') return 'CAPABILITY';
  if (row.resourceMode === 'UNKNOWN') return 'UNKNOWN';
  return 'SPECIFIC';
}

export function ManagementRoomStrategyEditor({
  row,
  stage,
  roomOptions,
  capabilityOptions,
  onClose,
  onOpenProgram,
  onSave,
}: {
  row: ManagementCoursePlanRow;
  stage: ManagementPlanStage;
  roomOptions: ManagementCoursePlanOption[];
  capabilityOptions: string[];
  onClose: () => void;
  onOpenProgram: (
    requirementId: string,
    stage: ManagementPlanStage,
  ) => void;
  onSave: (
    requirementId: string,
    strategy: ManagementRoomStrategy,
    roomIds: string[],
    requiredCapability: string | null,
  ) => Promise<void>;
}) {
  const [strategy, setStrategy] = useState<ManagementRoomStrategy>(
    initialStrategy(row),
  );
  const [roomIds, setRoomIds] = useState<string[]>(
    initialStrategy(row) === 'SPECIFIC' ? row.roomIds : [],
  );
  const [capability, setCapability] = useState<string>(
    row.requiredCapability ?? capabilityOptions[0] ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStrategy = initialStrategy(row);

  const changed = useMemo(() => {
    if (strategy !== currentStrategy) return true;

    if (strategy === 'CAPABILITY') {
      return capability !== (row.requiredCapability ?? '');
    }

    if (strategy === 'UNKNOWN') return false;

    const before = [...row.roomIds].sort();
    const after = [...roomIds].sort();
    return before.length !== after.length
      || before.some((value, index) => value !== after[index]);
  }, [
    capability,
    currentStrategy,
    roomIds,
    row.requiredCapability,
    row.roomIds,
    strategy,
  ]);

  const valid = (
    strategy === 'UNKNOWN'
    || (strategy === 'CAPABILITY' && capability.length > 0)
    || (strategy === 'SPECIFIC' && roomIds.length > 0)
  );

  const toggleRoom = (roomId: string) => {
    setRoomIds((current) => (
      current.includes(roomId)
        ? current.filter((value) => value !== roomId)
        : [...current, roomId]
    ));
    setError(null);
  };

  const save = async () => {
    if (saving || !valid || row.placedBlockCount > 0) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(
        row.requirementId,
        strategy,
        strategy === 'SPECIFIC' ? roomIds : [],
        strategy === 'CAPABILITY' ? capability : null,
      );
      onClose();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Salon seçme yöntemi güncellenemedi.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              Ders Planını Düzenle
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">
              {row.subjectName} · {row.classCodes.join(', ') || row.groupName}
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Salon seçme yöntemi
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            Kapat
          </button>
        </div>

        <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <div className={`rounded-2xl border p-3 ${
            row.placedBlockCount > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}>
            <p className={`text-[10px] font-black ${
              row.placedBlockCount > 0
                ? 'text-amber-800'
                : 'text-emerald-800'
            }`}>
              {row.placedBlockCount > 0
                ? `${row.placedBlockCount} blok şu anda programda yerleşmiş.`
                : 'Programda yerleşmiş blok yok.'}
            </p>
            <p className="mt-1 text-[10px] font-medium leading-4 text-slate-600">
              {row.placedBlockCount > 0
                ? 'Salon seçme yöntemini değiştirmek için önce bu dersin yerleşimlerini Program ekranından kaldırın.'
                : 'Kaydedildiğinde yalnız bu dersin uygun yerleri yeniden hesaplanacak.'}
            </p>

            {row.placedBlockCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenProgram(row.requirementId, stage)}
                className="mt-2 text-[10px] font-black text-blue-700 hover:text-blue-900"
              >
                Programda göster →
              </button>
            )}
          </div>

          <div className="mt-4">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Yöntem
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                {
                  id: 'SPECIFIC',
                  label: 'Belirli salon(lar)',
                  detail: 'Bir salon sabit, birden fazlası seçilebilir havuz olur.',
                },
                {
                  id: 'CAPABILITY',
                  label: 'Salon özelliğine göre',
                  detail: 'Örneğin Klasik bale veya Solfej özelliğine göre.',
                },
                {
                  id: 'UNKNOWN',
                  label: 'Bilinmiyor',
                  detail: 'Salon bilgisi daha sonra tamamlanacak.',
                },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStrategy(item.id);
                    setError(null);
                  }}
                  disabled={saving || row.placedBlockCount > 0}
                  className={`rounded-2xl border p-3 text-left transition ${
                    strategy === item.id
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="block text-[10px] font-black">
                    {item.label}
                  </span>
                  <span className={`mt-1 block text-[9px] font-medium leading-4 ${
                    strategy === item.id ? 'text-slate-300' : 'text-slate-400'
                  }`}>
                    {item.detail}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {strategy === 'SPECIFIC' && (
            <div className="mt-5">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Kullanılabilecek ana salonlar
              </p>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                Takma ad kayıtları burada gösterilmez.
              </p>
              <div className="mt-3 max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {roomOptions.map((option) => {
                  const selected = roomIds.includes(option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleRoom(option.id)}
                      disabled={saving || row.placedBlockCount > 0}
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
            </div>
          )}

          {strategy === 'CAPABILITY' && (
            <div className="mt-5">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Gerekli salon özelliği
              </p>
              <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">
                Uygun yer hesabında yalnız bu özelliği taşıyan salonlar aday olur.
                Doğrulanmış salonlar kesin aday, gözlemlenmiş bilgiler ise belirsiz aday olarak değerlendirilir.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {capabilityOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCapability(value);
                      setError(null);
                    }}
                    disabled={saving || row.placedBlockCount > 0}
                    className={`rounded-xl border px-3 py-2.5 text-left text-[10px] font-bold transition ${
                      capability === value
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    {capabilityLabel(value)}
                  </button>
                ))}
              </div>

              {capabilityOptions.length === 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  Önce Kaynaklar ekranında en az bir salon özelliği tanımlayın.
                </div>
              )}
            </div>
          )}

          {strategy === 'UNKNOWN' && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black text-slate-700">
                Salon bilgisi belirsiz bırakılacak.
              </p>
              <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
                Ders Program’da yerleştirilmeden önce bu bilgi tamamlanabilir.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
          <p className="text-[10px] font-medium text-slate-500">
            {strategy === 'SPECIFIC'
              ? roomIds.length === 0
                ? 'En az bir salon seçin'
                : roomIds.length === 1
                  ? 'Sabit salon'
                  : `${roomIds.length} salonluk seçilebilir havuz`
              : strategy === 'CAPABILITY'
                ? capability
                  ? `Özellik: ${capabilityLabel(capability)}`
                  : 'Bir özellik seçin'
                : 'Salon bilinmiyor'}
          </p>

          <button
            type="button"
            onClick={() => void save()}
            disabled={
              saving
              || row.placedBlockCount > 0
              || !valid
              || !changed
            }
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {saving ? 'Kaydediliyor…' : 'Değişikliği kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

const STEPS = [
  {
    kicker: '1 / 5 · Ders Havuzu',
    title: 'Yerleştirilecek dersler burada başlar',
    text: 'Henüz programa alınmamış dersleri Ders Havuzu’nda görürsünüz. “Yerleştirilebilir” filtresi, en az bir uygun zamanı bulunan kartları öne çıkarır.',
    tip: 'Bir kartı seçerek ayrıntılarını görebilir, sürükleyerek programa taşıyabilirsiniz.',
  },
  {
    kicker: '2 / 5 · Program Alanı',
    title: 'Kartı uygun saate sürükleyin',
    text: 'Orta bölüm gerçek haftalık çizelgedir. Sınıflar, Öğretmenler ve Salonlar görünümleri aynı programı farklı açılardan kontrol etmenizi sağlar.',
    tip: 'Çok derslik bloklarda yalnız başlangıç saati seçilir; devam saatlerini sistem birlikte taşır.',
  },
  {
    kicker: '3 / 5 · Uygunluk',
    title: 'Renkler karar desteğidir',
    text: 'Bir kartı sürüklerken uygun hedefler belirginleşir. Bilgi eksikse sistem bunu ayrı gösterir; uygun olmayan hedeflerde sınıf, öğretmen, salon veya zaman kuralı engel olabilir.',
    tip: '“Uygun değil” gördüğünüzde kartın Ayrıntılar panelindeki nedeni kontrol edin.',
  },
  {
    kicker: '4 / 5 · Ayrıntılar',
    title: 'Bir karta tıklayın, sistem nedenini anlatsın',
    text: 'Sağ panel gerçek yerleşimi, yerleşim seçeneklerini ve kullanılamayan saatlerin nedenlerini gösterir. Öğretmen veya salon değişikliği de buradan güvenli biçimde önizlenir.',
    tip: 'Yerleşimde kaynak değiştirmek yalnız mevcut yerleşimi etkiler; Ders Planı havuzu değişmez.',
  },
  {
    kicker: '5 / 5 · Güvenli çalışma',
    title: 'Geri Al / Yinele ile rahat çalışın',
    text: 'Yerleştirme, taşıma ve kaldırma işlemlerini üst çubuktaki Geri Al / Yinele kontrolleriyle geri çevirebilirsiniz. Birleşik kartlar tek kullanıcı işlemi gibi korunur.',
    tip: 'Yardım Merkezi’ni istediğiniz zaman açabilir ve bu turu yeniden başlatabilirsiniz.',
  },
] as const;

export function ManagementQuickTour({
  open,
  step,
  onStepChange,
  onClose,
  onFinish,
}: {
  open: boolean;
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  if (!open) return null;

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[110] bg-slate-950/20 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Yönetim hızlı turu"
    >
      <div className="absolute bottom-6 left-1/2 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-[24px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A63D48]">
              {current.kicker}
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          >
            Turu geç
          </button>
        </div>

        <p className="mt-3 text-[11px] font-medium leading-5 text-slate-600">
          {current.text}
        </p>

        <div className="mt-3 rounded-2xl bg-slate-50 px-3.5 py-3">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            İpucu
          </p>
          <p className="mt-1 text-[10px] font-semibold leading-5 text-slate-700">
            {current.tip}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" aria-label={`Adım ${step + 1} / ${STEPS.length}`}>
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-6 bg-slate-950' : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => onStepChange(step - 1)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
              >
                Geri
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  onFinish();
                } else {
                  onStepChange(step + 1);
                }
              }}
              className="rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black text-white transition hover:bg-slate-800"
            >
              {isLast ? 'Turu bitir' : 'Sonraki'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

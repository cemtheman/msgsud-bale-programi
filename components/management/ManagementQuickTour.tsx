'use client';

import { useEffect, useMemo, useState } from 'react';

const STEPS = [
  {
    target: 'pool',
    kicker: '1 / 5 · Ders Havuzu',
    title: 'Yerleştirilecek dersler burada başlar',
    text: 'Henüz programa alınmamış dersleri Ders Havuzu’nda görürsünüz. “Yerleştirilebilir” filtresi, en az bir uygun zamanı bulunan kartları öne çıkarır.',
    tip: 'Bir kartı seçerek ayrıntılarını görebilir, sürükleyerek programa taşıyabilirsiniz.',
  },
  {
    target: 'program-area',
    kicker: '2 / 5 · Program Alanı',
    title: 'Kartı uygun saate sürükleyin',
    text: 'Orta bölüm gerçek haftalık çizelgedir. Sınıflar, Öğretmenler ve Salonlar görünümleri aynı programı farklı açılardan kontrol etmenizi sağlar.',
    tip: 'Çok derslik bloklarda yalnız başlangıç saati seçilir; devam saatlerini sistem birlikte taşır.',
  },
  {
    target: 'board',
    kicker: '3 / 5 · Uygunluk',
    title: 'Renkler karar desteğidir',
    text: 'Bir kartı sürüklerken uygun hedefler belirginleşir. Bilgi eksikse sistem bunu ayrı gösterir; uygun olmayan hedeflerde sınıf, öğretmen, salon veya zaman kuralı engel olabilir.',
    tip: '“Uygun değil” gördüğünüzde kartın Ayrıntılar panelindeki nedeni kontrol edin.',
  },
  {
    target: 'inspector',
    kicker: '4 / 5 · Ayrıntılar',
    title: 'Bir karta tıklayın, sistem nedenini anlatsın',
    text: 'Sağ panel gerçek yerleşimi, yerleşim seçeneklerini ve kullanılamayan saatlerin nedenlerini gösterir. Öğretmen veya salon değişikliği de buradan güvenli biçimde önizlenir.',
    tip: 'Yerleşimde kaynak değiştirmek yalnız mevcut yerleşimi etkiler; Ders Planı havuzu değişmez.',
  },
  {
    target: 'history-actions',
    kicker: '5 / 5 · Güvenli çalışma',
    title: 'Geri Al / Yinele ile rahat çalışın',
    text: 'Yerleştirme, taşıma ve kaldırma işlemlerini üst çubuktaki Geri Al / Yinele kontrolleriyle geri çevirebilirsiniz. Birleşik kartlar tek kullanıcı işlemi gibi korunur.',
    tip: 'Yardım Merkezi’ni istediğiniz zaman açabilir ve bu turu yeniden başlatabilirsiniz.',
  },
] as const;

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

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
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    if (!open) {
      setSpotlight(null);
      return;
    }

    let frame = 0;

    const measure = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tour-target="${current.target}"]`,
      );

      if (!target) {
        setSpotlight(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const padding = current.target === 'history-actions' ? 8 : 10;

      setSpotlight({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.min(
          window.innerWidth - Math.max(8, rect.left - padding) - 8,
          rect.width + padding * 2,
        ),
        height: Math.min(
          window.innerHeight - Math.max(8, rect.top - padding) - 8,
          rect.height + padding * 2,
        ),
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const delayed = window.setTimeout(scheduleMeasure, 120);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [current.target, open, step]);

  const cardStyle = useMemo(() => {
    const width = Math.min(520, Math.max(320, window.innerWidth - 32));
    const margin = 22;

    if (!spotlight) {
      return {
        left: Math.max(16, (window.innerWidth - width) / 2),
        bottom: 24,
        width,
      };
    }

    const rightSpace = window.innerWidth - (spotlight.left + spotlight.width);
    const leftSpace = spotlight.left;
    const belowSpace = window.innerHeight - (spotlight.top + spotlight.height);
    const aboveSpace = spotlight.top;

    if (rightSpace >= width + margin) {
      return {
        left: spotlight.left + spotlight.width + margin,
        top: Math.max(20, Math.min(spotlight.top, window.innerHeight - 360)),
        width,
      };
    }

    if (leftSpace >= width + margin) {
      return {
        left: spotlight.left - width - margin,
        top: Math.max(20, Math.min(spotlight.top, window.innerHeight - 360)),
        width,
      };
    }

    if (belowSpace >= 330) {
      return {
        left: Math.max(16, Math.min(
          spotlight.left + spotlight.width / 2 - width / 2,
          window.innerWidth - width - 16,
        )),
        top: spotlight.top + spotlight.height + margin,
        width,
      };
    }

    if (aboveSpace >= 330) {
      return {
        left: Math.max(16, Math.min(
          spotlight.left + spotlight.width / 2 - width / 2,
          window.innerWidth - width - 16,
        )),
        bottom: window.innerHeight - spotlight.top + margin,
        width,
      };
    }

    return {
      left: Math.max(16, (window.innerWidth - width) / 2),
      bottom: 24,
      width,
    };
  }, [spotlight]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[110]"
      role="dialog"
      aria-modal="true"
      aria-label="Yönetim hızlı turu"
    >
      {spotlight ? (
        <>
          <div
            className="pointer-events-none fixed rounded-[20px] border-2 border-white/95 shadow-[0_0_0_9999px_rgba(15,23,42,0.50),0_0_0_5px_rgba(255,255,255,0.22)] transition-all duration-300 ease-out"
            style={spotlight}
          />
          <div
            className="pointer-events-none fixed rounded-[20px] ring-2 ring-[#A63D48]/70 ring-offset-2 ring-offset-transparent transition-all duration-300 ease-out"
            style={spotlight}
          />
        </>
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-slate-950/45" />
      )}

      <div
        className="pointer-events-auto fixed rounded-[24px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.28)]"
        style={cardStyle}
      >
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
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
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

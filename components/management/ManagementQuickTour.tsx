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


function TourDemoOverlay({
  step,
  spotlight,
}: {
  step: number;
  spotlight: SpotlightRect | null;
}) {
  if (!spotlight) return null;

  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const inset = 14;
  const left = spotlight.left + inset;
  const top = spotlight.top + inset;
  const width = Math.max(120, spotlight.width - inset * 2);
  const height = Math.max(80, spotlight.height - inset * 2);

  if (step === 0) {
    return (
      <div
        className="pointer-events-none fixed z-[112] rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-[0_16px_45px_rgba(15,23,42,0.18)]"
        style={{
          left: left + 8,
          top: top + 82,
          width: Math.min(220, Math.max(170, width - 16)),
        }}
      >
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
          Örnek ders kartı
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black text-slate-900">Türkçe</p>
              <p className="mt-0.5 text-[8px] font-semibold text-slate-500">5A + 5B · Ortak ders</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700">
              3 uygun yer
            </span>
          </div>
        </div>
        <p className="mt-2 text-[8px] font-semibold leading-4 text-slate-500">
          Havuzda olsaydı bu kartı çizelgeye sürükleyebilirdiniz.
        </p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div
        className="pointer-events-none fixed z-[112]"
        style={{ left, top, width, height }}
      >
        <div className="absolute left-[9%] top-[28%] rounded-xl border border-blue-200 bg-blue-50/95 px-3 py-2 shadow-md">
          <p className="text-[9px] font-black text-blue-900">K. Bale</p>
          <p className="mt-0.5 text-[8px] font-semibold text-blue-600">6A · ×2 ders</p>
        </div>
        <div className="absolute left-[34%] top-[30%] flex items-center gap-2 text-[11px] font-black text-[#A63D48]">
          <span className="rounded-full bg-white/95 px-2 py-1 shadow">Sürükle</span>
          <span className="text-xl">→</span>
          <span className="text-xl">→</span>
        </div>
        <div className="absolute left-[61%] top-[24%] h-[72px] w-[150px] rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-100/85 p-2 shadow-[0_10px_28px_rgba(16,185,129,0.20)]">
          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700">Uygun hedef</p>
          <p className="mt-2 text-[9px] font-black text-emerald-950">Perşembe · 4. ders</p>
          <p className="mt-1 text-[8px] font-semibold text-emerald-700">2 derslik blok burada başlar</p>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div
        className="pointer-events-none fixed z-[112] flex items-center justify-center gap-3"
        style={{ left, top: top + Math.max(30, height * 0.28), width }}
      >
        <div className="w-[145px] rounded-xl border-2 border-emerald-400 bg-emerald-100/95 px-3 py-3 text-center shadow-md">
          <p className="text-[9px] font-black text-emerald-800">✓ Uygun</p>
          <p className="mt-1 text-[8px] font-semibold text-emerald-700">Doğrudan bırakılabilir</p>
        </div>
        <div className="w-[145px] rounded-xl border-2 border-amber-400 bg-amber-100/95 px-3 py-3 text-center shadow-md">
          <p className="text-[9px] font-black text-amber-800">? Bilgi eksik</p>
          <p className="mt-1 text-[8px] font-semibold text-amber-700">Öğretmen/salon seçimi gerekebilir</p>
        </div>
        <div className="w-[145px] rounded-xl border-2 border-rose-300 bg-rose-50/95 px-3 py-3 text-center shadow-md">
          <p className="text-[9px] font-black text-rose-700">× Uygun değil</p>
          <p className="mt-1 text-[8px] font-semibold text-rose-600">Çakışma veya zaman kuralı var</p>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div
        className="pointer-events-none fixed z-[112] rounded-2xl border border-slate-200 bg-white/97 p-3 shadow-[0_16px_45px_rgba(15,23,42,0.20)]"
        style={{
          left: left + Math.max(0, width - Math.min(250, width)),
          top: top + 74,
          width: Math.min(250, width),
        }}
      >
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
          Örnek açıklama
        </p>
        <p className="mt-1 text-[10px] font-black text-slate-900">Neden uygun değil?</p>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
            <span className="text-[8px] font-bold text-slate-600">Öğretmen aynı saatte başka derste</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-slate-500">1</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
            <span className="text-[8px] font-bold text-slate-600">Salon aynı saatte kullanımda</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black text-slate-500">1</span>
          </div>
        </div>
        <p className="mt-2 text-[8px] font-semibold leading-4 text-slate-500">
          Gerçek kartta sistem kendi nedenlerini burada gösterir.
        </p>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div
        className="pointer-events-none fixed z-[112] rounded-xl border border-[#A63D48]/30 bg-white/96 px-3 py-2 shadow-lg"
        style={{
          left: Math.max(12, spotlight.left - 8),
          top: Math.min(viewportHeight - 84, spotlight.top + spotlight.height + 12),
          width: Math.min(280, Math.max(180, spotlight.width + 40)),
        }}
      >
        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-[#A63D48]">
          Güvenli deneme alanı
        </p>
        <p className="mt-1 text-[8px] font-semibold leading-4 text-slate-600">
          Yanlış bir yerleştirmeyi geri alabilir, sonra Yinele ile tekrar uygulayabilirsiniz.
        </p>
      </div>
    );
  }

  return null;
}

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
    const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
    const width = Math.min(520, Math.max(320, viewportWidth - 32));
    const margin = 22;

    if (!spotlight) {
      return {
        left: Math.max(16, (viewportWidth - width) / 2),
        bottom: 24,
        width,
      };
    }

    const rightSpace = viewportWidth - (spotlight.left + spotlight.width);
    const leftSpace = spotlight.left;
    const belowSpace = viewportHeight - (spotlight.top + spotlight.height);
    const aboveSpace = spotlight.top;

    if (rightSpace >= width + margin) {
      return {
        left: spotlight.left + spotlight.width + margin,
        top: Math.max(20, Math.min(spotlight.top, viewportHeight - 360)),
        width,
      };
    }

    if (leftSpace >= width + margin) {
      return {
        left: spotlight.left - width - margin,
        top: Math.max(20, Math.min(spotlight.top, viewportHeight - 360)),
        width,
      };
    }

    if (belowSpace >= 330) {
      return {
        left: Math.max(16, Math.min(
          spotlight.left + spotlight.width / 2 - width / 2,
          viewportWidth - width - 16,
        )),
        top: spotlight.top + spotlight.height + margin,
        width,
      };
    }

    if (aboveSpace >= 330) {
      return {
        left: Math.max(16, Math.min(
          spotlight.left + spotlight.width / 2 - width / 2,
          viewportWidth - width - 16,
        )),
        bottom: viewportHeight - spotlight.top + margin,
        width,
      };
    }

    return {
      left: Math.max(16, (viewportWidth - width) / 2),
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

      <TourDemoOverlay step={step} spotlight={spotlight} />

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

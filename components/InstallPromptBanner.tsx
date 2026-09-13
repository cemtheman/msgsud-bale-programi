'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosModal, setShowIosModal] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(true); // Varsayılan olarak gizli başlat

  useEffect(() => {
    // 1. Zaten PWA olarak (standalone modda) çalışıp çalışmadığını kontrol et
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
    if (isStandalone) {
      queueMicrotask(() => setIsInstalled(true));
      return;
    }

    // 2. Kullanıcı daha önce "Kapat" dediyse tekrar gösterme
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed === 'true') {
      queueMicrotask(() => setIsInstalled(true));
      return;
    }

    queueMicrotask(() => setIsInstalled(false));

    // 3. Android / Chrome için yükleme olayını yakala
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    // Eğer iOS ise özel rehber modalını aç
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    if (isIos) {
      setShowIosModal(true);
      return;
    }

    // Android / Chrome için otomatik yükleme tetikleyicisi
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // Prompt yakalanamadıysa genel bir bilgilendirme yap
      alert('Tarayıcı menüsünden "Ana Ekrana Ekle" veya "Uygulamayı Yükle" seçeneğini kullanabilirsiniz.');
    }
  };

  const handleDismiss = () => {
    setIsInstalled(true);
    localStorage.setItem('pwa_install_dismissed', 'true');
    setShowIosModal(false);
  };

  if (isInstalled) return null;

  return (
    <>
      {/* Üst Bilgi Bantı */}
      <div className="w-full bg-gradient-to-r from-[#D94B55]/15 to-purple-500/15 dark:from-[#D94B55]/25 dark:to-purple-500/25 border border-[#D94B55]/30 rounded-2xl p-3 shadow-sm transition-all animate-fade-in mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl shrink-0">📱</span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
              Uygulamayı Cihazınıza Yükleyin
            </h4>
            <p className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
              Daha hızlı erişim ve tam ekran deneyimi için ana ekrana ekleyin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 text-xs font-bold bg-[#D94B55] text-white rounded-xl hover:bg-[#c03d47] transition-colors shadow-sm"
          >
            Yükle
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            title="Gizle"
          >
            ✕
          </button>
        </div>
      </div>

      {/* iOS Safari Kullanıcıları İçin Adım Adım Rehber Modalı */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-[320px] bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 text-center">
            <div className="w-12 h-12 bg-[#D94B55]/10 text-[#D94B55] rounded-full flex items-center justify-center mx-auto text-2xl">
              📲
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                iPhone / iPad&apos;e Yükleme
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Safari tarayıcısında uygulamayı ana ekranınıza eklemek için şu adımları izleyin:
              </p>
            </div>

            <div className="text-left bg-gray-50 dark:bg-white/5 p-3 rounded-2xl space-y-2 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#D94B55]">1.</span>
                <span>Tarayıcının altındaki <b>Paylaş</b> simgesine dokunun <span className="text-base">⎋</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#D94B55]">2.</span>
                <span>Listeden <b>&quot;Ana Ekrana Ekle&quot;</b> seçeneğini bulun ➕</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#D94B55]">3.</span>
                <span>Sağ üst köşeden <b>Ekle</b> butonuna basın ✓</span>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#D94B55] text-white hover:bg-[#c03d47] transition-colors"
            >
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
}

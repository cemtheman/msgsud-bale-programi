'use client';

import { useEffect, useRef, useState } from 'react';

export function PwaUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const isReloading = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let active = true;

    const revealWaitingWorker = (worker: ServiceWorker | null) => {
      if (active && worker && navigator.serviceWorker.controller) {
        setWaitingWorker(worker);
      }
    };

    const watchRegistration = (current: ServiceWorkerRegistration) => {
      revealWaitingWorker(current.waiting);

      current.addEventListener('updatefound', () => {
        const installing = current.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') revealWaitingWorker(current.waiting ?? installing);
        });
      });
    };

    void navigator.serviceWorker.ready.then((current) => {
      if (!active) return;
      watchRegistration(current);
      void current.update().catch(() => undefined);
    });

    const handleControllerChange = () => {
      if (isReloading.current) return;
      isReloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div className="mb-3.5 flex items-center justify-between gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm dark:bg-indigo-400/10">
      <div>
        <p className="font-extrabold text-gray-900 dark:text-white">Yeni sürüm hazır</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Güncelleyerek son değişiklikleri kullanın.</p>
      </div>
      <button
        type="button"
        onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
        className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
      >
        Güncelle
      </button>
    </div>
  );
}

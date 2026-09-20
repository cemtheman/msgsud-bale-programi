'use client';

import { useState, useEffect, useRef } from 'react';

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const PULL_THRESHOLD = 70; // Yenileme için gereken çekme mesafesi (px)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Yönetim çalışma alanı yatay sürükle-bırak için ayrılmıştır.
      // Global pull-to-refresh burada gesture yakalamamalı.
      if (window.location.pathname.startsWith('/yonetim')) {
        setStartY(0);
        setPullDistance(0);
        return;
      }

      // Sadece sayfa en tepedeyken çekme hareketini dinle
      if (window.scrollY === 0) {
        setStartY(e.touches[0].clientY);
      } else {
        setStartY(0);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY === 0 || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY;

      if (distance > 0 && window.scrollY === 0) {
        // Yumuşak çekme direnci
        setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(PULL_THRESHOLD);

        // Sayfayı yenile
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullDistance(0);
      }
      setStartY(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [startY, pullDistance, isRefreshing]);

  return (
    <div ref={containerRef} className="relative min-h-full">
      {/* Çekince Beliren Yenileme İkonu */}
      {(pullDistance > 0 || isRefreshing) && (
        <div 
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-9 h-9 bg-white dark:bg-[#2C2C2E] rounded-full shadow-lg border border-black/5 dark:border-white/10 transition-transform duration-75"
          style={{
            transform: `translate(-50%, ${pullDistance}px) rotate(${pullDistance * 3}deg)`,
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          }}
        >
          <span className={`text-sm ${isRefreshing ? 'animate-spin' : ''}`}>
            🔄
          </span>
        </div>
      )}

      {children}
    </div>
  );
}
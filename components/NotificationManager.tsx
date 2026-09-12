'use client';

import { useEffect } from 'react';
import { SpecialEvent } from '@/data/eventsData';

export function NotificationManager() {
  useEffect(() => {
    const checkDailyEvents = async () => {
      // 1. Bildirim izni kontrolü
      const notificationsEnabled = localStorage.getItem('notifications_enabled') === 'true';
      if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

      const localData = localStorage.getItem('custom_events');
      if (!localData) return;

      const customEvents: SpecialEvent[] = JSON.parse(localData);
      
      // 2. Bugünün tarihini YYYY-MM-DD olarak al
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayDate = `${year}-${month}-${day}`;

      // 3. Bugün için bu bildirim daha önce gösterildi mi? (Günde sadece 1 kez göstermek için)
      const lastNotifiedDate = localStorage.getItem('last_notified_date');
      if (lastNotifiedDate === todayDate) return;

      // 4. Bugünün tarihine ait özel etkinlikleri bul
      const todaysEvents = customEvents.filter((event) => event.date === todayDate);

      if (todaysEvents.length > 0) {
        // İlk etkinliği veya özet bilgiyi göster
        const event = todaysEvents[0];
        
        new Notification(`🎭 Bugün Özel Etkinliğiniz Var: ${event.title}`, {
          body: `${event.time ? `Saat: ${event.time} ` : ''}${event.location ? `- Konum: ${event.location}` : ''}\n${event.description || ''}`,
          icon: '/icon-512.png',
        });

        // Bugün için bildirimin gönderildiğini kaydet ki uygulama her sekme değiştirdiğinde tekrar spam atmasın
        localStorage.setItem('last_notified_date', todayDate);
      }
    };

    // Uygulama açıldığında (veya herhangi bir sekmeden ana sayfaya dönüldüğünde) kontrol et
    checkDailyEvents();
  }, []);

  return null;
}
'use client';

import { useEffect } from 'react';
import { SpecialEvent } from '@/data/eventsData';

export function NotificationManager() {
  useEffect(() => {
    const checkEvents = () => {
      // Bildirim izni yoksa hiç çalışma
      const notificationsEnabled = localStorage.getItem('notifications_enabled') === 'true';
      if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

      const localData = localStorage.getItem('custom_events');
      if (!localData) return;

      const customEvents: SpecialEvent[] = JSON.parse(localData);
      
      const now = new Date();
      // Tarihi YYYY-MM-DD formatında al
      const todayDate = now.toLocaleDateString('tr-TR').split('.').reverse().join('-');
      // Saati HH:MM formatında al
      const currentTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      // Aynı bildirimi saniyede bir tekrar tekrar atmamak için "bildirilenler" listesini tutuyoruz
      const notifiedEvents: string[] = JSON.parse(localStorage.getItem('notified_events') || '[]');
      let updated = false;

      customEvents.forEach((event) => {
        // Etkinliğin tarihi bugünse, saati şu anki saate eşitse ve daha önce bildirim atılmadıysa
        if (event.date === todayDate && event.time === currentTime && !notifiedEvents.includes(event.id)) {
          
          new Notification(`🎭 Etkinlik Vakti: ${event.title}`, {
            body: event.description || `Saat: ${event.time} ${event.location ? `- Konum: ${event.location}` : ''}`,
            icon: '/icon-512.png',
          });

          notifiedEvents.push(event.id);
          updated = true;
        }
      });

      // Yeni atılan bildirimleri kaydet
      if (updated) {
        localStorage.setItem('notified_events', JSON.stringify(notifiedEvents));
      }
    };

    // Her 1 dakikada bir (60000ms) saat kontrolü yap
    const interval = setInterval(checkEvents, 60000);
    
    // Uygulama ilk açıldığında da bir kez kontrol et
    checkEvents();

    return () => clearInterval(interval);
  }, []);

  return null; // Ekranda hiçbir şey render etmez
}
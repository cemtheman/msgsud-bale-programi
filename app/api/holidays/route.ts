import { NextResponse } from 'next/server';

const holidayNameMap: Record<string, string> = {
  'New Year\'s Day': 'Yılbaşı',
  'Republic Day Eve (half-day)': 'Cumhuriyet Bayramı Arifesi (Yarım Gün)',
  'Republic Day Eve': 'Cumhuriyet Bayramı Arifesi',
  'Republic Day': 'Cumhuriyet Bayramı',
  'Atatürk Commemoration Day': 'Atatürk\'ü Anma Günü',
  'National Sovereignty and Children\'s Day': 'Ulusal Egemenlik ve Çocuk Bayramı',
  'Labor and Solidarity Day': 'Emek ve Dayanışma Günü',
  'Commemoration of Atatürk, Youth and Sports Day': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  'Democracy and National Unity Day': 'Demokrasi ve Millî Birlik Günü',
  'Victory Day': 'Zafer Bayramı',
  'Ramadan Feast Eve (half-day)': 'Ramazan Bayramı Arifesi',
  'Ramadan Feast': 'Ramazan Bayramı',
  'Sacrifice Feast Eve (half-day)': 'Kurban Bayramı Arifesi',
  'Sacrifice Feast': 'Kurban Bayramı',
};

// Resmî tatil OLMAYAN anma ve özel günler listesi
const nonHolidayEvents = [
  'Atatürk\'ü Anma Günü',
  'Atatürk Commemoration Day',
];

export async function GET() {
  try {
    const calendarUrl = 'https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics';
    
    const response = await fetch(calendarUrl, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      throw new Error('Google Takvim verisi alınamadı');
    }

    const icsText = await response.text();
    const holidays = parseICS(icsText);

    return NextResponse.json(holidays);
  } catch (error) {
    console.error('Holidays Fetch Error:', error);
    return NextResponse.json({ error: 'Takvim verisi çekilemedi' }, { status: 500 });
  }
}

function parseICS(icsData: string) {
  const events = [];
  const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 90);

  while ((match = eventRegex.exec(icsData)) !== null) {
    const eventContent = match[1];
    
    const summaryMatch = eventContent.match(/SUMMARY:(.*)/);
    const dtstartMatch = eventContent.match(/DTSTART;VALUE=DATE:(\d{8})/);

    if (summaryMatch && dtstartMatch) {
      const rawSummary = summaryMatch[1].trim();
      const rawDate = dtstartMatch[1];
      
      const year = parseInt(rawDate.slice(0, 4), 10);
      const month = parseInt(rawDate.slice(4, 6), 10) - 1;
      const day = parseInt(rawDate.slice(6, 8), 10);

      const eventDate = new Date(year, month, day);

      if (eventDate >= today && eventDate <= maxDate) {
        const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const title = holidayNameMap[rawSummary] || rawSummary;

        // Resmî tatil mi yoksa Anma Günü mü kontrol et
        const isCommemoration = nonHolidayEvents.some(
          (name) => rawSummary.includes(name) || title.includes(name)
        );

        events.push({
          id: `google-hol-${rawDate}-${title}`,
          title,
          date: formattedDate,
          type: isCommemoration ? 'commemoration' : 'holiday',
        });
      }
    }
  }

  return events;
}
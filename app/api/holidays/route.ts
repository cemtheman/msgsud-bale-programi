import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const calendarUrl = 'https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics';
    const response = await fetch(calendarUrl, {
      next: { revalidate: 86400 } // 24 saat önbellek
    });

    if (!response.ok) {
      throw new Error('Google Takvim verisi alınamadı');
    }

    const icsText = await response.text();
    const holidays = parseICS(icsText);

    return NextResponse.json(holidays);
  } catch (error) {
    console.error('Holidays Fetch Error:', error);
    return NextResponse.json({ error: 'Tatil takvimi çekilemedi' }, { status: 500 });
  }
}

function parseICS(icsData: string) {
  const events = [];
  const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sadece bugünden itibaren önümüzdeki 60 gün içerisindeki tatilleri al
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 60);

  while ((match = eventRegex.exec(icsData)) !== null) {
    const eventContent = match[1];
    
    const summaryMatch = eventContent.match(/SUMMARY:(.*)/);
    const dtstartMatch = eventContent.match(/DTSTART;VALUE=DATE:(\d{8})/);

    if (summaryMatch && dtstartMatch) {
      const summary = summaryMatch[1].trim();
      const rawDate = dtstartMatch[1]; // YYYYMMDD
      
      const year = parseInt(rawDate.slice(0, 4), 10);
      const month = parseInt(rawDate.slice(4, 6), 10) - 1;
      const day = parseInt(rawDate.slice(6, 8), 10);

      const eventDate = new Date(year, month, day);

      // Sadece bugünden geleceğe doğru ve 60 gün içindekileri filtrele
      if (eventDate >= today && eventDate <= maxDate) {
        const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        events.push({
          id: `google-hol-${rawDate}-${summary}`,
          title: summary,
          date: formattedDate,
          type: 'holiday',
        });
      }
    }
  }

  return events;
}
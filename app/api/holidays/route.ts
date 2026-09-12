import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Google Resmi Türkiye Tatilleri Public iCal URL'si
    const calendarUrl = 'https://calendar.google.com/calendar/ical/en.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics';
    
    const response = await fetch(calendarUrl, {
      next: { revalidate: 86400 } // Veriyi 24 saatte bir önbellekler (Cache)
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

// Basit ICS Metin Ayıklayıcı (Parser)
function parseICS(icsData: string) {
  const events = [];
  const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = eventRegex.exec(icsData)) !== null) {
    const eventContent = match[1];
    
    const summaryMatch = eventContent.match(/SUMMARY:(.*)/);
    const dtstartMatch = eventContent.match(/DTSTART;VALUE=DATE:(\d{8})/);

    if (summaryMatch && dtstartMatch) {
      const summary = summaryMatch[1].trim();
      const rawDate = dtstartMatch[1]; // YYYYMMDD
      
      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;

      events.push({
        id: `google-hol-${rawDate}-${summary}`,
        title: summary,
        date: formattedDate,
        type: 'holiday',
      });
    }
  }

  return events;
}
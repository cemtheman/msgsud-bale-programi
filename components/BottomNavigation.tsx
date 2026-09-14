'use client';

interface BottomNavigationProps {
  activeTab: 'today' | 'weekly' | 'events';
  setActiveTab: (tab: 'today' | 'weekly' | 'events') => void;
}

function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3m10-3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h3v3H8z" />
    </svg>
  );
}

function WeeklyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3m10-3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5 14.5 9l6 .6-4.5 4 1.3 5.9-5.3-3-5.3 3L8 13.6l-4.5-4 6-.6L12 3.5Z" />
    </svg>
  );
}

export function BottomNavigation({ activeTab, setActiveTab }: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-safe bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md border-t border-black/5 dark:border-white/10">
      <div className="w-full max-w-[480px] flex justify-around items-center h-16 px-4">
        {/* Bugün Sekmesi */}
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          aria-label="Bugün"
          aria-current={activeTab === 'today' ? 'page' : undefined}
          className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
            activeTab === 'today'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <TodayIcon />
          <span className="text-[10px] font-bold">Bugün</span>
        </button>

        {/* Haftalık Sekmesi */}
        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          aria-label="Haftalık program"
          aria-current={activeTab === 'weekly' ? 'page' : undefined}
          className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
            activeTab === 'weekly'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <WeeklyIcon />
          <span className="text-[10px] font-bold">Haftalık</span>
        </button>

        {/* Etkinlikler Sekmesi */}
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          aria-label="Etkinlikler"
          aria-current={activeTab === 'events' ? 'page' : undefined}
          className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
            activeTab === 'events'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <EventsIcon />
          <span className="text-[10px] font-bold">Etkinlikler</span>
        </button>
      </div>
    </div>
  );
}

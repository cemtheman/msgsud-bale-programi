'use client';

interface BottomNavigationProps {
  activeTab: 'today' | 'weekly' | 'events';
  setActiveTab: (tab: 'today' | 'weekly' | 'events') => void;
  mode?: 'student' | 'teacher';
  onToggleMode?: () => void;
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

export function BottomNavigation({
  activeTab,
  setActiveTab,
  mode = 'student',
  onToggleMode,
}: BottomNavigationProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex h-[4.25rem] w-full max-w-[456px] items-center justify-around rounded-[1.75rem] border border-white/70 bg-white/[0.72] px-2 shadow-[0_10px_35px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-white/[0.12] dark:bg-[#242426]/[0.72] dark:shadow-[0_10px_35px_rgba(0,0,0,0.35)]">
        {/* Bugün Sekmesi */}
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          aria-label="Bugün"
          aria-current={activeTab === 'today' ? 'page' : undefined}
          className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-2xl transition-[color,background-color,transform] duration-200 active:scale-[0.97] ${
            activeTab === 'today'
              ? 'bg-white/80 text-[#D94B55] shadow-sm dark:bg-white/10'
              : 'text-gray-400 hover:bg-white/45 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300'
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
          className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-2xl transition-[color,background-color,transform] duration-200 active:scale-[0.97] ${
            activeTab === 'weekly'
              ? 'bg-white/80 text-[#D94B55] shadow-sm dark:bg-white/10'
              : 'text-gray-400 hover:bg-white/45 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300'
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
          className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-2xl transition-[color,background-color,transform] duration-200 active:scale-[0.97] ${
            activeTab === 'events'
              ? 'bg-white/80 text-[#D94B55] shadow-sm dark:bg-white/10'
              : 'text-gray-400 hover:bg-white/45 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300'
          }`}
        >
          <EventsIcon />
          <span className="text-[10px] font-bold">Etkinlikler</span>
        </button>
        {onToggleMode && (
          <button
            type="button"
            onClick={onToggleMode}
            aria-label={mode === 'student' ? 'Öğretmen moduna geç' : 'Öğrenci / veli moduna geç'}
            aria-pressed={mode === 'teacher'}
            className={`flex min-h-12 min-w-20 flex-col items-center justify-center gap-1 rounded-2xl transition-[color,background-color,transform] duration-200 active:scale-[0.97] ${
              mode === 'teacher'
                ? 'bg-white/80 text-[#D94B55] shadow-sm dark:bg-white/10'
                : 'text-gray-400 hover:bg-white/45 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {mode === 'student' ? '🧑‍🏫' : '🎒'}
            </span>
            <span className="text-[10px] font-bold">
              {mode === 'student' ? 'Öğretmen' : 'Öğrenci'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

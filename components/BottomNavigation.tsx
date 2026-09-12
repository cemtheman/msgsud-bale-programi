'use client';

interface BottomNavigationProps {
  activeTab: 'today' | 'weekly' | 'events';
  setActiveTab: (tab: 'today' | 'weekly' | 'events') => void;
}

export function BottomNavigation({ activeTab, setActiveTab }: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-safe bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md border-t border-black/5 dark:border-white/10">
      <div className="w-full max-w-[480px] flex justify-around items-center h-16 px-4">
        {/* Bugün Sekmesi */}
        <button
          onClick={() => setActiveTab('today')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'today'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <span className="text-xl">📅</span>
          <span className="text-[10px] font-bold">Bugün</span>
        </button>

        {/* Haftalık Sekmesi */}
        <button
          onClick={() => setActiveTab('weekly')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'weekly'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <span className="text-xl">🗓️</span>
          <span className="text-[10px] font-bold">Haftalık</span>
        </button>

        {/* Etkinlikler Sekmesi */}
        <button
          onClick={() => setActiveTab('events')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'events'
              ? 'text-[#D94B55]'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <span className="text-xl">🎭</span>
          <span className="text-[10px] font-bold">Etkinlikler</span>
        </button>
      </div>
    </div>
  );
}
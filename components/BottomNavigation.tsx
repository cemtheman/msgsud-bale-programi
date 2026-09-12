interface BottomNavigationProps {
  activeTab: 'today' | 'weekly';
  onTabChange: (tab: 'today' | 'weekly') => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#1C1C1E]/90 backdrop-blur-md border-t border-black/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] shadow-lg transition-colors">
      <div className="max-w-[480px] mx-auto flex justify-around py-2">
        <button
          onClick={() => onTabChange('today')}
          className={`flex-1 flex flex-col items-center py-1 text-xs font-bold transition-colors ${
            activeTab === 'today' ? 'text-[#D94B55]' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <span className="text-lg">📅</span>
          <span>Bugün</span>
        </button>

        <button
          onClick={() => onTabChange('weekly')}
          className={`flex-1 flex flex-col items-center py-1 text-xs font-bold transition-colors ${
            activeTab === 'weekly' ? 'text-[#D94B55]' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <span className="text-lg">🗓️</span>
          <span>Haftalık</span>
        </button>
      </div>
    </nav>
  );
}
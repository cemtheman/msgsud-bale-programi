'use client';

import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
  formattedDate: string;
  formattedTime: string;
}

export function Header({ formattedDate, formattedTime }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex justify-between items-center gap-2 w-full">
      <div className="min-w-0 flex-1">
        <h1 
          className="text-lg sm:text-xl font-black tracking-tight truncate"
          style={{ color: isDark ? '#FFFFFF' : '#111827' }}
        >
          {formattedDate}
        </h1>
        <p className="text-[11px] font-semibold text-gray-400 truncate">
          MSGSÜ Bale Programı
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-gray-200/60 dark:bg-white/10 text-xs transition-transform active:scale-95"
          aria-label="Tema Değiştir"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <span 
          className="text-lg sm:text-xl font-black tracking-tight"
          style={{ color: isDark ? '#FFFFFF' : '#111827' }}
        >
          {formattedTime}
        </span>
      </div>
    </div>
  );
}
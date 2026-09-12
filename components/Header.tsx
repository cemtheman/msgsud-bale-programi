'use client';

import { useTheme } from '@/hooks/useTheme';

interface HeaderProps {
  formattedDate: string;
  formattedTime: string;
}

export function Header({ formattedDate, formattedTime }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex justify-between items-start">
      <div>
        <h1 className="text-xl font-black tracking-tight text-gray-900 dark:!text-white">
          {formattedDate}
        </h1>
        <p className="text-xs font-semibold text-gray-400 dark:!text-gray-400">
          MSGSÜ Bale Programı
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-gray-200/60 dark:bg-white/10 text-xs transition-transform active:scale-95"
          aria-label="Tema Değiştir"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <span className="text-xl font-black tracking-tight text-gray-900 dark:!text-white">
          {formattedTime}
        </span>
      </div>
    </div>
  );
}
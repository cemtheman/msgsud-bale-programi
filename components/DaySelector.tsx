import { DayKey } from '@/types/schedule';
import { DAYS_ORDER, SHORT_DAY_LABELS } from '@/utils/time';

interface DaySelectorProps {
  selectedDay: DayKey;
  todayDayKey: DayKey;
  onSelectDay: (day: DayKey) => void;
}

export function DaySelector({ selectedDay, todayDayKey, onSelectDay }: DaySelectorProps) {
  return (
    <div className="flex gap-1.5 p-1 bg-gray-200/60 rounded-xl overflow-x-auto no-scrollbar">
      {DAYS_ORDER.slice(0, 5).map((dayKey) => {
        const isSelected = selectedDay === dayKey;
        const isToday = todayDayKey === dayKey;

        return (
          <button
            key={dayKey}
            onClick={() => onSelectDay(dayKey)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all relative ${
              isSelected
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {SHORT_DAY_LABELS[dayKey]}
            {isToday && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#D94B55] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
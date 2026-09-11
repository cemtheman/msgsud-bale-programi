import { useState } from 'react';
import { DayKey, Lesson } from '@/types/schedule';
import { DaySelector } from './DaySelector';
import { LessonCard } from './LessonCard';
import { getLessonsForDay } from '@/utils/schedule';

interface WeeklyPageProps {
  todayDayKey: DayKey;
  onSelectLesson: (lesson: Lesson) => void;
}

export function WeeklyPage({ todayDayKey, onSelectLesson }: WeeklyPageProps) {
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayDayKey);

  const lessons = getLessonsForDay(selectedDay);

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900">Haftalık Program</h1>

      <DaySelector
        selectedDay={selectedDay}
        todayDayKey={todayDayKey}
        onSelectDay={setSelectedDay}
      />

      <div className="space-y-2.5 pt-2">
        {lessons.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm font-medium">
            Seçilen günde ders bulunmuyor.
          </div>
        ) : (
          lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onClick={() => onSelectLesson(lesson)}
            />
          ))
        )}
      </div>
    </div>
  );
}
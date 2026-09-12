'use client';

import { ComputedStatus, Lesson } from '@/types/schedule';
import { LessonCard } from './LessonCard';
import { Header } from './Header';
import { EventsSection } from './EventsSection';

interface TodayPageProps {
  formattedDate: string;
  formattedTime: string;
  status: ComputedStatus;
  todayLessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenTimeline: () => void;
}

export function TodayPage({
  formattedDate,
  formattedTime,
  status,
  todayLessons,
  currentMinutes,
  onSelectLesson,
  onOpenTimeline,
}: TodayPageProps) {
  return (
    <div className="space-y-6">
      {/* Üst Header */}
      <Header formattedDate={formattedDate} formattedTime={formattedTime} />

      {/* Durum Kartı (Inline Status Card) */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 border border-black/5 dark:border-white/10 shadow-sm transition-colors">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-widest mb-1">
          PROGRAMA GÖRE
        </p>
        
        {status.type === 'no_school' && (
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">BUGÜN DERS YOK</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                Sıradaki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLessonDayLabel})
              </p>
            )}
          </div>
        )}

        {status.type === 'before_school' && (
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">DERSLER Henüz Başlamadı</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                İlk ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
              </p>
            )}
          </div>
        )}

        {status.type === 'in_lesson' && status.currentLesson && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="inline-block px-2.5 py-1 bg-[#D94B55]/10 text-[#D94B55] text-[11px] font-extrabold rounded-full">
                DERSTESİNİZ
              </span>
              <span className="text-xs font-bold text-gray-400">
                %{status.progressPercent} Tamamlandı
              </span>
            </div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">
              {status.currentLesson.subject}
            </h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
              Bitiş: {status.currentLesson.end} ({status.minutesRemaining} dk kaldı)
            </p>
            
            {/* İlerleme Çubuğu */}
            <div className="w-full h-2 bg-gray-100 dark:bg-white/10 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-[#D94B55] rounded-full transition-all duration-500" 
                style={{ width: `${status.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {status.type === 'break' && (
          <div>
            <span className="inline-block px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-extrabold rounded-full mb-2">
              TENEFFÜS
            </span>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Teneffüstesiniz</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                Sonraki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
              </p>
            )}
          </div>
        )}

        {status.type === 'lunch' && (
          <div>
            <span className="inline-block px-2.5 py-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-extrabold rounded-full mb-2">
              YEMEK ARASI
            </span>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Yemek Arasındasınız</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                Sonraki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
              </p>
            )}
          </div>
        )}

        {status.type === 'free_time' && (
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">ŞU ANDA DERS YOK</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                Sonraki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
              </p>
            )}
          </div>
        )}

        {status.type === 'finished' && (
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">BUGÜNÜN DERSLERİ BİTTİ</h2>
            {status.nextLesson && (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                Sıradaki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLessonDayLabel})
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bugünün Programı Listesi */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Bugünün Programı
        </h2>

        {todayLessons.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
            Bugün için kayıtlı ders bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {todayLessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                currentMinutes={currentMinutes}
                onClick={() => onSelectLesson(lesson)}
              />
            ))}
          </div>
        )}

        {todayLessons.length > 0 && (
          <button
            onClick={onOpenTimeline}
            className="w-full py-3 mt-2 bg-white dark:bg-[#1C1C1E] border border-black/5 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252525] transition-all shadow-sm"
          >
            Canlı Zaman Çizelgesi →
          </button>
        )}
      </div>
    <EventsSection />
    </div>
  );
}
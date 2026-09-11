import { ComputedStatus } from '@/types/schedule';
import { formatMinutesToDuration } from '@/utils/time';
import { getSubjectCategory } from '@/utils/schedule';

interface CurrentStatusCardProps {
  status: ComputedStatus;
  onSelectLesson: (lesson: any) => void;
}

export function CurrentStatusCard({ status, onSelectLesson }: CurrentStatusCardProps) {
  return (
    <div className="w-full bg-white border border-black/10 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="text-[11px] font-bold tracking-widest text-black/40 uppercase">
        PROGRAMA GÖRE
      </div>

      {/* 1. AKTİF DERS */}
      {status.type === 'in_lesson' && status.currentLesson && (
        <div className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">
              {status.currentLesson.subject}
            </h2>
            <div className="text-sm font-medium text-gray-500 mt-0.5">
              {status.currentLesson.start} — {status.currentLesson.end}
              {status.currentLesson.location && ` · ${status.currentLesson.location}`}
            </div>
            {status.currentLesson.teacher && (
              <div className="text-xs text-gray-400 mt-0.5">{status.currentLesson.teacher}</div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-[#D94B55] h-full transition-all duration-500 rounded-full"
                style={{ width: `${status.progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-semibold text-gray-600">
              <span>{status.minutesPassed} dk geçti</span>
              <span>{status.minutesRemaining} dk kaldı</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. TENEFFÜS */}
      {status.type === 'break' && (
        <div className="space-y-2">
          <div className="text-xl font-bold text-gray-800">TENEFFÜS</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              Sonraki ders: <span className="font-semibold">{status.nextLesson.subject}</span> · {status.nextLesson.start}
            </div>
          )}
          <div className="text-xs font-medium text-[#D94B55]">
            {status.minutesUntilNext} dk sonra
          </div>
        </div>
      )}

      {/* 3. YEMEK ARASI */}
      {status.type === 'lunch' && (
        <div className="space-y-2">
          <div className="text-xl font-bold text-amber-800">YEMEK ARASI</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              Sonraki ders: <span className="font-semibold">{status.nextLesson.subject}</span> · {status.nextLesson.start}
            </div>
          )}
          <div className="text-xs font-medium text-amber-700">
            {formatMinutesToDuration(status.minutesUntilNext || 0)} sonra
          </div>
        </div>
      )}

      {/* 4. ŞU ANDA DERS YOK (UZUN BOŞLUK) */}
      {status.type === 'free_time' && (
        <div className="space-y-2">
          <div className="text-xl font-bold text-gray-700">ŞU ANDA DERS YOK</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              Sonraki ders: <span className="font-semibold">{status.nextLesson.subject}</span> · {status.nextLesson.start}
            </div>
          )}
          {status.minutesUntilNext && (
            <div className="text-xs font-medium text-gray-500">
              {formatMinutesToDuration(status.minutesUntilNext)} sonra
            </div>
          )}
        </div>
      )}

      {/* 5. İLK DERS ÖNCESİ */}
      {status.type === 'before_school' && (
        <div className="space-y-2">
          <div className="text-lg font-bold text-gray-800">BUGÜNKÜ DERSLER HENÜZ BAŞLAMADI</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              İlk ders: <span className="font-semibold">{status.nextLesson.subject}</span> · {status.nextLesson.start}
            </div>
          )}
        </div>
      )}

      {/* 6. SON DERS SONRASI */}
      {status.type === 'finished' && (
        <div className="space-y-2">
          <div className="text-lg font-bold text-gray-800">BUGÜNKÜ DERSLER TAMAMLANDI</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              {status.nextLessonDayLabel || 'Sıradaki'} ilk ders: <span className="font-semibold">{status.nextLesson.subject}</span> · {status.nextLesson.start}
            </div>
          )}
        </div>
      )}

      {/* 7. HAFTA SONU / DERS OLMAYAN GÜN */}
      {status.type === 'no_school' && (
        <div className="space-y-2">
          <div className="text-lg font-bold text-gray-800">BUGÜN DERS YOK</div>
          {status.nextLesson && (
            <div className="text-sm text-gray-600">
              Sıradaki ders: <span className="font-semibold">{status.nextLesson.subject}</span> ({status.nextLessonDayLabel})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
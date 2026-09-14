import type { ClassCode } from '@/types/schedule';

const CLASS_CODES: ClassCode[] = [
  '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
  '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];

interface ClassSelectorProps {
  value: ClassCode;
  onChange: (value: ClassCode) => void;
}

export function ClassSelector({ value, onChange }: ClassSelectorProps) {
  return (
    <label className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white/85 py-1.5 pl-3 pr-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#1C1C1E]/85">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Sınıf</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ClassCode)}
        aria-label="Sınıf seçimi"
        className="min-h-8 rounded-xl bg-gray-100 px-2.5 text-sm font-extrabold text-gray-900 outline-none dark:bg-white/10 dark:text-white"
      >
        {CLASS_CODES.map((classCode) => (
          <option key={classCode} value={classCode}>{classCode}</option>
        ))}
      </select>
    </label>
  );
}


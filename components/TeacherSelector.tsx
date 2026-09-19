interface TeacherSelectorProps {
  value: string;
  teachers: string[];
  onChange: (value: string) => void;
  loading?: boolean;
}

export function TeacherSelector({
  value,
  teachers,
  onChange,
  loading = false,
}: TeacherSelectorProps) {
  return (
    <label className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-black/5 bg-white/85 py-1.5 pl-3 pr-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#1C1C1E]/85">
      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Öğretmen</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Öğretmen seçimi"
        disabled={loading || teachers.length === 0}
        className="min-h-8 min-w-0 max-w-[220px] rounded-xl bg-gray-100 px-2.5 text-sm font-extrabold text-gray-900 outline-none disabled:opacity-60 dark:bg-[#2C2C2E] dark:text-white dark:[color-scheme:dark]"
      >
        {teachers.length === 0 ? (
          <option value="">{loading ? 'Yükleniyor…' : 'Öğretmen bulunamadı'}</option>
        ) : (
          teachers.map((teacher) => (
            <option
              key={teacher}
              value={teacher}
              className="bg-white text-gray-900 dark:bg-[#2C2C2E] dark:text-white"
            >
              {teacher}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

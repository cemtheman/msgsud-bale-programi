'use client';

export function ManagementBusyOverlay({
  detail,
}: {
  detail: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[230px] flex-col items-center rounded-3xl border border-white/70 bg-white/95 px-7 py-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-1 rounded-full border border-slate-200" />
          <svg
            viewBox="0 0 80 80"
            className="h-16 w-16 animate-spin text-[#A63D48]"
            aria-hidden="true"
          >
            <circle cx="40" cy="15" r="6" fill="currentColor" />
            <path
              d="M40 22 C37 29 36 35 38 42 C39 46 38 51 35 56"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M38 29 C28 30 21 27 15 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M39 29 C50 28 59 22 64 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M35 39 C29 42 27 47 26 52 C34 55 46 55 54 51 C52 46 47 42 42 39 Z"
              fill="currentColor"
              opacity="0.88"
            />
            <path
              d="M36 54 C29 61 24 67 18 71"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M39 54 C46 60 52 66 61 70"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M17 71 L12 72"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M61 70 L67 70"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="mt-3 text-sm font-bold text-slate-900">
          İşlem devam ediyor…
        </p>
        <p className="mt-1 max-w-[260px] text-[11px] font-medium leading-5 text-slate-500">
          {detail}
        </p>
      </div>
    </div>
  );
}

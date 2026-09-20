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
      <div className="flex min-w-[260px] flex-col items-center rounded-[30px] border border-white/80 bg-white/95 px-8 py-7 text-center shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="management-music-box" aria-hidden="true">
          <div className="management-music-box-glow" />

          <div className="management-music-box-ballerina">
            <svg
              viewBox="0 0 90 118"
              className="h-[92px] w-[70px] text-[#A63D48]"
            >
              <circle cx="45" cy="14" r="7" fill="currentColor" />
              <path
                d="M45 22 C42 31 41 41 43 52 C44 58 43 64 40 70"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M43 32 C31 35 22 31 15 23"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M45 32 C57 31 67 24 73 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M40 49 C32 54 28 61 27 68 C38 73 55 73 66 67 C63 59 57 53 49 49 Z"
                fill="currentColor"
                opacity="0.9"
              />
              <path
                d="M42 70 C35 82 30 94 25 107"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M44 70 C49 82 55 93 66 102"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M24 107 L18 110"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M66 102 L72 104"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="management-music-box-stem" />

          <div className="management-music-box-base">
            <div className="management-music-box-disc" />
            <div className="management-music-box-base-front">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold text-slate-900">
          İşlem devam ediyor…
        </p>
        <p className="mt-1.5 max-w-[290px] text-[11px] font-medium leading-5 text-slate-500">
          {detail}
        </p>
      </div>
    </div>
  );
}

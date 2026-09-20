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
      <div className="flex min-w-[260px] flex-col items-center rounded-[28px] border border-white/80 bg-white/95 px-8 py-7 text-center shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="management-music-box" aria-hidden="true">
          <div className="management-music-box-glow" />

          <div className="management-music-box-ballerina">
            <svg
              viewBox="0 0 96 126"
              className="h-[96px] w-[72px] text-[#A63D48]"
            >
              <circle cx="48" cy="15" r="7" fill="currentColor" />
              <path
                d="M48 23 C45 32 44 43 46 54 C47 60 46 66 43 72"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M46 33 C34 35 25 31 18 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M48 33 C59 31 68 25 76 17"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M43 51 C34 56 30 63 29 70 C40 75 56 75 68 69 C65 61 58 55 51 51 Z"
                fill="currentColor"
                opacity="0.92"
              />
              <path
                d="M45 72 C39 84 34 96 30 112"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M47 72 C53 83 60 94 72 103"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M29 112 L23 115"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M72 103 L78 104"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="management-music-box-stem" />

          <div className="management-music-box-base">
            <div className="management-music-box-disc">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="management-music-box-base-front">
              <i />
              <span />
              <i />
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

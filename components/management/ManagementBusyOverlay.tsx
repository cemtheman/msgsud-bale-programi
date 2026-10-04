'use client';

export function ManagementBusyOverlay({
  detail,
  title = 'İşlem devam ediyor…',
  steps,
  activeStep = 0,
}: {
  detail: string;
  title?: string;
  steps?: string[];
  activeStep?: number;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[300px] max-w-[420px] flex-col items-center rounded-[28px] border border-white/80 bg-white/95 px-8 py-7 text-center shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="management-busy-mark" aria-hidden="true">
          <div className="management-busy-ring" />
          <div className="management-busy-dot" />

          <svg
            viewBox="0 0 96 126"
            className="management-busy-ballerina h-[78px] w-[58px] text-[#A63D48]"
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
          </svg>
        </div>

        <p className="mt-4 text-sm font-bold text-slate-900">
          {title}
        </p>
        <p className="mt-1.5 max-w-[330px] text-[11px] font-medium leading-5 text-slate-500">
          {detail}
        </p>

        {steps && steps.length > 0 && (
          <div className="mt-5 w-full rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-left">
            <div className="space-y-2">
              {steps.map((step, index) => {
                const complete = index < activeStep;
                const active = index === activeStep;

                return (
                  <div
                    key={step}
                    className={
                      active
                        ? 'flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-900 shadow-sm'
                        : complete
                          ? 'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[10px] font-semibold text-emerald-700'
                          : 'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[10px] font-semibold text-slate-400'
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        complete
                          ? 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-[9px] font-black text-emerald-700'
                          : active
                            ? 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#A63D48]/30 bg-[#A63D48]/10 text-[9px] font-black text-[#A63D48]'
                            : 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-[9px] font-black text-slate-300'
                      }
                    >
                      {complete ? '✓' : active ? '•' : index + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

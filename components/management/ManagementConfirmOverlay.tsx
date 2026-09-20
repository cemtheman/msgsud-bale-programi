'use client';

export function ManagementConfirmOverlay({
  title,
  detail,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/20 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="management-confirm-title"
      aria-describedby="management-confirm-detail"
    >
      <div className="w-[min(360px,calc(100vw-32px))] rounded-[28px] border border-white/80 bg-white/95 px-7 py-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              d="M8 8.5V7a4 4 0 0 1 8 0v1.5M6.5 8.5h11l-.7 10.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6.5 8.5ZM10 12v5M14 12v5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2
          id="management-confirm-title"
          className="mt-4 text-base font-bold text-slate-900"
        >
          {title}
        </h2>

        <p
          id="management-confirm-detail"
          className="mt-2 text-[12px] font-medium leading-5 text-slate-500"
        >
          {detail}
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

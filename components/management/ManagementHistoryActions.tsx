'use client';

export function ManagementHistoryActions({
  undoAvailable,
  redoAvailable,
  busy,
  undoTitle,
  redoTitle,
  onUndo,
  onRedo,
}: {
  undoAvailable: boolean;
  redoAvailable: boolean;
  busy: boolean;
  undoTitle: string;
  redoTitle: string;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div
      data-tour-target="history-actions"
      className="flex shrink-0 items-center gap-1"
      aria-label="Program işlem geçmişi"
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!undoAvailable || busy}
        className="flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 max-[1380px]:w-8 max-[1380px]:px-0"
        title={undoTitle}
        aria-label={undoTitle}
      >
        <span aria-hidden="true">↶</span>
        <span className="max-[1380px]:hidden">Geri Al</span>
      </button>

      <button
        type="button"
        onClick={onRedo}
        disabled={!redoAvailable || busy}
        className="flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 max-[1380px]:w-8 max-[1380px]:px-0"
        title={redoTitle}
        aria-label={redoTitle}
      >
        <span aria-hidden="true">↷</span>
        <span className="max-[1380px]:hidden">Yinele</span>
      </button>
    </div>
  );
}

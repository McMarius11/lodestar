import { useProjectStore } from '@/store/useProjectStore'

export function ExternalChangeBanner() {
  const pending = useProjectStore((s) => s.externalChangePending)
  const reload = useProjectStore((s) => s.reloadFromDisk)
  const dismiss = useProjectStore((s) => s.dismissExternalChange)

  if (!pending) return null
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="banner-external-change"
      className="border-b border-warn/40 bg-warn/10 px-4 py-3 flex flex-col items-start gap-3 label-mono sm:px-5 sm:py-2 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0 flex-1">
        <div className="text-warn">⚠ FILE CHANGED ON DISK</div>
        <div className="text-fg-subtle normal-case leading-snug mt-1">
          Something else (editor, Claude, git) rewrote project.json while you were editing.
        </div>
      </div>
      <div
        data-testid="banner-external-actions"
        className="w-full flex flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row"
      >
        <button
          onClick={() => reload()}
          data-testid="banner-external-reload"
          className="btn-ghost !py-1 !px-2 text-xs w-full sm:w-auto"
          title="Discard your in-progress edits and load disk state"
        >
          Reload from disk
        </button>
        <button
          onClick={() => dismiss()}
          data-testid="banner-external-keep"
          className="btn-primary !py-1 !px-2 text-xs w-full sm:w-auto"
          title="Keep your edits and overwrite the disk state"
        >
          Keep mine
        </button>
      </div>
    </div>
  )
}

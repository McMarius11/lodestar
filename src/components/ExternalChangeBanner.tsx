import { useProjectStore } from '@/store/useProjectStore'

export function ExternalChangeBanner() {
  const pending = useProjectStore((s) => s.externalChangePending)
  const reload = useProjectStore((s) => s.reloadFromDisk)
  const dismiss = useProjectStore((s) => s.dismissExternalChange)

  if (!pending) return null
  return (
    <div className="border-b border-warn/40 bg-warn/10 px-5 py-2 flex items-center gap-4 label-mono">
      <span className="text-warn">⚠ FILE CHANGED ON DISK</span>
      <span className="text-fg-subtle normal-case">
        Something else (editor, Claude, git) rewrote project.json while you were editing.
      </span>
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => reload()}
          className="btn-ghost !py-1 !px-2 text-xs"
          title="Discard your in-progress edits and load disk state"
        >
          Reload from disk
        </button>
        <button
          onClick={() => dismiss()}
          className="btn-primary !py-1 !px-2 text-xs"
          title="Keep your edits and overwrite the disk state"
        >
          Keep mine
        </button>
      </div>
    </div>
  )
}

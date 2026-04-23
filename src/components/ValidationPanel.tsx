import clsx from 'clsx'
import { validate, countBySeverity, type Issue } from '@/lib/validate'
import { useProjectStore } from '@/store/useProjectStore'

export function ValidationPanel() {
  const project = useProjectStore((s) => s.project)
  const openDrawer = useProjectStore((s) => s.openDrawer)
  const issues = validate(project)
  const counts = countBySeverity(issues)

  return (
    <div
      className="h-full overflow-auto scroll-thin"
      role="tabpanel"
      id="view-validate"
      aria-label="Validation"
      data-testid="view-validate"
    >
      <div className="p-8 border-b border-line/60">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="ser-display text-5xl italic">Status</h1>
          <div className="flex gap-4 ml-4">
            <Counter label="errors" count={counts.error} color="text-danger border-danger" />
            <Counter label="warnings" count={counts.warn} color="text-warn border-warn" />
            <Counter label="info" count={counts.info} color="text-fg-muted border-line" />
          </div>
        </div>
        <p className="text-fg-muted max-w-2xl text-sm">
          {issues.length === 0
            ? 'All clear. No conflicts, cycles, or inconsistent data found.'
            : `${issues.length} ${issues.length === 1 ? 'finding' : 'findings'} in your project. Click a feature to open the drawer.`}
        </p>
      </div>

      <div>
        {issues.length === 0 && (
          <div className="p-16 text-center">
            <div className="ser-display text-3xl italic text-success mb-2">clean</div>
            <div className="label-mono">NO ISSUES</div>
          </div>
        )}
        {issues.map((iss, i) => (
          <IssueRow key={i} issue={iss} onOpen={(id) => openDrawer(id)} />
        ))}
      </div>
    </div>
  )
}

function Counter({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <div className={clsx('flex items-baseline gap-2 border px-3 py-1.5', color)}>
      <span className="num-mono text-lg">{count}</span>
      <span className="label-mono">{label}</span>
    </div>
  )
}

function IssueRow({ issue, onOpen }: { issue: Issue; onOpen: (id: string) => void }) {
  const sev = issue.severity
  const color =
    sev === 'error' ? 'text-danger' : sev === 'warn' ? 'text-warn' : 'text-fg-muted'
  return (
    <button
      onClick={() => issue.featureId && onOpen(issue.featureId)}
      disabled={!issue.featureId}
      className="w-full flex items-start gap-5 px-8 py-4 border-b border-line/40 hover:bg-raised/30 text-left transition-colors disabled:cursor-default"
    >
      <span className={clsx('label-mono w-[56px] shrink-0 pt-0.5', color)}>
        {sev === 'error' ? 'ERR' : sev === 'warn' ? 'WARN' : 'INFO'}
      </span>
      <span className="label-mono w-[180px] shrink-0 pt-0.5 text-fg-subtle">
        {kindLabel(issue.kind)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-sm text-fg">{issue.message}</span>
        {issue.detail && (
          <span className="block label-mono text-fg-subtle mt-1">{issue.detail}</span>
        )}
      </span>
    </button>
  )
}

function kindLabel(kind: Issue['kind']): string {
  switch (kind) {
    case 'unknown-dep':
      return 'Missing dependency'
    case 'dep-conflict':
      return 'Milestone conflict'
    case 'dep-cycle':
      return 'Dependency cycle'
    case 'gantt-invalid':
      return 'Invalid Gantt range'
    case 'gantt-effort-mismatch':
      return 'Effort vs schedule'
    case 'orphan-milestone':
      return 'Missing milestone'
  }
}

import type { Project } from '@/types'
import { blockedBy, completion, hasConflict, isBlocked } from './deps'

export function projectToMarkdown(project: Project): string {
  const out: string[] = []
  const date = new Date().toISOString().slice(0, 10)

  out.push(`# ${project.meta.name || 'Untitled Project'}`)
  out.push('')
  if (project.meta.description) out.push(`> ${project.meta.description}`)
  out.push('')
  out.push(`**Version:** \`${project.meta.version}\` · **Exported:** ${date}`)
  out.push('')

  const allFeatures = project.modules.flatMap((m) => m.features)
  const allTasks = allFeatures.flatMap((f) => f.tasks)
  const doneTasks = allTasks.filter((t) => t.done).length
  const pct = allTasks.length === 0 ? 0 : Math.round((doneTasks / allTasks.length) * 100)

  out.push('## Overview')
  out.push('')
  out.push(`- Modules: **${project.modules.length}**`)
  out.push(`- Features: **${allFeatures.length}**`)
  out.push(`- Tasks: **${doneTasks} / ${allTasks.length}** (${pct}%)`)
  const conflicts = allFeatures.filter((f) => hasConflict(project, f))
  const blocked = allFeatures.filter((f) => !hasConflict(project, f) && isBlocked(project, f))
  if (conflicts.length) out.push(`- Conflicts: **${conflicts.length}**`)
  if (blocked.length) out.push(`- Blocked: **${blocked.length}**`)
  out.push('')

  // By milestone
  out.push('## Milestones')
  out.push('')
  for (const ms of project.meta.milestones) {
    const msFeatures = allFeatures.filter((f) => f.ms === ms.id)
    if (msFeatures.length === 0) continue
    const msTasks = msFeatures.flatMap((f) => f.tasks)
    const msDone = msTasks.filter((t) => t.done).length
    const msPct = msTasks.length === 0 ? 0 : Math.round((msDone / msTasks.length) * 100)
    out.push(`### ${ms.id} — ${ms.label}`)
    out.push('')
    out.push(`\`${msDone}/${msTasks.length}\` tasks · **${msPct}%**`)
    out.push('')
    for (const m of project.modules) {
      const feats = m.features.filter((f) => f.ms === ms.id)
      if (feats.length === 0) continue
      out.push(`**${m.label}**`)
      out.push('')
      for (const f of feats) {
        const c = completion(f)
        const flags: string[] = []
        if (hasConflict(project, f)) flags.push('⚠ CONFLICT')
        else if (isBlocked(project, f)) flags.push('○ blocked')
        if (c.total > 0 && c.done === c.total) flags.push('✓ done')
        const tag = flags.length ? ` — _${flags.join(', ')}_` : ''
        out.push(`- [${f.effort}] **${f.label}** · \`${c.done}/${c.total}\`${tag}`)
        const blockers = blockedBy(project, f)
        if (blockers.length) {
          out.push(`  - waits on: ${blockers.map((b) => `_${b.label}_`).join(', ')}`)
        }
      }
      out.push('')
    }
  }

  // Per-feature task checklists for anything with open work
  const openFeatures = allFeatures.filter((f) => {
    const c = completion(f)
    return c.total > 0 && c.done < c.total
  })
  if (openFeatures.length) {
    out.push('## Open Work')
    out.push('')
    for (const f of openFeatures) {
      const mod = project.modules.find((m) => m.features.includes(f))
      out.push(`### ${f.label} \`${mod?.label ?? ''} · ${f.ms}\``)
      out.push('')
      for (const t of f.tasks) {
        out.push(`- [${t.done ? 'x' : ' '}] ${t.label}`)
      }
      out.push('')
    }
  }

  return out.join('\n')
}

export function downloadMarkdown(project: Project) {
  const md = projectToMarkdown(project)
  const safe = (project.meta.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const filename = `${safe}-${new Date().toISOString().slice(0, 10)}.md`
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

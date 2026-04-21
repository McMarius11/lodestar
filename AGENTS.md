# Agents

Entry point for AI coding agents (Claude Code, Cursor, Continue, Codex, Aider, ...).

## Where to start

- **Human overview & setup:** [`README.md`](./README.md)
- **Project spec, data model & conventions:** [`CLAUDE.md`](./CLAUDE.md)
  (in German — it's the long-form design doc; treat it as the source of
  truth for how the app is structured and why)

## Repo at a glance

Lodestar is a local-first desktop project planner: Electron + Vite +
React 18 + TypeScript + Zustand + Tailwind. Everything the user edits
lives in a single `data/project.json`, validated through Zod on every
load and save. There's no backend and no database.

```
data/project.example.json   seed sample (checked in)
data/project.json           working copy (git-ignored)
electron/                   main process, IPC, file watcher
src/types.ts                the Project / Module / Feature / Dep / Task types
src/schema.ts               Zod schema + migrate()
src/store/                  Zustand store with 50-step undo
src/lib/deps.ts             depStatus, isBlocked, blockedBy, findCycles
src/views/                  the five views (ModuleScope, Roadmap, Kanban, MindMap, Gantt)
src/components/             shared UI (TaskDrawer, CommandPalette, filters, ...)
scripts/generate-notices.mjs builds THIRD_PARTY_NOTICES.md from production deps
.github/workflows/release.yml tag-driven CI, produces AppImage + portable .exe
```

## Working on the code

```bash
npm install
npm run electron:dev     # Vite + Electron with HMR
npm run typecheck        # strict TS
npm run build            # web-only dist/
npm run electron:build   # AppImage + portable .exe in release/
```

Conventions worth respecting:

- TypeScript strict is on. Prefer the existing types in `src/types.ts`
  and schema in `src/schema.ts` over ad-hoc shapes.
- Any change to the data model needs a matching bump in `schemaVersion`
  and a migration step in `src/schema.ts`.
- The `data/project.json` working file is git-ignored — use
  `data/project.example.json` when testing changes.
- Fonts are bundled locally (`src/assets/fonts/`); don't add CDN links.
- No new backend, no network calls, no telemetry. The point of the app
  is that it works offline on one machine.

## Working on the data (non-code changes)

Agents can edit `data/project.json` directly. The running app watches
the file and reloads automatically. Typical prompts:

```
Add a feature 'OAuth2 Provider' to the Auth module, effort M, milestone v0.2
Move every v0.3 feature into v0.4
Sync Engine needs a runtime dep on Metadata Index
Show every feature that currently has a dep conflict
```

Keep IDs stable when renaming labels; other features reference them via
`Dep.id`. Regenerate IDs only when creating new entities.

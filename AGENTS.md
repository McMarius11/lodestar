# Agents

Short entry point for coding agents working in this repo.

## Read This First

- [`README.md`](./README.md): human overview, setup, architecture summary
- [`CLAUDE.md`](./CLAUDE.md): product and data-model spec, source of truth
- [`AI_README.md`](./AI_README.md): code-map, store invariants, "how to add X"

If `AGENTS.md` and `CLAUDE.md` disagree, follow `CLAUDE.md`.

## Project Summary

Lodestar is a local-first desktop project planner for software work.
Stack: Electron + Vite + React 18 + TypeScript + Zustand + Immer +
Tailwind + Zod + Framer Motion.

Everything user-editable lives in one project file:

- `data/project.json` in dev
- validated through `src/schema.ts` on every load and save
- watched by Electron for external edits
- stored in `localStorage` only in the web build

There is no backend, no database, no telemetry, and no network
dependency in normal app usage.

## Key Files

```text
data/project.example.json   tracked seed project
data/project.json           working copy, git-ignored
src/types.ts                core types: Project, Module, Feature, Dep, Task
src/schema.ts               Zod schema + migrate(), schemaVersion
src/store/useProjectStore.ts single store; commit() is the mutation path
src/lib/deps.ts             dependency/status logic
src/lib/validate.ts         validation rules shown in the UI
src/lib/persistence.ts      Electron/localStorage persistence bridge
src/lib/featureActions.ts   shared context-menu action factory
src/hooks/useFilteredFeatures.ts global milestone/status filter pipeline
src/views/                  ModuleScope, Roadmap, Kanban, MindMap, Gantt
electron/main.ts            filesystem, IPC, file watcher
tests/playwright/           Python Playwright harness
```

## Non-Negotiable Rules

- Keep TypeScript strict-clean.
- Reuse the existing types in `src/types.ts`; do not invent parallel ad-hoc shapes.
- Any data-model change must update `schemaVersion` and add a migration in `src/schema.ts`.
- Keep `src/lib/` pure: no React and no store imports there.
- Keep IDs stable when renaming entities. Only create new IDs for new entities.
- Do not add a backend, remote API calls, or telemetry.
- Fonts are bundled locally; do not add CDN font dependencies.

## Data Model Notes

The main editable unit is `Project`:

- `meta`: project metadata, milestones, optional `today`, optional pinned mindmap positions
- `modules[]`: each module owns `features[]`
- `features[]`: milestone, effort, gantt range, deps, tasks, optional persistent `rank`
- `deps[]`: point to other feature IDs and have `type` = `build | runtime | optional`

Dependency semantics matter:

- conflicts mean a feature depends on a later milestone
- blocked ignores optional deps
- Kanban ordering is persisted via `feature.rank`

Read `CLAUDE.md` before changing dependency behavior, filters, milestone logic,
or view semantics.

## How To Work Safely

- For app behavior, start from the relevant view/component and trace back into hooks, store, and `src/lib/`.
- For store changes, preserve `commit()`-based mutation flow and undo behavior.
- For dependency/status issues, inspect `src/lib/deps.ts` and `src/lib/validate.ts` first.
- For persistence changes, check both Electron and browser fallback behavior.
- Prefer testing against `data/project.example.json`; `data/project.json` is local working state.

## Useful Commands

```bash
npm install
npm run dev
npm run electron:dev
npm run typecheck
npm run build
npm run electron:build
```

Playwright coverage lives under `tests/playwright/`; use the existing harness
instead of inventing a second end-to-end setup.

## Editing Project Data Directly

Agents may edit `data/project.json` directly for content changes. The running app
reloads automatically when the file changes.

Typical data tasks:

```text
Add a feature 'OAuth2 Provider' to the Auth module, effort M, milestone v0.2
Move every v0.3 feature into v0.4
Sync Engine needs a runtime dep on Metadata Index
Show every feature that currently has a dep conflict
```

When editing data:

- preserve existing IDs on rename
- update references when moving or splitting entities
- keep milestone IDs consistent
- ensure the final JSON still satisfies the schema

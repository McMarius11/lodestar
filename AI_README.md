# AI_README — Lodestar Codebase Guide

This file briefs an AI assistant (or a new human dev) on the architecture,
conventions, and invariants of the codebase. Read it before touching code.

The user-facing README lives in `README.md`. Product/project context for AI
tools lives in `CLAUDE.md`. This file is about **code structure**.

---

## Quick mental model

Lodestar is a local-first project planner: one JSON document (`data/project.json`)
drives everything. The app is a single Zustand store plus five view components
that subscribe to slices of it. There is no backend.

```
User interaction
   │
   ▼
View / component  ──► store action ──► commit(mutator)
                                          │
                          ┌───────────────┼─────────────────┐
                          ▼               ▼                 ▼
                    _pushHistory     immer-mutation    _persist (debounced)
                    (undo stack)     (project state)   (disk or localStorage)
```

Every data-level mutation funnels through `commit()` (defined inside
`useProjectStore`). That single path guarantees undo + persist work in lockstep.

---

## Directory layout

```
src/
  App.tsx                ← view router + global overlays (drawer, palette, dep editor)
  main.tsx               ← React entry
  index.css              ← Tailwind + fonts
  types.ts               ← data model (Project, Module, Feature, Dep, Task, …)
  schema.ts              ← Zod schema + migrate() for schemaVersion bumps

  store/
    useProjectStore.ts   ← SINGLE Zustand store. Actions grouped by concern.

  lib/                   ← pure, view-independent modules (no React imports)
    deps.ts              ← featureStatus, isBlocked, hasConflict, findFeature,
                           featureIndex, moduleOf, matchesFilters, cycles
    featureActions.ts    ← pure factory: Api → CtxMenuItem[] for all menus
    persistence.ts       ← load/save (Electron IPC or localStorage fallback);
                            loadProjectFromPath + saveProject(project, path?)
                            for arbitrary-file support
    recentFiles.ts       ← Recent-files list (localStorage) — pure transforms
                            (upsertRecent/removeRecent) + tiny I/O wrappers
    lastSession.ts       ← remembers last opened path for "Continue" button
    validate.ts          ← lint rules for the Validation panel
    markdown.ts          ← tiny markdown → HTML for feature descriptions
    id.ts                ← nanoid wrappers (newId, slugId)

  hooks/                 ← React hooks only. Can import from store + lib.
    useFilteredFeatures.ts   ← applies global MS + status filters once
    useFeatureActionsApi.ts  ← bridges store to featureActions factory
    useMindmapLayout.ts      ← radial layout math for MindMap
    useGanttLayout.ts        ← row stacking + milestone bands for Gantt
    useKeyboardNav.ts        ← global shortcuts (registers on window)
    useWebZoom.ts            ← browser-only font-scale persistence

  components/            ← reusable UI (stateless where possible)
    TopBar.tsx, TaskDrawer.tsx, CommandPalette.tsx, ContextMenu.tsx,
    DepEditorPopover.tsx, MilestoneEditor.tsx, ModuleEditor.tsx,
    StatusGlyph.tsx, EffortBadge.tsx, ProgressBar.tsx, …

  views/                 ← one per primary tab
    ModuleScope.tsx, Roadmap.tsx, Kanban.tsx, MindMap.tsx, Gantt.tsx
    ValidationPanel lives in components/, rendered as a sixth tab.

  data/
    sample.ts            ← Nimbus sample project
    lodestarRoadmap.ts   ← Lodestar's own dogfood project

electron/                ← main.ts + preload.ts (IPC, file watcher)
data/                    ← project.json (runtime), project.example.json (seed)
scripts/                 ← generate-notices.mjs
build/                   ← app icons (icon.svg source + rasterized png/ico)
```

Rule of thumb:
- **`lib/`** — pure TypeScript, no React, no store. Unit-testable in isolation.
- **`hooks/`** — React-only, can touch store and lib.
- **`components/`** — React UI that can be used by multiple views.
- **`views/`** — top-level tab pages. Thick with layout, thin on logic
  (logic lives in hooks/lib).

---

## The store (`src/store/useProjectStore.ts`)

One store. Zustand + Immer middleware. ~100 actions, grouped by concern with
section-banner comments.

### The `commit` helper

```ts
const commit = (mutator) => {
  get()._pushHistory()   // snapshot for undo (deep clone)
  set(mutator)            // run the immer mutation
  get()._persist()        // debounced disk/localStorage save
}
```

Every **data mutation** uses `commit((s) => { … })`.

**UI state** (`activeView`, `drawerFeatureId`, `paletteOpen`, `cursorFeatureId`,
filters, modal flags) uses `set()` directly so it stays out of the undo history.

### What goes in the undo history

Anything mutating `project.modules`, `project.meta`, or `project.meta.milestones`.
Filters, drawer state, palette-open, zoom factors do NOT participate in undo.

### State sections (read the comments in the file)

1. UI state — filters + overlays + cursor
2. Tasks — per-feature task CRUD
3. Features — CRUD + move + rank + gantt range
4. Dependencies — add/update/remove a Dep on a feature
5. Modules — CRUD + reorder + clone
6. MindMap positions — session overrides (volatile) + pinned (persisted in meta)
7. Project meta + milestones
8. Undo/redo stacks
9. Import/export
10. Internal primitives (`_pushHistory`, `_persist`) — do not call from views

### Do not

- Do not call `_pushHistory` + `set` + `_persist` by hand. Use `commit`.
- Do not mutate `project` without going through the store.
- Do not add a new action that bypasses `commit` for data mutations —
  undo will silently stop working for that action.

---

## Data flow

- `schema.ts:migrate(raw)` — every load and save goes through this. It walks
  `schemaVersion` up to `CURRENT_SCHEMA_VERSION` and then Zod-validates.
  Adding a schema change = bump the constant, add a migration case.
- `persistence.ts` exposes two load paths: `loadProject()` reads the canonical
  default slot (`data/project.json` dev / `userData` packaged / `localStorage`
  browser); `loadProjectFromPath(path)` is Electron-only and opens an arbitrary
  file. `saveProject(project, path?)` routes to the same place — optional path
  overrides the default slot.
- `store.init()` no longer auto-loads. It sets `source: 'none'` so the
  `WelcomeScreen` always shows at startup. The user picks a file there; that
  action populates `currentPath` and hands it to future saves.
- `lib/recentFiles.ts` + `lib/lastSession.ts` are the persistent memory behind
  the Welcome screen. They're pure-ish (localStorage I/O is behind a small
  wrapper, list transforms are pure and tested). Only store actions are
  allowed to *write* to them — UI components just call `store.recents()` /
  `store.lastSession()` to read, or `store.forgetRecent(...)` to prune.
- `persistence.ts:subscribeExternalChange()` wires the file watcher (Electron)
  so external edits reload the UI. The watcher latches onto whichever path
  the last load/save touched — so a project opened at `~/foo/x.json` is
  watched at `~/foo/x.json`, not at the default slot. If a drawer is open,
  reload is deferred (`externalChangePending`) and the user decides when to
  pull.

---

## Rendering pipeline (views)

Every view follows the same recipe:

```ts
const { project, modules: filteredModules } = useFilteredFeatures()
const api = useFeatureActionsApi()
const ctx = useContextMenu()
// ...subscribe to any additional store slices needed
```

- `useFilteredFeatures()` — the ONE place that applies the global Milestone +
  Status filters. Returns `modules` (each with pre-filtered features) and a
  flat `features` list. Never filter inline in a view.
- `useFeatureActionsApi()` — returns the pure `Api` object consumed by the
  menu factories in `lib/featureActions.ts`.
- `useContextMenu()` — portal-based menu primitive. `ctx.openAt(x, y, items)`.

Roadmap is a slight exception: its columns ARE the milestone dimension, so it
uses `matchesStatus` directly (not `matchesFilters`).

---

## Adding things

### A new store action

1. Add the action signature to the `Actions` type.
2. Implement it inside the `immer` closure, inside the correct section.
3. Use `commit((s) => { … })` if it mutates project data.
4. Use `set((s) => { … })` if it's UI-only.
5. Do not touch `_pushHistory` / `_persist` manually.

### A new view

1. Create `src/views/MyView.tsx`.
2. Use `useFilteredFeatures()` for the feature list.
3. Use `useFeatureActionsApi()` + `useContextMenu()` for right-click menus.
4. Register in `App.tsx` under the `activeView` switch.
5. Add its id to `ViewId` in `types.ts` and wire the tab in `TopBar.tsx`.
6. Add keyboard shortcut in `hooks/useKeyboardNav.ts` (`viewMap`).

### A new computed property (derivation)

Goes in `src/lib/deps.ts` as a pure function. If the computation is expensive
and repeated, wrap it in a `useMemo` inside a hook in `src/hooks/`.

### A new context-menu entry

Edit `src/lib/featureActions.ts`. The factories are pure — just return
additional `CtxMenuItem` objects. No React state lives here.

### A schema change

1. Bump `CURRENT_SCHEMA_VERSION` in `src/schema.ts`.
2. Add a migration case in `migrate()`.
3. Add or adjust fields in `src/types.ts` and the Zod schema.
4. Update `src/data/sample.ts` and `data/project.example.json` to the new
   `schemaVersion`.
5. Leave any dogfood sample (`data/lodestar-v*.json`) conformant.

---

## Patterns in play

- **Single source of truth**: one Zustand store. No local feature state in
  views that should be shared.
- **Pure / impure separation**: `lib/` is pure, `hooks/` is React, views are
  composition.
- **Portals for overlays**: TaskDrawer, CommandPalette, ContextMenu,
  DepEditorPopover all portal to `document.body`.
- **Drag & drop**: native HTML5 DnD, dataTransfer MIME
  `text/lodestar-feature` / `text/lodestar-module`. No libraries.
- **Immer drafts**: inside `commit((s) => …)`, `s` is a draft. Mutate freely.
  Helper `findFeature(s.project, id)` works on the draft and returns a
  mutable reference.

## Anti-patterns (don't do)

- Adding a data mutation without `commit()` — undo will drift.
- Filtering features inline in a view — always use `useFilteredFeatures()`.
- Importing from `store/` inside `lib/` — `lib/` must stay pure/React-free.
- Creating a second store — one store is the design.
- Keeping derived state in store state — derive it (`deps.ts`) instead.
- Expanding the `Api` shape in `featureActions.ts` with view-level concerns —
  if only one view needs it, keep it in that view.

---

## Testing

`npm run typecheck` — strict TypeScript, first gate.
`npm test` — Vitest. Currently covers `deps.ts` (37 test cases across
`deps.test.ts`, `validate.test.ts`, `schema.test.ts`).

Add unit tests for any new pure function in `lib/`. Views aren't
component-tested — interactive behavior is smoke-tested via Playwright
scripts invoked manually (see `/tmp/lodestar-pw/` in user's env).

---

## Commands cheat-sheet

```
npm run dev              # Vite dev server (localStorage mode in browser)
npm run electron:dev     # Electron + Vite (reads data/project.json on disk)
npm run typecheck        # strict tsc, no emit
npm test                 # vitest run
npm run build            # tsc check + vite production build
npm run electron:build   # full desktop build (AppImage / exe / dmg)
```

---

## Architectural decisions worth knowing

- **Kanban rank persists** (v0.3 schemaVersion 3). `feature.rank?: number`.
  Within-column order survives reload; cross-column move sets new rank at
  end of target column. Float-drift triggers `normalizeKanbanRanks()`.
- **MindMap positions**: session overrides are volatile (stored in
  `mindmapOverrides` on the store); pinned positions go into
  `project.meta.mindmapPositions` and are persisted. `pinMindmapPositions`
  promotes overrides → meta.
- **Dep editor** is a store-level singleton (`state.depEditor`). Any view can
  call `openDepEditor(fromId, toId, anchor)`. Mounted once in `App.tsx` as
  `<DepEditorHost />`.
- **Tab numbers `01–06`** in the TopBar are discoverability for the
  keyboard shortcuts `1–6`, not version numbers. They render as subscripts.

---

## When in doubt

- The user knows Lodestar intimately — ask if semantics are unclear.
- Bias toward keeping pure things pure: if a change would drag `useState`
  into `lib/`, it probably belongs in a hook instead.
- Measure before splitting a file. 600 lines in a view is fine if the logic
  is concentrated; split when extraction yields a reusable unit.
- Run `npm run typecheck && npm test` after any structural change before
  claiming done.

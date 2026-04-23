# Lodestar – Claude Code Spec

> **Code-Struktur-Brief:** Für Architektur, Store-Invarianten, Hooks/Lib-Trennung
> und „Wie füge ich X hinzu" siehe [`AI_README.md`](./AI_README.md). Dieses File
> hier ist Produkt- + Daten-Spec; `AI_README.md` ist Code-Map.

## Was ist das?

Ein lokales Projekt-Planungs-Tool speziell für Software-Projekte.
Daten leben in `data/project.json`. Keine Datenbank, kein Backend.
Aktuelle Version: **v0.3.1** („Hands on the Data") — die App ist
durchgehend maus-editierbar: Kontextmenüs in allen fünf Views, Drag & Drop
in Roadmap/Kanban/Gantt/MindMap, Undo-Tiefe bis 50.

## Stack

- Vite + React 18 + TypeScript (strict)
- Zustand + Immer (State, 50-Step Undo, `commit()`-Helper als einziger
  Data-Mutation-Pfad — siehe `AI_README.md`)
- Zod (Schema-Validation & Migration)
- Tailwind CSS
- Framer Motion (Drawer/Overlay-Transitions)
- Electron (Desktop-Build; im Web-Build läuft das Gleiche gegen `localStorage`)

## Datenmodell (`src/types.ts`)

```typescript
type Effort = 'S' | 'M' | 'L' | 'XL'
type DepType = 'build' | 'runtime' | 'optional'

type Task = {
  id: string
  label: string
  done: boolean
}

type Dep = {
  id: string          // Feature-ID auf die sich die Dep bezieht
  reason: string      // Warum braucht dieses Feature das andere?
  type: DepType       // build = vorher gebaut, runtime = Daten zur Laufzeit, optional = nur Hinweis
}

type Feature = {
  id: string
  label: string
  description?: string    // Markdown (gerendert via src/lib/markdown.ts)
  effort: Effort
  ms: string              // Milestone-ID z.B. "v0.1"
  ganttStart: number      // Woche (0-basiert)
  ganttEnd: number        // Woche (0-basiert)
  deps: Dep[]
  tasks: Task[]
  rank?: number           // persistente Kanban-Sortierung innerhalb Spalte (v3)
}

type Module = {
  id: string
  label: string
  color: string       // Hex-Farbe
  features: Feature[]
}

type Milestone = {
  id: string          // z.B. "v0.1"
  label: string       // Anzeige-Name
}

type ProjectMeta = {
  name: string
  description: string
  version: string
  schemaVersion: number                                       // aktuell 3
  milestones: Milestone[]
  today?: number                                              // Gantt-Heute-Marker (Woche)
  mindmapPositions?: Record<string, { x: number; y: number }> // angepinnte Node-Positionen
}

type Project = {
  meta: ProjectMeta
  modules: Module[]
}

type FeatureStatus = 'backlog' | 'progress' | 'done'
type DepStatus = 'done' | 'conflict' | 'same' | 'open' | 'unknown'
type ViewId = 'scope' | 'roadmap' | 'kanban' | 'mindmap' | 'gantt' | 'validate'
```

Jeder Load- und Save-Pfad läuft durch `migrate()` in `src/schema.ts` —
alte Shapes werden dort hochgehoben bevor Zod sie endgültig validiert.
Aktuelle Schema-Version: **3** (v1 → v2 fügte Milestones ein,
v2 → v3 machte `feature.rank` persistent).

## File-Struktur

```
├── data/
│   ├── project.json            ← Arbeitskopie (git-ignored)
│   └── project.example.json    ← Seed-Beispiel (getrackt)
├── electron/
│   ├── main.ts                 ← BrowserWindow, IPC-Handler, File-Watcher
│   └── preload.ts              ← window.projectAPI Bridge
├── scripts/
│   └── generate-notices.mjs    ← erzeugt THIRD_PARTY_NOTICES.md
├── build/                      ← App-Icons (Quelle + gerastert)
├── public/
│   └── favicon.svg
├── src/
│   ├── App.tsx                 ← View-Router + globale Overlays (Drawer, Palette, DepEditor)
│   ├── main.tsx                ← React-Einstieg
│   ├── index.css               ← Tailwind + @font-face
│   ├── types.ts                ← Datenmodell (oben)
│   ├── schema.ts               ← Zod-Schema + migrate() (inkl. schema.test.ts)
│   ├── store/
│   │   └── useProjectStore.ts  ← Einziger Zustand-Store. commit()-Helper,
│   │                             ~100 Actions gruppiert nach Concern
│   ├── lib/                    ← REIN. Kein React, kein Store-Import. Unit-testbar.
│   │   ├── deps.ts             ← featureStatus, depStatus, isBlocked, blockedBy,
│   │   │                         hasConflict, findFeature, featureIndex,
│   │   │                         moduleOf, matchesFilters, findCycles (+ deps.test.ts)
│   │   ├── featureActions.ts   ← Pure Factory: Api → CtxMenuItem[] (Feature/Module/EmptyArea)
│   │   ├── persistence.ts      ← load/save/export/import (Electron | localStorage)
│   │   ├── validate.ts         ← Lint-Regeln für den Validation-Panel (+ validate.test.ts)
│   │   ├── markdown.ts         ← winziger Markdown-Parser für Beschreibungen
│   │   └── id.ts               ← nanoid-Wrapper (newId, slugId)
│   ├── hooks/                  ← React-Hooks. Dürfen Store + lib nutzen.
│   │   ├── useFilteredFeatures.ts   ← DIE Stelle an der MS- + Status-Filter greifen
│   │   ├── useFeatureActionsApi.ts  ← Bridge vom Store zur Menu-Factory
│   │   ├── useMindmapLayout.ts      ← Radial-Layout-Mathe
│   │   ├── useGanttLayout.ts        ← Row-Stacking + Milestone-Bänder
│   │   ├── useKeyboardNav.ts        ← globale Shortcuts
│   │   └── useWebZoom.ts            ← Browser-only Font-Scale-Persistenz
│   ├── data/
│   │   ├── sample.ts                ← Nimbus Sample-Project
│   │   └── lodestarRoadmap.ts       ← Lodestars eigenes Dogfood-Project
│   ├── components/             ← Wiederverwendbare UI
│   │   ├── TopBar.tsx               ← Tabs, Filter, Save-Indicator, + New…-Menu
│   │   ├── CommandPalette.tsx       ← ⌘K / „/"
│   │   ├── HelpOverlay.tsx          ← „?"
│   │   ├── ContextMenu.tsx          ← Portal-Primitiv mit Submenüs + Viewport-Aware
│   │   ├── ErrorBoundary.tsx        ← pro View um Crashes abzufangen
│   │   ├── ExternalChangeBanner.tsx ← wenn File-Watcher externe Änderungen sieht
│   │   ├── WelcomeScreen.tsx        ← erster Start / Close-Project-Flow
│   │   ├── DepEditorPopover.tsx     ← Dep-Reason/Type editieren (Singleton über App)
│   │   ├── MilestoneFilter.tsx      ← globaler MS-Filter
│   │   ├── StatusFilter.tsx         ← Ready / Blocked / Conflict
│   │   ├── MilestoneEditor.tsx      ← zentrierter Modal
│   │   ├── ModuleEditor.tsx         ← zentrierter Modal
│   │   ├── ProjectMetaEditor.tsx    ← Name/Version/Beschreibung
│   │   ├── TaskDrawer.tsx           ← Wiederverwendet in allen Views
│   │   ├── ValidationPanel.tsx      ← Cycles, Conflicts, Dangling Deps
│   │   ├── StatusGlyph.tsx, EffortBadge.tsx, ProgressBar.tsx
│   └── views/
│       ├── ModuleScope.tsx     ← Modul-Cards mit Feature-Rows
│       ├── Roadmap.tsx         ← Milestone-Spalten (DnD)
│       ├── Kanban.tsx          ← Backlog / In Progress / Done (DnD + Rank)
│       ├── MindMap.tsx         ← SVG, radial, Node-Drag
│       └── Gantt.tsx           ← Wochen-Balken + Dep-Pfeile, Bar-Drag + Resize
└── tests/
    └── playwright/             ← Python-Playwright-Harness (Konventionen in AI_PLAYWRIGHT.md)
        ├── _lib.py             ← Seed, Bootstrap, DnD-Helfer, wait_idle, DialogHandler
        ├── smoke.py            ← 13-Test Quick-Check
        ├── run_all.py          ← Aggregator über alle test_*.py
        ├── test_*.py           ← 17 Feature-Suiten (topbar, palette, kontextmenüs,
        │                         drawer, editoren, 5 views, undo, keyboard, persistence)
        └── FINDINGS.md         ← Test-Pass-Bugs/UX-Funde (harness-scoped)
```

## Dep-Logik (`src/lib/deps.ts`)

```typescript
type FeatureStatus = 'backlog' | 'progress' | 'done'
type DepStatus = 'done' | 'conflict' | 'same' | 'open' | 'unknown'

// Status eines Features aus den Tasks ableiten
function featureStatus(f: Feature): FeatureStatus

// Fortschritt: { done, total, pct }
function completion(f: Feature): { done: number; total: number; pct: number }

// Status einer einzelnen Dep
function depStatus(project: Project, feat: Feature, dep: Dep): DepStatus
// done     = Dep-Feature 100% fertig
// conflict = Dep-Feature ist in SPÄTEREM Milestone → Warnung!
// same     = Dep-Feature ist im gleichen Milestone → koordinieren
// open     = Dep-Feature ist in früherem Milestone aber noch nicht fertig
// unknown  = Dep-ID zeigt auf ein nicht existierendes Feature

// Blockade-Check (optional-Deps zählen nicht)
function isBlocked(project: Project, feat: Feature): boolean
function blockedBy(project: Project, feat: Feature): Feature[]
function hasConflict(project: Project, feat: Feature): boolean

// Lookup-Helfer
function findFeature(project: Project, id: string): Feature | null
function featureIndex(project: Project): Map<string, Feature>
function moduleOf(project: Project, featureId: string): string | null
function milestoneOrder(project: Project): Map<string, number>

// Filter-Pipeline (globale MS- + Status-Filter)
type StatusFilter = 'all' | 'ready' | 'blocked' | 'conflict'
function matchesStatus(project: Project, feat: Feature, filter: StatusFilter): boolean
function matchesFilters(project: Project, feat: Feature,
                        ms: string | 'all', status: StatusFilter): boolean

// Topologischer Zyklus-Check für den Validation-Panel
function findCycles(project: Project): { cycles: string[][] }
```

## Views – Verhalten

Seit v0.3 hat **jeder** View Rechtsklick-Kontextmenüs (Open, Rename, Duplicate,
Move to Module/Milestone, Set Status, Copy ID, Delete). Die Item-Listen kommen
aus `src/lib/featureActions.ts` — eine Factory, fünf Aufrufer.

### Module Scope
- Grid der Module, jedes als Card mit Feature-Rows
- Pro Feature: Label | Effort-Badge | done/total | Progress-Bar
- **Single-Click → Drawer**, `▸`-Chevron togglt Inline-Tasks
- Rechtsklick Feature/Modul/leere Fläche → jeweiliges Kontextmenü
- **Keine Dep-Info sichtbar** – bewusst clean gehalten

### Roadmap
- Milestone-Spalten (gefiltert via globalem Filter)
- Features als klickbare Balken in ihrer Spalte
- Kleines `⚠` Symbol am Balken wenn Dep-Konflikt (Dep in späterem MS)
- **Drag & Drop zwischen Milestone-Spalten** → `moveFeatureToMs`
- Click → Task-Drawer

### Kanban
- 3 Spalten: Backlog / In Progress / Done
- Sortierbar nach Modul oder Effort
- **Drag & Drop innerhalb und zwischen Spalten**, Reihenfolge persistiert
  über `feature.rank` im JSON (Schema v3). Float-Drift triggert
  `normalizeKanbanRanks()` auf ganzzahlige Reindizierung.
- Blockierte Karte: amber Border + eine Zeile `wartet auf: X, Y`

### Mind Map
- SVG, auto-generiert aus gefilterten Daten
- Module radial um Zentrum, Features als kleinere Nodes
- **Drag-bare Nodes** — Overrides sind Session-State (`mindmapOverrides`).
  Pinnen promotet sie in `project.meta.mindmapPositions` (persistent).
- Wheel zoomt, Drag auf leerer Fläche pant

### Gantt
- Horizontale Balken pro Feature, gruppiert nach Modul
- Zeitachse in Wochen (aus `ganttStart`/`ganttEnd` im JSON)
- Gestrichelte Finish-to-Start Pfeile für Dependencies
- Heute-Marker aus `meta.today` (Woche, optional)
- **Bar-Drag (horizontal verschieben) + rechte Resize-Kante** → `setFeatureGantt`
- **Das ist der einzige View wo Deps vollständig visualisiert werden**

## Persistenz

Im Desktop-Build läuft Laden/Speichern über Electron-IPC
(`electron/main.ts` ↔ `src/lib/persistence.ts`):

- **Dev** (Vite Dev-Server aktiv): Datei liegt unter `./data/project.json`
  im Repo – so kann Claude Code live mitlesen/schreiben.
- **Packaged Build** (AppImage/exe): Datei liegt unter
  `app.getPath('userData')/data/project.json` (auf Linux z.B.
  `~/.config/lodestar/data/project.json`), weil `app.asar` read-only ist.
- **Browser-Build**: Fallback auf `localStorage` unter dem Key
  `projekt-planner:project:v1`.

`electron/main.ts` beobachtet die Datei mit `fs.watch` und schickt
`project:external-change`, wenn jemand anders (z.B. Claude Code) sie
editiert. Wenn gerade ein Drawer offen ist, wird der Reload deferred
(`externalChangePending`) und der User entscheidet wann er pullt —
dafür gibt's den `ExternalChangeBanner`.

## GitHub / Deployment

### Electron (Desktop, primärer Fall)
```bash
npm run electron:dev            # Dev-Modus (Vite + Electron mit HMR)
npm run electron:build          # baut AppImage + portable .exe nach ./release/
```

CI/CD: `.github/workflows/release.yml` – läuft bei Tag-Push (`v*`)
matrix-parallel auf Ubuntu + Windows und hängt die Artefakte an den
GitHub-Release.

### Web (sekundär, ohne Filesystem)
```bash
npm run build                   # dist/
```
Daten über `localStorage`, Import/Export als JSON-File.

### Tests
```bash
npm run typecheck                               # strict tsc, kein Emit
npm test                                        # Vitest — deps.ts, validate.ts, schema.ts (53 Tests)
python3 tests/playwright/smoke.py <dev-url>     # 13-Test Smoke-Suite (Quick-Check)
python3 tests/playwright/run_all.py <dev-url>   # 17 Feature-Suiten (~2–3 min)
```
Unit-Tests decken pure `src/lib/`-Module. Die Playwright-Harness deckt
interaktives Verhalten aller Views, Kontextmenüs, DnD, Keyboard, Persistenz
und Undo/Redo ab — Voraussetzung ist ein laufender Dev-Server
(`npm run dev` oder `npm run electron:dev`). Harness-Konventionen stehen
in [`AI_PLAYWRIGHT.md`](./AI_PLAYWRIGHT.md).

## Wie man das mit Claude bearbeitet

Claude kann `data/project.json` direkt lesen und schreiben.

**Beispiele:**
```
"Füge ein Feature 'OAuth2 Provider' zum Auth Modul hinzu, Effort M, Milestone v0.2"
"Verschiebe alle v0.3 Features nach v0.4 – wir brauchen mehr Zeit"
"Sync Engine braucht noch eine runtime-Dep auf Metadata Index"
"Zeig mir alle Features mit Dep-Konflikten"
"Generiere ein neues project.json für ein Blog-Engine-Projekt"
```

Claude Code liest das JSON, macht die Änderung, schreibt es zurück.
Die laufende App lädt den neuen Stand automatisch über den File-Watcher.

## Was NICHT gebaut wird (v1)

- Multi-User / Collaboration
- Backend / Datenbank
- Treemap View
- Epic → Story → Task View
- Auto-Scheduling (Milestones automatisch verschieben bei Dep-Konflikten)
- Mehrfach-Selection (Ctrl+Click) für Bulk-Operations
- Touch-Optimierung (Desktop-first)

Diese Features kommen in v2 wenn der Grundaufbau steht.

## Planungs- und Review-Dokumente

Über diese Spec hinaus leben im Repo-Root zwei lebende Planungsdateien —
wenn der User „bau v0.4" oder „mach die UX glatter" sagt, hier zuerst
nachsehen:

- [`UX_FINDINGS.md`](./UX_FINDINGS.md) — 50+ UX-Observations aus dem
  Playwright-Testpass, gruppiert nach Kategorie, mit den dicken Hebeln
  für einen Polish-Release am Ende.
- [`FEATURE_WISHLIST.md`](./FEATURE_WISHLIST.md) — neue Feature-Kandidaten
  (Multi-Select, Tags, Permalinks, Date-Picker, Activity-Log, …) mit
  Impact-Rating, Größen-Schätzung und einem v0.4 / v0.5 / v1.0 / v2
  Roadmap-Vorschlag.

`tests/playwright/FINDINGS.md` dagegen ist harness-scoped (was hat der
Testpass gefunden + was ist behoben); die beiden Root-Dateien sind
produkt-scoped.

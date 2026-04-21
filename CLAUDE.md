# Lodestar – Claude Code Spec

## Was ist das?

Ein lokales Projekt-Planungs-Tool speziell für Software-Projekte.
Daten leben in `data/project.json`. Keine Datenbank, kein Backend.

## Stack

- Vite + React 18 + TypeScript (strict)
- Zustand + Immer (State, 50-Step Undo)
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
  effort: Effort
  ms: string          // Milestone-ID z.B. "v0.1"
  ganttStart: number  // Woche (0-basiert)
  ganttEnd: number    // Woche (0-basiert)
  deps: Dep[]
  tasks: Task[]
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
  schemaVersion: number       // Migration-Version, siehe src/schema.ts
  milestones: Milestone[]
  today?: number              // Optional: Gantt-Heute-Marker (Woche)
}

type Project = {
  meta: ProjectMeta
  modules: Module[]
}
```

Jeder Load- und Save-Pfad läuft durch `migrate()` in `src/schema.ts` —
alte Shapes werden dort hochgehoben bevor Zod sie endgültig validiert.

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
├── src/
│   ├── App.tsx                 ← Layout, Tab-Switching, Shortcuts
│   ├── main.tsx                ← React-Einstieg
│   ├── index.css               ← Tailwind + @font-face
│   ├── types.ts                ← Datenmodell (oben)
│   ├── schema.ts               ← Zod-Schema + migrate()
│   ├── store/
│   │   └── useProjectStore.ts  ← Zustand-Store, Undo/Redo, Auto-Save
│   ├── lib/
│   │   ├── deps.ts             ← depStatus, isBlocked, blockedBy, findCycles
│   │   ├── persistence.ts      ← load/save/export/import (Electron | localStorage)
│   │   ├── validate.ts         ← Lint-Regeln für den Validation-Panel
│   │   ├── markdown.ts         ← winziger Markdown-Parser für Beschreibungen
│   │   ├── useKeyboardNav.ts   ← Pfeiltasten-Navigation
│   │   └── id.ts               ← nanoid-Wrapper
│   ├── data/
│   │   └── sample.ts           ← Fallback wenn kein project.json
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── CommandPalette.tsx  ← ⌘K
│   │   ├── HelpOverlay.tsx     ← ?
│   │   ├── MilestoneFilter.tsx ← Globaler MS-Filter
│   │   ├── StatusFilter.tsx    ← Ready / Blocked / Conflict
│   │   ├── StatusGlyph.tsx
│   │   ├── EffortBadge.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── TaskDrawer.tsx      ← Wiederverwendet in Roadmap + Gantt
│   │   ├── ModuleEditor.tsx
│   │   └── ValidationPanel.tsx ← zeigt Cycles, Conflicts, Dangling Deps
│   └── views/
│       ├── ModuleScope.tsx     ← Modul-Cards mit Feature-Rows
│       ├── Roadmap.tsx         ← Milestone-Spalten
│       ├── Kanban.tsx          ← Backlog / In Progress / Done
│       ├── MindMap.tsx         ← SVG, radial
│       └── Gantt.tsx           ← Wochen-Balken + Dep-Pfeile
```

## Dep-Logik (`src/lib/deps.ts`)

```typescript
type DepStatus = 'done' | 'conflict' | 'same' | 'open' | 'unknown'

// Status einer einzelnen Dep berechnen
function depStatus(project: Project, feat: Feature, dep: Dep): DepStatus
// done     = Dep-Feature 100% fertig
// conflict = Dep-Feature ist in SPÄTEREM Milestone → Warnung!
// same     = Dep-Feature ist im gleichen Milestone → koordinieren
// open     = Dep-Feature ist in früherem Milestone aber noch nicht fertig
// unknown  = Dep-ID zeigt auf ein nicht existierendes Feature

// Ist ein Feature momentan blockiert? (optional-Deps zählen nicht)
function isBlocked(project: Project, feat: Feature): boolean

// Welche Features blockieren es? (gibt die Feature-Objekte zurück)
function blockedBy(project: Project, feat: Feature): Feature[]

// Hat dieses Feature mindestens eine Dep im späteren MS?
function hasConflict(project: Project, feat: Feature): boolean

// Topologischer Zyklus-Check für den Validation-Panel
function findCycles(project: Project): { cycles: string[][] }
```

## Views – Verhalten

### Module Scope
- Grid der Module, jedes als Card mit Feature-Rows
- Pro Feature: Label | Effort-Badge | done/total | Progress-Bar
- Click auf Feature → Tasks expandieren (inline)
- **Keine Dep-Info sichtbar** – bewusst clean gehalten

### Roadmap
- Milestone-Spalten (gefiltert via globalem Filter)
- Features als klickbare Balken in ihrer Spalte
- Kleines `⚠` Symbol am Balken wenn Dep-Konflikt (Dep in späterem MS)
- Click → Task-Drawer öffnet sich darunter
- Task-Drawer zeigt: Tasks (abhakbar) + Dep-Hinweis falls Konflikt

### Kanban
- 3 Spalten: Backlog / In Progress / Done
- Sortierbar nach Modul oder Effort
- Milestone-Filter aktiv → maximal ~20 Karten sichtbar
- Blockierte Karte: amber Border + eine Zeile `wartet auf: X, Y`
- **Keine Dep-Details darüber hinaus**

### Mind Map
- SVG, auto-generiert aus gefilterten Daten
- Module radial um Zentrum, Features als kleinere Nodes
- Read-only – kein Editing hier

### Gantt
- Horizontale Balken pro Feature, gruppiert nach Modul
- Zeitachse in Wochen (aus `ganttStart`/`ganttEnd` im JSON)
- Gestrichelte Finish-to-Start Pfeile für Dependencies
- Heute-Marker aus `meta.today` (Woche, optional)
- Click → Task-Drawer
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
editiert – die UI lädt dann neu.

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

- Drag & Drop in Kanban
- Multi-User / Collaboration
- Backend / Datenbank
- Treemap View
- Epic → Story → Task View
- Auto-Scheduling (Milestones automatisch verschieben bei Dep-Konflikten)

Diese Features kommen in v2 wenn der Grundaufbau steht.

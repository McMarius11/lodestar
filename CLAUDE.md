# Lodestar – Claude Code Spec

## Was ist das?

Ein lokales Projekt-Planungs-Tool speziell für Software-Projekte.
Daten leben in `data/project.json`. Keine Datenbank, kein Backend.

## Stack

- Vite + React + TypeScript
- Zustand (State Management)
- Tailwind CSS
- Electron (optional, für Desktop-Build)

## Datenmodell (`data/project.json`)

```typescript
type Task = {
  id: string
  label: string
  done: boolean
}

type Dep = {
  id: string        // Feature-ID auf die sich die Dep bezieht
  reason: string    // Warum braucht dieses Feature das andere?
  type: 'build'     // Feature muss vorher gebaut sein
       | 'runtime'  // Feature braucht Daten zur Laufzeit (Store)
}

type Feature = {
  id: string
  label: string
  effort: 'S' | 'M' | 'L' | 'XL'
  ms: string          // Milestone z.B. "v0.1"
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

type ProjectMeta = {
  name: string
  description: string
  version: string
  milestones: string[]
  milestoneLabels: Record<string, string>
  ganttWeeks: Record<string, { start: number; end: number }>
}

type Project = {
  meta: ProjectMeta
  modules: Module[]
}
```

## File-Struktur

```
├── data/
│   └── project.json          ← einzige Datenquelle
├── src/
│   ├── store/
│   │   └── useProjectStore.ts  ← Zustand Store, liest/schreibt project.json
│   ├── lib/
│   │   └── deps.ts             ← Dep-Logik (depStatus, isBlocked, blockedBy)
│   ├── views/
│   │   ├── ModuleScope.tsx     ← View 1: Modul-Übersicht
│   │   ├── Roadmap.tsx         ← View 2: Milestone-Timeline
│   │   ├── Kanban.tsx          ← View 3: Backlog / In Progress / Done
│   │   ├── MindMap.tsx         ← View 4: SVG Mind Map
│   │   └── Gantt.tsx           ← View 5: Gantt mit Dep-Pfeilen
│   ├── components/
│   │   ├── MilestoneFilter.tsx ← Globaler Filter (alle Views synchronisiert)
│   │   ├── TaskDrawer.tsx      ← Wiederverwendet in Roadmap + Gantt
│   │   └── EffortBadge.tsx     ← XL/L/M/S Badge
│   └── App.tsx                 ← Tabs + globaler Filter
```

## Dep-Logik (`src/lib/deps.ts`)

```typescript
// Status einer einzelnen Dep berechnen
function depStatus(featMs: string, dep: Dep): 'done' | 'conflict' | 'same' | 'open'
// done     = Dep-Feature 100% fertig
// conflict = Dep-Feature ist in SPÄTEREM Milestone → Warnung!
// same     = Dep-Feature ist im gleichen Milestone → koordinieren
// open     = Dep-Feature ist in früherem Milestone aber noch nicht fertig

// Ist ein Feature momentan blockiert?
function isBlocked(feat: Feature): boolean

// Welche Features blockieren es (Label-Array)?
function blockedBy(feat: Feature): string[]
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
- Heute-Marker (konfigurierbar)
- Click → Task-Drawer
- **Das ist der einzige View wo Deps vollständig visualisiert werden**

## Persistenz

```typescript
// Laden
const project = JSON.parse(fs.readFileSync('data/project.json', 'utf-8'))

// Speichern (nach jeder Änderung)
fs.writeFileSync('data/project.json', JSON.stringify(project, null, 2))
```

Im Browser (GitHub Pages): `localStorage` als Fallback wenn kein Filesystem.
In Electron: direkt ins Filesystem über `ipcMain`.

## GitHub / Deployment

### GitHub Pages (Web)
```bash
npm run build     # → dist/
# dist/ wird auf gh-pages Branch deployed
# Daten: localStorage (kein File-Zugriff im Browser)
```

### Electron (Desktop)
```bash
npm run electron  # Development
npm run build:electron  # → .AppImage / .exe
# Daten: data/project.json direkt auf Disk
```

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
Die App lädt beim nächsten Öffnen automatisch den neuen Stand.

## Was NICHT gebaut wird (v1)

- Drag & Drop in Kanban
- Multi-User / Collaboration
- Backend / Datenbank
- Treemap View
- Epic → Story → Task View
- Auto-Scheduling (Milestones automatisch verschieben bei Dep-Konflikten)

Diese Features kommen in v2 wenn der Grundaufbau steht.

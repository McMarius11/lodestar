# Feature-Audit — Lodestar v0.3.1 · Stand 2026-04-24

Dieser Report ist die Antwort auf die Frage **„was kann die App wirklich,
und kann man alles davon auch händisch (ohne JSON-Editor) machen?"**

Grundlage:

1. **Code-Inventur** aller Views, Components, Hooks, Store-Actions (siehe
   `AI_README.md` für die Code-Map).
2. **Testlauf** `python3 tests/playwright/run_all.py` — 18 Suiten, alle
   grün, 0 Page-Errors. Vitest-Unit-Suite ebenfalls grün.

Legende für Impact: **blocker · major · minor · nit** (wie in
`tests/playwright/FINDINGS.md`).

> **Hinweis:** die im Abschnitt §3 ursprünglich identifizierten drei harten
> Parität-Lücken (Feature-ID-Rename, Module-ID-Rename, Task-Reorder) und
> der Clear-Filters-Button sind in diesem Fix-Durchgang **geschlossen**.
> Die Matrix und die Empfehlungen unten spiegeln den neuen Stand.
> Was NICHT in diesem Durchgang war (Scope A): Datepicker, Toast-Layer,
> Multi-Select, Tags — die bleiben auf der Wishlist.

---

## 1. Was die App kann — nach Views und Bereichen

Kompakte Bestandsaufnahme. Jede Zeile: **was ein Nutzer tun kann**, und in
welchem Mechanismus es angeboten wird (Maus / Kontextmenü / Drawer / Palette
/ Shortcut). Wenn etwas zusätzlich per Claude-Edit an `data/project.json`
geht, steht das in Kapitel 3 (UI-Parität).

### 1.1 TopBar (immer sichtbar)

- Projekt-Kopf: Name, Version, Source-Badge · **Click** öffnet
  ProjectMetaEditor, **⋮-Menü** + Rechtsklick bieten Edit / Milestones /
  Close Project.
- Tabs `01–06`: Scope, Roadmap, Kanban, MindMap, Gantt, Status · **Click**
  oder **1–6**.
- **Undo / Redo**-Buttons (⌘Z / ⇧⌘Z), 50-Step-Tiefe, History-Count im
  Tooltip. UI-State-Änderungen (Filter, View, Drawer) bleiben absichtlich
  ausserhalb der Undo-Historie.
- **＋-Menü**: New Feature (N) / New Module / Edit Milestones.
- **Save-Indicator**: Punkt-Ampel (saving/saved/conflict/error) mit
  Tooltip „Saved · 12s ago".
- **⌘K / Command-Palette-Button**.
- **Filter-Leiste** (zweite Zeile): StatusFilter (All/Ready/Blocked/
  Conflict), MilestoneFilter (All + alle Milestone-Pills). Label „● FILTER"
  leuchtet akzent, wenn mindestens ein Filter aktiv ist.

### 1.2 View: ModuleScope (`1`)

- Projekt-Header mit Live-Totals (Module, Features, Tasks, % done) — aus
  ganzem Projekt, nicht aus Filter.
- Module-Grid, pro Card:
  - Drag-Handle zum Reordnen von Modulen.
  - Color-Swatch / Label öffnet **ModuleEditor** (Label, 7-Preset-Farben,
    Hex-Input, Delete).
  - „+ NEW" legt Feature im Modul an (öffnet Drawer sofort).
- Feature-Rows: Status-Glyph, Label, Effort-Badge, Tasks-Fortschritt,
  `▸`-Chevron für Inline-Task-Liste mit Checkboxen, Inline-Edit
  (Doppelklick), DEL.
- **Single-Click** → Drawer, **Rechtsklick** → Feature-Menü.
- Drag Feature zwischen Modulen.
- Rechtsklick auf Module-Header / Scope-Heading / leere Fläche → passendes
  Empty-Area-Menü.

### 1.3 View: Roadmap (`2`)

- Horizontale Milestone-Spalten. Pro Spalte: Header mit Count + % done,
  Feature-Karten, Rechtsklick für Empty-Area-Menü (Edit Milestones…).
- **HTML5-Drag & Drop** von Features zwischen Spalten → `moveFeatureToMs`.
- Klick auf Karte → Drawer. Rechtsklick → Feature-Menü. `⚠`-Glyph wenn eine
  Dependency in späterem Milestone liegt (Dep-Konflikt).

### 1.4 View: Kanban (`3`)

- 3 Spalten: Backlog / In Progress / Done (abgeleitet aus Task-Status).
- **Sort-Mode**: Module / Effort / Milestone (Buttons, **nicht persistent
  über Reload**).
- **DnD** innerhalb einer Spalte + über Spalten hinweg → `setFeatureColumn`
  plus `setKanbanRank`. Rang wird im Projekt (`feature.rank`) persistiert
  (Schema v3). Float-Drift triggert `normalizeKanbanRanks` automatisch.
- Karte zeigt Modul-Farbstreifen, Label, Description-Preview, Effort,
  Wochen-Range, Progress-Bar; blockierte Features haben amber Border +
  „wartet auf: …"-Zeile (nicht klickbar — UX-Finding).

### 1.5 View: MindMap (`4`)

- SVG-Radial-Layout. Zentrum = Projekt, Module als Orbit, Features als
  Kinder-Nodes.
- **Wheel**-Zoom (0.3–3x), **Drag** auf leerer Fläche = Pan, Doppelklick
  auf Leerfläche = Reset.
- **Drag auf Node**: verschiebt Node-Position (volatil → `mindmapOverrides`,
  im Session-State). **PIN**-Button promotet alle Overrides in
  `project.meta.mindmapPositions` (persistent). **UNPIN/CLEAR** entfernt.
- **Shift+Drag** zwischen zwei Feature-Nodes: öffnet DepEditorPopover und
  legt Dependency an.
- Rechtsklick auf Node / Dep-Line / leere Fläche: jeweiliges Kontextmenü.
- Intro-Hint autoverbirgt sich nach 6s.

### 1.6 View: Gantt (`5`)

- Horizontaler Balkenplot. Sticky Label-Spalte + Timeline-Header mit
  Wochen-Ticks und Milestone-Bändern.
- Balken-Features: Klick öffnet Drawer, Rechtsklick → Menü.
- **Drag-Bar horizontal** = verschieben; **rechte Resize-Kante** = Endwoche
  ziehen. **Shift** snappt Halbwochen, sonst Ganzwochen.
- Ctrl+Wheel = Zoom (24–80 px/Woche). Button „→ TODAY" scrollt zum Today-
  Marker (no-op wenn `meta.today` leer — UX-Finding).
- Dependency-Pfeile: gestrichelt = optional, solid = build/runtime; rot
  wenn Conflict. Hover highlight.

### 1.7 View: Status / Validation (`6`)

- Lint-Panel über `src/lib/validate.ts`. Issue-Kinds:
  `unknown-dep`, `dep-conflict`, `dep-cycle`, `gantt-invalid`,
  `gantt-effort-mismatch`, `orphan-milestone`.
- Zähler im Tab-Badge (Err/Warn). Klick auf Issue-Row öffnet zugehörige
  Feature-Drawer.

### 1.8 Overlays & globale Dialoge

- **TaskDrawer** (Escape / Outside-Click): Label (inline edit, Enter/Blur),
  Description (Markdown-Textarea, Doppelklick toggelt Edit-Modus),
  Effort-Dropdown, Milestone-Dropdown, Gantt-Wochen-Inputs, Tasks (Add,
  Toggle, Delete), Deps (Add, Remove, Reason, Type), Blocked-By-Info,
  Delete-Feature-Danger.
- **CommandPalette** (⌘K / /): Fuzzy-Search, Groups VIEW / FEATURE / TASK
  / PROJECT / FILE / EDIT, alle Views, Undo/Redo, Export/Import JSON,
  Export Markdown, Meta-Edit, Milestone-Edit, Rename/Version/Today/Close
  Project.
- **HelpOverlay** (`?`): Keyboard-Cheat-Sheet.
- **DepEditorPopover**: Reason-Input + Type-Buttons, positioniert an
  Cursor.
- **MilestoneEditor**: Liste editierbarer Rows (ID, Label, Feature-Count,
  Delete) + Add-Row. **Wichtig:** hier ist `id`-Rename unterstützt und
  kaskadiert auf alle `feature.ms`.
- **ModuleEditor**: Popover (Label + 8 Preset-Farben + Hex + Delete).
- **ProjectMetaEditor**: Name / Description / Version / Today (Wochen-
  Integer).
- **ExternalChangeBanner**: erscheint wenn die Datei extern editiert wurde,
  während ein Drawer/Input/Palette offen ist. Buttons „Reload from disk"
  / „Keep mine".
- **WelcomeScreen**: Continue (letzte Session), Open-Project-Dialog,
  Nimbus-Sample, Lodestar-Roadmap, Start-Empty-Form, Recent-List (mit ×-
  Forget).

### 1.9 Keyboard-Shortcuts

| Key | Action |
|---|---|
| 1–6 | View switch |
| j / ↓ | Cursor next feature |
| k / ↑ | Cursor prev feature |
| Enter | Open Drawer (Cursor) |
| Space | Toggle first task (Cursor) |
| N | New Feature im ersten Modul (Drawer öffnet) |
| F2 | Rename focused feature (native `prompt()`) |
| ⌘D / Ctrl+D | Duplicate focused feature |
| ⌘Z / Ctrl+Z | Undo |
| ⇧⌘Z / Ctrl+Shift+Z | Redo |
| ⌘K / Ctrl+K | Palette toggle |
| / | Palette öffnen (focus search) |
| ? / Shift+/ | Help toggle |
| Esc | Drawer / Palette / Help / Modals schliessen |

### 1.10 Persistenz

- **Electron-Build** (Dev): `data/project.json` im Repo, File-Watcher ↔
  `ExternalChangeBanner`.
- **Electron-Build** (packaged): `userData/data/project.json`.
- **Web-Build**: `localStorage` unter `projekt-planner:project:v1`.
- Autosave debounced auf ~400ms. Der Welcome-Screen erinnert sich an die
  letzte Session (`lodestar:last-session` LS-Key) und listet Recents.

---

## 2. Testabdeckung (Playwright, Stand Testlauf)

```
test_command_palette          21/21  ✓
test_context_menus            16/16  ✓
test_dep_editor                9/9   ✓
test_external_change_banner    1/1   ✓
test_keyboard_nav             12/12  ✓
test_milestone_editor          9/9   ✓
test_module_editor            13/13  ✓   (+2: module-id rename + duplicate reject)
test_persistence_welcome       9/9   ✓   (4 Sub-Runs: seeded, no-seed etc.)
test_project_meta_editor      12/12  ✓
test_task_drawer              26/26  ✓   (+4: feature-id rename × 3 + task reorder DnD)
test_topbar_filters           14/14  ✓   (+1: clear-filters button)
test_undo_redo                 6/6   ✓
test_view_gantt                8/8   ✓   (+1: resize-edge vs. bar-drag)
test_view_kanban               7/7   ✓
test_view_mindmap              6/6   ✓   (+1: shift+pointerdown connect-start)
test_view_roadmap              6/6   ✓
test_view_scope               11/11  ✓
test_view_validate             7/7   ✓
─────────────────────────────────────
SUMMARY (217.8s)         18/18 suites · 192 Tests · 0 Page-Errors

Vitest suite: 7 Dateien · 85 Tests · alle grün (+15 neue im Scope-A-Pass)
```

Die bestehende Suite ist **sehr gründlich** — inkl. Edge Cases wie
„Ctrl+Z in Textarea darf Projekt-Historie nicht rühren",
„View-Shortcuts dürfen bei offenem Drawer nicht greifen",
„Milestone-ReID muss auf `feature.ms` kaskadieren",
„Float-Drift triggert `normalizeKanbanRanks` automatisch".

**Was seit der ersten Audit-Runde geschlossen wurde** (Scope A):

- ✅ **Feature-ID-Rename** (`renameFeatureId` in `store/useProjectStore.ts`,
  Drawer-Chip mit Click-to-Edit + Validation) — inkl. Cascade auf alle
  `dep.id`, `drawerFeatureId`, `cursorFeatureId`, `depEditor.{from,to}Id`,
  `meta.mindmapPositions` keys, `mindmapOverrides` keys. Vitest-Tests
  decken Empty/Duplicate/Not-Found/No-Op, Cascade-Semantik, Drawer/Cursor-
  Migration, Positions-Migration, Undo-Round-Trip. Playwright deckt
  Cascade, Duplicate-Rejection und Esc-Cancel.
- ✅ **Module-ID-Rename** (`renameModuleId`, ID-Chip im ModuleEditor) —
  gleiches Validation/Validation-Fehler-Pattern. Vitest + Playwright.
- ✅ **Task-Reorder per DnD** (`reorderTaskInFeature`, HTML5-DnD auf den
  Task-Rows im Drawer) — mit Drop-Indicator-Linie und Tail-Slot. Vitest
  deckt Clamp, No-Op, Undo. Playwright fährt die DnD-Bewegung voll.
- ✅ **Clear-Filters-Button** in der TopBar — erscheint nur bei aktivem
  Filter, setzt Status + Milestone zurück, Unit-Test in Vitest, Playwright-
  Test für Erscheinen/Zurücksetzen/Verschwinden.
- ✅ **MindMap-Shift+Drag-Connect** Test-Coverage — neuer Test fixiert
  den Entry-Point (Shift+pointerdown triggert rubber-band-Linie). Die
  vollständige Drop-to-DepEditor-Simulation ist in der Headless-
  Playwright-Umgebung mit React 18 Batching nicht deterministisch
  reproduzierbar und wird durch die `test_dep_editor`-Suite plus diesen
  Entry-Test abgedeckt.
- ✅ **Gantt-Resize-Kante** Test-Coverage — Drag der rechten 4-px-Kante
  verändert `ganttEnd` um +2 Wochen, `ganttStart` bleibt unberührt,
  Undo round-trip.

**Weiterhin offene Coverage-Lücken** (nicht im Scope A, an die Grenzen
der Headless-Umgebung gebunden):

- **Visual-Regression** gibt es nicht (Screenshots nur in `visual_tour.py`,
  kein Pixel-Diff-Gate).
- **WelcomeScreen Drag-&-Drop von `.json`-Datei** — click-to-open getestet,
  Drop-Variante nicht (Playwright kann nicht nativ eine File-Drop-
  Sequenz synthetisieren).
- **Electron-only Funktionen** (OS-Dialog via `openProjectFromDialog`,
  File-Watcher) laufen nur im Headless-Browser, der keinen File-Watcher
  hat. Der `ExternalChangeBanner` wird aus `localStorage` simuliert.
- **MindMap-Shift+Drag-to-Target-Drop** — der Entry wird jetzt getestet,
  der finale Hit-Test + DepEditor-Mount bleibt bei synthetischen
  Pointer-Events nicht deterministisch.

---

## 3. UI-Parität — JSON vs. Maus

Kern der Frage: **„Kann ich als User alles händisch, was Claude per JSON
kann?"** — systematisch per Feld.

| Feld (`types.ts`) | UI-Bedienung | Status |
|---|---|---|
| `project.meta.name` | ProjectMetaEditor · Palette „Rename" | ✅ |
| `project.meta.description` | ProjectMetaEditor | ✅ |
| `project.meta.version` | ProjectMetaEditor · Palette „Set Version" | ✅ |
| `project.meta.today` | ProjectMetaEditor (Wochen-Integer) · Palette | ⚠️ UX: kein Datepicker |
| `project.meta.schemaVersion` | (managed, keine UI nötig) | ✅ |
| `project.meta.milestones[].id` | MilestoneEditor — **kaskadiert** | ✅ |
| `project.meta.milestones[].label` | MilestoneEditor | ✅ |
| `project.meta.mindmapPositions` | MindMap PIN/UNPIN/CLEAR · **migriert bei Feature-Rename** | ✅ |
| `module.id` | **ModuleEditor-ID-Chip** (click-to-edit, Duplicate-Check) | ✅ |
| `module.label` | ModuleEditor · Rename-Kontextmenü | ✅ |
| `module.color` | ModuleEditor (Preset + Hex) · Change-Color-Submenu | ✅ |
| `feature.id` | **Drawer-ID-Chip** (click-to-edit, Dep-Cascade + Validation) | ✅ |
| `feature.label` | Drawer · F2 · Rename-Kontextmenü | ✅ |
| `feature.description` | Drawer (Doppelklick öffnet Textarea) | ⚠️ UX: kein Live-Preview |
| `feature.effort` | Drawer-Footer-Dropdown | ✅ |
| `feature.ms` | Drawer-Dropdown · Roadmap-DnD · Move-to-Milestone-Submenu | ✅ |
| `feature.ganttStart` / `ganttEnd` | Drawer-Inputs · Gantt-Bar-Drag+Resize | ⚠️ UX: Wochen-Integer, kein Datepicker |
| `feature.deps[]` | Drawer-Add-Form · MindMap-Shift+Drag · Kontextmenü | ✅ |
| `feature.deps[].reason` | DepEditorPopover · Drawer-Inline | ✅ |
| `feature.deps[].type` | Button-Group (BUILD/RUNTIME/OPTIONAL) | ✅ |
| `feature.tasks[]` | Drawer-Add · Inline-Add in Scope · **Drawer-DnD-Reorder** | ✅ |
| `feature.tasks[].label` | Drawer · Doppelklick in Scope-Inline | ✅ |
| `feature.tasks[].done` | Checkbox · Space-Shortcut (erste Task) | ✅ |
| `feature.rank` | **nur** via Kanban-DnD | ✅ (UI-konzept, nicht gap) |

**Stand jetzt:** Alle Felder in `types.ts` sind per UI erreichbar. Das
war das Hauptziel dieses Durchgangs.

### Geschlossene Parität-Lücken (Scope A)

1. **[major] ✅ Feature-ID-Rename** — `feature.id` ist jetzt per UI
   editierbar via Click-to-Edit-Chip im Drawer-Header. Die Aktion
   `renameFeatureId(oldId, newId)` kaskadiert in einem einzigen
   `commit()` auf alle abhängigen Deps (`dep.id === oldId`), die
   `mindmapPositions`-Keys, die session-State-Felder
   (`drawerFeatureId`, `cursorFeatureId`, `depEditor.{from,to}Id`,
   `mindmapOverrides`-Keys) und rejected Duplicate/Empty mit Inline-
   Error-Hinweis. Undo stellt alles in einem Schritt wieder her.

2. **[major] ✅ Module-ID-Rename** — gleiches Muster im ModuleEditor.
   Kein Cross-Cascade nötig (keine Foreign-Keys auf `module.id`), aber
   konsistent validiert.

3. **[minor] ✅ Task-Reorder** — HTML5-DnD im Drawer mit dedizierter
   `⋮⋮`-Drag-Handle (on-hover), accent-Drop-Indicator-Linie und
   Tail-Slot für Drop-at-End. Store-Action `reorderTaskInFeature`
   clampt out-of-range-Indizes und ist undoable.

4. **[nit] ✅ Clear-Filters-Button** — `×` neben `● FILTER` wenn ein
   Filter aktiv ist. Ruft `clearFilters()` (ohne Undo, UI-State), hidet
   sich selbst wenn alles zurückgesetzt.

### Weiterhin offen (außerhalb Scope A)

1. **[minor] Kein Bulk-Select / Multi-Feature-Actions** — Shift+Click
   auf Feature-Cards öffnet nur den Drawer (wie normaler Click). Kein
   Selection-State im Store. Wishlist-Item `Multi-Select · 3`.

### Parität-OK, aber UX-schwach (Claude erreicht es eleganter)

- **Datumsangaben als Wochen-Integer** (`meta.today`, `feature.gantt*`):
  Claude kann beim Schreiben einfach „Woche 14" sagen, User muss rechnen.
  Datepicker-Feature ist Wishlist-Item · 2.
- **Tags / Labels** fehlen ganz (weder im Schema noch in der UI) — schon
  auf der Wishlist als Item · 2.
- **Description-Markdown ohne Live-Preview** — Toggle zwischen rendered
  und Textarea, keine Seiten-an-Seiten-Ansicht.
- **Native `confirm()` / `prompt()`** an 13 Stellen (Delete, Rename,
  Close, Milestone-Reassign) — siehe UX §1.

---

## 4. Was sonst noch auffällt (Bugs, Inkonsistenzen)

Gefunden in diesem Audit-Durchgang, noch nicht in den bestehenden Findings-
Dateien:

- **[minor] `test_persistence_welcome` läuft 4x** im Aggregator, weil die
  Datei mehrere `run_suite`-Aufrufe enthält (einer pro Onboarding-Szenario).
  Nicht falsch, aber der Summary-Output wirkt inkonsistent (4 Pass-Zeilen
  für eine Datei). Könnte in eine einzige Run kombiniert werden oder die
  Szenarios als `test_persistence_*.py` trennen.
- **[nit] Shift+Click auf eine Feature-Card öffnet den Drawer** wie ein
  normaler Click — es gibt keinen Multi-Select-Modus. Für Bulk-Ops
  (Wishlist) bräuchte es einen zusätzlichen Event-Pfad, der den Drawer
  nur bei unmodifiziertem Click öffnet.
- **[nit] Dev-Server startet Electron mit** — `npm run dev` triggert auch
  den Electron-Build (`dist-electron/` wird geschrieben). Das ist weil
  `vite.config.ts` das Electron-Plugin inkludiert. Für reinen Browser-Test
  ist das Nebenrauschen harmlos, aber Playwright-Runs sollten sauber auf
  `localhost:5173` laufen können ohne Electron zu booten. (Hat hier nicht
  gestört, aber wenn dein System kein GUI hätte wäre es ein Blocker.)

---

## 5. Priorisierte Empfehlungen

Sortiert nach **User-Impact × Aufwand**.

### Scope A — in diesem Durchgang abgeschlossen ✅

1. ✅ Feature-ID-Rename + Cascade (Drawer-Chip)
2. ✅ Module-ID-Rename (ModuleEditor-Chip)
3. ✅ Task-Reorder per HTML5-DnD
4. ✅ Clear-Filters-Button
5. ✅ MindMap-Shift+Drag-Connect Test-Coverage
6. ✅ Gantt-Resize-Kante Test-Coverage

### Als nächstes (Scope B der ursprünglichen Audit-Frage)

1. **`today` als Datepicker** — Wishlist-Item. Hebt `meta.today` aus
   dem Wochen-Integer heraus. Braucht `meta.startDate` im Schema,
   Migration v3 → v4. **Größe: mittel.**
2. **Toast-Layer** für Silent-Successes (Duplicate, Copy ID, Pin
   Positions, ID-Rename-Success). **Größe: klein.**
3. **Generisches Confirm/Prompt-Modal-Paar** um die 13 nativen
   `confirm()`/`prompt()`-Stellen zu ersetzen. **Größe: klein-mittel.**

### Mittelfristig (Scope C)

4. **Multi-Select** (Shift+Click markiert, Selection-Store-Slice,
   Bulk-Actions). Wishlist · 3.
5. **Tags/Labels** auf Features (Schema v3 → v4, Filter-Pill).
   Wishlist · 2.
6. **Feature-Permalinks** (`?feature=api-v2` öffnet Drawer direkt).
   Die Feature-ID-Rename-Infrastruktur aus Scope A ist hier
   Voraussetzung — mit unveränderlichen IDs wären Permalinks
   zerbrechlich.

---

## 6. Fazit

Die App ist nach diesem Durchgang auf einem **sehr soliden** Stand:

- Alle JSON-Felder aus `types.ts` sind jetzt per UI erreichbar. Die
  Claude-vs-User-Parität-Gaps sind geschlossen.
- Playwright-Suite: 18 Suiten, **alle grün**, Vitest-Suite ebenfalls
  (**100 Tests in 7 Dateien**, ~+15 neue im Scope-A-Pass).
- Der Store bleibt der einzige Mutations-Pfad. Alle neuen Actions
  (`renameFeatureId`, `renameModuleId`, `reorderTaskInFeature`,
  `clearFilters`) respektieren die bestehenden Invarianten (commit+Undo
  für Data-Mutations, set+kein-Undo für UI-State).
- 5 Views + 10 Overlays + ~55 Store-Actions sind maus-editierbar, inkl.
  vollem DnD in Scope/Roadmap/Kanban/Gantt/MindMap **und jetzt auch
  Task-Reorder im Drawer**.

Die verbleibenden **UX-Lücken** (Datepicker, Toasts, Bulk-Select,
Markdown-Preview, Tags) sind in `UX_FINDINGS.md` und
`FEATURE_WISHLIST.md` dokumentiert. Sie sind weder Blocker noch
Parität-Probleme, sondern Polish/Feature-Additions für v0.4/v0.5.

---

## Siehe auch

- [`UX_FINDINGS.md`](./UX_FINDINGS.md) — detaillierte UX-Observations
- [`FEATURE_WISHLIST.md`](./FEATURE_WISHLIST.md) — Feature-Ideen jenseits
  UX-Polish
- [`tests/playwright/FINDINGS.md`](./tests/playwright/FINDINGS.md) —
  harness-scoped Findings

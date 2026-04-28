# Code-Review — Lodestar v0.3.1 · Stand 2026-04-28

Frischer Audit-Pass über `useProjectStore`, `lib/`, alle fünf Views,
Komponenten, Hooks, Electron-Main + Preload, sowie `tsconfig.json` /
`vite.config.ts` / CI-Workflow. Basis: HEAD `afac1c2`.

Bereits dokumentierte UX/Feature-Lücken in
[`UX_FINDINGS.md`](./UX_FINDINGS.md), [`FEATURE_AUDIT.md`](./FEATURE_AUDIT.md)
und [`FEATURE_WISHLIST.md`](./FEATURE_WISHLIST.md) sind aus dem Scope
ausgeschlossen — dieser Review meldet nur **Neues**.

Severity-Legende wie in `tests/playwright/FINDINGS.md`:
**blocker · major · minor · nit**.

---

## Was geprüft wurde

- **Store** `src/store/useProjectStore.ts` — alle Actions, `commit`-
  Invariante, `_pushHistory`/`_persist`-Sequenz, `resetProjectSessionState`
- **Lib** `src/lib/{deps,validate,persistence,markdown,featureActions,
  recentFiles,lastSession,sessionTracking,editable,id}.ts`
- **Schema** `src/schema.ts` — Migration v1→v2→v3, Zod-Validation
- **Views** `src/views/*.tsx` — DnD, Hooks-Hygiene, A11y
- **Komponenten** `src/components/*.tsx` — Drawer, Palette, ContextMenu,
  Editoren, Banner
- **Hooks** `src/hooks/*.ts` — Filter, Layout, Keyboard, Zoom
- **Electron** `electron/main.ts`, `electron/preload.ts` — Security,
  IPC-Validation, File-Watcher
- **Build** `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
  `package.json`, `.github/workflows/release.yml`

---

## Bugs

### [major] ✅ `deleteFeature` lässt UI-State auf gelöschte ID zeigen
**Datei:** `src/store/useProjectStore.ts:776`
Der ursprüngliche `commit` clearte nur `drawerFeatureId`. Verwaist blieben:
`cursorFeatureId` (Keyboard-Nav zeigt auf Phantom), `depEditor.{from,to}Id`,
`mindmapOverrides[id]`, `meta.mindmapPositions[id]` (persistiert!).

**Fix:** Alle vier Felder im selben `commit` aufräumen, analog zur
Cascade in `renameFeatureId`. Vitest-Tests in
`useProjectStore.test.ts` decken: Drop incoming deps, Clear UI-State,
Don't touch unrelated state, Single-Frame-Undo.

### [major] ✅ `deleteModule` kaskadiert Deps, aber nicht UI-State + MindMap-Positions
**Datei:** `src/store/useProjectStore.ts:860`
Der `removedIds`-Set wurde berechnet und auf `feature.deps` angewendet,
aber nicht auf `drawerFeatureId`, `cursorFeatureId`, `depEditor.{from,to}Id`,
`mindmapOverrides`-Keys oder `meta.mindmapPositions`-Keys.

**Fix:** Pro Eintrag in `removedIds` alle fünf Felder cleanen. Tests
decken: Module entfernt + Deps gepruned, UI-State gecleart, andere
Module bleiben unberührt.

### [major] ✅ `deleteMilestone` kaskadiert nicht — Features werden silently orphan
**Datei:** `src/store/useProjectStore.ts:978`
Features mit `f.ms === id` zeigten nach Delete auf eine nicht
existierende Milestone-ID. Folge: Roadmap blendet sie stumm aus,
`activeMilestone`-Filter zeigt „leer" obwohl Features existieren.

Der `MilestoneEditor` reassigned vorher per `prompt()`-Dialog, aber
direkte Wege (Command-Palette, externe JSON-Edits, Undo-Replay)
umgingen das.

**Fix:** Defensive Cascade direkt in der Action — orphaned Features
landen auf der ersten verbleibenden Milestone, `activeMilestone`
fällt auf `'all'` zurück. Wenn keine Milestone übrig ist, bleibt es
orphaned und der Validation-Panel flaggt es (`orphan-milestone`).

### [major] ✅ Electron `project:openPath` / `project:load` / `project:save` ohne Path-Hardening
**Datei:** `electron/main.ts:255` (sowie `:180` und `:196`)
Akzeptierten beliebigen String-Path, riefen `fs.readFile` /
`fs.writeFile` direkt. Keine `realpath`-Auflösung, keine
Extension-Prüfung, kein System-Path-Block. Realer Threat: ein
präparierter `data/project.json` (z.B. via Drag-Drop oder Sample)
+ irgendein Renderer-Code-Pfad könnte `projectAPI.openPath('/etc/passwd')`
oder `projectAPI.save(payload, '/home/user/.bashrc')` aufrufen.

**Fix:** Neue Helper `resolveProjectPath` macht
`fs.realpath` (bricht `..`-Tricks und Symlinks),
`path.extname() === '.json'`-Check, und blockt `/etc /proc /sys /dev
/boot`-Prefixes. Wird aus allen drei Handlern genutzt; bei
ungültigem Path return `INVALID_PATH`.

---

## Best-Practice-Findings

### [minor] ✅ Electron `webPreferences` explizit gehärtet
**Datei:** `electron/main.ts:138`
`sandbox` und `webSecurity` waren nicht explizit gesetzt. Defaults
sind in Electron historisch wackelig und je nach Major-Version
unterschiedlich.

**Fix:** `sandbox: true, webSecurity: true` ergänzt. Preload nutzt
nur `contextBridge`/`ipcRenderer`/`webUtils` — alle drei sind
sandbox-kompatibel, Smoke-Test passt.

### [minor] ✅ tsconfig — `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
**Datei:** `tsconfig.json:17`
`strict: true` ist gesetzt, beide Flags zusätzlich aktiv. Fängt
Off-by-one-Bugs bei Array-Access und macht den Unterschied
zwischen `x?: T` (Property fehlt) und `x: T | undefined`
(Property ist da, aber undefined) explizit.

**Fix:** Initial 88 Errors. Production-Code (`store`,
`persistence`, `components`, `hooks`, `views`) gefixt mit
genuinen Guards/Narrowings. Test-Files gefixt mit `!`-Asserts
auf bekannten Indices. `Project.meta.today`/`mindmapPositions`
und `Feature.description`/`rank` in `types.ts` explizit auf
`T | undefined` gesetzt, damit Zod's `.optional()`-Inferenz
zur Project-Typed-Annotation passt. Alle 96 Vitest-Tests bleiben
grün.

### [minor] Kein ESLint im Repo
**Datei:** `package.json`
`npm run typecheck` deckt Type-Fehler, aber **kein Lint** —
unused-vars, hooks-deps-rule, react/jsx-key etc. werden nicht
enforced. Der ContextMenu-Effect (`src/components/ContextMenu.tsx:117`)
hat schon ein `eslint-disable-next-line react-hooks/exhaustive-deps`
in einer Datei wo eslint nicht installiert ist — toter Comment.

**Status:** offen. Empfehlung: `eslint`,
`@typescript-eslint/parser`, `eslint-plugin-react-hooks`,
`eslint-plugin-jsx-a11y` einrichten. CI-Schritt vor `typecheck`.

### [minor] Playwright-Suite läuft nicht in CI
**Datei:** `.github/workflows/release.yml`
Vitest läuft in CI. Die 18-Suite Python-Playwright-Harness
(`tests/playwright/run_all.py`) läuft nur lokal. E2E-Regressions
werden im Release-Pipeline nicht gegated.

**Status:** offen. Headless-Linux-Browser + `python3
tests/playwright/run_all.py` lassen sich in einen Workflow-Step
gießen; 192 Tests, ~3 min.

### [nit] Electron 33 ist eine Major hinter aktueller Stable
**Datei:** `package.json:55`
Electron 33 ist von Q3/2024, aktueller Major ist 35. Keine
bekannten kritischen CVEs gegen 33, aber ein Update-Pass ist
fällig vor dem nächsten Release.

**Status:** offen.

### [nit] `tsconfig.json` warnt bei Build wegen `baseUrl`
**Datei:** `tsconfig.json:19`
`Option 'baseUrl' is deprecated and will stop functioning in
TypeScript 7.0`. Nicht akut, aber das `@/*`-Pfad-Mapping kommt
ohne `baseUrl` aus, wenn `paths` direkt mit relativen Pfaden
ab Projekt-Root spezifiziert wird.

**Status:** offen.

---

## Feature-Empfehlung (Top 3)

Basierend auf existierender Wishlist × neuen Audit-Beobachtungen.

### D1 · Toast / Notification-Layer — Wishlist · 2
**Warum jetzt:** Baseline-Infrastruktur. Bug A1/A2 oben löschen User-
sichtbar Daten — ein Toast „Feature gelöscht (Undo: ⌘Z)" wäre die
einzige Bestätigung, die der User aktuell nicht hat. Auch die elf
Silent-Successes (Duplicate, Copy-ID, Pin Positions, Rename-Success,
ID-Rename-Success, Bulk-Move…) hängen an dieser Schicht.
**Größe:** klein. Toast-Store-Slice (queue + auto-dismiss) +
`<ToastHost />` in `App.tsx`. Entry-Points: bestehende Actions
ergänzen `toast(...)`-Aufrufe.

### D2 · Confirm/Prompt-Modal-Paar — UX_FINDINGS §1
**Warum jetzt:** 13 native `confirm()`/`prompt()`-Stellen sind das
größte UX-Loch laut `UX_FINDINGS.md`. Außerdem: Bug A3
(`deleteMilestone`-Reassign-Flow im `MilestoneEditor`) nutzt
nativen `prompt()` — sobald wir Confirm/Prompt-Modals haben, wird
dieser Flow konsistent mit dem Rest der App.
**Größe:** klein-mittel. `useConfirm()` / `usePrompt()` Hook +
globaler Modal-Slot (Pattern: `DepEditorPopover` als Singleton).

### D3 · Multi-Select / Bulk-Operations — Wishlist · 3 (höchster User-Value)
**Warum jetzt:** Höchstes Severity-Rating in der Wishlist. Größter
Productivity-Hebel beim Milestone-Review („verschiebe alle 7
v0.3-Features auf v0.4"). **Erfordert vorher D1 + D2** — ein Bulk-
Move ohne Confirm-Modal („7 Features verschieben?") und ohne Toast-
Feedback („7 Features auf v0.4 verschoben") fühlt sich schlechter
an als das Einzel-DnD heute.
**Größe:** mittel. Selection-Store-Slice (`Set<featureId>`),
Shift+Click in den Card-Lists, Bulk-Variante der existierenden
Actions (`deleteFeatures(ids[])`, `moveFeatureToMs(ids[], ms)`).

**Reihenfolge:** D1 → D2 → D3, nicht parallel.

---

## Verbleibende Coverage-Lücken

Bereits in [`FEATURE_AUDIT.md`](./FEATURE_AUDIT.md) §2 dokumentiert,
nicht dupliziert:

- Visual-Regression (kein Pixel-Diff-Gate)
- WelcomeScreen Drag-Drop einer .json-Datei (Playwright kann
  File-Drop-Sequenz nicht nativ synthesieren)
- Electron-only Funktionen (OS-Open-Dialog, File-Watcher) im
  Headless-Browser
- MindMap-Shift+Drag-to-Target Drop (synthetische Pointer-Events
  nicht deterministisch)

Neu seit diesem Pass: keine.

---

## Was nicht gefunden wurde (sauber)

Stichproben-Verifikation, alle ✅:

- **Commit-Invariante:** alle Daten-Mutationen gehen durch `commit()`
  → Undo bleibt konsistent
- **Cycle-Detection** in `findCycles()`: Selbst-Loops korrekt
  erkannt, DFS-Three-Color-Pattern sauber
- **Markdown-XSS:** `renderInlineMd` escapet HTML-Entities VOR
  Regex-Replace, kein Injection-Vektor
- **Kanban-Rank-Drift:** Schwelle 0.001 + on-drop
  `normalizeKanbanRanks()` triggert
- **Undo/Redo-Tiefe:** `HISTORY_LIMIT = 50` mit `.shift()` der
  ältesten Snapshots, kein Memory-Leak
- **External-Change-Latching:** `externalChangePending` blockiert
  konkurrente persists, Disk-Conflict-State sauber
- **Backup-Rotation:** `.bak`-Datei vor jedem Schreiben
  (`electron/main.ts:204`)
- **File-Watcher:** `writingOwn`-Flag unterdrückt Self-Notifications

---

## Status / nächste Schritte

In dieser Audit-Runde geschlossen:
- 4 Major-Bugs (A1–A4) — neue Vitest-Coverage in
  `useProjectStore.test.ts` (+11 Tests, gesamt 96)
- 2 Best-Practice-Quick-Wins (B1 webPreferences, B2 tsconfig)

Offen, in eigenen Passes anzugehen:
- ESLint einrichten + CI-Step
- Playwright-Suite in CI
- Electron-Major-Update auf 35
- Feature D1 → D2 → D3

---

## Siehe auch

- [`UX_FINDINGS.md`](./UX_FINDINGS.md) — UX-Polish-Findings
- [`FEATURE_WISHLIST.md`](./FEATURE_WISHLIST.md) — Feature-Ideen
  jenseits UX-Polish
- [`FEATURE_AUDIT.md`](./FEATURE_AUDIT.md) — JSON-vs-Maus-Parität
  (Stand 2026-04-24)
- [`tests/playwright/FINDINGS.md`](./tests/playwright/FINDINGS.md) —
  harness-scoped Findings

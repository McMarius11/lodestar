# UX-Funde — Lodestar v0.3.0

Observations beim vollständigen Playwright-Testpass + Bedienung der App.
Sortiert nach Impact innerhalb der Kategorie (oben = spürbarer).
Einzelne Items sind bewusst kompakt — eine Zeile pro Idee, Details werden pro Item
diskutiert wenn eins ausgewählt wird.

Severity-Legende aus `tests/playwright/FINDINGS.md`:
**blocker · major · minor · nit**. Hier überwiegend `minor`/`nit`, weil's UX-Polish ist.

---

## 1. Dialog- & Schreib-UX

- **[minor] Native `confirm()` / `prompt()` überall** — 13 Stellen in 8 Files
  (Delete Feature, Delete Module, Delete Milestone, Rename Feature (F2 +
  Kontextmenü), Rename Module, Rename Project, Set Version, Set Today, Close
  Project, Reassign-on-Milestone-Delete). Bricht visuell mit dem Rest der App.
  Vorschlag: schlankes `useConfirm()` / `usePrompt()` Hook-Paar mit globalem
  Modal-Slot (wie `DepEditorPopover`).
- **[minor] Unsaved-Changes-Warnung fehlt** — ModuleEditor und
  ProjectMetaEditor committen auf Blur; Outside-Click verwirft teilweise
  stumm. Keine Rückfrage bei unsaved Input.
- **[minor] Description-Edit im Drawer ohne Live-Preview** — Toggle zwischen
  rendered Markdown ↔ Textarea per Doppelklick; Discoverability schlecht,
  kein side-by-side.
- **[minor] F2-Rename nutzt `prompt()` statt Inline-Rename** — Feature-Label
  ist bereits Text, könnte zu `contentEditable` werden.

## 2. Feedback & Transparenz

- **[minor] Save-Indicator zu subtil** — „saved" bleibt stumpf stehen, nie
  „saved 12s ago". `savedAt` ist schon im Store.
- **[minor] Silent successes überall** — Duplicate Feature, Copy ID, Pin
  Positions geben keinerlei visual confirmation. Toast-Slot würde das lösen.
- **[minor] Copy-ID bestätigt nichts** — Clipboard-Write passiert, aber der
  User weiß nicht ob's geklappt hat.
- **[minor] Validation-Severity-Farben sind dezent** — errors, warnings und
  infos sehen fast gleich aus.

## 3. Navigation & Discoverability

- **[minor] Drawer ohne Prev/Next** — Close → j/k → Open ist umständlich im
  Review-Flow. `[`/`]` oder Pfeiltasten (mit Skip-on-Input) wären natürlich.
- **[nit] Keyboard-Hints auf Buttons fehlen** — Undo, Redo, Palette, +New
  haben kein `title="⌘Z"`.
- **[nit] Heading-Rechtsklicks sind unsichtbar** (jetzt gefixt) — ein dezenter
  `⋯`-Overflow-Button im Header macht denselben Flow für Erstbenutzer sichtbar.
- **[minor] Kontextmenü hat keine Tastatur-Nav** — ↑↓ + Enter + ← für Submenü
  fehlen. Menü ist per Maus-only.
- **[nit] Submenu-Indikatoren sind winzig** — Arrow (›) in context items
  kaum sichtbar.
- **[nit] Shift+F10 / Menu-Key für cursored Feature** — Kontextmenü nur über
  Rechtsklick, nicht via Keyboard.

## 4. Filter-System

- **[minor] Totals ignorieren den Filter** — in ModuleScope TopBar zeigt
  Gesamtzahlen, aber die Cards darunter sind gefiltert.
- **[minor] Kein Filter-Breadcrumb** — wenn MS=`v0.2` + Status=`blocked`
  aktiv ist, fehlt „du siehst: v0.2 × blocked, 3 von 42 features".
- **[nit] Status-Filter-Buttons sind farblos** — keine Verbindung zwischen
  Filter und StatusGlyph-Färbung auf Cards.
- **[nit] Kein „Clear all filters"** — MS auf all + Status auf all muss
  man manuell klicken.
- **[nit] Roadmap-Spalten-Sortierung** — Milestones in Array-Reihenfolge,
  keine Sort-Controls.

## 5. Drag & Drop

- **[minor] Drag-Preview ist Browser-Ghost** — Default-Rendering, kein
  custom `setDragImage()`. Sieht billig aus.
- **[nit] Kein Drop-Indicator für Module-Reorder im Scope** — Kanban hat
  den accent-Strich, Scope nicht.
- **[nit] Kein Feedback bei invalid Drop** — Drag auf eigenen Parent ist
  silent no-op, kein „forbidden"-Cursor.
- **[minor] Kein Auto-Scroll bei DnD am Viewport-Rand** — bei langem Gantt
  oder vielen Modulen muss man manuell scrollen.
- **[nit] Gantt: Milestones nicht draggable** — nur Features, Milestone-
  Bänder sind statisch.

## 6. Drawer & Tasks

- **[minor] Tasks nicht reorderbar** — nur append + delete + edit, keine
  DnD oder Pfeil-Buttons.
- **[minor] Blocker-Zeile hat keine Feature-Links** — „waits on: X, Y" ist
  Klartext, nicht klickbar.
- **[nit] Kein Effort-Shortcut** — Effort-Dropdown muss Maus-geklickt werden.
- **[nit] Kein Task-Count-Badge im Drawer-Header** — Progress-Info nur in
  Cards, im Drawer fehlt „3/7 tasks left" prominent.

## 7. Command Palette

- **[minor] Keine Gruppen-Section-Headers** — Commands flach gelistet,
  keine „Navigation · Editing · Tasks"-Dividers.
- **[nit] Keine Shortcut-Anzeige pro Command** — Palette listet „Undo"
  aber nicht „⌘Z".
- **[nit] Kein „Recently used"** — jedes Mal Start von oben.

## 8. Views — Roadmap / Kanban / Gantt / MindMap

- **[nit] Jump-to-Today ohne `today` gesetzt** — Button sichtbar, Klick
  ist no-op. Entweder deaktivieren oder in „Set today…" umbenennen wenn leer.
- **[minor] Gantt Week-Header fehlt** — Zoom-Levels zeigen Wochen ohne
  Labels („W12", Monats-Trenner).
- **[nit] Conflict-⚠ in Roadmap ist winzig** — leicht zu übersehen.
- **[nit] Kanban Sort-Mode nicht persistent** — Reload vergisst die Auswahl.
- **[minor] MindMap Pin-State unsichtbar** — keine Unterscheidung zwischen
  pinned (persist) und session-overridden Nodes.
- **[minor] Gantt Dep-Pfeile überlappen** — bei vielen parallel laufenden
  Features unleserlich.

## 9. Projekt-Meta

- **[minor] `today` ist Wochen-Integer** — User-unfreundlich, sollte
  Datumspicker sein und intern in Wochen umgerechnet werden.
- **[nit] Version ohne SemVer-Validation** — freier String, kein Parser-Check.
- **[minor] Keine Tags/Labels auf Features** — nur Effort + MS, keine freien
  Tags für Cross-Cutting (z.B. „backend", „refactor").

## 10. Empty States & Onboarding

- **[nit] ModuleScope Empty-State verwechselt „leer" mit „gefiltert"** —
  „NO FEATURES IN CURRENT FILTER" steht auch wenn kein Filter aktiv ist.
- **[nit] Welcome-Screen whitespace** — zeigt Recent + Sample, könnte
  Projekt-Preview (Module-Count, letzter Edit) pro Recent zeigen.
- **[minor] Kein Onboarding-Tooltip für Erstbenutzer** — alle Shortcuts und
  Rechtsklick-Features sind versteckt.
- **[nit] Kanban-Column-Empty nur „EMPTY"** — könnte „Drop here or +New"-Hint
  sein.

## 11. Micro / Polish

- **[nit] Focus-Ring inkonsistent** — manche Buttons zeigen Default-Browser-
  Ring, andere nichts.
- **[nit] Tabs haben dezenten Active-State** — `aria-selected` greift, aber
  der visuelle Unterschied minimal.
- **[nit] Hover-States auf Cards könnten prägnanter** — derzeit nur bg-Farbe.
- **[minor] ExternalChangeBanner ist unauffällig** — wenn Claude/git die
  Datei ändert, ist das eine wichtige Info.
- **[nit] Keine Dirty-Indicator pro Feature** — wenn Description geändert
  wurde, sieht man's nicht in der Card.

---

## Dicke Hebel (höchster Impact für „deutlich geiler")

1. **#1** — Native dialogs ersetzen (konsistente Visual Language)
2. **#6** — Toast-Layer (schafft Kanal für alle silent successes)
3. **#9** — Drawer Prev/Next (verändert Review-Workflow fundamental)
4. **#15** — Filter-aware Totals (vertrauensbildend)
5. **#20** — Custom Drag-Preview (billig sieht anders aus)
6. **#25** — Task-Reorder (fehlt in einem Tool das auf Tasks baut)
7. **#39** — `today` als Date-Picker (Wochen-Integer ist ein Hack)
8. **#44** — Onboarding-Tooltips (Discoverability für Erstbenutzer)

Einzeln jede schon spürbar; zusammen fühlt sich die App anders an.

---

## Siehe auch

- `tests/playwright/FINDINGS.md` — Harness-Findings aus dem Testpass
  (alles dort erwähnte ist bereits gefixt oder hier aufgenommen).
- `FEATURE_WISHLIST.md` — neue Features / v2-Kandidaten, die über reinen
  UX-Polish hinausgehen.

# Feature-Wishlist — Lodestar

Neue Features jenseits von UX-Polish. Alles hier ist explizit **nicht** in v0.3.0
gebaut. Einige Items sind in `CLAUDE.md` als v1-Non-Goals markiert — hier steht
trotzdem der Wert, damit wir informiert entscheiden können.

Gruppiert nach „was gewinnt der User?". Severity-Spalte: wie sehr würde das
Tool ohne das Feature weh tun (1 = Luxus, 3 = wirklich missing).

---

## Multi-Select / Bulk-Operations · **3**

`Shift+Click` oder Rubber-Band auf Feature-Cards → Bulk-Move Milestone, Bulk-Delete,
Bulk-Effort, Bulk-Status. Vor allem beim Review eines ganzen Milestones ein
massiver Zeit-Saver.

> In `CLAUDE.md` als v1-Non-Goal markiert, aber höchster User-Value laut Matrix.

**Größe:** mittel — Selection-State im Store (Set<featureId>), Actions erweitern
die schon featureId akzeptieren um featureIds[]-Varianten.

## Tags / Labels auf Features · **2**

Freie Tags pro Feature („backend", „refactor", „tech-debt", „research"). Schneidet
quer zu Modul + Milestone. Filter + Gruppierung in allen Views.

**Größe:** mittel — Schema-Migration (v3 → v4), `feature.tags: string[]`, neuer
Tag-Filter neben MS/Status, tag-colored accent.

## Feature-Permalinks · **2**

Deep-Link `?feature=api-gateway` oder `#/f/api-gateway` → App öffnet direkt
den Drawer. Teilbar per Chat, gutes Callout aus externer Doku.

**Größe:** klein — URL-Parser in `App.tsx`, `openDrawer` reagiert auf Hash-Change.

> **Caveat seit v0.3.x**: Feature-IDs sind nicht mehr garantiert stabil —
> `renameFeatureId` ist jetzt per UI erreichbar. Ein geteilter Permalink
> auf `?feature=api` zeigt nach einem Rename auf `api-v2` ins Leere.
> Zwei Wege:
> (a) beim 404 eine freundliche „Feature nicht gefunden, aktuell gibt's
>     X / Y / Z"-Ansicht zeigen,
> (b) `previousIds: string[]` am Feature persistieren und nach der
>     eigentlichen ID mitsuchen (kleiner Schema-Bump).
> Variante (a) ist deutlich billiger und für den Use-Case (Chat-Links)
> meist genug.

## Date-Picker statt Wochen-Integer · **2**

`project.meta.today` ist heute Wochen-Integer (0-basiert). Für User unsexy —
sollte ein echter Datumspicker sein, intern in Wochen umgerechnet (gegen ein
`project.meta.startDate`). Gilt auch für `feature.ganttStart`/`ganttEnd`.

**Größe:** mittel — Schema-Migration (v4: `startDate: ISODate`), UI-Wrapper
um Woche↔Datum, Gantt-X-Achse mit Monats-Labels.

## History / Activity-Log · **2**

„Was hat sich in den letzten X Tagen verändert?" — wichtig wenn mehrere Leute
am selben File arbeiten oder man nach 2 Wochen Pause reinkommt.

**Größe:** groß — Event-Log parallel zu Undo-History, UI-Panel, Persistenz-Format.

## Export-as-Markdown (echte Qualität) · **2**

Command existiert schon, Output-Qualität nie verifiziert. Brauchbarer MD-Export
(für Notion, GitHub-Issue-Import, Planning-Doc) wäre hoher Wert.

**Größe:** klein-mittel — vorhandene Export-Funktion verbessern, Preview-Modal.

## Toast / Notification-Layer · **2**

Infrastruktur-Feature, aber ohne Toasts kein Kanal für „Feature dupliziert",
„ID kopiert", „3 Features auf v0.4 verschoben". Baseline für Bulk-Ops.

**Größe:** klein — ein Toast-Store + Komponente, in `App.tsx` einhängen.

## Light-Mode · **1**

Dark-only verbaut Tagsüber-Usage am hellen Screen. Tokens in
`tailwind.config.js` + `index.css` bereits als CSS-Variables → theme-switch
ist mechanisch.

**Größe:** klein-mittel — Token-Audit, `prefers-color-scheme`, Override-Toggle.

## Auto-Scheduling · **1**

Dep-Verletzung (Feature A wartet auf B, B ist in späterem Milestone) → MS
automatisch verschieben oder Warnung mit 1-Click-Fix.

> In `CLAUDE.md` explizit als v1-Non-Goal markiert („kommt in v2"). Technisch
> interessant, aber UX-Risiko wenn automatische Moves passieren.

**Größe:** groß — Topologie, Conflict-Resolution-Strategie, User-Confirmation-UX.

## Treemap-View · **1**

In `CLAUDE.md` als v1-Non-Goal markiert. Könnte das „Big Picture"-View sein
(Module als Flächen, Features als Sub-Rects, Farbe = Progress).

**Größe:** mittel — neuer ViewId, d3-treemap oder eigenes Layout.

## Epic → Story → Task-Hierarchie · **1**

Zwei-Ebenen-Hierarchie (Module → Feature → Task) könnte drei werden
(Epic → Story → Task). In `CLAUDE.md` als v1-Non-Goal. Bringt Komplexität,
aber für große Projekte valide.

**Größe:** groß — Schema-Breaking, alle Views betroffen.

## Multi-User / Collaboration · **1**

In `CLAUDE.md` explizit als v1-Non-Goal. Brauchen würde CRDT oder Backend.
Lokales Tool-Konzept der v1 verzichtet bewusst.

**Größe:** sehr groß — ganzes Datenmodell + Sync-Layer.

---

## Infrastruktur, die Feature-Arbeit einfacher macht

Wenn mehr Features rein sollen, lohnen diese Infrastruktur-Schritte zuerst
(keiner ist user-sichtbar, aber jeder macht spätere Arbeit billiger):

- **Toast-Layer** (s.o.) — Baseline für alle „Success"-Signals
- **Generisches Confirm/Prompt-Modal-Paar** — ersetzt die 13 Native-Dialogs
  und wird für neue Features wiederverwendet
- **Selection-Store-Slice** — selbst wenn Multi-Select nicht sofort kommt,
  ein sauberes Selection-API macht Bulk-Ops später trivial
- **Tag-Store-Slice** — Tags als First-Class-Datenmodell-Primitive

---

## Entscheidungsvorschlag

**v0.4 („UX-Politur")**: Die dicken UX-Hebel aus `UX_FINDINGS.md` (#1, #6,
#9, #15, #20, #25, #39, #44). Macht die bestehende App spürbar besser ohne
neuen Schema- oder Feature-Scope.

**v0.5 („Hebel für Power-User")**: Multi-Select + Tags + Feature-Permalinks.
Das sind die drei Features mit dem höchsten Alltags-Impact; zusammen
verschieben sie die App von „gutes Solo-Tool" zu „ernsthaftes Planning-Werkzeug".

**v1.0 („Ready for Daily-Driver")**: Date-Picker + History-Log + Light-Mode
+ Export-Quality. Alles was fehlt, damit man das Tool einem anderen Entwickler
ohne Vorwarnung hinlegen kann.

**v2**: Auto-Scheduling, Treemap, Epic→Story→Task, Multi-User.

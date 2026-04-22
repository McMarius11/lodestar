# Playwright Test Pass Findings — Lodestar v0.3.0

Discovery pass: 17 suites, all green. The entries below are things the tests
either worked *around* (noted for future polish) or resolved as part of
setting up the harness. Severity conventions:

- **blocker** — App unusable or data-destructive
- **major** — Feature broken or misleading
- **minor** — Small misbehavior, wrong visual
- **nit** — Polish

## Bugs

~~[major] **ContextMenu submenu-item click** — Clicking any item inside a
submenu (Move to Module, Move to Milestone, Set Status, Add dependency to,
Change Color, Remove dependency) did not run its action. Root cause: the main
menu's document-level `mousedown` listener fired before the click event
reached the submenu item, saw the target outside `ref.current` (submenus
portal'd to `document.body`, not inside the main menu), and closed the menu —
the submenu unmounted mid-dispatch, aborting `click`.~~
→ fixed in `src/components/ContextMenu.tsx`: include
`[data-testid="context-submenu"]` in the outside-click guard.

## UX-Verbesserungen

- ~~[minor] **ModuleEditor popover positioning** — `ModuleEditor.tsx` computed
  `top = anchor.bottom + 6` without clamping against the viewport bottom.
  Modules near the bottom rendered the popover below the fold.~~
  → fixed in `src/components/ModuleEditor.tsx`: flip above the anchor when
  below doesn't fit (estimated popover height 320px).
- ~~[minor] **Empty-area context menus hard to trigger** — Right-clicking empty
  space in ModuleScope, Roadmap columns, and Kanban columns often doesn't open
  the empty-area menu because cards or the heading wrapper cover the full area.~~
  → fixed: heading wrappers now open the view-/column-level menu —
  `src/views/ModuleScope.tsx` (scope heading),
  `src/views/Roadmap.tsx` (milestone column header),
  `src/views/Kanban.tsx` (column header).
- ~~[minor] **loadSample() pushes history** — Clicking 'Try the Nimbus example'
  leaves Undo immediately enabled, so the user can undo the sample-load back
  to an empty project.~~
  → fixed in `src/store/useProjectStore.ts`: `loadSample`,
  `loadLodestarRoadmap`, and `startEmptyProject` now bypass `commit()` and
  reset `history`/`future` so initial-load is not undoable.
## Feature-Requests

_(none surfaced during discovery — the test matrix focused on verifying
existing behavior rather than proposing new features)_

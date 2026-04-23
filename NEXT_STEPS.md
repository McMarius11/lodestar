# Next Steps

This file tracks the next product and QA work after the current UX stabilization pass.

## Progress

- Desktop screenshot pass completed for Welcome, Scope, Roadmap, Kanban, MindMap, Gantt, Validation, Command Palette, and Task Drawer.
- Narrow/mobile screenshot pass completed for Scope, Roadmap, and Kanban.
- Narrow/mobile screenshot pass completed for MindMap, Gantt, and Validation.
- Packaged-build visual pass completed for Welcome, all six views, Command Palette, Task Drawer, and the close/reopen flow.
- Fixed narrow-layout regressions in `TopBar`, `ModuleScope`, `Footer`, and `Kanban`.
- Fixed mobile overlay/layout issues in `MindMap` and `Gantt`.
- Normalized Validation copy to English to match the rest of the UI.
- Fixed Welcome-screen recents for the default slot: deduped pathless entries, made them reopenable, and kept them removable.
- Fixed Welcome-screen copy for the recent-only state after closing the current project.
- Hardened external-change handling so disk rewrites no longer clobber unsaved local edits during the save debounce window.
- Verified both external-change conflict decisions on the desktop build: `Keep mine` and `Reload from disk`.
- Blocked global view/palette shortcuts while the task drawer or other modal editors are open.
- Fixed the task drawer layout on narrow screens so sections stack and footer controls stay visible.
- Fixed task/dependency delete affordances in the task drawer so they stay visible on narrow screens and no longer depend on hover alone.
- Fixed the Scope view's inline task delete affordance so it no longer disappears completely on narrow screens.
- Hardened command-palette project rename/version prompts so whitespace-only input is ignored.
- Normalized feature and module context-menu rename prompts so whitespace-padded no-op labels no longer create redundant history entries.
- Routed task-drawer week edits through the store clamp so direct edits keep Gantt ranges valid.
- Hardened project-meta and milestone editors so blank/whitespace-only label edits no longer leave effectively empty names in the UI.
- Hardened task-drawer and module-editor label edits so renames trim cleanly and blank-only input no longer wipes labels.
- Hardened the Module editor's custom color input so invalid non-hex values are ignored instead of being persisted.
- Reset transient UI session state consistently across project-open and new-project flows so stale filters, cursors, and overlays do not leak into the next project.
- Reworded Validation categories and findings so the panel reads like guidance instead of internal error codes.
- Kept file-based recent projects visible on the Welcome screen in browser mode, with a clear desktop-only label instead of rendering an empty recent section.
- External file changes now stay blocked behind the conflict banner while modal editors are open, not just while the drawer or command palette is active.
- The external-change banner now wraps and stacks cleanly on narrow screens instead of forcing the warning text and actions into one brittle row.
- Improved Welcome-screen affordances: the primary open-project action is keyboard reachable, and recent-entry removal stays visible on narrow screens.
- Final AppImage artifact spot-check completed on the current branch build.
- AppImage QA pass covered fresh launch, Welcome focus order, sample open, task drawer, palette, close/reopen, and recent-project reopen.
- Added a regression test that keeps view tabs clickable on a narrow viewport.
- Final automated release-candidate pass completed: `typecheck`, full `vitest`, Playwright `smoke.py`, targeted Scope/TaskDrawer regressions, and fresh `electron:build`.
- Current branch QA summary is captured in `RELEASE_QA.md`.

## Immediate QA

- Optional final visual once-over after pulling the latest branch build locally.

## UX Follow-Up

- Review Welcome screen copy and affordances for first-time users.
- Review drawer form behavior for label, description, milestone, effort, and week fields.
- Review save-state messaging and external-change banner behavior during longer edit sessions.

## Data / Validation Hardening

- Audit numeric inputs and prompt-based edits for other invalid-value paths.
- Check whether any store actions can still leak stale UI state across project switches.
- Revisit validation-panel findings wording for clarity and actionability.

## Release / PR

- QA notes from the current branch build now live in `RELEASE_QA.md`.
- Update version/release notes if shipping a new patch release.
- Open or refine the GitHub PR with screenshots or short QA notes if useful.

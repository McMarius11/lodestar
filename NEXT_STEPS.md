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
- Improved Welcome-screen affordances: the primary open-project action is keyboard reachable, and recent-entry removal stays visible on narrow screens.
- Final AppImage artifact spot-check completed on the current branch build.
- AppImage QA pass covered fresh launch, Welcome focus order, sample open, task drawer, palette, close/reopen, and recent-project reopen.
- Added a regression test that keeps view tabs clickable on a narrow viewport.

## Immediate QA

- Look for clipped text, awkward spacing, hover/focus states, and confusing empty states.

## UX Follow-Up

- Review Welcome screen copy and affordances for first-time users.
- Review drawer form behavior for label, description, milestone, effort, and week fields.
- Review save-state messaging and external-change banner behavior during longer edit sessions.

## Data / Validation Hardening

- Audit numeric inputs and prompt-based edits for other invalid-value paths.
- Check whether any store actions can still leak stale UI state across project switches.
- Revisit validation-panel findings wording for clarity and actionability.

## Release / PR

- QA notes from the current AppImage spot-check should be kept in sync with the PR.
- Update version/release notes if shipping a new patch release.
- Open or refine the GitHub PR with screenshots or short QA notes if useful.

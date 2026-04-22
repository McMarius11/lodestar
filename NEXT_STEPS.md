# Next Steps

This file tracks the next product and QA work after the current UX stabilization pass.

## Progress

- Desktop screenshot pass completed for Welcome, Scope, Roadmap, Kanban, MindMap, Gantt, Validation, Command Palette, and Task Drawer.
- Narrow/mobile screenshot pass completed for Scope, Roadmap, and Kanban.
- Fixed narrow-layout regressions in `TopBar`, `ModuleScope`, `Footer`, and `Kanban`.
- Added a regression test that keeps view tabs clickable on a narrow viewport.

## Immediate QA

- Run a manual visual pass on the packaged AppImage.
- Check Welcome screen, Command Palette, Task Drawer, and close/reopen flows by hand.
- Verify content correctness in all six views with the real sample data, not only automated checks.
- Do one more narrow/mobile pass on MindMap, Gantt, and Validation after the responsive fixes.
- Look for clipped text, awkward spacing, hover/focus states, and confusing empty states.

## UX Follow-Up

- Review Welcome screen copy and affordances for first-time users.
- Review drawer form behavior for label, description, milestone, effort, and week fields.
- Review keyboard shortcut behavior across dialogs and text inputs.
- Review save-state messaging and external-change banner behavior during longer edit sessions.

## Data / Validation Hardening

- Audit numeric inputs and prompt-based edits for other invalid-value paths.
- Check whether any store actions can still leak stale UI state across project switches.
- Revisit validation-panel findings wording for clarity and actionability.

## Release / PR

- Collect manual QA notes after testing the AppImage.
- Update version/release notes if shipping a new patch release.
- Open or refine the GitHub PR with screenshots or short QA notes if useful.

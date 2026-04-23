# Lodestar v0.3.1

Patch release focused on UX stabilization, input hardening, and safer local
file handling.

## Highlights

- fixed save-state and external-change conflicts so disk rewrites no longer
  clobber unsaved local edits
- improved Welcome, recent-project, and close/reopen flows
- blocked global shortcuts while modal editors are open
- tightened prompt- and input-based editing so blank or no-op values do not
  create broken state or redundant history entries
- improved responsive behavior across TopBar, Scope, Kanban, MindMap, Gantt,
  Task Drawer, and the external-change banner
- clarified Validation messaging so findings read like guidance instead of
  internal error codes

## QA Snapshot

- `npm run typecheck`
- `npm test`
- `python3 tests/playwright/smoke.py http://127.0.0.1:4173`
- `npm run electron:build`

Detailed branch QA notes live in `RELEASE_QA.md`.

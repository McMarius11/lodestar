# Release QA

Current stabilization branch: `refactor/modular-hooks-and-docs`  
Current PR: `#7`  
Target patch release: `v0.3.1`  
Recorded on: `2026-04-23`

## Current Artifact

- Linux AppImage: `release/Lodestar-0.3.1-linux-x86_64.AppImage`
- Unpacked desktop build: `release/linux-unpacked/lodestar`

Note: package metadata is now set to `0.3.1`. Publishing still requires a
matching git tag push.

## Automated Verification

Verified on the current branch state:

- `npm run typecheck`
- `npm test`
  Result: `6` test files, `60` tests passed
- `python3 tests/playwright/smoke.py http://127.0.0.1:4173`
  Result: `13/13` passed
- `python3 tests/playwright/test_view_scope.py http://127.0.0.1:4173`
  Result: `10/10` passed
- `python3 tests/playwright/test_task_drawer.py http://127.0.0.1:4173`
  Result: `21/21` passed
- `npm run electron:build`
  Result: production desktop build + AppImage completed successfully

## Manual / Visual QA Already Completed On This Branch

- Welcome screen checked in packaged desktop build
- All six views checked in packaged desktop build
- Command Palette and Task Drawer checked in packaged desktop build
- Close / reopen flow checked in packaged desktop build
- Recent-project reopen checked in packaged desktop build
- External-change conflict flow checked with both decisions:
  `Keep mine` and `Reload from disk`
- AppImage spot-check completed for:
  fresh launch, Welcome focus order, sample open, drawer, palette, and reopen

## Current Assessment

- No known blocker remains from the stabilization pass
- Remaining work is release hygiene, not core stability work

## Still To Decide Before Shipping

- Whether to add screenshots or short QA notes to the GitHub PR
- When to push the final `v0.3.1` git tag and trigger the release workflow

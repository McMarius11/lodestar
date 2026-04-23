"""Welcome screen + persistence round-trip. Runs with no seed so the app
renders the onboarding state."""
from __future__ import annotations

import json
import pathlib
import sys

from playwright.sync_api import Page

from _lib import (
    LS_KEY,
    LAST_SESSION_KEY,
    close_drawer,
    get_project,
    log,
    run_suite,
    wait_idle,
)

REPO = pathlib.Path(__file__).resolve().parents[2]
SEED_PATH = REPO / "data" / "project.example.json"
RECENTS_KEY = "lodestar:recent-files"


def test_welcome_appears_with_empty_storage(page: Page) -> None:
    # Both markers cleared by the no-seed runner already; verify.
    stored = page.evaluate(f"() => localStorage.getItem({json.dumps(LS_KEY)})")
    last = page.evaluate(f"() => localStorage.getItem({json.dumps(LAST_SESSION_KEY)})")
    assert stored is None, stored
    assert last is None, last
    # Welcome screen mounts — "Nothing yet." headline + Nimbus button.
    page.wait_for_selector("h1", timeout=5000)
    h1 = page.locator("h1").first.inner_text()
    assert "Nothing yet" in h1, h1
    assert page.locator("button", has_text="Try the Nimbus example").count() == 1
    log("empty LS → Welcome screen with 'Nothing yet.' headline")


def test_try_nimbus_loads_sample(page: Page) -> None:
    page.locator("button", has_text="Try the Nimbus example").first.click()
    page.wait_for_selector('[role="tablist"]', timeout=10_000)
    page.wait_for_selector('[data-testid="view-scope"]')
    h1 = page.locator("h1").first.inner_text()
    assert h1 == "Nimbus", h1
    log("Try-Nimbus button loads the 6-module sample")


def test_open_project_primary_action_is_keyboard_reachable(page: Page) -> None:
    page.keyboard.press("Tab")
    active = page.evaluate("document.activeElement?.getAttribute('data-testid')")
    assert active == "welcome-open-project", active
    log("welcome open-project primary action is keyboard reachable")


TESTS_EMPTY = [
    test_welcome_appears_with_empty_storage,
    test_open_project_primary_action_is_keyboard_reachable,
    test_try_nimbus_loads_sample,
]


def test_default_slot_recent_can_be_removed_and_reopened(page: Page) -> None:
    seed = json.loads(SEED_PATH.read_text())
    recent = [{"name": "Nimbus local slot", "when": 123}]
    last = {"path": None, "when": 123}
    page.evaluate(
        """([project, last, recents, lsKey, lastKey, recentsKey]) => {
            localStorage.setItem(lsKey, JSON.stringify(project))
            localStorage.setItem(lastKey, JSON.stringify(last))
            localStorage.setItem(recentsKey, JSON.stringify(recents))
        }""",
        [seed, last, recent, LS_KEY, LAST_SESSION_KEY, RECENTS_KEY],
    )
    page.reload(wait_until="networkidle")

    row = page.locator("button", has_text="Nimbus local slot").first
    row.wait_for()
    row.hover()
    page.locator('[aria-label="Remove Nimbus local slot from recents"]').click()
    assert page.locator("button", has_text="Nimbus local slot").count() == 0

    page.evaluate(
        """([project, last, recents, lsKey, lastKey, recentsKey]) => {
            localStorage.setItem(lsKey, JSON.stringify(project))
            localStorage.setItem(lastKey, JSON.stringify(last))
            localStorage.setItem(recentsKey, JSON.stringify(recents))
        }""",
        [seed, last, recent, LS_KEY, LAST_SESSION_KEY, RECENTS_KEY],
    )
    page.reload(wait_until="networkidle")

    page.locator("button", has_text="Nimbus local slot").first.click()
    page.wait_for_selector('[data-testid="view-scope"]')
    h1 = page.locator("h1").first.inner_text()
    assert h1 == "Nimbus", h1
    log("default-slot recent can be removed and reopened from Welcome")


def test_recent_remove_affordance_stays_visible_on_narrow_screens(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    seed = json.loads(SEED_PATH.read_text())
    recent = [{"name": "Nimbus local slot", "when": 123}]
    last = {"path": None, "when": 123}
    page.evaluate(
        """([project, last, recents, lsKey, lastKey, recentsKey]) => {
            localStorage.setItem(lsKey, JSON.stringify(project))
            localStorage.setItem(lastKey, JSON.stringify(last))
            localStorage.setItem(recentsKey, JSON.stringify(recents))
        }""",
        [seed, last, recent, LS_KEY, LAST_SESSION_KEY, RECENTS_KEY],
    )
    page.reload(wait_until="networkidle")

    remove = page.locator('[aria-label="Remove Nimbus local slot from recents"]')
    opacity = remove.evaluate("el => getComputedStyle(el).opacity")
    assert opacity == "1", opacity
    log("recent remove affordance stays visible on narrow screens")


TESTS_RECENTS = [
    test_default_slot_recent_can_be_removed_and_reopened,
    test_recent_remove_affordance_stays_visible_on_narrow_screens,
]


def test_recent_without_last_session_uses_returning_copy(page: Page) -> None:
    seed = json.loads(SEED_PATH.read_text())
    recent = [{"name": "Nimbus", "when": 123}]
    page.evaluate(
        """([project, recents, lsKey, lastKey, recentsKey]) => {
            localStorage.setItem(lsKey, JSON.stringify(project))
            localStorage.removeItem(lastKey)
            localStorage.setItem(recentsKey, JSON.stringify(recents))
        }""",
        [seed, recent, LS_KEY, LAST_SESSION_KEY, RECENTS_KEY],
    )
    page.reload(wait_until="networkidle")

    h1 = page.locator("h1").first.inner_text()
    body = page.locator("p").first.inner_text()
    assert "Welcome back" in h1, h1
    assert "recent projects" in body, body
    assert page.locator("text=RECENT").first.is_visible()
    log("recent-only Welcome state uses returning-user copy instead of empty-state copy")


def test_file_based_recent_stays_visible_in_browser_mode(page: Page) -> None:
    recent = [{"name": "Disk Project", "path": "/tmp/disk-project.json", "when": 123}]
    page.evaluate(
        """([recents, recentsKey, lastKey, lsKey]) => {
            localStorage.removeItem(lsKey)
            localStorage.removeItem(lastKey)
            localStorage.setItem(recentsKey, JSON.stringify(recents))
        }""",
        [recent, RECENTS_KEY, LAST_SESSION_KEY, LS_KEY],
    )
    page.reload(wait_until="networkidle")

    row = page.locator("button", has_text="Disk Project").first
    row.wait_for()
    assert row.is_disabled()
    assert page.locator("text=DESKTOP APP REQUIRED").count() == 1
    assert page.locator("text=Desktop-only recents stay visible here").count() == 1
    log("file-based recent stays visible and is marked desktop-only in browser mode")


TESTS_RECENTS_COPY = [
    test_recent_without_last_session_uses_returning_copy,
    test_file_based_recent_stays_visible_in_browser_mode,
]


# --- Suite #2: verify persistence round-trip after boot -------------------


def test_edit_triggers_save_cycle(page: Page) -> None:
    """After a mutation the indicator flashes 'saving' → 'saved'."""
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')
    # Trigger any mutation that goes through commit() — status filter is UI only
    # so it won't work. Use the "+ NEW" menu to add a feature.
    page.get_by_test_id("btn-create").click()
    page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
    # pick "New Feature in …" or similar; fall back to first available item
    item = page.locator('[data-testid^="menuitem-new-feature"]').first
    if item.count() == 0:
        item = page.locator('[data-testid="context-menu"] button').first
    item.click()
    # Now a feature exists; the save indicator should transition.
    wait_idle(page, timeout_ms=5000)
    status = page.get_by_test_id("save-indicator").get_attribute("data-save-status")
    assert status in {"saved", "idle"}, status
    # Add-feature opens the drawer — close it before using toolbar buttons.
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"save indicator reached '{status}' after mutation")


def test_mutation_persists_to_localstorage(page: Page) -> None:
    """After a mutation, localStorage reflects the new project JSON."""
    before_raw = page.evaluate(f"() => localStorage.getItem({json.dumps(LS_KEY)})")
    before = json.loads(before_raw) if before_raw else {"modules": []}
    before_count = sum(len(m["features"]) for m in before.get("modules", []))
    page.get_by_test_id("btn-create").click()
    page.wait_for_selector('[data-testid="context-menu"]')
    page.locator('[data-testid^="menuitem-new-feature"]').first.click()
    wait_idle(page)
    after = get_project(page)
    after_count = sum(len(m["features"]) for m in after["modules"])
    assert after_count == before_count + 1, (before_count, after_count)
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"feature count {before_count} → {after_count} landed in localStorage")


TESTS_SEEDED = [
    test_edit_triggers_save_cycle,
    test_mutation_persists_to_localstorage,
]


if __name__ == "__main__":
    # Run the two suites back-to-back — first empty-LS, then seeded.
    # rc1 covers Welcome; rc2 covers default-slot recents; rc3 covers recent-only copy;
    # rc4 covers save pipeline.
    rc1 = run_suite(__file__, TESTS_EMPTY, no_seed=True, skip_bootstrap=True)
    rc2 = run_suite(__file__, TESTS_RECENTS, no_seed=True, skip_bootstrap=True)
    rc3 = run_suite(__file__, TESTS_RECENTS_COPY, no_seed=True, skip_bootstrap=True)
    rc4 = run_suite(__file__, TESTS_SEEDED)
    sys.exit(rc1 or rc2 or rc3 or rc4)

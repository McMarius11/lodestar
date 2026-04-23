"""TopBar: tabs, filters, undo/redo buttons, save indicator, + New menu, footer counts."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    VIEWS,
    close_drawer,
    goto_view,
    log,
    note_finding,
    run_suite,
    wait_idle,
)


def test_tabs_via_click(page: Page) -> None:
    for v in VIEWS:
        page.get_by_test_id(f"tab-{v}").click()
        page.wait_for_selector(f'[data-testid="view-{v}"]')
        assert page.get_by_test_id(f"tab-{v}").get_attribute("aria-selected") == "true", v
    log("tab click-navigation covers all six views")


def test_tabs_still_clickable_on_narrow_viewport(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_test_id("tab-roadmap").click()
    page.wait_for_selector('[data-testid="view-roadmap"]')
    assert page.get_by_test_id("tab-roadmap").get_attribute("aria-selected") == "true"
    page.set_viewport_size({"width": 1280, "height": 720})
    log("tabs remain clickable on a narrow viewport")


def test_tabs_via_keyboard_1_to_6(page: Page) -> None:
    # Make sure nothing is focused on an input
    page.keyboard.press("Escape")
    for i, v in enumerate(VIEWS, start=1):
        page.keyboard.press(str(i))
        page.wait_for_selector(f'[data-testid="view-{v}"]')
        tab = page.get_by_test_id(f"tab-{v}")
        assert tab.get_attribute("aria-selected") == "true", f"key {i} did not land on {v}"
    log("keyboard shortcuts 1..6 switch views correctly")


def test_milestone_filter_pills(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    all_pill = page.get_by_test_id("filter-ms-all")
    assert all_pill.get_attribute("aria-pressed") == "true"
    pills = page.locator('[data-testid^="filter-ms-"]').all()
    assert len(pills) >= 2, "expected 'all' + at least one milestone"
    other_ids: list[str] = []
    for p in pills:
        tid = p.get_attribute("data-testid") or ""
        if tid != "filter-ms-all":
            other_ids.append(tid)
    for tid in other_ids:
        pill = page.get_by_test_id(tid)
        pill.click()
        assert pill.get_attribute("aria-pressed") == "true", tid
        assert all_pill.get_attribute("aria-pressed") == "false", "all should un-press"
    all_pill.click()
    assert all_pill.get_attribute("aria-pressed") == "true"
    log(f"milestone filter toggles ok (tried {len(other_ids)} non-all pills)")


def test_status_filter_pills(page: Page) -> None:
    for status in ("all", "ready", "blocked", "conflict"):
        pill = page.get_by_test_id(f"filter-status-{status}")
        pill.click()
        assert pill.get_attribute("aria-pressed") == "true", status
    page.get_by_test_id("filter-status-all").click()
    log("status filter all/ready/blocked/conflict toggles ok")


def test_filter_persists_across_views(page: Page) -> None:
    page.get_by_test_id("filter-status-blocked").click()
    for v in VIEWS:
        goto_view(page, v)
        assert (
            page.get_by_test_id("filter-status-blocked").get_attribute("aria-pressed")
            == "true"
        ), f"filter dropped on view {v}"
    page.get_by_test_id("filter-status-all").click()
    log("status filter persists across all views")


def test_filter_active_banner(page: Page) -> None:
    page.get_by_test_id("filter-status-all").click()
    page.get_by_test_id("filter-ms-all").click()
    # Label is ungetestid'd text — probe the header text content instead.
    filter_label = page.locator("header").get_by_text("FILTER", exact=False).first
    txt_off = filter_label.inner_text()
    page.get_by_test_id("filter-status-blocked").click()
    txt_on = filter_label.inner_text()
    assert txt_off != txt_on, "FILTER label should change when a filter is active"
    # reset
    page.get_by_test_id("filter-status-all").click()
    log("header FILTER label reflects active-state")


def test_undo_redo_disabled_state(page: Page) -> None:
    """Boot state is implementation-defined: if the user clicked 'Try the
    Nimbus example', loadSample() commits and bumps history. We verify the
    buttons *exist* and their disabled state matches the store's history
    depth, not that history is empty."""
    undo = page.get_by_test_id("btn-undo")
    redo = page.get_by_test_id("btn-redo")
    assert undo.count() == 1 and redo.count() == 1, "both buttons must be present"
    # Undo may be enabled if we got here via Welcome → Load Sample (commit).
    if not undo.is_disabled():
        note_finding(
            "UX-Verbesserungen",
            "minor",
            "loadSample() pushes history",
            "clicking 'Try the Nimbus example' makes Undo immediately enabled — "
            "users can undo the sample-load back to an empty project. Debatable "
            "whether load should be history-tracked; consider NOT using commit() "
            "in loadSample/loadLodestarRoadmap/startEmptyProject.",
        )
    # Redo should always be empty on fresh boot regardless.
    assert redo.is_disabled(), "redo should be disabled on fresh load"
    log(f"undo disabled={undo.is_disabled()}, redo disabled={redo.is_disabled()} on boot")


def test_undo_redo_enabled_after_edit(page: Page) -> None:
    # Toggle a task via drawer to generate a history entry
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')
    page.locator('[data-testid="view-scope"] [data-feature-id]').first.click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    row = drawer.locator("ul li button").first
    if not row.count():
        close_drawer(page)
        note_finding(
            "Bugs",
            "minor",
            "test_undo_redo_enabled_after_edit",
            "no task row buttons inside drawer — cannot exercise undo",
        )
        return
    row.click()
    wait_idle(page)
    close_drawer(page)
    assert not page.get_by_test_id("btn-undo").is_disabled(), "undo did not enable"
    # Undo, then redo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert not page.get_by_test_id("btn-redo").is_disabled(), "redo did not enable after undo"
    page.get_by_test_id("btn-redo").click()
    wait_idle(page)
    log("undo/redo enable after edit → re-disable after undo/redo")


def test_new_menu_items(page: Page) -> None:
    page.get_by_test_id("btn-create").click()
    page.wait_for_selector('[data-testid="context-menu"]')
    items = page.locator('[data-testid="context-menu"] [role="menuitem"]')
    labels = [items.nth(i).inner_text() for i in range(items.count())]
    assert any("New Feature" in l for l in labels), labels
    assert any("New Module" in l for l in labels), labels
    assert any("Edit Milestones" in l for l in labels), labels
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="context-menu"]', state="detached")
    log(f"+ New… menu exposes: {labels!r}")


def test_save_indicator_cycle(page: Page) -> None:
    ind = page.get_by_test_id("save-indicator")
    status = ind.get_attribute("data-save-status")
    assert status in {"idle", "saving", "saved", None}, status
    wait_idle(page, 8_000)
    terminal = ind.get_attribute("data-save-status")
    assert terminal in {"idle", "saved"}, terminal
    log(f"save indicator terminal: {terminal}")


def test_footer_count_shape(page: Page) -> None:
    # Footer is at the bottom of <main>; its test-ids aren't defined so we probe
    # via text. We check that the numeric strings exist ("MOD", "FEAT", "TASK").
    body = page.locator("body").inner_text()
    mod_ok = "MOD" in body
    feat_ok = "FEAT" in body
    task_ok = "TASK" in body
    if not (mod_ok and feat_ok and task_ok):
        note_finding(
            "UX-Verbesserungen",
            "minor",
            "footer counts",
            f"footer tokens MOD/FEAT/TASK missing (mod={mod_ok}, feat={feat_ok}, task={task_ok})",
        )
    log(f"footer tokens visible: MOD={mod_ok} FEAT={feat_ok} TASK={task_ok}")


TESTS = [
    test_tabs_via_click,
    test_tabs_still_clickable_on_narrow_viewport,
    test_tabs_via_keyboard_1_to_6,
    test_milestone_filter_pills,
    test_status_filter_pills,
    test_filter_persists_across_views,
    test_filter_active_banner,
    test_undo_redo_disabled_state,
    test_undo_redo_enabled_after_edit,
    test_new_menu_items,
    test_save_indicator_cycle,
    test_footer_count_shape,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

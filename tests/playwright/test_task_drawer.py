"""TaskDrawer: open paths, label edit, description edit, task CRUD, footer selects."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    DialogHandler,
    close_drawer,
    feature_by_id,
    get_project,
    log,
    note_finding,
    run_suite,
    wait_idle,
)


def _goto_scope(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')


def _open_first_feature(page: Page) -> str:
    _goto_scope(page)
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    return fid  # type: ignore[return-value]


def test_open_via_click(page: Page) -> None:
    fid = _open_first_feature(page)
    drawer = page.get_by_test_id("dialog-task")
    assert drawer.get_attribute("data-drawer-feature") == fid
    close_drawer(page)
    log(f"click opens drawer for {fid!r}")


def test_open_via_context_menu(page: Page) -> None:
    _goto_scope(page)
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-open").click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    assert drawer.get_attribute("data-drawer-feature") == fid
    close_drawer(page)
    log("context-menu 'Open' opens drawer")


def test_esc_closes(page: Page) -> None:
    _open_first_feature(page)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("Esc closes drawer")


def test_outside_click_closes(page: Page) -> None:
    _open_first_feature(page)
    # The overlay div sits under the drawer at opacity:0.5 and covers the viewport.
    # Click at (20,20) — far from drawer content — should hit the overlay.
    page.mouse.click(20, 20)
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("outside-click on overlay closes drawer")


def test_label_edit_commits(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_label = feature_by_id(before, fid)["label"]  # type: ignore[index]
    new_label = f"{before_label} EDITED"
    inp = page.get_by_test_id("drawer-feature-label")
    inp.fill(new_label)
    inp.blur()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["label"] == new_label  # type: ignore[index]
    # cleanup: undo
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"drawer label edit: {before_label!r} → {new_label!r} → undone")


def test_task_toggle_commits(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    tasks_before = feature_by_id(before, fid)["tasks"]  # type: ignore[index]
    if not tasks_before:
        close_drawer(page)
        note_finding("Bugs", "minor", "test_task_toggle_commits",
                     f"feature {fid!r} has no tasks in seed; cannot test toggle")
        return
    # First task row's first button = checkbox
    row = page.locator('[data-testid="dialog-task"] ul li').first
    checkbox = row.locator("button").first
    before_done = tasks_before[0]["done"]
    checkbox.click()
    wait_idle(page)
    after = get_project(page)
    after_done = feature_by_id(after, fid)["tasks"][0]["done"]  # type: ignore[index]
    assert after_done != before_done, f"task toggle did not flip done ({before_done} stayed)"
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"task toggle: {before_done} → {after_done} → undone")


def test_task_add(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    count_before = len(feature_by_id(before, fid)["tasks"])  # type: ignore[index]
    inp = page.locator('[data-testid="dialog-task"] input[placeholder="Add task…"]')
    inp.fill("A brand new task added by Playwright")
    inp.press("Enter")
    wait_idle(page)
    after = get_project(page)
    count_after = len(feature_by_id(after, fid)["tasks"])  # type: ignore[index]
    assert count_after == count_before + 1, (
        f"task add did not grow count: {count_before} → {count_after}"
    )
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"task add: +1 then undone ({count_before} → {count_after})")


def test_task_delete(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    tasks_before = feature_by_id(before, fid)["tasks"]  # type: ignore[index]
    if not tasks_before:
        close_drawer(page)
        return
    row = page.locator('[data-testid="dialog-task"] ul li').first
    row.hover()
    # DEL button is opacity-0 until hover; click by text
    row.locator("button", has_text="DEL").click()
    wait_idle(page)
    after = get_project(page)
    assert len(feature_by_id(after, fid)["tasks"]) == len(tasks_before) - 1  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("task delete: -1 then undone")


def test_description_edit_commits_on_blur(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_desc = feature_by_id(before, fid).get("description", "") or ""  # type: ignore[union-attr]
    new_desc = "Edited description via Playwright."
    ta = page.locator('[data-testid="dialog-task"] textarea').first
    ta.fill(new_desc)
    ta.blur()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid).get("description") == new_desc  # type: ignore[union-attr]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"description edit: {len(before_desc)}ch → {len(new_desc)}ch → undone")


def test_effort_dropdown(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_eff = feature_by_id(before, fid)["effort"]  # type: ignore[index]
    # pick anything different
    new_eff = next(e for e in ("S", "M", "L", "XL") if e != before_eff)
    sel = page.locator('[data-testid="dialog-task"] select').nth(1)  # [0]=dep type? Actually depends
    # The first selects in the drawer are per-dep type selects, then footer milestone/effort.
    # Easier: select by label proximity — find the select inside the 'EFFORT' label
    eff_sel = page.locator(
        '[data-testid="dialog-task"] label:has-text("EFFORT") select'
    ).first
    eff_sel.select_option(new_eff)
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["effort"] == new_eff  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"effort: {before_eff} → {new_eff} → undone")


def test_milestone_dropdown(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_ms = feature_by_id(before, fid)["ms"]  # type: ignore[index]
    target = next(m["id"] for m in before["meta"]["milestones"] if m["id"] != before_ms)
    ms_sel = page.locator(
        '[data-testid="dialog-task"] label:has-text("MILESTONE") select'
    ).first
    ms_sel.select_option(target)
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["ms"] == target  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"milestone: {before_ms} → {target} → undone")


def test_weeks_inputs(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_feat = feature_by_id(before, fid)  # type: ignore[assignment]
    before_start = before_feat["ganttStart"]  # type: ignore[index]
    before_end = before_feat["ganttEnd"]  # type: ignore[index]
    new_start = before_start + 1
    new_end = before_end + 2
    weeks_inputs = page.locator(
        '[data-testid="dialog-task"] label:has-text("WEEKS") input[type="number"]'
    )
    weeks_inputs.nth(0).fill(str(new_start))
    weeks_inputs.nth(0).blur()
    wait_idle(page)
    weeks_inputs.nth(1).fill(str(new_end))
    weeks_inputs.nth(1).blur()
    wait_idle(page)
    after = get_project(page)
    after_feat = feature_by_id(after, fid)  # type: ignore[assignment]
    assert after_feat["ganttStart"] == new_start  # type: ignore[index]
    assert after_feat["ganttEnd"] == new_end  # type: ignore[index]
    close_drawer(page)
    # undo twice (two commits)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"weeks: {before_start}-{before_end} → {new_start}-{new_end} → undone")


def test_add_dependency_via_drawer(page: Page) -> None:
    _open_first_feature(page)
    drawer = page.get_by_test_id("dialog-task")
    fid = drawer.get_attribute("data-drawer-feature")
    before = get_project(page)
    deps_before = len(feature_by_id(before, fid)["deps"])  # type: ignore[index]
    drawer.locator("button", has_text="+ ADD DEPENDENCY").click()
    # Select the first available candidate
    sel = drawer.locator("select").filter(has=page.locator("option", has_text="select feature")).first
    # Pick any non-placeholder option
    opts = sel.locator("option").all_inner_texts()
    real = [o for o in opts if "—" not in o and "select" not in o.lower()]
    if not real:
        close_drawer(page)
        note_finding("Bugs", "minor", "test_add_dependency_via_drawer",
                     "no candidates in AddDepRow select (every feature already depends?)")
        return
    sel.select_option(label=real[0])
    reason = drawer.locator('input[placeholder="Reason…"]')
    reason.fill("Because the test says so")
    drawer.locator("button", has_text="ADD").click()
    wait_idle(page)
    after = get_project(page)
    deps_after = len(feature_by_id(after, fid)["deps"])  # type: ignore[index]
    assert deps_after == deps_before + 1, f"{deps_before} → {deps_after}"
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"add-dep via drawer: +1 ({deps_before} → {deps_after}) → undone")


def test_delete_feature_from_drawer_footer(page: Page) -> None:
    # Create a disposable feature via command palette, then delete via drawer.
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    page.get_by_test_id("command-palette-input").fill("New Module")
    # Better: just use ⌘K → New Feature for first module
    page.get_by_test_id("command-palette-input").fill("New Feature in ")
    page.wait_for_function(
        """() => document.querySelector(
            '[data-testid="dialog-command-palette"] [role="option"]'
        ) !== null""",
        timeout=3000,
    )
    page.locator(
        '[data-testid="dialog-command-palette"] [role="option"]'
    ).first.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    drawer = page.get_by_test_id("dialog-task")
    fid = drawer.get_attribute("data-drawer-feature")
    wait_idle(page)
    before = get_project(page)
    exists_before = feature_by_id(before, fid) is not None
    assert exists_before, f"fresh feature {fid!r} not in store"
    with DialogHandler(page, accept_with=""):
        drawer.locator("button", has_text="DELETE FEATURE").click()
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid) is None, "feature not deleted"
    # cleanup: undo delete + add
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"drawer DELETE FEATURE removes {fid!r}, undo restores")


TESTS = [
    test_open_via_click,
    test_open_via_context_menu,
    test_esc_closes,
    test_outside_click_closes,
    test_label_edit_commits,
    test_task_toggle_commits,
    test_task_add,
    test_task_delete,
    test_description_edit_commits_on_blur,
    test_effort_dropdown,
    test_milestone_dropdown,
    test_weeks_inputs,
    test_add_dependency_via_drawer,
    test_delete_feature_from_drawer_footer,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

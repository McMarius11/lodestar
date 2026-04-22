"""Command Palette: open paths, search, every command group, keyboard nav."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    DialogHandler,
    close_drawer,
    close_palette,
    get_project,
    log,
    note_finding,
    open_palette,
    run_suite,
    wait_idle,
)


def test_open_close_via_keyboard(page: Page) -> None:
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-command-palette"]', state="detached")
    log("Ctrl+K open + Esc close ok")


def test_open_via_slash(page: Page) -> None:
    page.keyboard.press("Escape")
    page.keyboard.press("/")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    close_palette(page)
    log("'/' opens the palette")


def test_open_via_topbar_button(page: Page) -> None:
    close_palette(page)
    page.get_by_test_id("btn-command-palette").click()
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    close_palette(page)
    log("top-bar ⌘K button opens palette")


def test_default_list_hides_tasks(page: Page) -> None:
    open_palette(page)
    # Without query, tasks should be filtered out (group=task)
    task_count = page.locator(
        '[data-testid="dialog-command-palette"] [data-command-group="task"]'
    ).count()
    close_palette(page)
    assert task_count == 0, f"tasks should be hidden by default, got {task_count}"
    log("default palette view excludes task entries")


def test_search_finds_tasks_on_query(page: Page) -> None:
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("router")
    # Re-render is debounced by React state — wait for at least one option
    page.wait_for_function(
        """() => document.querySelector(
            '[data-testid="dialog-command-palette"] [role="option"]'
        ) !== null""",
        timeout=3000,
    )
    hits = page.locator(
        '[data-testid="dialog-command-palette"] [data-command-group="task"]'
    )
    count = hits.count()
    close_palette(page)
    # 'Router + middleware stack' is a task in the Nimbus seed → expect ≥1 hit
    assert count >= 1, f"expected at least one task hit for 'router', got {count}"
    log(f"task search found {count} match(es) for 'router'")


def test_fuzzy_search_ranks_by_position(page: Page) -> None:
    open_palette(page)
    inp = page.get_by_test_id("command-palette-input")
    inp.fill("roadmap")
    page.wait_for_timeout(100)
    first = page.locator(
        '[data-testid="dialog-command-palette"] [role="option"]'
    ).first
    txt = first.inner_text()
    close_palette(page)
    assert "Roadmap" in txt, f"top hit for 'roadmap' should contain Roadmap, got {txt!r}"
    log("fuzzy search ranks 'roadmap' → Go to Roadmap first")


def test_navigate_via_arrow_keys(page: Page) -> None:
    open_palette(page)
    inp = page.get_by_test_id("command-palette-input")
    inp.fill("go to")
    page.wait_for_timeout(100)
    opts = page.locator('[data-testid="dialog-command-palette"] [role="option"]')
    assert opts.count() >= 3
    inp.press("ArrowDown")
    inp.press("ArrowDown")
    # selected ArialSelected reflects sel
    sel = page.locator(
        '[data-testid="dialog-command-palette"] [role="option"][aria-selected="true"]'
    )
    assert sel.count() == 1, f"expected exactly one aria-selected, got {sel.count()}"
    close_palette(page)
    log("arrow keys move aria-selected within palette")


def test_go_to_each_view_via_palette(page: Page) -> None:
    for view_id, label in (
        ("scope", "Module Scope"),
        ("roadmap", "Roadmap"),
        ("kanban", "Kanban"),
        ("mindmap", "Mind Map"),
        ("gantt", "Gantt"),
        ("validate", "Status"),
    ):
        open_palette(page)
        page.get_by_test_id("command-palette-input").fill(label)
        page.wait_for_timeout(80)
        page.locator(
            '[data-testid="dialog-command-palette"] [role="option"]'
        ).first.click()
        page.wait_for_selector(f'[data-testid="view-{view_id}"]')
    log("all 6 view-switching commands work via palette")


def test_new_feature_in_module_command(page: Page) -> None:
    before = get_project(page)
    mod_id = before["modules"][0]["id"]
    feat_count_before = len(before["modules"][0]["features"])
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill(f"New Feature in {before['modules'][0]['label']}")
    page.wait_for_timeout(80)
    # Click the first match; must be the `add:<mod>` command
    opt = page.locator(
        '[data-testid="dialog-command-palette"] [role="option"]'
    ).first
    opt.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    close_drawer(page)
    wait_idle(page)
    after = get_project(page)
    mod_after = next(m for m in after["modules"] if m["id"] == mod_id)
    assert len(mod_after["features"]) == feat_count_before + 1, (
        f"feature count did not increase from {feat_count_before} to "
        f"{feat_count_before + 1}, got {len(mod_after['features'])}"
    )
    # cleanup: undo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"'New Feature in {before['modules'][0]['label']}' command created + undone")


def test_new_module_command(page: Page) -> None:
    before = get_project(page)
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("New Module")
    page.wait_for_timeout(80)
    page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-new:module"]'
    ).click()
    page.wait_for_selector('[data-testid="dialog-command-palette"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    assert len(after["modules"]) == len(before["modules"]) + 1, (
        f"module count did not increment: {len(before['modules'])} → "
        f"{len(after['modules'])}"
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("New Module command adds a module, undo reverses it")


def test_edit_project_meta_opens_editor(page: Page) -> None:
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Edit Project Meta")
    page.wait_for_timeout(80)
    page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-proj:edit-meta"]'
    ).click()
    page.wait_for_selector('[data-testid="dialog-project-meta"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")
    log("'Edit Project Meta…' opens meta editor")


def test_edit_milestones_opens_editor(page: Page) -> None:
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Edit Milestones")
    page.wait_for_timeout(80)
    page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-proj:edit-milestones"]'
    ).click()
    page.wait_for_selector('[data-testid="dialog-milestone"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-milestone"]', state="detached")
    log("'Edit Milestones…' opens milestone editor")


def test_rename_project_via_prompt(page: Page) -> None:
    before = get_project(page)
    before_name = before["meta"]["name"]
    new_name = f"{before_name} Test Rename"
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Rename Project")
    page.wait_for_timeout(80)
    opt = page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-proj:rename"]'
    )
    with DialogHandler(page, accept_with=new_name):
        opt.click()
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["name"] == new_name, (
        f"name did not change: {before_name!r} → {after['meta']['name']!r}"
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"'Rename Project' prompt: {before_name!r} → {new_name!r} → undone")


def test_set_version_via_prompt(page: Page) -> None:
    before = get_project(page)
    new_v = "9.9.9"
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Set Version")
    page.wait_for_timeout(80)
    opt = page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-proj:version"]'
    )
    with DialogHandler(page, accept_with=new_v):
        opt.click()
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["version"] == new_v
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"'Set Version' prompt: {before['meta']['version']!r} → {new_v!r} → undone")


def test_set_today_marker_via_prompt(page: Page) -> None:
    before = get_project(page)
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Today Marker")
    page.wait_for_timeout(80)
    opt = page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-proj:today"]'
    )
    with DialogHandler(page, accept_with="7"):
        opt.click()
    wait_idle(page)
    after = get_project(page)
    assert after["meta"].get("today") == 7, f"today not set: {after['meta'].get('today')}"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"'Set Today Marker' prompt: {before['meta'].get('today')} → 7 → undone")


def test_export_markdown_command_exists(page: Page) -> None:
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("Export as Markdown")
    page.wait_for_timeout(80)
    opt = page.locator(
        '[data-testid="dialog-command-palette"] [data-testid="command-file:markdown"]'
    )
    assert opt.count() == 1, "Export as Markdown command missing"
    close_palette(page)
    log("Export as Markdown command is present (not triggered — download)")


def test_empty_query_shows_no_match_placeholder(page: Page) -> None:
    open_palette(page)
    page.get_by_test_id("command-palette-input").fill("zzzznomatch")
    page.wait_for_timeout(120)
    empty = page.get_by_test_id("command-palette-empty")
    assert empty.count() == 1, "expected NO MATCHES placeholder"
    close_palette(page)
    log("impossible query shows 'NO MATCHES' placeholder")


TESTS = [
    test_open_close_via_keyboard,
    test_open_via_slash,
    test_open_via_topbar_button,
    test_default_list_hides_tasks,
    test_search_finds_tasks_on_query,
    test_fuzzy_search_ranks_by_position,
    test_navigate_via_arrow_keys,
    test_go_to_each_view_via_palette,
    test_new_feature_in_module_command,
    test_new_module_command,
    test_edit_project_meta_opens_editor,
    test_edit_milestones_opens_editor,
    test_rename_project_via_prompt,
    test_set_version_via_prompt,
    test_set_today_marker_via_prompt,
    test_export_markdown_command_exists,
    test_empty_query_shows_no_match_placeholder,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

"""Keyboard navigation: every shortcut from useKeyboardNav.ts, plus the
typing-guard that suppresses them inside inputs/textareas."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    DialogHandler,
    close_drawer,
    close_palette,
    feature_by_id,
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def test_view_switch_1_to_6(page: Page) -> None:
    goto_view(page, "scope")
    # Focus body so keydown isn't swallowed by some input
    page.keyboard.press("Escape")  # ensure no dialog stickies focus to body
    mapping = {
        "1": "scope",
        "2": "roadmap",
        "3": "kanban",
        "4": "mindmap",
        "5": "gantt",
        "6": "validate",
    }
    for key, view in mapping.items():
        page.keyboard.press(key)
        page.wait_for_selector(f'[data-testid="view-{view}"]')
    log("keys 1..6 switch views")


def test_question_mark_opens_help(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    page.keyboard.press("Shift+?")
    page.wait_for_selector('[data-testid="dialog-help"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-help"]', state="detached")
    log("'?' toggles help overlay")


def test_slash_opens_palette(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    page.keyboard.press("/")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    close_palette(page)
    log("'/' opens command palette")


def test_cmd_k_opens_palette(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    close_palette(page)
    log("Ctrl+K opens palette")


def test_j_k_moves_cursor(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    # j moves cursor down
    page.keyboard.press("j")
    page.wait_for_timeout(100)
    # enter opens drawer for cursored feature
    page.keyboard.press("Enter")
    page.wait_for_selector('[data-testid="dialog-task"]')
    fid = page.get_by_test_id("dialog-task").get_attribute("data-drawer-feature")
    assert fid, "enter should open drawer for cursored feature"
    close_drawer(page)
    log(f"j + Enter opens drawer for {fid!r}")


def test_n_creates_new_feature_and_opens_drawer(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    before = sum(len(m["features"]) for m in get_project(page)["modules"])
    page.keyboard.press("n")
    page.wait_for_selector('[data-testid="dialog-task"]')
    wait_idle(page)
    after = sum(len(m["features"]) for m in get_project(page)["modules"])
    assert after == before + 1, (before, after)
    close_drawer(page)
    # clean up via undo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("'n' creates feature + opens drawer")


def test_f2_renames_focused_feature(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    # ensure a cursor
    page.keyboard.press("j")
    page.wait_for_timeout(50)
    # F2 calls prompt()
    with DialogHandler(page, accept_with="___F2___"):
        page.keyboard.press("F2")
    wait_idle(page)
    proj = get_project(page)
    renamed = [f for m in proj["modules"] for f in m["features"] if f["label"] == "___F2___"]
    assert len(renamed) == 1, "F2 should have renamed one feature"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("F2 renames cursored feature")


def test_cmd_d_duplicates_feature(page: Page) -> None:
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    page.keyboard.press("j")
    page.wait_for_timeout(50)
    before = sum(len(m["features"]) for m in get_project(page)["modules"])
    page.keyboard.press("Control+d")
    page.wait_for_selector('[data-testid="dialog-task"]')
    wait_idle(page)
    after = sum(len(m["features"]) for m in get_project(page)["modules"])
    assert after == before + 1, (before, after)
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("Ctrl+D duplicates feature")


def test_typing_guard_inside_input(page: Page) -> None:
    """Opening the palette and typing inside its input must NOT also
    trigger shortcut 3 (kanban). Palette stays open."""
    goto_view(page, "scope")
    page.keyboard.press("Escape")
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    # type '3' into the search — should NOT jump to kanban
    page.keyboard.type("3")
    # palette is still open AND active view is still scope
    assert page.locator('[data-testid="dialog-command-palette"]').count() == 1
    assert page.locator('[data-testid="view-scope"]').count() == 1
    close_palette(page)
    log("typing '3' inside palette input does not switch view")


TESTS = [
    test_view_switch_1_to_6,
    test_question_mark_opens_help,
    test_slash_opens_palette,
    test_cmd_k_opens_palette,
    test_j_k_moves_cursor,
    test_n_creates_new_feature_and_opens_drawer,
    test_f2_renames_focused_feature,
    test_cmd_d_duplicates_feature,
    test_typing_guard_inside_input,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

"""Undo/Redo: verify the 50-step history round-trips data changes, leaves UI
state (active view, filter) alone, and that btn-undo/btn-redo enable/disable
correctly when the stack empties."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    DialogHandler,
    click_menu_item,
    dnd_html5,
    feature_by_id,
    get_project,
    goto_view,
    log,
    open_feature_context_menu,
    run_suite,
    wait_idle,
)


def _first_feature_locator(page: Page):
    return page.locator('[data-testid="view-scope"] [data-feature-id]').first


def test_buttons_disabled_on_fresh_load(page: Page) -> None:
    goto_view(page, "scope")
    undo = page.get_by_test_id("btn-undo")
    redo = page.get_by_test_id("btn-redo")
    assert undo.is_disabled(), "undo should start disabled"
    assert redo.is_disabled(), "redo should start disabled"
    log("undo/redo start disabled")


def test_rename_feature_round_trip(page: Page) -> None:
    goto_view(page, "scope")
    feat = _first_feature_locator(page)
    fid = feat.get_attribute("data-feature-id")
    before = feature_by_id(get_project(page), fid)["label"]
    open_feature_context_menu(page, feat)
    with DialogHandler(page, accept_with="___RENAMED___"):
        click_menu_item(page, "Rename")
    wait_idle(page)
    assert feature_by_id(get_project(page), fid)["label"] == "___RENAMED___"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert feature_by_id(get_project(page), fid)["label"] == before
    page.get_by_test_id("btn-redo").click()
    wait_idle(page)
    assert feature_by_id(get_project(page), fid)["label"] == "___RENAMED___"
    # clean up for later tests
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"feature rename undo/redo round-trips for {fid!r}")


def test_delete_feature_round_trip(page: Page) -> None:
    goto_view(page, "scope")
    feat = _first_feature_locator(page)
    fid = feat.get_attribute("data-feature-id")
    before = feature_by_id(get_project(page), fid)
    assert before is not None
    open_feature_context_menu(page, feat)
    with DialogHandler(page):  # accept confirm
        click_menu_item(page, "Delete")
    wait_idle(page)
    assert feature_by_id(get_project(page), fid) is None, "feature should be gone"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert feature_by_id(get_project(page), fid) is not None, "undo should resurrect"
    log(f"feature delete undo resurrects {fid!r}")


def test_roadmap_dnd_undo(page: Page) -> None:
    goto_view(page, "roadmap")
    proj = get_project(page)
    src_ms = proj["meta"]["milestones"][0]["id"]
    dst_ms = proj["meta"]["milestones"][1]["id"]
    feat_id = None
    for m in proj["modules"]:
        for f in m["features"]:
            if f["ms"] == src_ms:
                feat_id = f["id"]
                break
        if feat_id:
            break
    assert feat_id, f"no feature in {src_ms}"
    src_sel = f'[data-testid="roadmap-col-{src_ms}"] [data-feature-id="{feat_id}"]'
    dst_sel = f'[data-testid="roadmap-col-{dst_ms}"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    assert feature_by_id(get_project(page), feat_id)["ms"] == dst_ms
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert feature_by_id(get_project(page), feat_id)["ms"] == src_ms
    log(f"roadmap DnD undo restores ms for {feat_id!r}")


def test_ui_state_not_in_history(page: Page) -> None:
    """Switching views & toggling filters must NOT push onto the undo stack."""
    goto_view(page, "scope")
    # Put something into the undo stack first so we have a known top-of-stack.
    feat = _first_feature_locator(page)
    fid = feat.get_attribute("data-feature-id")
    open_feature_context_menu(page, feat)
    with DialogHandler(page, accept_with="UI-ANCHOR"):
        click_menu_item(page, "Rename")
    wait_idle(page)
    # Now do UI-only actions — none of these should pop the data-level anchor.
    goto_view(page, "roadmap")
    goto_view(page, "kanban")
    page.get_by_test_id("filter-status-ready").click()
    page.get_by_test_id("filter-status-all").click()
    # One undo click should still undo the rename, not a UI switch.
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert feature_by_id(get_project(page), fid)["label"] != "UI-ANCHOR", (
        "undo should have reverted the rename, meaning UI actions did not enter history"
    )
    log("view switches + filter toggles stay out of undo stack")


def test_redo_cleared_after_new_action(page: Page) -> None:
    goto_view(page, "scope")
    feat = _first_feature_locator(page)
    fid = feat.get_attribute("data-feature-id")
    # action 1
    open_feature_context_menu(page, feat)
    with DialogHandler(page, accept_with="ONE"):
        click_menu_item(page, "Rename")
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    assert not page.get_by_test_id("btn-redo").is_disabled(), "redo should be enabled"
    # action 2 (new branch — should invalidate redo)
    open_feature_context_menu(page, _first_feature_locator(page))
    with DialogHandler(page, accept_with="TWO"):
        click_menu_item(page, "Rename")
    wait_idle(page)
    assert page.get_by_test_id("btn-redo").is_disabled(), (
        "new action after undo should clear redo stack"
    )
    # clean up
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("new action after undo clears the redo stack")


TESTS = [
    test_buttons_disabled_on_fresh_load,
    test_rename_feature_round_trip,
    test_delete_feature_round_trip,
    test_roadmap_dnd_undo,
    test_ui_state_not_in_history,
    test_redo_cleared_after_new_action,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

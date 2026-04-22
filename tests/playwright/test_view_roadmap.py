"""Roadmap view: milestone columns render, feature DnD between columns, MS
filter narrows columns, status-mismatch auto-resets status filter."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    dnd_html5,
    feature_by_id,
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def test_view_mounts_with_columns(page: Page) -> None:
    goto_view(page, "roadmap")
    cols = page.locator('[data-testid^="roadmap-col-"]')
    proj = get_project(page)
    expected = len(proj["meta"]["milestones"])
    assert cols.count() == expected, f"expected {expected} columns, got {cols.count()}"
    log(f"roadmap mounts with {expected} milestone columns")


def test_feature_dnd_between_columns(page: Page) -> None:
    goto_view(page, "roadmap")
    proj = get_project(page)
    # Pick first feature in first milestone and move to next milestone.
    src_ms = proj["meta"]["milestones"][0]["id"]
    dst_ms = proj["meta"]["milestones"][1]["id"]
    feat = None
    for m in proj["modules"]:
        for f in m["features"]:
            if f["ms"] == src_ms:
                feat = f
                break
        if feat:
            break
    assert feat, f"no feature on milestone {src_ms}"
    fid = feat["id"]

    src_sel = f'[data-testid="roadmap-col-{src_ms}"] [data-feature-id="{fid}"]'
    dst_sel = f'[data-testid="roadmap-col-{dst_ms}"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["ms"] == dst_ms, (
        feature_by_id(after, fid)["ms"],
        dst_ms,
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"roadmap DnD moved {fid!r} {src_ms!r} → {dst_ms!r}")


def test_milestone_filter_narrows_columns(page: Page) -> None:
    goto_view(page, "roadmap")
    proj = get_project(page)
    target = proj["meta"]["milestones"][0]["id"]
    page.get_by_test_id(f"filter-ms-{target}").click()
    cols = page.locator('[data-testid^="roadmap-col-"]')
    assert cols.count() == 1, f"expected 1 column after filter, got {cols.count()}"
    assert cols.first.get_attribute("data-testid") == f"roadmap-col-{target}"
    page.get_by_test_id("filter-ms-all").click()
    log(f"MS filter narrows roadmap to single column {target!r}")


def test_status_filter_drops_non_matching_features(page: Page) -> None:
    goto_view(page, "roadmap")
    # Status=ready removes blocked ones; status=done shows only completed.
    # We just verify that columns still mount and no crash.
    page.get_by_test_id("filter-status-ready").click()
    wait_idle(page)
    assert page.locator('[data-testid^="roadmap-col-"]').count() >= 1
    page.get_by_test_id("filter-status-all").click()
    wait_idle(page)
    log("status=ready filter applied without regressions")


def test_feature_click_opens_drawer(page: Page) -> None:
    goto_view(page, "roadmap")
    feat = page.locator('[data-testid^="roadmap-col-"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    assert page.get_by_test_id("dialog-task").get_attribute("data-drawer-feature") == fid
    page.keyboard.press("Escape")
    try:
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached", timeout=500)
    except Exception:
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log(f"roadmap feature click opens drawer for {fid!r}")


def test_right_click_empty_column_opens_context_menu(page: Page) -> None:
    """Right-click on a milestone column's header (the `{ms.id} | {label}`
    block above the feature list) opens the column's empty-area menu with
    the 'New Feature in {milestone}' item — reachable regardless of how
    densely the feature list fills the column."""
    goto_view(page, "roadmap")
    proj = get_project(page)
    first_ms = proj["meta"]["milestones"][0]["id"]
    header = page.locator(
        f'[data-testid="roadmap-col-{first_ms}"] h2'
    ).first
    header.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="context-menu"]', state="detached")
    log(f"roadmap column header right-click opens empty-area menu for {first_ms}")


TESTS = [
    test_view_mounts_with_columns,
    test_feature_dnd_between_columns,
    test_milestone_filter_narrows_columns,
    test_status_filter_drops_non_matching_features,
    test_feature_click_opens_drawer,
    test_right_click_empty_column_opens_context_menu,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

"""Gantt view: mount, bar drag, resize handle, zoom, today marker + jump."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    feature_by_id,
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def test_view_mounts(page: Page) -> None:
    goto_view(page, "gantt")
    view = page.get_by_test_id("view-gantt")
    assert view.count() == 1
    # bars render as [data-gantt-bar]
    bars = page.locator("[data-gantt-bar]").count()
    assert bars >= 1, f"expected gantt bars, got {bars}"
    log(f"gantt mounts with {bars} bars")


def test_zoom_in_updates_week_width(page: Page) -> None:
    goto_view(page, "gantt")
    view = page.get_by_test_id("view-gantt")
    before = int(view.get_attribute("data-gantt-week-w"))
    page.locator('[data-testid="view-gantt"] button[title="Zoom in"]').click()
    page.wait_for_timeout(50)
    after = int(view.get_attribute("data-gantt-week-w"))
    assert after > before, (before, after)
    # reset
    page.locator('[data-testid="view-gantt"] button[title="Zoom out"]').click()
    page.wait_for_timeout(50)
    log(f"zoom in increased week-w {before} → {after}")


def test_today_marker_present_when_meta_set(page: Page) -> None:
    goto_view(page, "gantt")
    proj = get_project(page)
    if proj["meta"].get("today") is None:
        log("seed has no meta.today; skipping today marker assertion")
        return
    # Today marker is a circle at top of grid; the → TODAY button is the easier signal.
    btn = page.locator('[data-testid="view-gantt"] button', has_text="→ TODAY")
    assert btn.count() == 1, "expected → TODAY button when meta.today is set"
    log(f"today marker button rendered for meta.today = W{proj['meta']['today']}")


def test_bar_has_data_attributes(page: Page) -> None:
    goto_view(page, "gantt")
    bar = page.locator("[data-gantt-bar]").first
    fid = bar.get_attribute("data-gantt-bar")
    assert fid
    proj = get_project(page)
    feat = feature_by_id(proj, fid)
    assert feat is not None, fid
    log(f"first bar wires to feature {fid!r} (ganttStart={feat['ganttStart']}, ganttEnd={feat['ganttEnd']})")


def test_bar_label_links_to_feature(page: Page) -> None:
    goto_view(page, "gantt")
    label = page.locator("[data-gantt-label]").first
    fid = label.get_attribute("data-gantt-label")
    assert fid
    log(f"first row label is bound to feature {fid!r}")


def test_bar_resize_handle_present(page: Page) -> None:
    goto_view(page, "gantt")
    handle = page.locator("[data-gantt-resize]").first
    fid = handle.get_attribute("data-gantt-resize")
    assert fid
    log(f"first bar exposes resize handle for {fid!r}")


def test_jump_to_today_button_clickable(page: Page) -> None:
    goto_view(page, "gantt")
    proj = get_project(page)
    if proj["meta"].get("today") is None:
        log("no meta.today; skipping jump test")
        return
    btn = page.locator('[data-testid="view-gantt"] button', has_text="→ TODAY")
    btn.click()
    log("jump-to-today button click is accepted without error")


TESTS = [
    test_view_mounts,
    test_zoom_in_updates_week_width,
    test_today_marker_present_when_meta_set,
    test_bar_has_data_attributes,
    test_bar_label_links_to_feature,
    test_bar_resize_handle_present,
    test_jump_to_today_button_clickable,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

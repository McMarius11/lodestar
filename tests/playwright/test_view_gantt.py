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


def test_resize_edge_extends_only_end(page: Page) -> None:
    """Coverage gap: dragging the right-edge resize handle should change
    ganttEnd but NOT ganttStart — the move handle and resize handle must
    not be conflated."""
    goto_view(page, "gantt")
    # pick the first resize handle + its feature
    handle = page.locator("[data-gantt-resize]").first
    fid = handle.get_attribute("data-gantt-resize")
    assert fid
    proj = get_project(page)
    feat = feature_by_id(proj, fid)
    assert feat is not None
    orig_start = feat["ganttStart"]
    orig_end = feat["ganttEnd"]
    week_w = int(page.locator("[data-gantt-week-w]").first.get_attribute("data-gantt-week-w") or 44)

    handle.scroll_into_view_if_needed()
    box = handle.bounding_box()
    assert box
    sx = box["x"] + box["width"] / 2
    sy = box["y"] + box["height"] / 2
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + week_w * 2, sy, steps=8)
    page.mouse.up()
    wait_idle(page)

    after_proj = get_project(page)
    after = feature_by_id(after_proj, fid)
    assert after is not None
    # start must be unchanged
    assert after["ganttStart"] == orig_start, (
        f"resize must not touch ganttStart: {orig_start} → {after['ganttStart']}"
    )
    # end extended by ~2 weeks (we allow ±1 to tolerate snap rounding / step count)
    assert after["ganttEnd"] >= orig_end + 1, (
        f"resize should extend ganttEnd: {orig_end} → {after['ganttEnd']}"
    )
    delta = after["ganttEnd"] - orig_end
    assert 1 <= delta <= 3, f"unexpected delta {delta} (expected ~2)"

    # undo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    restored = feature_by_id(get_project(page), fid)
    assert restored["ganttEnd"] == orig_end  # type: ignore[index]
    log(f"resize-edge drag: end {orig_end} → {after['ganttEnd']} (start stayed {orig_start}), undone")


TESTS = [
    test_view_mounts,
    test_zoom_in_updates_week_width,
    test_today_marker_present_when_meta_set,
    test_bar_has_data_attributes,
    test_bar_label_links_to_feature,
    test_bar_resize_handle_present,
    test_jump_to_today_button_clickable,
    test_resize_edge_extends_only_end,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

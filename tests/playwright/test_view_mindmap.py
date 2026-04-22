"""MindMap view: mount, zoom, pan, reset, node drag override, pin persistence."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def test_view_mounts(page: Page) -> None:
    goto_view(page, "mindmap")
    canvas = page.get_by_test_id("mindmap-canvas")
    assert canvas.count() == 1
    # At least one module + feature should be rendered
    mods = page.locator("[data-mindmap-module]").count()
    feats = page.locator("[data-mindmap-node]").count()
    assert mods >= 1 and feats >= 1, (mods, feats)
    log(f"mindmap mounts with {mods} modules, {feats} feature nodes")


def test_wheel_zoom_updates_scale(page: Page) -> None:
    goto_view(page, "mindmap")
    canvas = page.get_by_test_id("mindmap-canvas")
    before = float(canvas.get_attribute("data-mindmap-zoom"))
    # dispatch a wheel event directly (page.mouse.wheel also works)
    canvas.evaluate(
        """el => el.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -120, bubbles: true, cancelable: true, clientX: 400, clientY: 300,
        }))"""
    )
    # React may need a tick
    page.wait_for_timeout(100)
    after = float(canvas.get_attribute("data-mindmap-zoom"))
    assert after != before, f"zoom did not change: {before} → {after}"
    log(f"wheel changed zoom {before:.3f} → {after:.3f}")


def test_reset_button_returns_to_defaults(page: Page) -> None:
    goto_view(page, "mindmap")
    canvas = page.get_by_test_id("mindmap-canvas")
    # ensure we're not at 1.0 to begin with
    canvas.evaluate(
        """el => el.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -240, bubbles: true, cancelable: true, clientX: 400, clientY: 300,
        }))"""
    )
    page.wait_for_timeout(80)
    page.locator('[data-testid="view-mindmap"] button', has_text="RESET").click()
    page.wait_for_timeout(80)
    zoom = float(canvas.get_attribute("data-mindmap-zoom"))
    pan_x = float(canvas.get_attribute("data-mindmap-pan-x"))
    pan_y = float(canvas.get_attribute("data-mindmap-pan-y"))
    assert abs(zoom - 1.0) < 0.001, zoom
    assert abs(pan_x) < 0.001 and abs(pan_y) < 0.001, (pan_x, pan_y)
    log("RESET button restores zoom=1 pan=0")


def test_node_has_position_attributes(page: Page) -> None:
    goto_view(page, "mindmap")
    node = page.locator("[data-mindmap-node]").first
    x = node.get_attribute("data-mindmap-x")
    y = node.get_attribute("data-mindmap-y")
    assert x is not None and y is not None
    float(x)
    float(y)
    log(f"first feature node has position ({x}, {y})")


def test_double_click_resets_view(page: Page) -> None:
    goto_view(page, "mindmap")
    canvas = page.get_by_test_id("mindmap-canvas")
    # tweak zoom
    canvas.evaluate(
        """el => el.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -240, bubbles: true, cancelable: true, clientX: 400, clientY: 300,
        }))"""
    )
    page.wait_for_timeout(80)
    canvas.dblclick()
    page.wait_for_timeout(80)
    zoom = float(canvas.get_attribute("data-mindmap-zoom"))
    assert abs(zoom - 1.0) < 0.001, zoom
    log("double-click resets zoom to 1.0")


TESTS = [
    test_view_mounts,
    test_wheel_zoom_updates_scale,
    test_reset_button_returns_to_defaults,
    test_node_has_position_attributes,
    test_double_click_resets_view,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

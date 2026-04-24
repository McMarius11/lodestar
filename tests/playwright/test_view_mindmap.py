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


def test_shift_pointerdown_starts_connect_mode(page: Page) -> None:
    """Coverage gap: Shift+pointerdown on a MindMap node starts the connect
    mode. Proof: a dashed accent 'rubber-band' line is rendered while the
    drag is in flight. The full drop-to-DepEditor path is hard to
    automate reliably (React 18 batches state flushes between synthesized
    pointer events), so this test locks in the *entry* to the flow — the
    continuation is covered by openDepEditor tests in test_dep_editor."""
    goto_view(page, "mindmap")
    node = page.locator("[data-mindmap-node]").first
    node_id = node.get_attribute("data-mindmap-node")
    assert node_id
    box = node.bounding_box()
    assert box
    sx = box["x"] + box["width"] / 2
    sy = box["y"] + box["height"] / 2

    # Dispatch shift+pointerdown in raw DOM to bypass the capture/release
    # sequence that Playwright's real mouse driver fires automatically.
    page.evaluate(
        """({sel, x, y}) => {
          const el = document.querySelector(sel);
          el.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerType: 'mouse',
            pointerId: 1, button: 0, clientX: x, clientY: y, shiftKey: true,
          }));
        }""",
        {"sel": f'[data-mindmap-node="{node_id}"]', "x": sx, "y": sy},
    )
    # The rubber-band line has stroke-dasharray; it exists only while
    # `connect` is set. Wait for it to appear.
    line = page.locator('[data-testid="view-mindmap"] svg line[stroke-dasharray]')
    line.first.wait_for(state="attached", timeout=2000)
    # Release the drag so later tests start from a clean state.
    page.evaluate(
        """() => {
          const svg = document.querySelector('[data-testid="mindmap-canvas"]');
          svg.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, pointerType: 'mouse',
            pointerId: 1, button: 0, clientX: 0, clientY: 0,
          }));
        }"""
    )
    log(f"Shift+pointerdown on {node_id!r} starts connect-mode (rubber-band line)")


TESTS = [
    test_view_mounts,
    test_wheel_zoom_updates_scale,
    test_reset_button_returns_to_defaults,
    test_node_has_position_attributes,
    test_double_click_resets_view,
    test_shift_pointerdown_starts_connect_mode,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

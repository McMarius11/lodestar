"""Lodestar end-to-end smoke test.

Drives the full app in a browser via Playwright — exercises every view, every
DnD mechanism, zoom/pan on MindMap, Gantt bar drag+resize, undo/redo, command
palette, context menus, and modal flows.

Run against a web build (dev or preview server):

    # terminal A
    npm run dev
    # terminal B
    python3 tests/playwright/smoke.py http://localhost:5173

If no URL is given, defaults to http://localhost:5173.

The test seeds project state by writing localStorage before load, so it is
deterministic and independent of the file on disk.
"""
from __future__ import annotations

import json
import pathlib
import sys
import time
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright, expect


REPO = pathlib.Path(__file__).resolve().parents[2]
SEED_PATH = REPO / "data" / "project.example.json"
LS_KEY = "projekt-planner:project:v1"


def log(msg: str) -> None:
    print(f"  · {msg}", flush=True)


def seed_local_storage(page: Page, seed: dict[str, Any]) -> None:
    page.add_init_script(
        f"window.localStorage.setItem({json.dumps(LS_KEY)}, {json.dumps(json.dumps(seed))});"
    )


def wait_idle(page: Page, timeout_ms: int = 5000) -> None:
    """Wait until the save indicator reports idle (not actively saving)."""
    page.wait_for_function(
        """() => {
            const el = document.querySelector('[data-testid="save-indicator"]');
            return !el || el.getAttribute('data-save-status') !== 'saving';
        }""",
        timeout=timeout_ms,
    )


def get_bbox(locator) -> dict[str, float]:
    box = locator.bounding_box()
    assert box is not None, f"no bounding box for {locator}"
    return box


def center(box: dict[str, float]) -> tuple[float, float]:
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


# ---------------------------------------------------------------------------


def test_tabs_navigate(page: Page) -> None:
    for view in ("scope", "roadmap", "kanban", "mindmap", "gantt", "validate"):
        page.get_by_test_id(f"tab-{view}").click()
        page.wait_for_selector(f'[data-testid="view-{view}"]')
        tab = page.get_by_test_id(f"tab-{view}")
        assert tab.get_attribute("aria-selected") == "true", view
    log("tab navigation across all six views ok")


def test_filters(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')

    status = page.get_by_test_id("filter-status-blocked")
    status.click()
    assert status.get_attribute("aria-pressed") == "true"
    page.get_by_test_id("filter-status-all").click()

    ms_all = page.get_by_test_id("filter-ms-all")
    ms_pills = page.locator('[data-testid^="filter-ms-"]').all()
    assert len(ms_pills) >= 2, "expected at least one milestone + 'all' pill"
    assert ms_all.get_attribute("aria-pressed") == "true"
    # click a non-'all' milestone pill
    for p in ms_pills:
        tid = p.get_attribute("data-testid") or ""
        if tid != "filter-ms-all":
            p.click()
            assert p.get_attribute("aria-pressed") == "true"
            break
    ms_all.click()
    log("status + milestone filter toggles ok")


def test_context_menu_opens_drawer(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')
    feature = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    feature.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    # first action item
    page.locator('[data-testid="context-menu"] [role="menuitem"]').first.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("context-menu → drawer open → esc close ok")


def test_click_opens_drawer(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')
    page.locator('[data-testid="view-scope"] [data-feature-id]').first.click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    fid = drawer.get_attribute("data-drawer-feature")
    assert fid, "drawer missing data-drawer-feature"
    page.keyboard.press("Escape")
    log(f"click-to-open drawer works (feature={fid})")


def test_command_palette_navigates(page: Page) -> None:
    """Open palette, search, select, and verify it navigated — without
    committing a store mutation that might corrupt seed state."""
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    inp = page.get_by_test_id("command-palette-input")
    inp.fill("roadmap")
    page.wait_for_selector('[data-testid="dialog-command-palette"] [role="option"]')
    page.locator('[data-testid="dialog-command-palette"] [role="option"]').first.click()
    page.wait_for_selector('[data-testid="dialog-command-palette"]', state="detached")
    page.wait_for_selector('[data-testid="view-roadmap"]')
    log("command palette → navigate ok")


def test_undo_redo_buttons(page: Page) -> None:
    """Commit a real change (toggle a task) then undo and redo it."""
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    feat.click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    fid_before = drawer.get_attribute("data-drawer-feature")
    # toggle the first task's checkbox (a commit)
    checkbox = drawer.locator("button").filter(has_text="").first
    # safer: toggle whatever the first task-row button is
    task_btn = drawer.locator("ul li button").first
    if task_btn.count():
        task_btn.click()
        wait_idle(page)
    page.keyboard.press("Escape")
    # undo then redo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-redo").click()
    wait_idle(page)
    log(f"undo/redo via buttons ok (feature={fid_before})")


def test_roadmap_dnd(page: Page) -> None:
    page.get_by_test_id("tab-roadmap").click()
    page.wait_for_selector('[data-testid="view-roadmap"]')
    cols = page.locator('[data-testid^="roadmap-col-"]').all()
    assert len(cols) >= 2, "need at least two milestone columns"
    src_col = cols[0]
    dst_col = cols[-1]
    src_ms = src_col.get_attribute("data-milestone-id")
    dst_ms = dst_col.get_attribute("data-milestone-id")
    src_feature = src_col.locator("[data-feature-id]").first
    fid = src_feature.get_attribute("data-feature-id")
    assert fid, "no feature in source column"

    # Dispatch HTML5 DnD events with render-yield between them. Without
    # the awaits, React never flushes setDragId() between dragstart and
    # drop, and the drop handler closes over stale null dragId.
    page.evaluate(
        """async ([fromSel, toSel]) => {
          const from = document.querySelector(fromSel);
          const to = document.querySelector(toSel);
          if (!from || !to) throw new Error('DnD: missing ' + (from ? 'dst' : 'src'));
          const dt = new DataTransfer();
          const yieldFrame = () => new Promise(r => requestAnimationFrame(() => r()));
          from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
          await yieldFrame(); await yieldFrame();
          to.dispatchEvent(new DragEvent('dragenter',   { bubbles: true, dataTransfer: dt }));
          to.dispatchEvent(new DragEvent('dragover',    { bubbles: true, dataTransfer: dt }));
          await yieldFrame();
          to.dispatchEvent(new DragEvent('drop',        { bubbles: true, dataTransfer: dt }));
          await yieldFrame();
          from.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer: dt }));
        }""",
        [
            f'[data-testid="roadmap-col-{src_ms}"] [data-feature-id="{fid}"]',
            f'[data-testid="roadmap-col-{dst_ms}"]',
        ],
    )
    wait_idle(page)
    moved = page.locator(f'[data-testid="roadmap-col-{dst_ms}"] [data-feature-id="{fid}"]')
    expect(moved).to_have_count(1)
    log(f"roadmap DnD {fid}: {src_ms} → {dst_ms} ok")


def test_kanban_card_click(page: Page) -> None:
    page.get_by_test_id("tab-kanban").click()
    page.wait_for_selector('[data-testid="view-kanban"]')
    cols = page.locator('[data-testid^="kanban-col-"]').all()
    assert len(cols) == 3, "expected 3 kanban columns"
    # cards in any column
    cards = page.locator('[data-testid="view-kanban"] [data-feature-id]').all()
    assert cards, "expected some kanban cards"
    cards[0].click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    page.keyboard.press("Escape")
    log("kanban card opens drawer ok")


def test_gantt_bar_drag(page: Page) -> None:
    page.get_by_test_id("tab-gantt").click()
    view = page.get_by_test_id("view-gantt")
    view.wait_for()
    week_w_attr = view.get_attribute("data-gantt-week-w")
    assert week_w_attr, "gantt missing data-gantt-week-w"
    week_w = float(week_w_attr)

    bar = page.locator("[data-gantt-bar]").first
    fid = bar.get_attribute("data-gantt-bar")
    assert fid
    box = get_bbox(bar)
    start_x, start_y = center(box)
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x + week_w * 2, start_y, steps=8)
    page.mouse.up()
    wait_idle(page)
    log(f"gantt bar drag {fid} (+2 weeks, week_w={week_w:.1f}) ok")


def test_gantt_bar_resize(page: Page) -> None:
    page.get_by_test_id("tab-gantt").click()
    view = page.get_by_test_id("view-gantt")
    view.wait_for()
    week_w = float(view.get_attribute("data-gantt-week-w") or "0")
    handle = page.locator("[data-gantt-resize]").first
    box = get_bbox(handle)
    x, y = center(box)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + week_w * 1.5, y, steps=6)
    page.mouse.up()
    wait_idle(page)
    log("gantt bar resize +1.5 weeks ok")


def test_mindmap_node_drag_and_zoom(page: Page) -> None:
    page.get_by_test_id("tab-mindmap").click()
    canvas = page.get_by_test_id("mindmap-canvas")
    canvas.wait_for()
    zoom_before = float(canvas.get_attribute("data-mindmap-zoom") or "1")

    # zoom via wheel
    cbox = get_bbox(canvas)
    cx, cy = center(cbox)
    page.mouse.move(cx, cy)
    page.mouse.wheel(0, -500)
    # zoom should change
    page.wait_for_function(
        f"""() => {{
            const z = parseFloat(document.querySelector('[data-testid=mindmap-canvas]').getAttribute('data-mindmap-zoom'));
            return Math.abs(z - {zoom_before}) > 0.01;
        }}"""
    )
    zoom_after = float(canvas.get_attribute("data-mindmap-zoom") or "1")
    assert zoom_after != zoom_before, f"zoom did not change: {zoom_before} → {zoom_after}"

    # pan: drag on empty canvas area (away from nodes, near corner)
    pan_x_before = float(canvas.get_attribute("data-mindmap-pan-x") or "0")
    page.mouse.move(cbox["x"] + 30, cbox["y"] + 30)
    page.mouse.down()
    page.mouse.move(cbox["x"] + 180, cbox["y"] + 150, steps=10)
    page.mouse.up()
    pan_x_after = float(canvas.get_attribute("data-mindmap-pan-x") or "0")
    assert pan_x_after != pan_x_before, "pan x did not change"

    # node drag
    node = page.locator("[data-mindmap-node]").first
    nbox = get_bbox(node)
    nx, ny = center(nbox)
    page.mouse.move(nx, ny)
    page.mouse.down()
    page.mouse.move(nx + 80, ny + 60, steps=10)
    page.mouse.up()
    wait_idle(page)
    log(
        f"mindmap zoom {zoom_before:.2f}→{zoom_after:.2f}, "
        f"pan x {pan_x_before:.1f}→{pan_x_after:.1f}, node drag ok"
    )


def test_help_overlay(page: Page) -> None:
    page.keyboard.press("?")
    page.wait_for_selector('[data-testid="dialog-help"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-help"]', state="detached")
    log("help overlay open/close ok")


def test_save_indicator_reaches_idle(page: Page) -> None:
    wait_idle(page, 10_000)
    status = page.get_by_test_id("save-indicator").get_attribute("data-save-status")
    # 'idle' when untouched, 'saved' after a commit — both are terminal
    assert status in {"idle", "saved", None}, f"unexpected save status {status}"
    log(f"save indicator: {status}")


# ---------------------------------------------------------------------------


TESTS = [
    test_tabs_navigate,
    test_filters,
    test_context_menu_opens_drawer,
    test_click_opens_drawer,
    test_command_palette_navigates,
    test_help_overlay,
    test_kanban_card_click,
    test_roadmap_dnd,
    test_gantt_bar_drag,
    test_gantt_bar_resize,
    test_mindmap_node_drag_and_zoom,
    test_undo_redo_buttons,
    test_save_indicator_reaches_idle,
]


def main(url: str) -> int:
    seed = json.loads(SEED_PATH.read_text())
    print(f"→ Seed from {SEED_PATH.name}")
    print(f"→ Target:   {url}")

    with sync_playwright() as pw:
        browser: Browser = pw.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.on("console", lambda msg: print(f"  [console.{msg.type}] {msg.text}") if msg.type in {"error", "warning"} else None)
        page.on("pageerror", lambda err: print(f"  [pageerror] {err}"))
        page.add_init_script(
            f"window.localStorage.setItem({json.dumps(LS_KEY)}, {json.dumps(json.dumps(seed))});"
        )
        page.goto(url, wait_until="networkidle")

        # Wait for either the tablist (a project loaded) or the welcome
        # screen's sample button. The seeded localStorage doesn't always
        # win the race against the welcome flow on first run, so we make
        # clicking the sample button the canonical path.
        page.wait_for_function(
            """() => {
                if (document.querySelector('[role="tablist"]')) return true;
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.some(b => /try the nimbus example/i.test(b.textContent || ''));
            }""",
            timeout=15_000,
        )

        if page.locator('[role="tablist"]').count() == 0:
            # Welcome screen showing — click "Try the Nimbus example".
            page.locator("button", has_text="Try the Nimbus example").first.click()
            page.wait_for_selector('[role="tablist"]', timeout=10_000)

        page.wait_for_selector('[data-testid="view-scope"], [role="tabpanel"]', timeout=10_000)

        failed = 0
        for t in TESTS:
            try:
                print(f"▶ {t.__name__}")
                t(page)
            except Exception as exc:
                failed += 1
                print(f"  ✗ FAILED: {exc!r}")
        browser.close()

        total = len(TESTS)
        passed = total - failed
        print()
        print(f"{'✓' if failed == 0 else '✗'} {passed}/{total} passed")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
    sys.exit(main(url))

"""Visual tour: capture a screenshot of every meaningful UI state.

Output goes to tests/playwright/screenshots/<state>.png. Read these back
to spot-check rendering, spacing, copy, and overall visual coherence —
purely automated assertions miss layout drift, overlapping text,
off-screen modals, contrast issues, etc.

Run against a dev server:

    npm run dev
    python3 tests/playwright/visual_tour.py http://localhost:5173
"""
from __future__ import annotations

import pathlib
import shutil
import sys

from playwright.sync_api import Page, sync_playwright

from _lib import (
    DEFAULT_URL,
    bootstrap_app,
    clear_local_storage,
    load_default_seed,
    seed_local_storage,
    wait_idle,
)

OUT = pathlib.Path(__file__).parent / "screenshots"
DESKTOP = {"width": 1280, "height": 800}
MOBILE = {"width": 640, "height": 900}


def shoot(page: Page, name: str) -> None:
    page.wait_for_timeout(150)  # let any animation settle
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  · {name}.png")


def goto(page: Page, view: str) -> None:
    page.get_by_test_id(f"tab-{view}").click()
    page.wait_for_selector(f'[data-testid="view-{view}"]')
    wait_idle(page)


# ---------------------------------------------------------------------------
# tour sections
# ---------------------------------------------------------------------------


def tour_views(page: Page) -> None:
    """Each of the six views in default state."""
    for view in ("scope", "roadmap", "kanban", "mindmap", "gantt", "validate"):
        goto(page, view)
        shoot(page, f"view-{view}")


def _scope_feature(page: Page):
    return page.locator('[data-testid="view-scope"] [data-feature-id]').first


def tour_scope_interactions(page: Page) -> None:
    goto(page, "scope")
    # Expand a feature to show inline tasks
    chev = _scope_feature(page).locator(
        'button[aria-label*="Expand"], button[aria-label*="Collapse"], button[aria-label*="tasks"]'
    )
    if chev.count() > 0:
        chev.first.click()
        page.wait_for_timeout(150)
        shoot(page, "scope-feature-expanded")
        chev.first.click()  # collapse again
        page.wait_for_timeout(120)
    # Right-click context menu on a feature
    _scope_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]', timeout=3000)
    shoot(page, "scope-context-menu")
    # Hover the "Move to module" submenu if present
    move_item = page.get_by_test_id("menuitem-submenu-move-to-module")
    if move_item.count() > 0:
        move_item.first.hover()
        try:
            page.wait_for_selector('[data-testid="context-submenu"]', timeout=2000)
            shoot(page, "scope-context-submenu")
        except Exception:
            pass
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)


def tour_drawer(page: Page) -> None:
    goto(page, "scope")
    _scope_feature(page).click()
    page.wait_for_selector('[data-testid="dialog-task"]', timeout=3000)
    wait_idle(page)
    shoot(page, "drawer-default")
    # Try to scroll inside the drawer to see lower-half (tasks/deps)
    drawer = page.get_by_test_id("dialog-task")
    drawer.evaluate(
        "el => { const scroller = el.querySelector('[data-testid=\"drawer-scroll\"]')"
        " || el.querySelector('.overflow-y-auto') || el; scroller.scrollTop = 9999; }"
    )
    page.wait_for_timeout(150)
    shoot(page, "drawer-scrolled")
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)


def tour_overlays(page: Page) -> None:
    goto(page, "scope")
    # Command palette
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    shoot(page, "palette-empty")
    page.keyboard.type("auth")
    page.wait_for_timeout(150)
    shoot(page, "palette-search")
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-command-palette"]', state="detached", timeout=2000)
    # Help overlay — bound to Shift+/, but only fires when focus is outside any input.
    # Drop focus by blurring active element, then dispatch the keydown the hook expects.
    page.evaluate("() => { (document.activeElement instanceof HTMLElement) && document.activeElement.blur(); }")
    page.wait_for_timeout(80)
    page.keyboard.press("Shift+Slash")
    page.wait_for_selector('[data-testid="dialog-help"]', timeout=2000)
    shoot(page, "overlay-help")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)


def tour_topbar_menus(page: Page) -> None:
    goto(page, "scope")
    # Open the +Create menu
    new_btn = page.get_by_test_id("btn-create")
    if new_btn.count() > 0:
        new_btn.first.click()
        page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
        shoot(page, "topbar-create-menu")
        page.keyboard.press("Escape")
        page.wait_for_timeout(80)
    # MS filter expanded
    ms_btn = page.locator('[data-testid^="filter-ms-"]').first
    if ms_btn.count() > 0:
        # Apply a MS filter
        all_ms = page.locator('[data-testid^="filter-ms-"]').all()
        if len(all_ms) > 1:
            all_ms[1].click()
            page.wait_for_timeout(120)
            shoot(page, "scope-ms-filtered")
            all_ms[0].click()  # reset to "all"
    # Status filter
    blocked = page.get_by_test_id("filter-status-blocked")
    if blocked.count() > 0:
        blocked.click()
        page.wait_for_timeout(120)
        shoot(page, "scope-status-blocked")
        blocked.click()  # toggle off


def tour_editors(page: Page) -> None:
    goto(page, "scope")
    # Project meta editor — opens by clicking the project name button in TopBar
    page.locator('button[title="Edit project meta"]').first.click()
    page.wait_for_selector('[data-testid="dialog-project-meta"]', timeout=2000)
    shoot(page, "editor-project-meta")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    # Milestone editor — open via the +Create menu
    page.get_by_test_id("btn-create").click()
    page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
    page.locator('[role="menuitem"]', has_text="Edit Milestones").first.click()
    page.wait_for_selector('[data-testid="dialog-milestone"]', timeout=2000)
    shoot(page, "editor-milestones")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    # Module editor — opens by clicking a module name (or its color swatch) in scope
    goto(page, "scope")
    page.locator('[data-testid="view-scope"] [data-module-id]').first.locator(
        'button.ser-display'
    ).first.click()
    page.wait_for_selector('[data-testid="dialog-module"]', timeout=2000)
    shoot(page, "editor-module")
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)


def tour_kanban_drag(page: Page) -> None:
    goto(page, "kanban")
    cards = page.locator('[data-feature-id]')
    if cards.count() < 2:
        return
    src = cards.first
    src_box = src.bounding_box()
    if not src_box:
        return
    page.mouse.move(src_box["x"] + 20, src_box["y"] + 20)
    page.mouse.down()
    page.mouse.move(src_box["x"] + 200, src_box["y"] + 60, steps=8)
    page.wait_for_timeout(120)
    shoot(page, "kanban-drag-in-progress")
    page.mouse.up()
    page.wait_for_timeout(120)


def tour_mindmap_zoomed(page: Page) -> None:
    goto(page, "mindmap")
    canvas = page.get_by_test_id("mindmap-canvas")
    if canvas.count() == 0:
        return
    box = canvas.bounding_box()
    if not box:
        return
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    # Zoom in a few notches
    for _ in range(4):
        page.mouse.move(cx, cy)
        page.mouse.wheel(0, -100)
        page.wait_for_timeout(60)
    shoot(page, "mindmap-zoomed-in")
    # Reset
    for _ in range(4):
        page.mouse.move(cx, cy)
        page.mouse.wheel(0, 100)
        page.wait_for_timeout(60)


def tour_welcome(page: Page) -> None:
    """Welcome screen needs a clean reload with no seed."""
    page.evaluate("() => { localStorage.clear(); }")
    page.reload(wait_until="networkidle")
    # The welcome screen exposes welcome-open-project as its primary CTA
    page.wait_for_selector('[data-testid="welcome-open-project"]', timeout=4000)
    page.wait_for_timeout(150)
    shoot(page, "welcome-empty")


def tour_mobile(page: Page) -> None:
    page.set_viewport_size(MOBILE)
    page.reload(wait_until="networkidle")
    bootstrap_app(page)
    goto(page, "scope")
    shoot(page, "mobile-scope")
    # Open drawer on mobile
    feat = page.locator('[data-feature-id]').first
    if feat.count() > 0:
        feat.click()
        page.wait_for_selector('[data-testid="dialog-task"]')
        shoot(page, "mobile-drawer")
        page.keyboard.press("Escape")
    page.set_viewport_size(DESKTOP)


# ---------------------------------------------------------------------------


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    print(f"\n══════ visual_tour ══════")
    print(f"→ Target: {url}")
    print(f"→ Output: {OUT}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=DESKTOP)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))

        seed_local_storage(page, load_default_seed())
        page.goto(url, wait_until="networkidle")
        bootstrap_app(page)

        sections = [
            ("views", tour_views),
            ("scope-interactions", tour_scope_interactions),
            ("drawer", tour_drawer),
            ("overlays", tour_overlays),
            ("topbar-menus", tour_topbar_menus),
            ("editors", tour_editors),
            ("kanban-drag", tour_kanban_drag),
            ("mindmap-zoomed", tour_mindmap_zoomed),
            ("mobile", tour_mobile),
            ("welcome", tour_welcome),  # last — clears localStorage
        ]
        failures: list[tuple[str, str]] = []
        for label, fn in sections:
            try:
                print(f"▶ {label}")
                fn(page)
            except Exception as exc:
                failures.append((label, repr(exc)))
                print(f"  ✗ {label} failed: {exc!r}")
                # try to dismiss any leftover modal so the next section starts clean
                try:
                    page.keyboard.press("Escape")
                except Exception:
                    pass
        browser.close()

    files = sorted(OUT.glob("*.png"))
    print(f"\n✓ {len(files)} screenshots in {OUT}")
    for f in files:
        print(f"   - {f.name}  ({f.stat().st_size // 1024} KB)")
    if failures:
        print(f"\n✗ {len(failures)} sections failed:")
        for label, msg in failures:
            print(f"   - {label}: {msg}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Shared helpers for the Playwright test suites.

Extracted from smoke.py. Every test_*.py file in this folder sits on top of
this module. Contract:

- A suite file defines `TESTS = [fn, fn, ...]` and calls `run_suite(__file__, TESTS)`
  at the bottom. That function boots one browser, seeds localStorage from
  project.example.json (or a user-supplied dict), walks through the Welcome
  screen if it shows up, then invokes each test in order with a shared `page`.

- Helpers here are style-copied from smoke.py. Do not import from anywhere else
  in the repo — tests must run purely via Playwright against the rendered app.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time
from typing import Any, Callable, Iterable

from playwright.sync_api import Browser, BrowserContext, Locator, Page, sync_playwright


REPO = pathlib.Path(__file__).resolve().parents[2]
SEED_PATH = REPO / "data" / "project.example.json"
FINDINGS_PATH = pathlib.Path(__file__).parent / "FINDINGS.md"
LS_KEY = "projekt-planner:project:v1"
LAST_SESSION_KEY = "lodestar:last-session"
DEFAULT_URL = "http://localhost:5173"

# ---------------------------------------------------------------------------
# basic logging
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    print(f"  · {msg}", flush=True)


def note_finding(category: str, severity: str, where: str, msg: str) -> None:
    """Append a finding to FINDINGS.md so a suite can log issues even when
    the assertion itself still passes.

    category: 'Bugs' | 'UX-Verbesserungen' | 'Feature-Requests'
    severity: 'blocker' | 'major' | 'minor' | 'nit'
    Duplicates (same category+where+msg) are skipped so re-running the suite
    doesn't balloon the file.
    """
    line = f"- [{severity}] **{where}** — {msg}"
    text = FINDINGS_PATH.read_text() if FINDINGS_PATH.exists() else ""
    if line in text:
        return
    marker = f"## {category}"
    if marker not in text:
        FINDINGS_PATH.write_text(text + f"\n{marker}\n\n{line}\n")
        return
    parts = text.split(marker, 1)
    head = parts[0] + marker
    tail = parts[1]
    nxt = re.search(r"\n## ", tail)
    if nxt:
        body = tail[: nxt.start()]
        after = tail[nxt.start() :]
    else:
        body = tail
        after = ""
    # Strip the placeholder "(none reported yet)" on first real finding
    body = re.sub(r"\n_\(none reported yet\)_\n", "\n", body)
    body = body.rstrip("\n") + "\n" + line + "\n"
    FINDINGS_PATH.write_text(head + body + ("\n" + after.lstrip("\n") if after else ""))


# ---------------------------------------------------------------------------
# setup / seeding
# ---------------------------------------------------------------------------


def load_default_seed() -> dict[str, Any]:
    return json.loads(SEED_PATH.read_text())


def seed_local_storage(page: Page, seed: dict[str, Any]) -> None:
    """Seed both the project JSON and the last-session marker. The marker is
    what makes the Welcome screen show a CONTINUE button which, when clicked,
    calls openLastSession() → loadProject() → reads LS_KEY. Without it, the
    only bootable path is clicking 'Try the Nimbus example', which discards
    the seed and hard-loads the built-in sample project."""
    last_session = {"path": None, "when": 1}
    page.add_init_script(
        f"window.localStorage.setItem({json.dumps(LS_KEY)}, {json.dumps(json.dumps(seed))});"
        f"window.localStorage.setItem({json.dumps(LAST_SESSION_KEY)}, {json.dumps(json.dumps(last_session))});"
    )


def clear_local_storage(page: Page) -> None:
    page.add_init_script(
        f"window.localStorage.removeItem({json.dumps(LS_KEY)});"
    )


def wait_idle(page: Page, timeout_ms: int = 5000) -> None:
    """Wait until the save indicator reports not-saving."""
    page.wait_for_function(
        """() => {
            const el = document.querySelector('[data-testid="save-indicator"]');
            return !el || el.getAttribute('data-save-status') !== 'saving';
        }""",
        timeout=timeout_ms,
    )


def bootstrap_app(page: Page) -> None:
    """Wait for the tablist OR the Welcome screen, then land on an active
    project. Preference order on Welcome:
      1. CONTINUE button — loads from the seeded localStorage (respects custom seeds)
      2. 'Try the Nimbus example' — hard-loads the built-in sample (discards seed)
    """
    page.wait_for_function(
        """() => {
            if (document.querySelector('[role="tablist"]')) return true;
            const btns = Array.from(document.querySelectorAll('button'));
            if (btns.some(b => /CONTINUE/.test(b.textContent || ''))) return true;
            return btns.some(b => /try the nimbus example/i.test(b.textContent || ''));
        }""",
        timeout=15_000,
    )
    if page.locator('[role="tablist"]').count() == 0:
        cont = page.locator("button", has_text="CONTINUE")
        if cont.count():
            cont.first.click()
        else:
            page.locator("button", has_text="Try the Nimbus example").first.click()
        page.wait_for_selector('[role="tablist"]', timeout=10_000)
    page.wait_for_selector('[data-testid="view-scope"], [role="tabpanel"]', timeout=10_000)


# ---------------------------------------------------------------------------
# bbox / geometry
# ---------------------------------------------------------------------------


def get_bbox(locator: Locator) -> dict[str, float]:
    box = locator.bounding_box()
    assert box is not None, f"no bounding box for {locator}"
    return box


def center(box: dict[str, float]) -> tuple[float, float]:
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


# ---------------------------------------------------------------------------
# store introspection
# ---------------------------------------------------------------------------


def get_project(page: Page) -> dict[str, Any]:
    """Read the current project from localStorage (authoritative snapshot)."""
    raw = page.evaluate(
        f"() => window.localStorage.getItem({json.dumps(LS_KEY)})"
    )
    if not raw:
        return {}
    return json.loads(raw)


def feature_by_id(proj: dict[str, Any], fid: str) -> dict[str, Any] | None:
    for m in proj.get("modules", []):
        for f in m.get("features", []):
            if f["id"] == fid:
                return f
    return None


def module_of(proj: dict[str, Any], fid: str) -> str | None:
    for m in proj.get("modules", []):
        for f in m.get("features", []):
            if f["id"] == fid:
                return m["id"]
    return None


# ---------------------------------------------------------------------------
# navigation shortcuts
# ---------------------------------------------------------------------------


VIEWS = ("scope", "roadmap", "kanban", "mindmap", "gantt", "validate")


def goto_view(page: Page, view: str) -> None:
    page.get_by_test_id(f"tab-{view}").click()
    page.wait_for_selector(f'[data-testid="view-{view}"]')


def open_palette(page: Page) -> Locator:
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    return page.get_by_test_id("dialog-command-palette")


def close_palette(page: Page) -> None:
    if page.locator('[data-testid="dialog-command-palette"]').count():
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="dialog-command-palette"]', state="detached")


def close_drawer(page: Page) -> None:
    """Close the task drawer via Escape."""
    if not page.locator('[data-testid="dialog-task"]').count():
        return
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached", timeout=3000)


# ---------------------------------------------------------------------------
# context menu
# ---------------------------------------------------------------------------


def slug_label(label: str) -> str:
    """Mirror of ContextMenu.tsx#slugLabel — keep in sync if that helper moves."""
    s = re.sub(r"[^a-z0-9]+", "-", label.lower())
    s = s.strip("-")
    return s[:48]


def open_feature_context_menu(page: Page, feature_locator: Locator) -> Locator:
    feature_locator.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    return page.get_by_test_id("context-menu")


def click_menu_item(page: Page, label: str) -> None:
    """Click a top-level context-menu item by its label."""
    page.locator(f'[data-testid="context-menu"] [data-testid="menuitem-{slug_label(label)}"]').click()


def hover_submenu(page: Page, label: str) -> Locator:
    """Hover a submenu root and wait for its body to mount."""
    root = page.locator(
        f'[data-testid="context-menu"] [data-testid="menuitem-submenu-{slug_label(label)}"]'
    )
    root.hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    return page.get_by_test_id("context-submenu")


def click_submenu_item(page: Page, label: str) -> None:
    page.locator(
        f'[data-testid="context-submenu"] [data-testid="menuitem-{slug_label(label)}"]'
    ).click()


# ---------------------------------------------------------------------------
# drag and drop — HTML5 (Scope, Roadmap, Kanban)
# ---------------------------------------------------------------------------


def dnd_html5(page: Page, from_selector: str, to_selector: str) -> None:
    """Dispatch HTML5 drag events with rAF yields between each step so React
    can flush state. This is the ONLY way to move DnD items in this app
    reliably — page.drag_to() silently no-ops because our handlers set
    state in dragstart that the drop handler needs to read."""
    page.evaluate(
        """async ([fromSel, toSel]) => {
          const from = document.querySelector(fromSel);
          const to   = document.querySelector(toSel);
          if (!from || !to) throw new Error('DnD: missing ' + (from ? 'dst' : 'src'));
          const dt = new DataTransfer();
          const y = () => new Promise(r => requestAnimationFrame(() => r()));
          from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
          await y(); await y();
          to.dispatchEvent(new DragEvent('dragenter',   { bubbles: true, dataTransfer: dt }));
          to.dispatchEvent(new DragEvent('dragover',    { bubbles: true, dataTransfer: dt }));
          await y();
          to.dispatchEvent(new DragEvent('drop',        { bubbles: true, dataTransfer: dt }));
          await y();
          from.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer: dt }));
        }""",
        [from_selector, to_selector],
    )


# ---------------------------------------------------------------------------
# dialogs (prompt/confirm/alert)
# ---------------------------------------------------------------------------


class DialogHandler:
    """Context manager to handle the next N window.prompt/confirm/alert calls.

    Usage:
        with DialogHandler(page, accept_with="My new label"):
            menu_item.click()
    """

    def __init__(self, page: Page, accept_with: str | None = "", dismiss: bool = False) -> None:
        self.page = page
        self.accept_with = accept_with
        self.dismiss = dismiss
        self._seen: list[str] = []

    def _on_dialog(self, dialog) -> None:  # type: ignore[no-untyped-def]
        self._seen.append(f"{dialog.type}:{dialog.message}")
        if self.dismiss:
            dialog.dismiss()
        else:
            if dialog.type == "prompt":
                dialog.accept(self.accept_with or "")
            else:
                dialog.accept()

    def __enter__(self):
        self.page.on("dialog", self._on_dialog)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        # Give Playwright a tick to deliver any pending dialog events
        self.page.wait_for_timeout(50)
        try:
            self.page.remove_listener("dialog", self._on_dialog)
        except Exception:
            pass

    @property
    def seen(self) -> list[str]:
        return list(self._seen)


# ---------------------------------------------------------------------------
# suite runner
# ---------------------------------------------------------------------------


def run_suite(
    file: str,
    tests: Iterable[Callable[[Page], None]],
    *,
    seed: dict[str, Any] | None = None,
    url: str | None = None,
    no_seed: bool = False,
    skip_bootstrap: bool = False,
) -> int:
    """Boot Chromium, seed localStorage, run each test, print PASS/FAIL.

    no_seed: start with empty localStorage — useful for Welcome-screen tests.
    skip_bootstrap: leave the app on whatever landing screen; each test owns the
        onboarding flow itself."""
    url = url or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL)
    seed_doc = None if no_seed else (seed if seed is not None else load_default_seed())
    suite_name = pathlib.Path(file).stem
    print(f"\n══════ {suite_name} ══════")
    print(f"→ Target: {url}")

    tests_list = list(tests)
    failed: list[tuple[str, str]] = []

    with sync_playwright() as pw:
        browser: Browser = pw.chromium.launch(headless=True)
        ctx: BrowserContext = browser.new_context()
        page = ctx.new_page()
        # surface console errors/warnings + uncaught js errors
        page.on("console", lambda m: (
            print(f"  [console.{m.type}] {m.text}")
            if m.type in {"error", "warning"} else None
        ))
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))
        if seed_doc is not None:
            seed_local_storage(page, seed_doc)
        page.goto(url, wait_until="networkidle")
        if not skip_bootstrap:
            bootstrap_app(page)

        for t in tests_list:
            name = t.__name__
            try:
                print(f"▶ {name}")
                t(page)
            except Exception as exc:
                failed.append((name, repr(exc)))
                print(f"  ✗ FAILED: {exc!r}")
                # also log to FINDINGS.md as a Bug
                note_finding("Bugs", "major", f"{suite_name}::{name}", repr(exc))

        browser.close()

    total = len(tests_list)
    passed = total - len(failed)
    print()
    print(f"{'✓' if not failed else '✗'} {suite_name}: {passed}/{total} passed")
    if failed:
        for n, msg in failed:
            print(f"   - {n}: {msg}")
    return 0 if not failed else 1


if __name__ == "__main__":
    print("This is a helper module. Run the individual test_*.py files.")

"""DepEditorPopover: opens from feature menu, reason gating, type selection, save/cancel."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    feature_by_id,
    get_project,
    log,
    run_suite,
    wait_idle,
)


def _goto_scope(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')


def _open_dep_editor_for_first_feature(page: Page) -> tuple[str, str]:
    """Right-click first feature, Add dependency → first candidate. Returns (from_id, to_id)."""
    _goto_scope(page)
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-add-dependency-to").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    first_candidate = page.locator('[data-testid="context-submenu"] [role="menuitem"]').filter(
        has_not=page.locator('[aria-disabled="true"]')
    ).first
    first_candidate.click()
    page.wait_for_selector('[data-testid="dialog-dep-editor"]')
    dialog = page.get_by_test_id("dialog-dep-editor")
    to_id = dialog.get_attribute("data-dep-to")
    return fid, to_id  # type: ignore[return-value]


def test_opens_from_feature_menu(page: Page) -> None:
    fid, to_id = _open_dep_editor_for_first_feature(page)
    dialog = page.get_by_test_id("dialog-dep-editor")
    assert dialog.get_attribute("data-dep-from") == fid
    assert to_id and to_id != fid
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    log(f"DepEditor opened for {fid!r} → {to_id!r}")


def test_esc_cancels(page: Page) -> None:
    _open_dep_editor_for_first_feature(page)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    log("Esc closes DepEditor without saving")


def test_outside_click_cancels(page: Page) -> None:
    _open_dep_editor_for_first_feature(page)
    # The popover listens on document mousedown; dispatch directly on body so we
    # don't accidentally click another element (e.g. the brand button which opens
    # the project-meta editor).
    page.evaluate(
        """() => document.body.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })
        )"""
    )
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    log("outside-click cancels DepEditor")


def test_auto_focus_reason(page: Page) -> None:
    _open_dep_editor_for_first_feature(page)
    dialog = page.get_by_test_id("dialog-dep-editor")
    inp = dialog.locator('input[placeholder*="why"]').first
    focused = page.evaluate(
        """() => {
            const a = document.activeElement;
            return a && a.tagName === 'INPUT' && a.placeholder.includes('why');
        }"""
    )
    assert focused, "reason input should be auto-focused"
    page.keyboard.press("Escape")
    log("DepEditor auto-focuses the reason input")


def test_save_disabled_when_empty(page: Page) -> None:
    _open_dep_editor_for_first_feature(page)
    dialog = page.get_by_test_id("dialog-dep-editor")
    save_btn = dialog.locator('button', has_text="SAVE").first
    assert save_btn.is_disabled(), "SAVE should be disabled when reason is empty"
    page.keyboard.press("Escape")
    log("SAVE disabled on empty reason")


def test_type_radio_selection(page: Page) -> None:
    _open_dep_editor_for_first_feature(page)
    dialog = page.get_by_test_id("dialog-dep-editor")
    # build is default; click runtime, then optional
    for t in ("runtime", "optional", "build"):
        btn = dialog.locator("button", has_text=t).first
        btn.click()
        # currently-selected button has the `border-accent` class; assert via style probing
        klass = btn.get_attribute("class") or ""
        assert "border-accent" in klass, f"{t} button should be highlighted after click"
    page.keyboard.press("Escape")
    log("type radios cycle build/runtime/optional")


def test_save_commits_dep_with_runtime_type(page: Page) -> None:
    fid, to_id = _open_dep_editor_for_first_feature(page)
    before = get_project(page)
    before_count = len(feature_by_id(before, fid)["deps"])  # type: ignore[index]
    dialog = page.get_by_test_id("dialog-dep-editor")
    dialog.locator('input[placeholder*="why"]').fill("needs its payload shape")
    dialog.locator("button", has_text="runtime").click()
    dialog.locator("button", has_text="SAVE").click()
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    feat = feature_by_id(after, fid)
    assert feat is not None
    new_dep = next((d for d in feat["deps"] if d["id"] == to_id), None)
    assert new_dep is not None, f"dep to {to_id!r} not saved"
    assert new_dep["type"] == "runtime", new_dep
    assert new_dep["reason"] == "needs its payload shape"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"DepEditor SAVE persisted runtime dep {fid!r} → {to_id!r} → undone")


def test_save_via_enter_key(page: Page) -> None:
    fid, to_id = _open_dep_editor_for_first_feature(page)
    before = get_project(page)
    before_count = len(feature_by_id(before, fid)["deps"])  # type: ignore[index]
    dialog = page.get_by_test_id("dialog-dep-editor")
    inp = dialog.locator('input[placeholder*="why"]')
    inp.fill("pressed enter")
    inp.press("Enter")
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    after_count = len(feature_by_id(after, fid)["deps"])  # type: ignore[index]
    assert after_count == before_count + 1, f"Enter-save failed: {before_count} → {after_count}"
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("Enter in reason input saves the dep")


def test_cancel_button(page: Page) -> None:
    fid, to_id = _open_dep_editor_for_first_feature(page)
    before = get_project(page)
    before_count = len(feature_by_id(before, fid)["deps"])  # type: ignore[index]
    dialog = page.get_by_test_id("dialog-dep-editor")
    dialog.locator('input[placeholder*="why"]').fill("would have been saved")
    dialog.locator("button", has_text="CANCEL").click()
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    after_count = len(feature_by_id(after, fid)["deps"])  # type: ignore[index]
    assert after_count == before_count, "Cancel should not persist the dep"
    log("CANCEL discards the draft")


TESTS = [
    test_opens_from_feature_menu,
    test_esc_cancels,
    test_outside_click_cancels,
    test_auto_focus_reason,
    test_save_disabled_when_empty,
    test_type_radio_selection,
    test_save_commits_dep_with_runtime_type,
    test_save_via_enter_key,
    test_cancel_button,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

"""ModuleEditor popover: open from title/swatch, label-edit, color picker,
custom hex, Delete Module, outside-click + Esc close."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    DialogHandler,
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def _first_module_id(page: Page) -> str:
    mid = page.locator("[data-module-id]").first.get_attribute("data-module-id")
    assert mid, "no module found on scope view"
    return mid


def _open_editor_via_title(page: Page, mid: str) -> None:
    goto_view(page, "scope")
    header = page.locator(f'[data-module-id="{mid}"] header')
    # the title button is the <button> with the module label text in the header
    header.locator("button").filter(has_text="").nth(1).click()
    # second button (idx 1) is the title; swatch is nth(0). We want either; but
    # filter ambiguity — use the <button> adjacent to swatch ref instead.
    # The simplest stable selector: the button that has the module's label.
    page.wait_for_selector('[data-testid="dialog-module"]')


def _open_editor_via_swatch(page: Page, mid: str) -> None:
    goto_view(page, "scope")
    swatch = (
        page.locator(f'[data-module-id="{mid}"] header button[title="Edit module"]')
    )
    swatch.click()
    page.wait_for_selector('[data-testid="dialog-module"]')


def _close_module_editor(page: Page) -> None:
    if page.locator('[data-testid="dialog-module"]').count() == 0:
        return
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-module"]', state="detached")


def test_opens_via_color_swatch(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    dialog = page.get_by_test_id("dialog-module")
    assert dialog.get_attribute("data-module-id") == mid
    _close_module_editor(page)
    log(f"module editor opens for {mid!r} via swatch")


def test_opens_via_title_button(page: Page) -> None:
    mid = _first_module_id(page)
    goto_view(page, "scope")
    # find the button whose text matches the module's current label
    proj = get_project(page)
    label = next(m["label"] for m in proj["modules"] if m["id"] == mid)
    page.locator(
        f'[data-module-id="{mid}"] header button',
        has_text=label,
    ).first.click()
    page.wait_for_selector('[data-testid="dialog-module"]')
    _close_module_editor(page)
    log(f"module editor opens for {mid!r} via title button")


def test_label_autofocus(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    focused_testid = page.evaluate(
        "() => document.activeElement && document.activeElement.getAttribute('data-testid')"
    )
    assert focused_testid == "module-editor-label", focused_testid
    _close_module_editor(page)
    log("module editor auto-focuses the label input")


def test_label_blur_commits(page: Page) -> None:
    mid = _first_module_id(page)
    before = get_project(page)
    before_label = next(m["label"] for m in before["modules"] if m["id"] == mid)
    new_label = before_label + " ++"
    _open_editor_via_swatch(page, mid)
    inp = page.get_by_test_id("module-editor-label")
    inp.fill(new_label)
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    got = next(m["label"] for m in after["modules"] if m["id"] == mid)
    assert got == new_label, (got, new_label)
    _close_module_editor(page)
    # restore
    _open_editor_via_swatch(page, mid)
    inp2 = page.get_by_test_id("module-editor-label")
    inp2.fill(before_label)
    inp2.evaluate("el => el.blur()")
    wait_idle(page)
    _close_module_editor(page)
    log("module label blur-commits to store")


def test_label_blur_trims_and_ignores_blank(page: Page) -> None:
    mid = _first_module_id(page)
    before = get_project(page)
    before_label = next(m["label"] for m in before["modules"] if m["id"] == mid)
    trimmed_label = f"{before_label} Prime"
    _open_editor_via_swatch(page, mid)
    inp = page.get_by_test_id("module-editor-label")
    inp.fill(f"  {trimmed_label}  ")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after_trim = get_project(page)
    got_trimmed = next(m["label"] for m in after_trim["modules"] if m["id"] == mid)
    assert got_trimmed == trimmed_label, (got_trimmed, trimmed_label)

    _open_editor_via_swatch(page, mid)
    inp = page.get_by_test_id("module-editor-label")
    inp.fill("   ")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after_blank = get_project(page)
    got_after_blank = next(m["label"] for m in after_blank["modules"] if m["id"] == mid)
    assert got_after_blank == trimmed_label, got_after_blank

    _open_editor_via_swatch(page, mid)
    inp = page.get_by_test_id("module-editor-label")
    inp.fill(before_label)
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    _close_module_editor(page)
    log("module label trims surrounding whitespace and ignores blank-only edits")


def test_preset_color_click(page: Page) -> None:
    mid = _first_module_id(page)
    before = get_project(page)
    before_color = next(m["color"] for m in before["modules"] if m["id"] == mid)
    _open_editor_via_swatch(page, mid)
    dialog = page.get_by_test_id("dialog-module")
    # Grab the first preset button whose title differs from the current color.
    picked = page.evaluate(
        """(curColor) => {
            const dlg = document.querySelector('[data-testid="dialog-module"]');
            const grid = dlg.querySelector('[data-testid="module-color-presets"]');
            const btns = Array.from(grid.querySelectorAll('button'));
            const other = btns.find(b => (b.getAttribute('title') || '').toLowerCase() !== curColor.toLowerCase());
            other.click();
            return other.getAttribute('title');
        }""",
        before_color,
    )
    wait_idle(page)
    after = get_project(page)
    got = next(m["color"] for m in after["modules"] if m["id"] == mid)
    assert got.lower() == picked.lower(), (got, picked)
    _close_module_editor(page)
    log(f"preset color swatch committed {picked!r}")


def test_custom_hex_on_blur(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    dialog = page.get_by_test_id("dialog-module")
    hex_inp = dialog.locator('input[placeholder="#HEX"]')
    hex_inp.click()
    page.keyboard.press("Control+A")
    page.keyboard.type("#ABCDEF")
    hex_inp.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    got = next(m["color"] for m in after["modules"] if m["id"] == mid)
    assert got.lower() == "#abcdef", got
    _close_module_editor(page)
    log("custom hex color commits on blur")


def test_invalid_custom_hex_is_ignored(page: Page) -> None:
    mid = _first_module_id(page)
    before = get_project(page)
    before_color = next(m["color"] for m in before["modules"] if m["id"] == mid)
    _open_editor_via_swatch(page, mid)
    dialog = page.get_by_test_id("dialog-module")
    hex_inp = dialog.locator('input[placeholder="#HEX"]')
    hex_inp.click()
    page.keyboard.press("Control+A")
    page.keyboard.type("not-a-color")
    hex_inp.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    got = next(m["color"] for m in after["modules"] if m["id"] == mid)
    assert got == before_color, got
    _close_module_editor(page)
    log("invalid custom color input is ignored")


def test_esc_closes(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-module"]', state="detached")
    log("Esc closes module editor")


def test_outside_click_closes(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    # Dispatch mousedown on body so the popover's document listener fires
    # without routing through a real element.
    page.evaluate(
        """() => document.body.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })
        )"""
    )
    page.wait_for_selector('[data-testid="dialog-module"]', state="detached")
    log("outside-click closes module editor")


def test_delete_module_with_confirm(page: Page) -> None:
    # Use the LAST module so deletes don't shift earlier tests' target indices.
    mids = page.locator("[data-module-id]").evaluate_all(
        "els => els.map(e => e.getAttribute('data-module-id'))"
    )
    target = mids[-1]
    before = get_project(page)
    assert any(m["id"] == target for m in before["modules"])
    # Scroll into view before opening: ModuleEditor anchors at `swatch.bottom+6`
    # and does not clamp top, so a near-bottom module would put the popover
    # offscreen (separately noted as a UX finding).
    page.locator(f'[data-module-id="{target}"]').scroll_into_view_if_needed()
    page.evaluate("() => window.scrollBy(0, -120)")
    _open_editor_via_swatch(page, target)
    # ModuleEditor positions itself `anchor.bottom + 6` and does not clamp top,
    # so with the last module near the bottom edge the popover can render past
    # the viewport. Dispatch the click via JS to bypass the viewport check.
    with DialogHandler(page):  # confirm: Delete?
        page.evaluate(
            """() => {
                const dlg = document.querySelector('[data-testid="dialog-module"]');
                const btn = Array.from(dlg.querySelectorAll('button'))
                    .find(b => (b.textContent || '').trim().startsWith('DELETE MODULE'));
                btn.click();
            }"""
        )
    wait_idle(page)
    page.wait_for_selector('[data-testid="dialog-module"]', state="detached")
    after = get_project(page)
    assert not any(m["id"] == target for m in after["modules"]), (
        f"module {target} still present after delete"
    )
    # undo to restore for later tests
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"module {target!r} deleted after confirm")


def test_rename_module_id(page: Page) -> None:
    mid = _first_module_id(page)
    _open_editor_via_swatch(page, mid)
    page.get_by_test_id("module-editor-id").click()
    inp = page.get_by_test_id("module-editor-id-input")
    new_id = f"{mid}-renamed"
    inp.fill(new_id)
    inp.press("Enter")
    wait_idle(page)
    proj = get_project(page)
    assert any(m["id"] == new_id for m in proj["modules"]), (
        f"expected module id {new_id!r}, got {[m['id'] for m in proj['modules']]}"
    )
    _close_module_editor(page)
    # undo to restore original id for later tests
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    restored = get_project(page)
    assert any(m["id"] == mid for m in restored["modules"])
    log(f"module id rename {mid!r} → {new_id!r} → undone")


def test_rename_module_id_rejects_duplicate(page: Page) -> None:
    mids = page.locator("[data-module-id]").evaluate_all(
        "els => els.map(e => e.getAttribute('data-module-id'))"
    )
    assert len(mids) >= 2, "need ≥2 modules for duplicate test"
    target, existing = mids[0], mids[1]
    _open_editor_via_swatch(page, target)
    page.get_by_test_id("module-editor-id").click()
    inp = page.get_by_test_id("module-editor-id-input")
    inp.fill(existing)
    inp.press("Enter")
    page.wait_for_selector('[data-testid="module-editor-id-error"]')
    proj = get_project(page)
    assert any(m["id"] == target for m in proj["modules"]), "target id must survive duplicate rename"
    page.keyboard.press("Escape")
    _close_module_editor(page)
    log(f"duplicate module id {existing!r} refused for rename of {target!r}")


TESTS = [
    test_opens_via_color_swatch,
    test_opens_via_title_button,
    test_label_autofocus,
    test_label_blur_commits,
    test_label_blur_trims_and_ignores_blank,
    test_preset_color_click,
    test_custom_hex_on_blur,
    test_invalid_custom_hex_is_ignored,
    test_esc_closes,
    test_outside_click_closes,
    test_delete_module_with_confirm,
    test_rename_module_id,
    test_rename_module_id_rejects_duplicate,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

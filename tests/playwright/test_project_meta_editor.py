"""ProjectMetaEditor: open, edit name/description/version/today, blur-commits,
Save, Cancel, Esc, backdrop-close."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    close_palette,
    get_project,
    goto_view,
    log,
    open_palette,
    run_suite,
    wait_idle,
)


def _open_meta_editor(page: Page) -> None:
    if page.locator('[data-testid="dialog-project-meta"]').count() == 0:
        open_palette(page)
        page.get_by_test_id("command-proj:edit-meta").click()
    page.wait_for_selector('[data-testid="dialog-project-meta"]')
    page.wait_for_timeout(200)  # let animation settle


def _close_meta_editor(page: Page) -> None:
    if page.locator('[data-testid="dialog-project-meta"]').count() == 0:
        return
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")


def _field(page: Page, label: str):
    # The Field component wraps each input with a "label" div above it. Target
    # the input/textarea sibling of that label.
    return page.locator(
        f'[data-testid="dialog-project-meta"] >> xpath=//div[@class="label-mono mb-1" and normalize-space()="{label}"]/following-sibling::*[1]'
    )


def _fill_field(page: Page, label: str, value: str) -> None:
    """Focus a field and set its value via JS + native setter so React picks
    up the change, then blur to trigger commit. Avoids viewport checks on
    Playwright's click which occasionally flag the Name input as offscreen
    while Framer Motion is still animating the dialog in."""
    page.evaluate(
        """([lbl, val]) => {
            const dlg = document.querySelector('[data-testid="dialog-project-meta"]');
            const labels = Array.from(dlg.querySelectorAll('div.label-mono'));
            const target = labels.find(d => d.textContent.trim() === lbl);
            if (!target) throw new Error('field label not found: ' + lbl);
            const el = target.nextElementSibling;
            el.focus();
            const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }""",
        [label, value],
    )


def _blur_field(page: Page, label: str) -> None:
    page.evaluate(
        """(lbl) => {
            const dlg = document.querySelector('[data-testid="dialog-project-meta"]');
            const labels = Array.from(dlg.querySelectorAll('div.label-mono'));
            const target = labels.find(d => d.textContent.trim() === lbl);
            target.nextElementSibling.blur();
        }""",
        label,
    )


def test_opens_via_palette(page: Page) -> None:
    _open_meta_editor(page)
    title = page.locator('[data-testid="dialog-project-meta"] #meta-editor-title')
    assert title.inner_text().strip() != ""
    _close_meta_editor(page)
    log("ProjectMetaEditor opens from command palette")


def test_esc_closes(page: Page) -> None:
    _open_meta_editor(page)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")
    log("Esc closes ProjectMetaEditor")


def test_backdrop_click_closes(page: Page) -> None:
    _open_meta_editor(page)
    page.get_by_test_id("dialog-project-meta-backdrop").click(position={"x": 10, "y": 10})
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")
    log("backdrop click closes ProjectMetaEditor")


def test_name_blur_commits(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    before_name = before["meta"]["name"]
    new_name = before_name + " (edit)"
    _fill_field(page, "Name", new_name)
    _blur_field(page, "Name")
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["name"] == new_name, after["meta"]["name"]
    # restore
    _fill_field(page, "Name", before_name)
    _blur_field(page, "Name")
    wait_idle(page)
    _close_meta_editor(page)
    log("name field blur-commits")


def test_name_blur_trims_and_ignores_blank(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    before_name = before["meta"]["name"]
    trimmed_name = f"{before_name} Prime"
    _fill_field(page, "Name", f"  {trimmed_name}  ")
    _blur_field(page, "Name")
    wait_idle(page)
    after_trim = get_project(page)
    assert after_trim["meta"]["name"] == trimmed_name, after_trim["meta"]["name"]

    _fill_field(page, "Name", "   ")
    _blur_field(page, "Name")
    wait_idle(page)
    after_blank = get_project(page)
    assert after_blank["meta"]["name"] == trimmed_name, after_blank["meta"]["name"]

    _fill_field(page, "Name", before_name)
    _blur_field(page, "Name")
    wait_idle(page)
    _close_meta_editor(page)
    log("name field trims surrounding whitespace and ignores blank-only edits")


def test_description_blur_commits(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    textarea = _field(page, "Description")
    textarea.click()
    textarea.fill("smoke-updated description")
    textarea.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["description"] == "smoke-updated description"
    # restore
    textarea.click()
    textarea.fill(before["meta"]["description"])
    textarea.evaluate("el => el.blur()")
    wait_idle(page)
    _close_meta_editor(page)
    log("description textarea blur-commits")


def test_version_blur_commits(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    inp = _field(page, "Version")
    inp.click()
    inp.fill("9.9.9")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["version"] == "9.9.9", after["meta"]["version"]
    inp.click()
    inp.fill(before["meta"]["version"])
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    _close_meta_editor(page)
    log("version blur-commits")


def test_version_blur_trims_and_ignores_blank(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    before_version = before["meta"]["version"]
    inp = _field(page, "Version")
    inp.click()
    inp.fill("  9.9.8  ")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after_trim = get_project(page)
    assert after_trim["meta"]["version"] == "9.9.8", after_trim["meta"]["version"]

    inp.click()
    inp.fill("   ")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after_blank = get_project(page)
    assert after_blank["meta"]["version"] == "9.9.8", after_blank["meta"]["version"]

    inp.click()
    inp.fill(before_version)
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    _close_meta_editor(page)
    log("version field trims surrounding whitespace and ignores blank-only edits")


def test_today_numeric_commits(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    before_today = before["meta"].get("today")
    inp = _field(page, "Today · Gantt week")
    inp.click()
    inp.fill("7")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    assert after["meta"].get("today") == 7, after["meta"].get("today")
    # restore
    inp.click()
    inp.fill(str(before_today) if before_today is not None else "")
    inp.evaluate("el => el.blur()")
    wait_idle(page)
    _close_meta_editor(page)
    log("today numeric field commits to meta.today")


def test_today_strips_non_numeric(page: Page) -> None:
    _open_meta_editor(page)
    inp = _field(page, "Today · Gantt week")
    inp.click()
    inp.fill("abc12x3")
    # Value is filtered in onChange to digits only
    val = inp.input_value()
    assert val == "123", f"expected stripped digits, got {val!r}"
    _close_meta_editor(page)
    log("today input filters non-digit characters")


def test_save_button_commits_and_closes(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    _fill_field(page, "Name", before["meta"]["name"] + " SAVE")
    # Click Save without blur first — commit() runs inside save()
    page.locator('[data-testid="dialog-project-meta"] button', has_text="Save").click()
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    assert after["meta"]["name"].endswith(" SAVE"), after["meta"]["name"]
    # restore
    _open_meta_editor(page)
    _fill_field(page, "Name", before["meta"]["name"])
    _blur_field(page, "Name")
    wait_idle(page)
    _close_meta_editor(page)
    log("Save button commits and closes dialog")


def test_cancel_button_does_not_persist_unblurred_edits(page: Page) -> None:
    _open_meta_editor(page)
    before = get_project(page)
    # Type without blur, then click Cancel. The local React state change isn't
    # committed until blur or Save, so Cancel should discard.
    _fill_field(page, "Name", "DISCARDED")
    page.locator('[data-testid="dialog-project-meta"] button', has_text="Cancel").click()
    page.wait_for_selector('[data-testid="dialog-project-meta"]', state="detached")
    after = get_project(page)
    assert after["meta"]["name"] == before["meta"]["name"], (
        f"Cancel failed to discard: {before['meta']['name']!r} → {after['meta']['name']!r}"
    )
    log("Cancel discards unblurred edits")


TESTS = [
    test_opens_via_palette,
    test_esc_closes,
    test_backdrop_click_closes,
    test_name_blur_commits,
    test_name_blur_trims_and_ignores_blank,
    test_description_blur_commits,
    test_version_blur_commits,
    test_version_blur_trims_and_ignores_blank,
    test_today_numeric_commits,
    test_today_strips_non_numeric,
    test_save_button_commits_and_closes,
    test_cancel_button_does_not_persist_unblurred_edits,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

"""ModuleScope view: module DnD reorder, feature DnD between modules, totals,
inline task expansion, + NEW feature button."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    DialogHandler,
    click_menu_item,
    dnd_html5,
    feature_by_id,
    get_project,
    goto_view,
    log,
    module_of,
    open_feature_context_menu,
    run_suite,
    wait_idle,
)


def _module_ids_in_dom(page: Page) -> list[str]:
    return page.locator("[data-module-id]").evaluate_all(
        "els => els.map(e => e.getAttribute('data-module-id'))"
    )


def test_view_mounts(page: Page) -> None:
    goto_view(page, "scope")
    assert page.locator('[data-testid="view-scope"]').count() == 1
    assert len(_module_ids_in_dom(page)) >= 1
    log("ModuleScope view mounts with module cards")


def test_module_reorder_via_dnd(page: Page) -> None:
    goto_view(page, "scope")
    before_ids = _module_ids_in_dom(page)
    assert len(before_ids) >= 2, "need ≥2 modules to reorder"
    src = before_ids[0]
    dst = before_ids[1]
    # The drag handle on the module header is the <span> with the ⋮⋮ glyph.
    # HTML5 DnD on the span triggers onDragStart on itself; onDrop is on the
    # module wrapper. We dispatch dragstart on the handle and drop on the dst
    # wrapper to mirror the real flow.
    src_sel = f'[data-module-id="{src}"] [aria-label="Drag to reorder"]'
    dst_sel = f'[data-module-id="{dst}"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    after_ids = _module_ids_in_dom(page)
    assert after_ids[0] == dst and after_ids[1] == src, (before_ids, after_ids)
    # restore
    dnd_html5(page, f'[data-module-id="{src}"] [aria-label="Drag to reorder"]',
              f'[data-module-id="{dst}"]')
    wait_idle(page)
    log(f"module reorder: {src!r} swapped with {dst!r} via DnD")


def test_feature_move_between_modules_via_dnd(page: Page) -> None:
    goto_view(page, "scope")
    mids = _module_ids_in_dom(page)
    assert len(mids) >= 2
    proj = get_project(page)
    src_mid = mids[0]
    dst_mid = mids[1]
    src_mod = next(m for m in proj["modules"] if m["id"] == src_mid)
    assert src_mod["features"], f"need at least one feature in source module {src_mid}"
    fid = src_mod["features"][0]["id"]

    src_sel = f'[data-module-id="{src_mid}"] [data-feature-id="{fid}"]'
    dst_sel = f'[data-module-id="{dst_mid}"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    after = get_project(page)
    assert module_of(after, fid) == dst_mid, (
        f"feature {fid} did not move: still in {module_of(after, fid)}"
    )
    # undo for clean state
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"feature {fid!r} moved from {src_mid!r} → {dst_mid!r}")


def test_totals_update_after_mutation(page: Page) -> None:
    goto_view(page, "scope")
    mid = _module_ids_in_dom(page)[0]
    before_count_text = page.locator(
        f'[data-module-id="{mid}"] header'
    ).locator(".num-mono").first.inner_text()
    before_count = int(before_count_text.strip())
    # Click the module's + NEW → feature adds
    page.locator(f'[data-module-id="{mid}"] header button', has_text="+ NEW").click()
    wait_idle(page)
    after_count_text = page.locator(
        f'[data-module-id="{mid}"] header'
    ).locator(".num-mono").first.inner_text()
    after_count = int(after_count_text.strip())
    assert after_count == before_count + 1, (before_count, after_count)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"+ NEW increments module {mid!r} feature count {before_count} → {after_count}")


def test_feature_row_click_opens_drawer(page: Page) -> None:
    goto_view(page, "scope")
    row = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = row.get_attribute("data-feature-id")
    row.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    drawer_fid = page.get_by_test_id("dialog-task").get_attribute("data-drawer-feature")
    assert drawer_fid == fid, (fid, drawer_fid)
    page.keyboard.press("Escape")
    try:
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached", timeout=500)
    except Exception:
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log(f"feature row click opens drawer for {fid!r}")


def test_chevron_expands_inline_tasks(page: Page) -> None:
    goto_view(page, "scope")
    row = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = row.get_attribute("data-feature-id")
    chevron = row.locator('button[aria-label="Expand tasks"]')
    chevron.click()
    # Expanded state flips aria-expanded + rotate class. Re-query collapsed label
    collapsed = row.locator('button[aria-label="Collapse tasks"]')
    assert collapsed.count() == 1, "chevron did not enter expanded state"
    collapsed.click()
    # Re-query the now-collapsed chevron
    assert row.locator('button[aria-label="Expand tasks"]').count() == 1
    log(f"chevron toggles inline tasks for {fid!r}")


def test_inline_task_delete_affordance_stays_visible_on_narrow_screens(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    goto_view(page, "scope")
    row = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    row.locator('button[aria-label="Expand tasks"]').click()
    delete_btn = row.locator('[aria-label^="Delete task "]').first
    opacity = float(delete_btn.evaluate("el => getComputedStyle(el).opacity"))
    focused = delete_btn.evaluate(
        """el => {
            el.focus()
            return document.activeElement === el
        }"""
    )
    assert opacity >= 0.69, f"expected visible inline delete affordance on narrow screens, got {opacity}"
    assert focused is True, "expected inline delete affordance to be keyboard focusable"
    page.set_viewport_size({"width": 1280, "height": 900})
    log("inline scope-task delete affordance stays visible on narrow screens")


def test_feature_context_rename_ignores_same_label_with_whitespace(page: Page) -> None:
    goto_view(page, "scope")
    feature = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feature.get_attribute("data-feature-id")
    assert fid is not None
    before = feature_by_id(get_project(page), fid)
    assert before is not None
    before_label = before["label"]
    before_history = page.evaluate("() => window.__lodestarStore?.getState().history.length ?? -1")

    with DialogHandler(page, accept_with=f"  {before_label}  "):
        open_feature_context_menu(page, feature)
        click_menu_item(page, "Rename…")
    wait_idle(page)

    after = feature_by_id(get_project(page), fid)
    after_history = page.evaluate("() => window.__lodestarStore?.getState().history.length ?? -1")
    assert after is not None
    assert after["label"] == before_label
    assert after_history == before_history, (
        "whitespace-padded no-op feature rename should not create a history entry"
    )
    log("feature context rename ignores padded no-op labels")


def test_module_context_rename_ignores_same_label_with_whitespace(page: Page) -> None:
    goto_view(page, "scope")
    module = page.locator("[data-module-id]").first
    mid = module.get_attribute("data-module-id")
    assert mid is not None
    before = next(m for m in get_project(page)["modules"] if m["id"] == mid)
    before_label = before["label"]
    before_history = page.evaluate("() => window.__lodestarStore?.getState().history.length ?? -1")

    with DialogHandler(page, accept_with=f"  {before_label}  "):
        module.locator("header").click(button="right")
        page.wait_for_selector('[data-testid="context-menu"]')
        click_menu_item(page, "Rename…")
    wait_idle(page)

    after = next(m for m in get_project(page)["modules"] if m["id"] == mid)
    after_history = page.evaluate("() => window.__lodestarStore?.getState().history.length ?? -1")
    assert after["label"] == before_label
    assert after_history == before_history, (
        "whitespace-padded no-op module rename should not create a history entry"
    )
    log("module context rename ignores padded no-op labels")


def test_right_click_feature_opens_context_menu(page: Page) -> None:
    goto_view(page, "scope")
    row = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    row.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="context-menu"]', state="detached")
    log("right-click on feature opens context menu")


def test_filter_hides_modules_with_zero_matching_features(page: Page) -> None:
    """With a non-default filter active, modules whose features all get
    filtered out must drop out of the layout — empty headers are pure noise.
    With no filter active, every module stays so the user can still + NEW
    into an empty one."""
    goto_view(page, "scope")
    page.get_by_test_id("filter-status-all").click()
    page.get_by_test_id("filter-ms-all").click()
    page.wait_for_timeout(120)
    all_modules_in_dom = lambda: page.locator(
        '[data-testid="view-scope"] [data-module-id]'
    ).count()
    project = get_project(page)
    total_modules = len(project["modules"])
    assert all_modules_in_dom() == total_modules, (
        f"with no filter, expected all {total_modules} modules visible, "
        f"got {all_modules_in_dom()}"
    )

    # Pick a milestone that doesn't include every module.
    ms_with_partial_coverage = None
    for ms in project["meta"]["milestones"]:
        coverage = sum(
            1
            for m in project["modules"]
            if any(f["ms"] == ms["id"] for f in m["features"])
        )
        if 0 < coverage < total_modules:
            ms_with_partial_coverage = ms["id"]
            expected_visible = coverage
            break
    if ms_with_partial_coverage is None:
        log("seed has no milestone with partial module coverage; skipping")
        return

    page.get_by_test_id(f"filter-ms-{ms_with_partial_coverage}").click()
    page.wait_for_timeout(120)
    visible = all_modules_in_dom()
    assert visible == expected_visible, (
        f"with MS={ms_with_partial_coverage} filter, expected "
        f"{expected_visible} modules with matching features, got {visible}"
    )

    # Reset and confirm everything comes back
    page.get_by_test_id("filter-ms-all").click()
    page.wait_for_timeout(120)
    assert all_modules_in_dom() == total_modules, "filter reset did not restore modules"
    log(
        f"MS filter hides modules with zero matches: "
        f"all={total_modules}, {ms_with_partial_coverage}={visible}"
    )


TESTS = [
    test_view_mounts,
    test_module_reorder_via_dnd,
    test_feature_move_between_modules_via_dnd,
    test_totals_update_after_mutation,
    test_feature_row_click_opens_drawer,
    test_chevron_expands_inline_tasks,
    test_inline_task_delete_affordance_stays_visible_on_narrow_screens,
    test_feature_context_rename_ignores_same_label_with_whitespace,
    test_module_context_rename_ignores_same_label_with_whitespace,
    test_right_click_feature_opens_context_menu,
    test_filter_hides_modules_with_zero_matching_features,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

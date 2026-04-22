"""Context menus: feature-menu (10 actions), module-menu (5), empty-area menus per view."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    DialogHandler,
    close_drawer,
    feature_by_id,
    get_project,
    log,
    module_of,
    note_finding,
    run_suite,
    slug_label,
    wait_idle,
)


# ---------- Feature menu (all 10 actions) ----------


def _goto_scope(page: Page) -> None:
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')


def _first_feature(page: Page):
    return page.locator('[data-testid="view-scope"] [data-feature-id]').first


def test_feature_menu_shows_all_10_items(page: Page) -> None:
    _goto_scope(page)
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    for label in (
        "Open",
        "Rename…",
        "Duplicate",
        "Move to Module",
        "Move to Milestone",
        "Add dependency to",
        "Remove dependency",
        "Set Status",
        "Copy ID",
        "Delete",
    ):
        slug = slug_label(label)
        loc = page.locator(
            f'[data-testid="context-menu"] '
            f'[data-testid="menuitem-{slug}"], '
            f'[data-testid="context-menu"] '
            f'[data-testid="menuitem-submenu-{slug}"]'
        )
        assert loc.count() == 1, f"menuitem {label!r} (slug={slug}) not found"
    page.keyboard.press("Escape")
    log("feature menu exposes all 10 canonical actions")


def test_feature_menu_open_action(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-open").click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    assert drawer.get_attribute("data-drawer-feature") == fid
    close_drawer(page)
    log(f"Open action opens drawer for feature {fid!r}")


def test_feature_menu_rename_action(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    before = get_project(page)
    before_label = feature_by_id(before, fid)["label"]  # type: ignore[index]
    new_label = f"{before_label} RENAMED"
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    with DialogHandler(page, accept_with=new_label):
        page.get_by_test_id("menuitem-rename").click()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["label"] == new_label  # type: ignore[index]
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Rename: {before_label!r} → {new_label!r} → undone")


def test_feature_menu_duplicate_action(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    before = get_project(page)
    mod_id = module_of(before, fid)
    feat_count_before = len(
        next(m for m in before["modules"] if m["id"] == mod_id)["features"]
    )
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-duplicate").click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    close_drawer(page)
    wait_idle(page)
    after = get_project(page)
    feat_count_after = len(
        next(m for m in after["modules"] if m["id"] == mod_id)["features"]
    )
    assert feat_count_after == feat_count_before + 1, (
        f"duplicate did not grow feature count: {feat_count_before} → {feat_count_after}"
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("Duplicate adds exactly one new feature")


def test_feature_menu_move_to_module(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    before = get_project(page)
    current_mod = module_of(before, fid)
    target_mod = next(m for m in before["modules"] if m["id"] != current_mod)
    target_label = target_mod["label"]
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-move-to-module").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    page.locator(
        f'[data-testid="context-submenu"] [data-testid="menuitem-{slug_label(target_label)}"]'
    ).click()
    wait_idle(page)
    after = get_project(page)
    assert module_of(after, fid) == target_mod["id"], (
        f"move-to-module failed: {current_mod} → {target_mod['id']} (got {module_of(after, fid)})"
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Move to Module: {current_mod} → {target_mod['id']} → undone")


def test_feature_menu_move_to_milestone(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    before = get_project(page)
    current_ms = feature_by_id(before, fid)["ms"]  # type: ignore[index]
    target = next(m for m in before["meta"]["milestones"] if m["id"] != current_ms)
    label = f"{target['id']} — {target['label']}"
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-move-to-milestone").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    page.locator(
        f'[data-testid="context-submenu"] [data-testid="menuitem-{slug_label(label)}"]'
    ).click()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["ms"] == target["id"]  # type: ignore[index]
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Move to Milestone: {current_ms} → {target['id']} → undone")


def test_feature_menu_set_status_submenu(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-set-status").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    # Done
    page.locator(
        '[data-testid="context-submenu"] [data-testid="menuitem-done"]'
    ).click()
    wait_idle(page)
    after = get_project(page)
    tasks_after = feature_by_id(after, fid)["tasks"]  # type: ignore[index]
    assert tasks_after and all(t["done"] for t in tasks_after), (
        f"Set Status→Done did not mark every task done: {tasks_after}"
    )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Set Status → Done applied to {len(tasks_after)} tasks, undone")


def test_feature_menu_add_dependency_opens_editor(page: Page) -> None:
    _goto_scope(page)
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-add-dependency-to").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    first_candidate = page.locator(
        '[data-testid="context-submenu"] [role="menuitem"]'
    ).filter(has_not=page.locator('[aria-disabled="true"]')).first
    first_candidate.click()
    page.wait_for_selector('[data-testid="dialog-dep-editor"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-dep-editor"]', state="detached")
    log("Add dependency → opens DepEditorPopover")


def test_feature_menu_remove_dependency_enabled_when_present(page: Page) -> None:
    # Use 'auth' which has a dep on 'api' in the seed
    _goto_scope(page)
    target = page.locator('[data-testid="view-scope"] [data-feature-id="auth"]').first
    assert target.count() == 1
    target.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    root = page.get_by_test_id("menuitem-submenu-remove-dependency")
    assert root.get_attribute("aria-disabled") is None
    root.hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    items = page.locator('[data-testid="context-submenu"] [role="menuitem"]')
    assert items.count() >= 1
    # dismiss without mutating so other tests stay deterministic
    page.keyboard.press("Escape")
    log(f"Remove dependency submenu shows {items.count()} item(s) for feature 'auth'")


def test_feature_menu_copy_id(page: Page) -> None:
    _goto_scope(page)
    fid = _first_feature(page).get_attribute("data-feature-id")
    _first_feature(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    # Just trigger; clipboard permission requires special context-setup in headless
    page.get_by_test_id("menuitem-copy-id").click()
    # menu should close
    expect(page.get_by_test_id("context-menu")).to_have_count(0)
    log(f"Copy ID fires without crash for {fid!r}")


def test_feature_menu_delete_with_confirm(page: Page) -> None:
    # Create a throw-away feature so test is reversible
    before = get_project(page)
    mod_id = before["modules"][-1]["id"]  # use last module to minimize side effects
    _goto_scope(page)
    # Use btn-create New Feature to append one (it goes into modules[0] though)
    # Instead: use command palette "New Feature in <last module>"
    last_label = before["modules"][-1]["label"]
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    page.get_by_test_id("command-palette-input").fill(f"New Feature in {last_label}")
    page.wait_for_function(
        """() => document.querySelector(
            '[data-testid="dialog-command-palette"] [role="option"]'
        ) !== null""",
        timeout=3000,
    )
    page.locator(
        '[data-testid="dialog-command-palette"] [role="option"]'
    ).first.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    drawer = page.get_by_test_id("dialog-task")
    new_fid = drawer.get_attribute("data-drawer-feature")
    close_drawer(page)
    wait_idle(page)

    target = page.locator(f'[data-feature-id="{new_fid}"]').first
    target.scroll_into_view_if_needed()
    target.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    with DialogHandler(page, accept_with=""):
        page.get_by_test_id("menuitem-delete").click()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, new_fid) is None, f"feature {new_fid!r} not deleted"
    # cleanup: undo twice (delete + add)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Delete with confirm removes throwaway feature {new_fid!r}")


# ---------- Module menu (5 actions) ----------


def _first_module_header(page: Page):
    """Right-clicking the module card lands inside a feature row (onContextMenu
    fires there first and stopPropagates). The module-level menu only binds to
    the <header>. Target it explicitly."""
    return page.locator('[data-testid="view-scope"] [data-module-id]').first.locator("header").first


def test_module_menu_shows_all_5(page: Page) -> None:
    _goto_scope(page)
    _first_module_header(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    for label in ("Rename…", "Duplicate", "Add Feature", "Delete Module"):
        slug = slug_label(label)
        loc = page.locator(
            f'[data-testid="context-menu"] [data-testid="menuitem-{slug}"]'
        )
        if loc.count() != 1:
            note_finding(
                "Bugs",
                "major",
                "module-menu",
                f"menuitem {label!r} missing on module context menu",
            )
    # Change Color is a submenu
    loc = page.locator(
        '[data-testid="context-menu"] [data-testid="menuitem-submenu-change-color"]'
    )
    assert loc.count() == 1, "Change Color submenu missing"
    page.keyboard.press("Escape")
    log("module menu exposes Rename/Duplicate/Change Color/Add Feature/Delete")


def test_module_menu_color_swatch_swaps_color(page: Page) -> None:
    _goto_scope(page)
    mod_card = page.locator('[data-testid="view-scope"] [data-module-id]').first
    mod_id = mod_card.get_attribute("data-module-id")
    before = get_project(page)
    before_color = next(m for m in before["modules"] if m["id"] == mod_id)["color"]
    _first_module_header(page).click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-submenu-change-color").hover()
    page.wait_for_selector('[data-testid="context-submenu"]')
    # Click the first enabled swatch (current is disabled)
    swatches = page.locator('[data-testid="context-submenu"] [role="menuitem"]').all()
    clicked_label = None
    for sw in swatches:
        if sw.get_attribute("aria-disabled"):
            continue
        clicked_label = sw.inner_text()
        sw.click()
        break
    assert clicked_label, "no enabled swatch found"
    wait_idle(page)
    after = get_project(page)
    after_color = next(m for m in after["modules"] if m["id"] == mod_id)["color"]
    assert after_color.lower() != before_color.lower()
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"Change Color: {before_color} → {after_color} ({clicked_label}) → undone")


# ---------- Empty-area menus ----------


def test_empty_area_scope(page: Page) -> None:
    """Right-clicking the heading wrapper (the `01 · MODULE SCOPE` block at
    the top of the view) opens the scope-level empty-area menu. This is the
    mouse path for users who want to reach New Module without fishing for a
    bare pixel in a card-filled grid."""
    _goto_scope(page)
    page.keyboard.press("Escape")
    heading = page.locator('[data-testid="view-scope"] h1').first
    heading.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
    assert page.locator(
        '[data-testid="context-menu"] [data-testid="menuitem-new-module"]'
    ).count() == 1
    page.keyboard.press("Escape")
    log("scope heading right-click exposes New Module")


def test_empty_area_kanban_column(page: Page) -> None:
    """Right-click on the Backlog column's header opens the column-level
    empty-area menu with 'New Feature in Backlog' — unaffected by how many
    cards the column contains."""
    page.get_by_test_id("tab-kanban").click()
    page.wait_for_selector('[data-testid="view-kanban"]')
    page.locator('[data-testid="kanban-col-backlog"] header').first.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]', timeout=2000)
    slug = slug_label("New Feature in Backlog")
    loc = page.locator(
        f'[data-testid="context-menu"] [data-testid="menuitem-{slug}"]'
    )
    assert loc.count() == 1, f"'New Feature in Backlog' missing (slug={slug})"
    page.keyboard.press("Escape")
    log("kanban Backlog column header right-click exposes 'New Feature in Backlog'")


def test_viewport_aware_positioning(page: Page) -> None:
    """Right-click near the far bottom-right corner; the menu should still be
    fully on-screen (the `adj` clamp in ContextMenu.tsx)."""
    _goto_scope(page)
    vp = page.viewport_size
    assert vp
    # try a feature near the lower right region
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').last
    box = feat.bounding_box()
    if not box:
        return
    # force open by right-clicking this feature
    feat.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    menu_box = page.get_by_test_id("context-menu").bounding_box()
    assert menu_box
    # Menu must fit inside the viewport
    assert menu_box["x"] + menu_box["width"] <= vp["width"] + 1
    assert menu_box["y"] + menu_box["height"] <= vp["height"] + 1
    page.keyboard.press("Escape")
    log("context menu stays within viewport bounds")


TESTS = [
    test_feature_menu_shows_all_10_items,
    test_feature_menu_open_action,
    test_feature_menu_rename_action,
    test_feature_menu_duplicate_action,
    test_feature_menu_move_to_module,
    test_feature_menu_move_to_milestone,
    test_feature_menu_set_status_submenu,
    test_feature_menu_add_dependency_opens_editor,
    test_feature_menu_remove_dependency_enabled_when_present,
    test_feature_menu_copy_id,
    test_feature_menu_delete_with_confirm,
    test_module_menu_shows_all_5,
    test_module_menu_color_swatch_swaps_color,
    test_empty_area_scope,
    test_empty_area_kanban_column,
    test_viewport_aware_positioning,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

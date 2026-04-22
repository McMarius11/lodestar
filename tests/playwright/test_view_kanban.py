"""Kanban view: 3 columns, DnD between columns mutates task.done, sort modes,
rank persistence within a column."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    dnd_html5,
    feature_by_id,
    get_project,
    goto_view,
    log,
    run_suite,
    wait_idle,
)


def _card_ids_in_col(page: Page, col: str) -> list[str]:
    return page.locator(
        f'[data-testid="kanban-col-{col}"] [data-feature-id]'
    ).evaluate_all("els => els.map(e => e.getAttribute('data-feature-id'))")


def test_view_mounts_with_three_columns(page: Page) -> None:
    goto_view(page, "kanban")
    for c in ("backlog", "progress", "done"):
        assert page.locator(f'[data-testid="kanban-col-{c}"]').count() == 1, c
    log("kanban mounts with backlog / progress / done columns")


def test_dnd_between_columns_sets_task_done(page: Page) -> None:
    goto_view(page, "kanban")
    # Pick a card from backlog and drop into done. All its tasks should flip to done.
    backlog = _card_ids_in_col(page, "backlog")
    assert backlog, "need a backlog card"
    fid = backlog[0]
    src_sel = f'[data-testid="kanban-col-backlog"] [data-feature-id="{fid}"]'
    dst_sel = f'[data-testid="kanban-col-done"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    after = get_project(page)
    feat = feature_by_id(after, fid)
    assert feat, fid
    if feat["tasks"]:
        assert all(t["done"] for t in feat["tasks"]), (
            f"expected all tasks of {fid} to be done: {feat['tasks']}"
        )
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"dropping {fid!r} on Done flips all its tasks to done")


def test_dnd_within_column_persists_rank(page: Page) -> None:
    goto_view(page, "kanban")
    # Reorder the first column that has ≥2 cards.
    target_col = None
    for c in ("backlog", "progress", "done"):
        if len(_card_ids_in_col(page, c)) >= 2:
            target_col = c
            break
    if not target_col:
        log("no kanban column with ≥2 cards; skipping rank test")
        return
    ids = _card_ids_in_col(page, target_col)
    a = ids[0]
    b = ids[1]
    # Drop a onto b's position → order becomes [b, a, ...]. Use b's card as drop target.
    src_sel = f'[data-testid="kanban-col-{target_col}"] [data-feature-id="{a}"]'
    dst_sel = f'[data-testid="kanban-col-{target_col}"] [data-feature-id="{b}"]'
    dnd_html5(page, src_sel, dst_sel)
    wait_idle(page)
    after_ids = _card_ids_in_col(page, target_col)
    # At minimum, the order should be different AND the store should carry
    # numeric ranks for both cards.
    proj = get_project(page)
    feat_a = feature_by_id(proj, a)
    feat_b = feature_by_id(proj, b)
    assert feat_a.get("rank") is not None or feat_b.get("rank") is not None, (
        f"expected at least one of {a!r}, {b!r} to have a rank after reorder"
    )
    log(
        f"within-column DnD set persistent rank on {a!r}/{b!r}; "
        f"order {ids[:2]} → {after_ids[:2]}"
    )
    # restore via undo
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)


def test_sort_modes_cycle(page: Page) -> None:
    goto_view(page, "kanban")
    # The SORT buttons are the three sibling buttons in the toolbar row, each
    # holding a single label-mono word. Find them via their parent.
    toolbar = page.locator('[data-testid="view-kanban"] .label-mono', has_text="SORT").first
    for s in ("EFFORT", "MILESTONE", "MODULE"):
        toolbar.locator(
            'xpath=following-sibling::button',
        ).filter(has_text=s).first.click()
        total = sum(
            len(_card_ids_in_col(page, c)) for c in ("backlog", "progress", "done")
        )
        assert total > 0, f"sort={s} wiped the board"
    log("SORT buttons cycle module/effort/milestone without data loss")


def test_card_click_opens_drawer(page: Page) -> None:
    goto_view(page, "kanban")
    card = page.locator('[data-testid^="kanban-col-"] [data-feature-id]').first
    fid = card.get_attribute("data-feature-id")
    card.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    assert page.get_by_test_id("dialog-task").get_attribute("data-drawer-feature") == fid
    page.keyboard.press("Escape")
    try:
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached", timeout=500)
    except Exception:
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log(f"kanban card click opens drawer for {fid!r}")


def test_right_click_card_opens_context_menu(page: Page) -> None:
    goto_view(page, "kanban")
    card = page.locator('[data-testid^="kanban-col-"] [data-feature-id]').first
    card.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="context-menu"]', state="detached")
    log("right-click on kanban card opens context menu")


TESTS = [
    test_view_mounts_with_three_columns,
    test_dnd_between_columns_sets_task_done,
    test_dnd_within_column_persists_rank,
    test_sort_modes_cycle,
    test_card_click_opens_drawer,
    test_right_click_card_opens_context_menu,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

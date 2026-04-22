"""MilestoneEditor: open, add, rename (label + ID cascade), delete paths."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    DialogHandler,
    close_palette,
    get_project,
    goto_view,
    log,
    open_palette,
    run_suite,
    wait_idle,
)


def _open_milestone_editor(page: Page) -> None:
    """Open the editor via the command palette. Asserts the dialog is mounted
    and the Framer Motion entry animation has settled."""
    if page.locator('[data-testid="dialog-milestone"]').count() == 0:
        open_palette(page)
        page.get_by_test_id("command-proj:edit-milestones").click()
    page.wait_for_selector('[data-testid="dialog-milestone"]')
    # The dialog does a small transform/opacity animation on mount; wait for
    # bounding boxes to stabilize so row inputs aren't flagged "not stable".
    page.wait_for_timeout(250)


def _close_milestone_editor(page: Page) -> None:
    if page.locator('[data-testid="dialog-milestone"]').count() == 0:
        return
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-milestone"]', state="detached")


def test_opens_via_palette(page: Page) -> None:
    _open_milestone_editor(page)
    rows = page.locator('[data-testid^="milestone-row-"]')
    assert rows.count() == 5, f"expected 5 milestones, got {rows.count()}"
    _close_milestone_editor(page)
    log("MilestoneEditor opens from command palette")


def test_esc_closes(page: Page) -> None:
    _open_milestone_editor(page)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-milestone"]', state="detached")
    log("Esc closes MilestoneEditor")


def test_add_milestone(page: Page) -> None:
    _open_milestone_editor(page)
    dialog = page.get_by_test_id("dialog-milestone")
    id_input = dialog.locator('input[placeholder*="ID"]')
    label_input = dialog.locator('input[placeholder="Label"]')
    id_input.fill("v0.5")
    label_input.fill("Polish Pass")
    dialog.locator("button", has_text="+ Add").click()
    wait_idle(page)
    page.wait_for_selector('[data-testid="milestone-row-v0.5"]')
    proj = get_project(page)
    ids = [m["id"] for m in proj["meta"]["milestones"]]
    assert "v0.5" in ids, ids
    label = next(m for m in proj["meta"]["milestones"] if m["id"] == "v0.5")["label"]
    assert label == "Polish Pass"
    _close_milestone_editor(page)
    log("add milestone v0.5 persisted")


def test_duplicate_id_rejected(page: Page) -> None:
    _open_milestone_editor(page)
    dialog = page.get_by_test_id("dialog-milestone")
    before = page.locator('[data-testid^="milestone-row-"]').count()
    dialog.locator('input[placeholder*="ID"]').fill("v0.1")  # already exists
    dialog.locator('input[placeholder="Label"]').fill("dup")
    dialog.locator("button", has_text="+ Add").click()
    page.wait_for_timeout(150)
    after = page.locator('[data-testid^="milestone-row-"]').count()
    assert after == before, f"duplicate id silently added: {before} → {after}"
    _close_milestone_editor(page)
    log("duplicate milestone ID is silently refused")


def test_rename_label(page: Page) -> None:
    _open_milestone_editor(page)
    row = page.get_by_test_id("milestone-row-v0.2")
    label_input = row.locator("input").nth(1)
    label_input.click()
    label_input.fill("Renamed Phase")
    label_input.evaluate("el => el.blur()")
    wait_idle(page)
    proj = get_project(page)
    ms = next(m for m in proj["meta"]["milestones"] if m["id"] == "v0.2")
    assert ms["label"] == "Renamed Phase", ms
    _close_milestone_editor(page)
    log("milestone label rename is persisted on blur")


def test_reid_cascades_to_features(page: Page) -> None:
    _open_milestone_editor(page)
    before = get_project(page)
    feats_in_v01 = [
        f["id"] for m in before["modules"] for f in m["features"] if f["ms"] == "v0.1"
    ]
    assert feats_in_v01, "expected seed to have features on v0.1"

    row = page.get_by_test_id("milestone-row-v0.1")
    id_input = row.locator("input").first
    id_input.focus()
    id_input.fill("v0.1a")
    id_input.evaluate("el => el.blur()")
    wait_idle(page)
    after = get_project(page)
    ids = [m["id"] for m in after["meta"]["milestones"]]
    assert "v0.1a" in ids and "v0.1" not in ids, ids
    for fid in feats_in_v01:
        feat = next(
            f for mod in after["modules"] for f in mod["features"] if f["id"] == fid
        )
        assert feat["ms"] == "v0.1a", f"feature {fid} still points to old ms: {feat['ms']}"
    # restore for later tests
    row2 = page.get_by_test_id("milestone-row-v0.1a")
    id_input2 = row2.locator("input").first
    id_input2.focus()
    id_input2.fill("v0.1")
    id_input2.evaluate("el => el.blur()")
    wait_idle(page)
    _close_milestone_editor(page)
    log("milestone re-ID cascades to feature.ms fields")


def test_delete_unused_milestone(page: Page) -> None:
    # v0.5 was added in test_add_milestone and is unused by any feature
    _open_milestone_editor(page)
    proj = get_project(page)
    unused_id = None
    used_ids = {f["ms"] for m in proj["modules"] for f in m["features"]}
    for ms in proj["meta"]["milestones"]:
        if ms["id"] not in used_ids:
            unused_id = ms["id"]
            break
    assert unused_id, "need an unused milestone for this test"
    row = page.get_by_test_id(f"milestone-row-{unused_id}")
    with DialogHandler(page):  # accept the "Delete?" confirm
        row.locator("button", has_text="×").click()
    wait_idle(page)
    after = get_project(page)
    ids = [m["id"] for m in after["meta"]["milestones"]]
    assert unused_id not in ids, f"{unused_id} was not deleted"
    _close_milestone_editor(page)
    log(f"unused milestone {unused_id} deleted after confirm")


def test_delete_used_milestone_reassigns(page: Page) -> None:
    _open_milestone_editor(page)
    before = get_project(page)
    assert any(f["ms"] == "v0.3" for m in before["modules"] for f in m["features"]), (
        "seed expected to have features on v0.3"
    )
    row = page.get_by_test_id("milestone-row-v0.3")
    # first dialog is confirm-less; used-milestone path opens prompt directly
    with DialogHandler(page, accept_with="v0.4"):
        row.locator("button", has_text="×").click()
    wait_idle(page)
    after = get_project(page)
    ids = [m["id"] for m in after["meta"]["milestones"]]
    assert "v0.3" not in ids, ids
    moved = [f["id"] for m in after["modules"] for f in m["features"] if f["ms"] == "v0.4"]
    # at least the features formerly on v0.3 are now on v0.4
    formerly_v03 = [
        f["id"] for m in before["modules"] for f in m["features"] if f["ms"] == "v0.3"
    ]
    for fid in formerly_v03:
        assert fid in moved, f"{fid} was not reassigned to v0.4"
    _close_milestone_editor(page)
    log("used milestone deletion reassigns features via prompt target")


TESTS = [
    test_opens_via_palette,
    test_esc_closes,
    test_add_milestone,
    test_duplicate_id_rejected,
    test_rename_label,
    test_reid_cascades_to_features,
    test_delete_unused_milestone,
    test_delete_used_milestone_reassigns,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

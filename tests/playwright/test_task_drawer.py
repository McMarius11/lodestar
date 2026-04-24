"""TaskDrawer: open paths, label edit, description edit, task CRUD, footer selects."""
from __future__ import annotations

import sys

from playwright.sync_api import Page, expect

from _lib import (
    DialogHandler,
    close_drawer,
    feature_by_id,
    get_project,
    log,
    note_finding,
    run_suite,
    wait_idle,
)


def _goto_scope(page: Page) -> None:
    close_drawer(page)
    page.get_by_test_id("tab-scope").click()
    page.wait_for_selector('[data-testid="view-scope"]')


def _open_first_feature(page: Page) -> str:
    _goto_scope(page)
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    return fid  # type: ignore[return-value]


def _open_feature(page: Page, fid: str) -> str:
    _goto_scope(page)
    page.locator(f'[data-testid="view-scope"] [data-feature-id="{fid}"]').first.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    return fid


def test_open_via_click(page: Page) -> None:
    fid = _open_first_feature(page)
    drawer = page.get_by_test_id("dialog-task")
    assert drawer.get_attribute("data-drawer-feature") == fid
    close_drawer(page)
    log(f"click opens drawer for {fid!r}")


def test_open_via_context_menu(page: Page) -> None:
    _goto_scope(page)
    feat = page.locator('[data-testid="view-scope"] [data-feature-id]').first
    fid = feat.get_attribute("data-feature-id")
    feat.click(button="right")
    page.wait_for_selector('[data-testid="context-menu"]')
    page.get_by_test_id("menuitem-open").click()
    drawer = page.get_by_test_id("dialog-task")
    drawer.wait_for()
    assert drawer.get_attribute("data-drawer-feature") == fid
    close_drawer(page)
    log("context-menu 'Open' opens drawer")


def test_esc_closes(page: Page) -> None:
    _open_first_feature(page)
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("Esc closes drawer")


def test_esc_closes_while_input_focused(page: Page) -> None:
    _open_first_feature(page)
    page.get_by_test_id("drawer-feature-label").focus()
    page.keyboard.press("Escape")
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("Esc closes drawer even while an input is focused")


def test_outside_click_closes(page: Page) -> None:
    _open_first_feature(page)
    # The overlay div sits under the drawer at opacity:0.5 and covers the viewport.
    # Click at (20,20) — far from drawer content — should hit the overlay.
    page.mouse.click(20, 20)
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("outside-click on overlay closes drawer")


def test_label_edit_commits(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_label = feature_by_id(before, fid)["label"]  # type: ignore[index]
    new_label = f"{before_label} EDITED"
    inp = page.get_by_test_id("drawer-feature-label")
    inp.fill(new_label)
    inp.blur()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["label"] == new_label  # type: ignore[index]
    # cleanup: undo
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"drawer label edit: {before_label!r} → {new_label!r} → undone")


def test_label_edit_trims_and_ignores_blank(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_label = feature_by_id(before, fid)["label"]  # type: ignore[index]
    trimmed_label = f"{before_label} Prime"
    inp = page.get_by_test_id("drawer-feature-label")
    inp.fill(f"  {trimmed_label}  ")
    inp.blur()
    wait_idle(page)
    after_trim = get_project(page)
    assert feature_by_id(after_trim, fid)["label"] == trimmed_label  # type: ignore[index]

    inp = page.get_by_test_id("drawer-feature-label")
    inp.fill("   ")
    inp.blur()
    wait_idle(page)
    after_blank = get_project(page)
    assert feature_by_id(after_blank, fid)["label"] == trimmed_label  # type: ignore[index]

    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("drawer label trims surrounding whitespace and ignores blank-only edits")


def test_task_toggle_commits(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    tasks_before = feature_by_id(before, fid)["tasks"]  # type: ignore[index]
    if not tasks_before:
        close_drawer(page)
        note_finding("Bugs", "minor", "test_task_toggle_commits",
                     f"feature {fid!r} has no tasks in seed; cannot test toggle")
        return
    # First task row's first button = checkbox
    row = page.locator('[data-testid="dialog-task"] ul li').first
    checkbox = row.locator("button").first
    before_done = tasks_before[0]["done"]
    checkbox.click()
    wait_idle(page)
    after = get_project(page)
    after_done = feature_by_id(after, fid)["tasks"][0]["done"]  # type: ignore[index]
    assert after_done != before_done, f"task toggle did not flip done ({before_done} stayed)"
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"task toggle: {before_done} → {after_done} → undone")


def test_task_add(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    count_before = len(feature_by_id(before, fid)["tasks"])  # type: ignore[index]
    inp = page.locator('[data-testid="dialog-task"] input[placeholder="Add task…"]')
    inp.fill("A brand new task added by Playwright")
    inp.press("Enter")
    wait_idle(page)
    after = get_project(page)
    count_after = len(feature_by_id(after, fid)["tasks"])  # type: ignore[index]
    assert count_after == count_before + 1, (
        f"task add did not grow count: {count_before} → {count_after}"
    )
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"task add: +1 then undone ({count_before} → {count_after})")


def test_task_add_trims_and_ignores_blank(page: Page) -> None:
    """Store-level invariant: addTask must trim and reject whitespace-only labels.

    The UI input technically accepts anything; addTask is what enforces hygiene.
    Two cases: a padded label persists trimmed, a whitespace-only label is a no-op."""
    fid = _open_first_feature(page)
    before = get_project(page)
    tasks_before = feature_by_id(before, fid)["tasks"]  # type: ignore[index]
    inp = page.locator('[data-testid="dialog-task"] input[placeholder="Add task…"]')

    # Padded label → stored as trimmed
    padded = "  trimmed task  "
    expected = padded.strip()
    inp.fill(padded)
    inp.press("Enter")
    wait_idle(page)
    after_pad = get_project(page)
    new_tasks = [t for t in feature_by_id(after_pad, fid)["tasks"] if t not in tasks_before]  # type: ignore[index]
    assert len(new_tasks) == 1, f"padded add did not grow tasks by 1: {new_tasks}"
    assert new_tasks[0]["label"] == expected, (
        f"label not trimmed: {new_tasks[0]['label']!r} != {expected!r}"
    )

    # Whitespace-only → silently ignored, no commit, no new task
    count_after_pad = len(feature_by_id(after_pad, fid)["tasks"])  # type: ignore[index]
    inp.fill("   ")
    inp.press("Enter")
    wait_idle(page)
    after_blank = get_project(page)
    assert len(feature_by_id(after_blank, fid)["tasks"]) == count_after_pad, (  # type: ignore[index]
        "whitespace-only add unexpectedly grew tasks"
    )

    close_drawer(page)
    page.get_by_test_id("btn-undo").click()  # undo the trimmed-add
    wait_idle(page)
    log("addTask trims padded labels and rejects whitespace-only input")


def test_task_delete(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    tasks_before = feature_by_id(before, fid)["tasks"]  # type: ignore[index]
    if not tasks_before:
        close_drawer(page)
        return
    row = page.locator('[data-testid="dialog-task"] ul li').first
    row.hover()
    # DEL button is opacity-0 until hover; click by text
    row.locator("button", has_text="DEL").click()
    wait_idle(page)
    after = get_project(page)
    assert len(feature_by_id(after, fid)["tasks"]) == len(tasks_before) - 1  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("task delete: -1 then undone")


def test_description_edit_commits_on_blur(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_desc = feature_by_id(before, fid).get("description", "") or ""  # type: ignore[union-attr]
    new_desc = "Edited description via Playwright."
    ta = page.locator('[data-testid="dialog-task"] textarea').first
    ta.fill(new_desc)
    ta.blur()
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid).get("description") == new_desc  # type: ignore[union-attr]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"description edit: {len(before_desc)}ch → {len(new_desc)}ch → undone")


def test_effort_dropdown(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_eff = feature_by_id(before, fid)["effort"]  # type: ignore[index]
    # pick anything different
    new_eff = next(e for e in ("S", "M", "L", "XL") if e != before_eff)
    sel = page.locator('[data-testid="dialog-task"] select').nth(1)  # [0]=dep type? Actually depends
    # The first selects in the drawer are per-dep type selects, then footer milestone/effort.
    # Easier: select by label proximity — find the select inside the 'EFFORT' label
    eff_sel = page.locator(
        '[data-testid="dialog-task"] label:has-text("EFFORT") select'
    ).first
    eff_sel.select_option(new_eff)
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["effort"] == new_eff  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"effort: {before_eff} → {new_eff} → undone")


def test_milestone_dropdown(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_ms = feature_by_id(before, fid)["ms"]  # type: ignore[index]
    target = next(m["id"] for m in before["meta"]["milestones"] if m["id"] != before_ms)
    ms_sel = page.locator(
        '[data-testid="dialog-task"] label:has-text("MILESTONE") select'
    ).first
    ms_sel.select_option(target)
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid)["ms"] == target  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"milestone: {before_ms} → {target} → undone")


def test_weeks_inputs(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_feat = feature_by_id(before, fid)  # type: ignore[assignment]
    before_start = before_feat["ganttStart"]  # type: ignore[index]
    before_end = before_feat["ganttEnd"]  # type: ignore[index]
    new_start = before_start + 1
    new_end = before_end + 2
    weeks_inputs = page.locator(
        '[data-testid="dialog-task"] label:has-text("WEEKS") input[type="number"]'
    )
    weeks_inputs.nth(0).fill(str(new_start))
    weeks_inputs.nth(0).blur()
    wait_idle(page)
    weeks_inputs.nth(1).fill(str(new_end))
    weeks_inputs.nth(1).blur()
    wait_idle(page)
    after = get_project(page)
    after_feat = feature_by_id(after, fid)  # type: ignore[assignment]
    assert after_feat["ganttStart"] == new_start  # type: ignore[index]
    assert after_feat["ganttEnd"] == new_end  # type: ignore[index]
    close_drawer(page)
    # undo twice (two commits)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"weeks: {before_start}-{before_end} → {new_start}-{new_end} → undone")


def test_weeks_blank_input_does_not_corrupt_state(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_feat = feature_by_id(before, fid)  # type: ignore[assignment]
    before_start = before_feat["ganttStart"]  # type: ignore[index]
    before_end = before_feat["ganttEnd"]  # type: ignore[index]
    weeks_inputs = page.locator(
        '[data-testid="dialog-task"] label:has-text("WEEKS") input[type="number"]'
    )
    weeks_inputs.nth(0).fill("")
    weeks_inputs.nth(0).blur()
    wait_idle(page)
    after = get_project(page)
    after_feat = feature_by_id(after, fid)  # type: ignore[assignment]
    assert after_feat["ganttStart"] == before_start  # type: ignore[index]
    assert after_feat["ganttEnd"] == before_end  # type: ignore[index]
    close_drawer(page)
    log("blank week input leaves gantt values unchanged")


def test_weeks_clamp_when_start_moves_past_end(page: Page) -> None:
    fid = _open_first_feature(page)
    before = get_project(page)
    before_feat = feature_by_id(before, fid)  # type: ignore[assignment]
    before_end = before_feat["ganttEnd"]  # type: ignore[index]
    target_start = before_end + 2
    weeks_inputs = page.locator(
        '[data-testid="dialog-task"] label:has-text("WEEKS") input[type="number"]'
    )
    weeks_inputs.nth(0).fill(str(target_start))
    weeks_inputs.nth(0).blur()
    wait_idle(page)
    after = get_project(page)
    after_feat = feature_by_id(after, fid)  # type: ignore[assignment]
    assert after_feat["ganttStart"] == target_start  # type: ignore[index]
    assert after_feat["ganttEnd"] == target_start + 1  # type: ignore[index]
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log("weeks clamp keeps gantt end ahead of start")


def test_add_dependency_via_drawer(page: Page) -> None:
    _open_first_feature(page)
    drawer = page.get_by_test_id("dialog-task")
    fid = drawer.get_attribute("data-drawer-feature")
    before = get_project(page)
    deps_before = len(feature_by_id(before, fid)["deps"])  # type: ignore[index]
    drawer.locator("button", has_text="+ ADD DEPENDENCY").click()
    # Select the first available candidate
    sel = drawer.locator("select").filter(has=page.locator("option", has_text="select feature")).first
    # Pick any non-placeholder option
    opts = sel.locator("option").all_inner_texts()
    real = [o for o in opts if "—" not in o and "select" not in o.lower()]
    if not real:
        close_drawer(page)
        note_finding("Bugs", "minor", "test_add_dependency_via_drawer",
                     "no candidates in AddDepRow select (every feature already depends?)")
        return
    sel.select_option(label=real[0])
    reason = drawer.locator('input[placeholder="Reason…"]')
    reason.fill("Because the test says so")
    drawer.locator("button", has_text="ADD").click()
    wait_idle(page)
    after = get_project(page)
    deps_after = len(feature_by_id(after, fid)["deps"])  # type: ignore[index]
    assert deps_after == deps_before + 1, f"{deps_before} → {deps_after}"
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"add-dep via drawer: +1 ({deps_before} → {deps_after}) → undone")


def test_delete_feature_from_drawer_footer(page: Page) -> None:
    # Create a disposable feature via command palette, then delete via drawer.
    page.keyboard.press("Control+k")
    page.wait_for_selector('[data-testid="dialog-command-palette"]')
    page.get_by_test_id("command-palette-input").fill("New Module")
    # Better: just use ⌘K → New Feature for first module
    page.get_by_test_id("command-palette-input").fill("New Feature in ")
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
    fid = drawer.get_attribute("data-drawer-feature")
    wait_idle(page)
    before = get_project(page)
    exists_before = feature_by_id(before, fid) is not None
    assert exists_before, f"fresh feature {fid!r} not in store"
    with DialogHandler(page, accept_with=""):
        drawer.locator("button", has_text="DELETE FEATURE").click()
    page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    wait_idle(page)
    after = get_project(page)
    assert feature_by_id(after, fid) is None, "feature not deleted"
    # cleanup: undo delete + add
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    log(f"drawer DELETE FEATURE removes {fid!r}, undo restores")


def test_mobile_drawer_stacks_sections_and_keeps_footer_controls_visible(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    fid = _open_first_feature(page)
    drawer = page.get_by_test_id("dialog-task")
    drawer_box = drawer.bounding_box()
    assert drawer_box is not None

    tasks_heading = drawer.locator("h3", has_text="Tasks").bounding_box()
    deps_heading = drawer.locator("h3", has_text="Dependencies").bounding_box()
    weeks_input = page.locator(
        '[data-testid="dialog-task"] label:has-text("WEEKS") input[type="number"]'
    ).nth(0).bounding_box()
    delete_btn = page.locator(
        '[data-testid="dialog-task"] button', has_text="DELETE FEATURE"
    ).bounding_box()

    assert tasks_heading is not None
    assert deps_heading is not None
    assert weeks_input is not None
    assert delete_btn is not None

    assert deps_heading["y"] > tasks_heading["y"] + 40, (
        f"dependencies should stack below tasks on narrow screens: "
        f"{tasks_heading['y']} vs {deps_heading['y']}"
    )
    assert weeks_input["x"] + weeks_input["width"] <= drawer_box["x"] + drawer_box["width"] + 1, (
        f"weeks input overflowed drawer width: {weeks_input['x']} + {weeks_input['width']} "
        f"> {drawer_box['x']} + {drawer_box['width']}"
    )
    assert delete_btn["x"] >= drawer_box["x"] - 1
    close_drawer(page)
    page.set_viewport_size({"width": 1280, "height": 900})
    log(f"mobile drawer layout stays readable for {fid!r}")


def test_mobile_delete_actions_stay_visible_for_tasks_and_dependencies(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    fid = _open_feature(page, "auth")
    task_delete = page.locator('[aria-label^="Delete task "]').first
    dep_delete = page.locator('[aria-label^="Remove dependency on "]').first
    task_opacity = float(task_delete.evaluate("el => getComputedStyle(el).opacity"))
    dep_opacity = float(dep_delete.evaluate("el => getComputedStyle(el).opacity"))
    assert task_opacity >= 0.69, f"task delete action should stay visible on mobile, got {task_opacity}"
    assert dep_opacity >= 0.69, (
        f"dependency delete action should stay visible on mobile, got {dep_opacity}"
    )
    close_drawer(page)
    page.set_viewport_size({"width": 1280, "height": 900})
    log(f"mobile delete affordances stay visible for {fid!r}")


def test_task_delete_action_is_keyboard_focusable(page: Page) -> None:
    _open_feature(page, "auth")
    delete_btn = page.locator('[aria-label^="Delete task "]').first
    before = float(delete_btn.evaluate("el => getComputedStyle(el).opacity"))
    focused = delete_btn.evaluate(
        """el => {
            el.focus()
            return document.activeElement === el
        }"""
    )
    assert before >= 0.69, f"expected visible desktop affordance before focus, got {before}"
    assert focused is True, "expected delete action to be keyboard focusable"
    close_drawer(page)
    log("task delete affordance is keyboard focusable")


def test_feature_id_rename_cascades_to_deps(page: Page) -> None:
    # Pick a feature other features depend on. 'api' in the seed has incoming deps.
    proj_before = get_project(page)
    incoming = [
        f["id"]
        for m in proj_before["modules"]
        for f in m["features"]
        if any(d["id"] == "api" for d in f["deps"])
    ]
    assert incoming, "seed expectation: at least one feature depends on 'api'"
    _open_feature(page, "api")

    page.get_by_test_id("drawer-feature-id").click()
    inp = page.get_by_test_id("drawer-feature-id-input")
    inp.fill("api-v2")
    inp.press("Enter")
    wait_idle(page)

    after = get_project(page)
    assert feature_by_id(after, "api-v2") is not None, "renamed feature not found"
    assert feature_by_id(after, "api") is None, "old id should be gone"
    for fid in incoming:
        f = feature_by_id(after, fid)
        assert f is not None
        dep_targets = [d["id"] for d in f["deps"]]
        assert "api-v2" in dep_targets and "api" not in dep_targets, (
            f"dep in {fid!r} was not repointed: {dep_targets!r}"
        )
    # drawer stays anchored on the renamed feature
    drawer = page.get_by_test_id("dialog-task")
    assert drawer.get_attribute("data-drawer-feature") == "api-v2"

    # undo restores everything
    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    restored = get_project(page)
    assert feature_by_id(restored, "api") is not None
    assert feature_by_id(restored, "api-v2") is None
    log(f"feature-id rename cascades to {len(incoming)} dep(s) and undoes")


def test_feature_id_rename_rejects_duplicate(page: Page) -> None:
    _open_feature(page, "api")
    page.get_by_test_id("drawer-feature-id").click()
    inp = page.get_by_test_id("drawer-feature-id-input")
    inp.fill("auth")  # 'auth' exists in seed
    inp.press("Enter")
    # input stays editable (rejection), error message visible
    page.wait_for_selector('[data-testid="drawer-feature-id-error"]')
    proj = get_project(page)
    assert feature_by_id(proj, "api") is not None, "duplicate rename must not mutate state"
    # cancel
    page.keyboard.press("Escape")
    close_drawer(page)
    log("duplicate feature-id rename is refused and shows error")


def test_feature_id_rename_esc_cancels_draft(page: Page) -> None:
    _open_feature(page, "auth")
    page.get_by_test_id("drawer-feature-id").click()
    inp = page.get_by_test_id("drawer-feature-id-input")
    inp.fill("typed-but-cancelled")
    page.keyboard.press("Escape")
    # chip is back to non-editing state with the original id
    chip = page.get_by_test_id("drawer-feature-id")
    chip.wait_for()
    assert chip.inner_text().strip() == "auth"
    proj = get_project(page)
    assert feature_by_id(proj, "auth") is not None
    close_drawer(page)
    log("Esc cancels feature-id rename draft without side effect")


def test_task_reorder_via_drag_and_drop(page: Page) -> None:
    # Find a seed feature with ≥3 tasks to exercise a meaningful reorder.
    proj = get_project(page)
    candidate = None
    for m in proj["modules"]:
        for f in m["features"]:
            if len(f["tasks"]) >= 3:
                candidate = f
                break
        if candidate:
            break
    if not candidate:
        note_finding("Bugs", "minor", "test_task_reorder_via_drag_and_drop",
                     "seed has no feature with ≥3 tasks; skipped")
        return

    fid = candidate["id"]
    task_ids_before = [t["id"] for t in candidate["tasks"]]
    first_id, _second, last_id = task_ids_before[0], task_ids_before[1], task_ids_before[-1]
    _open_feature(page, fid)

    # DnD last task to the very top via HTML5-DnD helper.
    from _lib import dnd_html5  # local import keeps top imports tidy
    src = f'[data-testid="dialog-task"] [data-task-id="{last_id}"]'
    dst = f'[data-testid="dialog-task"] [data-task-id="{first_id}"]'
    dnd_html5(page, src, dst)
    wait_idle(page)

    after = get_project(page)
    new_tasks = [t["id"] for t in feature_by_id(after, fid)["tasks"]]  # type: ignore[index]
    assert new_tasks[0] == last_id, f"expected {last_id!r} at head, got {new_tasks!r}"
    assert set(new_tasks) == set(task_ids_before), "task set must be preserved"

    close_drawer(page)
    page.get_by_test_id("btn-undo").click()
    wait_idle(page)
    restored = get_project(page)
    ids_restored = [t["id"] for t in feature_by_id(restored, fid)["tasks"]]  # type: ignore[index]
    assert ids_restored == task_ids_before
    log(f"task-reorder DnD moved {last_id!r} to head and undoes cleanly")


TESTS = [
    test_open_via_click,
    test_open_via_context_menu,
    test_esc_closes,
    test_esc_closes_while_input_focused,
    test_outside_click_closes,
    test_label_edit_commits,
    test_label_edit_trims_and_ignores_blank,
    test_task_toggle_commits,
    test_task_add,
    test_task_add_trims_and_ignores_blank,
    test_task_delete,
    test_description_edit_commits_on_blur,
    test_effort_dropdown,
    test_milestone_dropdown,
    test_weeks_inputs,
    test_weeks_blank_input_does_not_corrupt_state,
    test_weeks_clamp_when_start_moves_past_end,
    test_add_dependency_via_drawer,
    test_delete_feature_from_drawer_footer,
    test_mobile_drawer_stacks_sections_and_keeps_footer_controls_visible,
    test_mobile_delete_actions_stay_visible_for_tasks_and_dependencies,
    test_task_delete_action_is_keyboard_focusable,
    test_feature_id_rename_cascades_to_deps,
    test_feature_id_rename_rejects_duplicate,
    test_feature_id_rename_esc_cancels_draft,
    test_task_reorder_via_drag_and_drop,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

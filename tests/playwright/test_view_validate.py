"""Validate view: mount, row structure, click opens drawer. Uses a custom seed
with all six issue categories so the panel is populated."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import (
    goto_view,
    log,
    run_suite,
    wait_idle,
)


# Crafted project with one issue of each kind.
SEED = {
    "meta": {
        "name": "Validate Seed",
        "description": "Fixture with deliberate issues.",
        "version": "0.0.1",
        "schemaVersion": 3,
        "today": 1,
        "milestones": [
            {"id": "v1", "label": "One"},
            {"id": "v2", "label": "Two"},
        ],
    },
    "modules": [
        {
            "id": "m1",
            "label": "Module One",
            "color": "#FF5A1F",
            "features": [
                {
                    # a: depends on unknown-dep "ghost", and has gantt-invalid
                    "id": "a",
                    "label": "Alpha",
                    "effort": "S",
                    "ms": "v1",
                    "ganttStart": 3,
                    "ganttEnd": 3,  # end ≤ start
                    "deps": [
                        {"id": "ghost", "reason": "missing feature", "type": "build"}
                    ],
                    "tasks": [],
                },
                {
                    # b depends on c (later ms) → dep-conflict
                    "id": "b",
                    "label": "Beta",
                    "effort": "S",
                    "ms": "v1",
                    "ganttStart": 0,
                    "ganttEnd": 1,
                    "deps": [
                        {"id": "c", "reason": "needs c built", "type": "build"}
                    ],
                    "tasks": [],
                },
                {
                    # c in later milestone → referenced above for conflict
                    "id": "c",
                    "label": "Gamma",
                    "effort": "XL",
                    "ms": "v2",
                    "ganttStart": 0,
                    "ganttEnd": 2,  # XL expected ~12, got 2 → gantt-effort-mismatch
                    "deps": [],
                    "tasks": [],
                },
                {
                    # orphan milestone (points to undefined)
                    "id": "d",
                    "label": "Delta",
                    "effort": "S",
                    "ms": "vX",
                    "ganttStart": 0,
                    "ganttEnd": 1,
                    "deps": [],
                    "tasks": [],
                },
                {
                    # e/f form a 2-cycle
                    "id": "e",
                    "label": "Epsilon",
                    "effort": "S",
                    "ms": "v1",
                    "ganttStart": 0,
                    "ganttEnd": 1,
                    "deps": [{"id": "f", "reason": "loop1", "type": "build"}],
                    "tasks": [],
                },
                {
                    "id": "f",
                    "label": "Zeta",
                    "effort": "S",
                    "ms": "v1",
                    "ganttStart": 0,
                    "ganttEnd": 1,
                    "deps": [{"id": "e", "reason": "loop2", "type": "build"}],
                    "tasks": [],
                },
            ],
        }
    ],
}


def test_view_mounts(page: Page) -> None:
    goto_view(page, "validate")
    assert page.get_by_test_id("view-validate").count() == 1
    log("validate view mounts")


def test_issue_rows_present(page: Page) -> None:
    goto_view(page, "validate")
    rows = page.locator('[data-testid="view-validate"] button')
    count = rows.count()
    assert count >= 1, f"expected issue rows with seeded fixtures, got {count}"
    log(f"validate panel lists {count} issues")


def test_unknown_dep_row_shown(page: Page) -> None:
    goto_view(page, "validate")
    rows = page.locator('[data-testid="view-validate"] button').all_inner_texts()
    combined = " | ".join(rows)
    assert "UNKNOWN-DEP" in combined, combined[:200]
    log("UNKNOWN-DEP row visible")


def test_gantt_invalid_row_shown(page: Page) -> None:
    goto_view(page, "validate")
    rows = page.locator('[data-testid="view-validate"] button').all_inner_texts()
    combined = " | ".join(rows)
    assert "GANTT-INVALID" in combined, combined[:200]
    log("GANTT-INVALID row visible")


def test_dep_cycle_row_shown(page: Page) -> None:
    goto_view(page, "validate")
    rows = page.locator('[data-testid="view-validate"] button').all_inner_texts()
    combined = " | ".join(rows)
    assert "DEP-CYCLE" in combined, combined[:200]
    log("DEP-CYCLE row visible")


def test_orphan_milestone_row_shown(page: Page) -> None:
    goto_view(page, "validate")
    rows = page.locator('[data-testid="view-validate"] button').all_inner_texts()
    combined = " | ".join(rows)
    assert "ORPHAN-MILESTONE" in combined, combined[:200]
    log("ORPHAN-MILESTONE row visible")


def test_click_issue_opens_drawer(page: Page) -> None:
    goto_view(page, "validate")
    first_enabled = page.locator(
        '[data-testid="view-validate"] button:not([disabled])'
    ).first
    first_enabled.click()
    page.wait_for_selector('[data-testid="dialog-task"]')
    page.keyboard.press("Escape")
    try:
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached", timeout=500)
    except Exception:
        page.keyboard.press("Escape")
        page.wait_for_selector('[data-testid="dialog-task"]', state="detached")
    log("clicking a validation row opens the feature drawer")


TESTS = [
    test_view_mounts,
    test_issue_rows_present,
    test_unknown_dep_row_shown,
    test_gantt_invalid_row_shown,
    test_dep_cycle_row_shown,
    test_orphan_milestone_row_shown,
    test_click_issue_opens_drawer,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS, seed=SEED))

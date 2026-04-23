"""External-change banner: responsive layout and action visibility."""
from __future__ import annotations

import sys

from playwright.sync_api import Page

from _lib import goto_view, log, run_suite


def _show_banner(page: Page) -> None:
    goto_view(page, "scope")
    page.evaluate(
        """() => {
            const store = window.__lodestarStore
            if (!store) throw new Error('window.__lodestarStore unavailable')
            store.setState({
                externalChangePending: true,
                saveStatus: 'conflict',
            })
        }"""
    )
    page.wait_for_selector('[data-testid="banner-external-change"]')


def _hide_banner(page: Page) -> None:
    page.evaluate(
        """() => {
            const store = window.__lodestarStore
            if (!store) throw new Error('window.__lodestarStore unavailable')
            store.setState({
                externalChangePending: false,
                saveStatus: 'saved',
            })
        }"""
    )
    page.wait_for_selector('[data-testid="banner-external-change"]', state="detached")


def test_banner_stacks_actions_on_narrow_screens(page: Page) -> None:
    page.set_viewport_size({"width": 390, "height": 844})
    _show_banner(page)

    banner = page.get_by_test_id("banner-external-change").bounding_box()
    reload_btn = page.get_by_test_id("banner-external-reload").bounding_box()
    keep_btn = page.get_by_test_id("banner-external-keep").bounding_box()

    assert banner is not None
    assert reload_btn is not None
    assert keep_btn is not None

    assert reload_btn["x"] >= banner["x"] - 1
    assert keep_btn["x"] >= banner["x"] - 1
    assert reload_btn["x"] + reload_btn["width"] <= banner["x"] + banner["width"] + 1
    assert keep_btn["x"] + keep_btn["width"] <= banner["x"] + banner["width"] + 1
    assert keep_btn["y"] > reload_btn["y"] + reload_btn["height"] / 2, (
        f"expected stacked mobile actions, got reload at {reload_btn['y']} and keep at {keep_btn['y']}"
    )

    _hide_banner(page)
    page.set_viewport_size({"width": 1280, "height": 900})
    log("external-change banner stacks and keeps actions visible on narrow screens")


TESTS = [
    test_banner_stacks_actions_on_narrow_screens,
]


if __name__ == "__main__":
    sys.exit(run_suite(__file__, TESTS))

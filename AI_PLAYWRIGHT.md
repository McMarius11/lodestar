# AI_PLAYWRIGHT — Test Hooks & Playwright Recipes

Lodestar is instrumented with stable `data-testid` attributes, ARIA roles, and
data-* state readouts so Playwright (or any DOM-driving bot) can drive **every
interaction** — including drag & drop, pointer drags, wheel zoom, and modal
flows — without relying on brittle CSS selectors or class names.

Read `AI_README.md` first for the code map. This file is the **surface map**:
everything an automated test can grab onto.

---

## Conventions

**Role assignment**

- Views are `role="tabpanel"` with `id="view-{id}"`.
- Tabs in the TopBar are `role="tab"` with `aria-selected`, `aria-controls`.
- Modals are `role="dialog"` with `aria-modal="true"` + `aria-labelledby`.
- Menus are `role="menu"` with `role="menuitem"` on items.
- The command palette input is `role="combobox"`, the result list is
  `role="listbox"` with `role="option"` children.

**Test IDs — prefixes**

| Prefix | Target |
|--------|--------|
| `tab-*` | TopBar view tabs |
| `btn-*` | Icon buttons in TopBar (undo/redo/create/command-palette) |
| `filter-status-*`, `filter-ms-*` | Filter pills |
| `view-*` | The tabpanel for a view (`view-scope`, `view-roadmap`, …) |
| `dialog-*` | Overlays (`dialog-task`, `dialog-module`, `dialog-help`, `dialog-command-palette`, …) |
| `roadmap-col-*`, `kanban-col-*` | DnD drop targets in Roadmap/Kanban |
| `context-menu`, `context-submenu` | Context menu portal |
| `menuitem-*`, `menuitem-submenu-*` | Individual menu items, slugged by label |
| `command-*` | Items inside the command palette |
| `banner-external-change` | "Disk changed" banner |

**State readouts (data-\*)**

Stored on host elements so tests can assert current state without relying on
visual inspection:

- `[data-testid="save-indicator"][data-save-status]` — `idle` / `saving` / `error`
- `[data-testid="view-mindmap"]` → contains `[data-testid="mindmap-canvas"]`
  with `data-mindmap-zoom`, `data-mindmap-pan-x`, `data-mindmap-pan-y`,
  `data-mindmap-panning`.
- `[data-testid="view-gantt"][data-gantt-zoom]` / `[data-gantt-week-w]` —
  current week column width in px.

**Feature/module/milestone targeting**

- `[data-feature-id="F001"]` — present on every visual feature representation
  in Scope, Roadmap, Kanban, Gantt (both label row and SVG bar), MindMap.
- `[data-module-id="M001"]` — on module cards (Scope) and mindmap module
  groups.
- `[data-milestone-id="v0.3"]` — on Roadmap columns and milestone editor rows.
- `[data-gantt-bar="F001"]`, `[data-gantt-resize="F001"]`,
  `[data-gantt-label="F001"]` — Gantt sub-elements.
- `[data-mindmap-node="F001"]`, `[data-mindmap-module="M001"]` — with live
  coords in `data-mindmap-x` / `data-mindmap-y`.

---

## Recipes

### Navigate views

```python
page.get_by_test_id("tab-roadmap").click()
page.wait_for_selector('[data-testid="view-roadmap"]')
```

### Apply filters

```python
page.get_by_test_id("filter-status-blocked").click()
# assert
assert page.get_by_test_id("filter-status-blocked").get_attribute("aria-pressed") == "true"
```

### Open a feature via context menu

```python
card = page.locator('[data-testid="view-scope"] [data-feature-id="F001"]')
card.click(button="right")
page.get_by_test_id("menuitem-open").click()
page.wait_for_selector('[data-testid="dialog-task"]')
```

### Undo / Redo

```python
page.get_by_test_id("btn-undo").click()
# or via palette
page.keyboard.press("Control+k")
page.get_by_test_id("command-palette-input").fill("undo")
page.keyboard.press("Enter")
```

### Save indicator

```python
indicator = page.get_by_test_id("save-indicator")
page.wait_for_function(
    "() => document.querySelector('[data-testid=save-indicator]').dataset.saveStatus === 'idle'"
)
```

---

## Drag & Drop — two flavours

Lodestar has **two different DnD mechanisms** and tests must match them:

### 1. HTML5 Drag & Drop API (Scope, Roadmap, Kanban)

These views use `draggable=true` + `onDragStart` / `onDrop` with
`dataTransfer.setData('text/lodestar-feature', id)`. Playwright's built-in
`drag_to()` handles this correctly, but **you must dispatch real DnD events**,
not just mouse events. Playwright does this automatically when you use
`locator.drag_to(target)`. For more control, use the JS bridge below.

```python
# Move a feature between milestone columns (Roadmap)
src = page.locator('[data-feature-id="F001"]').first
dst = page.get_by_test_id("roadmap-col-v0.4")
src.drag_to(dst)
```

**Programmatic DnD bridge** — for headless reliability, dispatch the events
directly via `page.evaluate`. **Crucially, you must yield a frame between
events** so React can flush `setDragId()` state before the drop handler runs —
otherwise the drop closes over stale `dragId === null` and is a no-op:

```python
page.evaluate("""
async ([fromSel, toSel]) => {
  const from = document.querySelector(fromSel);
  const to = document.querySelector(toSel);
  const dt = new DataTransfer();
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  await frame(); await frame();
  to.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
  await frame();
  to.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
  await frame();
  from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
}
""", ['[data-feature-id="F001"]', '[data-testid="roadmap-col-v0.4"]'])
```

Playwright's `locator.drag_to(target)` works for some apps but reliably **fails
on Lodestar's Roadmap/Kanban** because it dispatches the synthetic events in
the same microtask — bypass it and use the evaluate bridge above.

### 2. Pointer events (Gantt bars, MindMap nodes, MindMap pan)

These use `onPointerDown` / `onPointerMove` / `onPointerUp` with
`setPointerCapture`. Use Playwright's `mouse` API — the browser synthesises
pointer events automatically:

```python
# Drag a Gantt bar 3 weeks to the right
bar = page.locator('[data-gantt-bar="F001"]')
box = bar.bounding_box()
week_w = float(page.get_by_test_id("view-gantt").get_attribute("data-gantt-week-w"))
page.mouse.move(box["x"] + 10, box["y"] + box["height"] / 2)
page.mouse.down()
page.mouse.move(box["x"] + 10 + week_w * 3, box["y"] + box["height"] / 2, steps=10)
page.mouse.up()

# Resize a Gantt bar's right edge
handle = page.locator('[data-gantt-resize="F001"]')
hbox = handle.bounding_box()
page.mouse.move(hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2)
page.mouse.down()
page.mouse.move(hbox["x"] + hbox["width"] / 2 + week_w * 2, hbox["y"] + hbox["height"] / 2, steps=8)
page.mouse.up()

# Drag a MindMap node
node = page.locator('[data-mindmap-node="F001"]')
nbox = node.bounding_box()
page.mouse.move(nbox["x"] + nbox["width"] / 2, nbox["y"] + nbox["height"] / 2)
page.mouse.down()
page.mouse.move(nbox["x"] + 120, nbox["y"] + 80, steps=10)
page.mouse.up()
```

---

## Zoom / wheel

### MindMap zoom

Mind map zoom lives on the canvas. Read it back via `data-mindmap-zoom`:

```python
canvas = page.get_by_test_id("mindmap-canvas")
cbox = canvas.bounding_box()
# Zoom in at center
page.mouse.move(cbox["x"] + cbox["width"] / 2, cbox["y"] + cbox["height"] / 2)
page.mouse.wheel(0, -400)  # negative dy = zoom in
zoom = float(canvas.get_attribute("data-mindmap-zoom"))
assert zoom > 1
```

### MindMap pan

```python
canvas = page.get_by_test_id("mindmap-canvas")
cbox = canvas.bounding_box()
page.mouse.move(cbox["x"] + 50, cbox["y"] + 50)
page.mouse.down()
page.mouse.move(cbox["x"] + 250, cbox["y"] + 180, steps=10)
page.mouse.up()
assert float(canvas.get_attribute("data-mindmap-pan-x")) != 0
```

### Gantt zoom (ctrl+wheel)

```python
gantt = page.get_by_test_id("view-gantt")
gbox = gantt.bounding_box()
page.keyboard.down("Control")
page.mouse.move(gbox["x"] + gbox["width"] / 2, gbox["y"] + gbox["height"] / 2)
page.mouse.wheel(0, -300)
page.keyboard.up("Control")
new_w = float(gantt.get_attribute("data-gantt-zoom"))
```

---

## Command palette

```python
page.keyboard.press("Control+k")
inp = page.get_by_test_id("command-palette-input")
inp.fill("roadmap")
# pick the first result (listbox option)
page.locator('[role="option"]').first.click()
page.wait_for_selector('[data-testid="view-roadmap"]')
```

## Context menus

Every view has context menus. Empty-area right-click → "new feature", on-item
right-click → actions. Menu items are test-id-addressable by slugged label:

```python
feat = page.locator('[data-testid="view-kanban"] [data-feature-id="F001"]')
feat.click(button="right")
page.wait_for_selector('[data-testid="context-menu"]')
# submenu
page.get_by_test_id("menuitem-submenu-move-to-milestone").hover()
page.wait_for_selector('[data-testid="context-submenu"]')
page.locator('[data-testid="context-submenu"] [data-testid="menuitem-v0-4"]').click()
```

## Task drawer

```python
page.locator('[data-feature-id="F001"]').first.click()
drawer = page.get_by_test_id("dialog-task")
drawer.wait_for()
# rename
drawer.get_by_test_id("drawer-feature-label").fill("New label")
page.keyboard.press("Escape")  # close
```

---

## The `data/lodestar-v0.3.json` live-edit trick

Because Electron dev-mode reads `./data/project.json`, a Playwright test can
write the project file directly to seed deterministic state before driving the
UI. The file watcher will reload the app. Wait for the tab label to change or
for the save-indicator to settle before asserting.

```python
import json, pathlib
pathlib.Path("data/project.json").write_text(json.dumps(seed))
page.wait_for_function(
    "() => document.querySelector('[data-testid=save-indicator]').dataset.saveStatus !== 'saving'"
)
```

When using a web/dev build against `localStorage`, use `page.evaluate` to set
the key `projekt-planner:project:v1` before reload instead.

---

## Things without test hooks (yet)

- Welcome screen's "Load sample" / "Open file" buttons — address by button text.
- Inline edit inputs in MilestoneRow / module cards — address by surrounding
  `data-milestone-id` / `data-module-id` then chain to `input`.
- Gantt dep arrows are `<path>` children of `<g data-feature-id>` — no arrow
  hook yet, but dep presence is readable in the store.

Extend `data-testid`s as new interactions are added — **never** couple tests to
Tailwind class strings or DOM structure.

import type { Project } from '@/types'

/**
 * Dogfood sample: the v0.3.0 roadmap of Lodestar itself, modelled in Lodestar.
 * Used as a second built-in example on the welcome screen so new users can see
 * a real project with every interaction pattern the app supports.
 */
export const lodestarRoadmap: Project = {
  meta: {
    name: 'Lodestar v0.3',
    description:
      'Hands-on edit pass: context menus everywhere, drag & drop in 4 of 5 views, a cleaner TopBar. This project is the plan for v0.3 modelled in Lodestar itself — it is both the to-do list and the demo.',
    version: '0.3.0',
    schemaVersion: 3,
    today: 3,
    milestones: [
      { id: 'v0.3.1', label: 'Foundation' },
      { id: 'v0.3.2', label: 'Context Menus' },
      { id: 'v0.3.3', label: 'Drag & Drop' },
      { id: 'v0.3.4', label: 'Polish' },
    ],
  },
  modules: [
    {
      id: 'store',
      label: 'Store + Schema',
      color: '#8A867A',
      features: [
        {
          id: 'schema-v3',
          label: 'Schema bump v2 → v3',
          description:
            'Add optional `Feature.rank` so Kanban ordering within a column survives an app restart. Migration is a no-op bump: existing projects load unchanged and write back as v3 on next save.',
          effort: 'S',
          ms: 'v0.3.1',
          ganttStart: 0,
          ganttEnd: 1,
          deps: [],
          tasks: [
            { id: 't1', label: 'Extend FeatureSchema with rank?', done: true },
            { id: 't2', label: 'Bump SCHEMA_VERSION to 3', done: true },
            { id: 't3', label: 'No-op v2→v3 migrate() branch', done: true },
            { id: 't4', label: 'Update sample + example JSON', done: true },
          ],
        },
        {
          id: 'store-actions',
          label: 'Store actions for interactivity',
          description:
            'Extend the Zustand store with the actions the new UI needs: clone feature/module, move feature between modules and milestones, Gantt bar commit, Kanban rank + re-normalize, MindMap node override.',
          effort: 'M',
          ms: 'v0.3.1',
          ganttStart: 0,
          ganttEnd: 2,
          deps: [
            { id: 'schema-v3', reason: 'setKanbanRank writes Feature.rank', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'cloneFeature / cloneModule', done: true },
            { id: 't2', label: 'moveFeatureToModule / moveFeatureToMs', done: true },
            { id: 't3', label: 'setFeatureGantt (one undo per drag)', done: true },
            { id: 't4', label: 'setKanbanRank + normalizeKanbanRanks', done: true },
            { id: 't5', label: 'mindmapOverrides session state', done: true },
          ],
        },
      ],
    },
    {
      id: 'ctx',
      label: 'Context Menus',
      color: '#C4845C',
      features: [
        {
          id: 'ctx-primitive',
          label: 'ContextMenu primitive',
          description:
            'Portal-based floating menu with viewport-aware positioning, keyboard nav (↑↓ Enter, →← for submenus), Escape / outside-click / blur close. Shared visual language with the Command Palette.',
          effort: 'M',
          ms: 'v0.3.1',
          ganttStart: 1,
          ganttEnd: 3,
          deps: [],
          tasks: [
            { id: 't1', label: 'useContextMenu hook + portal', done: true },
            { id: 't2', label: 'Submenu support', done: true },
            { id: 't3', label: 'Keyboard navigation', done: true },
            { id: 't4', label: 'Viewport-aware anchor', done: true },
          ],
        },
        {
          id: 'ctx-actions',
          label: 'Shared feature/module action sets',
          description:
            'Factory that returns the same set of menu items for every view: Open · Rename · Duplicate · Move to Module ▸ · Move to Milestone ▸ · Set Status ▸ · Copy ID · Delete. Empty-area menu handles *new feature in this bucket*.',
          effort: 'M',
          ms: 'v0.3.2',
          ganttStart: 2,
          ganttEnd: 4,
          deps: [
            { id: 'ctx-primitive', reason: 'Builds on the menu primitive', type: 'build' },
            { id: 'store-actions', reason: 'Wraps clone/move actions', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'featureMenu() factory', done: true },
            { id: 't2', label: 'moduleMenu() factory', done: true },
            { id: 't3', label: 'emptyAreaMenu() factory', done: true },
            { id: 't4', label: 'Wire menus in all 5 views', done: true },
          ],
        },
        {
          id: 'ctx-keyboard',
          label: 'Keyboard triggers',
          description:
            'Shift+F10 opens the context menu for the cursor feature. F2 renames, ⌘D duplicates. Arrow-key cursor navigation already existed; these layer on top of it.',
          effort: 'S',
          ms: 'v0.3.2',
          ganttStart: 3,
          ganttEnd: 4,
          deps: [
            { id: 'ctx-actions', reason: 'Reuses menu item logic', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'F2 = rename cursor feature', done: true },
            { id: 't2', label: '⌘D = duplicate cursor feature', done: true },
            { id: 't3', label: 'Shift+F10 = open menu', done: false },
          ],
        },
      ],
    },
    {
      id: 'dnd',
      label: 'Drag & Drop',
      color: '#5C8AC4',
      features: [
        {
          id: 'dnd-roadmap',
          label: 'Roadmap DnD between milestones',
          description:
            'Drag a feature card from one milestone column to another to change its `ms`. Highlights the target column on hover. HTML5 DnD with a typed MIME (`text/lodestar-feature`).',
          effort: 'S',
          ms: 'v0.3.3',
          ganttStart: 3,
          ganttEnd: 4,
          deps: [
            { id: 'store-actions', reason: 'moveFeatureToMs', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'Typed dataTransfer MIME', done: true },
            { id: 't2', label: 'Column hover highlight', done: true },
            { id: 't3', label: 'Commit on drop', done: true },
          ],
        },
        {
          id: 'dnd-kanban',
          label: 'Kanban within-column rank',
          description:
            'Reorder cards inside a status column by dragging. Rank is persisted on `Feature.rank` (schema v3), computed as the midpoint between neighbours; re-normalized to whole numbers when the gap drops below 0.001 to prevent float drift.',
          effort: 'M',
          ms: 'v0.3.3',
          ganttStart: 3,
          ganttEnd: 5,
          deps: [
            { id: 'schema-v3', reason: 'Persists rank on the feature', type: 'build' },
            { id: 'store-actions', reason: 'setKanbanRank + normalize', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'Drop indicators above/below cards', done: true },
            { id: 't2', label: 'Midpoint rank computation', done: true },
            { id: 't3', label: 'Normalize on drift', done: true },
            { id: 't4', label: 'Survives app restart', done: true },
          ],
        },
        {
          id: 'dnd-gantt',
          label: 'Gantt bar drag + resize',
          description:
            'Drag the whole bar horizontally to shift start+end by ΔWeeks. A 4px handle on the right edge resizes the end only. Default snaps to whole weeks; hold Shift for half-week precision. One undo step per drag-end.',
          effort: 'L',
          ms: 'v0.3.3',
          ganttStart: 4,
          ganttEnd: 6,
          deps: [
            { id: 'store-actions', reason: 'setFeatureGantt commit', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'Pointer-capture drag handler', done: true },
            { id: 't2', label: 'Right-edge resize handle', done: true },
            { id: 't3', label: 'Shift = half-week snap', done: true },
            { id: 't4', label: '4px threshold vs click', done: true },
          ],
        },
        {
          id: 'dnd-mindmap',
          label: 'MindMap node drag',
          description:
            'Drag feature and module nodes off the auto-layout point. Overrides are session-only so adding or removing a feature can re-layout cleanly. A RESET POSITIONS control appears once any node has been moved.',
          effort: 'M',
          ms: 'v0.3.3',
          ganttStart: 4,
          ganttEnd: 6,
          deps: [
            { id: 'store-actions', reason: 'mindmapOverrides state', type: 'build' },
          ],
          tasks: [
            { id: 't1', label: 'Node pointer handler', done: true },
            { id: 't2', label: 'Override > auto-layout resolution', done: true },
            { id: 't3', label: 'Dashed stroke on moved nodes', done: true },
            { id: 't4', label: 'RESET POSITIONS button', done: true },
          ],
        },
      ],
    },
    {
      id: 'topbar',
      label: 'TopBar Clean',
      color: '#7A7A7A',
      features: [
        {
          id: 'topbar-clean',
          label: 'Remove global add buttons, compact save indicator',
          description:
            'Drop the global `+ FEAT / + MOD / MS` button row — those are object-bound actions and now live on right-click. Compact the save indicator to a single dot with a tooltip. Rename the `Validate` tab to `Status`.',
          effort: 'S',
          ms: 'v0.3.1',
          ganttStart: 1,
          ganttEnd: 2,
          deps: [
            { id: 'ctx-actions', reason: 'Context menus replace global buttons', type: 'runtime' },
          ],
          tasks: [
            { id: 't1', label: 'Remove +FEAT/+MOD/MS row', done: true },
            { id: 't2', label: 'Compact save indicator', done: true },
            { id: 't3', label: 'Rename Validate → Status', done: true },
            { id: 't4', label: 'Undo-depth tooltip', done: true },
          ],
        },
      ],
    },
    {
      id: 'scope',
      label: 'Scope UX',
      color: '#A45C5C',
      features: [
        {
          id: 'scope-click',
          label: 'Single-click → drawer, chevron → inline',
          description:
            'The double-click-to-open-drawer pattern was undiscoverable. Single-click on a feature row now opens the drawer; a chevron in the first column toggles the inline task list.',
          effort: 'S',
          ms: 'v0.3.2',
          ganttStart: 2,
          ganttEnd: 3,
          deps: [],
          tasks: [
            { id: 't1', label: 'Chevron toggle column', done: true },
            { id: 't2', label: 'Row single-click → openDrawer', done: true },
            { id: 't3', label: 'onContextMenu on row', done: true },
          ],
        },
      ],
    },
    {
      id: 'drawer',
      label: 'Drawer',
      color: '#9C5C9C',
      features: [
        {
          id: 'drawer-desc',
          label: 'Description always-edit',
          description:
            'The preview/edit toggle on the description field was a hidden mode. The textarea is now always visible; the markdown preview renders live underneath when there is content.',
          effort: 'S',
          ms: 'v0.3.4',
          ganttStart: 5,
          ganttEnd: 6,
          deps: [],
          tasks: [
            { id: 't1', label: 'Remove mode toggle', done: true },
            { id: 't2', label: 'Live preview below textarea', done: true },
          ],
        },
      ],
    },
    {
      id: 'welcome',
      label: 'Welcome Re-entry',
      color: '#5C9C9C',
      features: [
        {
          id: 'welcome-close',
          label: 'Close current project',
          description:
            'A *Close current project…* entry in the Command Palette returns the user to the welcome screen without touching the file on disk. Fixes the one-way-door feel of the current welcome flow.',
          effort: 'S',
          ms: 'v0.3.4',
          ganttStart: 5,
          ganttEnd: 6,
          deps: [],
          tasks: [
            { id: 't1', label: 'closeCurrentProject() store action', done: true },
            { id: 't2', label: 'Command Palette entry', done: true },
            { id: 't3', label: 'Confirm dialog', done: true },
          ],
        },
        {
          id: 'welcome-sample',
          label: 'v0.3 roadmap as built-in sample',
          description:
            'A second sample button on the welcome screen loads this very project — the Lodestar v0.3 roadmap modelled in Lodestar. Dogfooding as first-run experience.',
          effort: 'S',
          ms: 'v0.3.4',
          ganttStart: 5,
          ganttEnd: 6,
          deps: [],
          tasks: [
            { id: 't1', label: 'lodestarRoadmap.ts sample file', done: true },
            { id: 't2', label: 'loadLodestarRoadmap() store action', done: true },
            { id: 't3', label: 'Second button on WelcomeScreen', done: true },
          ],
        },
      ],
    },
    {
      id: 'mind',
      label: 'MindMap Polish',
      color: '#5CA47A',
      features: [
        {
          id: 'mind-hint',
          label: 'First-visit hint',
          description:
            'A 6-second toast near the bottom of the MindMap on first visit: "Wheel zoom · Drag pan · Drag nodes · Dbl-click reset". Remembered via localStorage flag `lodestar:mindmap-hint-seen`.',
          effort: 'S',
          ms: 'v0.3.4',
          ganttStart: 5,
          ganttEnd: 6,
          deps: [
            { id: 'dnd-mindmap', reason: 'Hint mentions node drag', type: 'runtime' },
          ],
          tasks: [
            { id: 't1', label: 'localStorage flag check', done: true },
            { id: 't2', label: 'Auto-dismiss after 6s', done: true },
          ],
        },
      ],
    },
    {
      id: 'polish',
      label: 'Misc Polish',
      color: '#BBA060',
      features: [
        {
          id: 'polish-zoom',
          label: 'Web-zoom factor stable decimals',
          description:
            'Persist the zoom factor via `Number(v.toFixed(2))` so `localStorage` shows `1.2` instead of `1.2000000000000002`.',
          effort: 'S',
          ms: 'v0.3.1',
          ganttStart: 1,
          ganttEnd: 2,
          deps: [],
          tasks: [
            { id: 't1', label: 'toFixed(2) on persist', done: true },
          ],
        },
        {
          id: 'polish-ms-editor',
          label: 'Milestone editor as centered modal',
          description:
            'The milestone editor used to pop out of the `MS` button as a popover while the project-meta editor was a centered modal — inconsistent. Now both are centered modals.',
          effort: 'S',
          ms: 'v0.3.1',
          ganttStart: 2,
          ganttEnd: 3,
          deps: [],
          tasks: [
            { id: 't1', label: 'Port to portal + overlay', done: true },
          ],
        },
        {
          id: 'polish-verify',
          label: 'Verification sweep',
          description:
            'Final sign-off: typecheck, unit tests, Playwright regression (with selectors updated for the removed TopBar buttons), electron:build for AppImage + exe, dogfood JSON round-trip.',
          effort: 'M',
          ms: 'v0.3.4',
          ganttStart: 6,
          ganttEnd: 7,
          deps: [
            { id: 'dnd-kanban', reason: 'Test rank persistence', type: 'runtime' },
            { id: 'dnd-gantt', reason: 'Test bar commit undo', type: 'runtime' },
            { id: 'welcome-sample', reason: 'Test Zod round-trip on sample', type: 'runtime' },
          ],
          tasks: [
            { id: 't1', label: 'npm run typecheck', done: false },
            { id: 't2', label: 'npm test', done: false },
            { id: 't3', label: 'Playwright regression', done: false },
            { id: 't4', label: 'electron:build AppImage + exe', done: false },
          ],
        },
      ],
    },
  ],
}

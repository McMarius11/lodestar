# Lodestar

Local-first, file-based project planner for software work.
Five synced views over a single `data/project.json`, no backend, no database.

- **Scope** — module cards with features + tasks
- **Roadmap** — milestone columns
- **Kanban** — backlog / in-progress / done
- **Mind Map** — radial constellation
- **Gantt** — weeks, bars, dep arrows

## Stack

Electron · Vite · React 18 · TypeScript · Zustand · Tailwind · Zod · Framer Motion.
See [Built with](#built-with) below for the full list.

## Dev

```bash
npm install
npm run dev            # web-only (Vite)
npm run electron:dev   # starts Vite + Electron
npm run build
npm run electron:build # produces AppImage / exe / dmg
```

## Data

Everything lives in `data/project.json`. Edit it in the UI or let Claude
edit it directly — the app watches the file and re-loads on external
changes. In the browser build, the same data goes to `localStorage`.

Schema is validated with Zod on every load and save; invalid shapes are
migrated or rejected instead of silently corrupting state.

### Getting started

`data/project.json` is git-ignored so it doesn't clobber your work.
To seed a fresh checkout, copy the bundled example:

```bash
cp data/project.example.json data/project.json
```

The example (`Nimbus`) is a self-hosted cloud storage project with
6 modules, 5 milestones and a couple of intentional dep conflicts so
the validation panel has something to show.

If `data/project.json` is missing, the app falls back to the same sample
data in memory — so you can also just run it and export later.

## Keyboard

| Action | Key |
| --- | --- |
| Command palette | ⌘K / Ctrl+K |
| Undo / Redo | ⌘Z / ⇧⌘Z |
| Close drawer / palette | Esc |

## Editing with Claude

Claude can edit `data/project.json` directly. Examples:

```
"Add a feature 'OAuth2 provider' to the Auth module, effort M, v0.2"
"Move all v0.3 features to v0.4 — we need more time"
"Sync Engine needs a runtime dep on Metadata Index"
"Show me every feature with a dep conflict"
```

On save, the file watcher pushes the change back into the UI.

## Built with

**Runtime**

- [React 18](https://react.dev) — UI
- [Zustand](https://github.com/pmndrs/zustand) + [Immer](https://github.com/immerjs/immer) — state with 50-step undo
- [Zod](https://zod.dev) — schema validation & migration
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Framer Motion](https://www.framer.com/motion/) — drawer / overlay transitions
- [nanoid](https://github.com/ai/nanoid) + [clsx](https://github.com/lukeed/clsx) — small utilities

**Build & desktop**

- [Vite](https://vitejs.dev) + [TypeScript](https://www.typescriptlang.org) (strict)
- [Electron](https://www.electronjs.org) + [electron-builder](https://www.electron.build)

**Fonts**

- [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) — display (SIL OFL)
- [Geist & Geist Mono](https://vercel.com/font) — body & labels (SIL OFL)

Design and code co-developed with [Claude Code](https://claude.com/claude-code).

## License

MIT — see [LICENSE](./LICENSE).

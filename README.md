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
"Security Policy needs a runtime dep on Certificates"
"Show me every feature with a dep conflict"
```

On save, the file watcher pushes the change back into the UI.

## License

MIT — do whatever.

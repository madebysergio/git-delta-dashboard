# Git Delta Dashboard

Minimal, delta-first dashboard for local Git repository state.

## Overview

Git Delta Dashboard is a lightweight web app that visualizes meaningful repository deltas without exposing terminal output directly in the UI.

The interface is designed for quick scanning:
- Only non-zero change groups are shown (except staged/unstaged, which are always visible)
- A single group can be expanded at a time
- Expanded groups auto-collapse when their count resolves to zero

## Features

- Live Git state API (`/api/state`) using `isomorphic-git`
- Vite + React + TypeScript frontend
- In-app branch controls:
  - switch to existing branches
  - create and switch to a new branch
- Delta counters for:
  - `staged`
  - `unstaged`
  - `untracked`
  - `ahead/commits`
  - `behind`
- Expandable detail panes:
  - file lists for staged/unstaged/untracked
  - commit lists for ahead/behind with per-commit file mapping
- In-app Git actions:
  - stage all
  - unstage all
  - stage/unstage individual files
  - commit (modal input required)
  - push when ahead
- Ignore-aware untracked counting (`git.isIgnored`)
- Dark mode toggle with persisted preference (`localStorage`)

## Tech Stack

- Node.js
- Express (API backend)
- isomorphic-git
- React + TypeScript
- Vite
- Tailwind CSS (via Vite CSS import)

## Project Structure

- `server.ts` - Express API server and Git state service
- `src/App.tsx` - Dashboard UI
- `src/main.tsx` - React entrypoint
- `src/styles.css` - Tailwind import + dark variant
- `src/types.ts` - UI data types
- `vite.config.ts` - Vite config + API proxy
- `tsconfig.json` - TypeScript config

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This runs:
- Express API on `http://localhost:4173`
- Vite frontend on `http://localhost:5173` (with `/api` proxied to Express)

## Production Build

```bash
npm run build
npm run start
```

- `npm run build` outputs frontend assets to `dist/`
- `npm run start` serves API + built frontend via Express

## Scripts

- `npm run dev` - run API + Vite in parallel
- `npm run dev:api` - run Express API server only
- `npm run dev:web` - run Vite frontend only
- `npm run build` - Vite production build
- `npm run preview` - preview built Vite app
- `npm run start` - run Express server (serves `dist` if present)

## API

### `GET /api/state`

Returns repository state with counters and details.

### `GET /api/version`

Returns a frontend asset version token used for auto-reload checks.

### `GET /api/branches`

Returns available local branches and current branch.

### `POST /api/checkout`

Switches branch, or creates + switches when `create: true`.

### `POST /api/add-all`

Stages changes using Git semantics (`git add -A` behavior).

### `POST /api/unstage-all`

Unstages tracked staged changes.

### `POST /api/file-stage`

Stages or unstages a single file.

### `POST /api/commit`

Creates a commit from staged changes (`message` required).

### `POST /api/push`

Pushes local commits to the configured remote.

## Notes

- If `dist/` is missing and you run `npm run start`, frontend routes return a build-not-found error.
- In development, use `http://localhost:5173` for the UI.

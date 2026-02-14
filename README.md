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
- Delta counters for:
  - `staged`
  - `unstaged`
  - `untracked`
  - `ahead/commits`
  - `behind`
- Expandable detail panes:
  - file lists for staged/unstaged/untracked
  - commit lists for ahead/behind with per-commit file mapping
- Commits feed push-state indicators:
  - `READY FOR PUSH` for local unpushed commits
  - `PUSHED` for commits already on remote
  - `LAST PUSH ...` relative-time status in sort row
- In-app branch controls:
  - switch branch
  - create and switch branch
- In-app Git actions:
  - stage all
  - unstage all
  - stage/unstage single file
  - commit
  - push
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

Returns branch list and current branch for branch switching UI.

### `POST /api/checkout`

Switches to an existing branch or creates + switches when requested.

### `POST /api/add-all`

Stages all tracked/untracked changes (`git add -A` semantics).

### `POST /api/unstage-all`

Unstages tracked staged changes.

### `POST /api/file-stage`

Stages or unstages an individual file.

### `POST /api/commit`

Creates a commit from staged changes (`message` required).

### `POST /api/push`

Pushes local commits to remote.
If branch has no upstream, server retries with:
`git push --set-upstream origin <current-branch>`.

## Notes

- If `dist/` is missing and you run `npm run start`, frontend routes return a build-not-found error.
- In development, use `http://localhost:5173` for the UI.

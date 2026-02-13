# Git Delta Dashboard

Minimal, delta-first dashboard for local Git repository state.

## Overview

Git Delta Dashboard is a lightweight web app that visualizes meaningful repository deltas without exposing terminal output directly in the UI.

The interface is designed for quick scanning:
- Only non-zero change groups are shown
- A single group can be expanded at a time
- Expanded groups auto-collapse when their count resolves to zero

## Features

- Live Git state API (`/api/state`) using `isomorphic-git`
- Delta counters for:
  - `staged`
  - `modified`
  - `untracked`
  - `ahead` (unpushed)
  - `behind` (unpulled)
- Expandable detail panes:
  - file lists for staged/modified/untracked
  - commit lists for ahead/behind
- Ignore-aware untracked counting (`git.isIgnored`)
- Tailwind-based UI
- Dark mode toggle with persisted preference (`localStorage`)

## Tech Stack

- Node.js
- Express
- isomorphic-git
- Tailwind CSS v4 (`@tailwindcss/cli`)
- React frontend

## Project Structure

- `server.js` - Express server and Git state service
- `public/index.html` - App shell
- `public/main.js` - UI rendering and interactions
- `public/styles.css` - Generated Tailwind output
- `tailwind.css` - Tailwind input stylesheet
- `.gitignore` - Ignore rules for dependencies and macOS artifacts

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open:

```text
http://localhost:4173
```

## Scripts

- `npm run build:css` - Generate `public/styles.css` from `tailwind.css`
- `npm run dev` - Build CSS then start server
- `npm run start` - Build CSS then start server

## API

### `GET /api/state`

Returns a JSON payload:

```json
{
  "repository": "git-delta-dashboard",
  "branch": "main",
  "counts": {
    "staged": 0,
    "modified": 0,
    "untracked": 0,
    "ahead": 0,
    "behind": 0
  },
  "details": {
    "staged": [],
    "modified": [],
    "untracked": [],
    "ahead": [],
    "behind": []
  }
}
```

Optional query parameter:
- `repo`: absolute or relative path to a target repository

Example:

```text
/api/state?repo=/path/to/repo
```

## UI Behavior Rules

- Show only non-zero counters
- Click a counter to expand its section
- Hide section when count reaches zero
- Do not render full diffs or verbose logs

## Dark Mode

- Toggle button in header switches light/dark theme
- Preference key: `git-dashboard-theme`
- Defaults to system preference when no saved preference exists

## Notes

- `public/styles.css` is generated. Rebuild when changing classes in `public/main.js` or `public/index.html`.
- Untracked count excludes Git-ignored files.

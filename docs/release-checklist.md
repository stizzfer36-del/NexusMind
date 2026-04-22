# NexusMind Release Checklist

Phase 15 — Hardening & Release Verification

Use this document before cutting any release. Work through each section top-to-bottom. Every checkbox must pass before the build is shipped. Commands are run from the repo root unless noted otherwise.

---

## Pre-flight

Ensure the workspace is in a known-good state before running anything else.

- [ ] Repo is on a clean commit — no uncommitted changes, no untracked files

  ```bash
  git status
  # Expected: "nothing to commit, working tree clean"
  ```

- [ ] pnpm version is 9.x

  ```bash
  pnpm --version
  # Expected: 9.x.x
  ```

- [ ] Node version is 20 or higher

  ```bash
  node --version
  # Expected: v20.x.x or higher
  ```

- [ ] All workspace dependencies are installed and up to date

  ```bash
  pnpm install
  # Expected: exits 0, no peer-dep errors
  ```

---

## TypeScript compile

All packages must type-check cleanly with zero errors.

- [ ] `@nexusmind/shared` compiles without errors

  ```bash
  pnpm --filter @nexusmind/shared exec tsc --noEmit
  # Expected: exits 0, no output
  ```

- [ ] `@nexusmind/desktop` compiles without errors

  ```bash
  pnpm --filter @nexusmind/desktop exec tsc --noEmit
  # Expected: exits 0, no output
  ```

- [ ] `@nexusmind/cli` compiles without errors

  ```bash
  pnpm --filter @nexusmind/cli exec tsc --noEmit
  # Expected: exits 0, no output
  ```

---

## Dev run

Verify the development build boots cleanly.

- [ ] `pnpm dev` starts the Electron app without errors in the terminal

  ```bash
  pnpm dev
  # Expected: Vite dev server starts, Electron window opens, no red error output
  ```

- [ ] App window opens and the title bar reads "NexusMind"
- [ ] No uncaught errors in the terminal output on startup
- [ ] Open DevTools (`Ctrl+Shift+I`) — Console tab shows no red errors on startup
- [ ] Sidebar navigation works: click each icon in turn and confirm the correct panel loads

  > Panels to verify: Terminal, Kanban, Swarm, Memory, Replay, Settings, Bench, Graph, Guard, Voice

---

## Packaged build

- [ ] Desktop build exits cleanly

  ```bash
  pnpm build:desktop
  # Expected: exits 0; output in apps/desktop/out/
  ```

- [ ] Installer is produced by the dist step

  ```bash
  pnpm dist:desktop
  # Expected: exits 0; produces NexusMind-*.AppImage (Linux) or equivalent in apps/desktop/dist/
  ```

- [ ] `apps/desktop/dist/` contains the installer artifact and `builder-debug.yml`

---

## Subsystem: Swarm

- [ ] Navigate to the Swarm panel
- [ ] Empty state is shown — no sessions listed, placeholder copy visible
- [ ] Create a new session:
  - Enter a short goal in the text field (e.g., "Write a hello-world script")
  - Click **Launch**
- [ ] New session appears in the session sidebar with a name derived from the goal
- [ ] Progress indicator (spinner or progress bar) advances after launch
- [ ] Messages appear in the output log as the session runs
- [ ] **Stop** button is clickable and halts execution — status changes to stopped/idle
- [ ] Stopped session persists in the sidebar and can be reviewed

---

## Subsystem: Replay

- [ ] Run a Swarm session first (creates the event log needed for replay)
- [ ] Navigate to the Replay panel
- [ ] Completed session appears in the Replay sidebar
- [ ] Click the session — event timeline renders with individual event entries
- [ ] **Play** button starts playback; events advance one by one in the timeline
- [ ] Speed control cycles correctly: 1x → 5x → 10x → 50x; playback tempo changes visibly
- [ ] Pause during playback — timeline stops advancing
- [ ] Resume after pause — timeline continues from where it stopped
- [ ] **Delete session** removes it from the sidebar and clears the timeline

---

## Subsystem: Bench

- [ ] Navigate to the Bench panel
- [ ] Task list loads — seed tasks are visible (at least one row present)
- [ ] Dimension filter (Quality / Speed / Cost / etc.) narrows the task list when selected
- [ ] Enter a model ID and provider in the model selector, click **Set Model** — header reflects the new model
- [ ] Run a single task:
  - Click **Run** on one task
  - Result row appears below the task with a score bar and numeric score
- [ ] **Run All** batch:
  - Click **Run All**
  - Tasks execute sequentially; each produces a result row
- [ ] Expand a result row — token counts (prompt / completion) and response preview are visible
- [ ] Results persist after navigating away and returning to Bench

---

## Subsystem: Graph

- [ ] Navigate to the Graph panel
- [ ] Empty state is shown — no workflows listed, canvas is blank with placeholder text
- [ ] Load a template:
  - Select a built-in template from the template picker
  - DAG renders on the canvas with nodes and edges
- [ ] Drag a node — node moves to the new position, edges re-route correctly
- [ ] Click a node — inspector panel on the right shows the node's properties
- [ ] Save the DAG:
  - Click **Save** (or equivalent)
  - Workflow appears in the sidebar list with a name
- [ ] Execute the DAG:
  - Click **Execute** (or equivalent)
  - Execution proceeds and node statuses update, OR an error is shown gracefully if no backend is configured

---

## Subsystem: Guard

- [ ] Navigate to the Guard panel
- [ ] Empty state is shown — no scan runs listed
- [ ] Click **Run Scan**:
  - Scan runs and a results table appears, OR a graceful error is shown if scanners (semgrep, npm-audit, trufflehog) are not installed
- [ ] If findings are returned:
  - Findings table shows columns for file, rule, severity, and source
  - Severity filter (LOW / MEDIUM / HIGH / CRITICAL) narrows results
  - Source filter (semgrep / npm-audit / trufflehog) narrows results
- [ ] If no findings: "No findings" message is displayed (not a crash or blank screen)
- [ ] Policy config section at the bottom of the panel is editable (text inputs accept input)
- [ ] Scan history: previous run is listed when a second scan is triggered

---

## Subsystem: Voice

- [ ] Navigate to the Voice panel
- [ ] Session initialises — status indicator shows (e.g., "Ready" or "Idle")
- [ ] Push **Space** (or click the push-to-talk button) — recording indicator activates (red dot, waveform, or similar)
- [ ] Release **Space** (or click again) — recording stops; transcription appears in the transcript area, OR a graceful error is shown if Whisper is not configured
- [ ] TTS plays back the assistant response audio, OR a graceful error is shown if Kokoro is not configured
- [ ] Transcript segment list accumulates entries across multiple turns
- [ ] Transcript segments are scrollable when they exceed the viewport

---

## Subsystem: Link (NexusLink)

- [ ] Navigate to **Settings → Link** tab
- [ ] Enable the Link server toggle and set a port (e.g., 4242)
- [ ] Click **Save** — status indicator changes to "Running" (green dot)
- [ ] Open a browser to `http://localhost:<port>` — page loads without a connection error
- [ ] Browser page shows a live PTY or Swarm view, OR a "connected" status message
- [ ] Disable the Link server — status changes to "Stopped" and the browser tab shows a disconnected state

---

## Subsystem: CLI

- [ ] Build the CLI package

  ```bash
  cd packages/cli && pnpm build
  # Expected: exits 0; dist/cli/bin/nexus.js produced
  ```

- [ ] Top-level help is printed

  ```bash
  node dist/cli/bin/nexus.js --help
  # Expected: usage text with available subcommands listed (run-swarm, repl, help, …)
  ```

- [ ] Swarm subcommand help is printed

  ```bash
  node dist/cli/bin/nexus.js run-swarm --help
  # Expected: options listed, including --goal <text>
  ```

- [ ] A basic invocation runs without crashing

  ```bash
  node dist/cli/bin/nexus.js run-swarm --goal "echo hello"
  # Expected: exits 0 or produces structured output; no unhandled exception
  ```

  > Note: run this from `packages/cli/` so relative paths resolve correctly.

---

## Subsystem: Sync

- [ ] Navigate to **Settings → Sync** tab
- [ ] Configure endpoint URL and API key fields — inputs accept text
- [ ] Click **Save** — config persists (navigate away and return; fields are still populated)
- [ ] Click **Trigger Sync**:
  - Status chip in the Settings header (or Sync section) updates to "Syncing…" then "OK" / "Error"
- [ ] Enter an invalid endpoint URL and trigger sync — error state is shown cleanly with a human-readable message, no crash

---

## Error boundaries

Every panel is wrapped in an `ErrorBoundary` (confirmed in `App.tsx`). Verify the boundary works end-to-end.

- [ ] Confirm `<ErrorBoundary panelName="…">` wraps each panel entry in `App.tsx`

  ```bash
  grep -n "ErrorBoundary" apps/desktop/src/renderer/app/App.tsx
  # Expected: one ErrorBoundary per panel (terminal, kanban, swarm, memory, replay,
  #           settings, bench, graph, guard, voice)
  ```

- [ ] Manually trigger a boundary (dev build only):
  1. Open any panel component (e.g., `SwarmPanel/index.tsx`)
  2. Add `throw new Error('boundary test')` at the top of the render function
  3. Run `pnpm dev` — the panel area shows the recovery UI ("Something went wrong in Swarm") instead of a blank screen or full-app crash
  4. Revert the throw before committing

---

## Keyboard / Accessibility

- [ ] Open the app and press **Tab** — focus moves to the first sidebar item; a visible focus ring is rendered
- [ ] Continue tabbing through all sidebar icons — every item receives focus in logical order
- [ ] Tab into the active panel — controls receive focus in a logical top-to-bottom, left-to-right order
- [ ] Icon-only buttons have `aria-label` attributes:

  ```
  # In DevTools (Elements tab), inspect sidebar icon buttons.
  # Expected: each <button> has aria-label="Swarm", aria-label="Graph", etc.
  ```

- [ ] Skip-to-content link: on first **Tab** press from any blank area, a "Skip to content" link appears and is functional

---

## Release build smoke test

Run this section against the packaged installer, not the dev build.

- [ ] Install the packaged app:
  - Linux: `chmod +x apps/desktop/dist/NexusMind-*.AppImage && ./apps/desktop/dist/NexusMind-*.AppImage`
  - macOS/Windows: run the appropriate installer artifact
- [ ] App opens — no splash screen errors, no native crash dialog
- [ ] Navigate to at least **three** different panels and verify each loads without a blank screen or JS error
- [ ] Perform one meaningful action in each of those panels (e.g., create a Swarm session, load a Graph template, run a Bench task)
- [ ] Quit the app via the menu or window close — no crash or OS-level error dialog
- [ ] Re-open the app — previously created data (sessions, results) is still present

---

## Sign-off

| Item | Verified by | Date |
|---|---|---|
| Pre-flight | | |
| TypeScript compile | | |
| Dev run | | |
| Packaged build | | |
| Swarm | | |
| Replay | | |
| Bench | | |
| Graph | | |
| Guard | | |
| Voice | | |
| Link | | |
| CLI | | |
| Sync | | |
| Error boundaries | | |
| Keyboard / Accessibility | | |
| Release build smoke test | | |

All sections verified — ready to tag and ship.

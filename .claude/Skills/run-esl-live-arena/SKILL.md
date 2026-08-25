---
name: run-esl-live-arena
description: Build, launch, drive, and screenshot the ESL Live-Arena dashboard offline (no portal access needed). Use when asked to run, start, preview, test-drive, or screenshot this dashboard, verify a UI change actually renders, or check the offline test harnesses (test_quali_zeiten.html, test_reportbilder.html, test_standexport.html, test_gm_offline.html).
---

All paths below are relative to the project root
(`CRAW ESL/LIVE ARENA/`), not to this skill directory.

## What this actually is

`esl_live_arena_v22.js` is not a server or a build target — it's a
24000+ line IIFE meant to be injected via `<script src>` (or an F12
console paste) into a Vodafone/regiocom portal page. It builds its own
full-screen overlay (`#rcLiveDashboard`) the moment it loads, as long
as the host page has a `#filterForm` element to look like the portal.
There is nothing to `npm start`. "Running" it means: serve the folder,
open a fake-portal HTML page that injects the script and feeds it real
fixture data, then drive/screenshot the result.

The project already ships fake-portal pages for exactly this
(`test_quali_zeiten.html`, `test_reportbilder.html`, etc.) — see
CLAUDE.md "Token-Spar-Regeln" point 4. This skill adds the missing
piece: a way to **drive and screenshot** them from the command line,
headless, without a visible browser pane.

## Prerequisites (verified in this container)

- `python` on PATH (`Python 3.14.5` here) — only used for
  `http.server`, nothing project-specific.
- Node.js 22+ (`v24.15.0` here) — needs a built-in global
  `WebSocket`, which the driver uses for Chrome DevTools Protocol.
  No npm packages required (`ws`/`puppeteer`/`playwright` are **not**
  installed and not needed).
- Chrome or Edge installed. The driver looks for, in order:
  `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  `...Program Files (x86)...`, then the Edge equivalents.

## Run (agent path) — serve + drive + screenshot

1) Start the offline server (`.claude/launch.json` entry `esl-offline`,
   port 8412) — from the project root:

```bash
python -m http.server 8412 --bind 127.0.0.1 &
```

2) Launch headless Chrome under CDP (state is kept in
   `.claude/skills/run-esl-live-arena/.driver_state.json`, one Chrome
   instance at a time):

```bash
node .claude/skills/run-esl-live-arena/driver.mjs launch
```

3) Navigate to one of the fake-portal harnesses. `test_quali_zeiten.html`
   loads 520 real fixture agents (`liga_echt.json`) and renders the
   real Qualität page — the most complete "does the UI actually work"
   check:

```bash
node .claude/skills/run-esl-live-arena/driver.mjs goto "http://127.0.0.1:8412/test_quali_zeiten.html"
```

Add `?zeiten=1` to also synthesize ACW/ACHT values (the fixture
doesn't carry them — see Gotchas).

4) Wait for the harness's own async chain (fetch fixtures → inject →
   render) to finish. Every `test_*.html` harness in this repo sets
   `window.__fertig = true` or writes to `#log` when done — poll that,
   don't guess a fixed sleep:

```bash
node .claude/skills/run-esl-live-arena/driver.mjs waitfor "!!window.__fertig" 15000
```

5) Read what the harness itself asserted (each one does its own
   sanity checks and writes them to `#log`):

```bash
node .claude/skills/run-esl-live-arena/driver.mjs eval "document.getElementById('log').textContent"
```

6) Drive the UI further if needed. **`window.switchPage` is not
   exposed globally in this build** (see Gotchas) — click the real
   nav button instead, same as a user would:

```bash
node .claude/skills/run-esl-live-arena/driver.mjs eval "document.getElementById('rcPageQuali').click(); 1"
```

Other page buttons: `rcPageArena` (Arena, the default page),
`rcPageRadar` (Radar), `rcPageCockpit` (Steuerung), `rcPageQueue`
(Warteschleife).

7) Screenshot (PNG, full viewport as launched — 1600x1000):

```bash
node .claude/skills/run-esl-live-arena/driver.mjs screenshot out.png
```

8) Clean up:

```bash
node .claude/skills/run-esl-live-arena/driver.mjs quit
```

### driver.mjs command reference

| Command | Effect |
|---|---|
| `launch` | Starts headless Chrome (`--headless=new`, own temp profile) with `--remote-debugging-port=9333`, saves the CDP target's WebSocket URL to state |
| `goto <url>` | `Page.navigate` to `url` |
| `eval "<js>"` | `Runtime.evaluate`, returns the JSON-serialized result — use for reading state, clicking elements, calling exposed `window.*` functions |
| `waitfor "<js-bool-expr>" [timeoutMs]` | Polls the expression every 300ms until truthy (default timeout 15000ms) |
| `screenshot <file>` | `Page.captureScreenshot`, writes PNG to `file` |
| `quit` | Kills the Chrome process, clears state |

Every command is a separate, stateless `node` invocation — state
(port, pid, target WebSocket URL) lives in `.driver_state.json` next
to `driver.mjs` so consecutive calls reuse the same Chrome tab. Only
one session at a time; `launch` overwrites the previous state file
(call `quit` first if a stale Chrome process is still running).

## Other harnesses (same server, same driver)

- `test_reportbilder.html` — feeds the same 520-agent fixture plus a
  real ESL daily export (`Test Excels/Export_20260714_205722.xlsx`),
  then intercepts the dashboard's own `buildPng`/`buildPngVertrieb`
  (normally a file download) and renders the two report images
  inline as `<img>` instead. Poll `window.__bilder >= 2` instead of
  `__fertig` (that flag doesn't exist in this harness — check `#log`
  for `"Bild fertig"` lines, two of them).
- `test_standexport.html`, `test_gm_offline.html` — same
  serve-inject-poll-`#log` pattern; read each file's own `<script>`
  block for its specific completion signal before waiting on it.

## Run (human path)

Open `http://127.0.0.1:8412/test_quali_zeiten.html` (or any other
`test_*.html`) in a real browser after starting the server from step
1 above. Nothing renders without the server — the pages `fetch()`
`esl_live_arena_v22.js`, `liga_echt.json`, and `node_modules/xlsx/...`
relative to themselves, which fails under `file://`.

## Gotchas

- **`window.switchPage` does not exist on `window`** in this build
  (verified: `typeof window.switchPage === "undefined"` after full
  load). `test_quali_zeiten.html`'s own script calls
  `window.switchPage && window.switchPage('quali')` — the `&&` means
  that call **silently no-ops**, and the harness's screenshot still
  shows the Arena tab active even though its `#log` correctly reports
  Qualität numbers (the harness renders Qualität's DOM directly via
  `window.renderQualitaet()`, a real global, without switching the
  visible page). To actually change the visible page, click the nav
  button (`#rcPageQuali` etc.) — real global functions like
  `processDataStream` and `renderQualitaet` ARE exposed.
- **Chrome DevTools' first `/json/list` entry is not the page tab.**
  It's usually `chrome-extension://.../_generated_background_page.html`.
  Filter for `type === 'page'` (the driver already does this) — using
  `targets[0]` blind connects `eval`/`screenshot` to the wrong target
  and everything silently returns empty/blank.
- **`--screenshot` CLI flag alone captures too early.** A bare
  `chrome --headless --screenshot=out.png url` fires at page load,
  before the harness's `setTimeout` chain (fetch fixtures → inject →
  render, ~1.2-2.1s) has run. Use `--virtual-time-budget=4000` if
  screenshotting via the one-shot CLI flag instead of the CDP driver
  — it advances the page's virtual clock so `setTimeout`s actually
  fire before the shot is taken.
- **`?zeiten=1` changes what's asserted, not just what's shown.**
  Without it, `liga_echt.json` has no `acwSec`/`achtSec` fields — the
  dashboard correctly shows "n. geliefert" (not a stale "0") per
  CLAUDE.md's "Kennzahl fehlt ≠ Kennzahl null" rule. This is
  intentional honesty in the code, not a fixture bug — don't reach
  for `?zeiten=1` by default; use it only when testing the ACW/ACHT
  color-coding path specifically.
- **The Browser-pane MCP tool's `computer{action:"screenshot"}` times
  out with "the Browser pane is not displayed"** in this container —
  no visible-pane compositor here. `read_page`/`get_page_text` on
  that tool still work fine for text-based checks; for actual pixel
  screenshots use this skill's `driver.mjs screenshot` (real headless
  Chrome, no pane needed) instead.
- **Path with spaces breaks naive `import.meta.url` → path
  conversion.** The project root has a literal space
  (`CRAW ESL/LIVE ARENA/`) — use `fileURLToPath()`, not manual
  `%20`-stripping regex, or Node will look for a nonexistent
  `%20`-literal path (this bit the driver during development; fixed).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `FEHLER: Kein Chrome/Edge gefunden` | Neither Chrome nor Edge at the hardcoded paths — add another candidate to `CHROME_CANDIDATES` in `driver.mjs`. |
| `FEHLER: Kein aktiver Chrome. Erst "launch" ausfuehren.` | Ran `goto`/`eval`/`screenshot` before `launch`, or after `quit`. Run `launch` first. |
| `waitfor` times out | The harness never set the flag you're polling — check `#log` via `eval` first; likely the fixture files (`liga_echt.json`, `Test Excels/...xlsx`) 404'd because the server wasn't started from the project root, or wasn't started at all. |
| Screenshot is a blank/white page | `goto` happened before the server was up, or the URL 404'd — `eval "document.title"` to confirm the right page actually loaded before debugging further. |

# Quiz Desk — context for Claude Code

## What this is

Quiz Desk is a Kahoot-style pub quiz. A host runs the game from a laptop connected to a projector, and teams answer from their phones over local Wi-Fi. The server runs on the host's laptop. There are no accounts, no internet requirement and **no dependencies** — just Node.js 18+.

Repo: https://github.com/PTaHHHa/quiz-desk. The user works on Windows, in VS Code with a Git Bash (UCRT64) terminal.

## Run / test

```bash
npm start        # node server/index.js — opens the host page at http://localhost:3000
npm run dev      # node --watch
npm test         # node --test; 17 tests (rules + HTTP API), also run by GitHub Actions on Node 18/20/22
```

Opening `public/index.html` directly (file://) starts **demo mode**: an in-memory store with sample games and auto-answering bots.

## Architecture

### Server — `server/`, CommonJS, Node built-ins only

- `index.js` handles the routes:
  - `GET /api/me` → `{uid, host, join[], hostLink}`
  - `GET /api/stream` sends Server-Sent Events (`event: state` carrying the viewer's full visible state)
  - `POST /api/doc` takes `{path, data|null}` and is validated by the rules
  - `POST /api/upload` accepts a raw body (host only, ≤500 MB)
  - `GET /media/:id` serves files with HTTP Range support
  - every other path serves static files from `public/`, with path-traversal protection
- `rules.js` holds `viewFor`, `applyWrite`, `lockExpired`. **All access control lives here, and it is unit-tested.**
- `store.js` is the JSON-file store (`data/db.json`, debounced atomic write). `seed.js` holds the example game for the first start.
- `config.js` reads env vars: `PORT`, `QUIZDESK_DATA`, `QUIZDESK_MAX_UPLOAD_MB`, `NO_OPEN`.
- `http-utils.js` has `send`, `readJson`, `serveFile` (Range) and `joinUrls`, which lists LAN IPs with 192.168.* first.

**Identity:**
- Each device generates a random 32-hex secret, kept in localStorage as `quizdesk-device` and sent in the `X-Device` header (or `?d=` for SSE). The public uid is `u_` + the first 16 hex characters of sha256(secret).
- A viewer counts as the host when the request comes from loopback, or when it carries `X-Host` / `?h=` equal to `db.hostToken`. The host token is printed in the server console as `?host=…`; the client saves it to localStorage as `quizdesk-host` and strips it from the URL.

### Data model — a flat document store, keys like `collection/id`

- `games/{gid}` contains:
  - `title`, `lang` (`en` | `ru`), `createdAt`, `updatedAt`
  - `rounds[]`: `{id, name, image, music, musicName}`
  - `questions[]`: `{id, round, text, type: "choice"|"text", options[4], time, points, audio: {id,name}|null, video: {kind:"file", id, name}|null}`
  - live state:
    - `revealMode`: `"question"` (default; a missing field means this, so old games are unchanged) | `"round"`. Set in the editor ("When to show answers"), saved with the rounds and questions.
    - `phase`: `lobby` → `round` → `open` → `locked` → `reveal` → … → `final`. In `revealMode: "round"` the per-question `reveal` is skipped: `locked` → next question, and after the last question of a round `locked` → `review` → next round intro (or `final`).
    - `review`: `{rid, step, items: [{qid, correct, accepted[], right[]}]}`, only during `phase === "review"`. `step` is the question being discussed; `step === items.length` is the round results table (`board`, `boardKind: "round"`). The host stores all items; teams get `items[0..step]` only.
    - `idx` (current question), `ri` (current round id), `deadline`, `regOpen`
    - `reveal`: `{qid, correct, accepted[], right[]}`
    - `board[]`, `boardKind`
  - sessions:
    - `sid` is the team registration session. "Play again" from the library creates a new `sid` and a new `aid`.
    - `aid` is the answer session. "Start over" after the final creates a new `aid` only, so teams are kept.
  - `history[]`: `{aid, at, board}`
- `gkeys/{gid}`: `{keys: {qid: {correct, accepted[]}}, overrides: {qid: {uid: bool}}}`. **Host only — never sent to teams.**
- `game/live`: `{gid}` — the game teams currently see.
- `teams/{uid}`: `{[sid]: {name, at}}`
- `answers/{uid}`: `{[aid]: {[qid]: {c, t, at}}}`

**Rules for teams**, enforced in `rules.js`:
- A team writes only its own `teams/{uid}` and `answers/{uid}`.
- Team names are unique per `sid`; comparison uses `norm()` (lowercase, ё→е, punctuation stripped).
- A new team can register only while `regOpen`. Renaming is allowed only in the lobby.
- An answer is accepted only for the current question, while `phase === "open"` and before `deadline + 1.5s`.
- The server auto-locks expired games every 300 ms, even if the host page is closed.

**What a team sees:** the live game, the team names of the current `sid`, and its own answers only. `viewFor` (`teamGameView` in `rules.js`) also withholds answer data from the game document: `reveal` is sent only in `phase === "reveal"`, `review` only in `phase === "review"` and trimmed to the questions the host has reached. Keep this in mind for any new field that carries correct answers.

### Client — `public/`, plain classic scripts with no build step, sharing globals and loaded in order

1. `util.js` — esc, uid, clone, norm, `$app`, `LT = ["A","B","C","D"]`
2. `qr.js` — the `QR` encoder: byte mode, ECC M, versions 1–6, dependency-free, verified with OpenCV
3. `i18n.js` — dictionary `T.en` / `T.ru`, `nounL` plural rules, `t()`, `curLang()`, `fmtDate`
4. `state.js` — `S` (global state), `DEFAULT_GAME`, rounds helpers, `roundArt()` (the default SVG cover), `coverHTML`
5. `music.js` — `Music`: an uploaded track, or the built-in Web Audio synth loop (4 progressions, chosen by round index); `syncMusic()`
6. `store.js` — `createServerDb()`: a mirror of the SSE state that exposes a Firestore-like API (`doc().set/get/delete/onSnapshot`, `collection().onSnapshot`), with optimistic writes corrected by the server's response. It also holds `createMockDb()` and `demoSeed()` for demo mode, plus `api()`, `DEVICE`, `HOST_TOKEN` and `serverAssets`.
7. `game.js` — boot, subscriptions, `refreshGame`/`derive`, scoring (`isCorrect`, `leaderboard`, `withRanks`), host actions, editor draft and save, uploads, question media overlay, team actions, demo bots
8. `views.js` — `render()` rebuilds the whole `#app` via innerHTML and restores focus; contains all screens
9. `events.js` — delegated click/input/change/keydown handlers using `data-act` / `data-ed`; calls `boot()`

**Key client patterns:**
- `render()` re-renders everything. Inputs keep their values in `S` (for example `S.draft`, `S.teamName`) and **do not re-render on input**, except for the first change, which sets `dirty`.
- Question audio and video live in a persistent `#media-layer` overlay that is absolutely positioned over `[data-slot]` placeholders (`layoutMedia()`). This keeps playback going across re-renders. **Do not put `<video>` or `<audio>` for the live question inside `#app`.**
- Confirmations use the in-page `ask(msg, yesLabel, fn, danger)`. **Never use `confirm()` or `alert()`**: they were blocked in the original sandboxed version, and the in-page dialogs are the established style.
- `S.screen`: `library` (with `S.libTab`: `new` | `games`) or `game`. `S.view`: `host` | `team`, the host can preview the team view. `S.tab`: `game` | `questions` | `teams` | `results`.

## Product decisions (agreed with the user)

- **Host start screen:** a "New game" tab with only a big centered "Create new game" button, plus a separate "Previous games" tab with cards (Open/Continue, Play again, Delete). The user explicitly wanted minimal visual noise.
- **Language:** EN/RU. The host home page defaults to English (per device, localStorage `quizdesk-lang`). Each game has its own `lang` toggle, which switches the whole UI for the host and the teams. Question content stays as the host wrote it.
- **One team = one device.**
- **Rounds:** name, picture (default is a generated SVG cover) and background music (default is the built-in synth). Music plays only on the host device, from the round intro through the round, and pauses for questions that have their own audio or video. There is a player with pause and volume.
- **Question media:** audio and/or video **uploaded from the computer only**. YouTube links were explicitly dropped by the user — do not re-add them. Media plays on the host screen only; phones show "watch/listen on the host screen".
- **Reveal mode per game** (`revealMode`): "after each question" (original) or "at the end of each round". In round mode the host screen (projector) shows no answer content, distribution or verdicts until the review, and phones show only "Answer accepted". The review walks through the round's questions with "Next" (correct answer + how many teams were right), then shows the round results table, then the next round intro. Phones see per-question verdicts, then round points and place. Manual overrides on the Results tab work before and during the review (`applyOverrides` rebuilds `review`).
- **Answer checking lives on the Results tab:** a per-question review with auto ticks and manual overrides (checkbox, "auto"/"manual" label, "Restore auto-check"). The Game tab shows only verdict tags and a link to the review.
- **Ranking: teams with equal scores share a place** (1, 1, 3); the next place is skipped. Ties are listed alphabetically. This replaced the earlier sequential numbering at the user's request. Same on host and team screens (`withRanks` in `game.js`).
- The join QR code and address appear in the lobby and on the Teams tab, with a selector when there are several LAN IPs.

## Conventions

- **No dependencies.** No build step. Keep it runnable with `node server/index.js` on a fresh Node install.
- Every user-facing string goes through `t()` and **must exist in both `T.en` and `T.ru`**. Typographic quotes: “ ” in English, « » in Russian, ’ for the apostrophe.
- Design tokens are CSS variables on `:root`, with a dark theme via `prefers-color-scheme` and `[data-theme]`. Fonts are Unbounded (display) and Golos Text (body) from Google Fonts, with system fallbacks used offline. Answer colors: A `--a` coral, B `--b` violet, C `--c` saffron, D `--d` teal; letters, not shapes.
- Escape all user content with `esc()`.
- Any new access rule goes into `server/rules.js` together with a test in `test/rules.test.js`.

## Known issues / troubleshooting already solved with the user

- **Android Chrome needs the "Nearby devices" permission** to open LAN addresses; otherwise it shows `ERR_TOO_MANY_RETRIES`. A hint is shown under the QR code and in the README.
- **Windows firewall:** the user added the rule `New-NetFirewallRule -DisplayName "Quiz Desk" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any`.
- Guest Wi-Fi networks often isolate clients; the README covers this.

## Backlog / ideas discussed but not done

- A projector mode: fullscreen question or board without host controls.
- Export of results to CSV.
- More languages (Polish was suggested) — add a third dictionary and extend `LANGS`.
- Speed bonus points as in Kahoot.
- Showing question media on team phones as an option.
- Bundling the fonts locally, for fully offline use.
- Optional cloud deployment. HANDOFF.md from the earlier conversation suggested Supabase; for now the project is intentionally local-first.

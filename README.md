# Quiz Desk

A Kahoot-style pub quiz for live games. The host shows questions on a big screen and teams answer from their phones. The server runs on the host's laptop and players join over Wi-Fi by scanning a QR code. No internet, no accounts, and no dependencies — just Node.js.

## Features

- **Game library.** New and previous quizzes, a "Play again" button, and a results history for every game.
- **Rounds.** Each round has its own name, picture and background music. If you don't upload a track, a built-in melody synthesized in the browser plays instead.
- **Questions.** Four answer options or free text, a timer, points, and audio or video attached to a question (up to 500 MB per file).
- **Answer checking.** Automatic, with manual ticks for disputed cases ("Canbera" instead of "Canberra").
- **Results.** Preliminary and final standings on the host screen and on the phones. Teams with equal scores share the same place.
- **One team = one device.** A team is bound to its phone and survives a page reload.
- **Interface language.** English or Russian, set separately for each game.
- **Server-side rules.** Correct answers never reach the phones before the reveal, answers after the timer are rejected, and team names are unique.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer (the LTS version).

```bash
git clone https://github.com/<you>/quiz-desk.git
cd quiz-desk
npm start
```

Without a terminal: double-click `start.bat` on Windows or `start.command` on macOS. On macOS, right-click and choose "Open" the first time.

The host page opens, and the server window prints the addresses:

```
  Host, on this computer:     http://localhost:3000/
  Teams join (same Wi-Fi):    http://192.168.1.23:3000/
  Host from another device:   http://192.168.1.23:3000/?host=…
```

Create a game and put the screen on the projector. The lobby shows a QR code and the address for players.

**To run the game from another device** (for example, a tablet), use the link from the `Host from another device` line. Don't show it to the players.

## Configuration

Settings are environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `QUIZDESK_DATA` | `./data` | Folder for the database and uploaded files |
| `QUIZDESK_MAX_UPLOAD_MB` | `500` | Maximum size of a single file |
| `NO_OPEN` | — | If set, don't open the browser on start |

All data lives in `data/`: `db.json` with games, teams and answers, and `media/` with uploaded files. The folder is git-ignored. To back up, copy it; to start from scratch, delete it.

## Мобильный хот-спот

На площадке с гостевым Wi-Fi телефоны часто не видят ноутбук. Надёжный выход — раздать сеть с самого ноутбука, и команды подключатся к ней:

- **Windows:** Параметры → Сеть и Интернет → Мобильный хот-спот → включить.
- **macOS:** Системные настройки → Общий доступ → Общий интернет.
- **Linux:** создайте точку доступа в NetworkManager.

Сервер сам замечает хот-спот по адресам ноутбука (`192.168.137.1` на Windows, `192.168.2.1` на macOS, `10.42.0.1` на Linux), ставит его первым в списке для QR-кода и пересчитывает список каждые 15 секунд. **Перезапускать сервер и обновлять страницу не нужно**: включили хот-спот — через несколько секунд QR-код на странице ведущего поменяется сам. Пока хот-спот выключен, рядом с QR-кодом (в лобби и на вкладке «Команды») показывается совет его включить; дома он обычно не нужен.

## Если телефоны не подключаются

1. **Android + Chrome.** Allow Chrome access to "Nearby devices": Settings → Apps → Chrome → Permissions. Without it, Chrome can't open local addresses and shows `ERR_TOO_MANY_RETRIES`.
2. **Windows firewall.** Allow inbound connections for Node.js. One command in an administrator PowerShell does it:
   ```
   New-NetFirewallRule -DisplayName "Quiz Desk" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
   ```
3. **Same network.** The phone must be on the same Wi-Fi network as the laptop. Guest networks often isolate devices from each other; use the main network or your own router instead.
4. **Several addresses.** If the laptop has several network adapters, pick the right address in the lobby under the QR code ("Another address").

## Development

```bash
npm run dev    # restart the server on changes (node --watch)
npm test       # tests on the built-in node:test runner
```

There is no build step: the frontend is plain HTML, CSS and JS, and the server is plain Node.js. If you open `public/index.html` directly, without the server, the app starts in demo mode with sample data.

```
server/
  index.js        HTTP server: routes, SSE, uploads, static files
  rules.js        who can see and write what (covered by tests)
  store.js        storage in data/db.json
  seed.js         example quiz for the first start
  config.js       settings from environment variables
  http-utils.js   file serving with Range, network addresses
public/
  index.html
  css/styles.css
  js/
    util.js       helpers
    qr.js         dependency-free QR code generator
    i18n.js       EN/RU strings
    state.js      state and rounds
    music.js      background music and synthesizer
    store.js      data client: server or demo mode
    game.js       game logic and editor
    views.js      screen rendering
    events.js     event handlers, startup
test/             tests for the rules and the HTTP API
```

### Data model

State is stored as a set of documents with `collection/id` paths:

- `games/{id}` — a game: rounds, questions and live state (phase, current question, timer, leaderboard, history).
- `gkeys/{id}` — correct answers and the host's manual overrides. Visible to the host only.
- `game/live` — which game is currently open to teams.
- `teams/{uid}`, `answers/{uid}` — the team and answers of a specific device, grouped by game session.

The client receives its part of the state through `GET /api/stream` (Server-Sent Events) and writes through `POST /api/doc`. The server validates every write with the rules in `server/rules.js`. The host is whoever opens the page on the server computer itself (`localhost`) or through the link with the token.

### Security

The server is designed for a trusted local network and speaks plain HTTP. If you want to expose it to the internet, put an HTTPS proxy (for example, Caddy) in front of it or use a host with HTTPS.

## License

[MIT](LICENSE)

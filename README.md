# QuizDuel

Head-to-head trivia with live multiplayer. React + Vite front end, Node/Express + Socket.IO back end, MongoDB for accounts and questions.

## Setup

| Step | Command / action |
|---|---|
| 1. Create a free Atlas cluster | atlas.mongodb.com > Create > Free (M0). Database Access: add a user. Network Access: allow your IP (or 0.0.0.0/0 while testing) |
| 2. Copy the connection string | Connect > Drivers > copy `mongodb+srv://...` |
| 3. Create `.env` | `cp .env.example .env`, then set `MONGODB_URI` and `JWT_SECRET` (`openssl rand -hex 32`) |
| 4. Install | `npm install` |
| 5. Run | `npm run dev` (web http://localhost:5173, API http://localhost:4000) |
| Try without Atlas | set `MONGODB_URI=memory` (data is lost on restart) |
| Production | `npm start` builds the site and serves it from the API on `PORT` |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | none | Atlas connection string, or `memory` |
| `MONGODB_DB` | `quizduel` | Database name |
| `JWT_SECRET` | random per boot | Signs login tokens (set it, or everyone is logged out on restart) |
| `PORT` | `4000` | API/server port |
| `ADMIN_USERNAMES` | empty | Comma list of admins. If empty, the first account created is admin |
| `FETCH_OPENTDB` | `1` | `0` disables pulling questions from opentdb.com |
| `CLIENT_ORIGIN` | none | Only needed if the site is hosted on a different origin than the API |

## Game rules

| Item | Value |
|---|---|
| Questions per match | 7 |
| Time per question | 10 s |
| Points (correct) | 100 base + up to 100 speed bonus |
| Final question | double points |
| XP per match | win 60, draw 35, loss 20, plus 5 per correct answer |
| Level formula | `floor(sqrt(xp / 60)) + 1` |
| Topics | 52 (50 text topics + Flag Quiz + Who's That Pokemon with pictures) |

## Play modes

| Mode | How it works |
|---|---|
| Quick match | Joins a per-topic queue. A second player in the same topic starts a live match. After 12 s with no opponent you play a bot instead |
| Play a friend | Creates a room and shows a 5-letter code (valid 10 min). The friend types it into "Have a room code?" on the home screen |
| Practice vs bot | Instant match against a simulated opponent |
| Disconnect mid-match | The player who stays wins by forfeit |

Live matches are server-authoritative: the server picks the questions, runs the 10 s clock, keeps the correct answers secret until reveal, and scores both players.

## Questions

| Source | Details |
|---|---|
| Built-in | `src/questions*.js` (about 620 questions), copied into MongoDB at startup |
| Open Trivia DB | Fetched from opentdb.com into MongoDB on boot and every 6 h when stale (about 90 s, 15 topics). Duplicates are skipped |
| Admin | Profile > Admin panel: add a question with an optional image URL, or fetch fresh questions now |
| No repeats | The server remembers the last 300 questions each player saw per topic and avoids them, in solo and live matches. Only when a topic has fewer unseen questions than a match needs are the oldest-seen ones reused |
| Pictures | A question can have an `image` URL (flags from flagcdn.com, Pokemon art from PokeAPI). Answer options are text |

## Collections (MongoDB)

| Collection | Fields |
|---|---|
| `users` | `_id`, `username`, `usernameLower` (unique), `passHash`, `isAdmin`, `createdAt`, `save` (name, color, xp, topics, stats, history) |
| `questions` | `_id`, `topic`, `q`, `a`, `w[3]`, `image`, `source` (builtin / opentdb / admin), `key` (unique hash) |
| `seen` | `_id` (`userId:topic`), `ids[]` (recent question ids) |
| `meta` | last Open Trivia DB refresh time |

## Security notes

Passwords: SHA-256 pre-hash then bcrypt (cost 10), never stored in plain text. Login tokens are JWTs valid 14 days. 5 wrong logins from one IP for a username trigger a 30 s lockout. Solo-match XP/stats are reported by the browser, so they are not tamper-proof; live match scoring is.

## Files

- `server/index.js` boot and routing, `auth.js` accounts, `routes.js` question/admin API, `questions.js` bank and no-repeat logic, `opentdb.js` internet questions, `multiplayer.js` Socket.IO matches, `db.js` / `memdb.js` database
- `src/App.jsx` screens and flow, `Lobby.jsx`, `Live.jsx` (live match UI), `Profile.jsx`, `Admin.jsx`, `Auth.jsx`, `api.js`, `socket.js`, `rules.js` (rules shared with the server)
# quiz-duel

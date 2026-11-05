/* Quiz Desk — state.js
 * Global app state, defaults, rounds helpers and the default round cover art.
 */
"use strict";
/* ---------- state ---------- */
const S = {
  mode: "loading", db: null, assets: null, blobs: {},
  me: { id: null, canEdit: false },
  screen: "library", libTab: "new", gid: null, cur: null, homeLang: "en",
  view: "host", tab: "game",
  games: {}, live: { gid: null }, gamesLoaded: false,
  game: clone(DEFAULT_GAME), keys: { keys: {}, overrides: {} },
  teamsRaw: {}, answersRaw: {}, teams: {}, answers: {}, myAnswers: {},
  draft: null, dirty: false, editErr: "", uploading: null, uploadTarget: null, uploadKind: null,
  teamName: "", teamText: "", teamErr: "", renaming: false,
  stale: false, readOnly: false, toast: "", ask: null, busy: false,
  reviewQ: null, musicOn: true, vol: 0.6, preview: null, bots: []
};
try { const l = localStorage.getItem("quizdesk-lang"); if (LANGS.includes(l)) S.homeLang = l; } catch (e) {}

/* ---------- rounds ---------- */
function roundsOf() {
  const r = S.game.rounds;
  return r && r.length ? r : [{ id: "r1", name: t("roundN", 1), image: null, music: null, musicName: "" }];
}
const roundOfQ = q => roundsOf().find(r => r.id === q.round) || roundsOf()[0];
const roundIndex = id => Math.max(0, roundsOf().findIndex(r => r.id === id));
const roundById = id => roundsOf().find(r => r.id === id) || null;
const roundQCount = id => S.game.questions.filter(q => roundOfQ(q).id === id).length;
function curRoundId() { const g = S.game; if (g.phase === "round") return g.ri; const q = curQ(); return q ? roundOfQ(q).id : null; }
const assetUrl = id => !id ? "" : S.mode === "demo" ? (S.blobs[id] || "") : "/media/" + id;

function roundArt(n, label) {
  const pal = ["#FF6B57", "#7B5CFA", "#F5A623", "#14A98F"];
  const c = i => pal[(n + i) % 4], tilt = [-12, -4, 6, 14][n % 4];
  return `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(t("coverAria", n + 1))}">
    <rect width="640" height="360" fill="#1B1E3C"/>
    <g transform="rotate(${tilt} 200 180)">
      <rect x="40" y="20" width="150" height="150" rx="30" fill="${c(0)}"/><rect x="205" y="20" width="150" height="150" rx="30" fill="${c(1)}"/>
      <rect x="40" y="185" width="150" height="150" rx="30" fill="${c(2)}"/><rect x="205" y="185" width="150" height="150" rx="30" fill="${c(3)}"/>
      <text x="115" y="125" font-family="Unbounded, Arial Black, sans-serif" font-weight="900" font-size="80" fill="#fff" text-anchor="middle" opacity=".9">?</text>
    </g>
    <circle cx="520" cy="70" r="120" fill="none" stroke="${c(1)}" stroke-width="16" opacity=".35"/>
    <circle cx="560" cy="330" r="60" fill="${c(2)}" opacity=".25"/>
    <text x="500" y="300" font-family="Unbounded, Arial Black, sans-serif" font-weight="900" font-size="230" fill="#FFFFFF" text-anchor="middle">${esc(label ?? n + 1)}</text>
  </svg>`;
}
const coverHTML = (r, n, cls = "", label) => `<div class="cover ${cls}">${r && r.image && assetUrl(r.image) ? `<img src="${esc(assetUrl(r.image))}" alt="${esc(t("roundPicAlt", n + 1))}">` : roundArt(n, label)}</div>`;

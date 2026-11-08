/* Quiz Desk — game.js
 * Game logic: subscriptions, scoring, host actions, editor, uploads, team actions, question media.
 */
"use strict";
/* ---------- boot & subscriptions ---------- */
let loadTimer = null, keysUnsub = null;
async function boot() {
  let me = null;
  if (location.protocol.startsWith("http")) { try { me = await api("GET", "/api/me"); } catch (e) { me = null; } }
  if (me && me.uid) {
    S.mode = "server"; S.db = createServerDb(); S.me = { id: me.uid, canEdit: !!me.host };
    S.join = me.join || []; S.joinIdx = 0; S.assets = me.host ? serverAssets : null;
  } else {
    S.mode = "demo"; S.db = createMockDb(); S.assets = mockAssets; S.me = { id: "demo-you", canEdit: true }; demoSeed(S.db);
  }
  S.view = S.me.canEdit ? "host" : "team";
  subscribe(); render(); setInterval(tick, 250);
}
function subscribe() {
  const db = S.db;
  loadTimer = setTimeout(() => { S.stale = true; render(); }, 10000);
  const ok = () => { if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; } S.stale = false; };
  const fail = e => { ok(); console.warn(e); };
  db.doc("game/live").onSnapshot(s => { S.live = Object.assign({ gid: null }, s.exists ? s.data() : {}); refreshGame(); render(); }, fail);
  db.collection("games").onSnapshot(s => {
    if (!s.metadata.fromCache) ok();
    const g = {}; s.docs.forEach(d => { if (d.exists) g[d.id] = d.data(); }); S.games = g; S.gamesLoaded = true;
    if (S.screen === "game" && S.gid && !g[S.gid]) { S.screen = "library"; S.gid = null; }
    refreshGame(); render();
  }, fail);
  db.collection("teams").onSnapshot(s => { const t2 = {}; s.docs.forEach(d => { if (d.exists) t2[d.id] = d.data(); }); S.teamsRaw = t2; derive(); render(); }, fail);
  if (S.me.canEdit) db.collection("answers").onSnapshot(s => { const a = {}; s.docs.forEach(d => { if (d.exists) a[d.id] = d.data(); }); S.answersRaw = a; derive(); render(); }, fail);
  else db.doc("answers/" + S.me.id).onSnapshot(s => { S.answersRaw = { [S.me.id]: s.exists ? s.data() : {} }; derive(); render(); }, fail);
}
function subscribeKeys(gid) {
  if (keysUnsub) { keysUnsub(); keysUnsub = null; }
  S.keys = { keys: {}, overrides: {} };
  if (!gid || !S.me.canEdit) return;
  keysUnsub = S.db.doc("gkeys/" + gid).onSnapshot(s => { S.keys = Object.assign({ keys: {}, overrides: {} }, s.exists ? s.data() : {}); render(); }, e => console.warn(e));
}
function refreshGame() {
  const gid = S.me.canEdit ? (S.screen === "game" ? S.gid : null) : S.live.gid;
  const prev = S.game, prevGid = S.cur;
  S.cur = gid;
  S.game = Object.assign(clone(DEFAULT_GAME), (gid && S.games[gid]) || {});
  if (gid !== prevGid) { subscribeKeys(gid); Object.keys(media).forEach(destroyMedia); }
  derive();
  if (gid !== prevGid || S.game.phase !== prev.phase || S.game.idx !== prev.idx || S.game.aid !== prev.aid) { S.teamText = myAnswer()?.t || ""; autoLockFired = false; botsAnswer(); }
  syncMusic();
  document.documentElement.lang = curLang();
}
function derive() {
  const sid = S.game.sid, aid = S.game.aid;
  S.teams = {}; for (const [u, d] of Object.entries(S.teamsRaw)) if (sid && d[sid] && d[sid].name) S.teams[u] = d[sid];
  S.answers = {}; for (const [u, d] of Object.entries(S.answersRaw)) if (aid && d[aid]) S.answers[u] = d[aid];
  S.myAnswers = ((S.answersRaw[S.me.id] || {})[aid]) || {};
}

/* ---------- writes ---------- */
async function write(fn, errMsg) {
  try { await fn(); return true; }
  catch (e) {
    const m = { closed: "errClosed", reg_closed: "errRegClosed", name_taken: "nameTaken", bad_name: "nameLong", rename_closed: "errRename", not_registered: "errNotReg", no_game: "errNoGame" }[e && e.code];
    if (m) S.teamErr = t(m);
    else if (e && e.code === "invalid_argument" && !S.me.canEdit && S.mode !== "server") { S.readOnly = true; S.teamErr = t("noWrite"); }
    else S.teamErr = errMsg || t("saveFailed");
    render(); return false;
  }
}
const setGameById = (gid, patch) => write(() => S.db.doc("games/" + gid).set(Object.assign(clone(S.games[gid] || {}), patch, { updatedAt: Date.now() })));
const setGame = patch => S.cur ? setGameById(S.cur, patch) : Promise.resolve(false);
const setLive = gid => S.live.gid === gid ? Promise.resolve(true) : write(() => S.db.doc("game/live").set({ gid }));

/* ---------- derived ---------- */
const curQ = () => S.game.questions[S.game.idx] || null;
const myTeam = () => S.teams[S.me.id] || null;
const myAnswer = () => { const q = curQ(); return q ? (S.myAnswers || {})[q.id] : null; };
function isCorrect(q, a, teamId, overrides) {
  if (!a) return false;
  const ov = ((overrides || S.keys.overrides)[q.id] || {})[teamId];
  if (ov === true || ov === false) return ov;
  const k = S.keys.keys[q.id]; if (!k) return false;
  if (q.type === "choice") return a.c != null && a.c === k.correct;
  const n = norm(a.t); return !!n && (k.accepted || []).some(x => norm(x) === n);
}
function scoredUpto() { const g = S.game; if (g.phase === "final") return g.questions.length - 1; if (g.phase === "open" || g.phase === "lobby") return g.idx - 1; return g.idx; }
function leaderboard(upto = scoredUpto()) {
  const qs = S.game.questions.slice(0, upto + 1);
  return Object.entries(S.teams).map(([id, tm]) => {
    const ans = S.answers[id] || {}; let score = 0;
    qs.forEach(q => { if (isCorrect(q, ans[q.id], id)) score += Number(q.points) || 1; });
    return { id, name: tm.name, score };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
function withRanks(rows) { return rows.map((r, i) => ({ ...r, rank: i + 1 })); }
const boardData = upto => leaderboard(upto).map(r => ({ id: r.id, name: r.name, score: r.score }));
const rightTeams = q => Object.keys(S.teams).filter(id => isCorrect(q, (S.answers[id] || {})[q.id], id));
const secsLeft = () => S.game.deadline ? Math.max(0, Math.ceil((S.game.deadline - Date.now()) / 1000)) : null;
const accepting = () => S.game.phase === "open" && (!S.game.deadline || Date.now() < S.game.deadline);
function nextAction() {
  const g = S.game, n = g.questions.length, i = g.idx + 1;
  if (i >= n) return null;
  const rid = roundOfQ(g.questions[i]).id, startsRound = i === 0 || roundOfQ(g.questions[i - 1]).id !== rid;
  if (startsRound && !(g.phase === "round" && g.ri === rid)) return { act: "round", rid, label: t("startRound", roundIndex(rid) + 1, roundById(rid).name) };
  return { act: "open", i, label: t("openQ", i + 1) };
}
const actionBtn = (a, cls = "primary") => !a ? "" : a.act === "round"
  ? `<button class="btn ${cls}" data-act="round" data-r="${esc(a.rid)}">${esc(a.label)}</button>`
  : `<button class="btn ${cls}" data-act="open" data-i="${a.i}">${esc(a.label)}</button>`;

/* ---------- timer ---------- */
let autoLockFired = false, wasAccepting = null;
function tick() {
  const s = secsLeft();
  document.querySelectorAll("[data-timer]").forEach(el => { el.textContent = s == null ? "∞" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; el.classList.toggle("low", s != null && s <= 5); });
  const acc = accepting(), changed = wasAccepting !== null && acc !== wasAccepting;
  wasAccepting = acc; if (changed) render();
  if (S.mode !== "server" && S.me.canEdit && S.cur && S.game.phase === "open" && S.game.deadline && Date.now() >= S.game.deadline && !autoLockFired) { autoLockFired = true; setGame({ phase: "locked" }); }
}

/* ---------- library actions ---------- */
const newIds = () => ({ sid: "s_" + uid(), aid: "a_" + uid() });
async function createGame() {
  const lg = S.homeLang, gid = "g_" + uid() + uid().slice(0, 4);
  const data = { ...clone(DEFAULT_GAME), title: tL(lg, "untitled"), lang: lg, createdAt: Date.now(), updatedAt: Date.now(), ...newIds(),
    rounds: [{ id: "r" + uid(), name: tL(lg, "roundN", 1), image: null, music: null, musicName: "" }] };
  const ok = await write(() => S.db.doc("games/" + gid).set(data)) && await write(() => S.db.doc("gkeys/" + gid).set({ keys: {}, overrides: {} }));
  if (!ok) return;
  S.games[gid] = data; enterGame(gid, "questions");
}
function enterGame(gid, tab) {
  S.gid = gid; S.screen = "game"; S.tab = tab || "game"; S.view = "host"; S.draft = null; S.dirty = false; S.editErr = ""; S.reviewQ = null;
  setLive(gid); refreshGame(); render(); window.scrollTo(0, 0);
}
function busyElsewhere(gid) { const l = S.live.gid, g = l && l !== gid ? S.games[l] : null; return g && !["lobby", "final"].includes(g.phase) ? g : null; }
function openGame(gid) {
  const other = busyElsewhere(gid);
  if (other) ask(t("switchLive", other.title), t("openAnyway"), () => enterGame(gid), false); else enterGame(gid);
}
function replayGame(gid) {
  const g = S.games[gid]; if (!g) return;
  const other = busyElsewhere(gid);
  ask(t("confirmReplay", g.title) + (other ? " " + t("switchLive", other.title) : ""), t("replayYes"), async () => {
    const ok = await setGameById(gid, { ...newIds(), phase: "lobby", idx: -1, ri: null, deadline: null, reveal: null, review: null, board: null, boardKind: null, regOpen: true });
    if (!ok) return;
    try { const k = await S.db.doc("gkeys/" + gid).get(); await S.db.doc("gkeys/" + gid).set({ keys: (k.exists && k.data().keys) || {}, overrides: {} }); } catch (e) {}
    enterGame(gid);
  }, false);
}
function deleteGame(gid) {
  const g = S.games[gid]; if (!g) return;
  ask(t("confirmDelete", g.title), t("deleteYes"), async () => {
    await write(() => S.db.doc("games/" + gid).delete()); await write(() => S.db.doc("gkeys/" + gid).delete());
    if (S.live.gid === gid) await write(() => S.db.doc("game/live").set({ gid: null }));
    flash(t("deleted"));
  }, true);
}
function goHome() {
  const go = () => { stopPreview(); S.screen = "library"; S.gid = null; S.draft = null; S.dirty = false; S.editErr = ""; refreshGame(); render(); window.scrollTo(0, 0); };
  if (S.tab === "questions" && S.dirty) ask(t("leaveUnsaved"), t("leaveYes"), go, true); else go();
}

/* ---------- host game actions ---------- */
function startRound(rid) { setGame({ phase: "round", ri: rid, deadline: null, reveal: null, review: null }); }
/* Reveal mode: "question" (default, also for old games without the field) or "round". */
const roundMode = () => S.game.revealMode === "round";
function isLastOfRound() {
  const g = S.game, q = g.questions[g.idx], nq = g.questions[g.idx + 1];
  return !!q && (!nq || roundOfQ(nq).id !== roundOfQ(q).id);
}
/* The whole walkthrough of a round, built from the current auto-checks and manual overrides. */
function buildReview(rid, step = 0) {
  const items = S.game.questions.filter(q => roundOfQ(q).id === rid).map(q => {
    const k = S.keys.keys[q.id] || {};
    return { qid: q.id, correct: q.type === "choice" ? (k.correct ?? null) : null, accepted: q.type === "text" ? (k.accepted || []) : [], right: rightTeams(q) };
  });
  return { rid, step, items };
}
function startReview() {
  const q = curQ(); if (!q) return;
  const rid = roundOfQ(q).id;
  setGame({ phase: "review", ri: rid, deadline: null, reveal: null, review: buildReview(rid) });
}
function reviewNext() {
  const g = S.game, rv = g.review; if (g.phase !== "review" || !rv) return;
  const step = Math.min(rv.step + 1, rv.items.length), patch = { review: { ...rv, step } };
  if (step >= rv.items.length) { patch.board = boardData(g.idx); patch.boardKind = "round"; }
  setGame(patch);
}
function openQuestion(i) {
  const q = S.game.questions[i]; if (!q) return;
  const tm = Number(q.time) || 0;
  setGame({ idx: i, phase: "open", ri: roundOfQ(q).id, deadline: tm ? Date.now() + tm * 1000 : null, reveal: null });
}
function revealCurrent() {
  const q = curQ(); if (!q) return;
  const k = S.keys.keys[q.id] || {};
  setGame({ phase: "reveal", reveal: { qid: q.id, correct: q.type === "choice" ? k.correct : null, accepted: q.type === "text" ? (k.accepted || []) : [], right: rightTeams(q) }, board: boardData(S.game.idx), boardKind: "prelim" });
}
function finalPatch() {
  const g = S.game, board = boardData(g.questions.length - 1);
  const history = (g.history || []).filter(h => h.aid !== g.aid).concat([{ aid: g.aid, at: Date.now(), board }]).slice(-30);
  return { phase: "final", deadline: null, board, boardKind: "final", history };
}
function showFinal() { setGame(finalPatch()); }
function pushPrelim() { setGame({ board: boardData(), boardKind: "prelim" }); flash(t("prelimShown")); }
function ask(msg, yes, fn, danger) { S.ask = { msg, yes, fn, danger }; render(); setTimeout(() => document.getElementById("ask-yes")?.focus()); }
async function restartGame() {
  S.busy = true; render();
  await write(() => S.db.doc("gkeys/" + S.cur).set({ keys: S.keys.keys, overrides: {} }));
  await setGame({ aid: "a_" + uid(), phase: "lobby", idx: -1, ri: null, deadline: null, reveal: null, review: null, board: null, boardKind: null });
  S.busy = false; S.tab = "game"; S.reviewQ = null; flash(t("gameReset"));
}
async function setOverride(qid, teamId, val) {
  const ov = clone(S.keys.overrides || {}); ov[qid] = ov[qid] || {}; delete ov[qid][teamId];
  const q = S.game.questions.find(x => x.id === qid);
  const auto = q ? isCorrect(q, (S.answers[teamId] || {})[qid], teamId, {}) : false;
  if (val !== null && val !== auto) ov[qid][teamId] = val;
  if (!Object.keys(ov[qid]).length) delete ov[qid];
  await applyOverrides(qid, ov);
}
async function applyOverrides(qid, ov) {
  S.keys = Object.assign({}, S.keys, { overrides: ov }); render();
  const q = S.game.questions.find(x => x.id === qid);
  const ok = await write(() => S.db.doc("gkeys/" + S.cur).set({ keys: S.keys.keys, overrides: ov }));
  if (!ok || !q) return;
  const g = S.game;
  if (g.phase === "reveal" && g.reveal && g.reveal.qid === qid) await setGame({ reveal: Object.assign({}, g.reveal, { right: rightTeams(q) }), board: boardData(g.idx) });
  else if (g.phase === "review" && g.review) {
    // The walkthrough shows the corrected result; the table only exists once the host reached it.
    const patch = { review: buildReview(g.review.rid, g.review.step) };
    if (g.review.step >= g.review.items.length) patch.board = boardData(g.idx);
    await setGame(patch);
  }
  else if (g.phase === "final") await setGame(finalPatch());
  else if (g.board && !(roundMode() && ["open", "locked"].includes(g.phase))) await setGame({ board: boardData() });
}
function resetAuto(qid) { const ov = clone(S.keys.overrides || {}); delete ov[qid]; applyOverrides(qid, ov); flash(t("autoRestored")); }
let flashT = null;
function flash(msg) { S.toast = msg; render(); clearTimeout(flashT); flashT = setTimeout(() => { S.toast = ""; render(); }, 2600); }

/* ---------- editor ---------- */
function qToDraft(q) { const k = S.keys.keys[q.id] || {}; return { ...clone(q), options: (q.options || []).concat(["", "", "", ""]).slice(0, 4), correct: k.correct ?? null, accepted: (k.accepted || []).join("\n") }; }
function ensureDraft() {
  if (S.draft) return;
  S.draft = { title: S.game.title, revealMode: roundMode() ? "round" : "question", rounds: roundsOf().map(r => ({ ...clone(r), qs: S.game.questions.filter(q => roundOfQ(q).id === r.id).map(qToDraft) })) };
}
const newQuestion = () => ({ id: "q" + uid(), text: "", type: "choice", options: ["", "", "", ""], time: 30, points: 1, correct: null, accepted: "", audio: null, video: null });
const newRound = n => ({ id: "r" + uid(), name: t("roundN", n), image: null, music: null, musicName: "", qs: [newQuestion()] });
function validateDraft() {
  let n = 0;
  for (const r of S.draft.rounds) for (const q of r.qs) {
    n++;
    if (!q.text.trim()) return t("vText", n);
    if (q.type === "choice") {
      if (q.options.filter(o => o.trim()).length < 2) return t("vOpts", n);
      if (q.correct == null || !q.options[q.correct]?.trim()) return t("vCorrect", n);
    }
  }
  return "";
}
async function saveDraft() {
  const err = validateDraft(); if (err) { S.editErr = err; render(); return; }
  S.editErr = "";
  const rounds = S.draft.rounds.map((r, i) => ({ id: r.id, name: r.name.trim() || t("roundN", i + 1), image: r.image || null, music: r.music || null, musicName: r.musicName || "" }));
  const all = S.draft.rounds.flatMap(r => r.qs.map(q => ({ ...q, round: r.id })));
  const questions = all.map(q => ({ id: q.id, round: q.round, text: q.text.trim(), type: q.type, options: q.type === "choice" ? q.options.map(o => o.trim()) : ["", "", "", ""], time: Math.max(0, Math.min(600, Number(q.time) || 0)), points: Math.max(1, Math.min(100, Number(q.points) || 1)), audio: q.audio || null, video: q.video || null }));
  const keys = {}; all.forEach(q => { keys[q.id] = { correct: q.type === "choice" ? q.correct : null, accepted: q.type === "text" ? q.accepted.split(/\n|;/).map(s => s.trim()).filter(Boolean) : [] }; });
  const ok1 = await write(() => S.db.doc("gkeys/" + S.cur).set({ keys, overrides: S.keys.overrides || {} }));
  const ok2 = ok1 && await setGame({ title: (S.draft.title || "").trim() || t("untitled"), revealMode: S.draft.revealMode === "round" ? "round" : "question", rounds, questions });
  if (ok2) { S.dirty = false; S.draft = null; stopPreview(); flash(t("saved")); }
}
function moveQ(r, i, d) {
  const R = S.draft.rounds, list = R[r].qs, j = i + d;
  if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  else if (j < 0 && r > 0) R[r - 1].qs.push(list.splice(i, 1)[0]);
  else if (j >= list.length && r < R.length - 1) R[r + 1].qs.unshift(list.splice(i, 1)[0]);
  S.dirty = true; render();
}
async function uploadFile(file, kind, tgt) {
  if (!file || !S.draft || !tgt) return;
  const round = S.draft.rounds[tgt.r]; if (!round) return;
  const q = tgt.i != null ? round.qs[tgt.i] : null;
  if (!S.assets) { S.editErr = t("errNoUpload"); render(); return; }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let type = file.type;
  if (kind === "img") { if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) { S.editErr = t("errImg"); render(); return; } }
  else if (kind === "mus" || kind === "qaud") {
    if (!/^audio\/|^video\//.test(type) && !["mp3", "m4a", "aac", "mp4", "webm", "ogg", "opus", "wav"].includes(ext)) { S.editErr = t("errMus"); render(); return; }
    if (S.mode === "server") type = /^audio\//.test(type) ? type : ({ mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", webm: "audio/webm", mp4: "audio/mp4" }[ext] || "audio/mpeg");
    else type = ["webm", "ogg", "opus", "oga"].includes(ext) ? "video/webm" : "video/mp4";
  } else {
    if (!/^video\//.test(type) && !["mp4", "webm", "mov", "m4v"].includes(ext)) { S.editErr = t("errVid"); render(); return; }
    type = ext === "webm" || type === "video/webm" ? "video/webm" : ext === "mov" || type === "video/quicktime" ? "video/quicktime" : "video/mp4";
  }
  if (file.size > (S.mode === "server" ? 500 : 20) * 1024 * 1024) { S.editErr = t("errBig"); render(); return; }
  S.uploading = kind + (q ? `${tgt.r}-${tgt.i}` : tgt.r); S.editErr = ""; render();
  try {
    const res = await S.assets.upload(file, { type });
    if (kind === "img") round.image = res.id;
    else if (kind === "mus") { round.music = res.id; round.musicName = file.name; }
    else if (kind === "qaud") q.audio = { id: res.id, name: file.name };
    else q.video = { kind: "file", id: res.id, name: file.name };
    S.dirty = true;
  } catch (e) {
    const c = e && e.code;
    S.editErr = c === "too_large" ? t("errTooLarge") : c === "unsupported_type" ? t("errType") : c === "quota_or_state" ? t("errQuota") : t("errUpload");
  }
  S.uploading = null; render();
}
function togglePreview(r) {
  const round = S.draft.rounds[r];
  if (S.preview === round.id) { stopPreview(); render(); return; }
  S.preview = round.id;
  Music.play("preview:" + round.id + ":" + (round.music || "synth"), round.music ? assetUrl(round.music) : null, r);
  render();
}
function stopPreview() { if (S.preview) { S.preview = null; Music.stop(); syncMusic(); } }

/* ---------- question media on the host screen ---------- */
const slotHTML = (key, spec) => `<div class="media-slot" data-slot="${esc(key)}" data-spec="${esc(JSON.stringify(spec))}"></div>`;
function mediaSlots(q) {
  let h = "";
  if (q.audio) h += slotHTML(q.id + ":a", { t: "audio", src: assetUrl(q.audio.id) });
  if (q.video && q.video.kind === "file") h += slotHTML(q.id + ":v", { t: "video", src: assetUrl(q.video.id) });
  return h ? `<div class="media-wrap">${h}</div>` : "";
}
const media = {}, mediaLayer = document.getElementById("media-layer");
function buildMedia(spec) {
  const box = document.createElement("div"); box.className = "media-box";
  const el = document.createElement(spec.t); el.controls = true; el.preload = "auto"; el.src = spec.src;
  if (spec.t === "video") el.playsInline = true;
  box.appendChild(el); if (S.game.phase === "open") el.play().catch(() => {});
  mediaLayer.appendChild(box); return box;
}
function destroyMedia(key) {
  const b = media[key]; if (!b) return;
  b.querySelectorAll("audio,video").forEach(m => { m.pause(); m.removeAttribute("src"); m.load(); });
  b.remove(); delete media[key];
}
function layoutMedia() {
  const keep = new Set();
  document.querySelectorAll("[data-slot]").forEach(slot => {
    const key = S.cur + ":" + slot.dataset.slot; keep.add(key);
    if (!media[key]) media[key] = buildMedia(JSON.parse(slot.dataset.spec));
    const box = media[key], r = slot.getBoundingClientRect();
    box.style.display = "block"; box.style.left = (r.left + window.scrollX) + "px"; box.style.top = (r.top + window.scrollY) + "px"; box.style.width = r.width + "px";
    const hgt = box.offsetHeight + "px"; if (slot.style.height !== hgt) slot.style.height = hgt;
  });
  const cq = curQ();
  Object.keys(media).forEach(key => {
    if (keep.has(key)) return;
    if (cq && key.startsWith(S.cur + ":" + cq.id + ":") && S.game.phase !== "final") media[key].style.display = "none";
    else destroyMedia(key);
  });
}
let mediaRaf = 0;
const relayout = () => { cancelAnimationFrame(mediaRaf); mediaRaf = requestAnimationFrame(layoutMedia); };
window.addEventListener("resize", relayout);
if (window.ResizeObserver) new ResizeObserver(relayout).observe($app);

/* ---------- team actions ---------- */
async function createTeam() {
  const name = S.teamName.trim().replace(/\s+/g, " ");
  if (!name) { S.teamErr = t("enterName"); render(); return; }
  if (name.length > 40) { S.teamErr = t("nameLong"); render(); return; }
  if (Object.entries(S.teams).some(([id, tm]) => id !== S.me.id && norm(tm.name) === norm(name))) { S.teamErr = t("nameTaken"); render(); return; }
  S.teamErr = "";
  const sid = S.game.sid, own = clone(S.teamsRaw[S.me.id] || {});
  own[sid] = { name, at: own[sid]?.at || Date.now() };
  const ok = await write(() => S.db.doc("teams/" + S.me.id).set(own));
  if (ok) { S.renaming = false; S.teamName = ""; }
}
async function answer(patch) {
  const q = curQ(); if (!q || !accepting() || !myTeam()) return;
  const aid = S.game.aid, own = clone(S.answersRaw[S.me.id] || {}), next = clone(own[aid] || {});
  next[q.id] = Object.assign({ c: null, t: null }, patch, { at: Date.now() });
  own[aid] = next; S.answersRaw[S.me.id] = own; derive(); S.teamErr = ""; render();
  await write(() => S.db.doc("answers/" + S.me.id).set(own));
}
async function hostSetTeam(uidT, name) {
  const own = clone(S.teamsRaw[uidT] || {}), sid = S.game.sid;
  if (name === null) delete own[sid]; else own[sid] = { ...(own[sid] || { at: Date.now() }), name };
  await write(() => Object.keys(own).length ? S.db.doc("teams/" + uidT).set(own) : S.db.doc("teams/" + uidT).delete());
}

/* ---------- demo bots ---------- */
const BOT_NAMES = { en: ["Brainstorm", "Night Owls", "No Chance", "Quizzly Bears", "Cats"], ru: ["Мозговой штурм", "Совы", "Без шансов", "Эрудиты с Липовой", "Котики"] };
function addBots() {
  BOT_NAMES[curLang()].filter(n => !Object.values(S.teams).some(tm => tm.name === n)).slice(0, 3).forEach(n => {
    const id = "bot-" + uid(); S.bots.push(id); S.db.doc("teams/" + id).set({ [S.game.sid]: { name: n, at: Date.now() } });
  });
}
function botsAnswer() {
  if (S.mode !== "demo" || S.game.phase !== "open") return;
  const q = curQ(), gid = S.cur, aid = S.game.aid; if (!q) return;
  S.bots.forEach(id => {
    if (!S.teams[id]) return;
    setTimeout(() => {
      if (S.cur !== gid || S.game.phase !== "open" || curQ()?.id !== q.id) return;
      const own = clone(S.answersRaw[id] || {}), cur = own[aid] || {}, k = S.keys.keys[q.id] || {};
      if (q.type === "choice") { const idxs = q.options.map((o, i) => o ? i : -1).filter(i => i >= 0); cur[q.id] = { c: Math.random() < .55 ? k.correct : idxs[Math.floor(Math.random() * idxs.length)], t: null, at: Date.now() }; }
      else { const pool = (k.accepted || []).concat(curLang() === "ru" ? ["Сидней", "Мельбурн", "Канбера"] : ["Sydney", "Melbourne", "Canbera"]); cur[q.id] = { c: null, t: pool[Math.floor(Math.random() * pool.length)], at: Date.now() }; }
      own[aid] = cur; S.db.doc("answers/" + id).set(own);
    }, 1200 + Math.random() * 4000);
  });
}

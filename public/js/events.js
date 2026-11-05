/* Quiz Desk — events.js
 * DOM event wiring. Loaded last; calls boot().
 */
"use strict";
/* ---------- events ---------- */
const fileImg = document.getElementById("file-img"), fileMus = document.getElementById("file-mus"), fileVid = document.getElementById("file-vid");
[fileImg, fileMus, fileVid].forEach(inp => inp.addEventListener("change", () => { const f = inp.files[0]; inp.value = ""; uploadFile(f, S.uploadKind, S.uploadTarget); }));
const pick = (inp, kind, tgt) => { S.uploadKind = kind; S.uploadTarget = tgt; inp.click(); };

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act, i = Number(b.dataset.i), r = Number(b.dataset.r);
  switch (act) {
    case "askYes": { const fn = S.ask && S.ask.fn; S.ask = null; render(); if (fn) fn(); break; }
    case "askNo": S.ask = null; render(); break;
    case "homeLang": S.homeLang = b.dataset.v; try { localStorage.setItem("quizdesk-lang", S.homeLang); } catch (err) {} render(); break;
    case "gameLang": if (b.dataset.v !== S.game.lang) setGame({ lang: b.dataset.v }); break;
    case "newgame": createGame(); break;
    case "libTab": S.libTab = b.dataset.v; render(); break;
    case "gopen": openGame(b.dataset.g); break;
    case "greplay": replayGame(b.dataset.g); break;
    case "gdel": deleteGame(b.dataset.g); break;
    case "home": goHome(); break;
    case "view": S.view = b.dataset.v; S.teamErr = ""; render(); break;
    case "tab": {
      const go = () => { if (b.dataset.v !== "questions") { S.draft = null; S.dirty = false; S.editErr = ""; stopPreview(); } S.tab = b.dataset.v; render(); };
      if (S.tab === "questions" && b.dataset.v !== "questions" && S.dirty) { ask(t("leaveUnsaved"), t("leaveYes"), go, true); return; }
      go(); break;
    }
    case "music":
      if (Music.playing && !Music.blocked && !S.preview) { S.musicOn = false; Music.stop(); }
      else { S.musicOn = true; S.preview = null; Music.stop(); if (Music.ctx) Music.ctx.resume().catch(() => {}); syncMusic(); if (!Music.playing) flash(t("musicLater")); }
      render(); break;
    case "round": startRound(b.dataset.r); break;
    case "open": openQuestion(i); break;
    case "lock": setGame({ phase: "locked" }); break;
    case "reveal": revealCurrent(); break;
    case "final": showFinal(); break;
    case "prelim": pushPrelim(); break;
    case "reset": ask(t("restartConfirm"), t("restartYes"), restartGame, true); break;
    case "reg": setGame({ regOpen: !S.game.regOpen }); break;
    case "goReview": S.reviewQ = b.dataset.q; S.tab = "results"; render(); break;
    case "rq": S.reviewQ = b.dataset.q; render(); break;
    case "auto": resetAuto(b.dataset.q); break;
    case "addr": ensureDraft(); S.draft.rounds.push(newRound(S.draft.rounds.length + 1)); S.dirty = true; render(); setTimeout(() => document.getElementById(`r${S.draft.rounds.length - 1}-name`)?.focus()); break;
    case "delr": { const R = S.draft.rounds[r]; const go = () => { if (S.preview === R.id) stopPreview(); S.draft.rounds.splice(r, 1); S.dirty = true; render(); };
      if (R.qs.length) ask(t("delRoundConfirm", R.name, R.qs.length), t("delRound"), go, true); else go(); break; }
    case "mvr": { const R = S.draft.rounds, j = r + Number(b.dataset.d); [R[r], R[j]] = [R[j], R[r]]; S.dirty = true; render(); break; }
    case "addq": ensureDraft(); S.draft.rounds[r].qs.push(newQuestion()); S.dirty = true; render(); setTimeout(() => document.getElementById(`q${r}-${S.draft.rounds[r].qs.length - 1}-text`)?.focus()); break;
    case "delq": ask(t("delQ"), t("delQYes"), () => { S.draft.rounds[r].qs.splice(i, 1); S.dirty = true; render(); }, true); break;
    case "mv": moveQ(r, i, Number(b.dataset.d)); break;
    case "upimg": pick(fileImg, "img", { r }); break;
    case "upmus": pick(fileMus, "mus", { r }); break;
    case "upqaud": pick(fileMus, "qaud", { r, i }); break;
    case "upqvid": pick(fileVid, "qvid", { r, i }); break;
    case "rmqaud": S.draft.rounds[r].qs[i].audio = null; S.dirty = true; render(); break;
    case "rmqvid": S.draft.rounds[r].qs[i].video = null; S.dirty = true; render(); break;
    case "rmimg": S.draft.rounds[r].image = null; S.dirty = true; render(); break;
    case "rmmus": { const R = S.draft.rounds[r]; if (S.preview === R.id) stopPreview(); R.music = null; R.musicName = ""; S.dirty = true; render(); break; }
    case "prev": togglePreview(r); break;
    case "save": saveDraft(); break;
    case "discard": stopPreview(); S.draft = null; S.dirty = false; S.editErr = ""; render(); break;
    case "bots": addBots(); break;
    case "tedit": S.editTeam = b.dataset.t; S.editTeamName = S.teams[b.dataset.t].name; render(); break;
    case "tcancel": S.editTeam = null; render(); break;
    case "tsave": { const id = b.dataset.t, name = (S.editTeamName || "").trim(); if (name) hostSetTeam(id, name); S.editTeam = null; render(); break; }
    case "tdel": { const id = b.dataset.t; ask(t("delTeam", S.teams[id].name), t("delTeamYes"), () => hostSetTeam(id, null), true); break; }
    case "mkteam": createTeam(); break;
    case "rename": S.renaming = true; S.teamName = myTeam()?.name || ""; render(); break;
    case "cancelRename": S.renaming = false; S.teamErr = ""; render(); break;
    case "pick": answer({ c: i }); break;
    case "sendText": { const v = S.teamText.trim(); if (v) answer({ t: v }); break; }
  }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.vol) { S.vol = Number(el.value); Music.setVol(S.vol); return; }
  const k = el.dataset.ed; if (!k) return;
  const r = Number(el.dataset.r), i = Number(el.dataset.i), j = Number(el.dataset.j);
  if (k === "teamName") { S.teamName = el.value; return; }
  if (k === "teamText") { S.teamText = el.value; return; }
  if (k === "tname") { S.editTeamName = el.value; return; }
  const Q = () => S.draft.rounds[r].qs[i];
  if (k === "title") S.draft.title = el.value;
  else if (k === "rname") S.draft.rounds[r].name = el.value;
  else if (k === "text") Q().text = el.value;
  else if (k === "opt") Q().options[j] = el.value;
  else if (k === "accepted") Q().accepted = el.value;
  else if (k === "time") Q().time = el.value;
  else if (k === "points") Q().points = el.value;
  else return;
  if (!S.dirty) { S.dirty = true; render(); }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.ovr) { setOverride(el.dataset.q, el.dataset.t, el.checked); return; }
  if (el.dataset.join) { S.joinIdx = Number(el.value); render(); return; }
  const k = el.dataset.ed; if (!k) return;
  const r = Number(el.dataset.r), i = Number(el.dataset.i);
  if (k === "type") { S.draft.rounds[r].qs[i].type = el.value; S.dirty = true; render(); }
  if (k === "correct") { S.draft.rounds[r].qs[i].correct = Number(el.dataset.j); S.dirty = true; render(); }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "team-name") createTeam();
  if (e.target.id === "team-text") { const v = S.teamText.trim(); if (v) answer({ t: v }); }
});

boot();

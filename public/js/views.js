/* Quiz Desk — views.js
 * Rendering of every screen: library, host workspace tabs and the team (phone) view.
 */
"use strict";
/* ---------- render ---------- */
function render() {
  document.documentElement.lang = curLang();
  const a = document.activeElement, fid = a && a.id, sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
  let body;
  if (S.me.canEdit && S.screen === "library") body = libraryView();
  else if (S.me.canEdit && S.view === "host") body = hostView();
  else body = teamView();
  $app.innerHTML = topBar() + notes() + body;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  layoutMedia(); tick();
}
const langSeg = (cur, act) => `<div class="seg lang" role="group" aria-label="${esc(t("langLabel"))}">${LANGS.map(l => `<button data-act="${act}" data-v="${l}" aria-pressed="${cur === l}">${l.toUpperCase()}</button>`).join("")}</div>`;
function topBar() {
  const mark = `<div class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
  if (S.me.canEdit && S.screen === "library")
    return `<header class="top"><div class="brand">${mark}<h1>${esc(t("appName"))}</h1></div>${langSeg(S.homeLang, "homeLang")}</header>`;
  let right = "";
  if (S.me.canEdit) right = `${langSeg(curLang(), "gameLang")}<div class="seg" role="group" aria-label="${esc(t("viewMode"))}">
      <button data-act="view" data-v="host" aria-pressed="${S.view === "host"}">${esc(t("host"))}</button>
      <button data-act="view" data-v="team" aria-pressed="${S.view === "team"}">${esc(t("team"))}</button></div>`;
  const back = S.me.canEdit ? `<button class="btn sm ghost" data-act="home">${esc(t("backAll"))}</button>` : "";
  const title = S.cur && S.games[S.cur] ? S.game.title : t("appName");
  return `<header class="top">${back}<div class="brand">${mark}<h1>${esc(title)}</h1></div>${right}</header>`;
}
function notes() {
  let h = "";
  if (S.mode === "demo") h += `<div class="note">${t("demoNote")}</div>`;
  if (S.stale) h += `<div class="note">${esc(t("staleNote"))}</div>`;
  if (S.ask) h += `<div class="note" role="alertdialog" aria-label="${esc(S.ask.yes)}" style="border-style:solid;border-color:var(--accent)"><p style="margin:0 0 10px;color:var(--ink);font-weight:600">${esc(S.ask.msg)}</p><div class="row"><button class="btn ${S.ask.danger ? "danger" : "primary"}" id="ask-yes" data-act="askYes">${esc(S.ask.yes)}</button><button class="btn ghost" data-act="askNo">${esc(t("cancel"))}</button></div></div>`;
  if (S.busy) h += `<div class="note" role="status">${esc(t("busyReset"))}</div>`;
  if (S.toast) h += `<div class="note" role="status"><b>${esc(S.toast)}</b></div>`;
  return h;
}

/* ----- library ----- */
function libraryView() {
  const list = Object.entries(S.games).sort((a, b) => {
    const la = a[0] === S.live.gid ? 1 : 0, lb = b[0] === S.live.gid ? 1 : 0;
    return lb - la || (b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0);
  });
  const tabs = `<nav class="tabs" role="tablist">
    <button role="tab" data-act="libTab" data-v="new" aria-selected="${S.libTab === "new"}">${esc(t("tabNew"))}</button>
    <button role="tab" data-act="libTab" data-v="games" aria-selected="${S.libTab === "games"}">${esc(t("tabPrev"))}<span class="count">${list.length}</span></button></nav>`;
  if (S.libTab === "new") {
    const lg = S.live.gid && S.games[S.live.gid], going = lg && !["lobby", "final"].includes(lg.phase);
    return tabs + `<section class="home-hero">
      <div class="mark big" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h2>${esc(t("homeTitle"))}</h2>
      <p class="muted">${esc(t("homeSub"))}</p>
      <button class="btn primary xl" data-act="newgame">${esc(t("newGame"))}</button>
      ${going ? `<button class="btn ghost" data-act="gopen" data-g="${esc(S.live.gid)}">${esc(t("continueLive", lg.title))}</button>` : ""}
    </section>`;
  }
  const cards = list.map(([gid, g], i) => {
    const rounds = (g.rounds && g.rounds.length) ? g.rounds : [null], qn = (g.questions || []).length;
    const hist = (g.history || []).slice().sort((a, b) => b.at - a.at), last = hist[0];
    const live = gid === S.live.gid, inProgress = live && !["lobby", "final"].includes(g.phase);
    const winner = last && last.board && last.board[0] ? last.board[0].name : "";
    const initial = (g.title || "?").trim().charAt(0).toUpperCase() || "?";
    return `<article class="gcard ${live ? "live" : ""}">
      ${live ? `<span class="live-badge">${esc(t("liveNow"))}</span>` : ""}<span class="lang-badge">${esc((g.lang || "en").toUpperCase())}</span>
      ${coverHTML(rounds[0], i % 4, "", initial)}
      <div class="body">
        <h3>${esc(g.title || t("untitled"))}</h3>
        <p class="small muted" style="margin:0">${esc(t("rq", (g.rounds || []).length || 1, qn))}</p>
        <p class="small muted" style="margin:0">${last ? esc(t("lastPlayed", fmtDate(last.at), winner)) : esc(t("neverPlayed"))}${hist.length > 1 ? `. ${esc(t("plays", hist.length))}` : ""}</p>
        <p class="small muted" style="margin:0">${esc(t("created", fmtDate(g.createdAt || Date.now())))}</p>
        <div class="acts">
          <button class="btn sm primary" data-act="gopen" data-g="${esc(gid)}">${esc(inProgress ? t("continue") : t("open"))}</button>
          ${qn ? `<button class="btn sm" data-act="greplay" data-g="${esc(gid)}">${esc(t("playAgain"))}</button>` : ""}
          <button class="btn sm ghost danger" data-act="gdel" data-g="${esc(gid)}">${esc(t("del"))}</button>
        </div>
      </div></article>`;
  }).join("");
  if (!S.gamesLoaded) return tabs + `<p class="muted">${esc(t("loading"))}</p>`;
  return tabs + (list.length ? `<div class="games">${cards}</div>`
    : `<div class="panel empty"><p>${esc(t("prevEmpty"))}</p><button class="btn primary" data-act="libTab" data-v="new">${esc(t("newGame"))}</button></div>`);
}

/* ----- host ----- */
function hostView() {
  if (!S.cur || !S.games[S.cur]) return `<p class="muted">${esc(t("loading"))}</p>`;
  const tabs = [["game", t("tabGame")], ["questions", t("tabQuestions"), S.game.questions.length], ["teams", t("tabTeams"), Object.keys(S.teams).length], ["results", t("tabResults")]];
  const body = { game: hostGame, questions: hostQuestions, teams: hostTeams, results: hostResults }[S.tab]();
  return `<nav class="tabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" data-act="tab" data-v="${k}" aria-selected="${S.tab === k}">${esc(l)}${c != null ? `<span class="count">${c}</span>` : ""}</button>`).join("")}</nav>${body}`;
}
const phaseCls = { lobby: "", round: "reveal", open: "open", locked: "locked", reveal: "reveal", final: "reveal" };
function playerHTML() {
  const rid = curRoundId(), r = rid ? roundById(rid) : null, mq = mediaQActive();
  const on = Music.playing && !Music.blocked && !S.preview;
  let label;
  if (!["round", "open", "locked", "reveal"].includes(S.game.phase) || !r) label = t("bgStarts");
  else label = `${r.name}: ${r.music ? (r.musicName || t("ownMusic")) : t("stdMelody")}`;
  if (mq) label = t("bgPausedMedia");
  if (Music.blocked) label += t("blockedHint");
  return `<div class="player"><span class="eq ${on ? "" : "off"}" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="grow small">${esc(label)}</span>
    ${mq ? "" : `<button class="btn sm" data-act="music">${esc(on ? t("pause") : t("playMusic"))}</button>`}
    <label class="small" style="display:flex;gap:8px;align-items:center">${esc(t("volume"))} <input type="range" id="vol" data-vol="1" min="0" max="1" step="0.05" value="${S.vol}"></label></div>`;
}
function joinPanel() {
  if (S.mode !== "server" || !S.join || !S.join.length) return "";
  const url = S.join[S.joinIdx] || S.join[0];
  return `<div class="joinbox"><div class="qr">${QR.svg(url, esc(t("joinH")))}</div><div>
    <h3>${esc(t("joinH"))}</h3><p class="joinurl">${esc(url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</p>
    <p class="muted small" style="margin:0">${esc(t("joinHint"))}</p>
    ${S.join.length > 1 ? `<label class="small muted">${esc(t("otherAddr"))} <select id="join-sel" data-join="1">${S.join.map((u, i) => `<option value="${i}" ${i === S.joinIdx ? "selected" : ""}>${esc(u)}</option>`).join("")}</select></label>` : ""}
  </div></div>`;
}
function hostGame() {
  const g = S.game, q = curQ(), n = g.questions.length, nT = Object.keys(S.teams).length;
  if (!n) return `<div class="panel empty"><h2 style="font-size:22px;margin-bottom:8px">${esc(t("noQsTitle"))}</h2><p>${esc(t("noQsText"))}</p><button class="btn primary" data-act="tab" data-v="questions">${esc(t("addQs"))}</button></div>`;
  const pl = t("ph_" + g.phase), pc = phaseCls[g.phase] || "", next = nextAction(), player = playerHTML();
  const usedRounds = roundsOf().filter(r => roundQCount(r.id));
  if (g.phase === "lobby") {
    return player + `<div class="panel stack">
      <div class="row"><span class="phase">${esc(pl)}</span><span class="muted small">${esc(t("nTeams", nT))}, ${esc(t("nQuestions", n))}</span></div>
      <h2 style="font-size:clamp(24px,3vw,36px)">${esc(t("readyToStart"))}</h2>
      ${joinPanel()}
      <ol class="list">${usedRounds.map((r, i) => `<li><span class="chipL ${LT[i % 4]}">${i + 1}</span><b class="grow">${esc(r.name)}</b><span class="muted small">${esc(t("nQuestions", roundQCount(r.id)))}</span></li>`).join("")}</ol>
      <p class="muted" style="margin:0">${esc(t("regHint", g.regOpen))}</p>
      <div class="row">${actionBtn(next)}<button class="btn" data-act="reg">${esc(g.regOpen ? t("closeReg") : t("openReg"))}</button></div>
    </div>`;
  }
  if (g.phase === "final") return `<div class="panel stack"><div class="row"><span class="phase reveal">${esc(pl)}</span><span class="grow"></span><button class="btn" data-act="reset">${esc(t("restart"))}</button></div>${boardHTML(withRanks(leaderboard(n - 1)), true)}</div>`;
  if (g.phase === "round") {
    const r = roundById(g.ri) || roundsOf()[0], ri = roundIndex(r.id), rows = withRanks(leaderboard()).slice(0, 5);
    return player + `<div class="stage">
      <section class="panel">${coverHTML(r, ri)}
        <p class="qnum" style="margin:16px 0 0">${esc(t("roundOf", ri + 1, usedRounds.length))}</p>
        <p class="round-title">${esc(r.name)}</p>
        <p class="muted" style="margin:0 0 18px">${esc(t("nQuestions", roundQCount(r.id)))}</p>
        <div class="row">${actionBtn(next)}</div></section>
      <section class="panel"><div class="row" style="margin-bottom:8px"><h3 style="font-size:17px" class="grow">${esc(t("scoreBefore"))}</h3><button class="btn sm" data-act="prelim">${esc(t("showTeams"))}</button></div>
        ${rows.length ? boardHTML(rows, false) : `<p class="muted small">${esc(t("noTeamsYet"))}</p>`}</section>
    </div>`;
  }
  const r = roundOfQ(q), ri = roundIndex(r.id);
  const answered = Object.keys(S.teams).filter(id => (S.answers[id] || {})[q.id]);
  const k = S.keys.keys[q.id] || {};
  let opts;
  if (q.type === "choice") {
    const counts = [0, 0, 0, 0]; answered.forEach(id => { const c = S.answers[id][q.id].c; if (c != null) counts[c]++; });
    const showRight = g.phase === "reveal", showCnt = g.phase !== "open";
    opts = `<div class="opts host">${q.options.map((o, i) => o ? `<div class="opt ${LT[i]} ${showRight ? (i === k.correct ? "right" : "dim") : ""}">
      <span class="fill" style="width:${showCnt && answered.length ? Math.round(counts[i] / answered.length * 100) : 0}%"></span>
      <span class="L">${LT[i]}</span><span class="t">${esc(o)}</span>${showCnt ? `<span class="cnt">${counts[i]}</span>` : ""}</div>` : "").join("")}</div>`;
  } else opts = `<div class="note" style="margin:0">${esc(t("freeForm"))} ${g.phase === "reveal" ? `${esc(t("acceptedAre"))} <b>${esc((k.accepted || []).join(", ") || t("notSet"))}</b>` : esc(t("teamsType"))}</div>`;
  let ctrl = "";
  if (g.phase === "open") ctrl = `<button class="btn primary" data-act="lock">${esc(t("lockBtn"))}</button>`;
  else if (g.phase === "locked") ctrl = `<button class="btn primary" data-act="reveal">${esc(t("revealBtn"))}</button>`;
  else if (g.phase === "reveal") ctrl = next ? `${actionBtn(next)}<button class="btn" data-act="final">${esc(t("finishBtn"))}</button>` : `<button class="btn primary" data-act="final">${esc(t("finalBtn"))}</button>`;
  return player + `<div class="stage">
    <section class="panel">
      <div class="row"><span class="tag">${esc(t("roundTag", ri + 1, r.name))}</span><span class="qnum">${esc(t("qOf", g.idx + 1, n))}</span><span class="phase ${pc}">${esc(pl)}</span><span class="grow"></span>${g.phase === "open" ? `<span class="timer" data-timer></span>` : ""}</div>
      <p class="qtext">${esc(q.text)}</p>
      ${mediaSlots(q)}
      ${opts}
      <div class="row" style="margin-top:20px">${ctrl}</div>
    </section>
    <section class="panel">
      <div class="row" style="margin-bottom:8px"><h3 style="font-size:17px" class="grow">${esc(t("answersH"))}</h3><span class="tag">${esc(t("xOfY", answered.length, nT))}</span></div>
      ${answersList(q)}
      ${answered.length ? `<button class="btn sm" style="margin-top:12px" data-act="goReview" data-q="${esc(q.id)}">${esc(t("checkInResults"))}</button>` : ""}
    </section>
  </div>`;
}
function answerCell(q, a) {
  if (!a) return `<span class="muted small">${esc(t("noAnswer"))}</span>`;
  return q.type === "choice" ? (a.c != null ? `<span class="chipL ${LT[a.c]}">${LT[a.c]}</span> <span class="small">${esc(q.options[a.c])}</span>` : "") : `<span class="small" style="overflow-wrap:anywhere">${esc(t("q", a.t))}</span>`;
}
const sortedTeamIds = () => Object.keys(S.teams).sort((a, b) => S.teams[a].name.localeCompare(S.teams[b].name));
function answersList(q) {
  const ids = sortedTeamIds();
  if (!ids.length) return `<p class="muted small">${esc(t("noTeamsYet"))}</p>`;
  const showV = S.game.phase !== "open";
  return `<ul class="list">${ids.map(id => {
    const a = (S.answers[id] || {})[q.id];
    let v = ""; if (showV && a) { const ok = isCorrect(q, a, id); v = `<span class="tag ${ok ? "ok" : "no"}">${esc(ok ? t("correct") : t("wrong"))}</span>`; }
    return `<li><span class="dot ${a ? "on" : ""}"></span><span class="grow" style="min-width:0"><b>${esc(S.teams[id].name)}</b><br>${answerCell(q, a)}</span>${v}</li>`;
  }).join("")}</ul>`;
}

function hostQuestions() {
  ensureDraft();
  const running = ["open", "locked", "round"].includes(S.game.phase);
  let n = 0;
  const rounds = S.draft.rounds.map((r, ri) => roundEditor(r, ri, r.qs.map((q, qi) => qEditor(q, ri, qi, n++)).join(""))).join("");
  return `<div class="stack">
    ${running ? `<div class="note">${esc(t("runningNote"))}</div>` : ""}
    ${!S.assets ? `<div class="note">${esc(t("assetsNote"))}</div>` : ""}
    <div class="panel"><label class="f" for="ed-title">${esc(t("gameTitle"))}</label><input type="text" id="ed-title" data-ed="title" value="${esc(S.draft.title)}" maxlength="60"></div>
    <div>${rounds || `<div class="panel empty">${esc(t("noRounds"))}</div>`}</div>
    <button class="btn" data-act="addr">${esc(t("addRound"))}</button>
    ${S.dirty || S.editErr ? `<div class="sticky-save" role="region" aria-label="${esc(t("save"))}"><span class="grow">${esc(S.editErr || t("unsaved"))}</span><button class="btn ghost" style="color:var(--bg);background:transparent" data-act="discard">${esc(t("discard"))}</button><button class="btn" data-act="save">${esc(t("save"))}</button></div>` : ""}
  </div>`;
}
function roundEditor(r, ri, qsHTML) {
  const last = S.draft.rounds.length - 1, up = S.uploading, playing = S.preview === r.id && Music.playing;
  return `<section class="rnd" aria-label="${esc(t("roundN", ri + 1))}">
    <div class="rhead"><span class="rn">${esc(t("roundN", ri + 1))}</span>
      <input type="text" id="r${ri}-name" data-ed="rname" data-r="${ri}" value="${esc(r.name)}" maxlength="60" class="grow" placeholder="${esc(t("roundNamePh"))}" aria-label="${esc(t("roundNamePh"))}">
      <button class="btn sm ghost" data-act="mvr" data-r="${ri}" data-d="-1" ${ri === 0 ? "disabled" : ""} aria-label="${esc(t("moveUp"))}">↑</button>
      <button class="btn sm ghost" data-act="mvr" data-r="${ri}" data-d="1" ${ri === last ? "disabled" : ""} aria-label="${esc(t("moveDown"))}">↓</button>
      <button class="btn sm ghost danger" data-act="delr" data-r="${ri}">${esc(t("delRound"))}</button></div>
    <div class="rmedia">
      ${coverHTML(r, ri, "sm")}
      <div class="stack">
        <div><span class="f">${esc(t("roundImg"))}</span>
          <p class="small muted" style="margin:0 0 8px">${esc(r.image ? t("customImg") : t("stdCover"))} — ${esc(t("imgHint"))}.</p>
          <div class="row">${S.assets ? `<button class="btn sm" data-act="upimg" data-r="${ri}" ${up ? "disabled" : ""}>${esc(up === "img" + ri ? t("uploading") : r.image ? t("replaceImg") : t("uploadImg"))}</button>` : ""}
          ${r.image ? `<button class="btn sm ghost" data-act="rmimg" data-r="${ri}">${esc(t("restoreDefault"))}</button>` : ""}</div></div>
        <div><span class="f">${esc(t("bgMusic"))}</span>
          <p class="small muted" style="margin:0 0 8px">${esc(r.music ? (r.musicName || t("customMusic")) : t("stdMelodyCap"))} — ${esc(t("musicHint"))}.</p>
          <div class="row"><button class="btn sm" data-act="prev" data-r="${ri}">${esc(playing ? t("stop") : t("listen"))}</button>
          ${S.assets ? `<button class="btn sm" data-act="upmus" data-r="${ri}" ${up ? "disabled" : ""}>${esc(up === "mus" + ri ? t("uploading") : r.music ? t("replaceMusic") : t("uploadMusic"))}</button>` : ""}
          ${r.music ? `<button class="btn sm ghost" data-act="rmmus" data-r="${ri}">${esc(t("restoreDefault"))}</button>` : ""}</div></div>
      </div>
    </div>
    ${qsHTML || `<p class="muted small">${esc(t("noQsInRound"))}</p>`}
    <button class="btn sm" style="margin-top:12px" data-act="addq" data-r="${ri}">${esc(t("addQinRound"))}</button>
  </section>`;
}
function qMediaEditor(q, ri, qi) {
  const d = `data-r="${ri}" data-i="${qi}"`, up = S.uploading, key = `${ri}-${qi}`;
  let aud = "";
  if (q.audio) aud = `<div class="mrow"><span class="tag">${esc(t("audioTag"))}</span><span class="grow small" style="overflow-wrap:anywhere">${esc(q.audio.name || t("audioFile"))}</span><button class="btn sm ghost" data-act="rmqaud" ${d}>${esc(t("remove"))}</button></div><audio controls preload="none" src="${esc(assetUrl(q.audio.id))}" style="width:100%;margin-top:6px"></audio>`;
  else if (S.assets) aud = `<button class="btn sm" data-act="upqaud" ${d} ${up ? "disabled" : ""}>${esc(up === "qaud" + key ? t("uploading") : t("addMusic"))}</button>`;
  let vid = "";
  if (q.video && q.video.kind === "file") vid = `<div class="mrow"><span class="tag">${esc(t("videoTag"))}</span><span class="grow small" style="overflow-wrap:anywhere">${esc(q.video.name || t("videoFile"))}</span><button class="btn sm ghost" data-act="rmqvid" ${d}>${esc(t("remove"))}</button></div><video controls preload="metadata" src="${esc(assetUrl(q.video.id))}" style="width:100%;max-width:360px;border-radius:10px;margin-top:6px;background:#000"></video>`;
  else if (S.assets) vid = `<div class="row"><button class="btn sm" data-act="upqvid" ${d} ${up ? "disabled" : ""}>${esc(up === "qvid" + key ? t("uploading") : t("uploadVideo"))}</button><span class="muted small">${esc(t("videoHint"))}</span></div>`;
  if (!aud && !vid) return "";
  return `<div class="qmedia"><span class="f">${esc(t("mediaLabel"))}</span><div class="stack">${aud ? `<div>${aud}</div>` : ""}${vid ? `<div>${vid}</div>` : ""}</div></div>`;
}
function qEditor(q, ri, qi, num) {
  const p = `q${ri}-${qi}`, R = S.draft.rounds;
  const first = ri === 0 && qi === 0, lastQ = ri === R.length - 1 && qi === R[ri].qs.length - 1;
  const d = `data-r="${ri}" data-i="${qi}"`;
  return `<div class="qed">
    <div class="head"><span class="n">${num + 1}</span>
      <select id="${p}-type" data-ed="type" ${d} style="width:auto" aria-label="${esc(t("answerType"))}">
        <option value="choice" ${q.type === "choice" ? "selected" : ""}>${esc(t("typeChoice"))}</option>
        <option value="text" ${q.type === "text" ? "selected" : ""}>${esc(t("typeText"))}</option>
      </select><span class="grow"></span>
      <button class="btn sm ghost" data-act="mv" ${d} data-d="-1" ${first ? "disabled" : ""} aria-label="${esc(t("moveUp"))}">↑</button>
      <button class="btn sm ghost" data-act="mv" ${d} data-d="1" ${lastQ ? "disabled" : ""} aria-label="${esc(t("moveDown"))}">↓</button>
      <button class="btn sm ghost danger" data-act="delq" ${d}>${esc(t("delete"))}</button>
    </div>
    <label class="f" for="${p}-text">${esc(t("question"))}</label>
    <textarea id="${p}-text" data-ed="text" ${d} rows="2" placeholder="${esc(t("qPh"))}">${esc(q.text)}</textarea>
    <div style="margin-top:12px">
    ${q.type === "choice" ? `<span class="f">${esc(t("optsLabel"))}</span><div class="edopts">${q.options.map((o, j) => `<label class="edopt"><input type="radio" name="${p}-c" data-ed="correct" ${d} data-j="${j}" ${q.correct === j ? "checked" : ""} aria-label="${esc(t("correctAria", LT[j]))}"><span class="chipL ${LT[j]}">${LT[j]}</span><input type="text" id="${p}-o${j}" data-ed="opt" ${d} data-j="${j}" value="${esc(o)}" placeholder="${esc(j < 2 ? t("opt") : t("optOpt"))}"></label>`).join("")}</div>`
      : `<label class="f" for="${p}-acc">${esc(t("acceptedLabel"))}</label><textarea id="${p}-acc" data-ed="accepted" ${d} rows="2">${esc(q.accepted)}</textarea><p class="muted small" style="margin:6px 0 0">${esc(t("acceptedHint"))}</p>`}
    </div>
    ${qMediaEditor(q, ri, qi)}
    <div class="row" style="margin-top:12px">
      <label class="small" style="display:flex;gap:8px;align-items:center">${esc(t("timeSec"))} <input type="number" id="${p}-time" data-ed="time" ${d} value="${esc(q.time)}" min="0" max="600" style="width:90px"></label>
      <label class="small" style="display:flex;gap:8px;align-items:center">${esc(t("points"))} <input type="number" id="${p}-pts" data-ed="points" ${d} value="${esc(q.points)}" min="1" max="100" style="width:80px"></label>
      <span class="muted small">${esc(t("noTimer"))}</span>
    </div>
  </div>`;
}

function hostTeams() {
  const ids = Object.keys(S.teams).sort((a, b) => (S.teams[a].at || 0) - (S.teams[b].at || 0));
  return `<div class="panel stack">
    <div class="row"><h2 style="font-size:22px" class="grow">${esc(t("teamsH"))}</h2>
      ${S.mode === "demo" ? `<button class="btn" data-act="bots">${esc(t("addBots"))}</button>` : ""}
      <button class="btn ${S.game.regOpen ? "" : "primary"}" data-act="reg">${esc(S.game.regOpen ? t("closeReg") : t("openReg"))}</button></div>
    <p class="muted small" style="margin:0">${esc(t("teamsHint", S.game.regOpen))}</p>
    ${S.game.regOpen ? joinPanel() : ""}
    ${ids.length ? `<ul class="list">${ids.map((id, i) => `<li><span class="muted" style="width:26px;font-family:var(--display)">${i + 1}</span>
      ${S.editTeam === id ? `<input type="text" id="tr-${esc(id)}" data-ed="tname" value="${esc(S.editTeamName)}" maxlength="40" class="grow" style="max-width:360px"><button class="btn sm primary" data-act="tsave" data-t="${esc(id)}">${esc(t("save"))}</button><button class="btn sm ghost" data-act="tcancel">${esc(t("cancel"))}</button>`
      : `<b class="grow" style="overflow-wrap:anywhere">${esc(S.teams[id].name)}</b>${id === S.me.id ? `<span class="tag">${esc(t("you"))}</span>` : ""}<button class="btn sm ghost" data-act="tedit" data-t="${esc(id)}">${esc(t("rename"))}</button><button class="btn sm ghost danger" data-act="tdel" data-t="${esc(id)}">${esc(t("delete"))}</button>`}</li>`).join("")}</ul>`
      : `<div class="empty">${esc(t("teamsEmpty"))}</div>`}
  </div>`;
}

function hostResults() {
  const g = S.game, rows = withRanks(leaderboard()), done = scoredUpto() + 1;
  return `<div class="stack">
  <div class="panel stack">
    <div class="row"><div class="grow"><h2 style="font-size:24px">${esc(g.phase === "final" ? t("finalRes") : t("prelimRes"))}</h2><p class="muted small" style="margin:4px 0 0">${esc(t("counted", Math.max(0, done), g.questions.length))}</p></div>
      <button class="btn" data-act="prelim" ${g.phase === "final" ? "disabled" : ""}>${esc(t("showTeams"))}</button>
      <button class="btn primary" data-act="final" ${!g.questions.length ? "disabled" : ""}>${esc(g.phase === "final" ? t("updateFinal") : t("announceFinal"))}</button></div>
    ${rows.length ? boardHTML(rows, true) : `<div class="empty">${esc(t("boardEmpty"))}</div>`}
    ${rows.length && done > 0 ? breakdown() : ""}
  </div>
  ${reviewSection()}
  ${historySection()}
  </div>`;
}
function historySection() {
  const h = (S.game.history || []).filter(x => x.aid !== S.game.aid || S.game.phase !== "final").slice().sort((a, b) => b.at - a.at);
  if (!h.length) return "";
  return `<div class="panel"><h2 style="font-size:22px;margin-bottom:8px">${esc(t("histH"))}</h2><ul class="list hist">${h.map(x => {
    const rows = withRanks(x.board || []);
    return `<li><span class="when">${esc(fmtDate(x.at))}</span> <span class="muted small">${esc(t("histTeams", rows.length))}</span><br><span class="small">${rows.slice(0, 3).map(r => `${r.rank}. ${esc(r.name)} — ${r.score}`).join("&emsp;")}</span></li>`;
  }).join("")}</ul></div>`;
}
function reviewSection() {
  const g = S.game, maxI = g.phase === "final" ? g.questions.length - 1 : g.idx;
  const avail = g.questions.map((q, i) => ({ q, i })).filter(x => x.i <= maxI);
  const head = `<h2 style="font-size:22px">${esc(t("reviewH"))}</h2><p class="muted small" style="margin:4px 0 0">${esc(t("reviewHint"))}</p>`;
  if (!avail.length) return `<div class="panel">${head}<div class="empty">${esc(t("reviewEmpty"))}</div></div>`;
  const selId = avail.some(x => x.q.id === S.reviewQ) ? S.reviewQ : avail[avail.length - 1].q.id;
  const q = g.questions.find(x => x.id === selId), qi = g.questions.indexOf(q), k = S.keys.keys[q.id] || {};
  let lastR = null;
  const chips = avail.map(({ q: x, i }) => {
    const r = roundOfQ(x), lab = r.id !== lastR ? `<span class="rl">${esc(t("roundN", roundIndex(r.id) + 1))}</span>` : ""; lastR = r.id;
    const hasOv = S.keys.overrides[x.id] && Object.keys(S.keys.overrides[x.id]).length;
    return `${lab}<button class="chip" data-act="rq" data-q="${esc(x.id)}" aria-pressed="${x.id === selId}" title="${esc(x.text)}">${i + 1}${hasOv ? `<span class="m" aria-label="${esc(t("manualMarks"))}"></span>` : ""}</button>`;
  }).join("");
  const right = q.type === "choice" ? (k.correct != null ? `<span class="chipL ${LT[k.correct]}">${LT[k.correct]}</span> ${esc(q.options[k.correct])}` : esc(t("notSet"))) : esc((k.accepted || []).join(", ") || t("notSet"));
  const ids = sortedTeamIds(), ovs = S.keys.overrides[q.id] || {};
  const list = ids.length ? `<ul class="list">${ids.map(id => {
    const a = (S.answers[id] || {})[q.id];
    let ctl = "";
    if (a) { const ok = isCorrect(q, a, id), manual = ovs[id] != null;
      ctl = `<label class="chk ${ok ? "on" : ""}"><input type="checkbox" data-ovr="1" data-q="${esc(q.id)}" data-t="${esc(id)}" ${ok ? "checked" : ""} aria-label="${esc(t("answerOf", S.teams[id].name))}"><span>${esc(ok ? t("correct") : t("wrong"))}</span><em>${esc(manual ? t("manual") : t("auto"))}</em></label>`; }
    return `<li><span class="grow" style="min-width:0"><b>${esc(S.teams[id].name)}</b><br>${answerCell(q, a)}</span>${ctl}</li>`;
  }).join("")}</ul>` : `<p class="muted small">${esc(t("noTeamsYet"))}</p>`;
  return `<div class="panel stack">${head}
    <div class="chips" role="group">${chips}</div>
    <div class="review">
      <div class="row"><span class="qnum grow">${esc(t("qInRound", qi + 1, roundIndex(roundOfQ(q).id) + 1))}</span>${Object.keys(ovs).length ? `<button class="btn sm" data-act="auto" data-q="${esc(q.id)}">${esc(t("resetAuto"))}</button>` : ""}</div>
      <p style="font-weight:700;font-size:18px;margin:6px 0">${esc(q.text)}</p>
      <p class="small muted" style="margin:0 0 8px">${esc(q.type === "choice" ? t("correctOpt") : t("acceptedAns"))}: <span style="color:var(--ink)">${right}</span></p>
      ${list}
    </div></div>`;
}
function breakdown() {
  const qs = S.game.questions.slice(0, Math.max(0, scoredUpto() + 1)); if (!qs.length) return "";
  const ids = withRanks(leaderboard()).map(r => r.id);
  const groups = []; qs.forEach(q => { const r = roundOfQ(q); if (!groups.length || groups[groups.length - 1].r.id !== r.id) groups.push({ r, n: 0 }); groups[groups.length - 1].n++; });
  return `<details><summary style="cursor:pointer;font-weight:600">${esc(t("byQ"))}</summary><div style="overflow-x:auto;margin-top:10px"><table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><th></th>${groups.map(gr => `<th colspan="${gr.n}" style="padding:6px;font-weight:600;color:var(--ink-2);border-left:1px solid var(--line)">${esc(gr.r.name)}</th>`).join("")}</tr>
    <tr><th style="text-align:left;padding:6px">${esc(t("teamCol"))}</th>${qs.map((q, i) => `<th style="padding:6px" title="${esc(q.text)}"><button class="chip" data-act="rq" data-q="${esc(q.id)}" style="min-width:30px;padding:2px 6px">${i + 1}</button></th>`).join("")}</tr>
    ${ids.map(id => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px;white-space:nowrap">${esc(S.teams[id].name)}</td>${qs.map(q => { const a = (S.answers[id] || {})[q.id]; return `<td style="text-align:center;padding:6px">${!a ? "<span class='muted'>—</span>" : isCorrect(q, a, id) ? "<span style='color:var(--good)'>✓</span>" : "<span style='color:var(--bad)'>✗</span>"}</td>`; }).join("")}</tr>`).join("")}
  </table></div></details>`;
}
function boardHTML(rows, big, meId) {
  return `<ol class="board ${big ? "big" : ""}">${rows.map(r => `<li class="${r.rank <= 3 ? "p" + r.rank : ""} ${r.id === meId ? "me" : ""}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.name)}</span><span class="sc">${r.score}</span></li>`).join("")}</ol>`;
}

/* ----- team ----- */
function teamView() {
  const g = S.game;
  if (!S.cur || !S.games[S.cur]) return `<div class="phone"><div class="panel big-msg"><div class="glyph" aria-hidden="true">…</div><h2 style="font-size:22px;margin:14px 0 6px">${esc(t("appName"))}</h2><p class="muted">${esc(S.gamesLoaded ? t("noLive") : t("loading"))}</p></div></div>`;
  const tm = myTeam();
  if (!tm || S.renaming) {
    const closed = !g.regOpen && !tm;
    return `<div class="phone"><div class="hero stack"><h2>${esc(tm ? t("newName") : t("createTeam"))}</h2>
      <p class="muted" style="margin:0">${esc(closed ? t("regClosed") : t("deviceHint"))}</p></div>
      ${closed ? "" : `<div class="panel" style="margin-top:14px"><label class="f" for="team-name">${esc(t("teamName"))}</label>
      <div class="textans"><input type="text" id="team-name" data-ed="teamName" maxlength="40" value="${esc(S.teamName || (tm ? tm.name : ""))}" placeholder="${esc(t("teamNamePh"))}" autocomplete="off">
      <button class="btn primary" data-act="mkteam" ${S.readOnly ? "disabled" : ""}>${esc(tm ? t("save") : t("createBtn"))}</button></div>
      ${S.teamErr ? `<p class="err" role="alert">${esc(S.teamErr)}</p>` : ""}
      ${tm ? `<button class="btn ghost sm" data-act="cancelRename" style="margin-top:10px">${esc(t("cancel"))}</button>` : ""}</div>`}</div>`;
  }
  const head = `<div class="row" style="margin-bottom:14px"><span class="tag">${esc(t("teamTag"))}</span><b class="grow" style="overflow-wrap:anywhere">${esc(tm.name)}</b>${g.phase === "lobby" ? `<button class="btn sm ghost" data-act="rename">${esc(t("changeName"))}</button>` : ""}</div>`;
  const q = curQ();
  let body;
  if (g.phase === "final") body = teamBoard(t("finalRes"));
  else if (g.phase === "round") {
    const r = roundById(g.ri) || roundsOf()[0], ri = roundIndex(r.id);
    body = `<div class="panel">${coverHTML(r, ri)}<p class="qnum" style="margin:14px 0 0">${esc(t("roundLabel", ri + 1))}</p><p class="round-title" style="font-size:clamp(24px,7vw,34px)">${esc(r.name)}</p><p class="muted" style="margin:0">${esc(t("firstSoon", roundQCount(r.id)))}</p></div>${g.board ? teamBoard(t("prelimRes")) : ""}`;
  } else if (g.phase === "lobby" || !q) body = `<div class="panel big-msg"><div class="glyph" aria-hidden="true">…</div><h2 style="font-size:22px;margin:14px 0 6px">${esc(t("inGame"))}</h2><p class="muted">${esc(t("waitFirst"))}</p></div>`;
  else body = teamQuestion(q);
  if (S.teamErr) body += `<p class="err" role="alert">${esc(S.teamErr)}</p>`;
  return `<div class="phone">${head}${body}</div>`;
}
function teamQuestion(q) {
  const g = S.game, a = myAnswer(), acc = accepting(), rv = g.phase === "reveal" && g.reveal && g.reveal.qid === q.id ? g.reveal : null, r = roundOfQ(q);
  let status = "";
  if (acc) status = a ? `<span class="tag ok">${esc(t("stAccepted"))}</span>` : `<span class="tag">${esc(t("stWaiting"))}</span>`;
  else if (!rv) status = `<span class="tag">${esc(a ? t("stClosedYours") : t("stClosedNone"))}</span>`;
  let input;
  if (q.type === "choice") input = `<div class="opts">${q.options.map((o, i) => o ? `<button class="opt ${LT[i]} ${rv ? (i === rv.correct ? "right" : "dim") : (!acc && a && a.c !== i ? "dim" : "")}" data-act="pick" data-i="${i}" aria-pressed="${a?.c === i}" ${acc ? "" : "disabled"}><span class="L">${LT[i]}</span><span class="t">${esc(o)}</span></button>` : "").join("")}</div>`;
  else input = acc ? `<div class="textans"><input type="text" id="team-text" data-ed="teamText" maxlength="120" value="${esc(S.teamText)}" placeholder="${esc(t("yourAnswerPh"))}" autocomplete="off"><button class="btn primary" data-act="sendText">${esc(a ? t("change") : t("send"))}</button></div>${a ? `<p class="muted small" style="margin:8px 0 0">${esc(t("sent", a.t))}</p>` : ""}`
    : `<div class="panel" style="padding:14px">${a ? `${esc(t("yourAnswerIs"))} <b>${esc(t("q", a.t))}</b>` : `<span class="muted">${esc(t("noAns"))}</span>`}</div>`;
  let verdict = "";
  if (rv) {
    const right = Array.isArray(rv.right) ? rv.right.includes(S.me.id) : false;
    const mine = (g.board || []).find(x => x.id === S.me.id);
    verdict = `<div class="hero" style="margin-top:16px"><h2>${esc(!a ? t("vNoAnswer") : right ? t("vRight") : t("vMiss"))}</h2>
      <p class="muted" style="margin:6px 0 0">${q.type === "text" ? esc(t("correctWas", (rv.accepted || [])[0] || "—")) : ""}${mine ? esc(t("youHave", mine.score)) : ""}</p></div>`;
  }
  return `<div class="panel">
    <div class="row"><span class="tag">${esc(t("roundTag", roundIndex(r.id) + 1, r.name))}</span><span class="qnum grow">${esc(t("qOf", g.idx + 1, g.questions.length))}</span>${acc && g.deadline ? `<span class="timer" data-timer style="font-size:30px"></span>` : ""}</div>
    <p class="qtext" style="font-size:clamp(20px,5vw,26px)">${esc(q.text)}</p>
    ${q.audio || q.video ? `<p class="note" style="margin:-6px 0 16px">${esc(q.video ? t("watchNote") : t("listenNote"))}</p>` : ""}
    ${input}
    <div style="margin-top:14px">${status}</div>
  </div>${verdict}`;
}
function teamBoard(title) {
  const rows = withRanks(S.game.board || []);
  if (!rows.length) return "";
  return `<div class="panel" style="margin-top:16px"><h2 style="font-size:20px;margin-bottom:8px">${esc(title)}</h2>${boardHTML(rows, false, S.me.id)}</div>`;
}

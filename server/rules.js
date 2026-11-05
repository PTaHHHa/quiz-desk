"use strict";
/*
 * Who may see and write what.
 *  - The host sees and writes every document.
 *  - A team sees: the live game, team names of the current registration session, and its own answers.
 *    Answer keys (gkeys/*) never reach teams.
 *  - A team may only write its own team name and its own answer to the open question, before the deadline.
 */
const { ANSWER_GRACE_MS } = require("./config");

const PATH_RE = /^[A-Za-z0-9_.~:@+-]{1,100}\/[A-Za-z0-9_.~:@+-]{1,200}$/;
const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const clone = o => JSON.parse(JSON.stringify(o));

class RuleError extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new RuleError(code, status); };

function liveGame(docs) {
  const gid = (docs["game/live"] || {}).gid;
  return gid ? docs["games/" + gid] : null;
}

function viewFor(docs, viewer) {
  if (viewer.host) return docs;
  const v = {}, live = docs["game/live"] || { gid: null };
  v["game/live"] = live;
  const g = live.gid && docs["games/" + live.gid];
  if (g) {
    v["games/" + live.gid] = g;
    for (const [p, d] of Object.entries(docs)) {
      if (p.startsWith("teams/") && d && d[g.sid]) v[p] = { [g.sid]: { name: d[g.sid].name, at: d[g.sid].at } };
    }
  }
  if (viewer.uid && docs["answers/" + viewer.uid]) v["answers/" + viewer.uid] = docs["answers/" + viewer.uid];
  return v;
}

/* Applies a write to `docs` in place and returns the stored document (or null when deleted). */
function applyWrite(docs, viewer, p, data, now = Date.now()) {
  if (!PATH_RE.test(p)) fail("invalid_argument", 400);
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) fail("invalid_argument", 400);
  if (viewer.host) {
    if (data === null) delete docs[p]; else docs[p] = data;
    return docs[p] ?? null;
  }
  if (!viewer.uid) fail("no_device");
  const [col, id] = p.split("/");
  if (id !== viewer.uid || data === null) fail("forbidden");
  const g = liveGame(docs);
  if (!g) fail("no_game", 409);

  if (col === "teams") {
    const incoming = data[g.sid];
    if (!incoming || typeof incoming !== "object") fail("invalid_argument", 400);
    const name = String(incoming.name || "").trim().replace(/\s+/g, " ");
    if (!name || name.length > 40) fail("bad_name", 400);
    const own = clone(docs[p] || {}), had = own[g.sid];
    if (!had && !g.regOpen) fail("reg_closed", 409);
    if (had && g.phase !== "lobby" && had.name !== name) fail("rename_closed", 409);
    for (const [q, d] of Object.entries(docs)) {
      if (q !== p && q.startsWith("teams/") && d && d[g.sid] && norm(d[g.sid].name) === norm(name)) fail("name_taken", 409);
    }
    own[g.sid] = { name, at: had ? had.at : now };
    docs[p] = own;
    return own;
  }

  if (col === "answers") {
    if (!(docs["teams/" + viewer.uid] || {})[g.sid]) fail("not_registered", 409);
    const q = g.questions && g.questions[g.idx];
    if (!q || g.phase !== "open" || (g.deadline && now > g.deadline + ANSWER_GRACE_MS)) fail("closed", 409);
    const a = (data[g.aid] || {})[q.id];
    if (!a || typeof a !== "object") fail("invalid_argument", 400);
    let entry;
    if (q.type === "choice") {
      const c = Number(a.c);
      if (!Number.isInteger(c) || c < 0 || c > 3 || !String((q.options || [])[c] || "").trim()) fail("invalid_argument", 400);
      entry = { c, t: null, at: now };
    } else {
      const t = String(a.t || "").trim().slice(0, 120);
      if (!t) fail("invalid_argument", 400);
      entry = { c: null, t, at: now };
    }
    const own = clone(docs[p] || {});
    own[g.aid] = Object.assign({}, own[g.aid] || {}, { [q.id]: entry });
    docs[p] = own;
    return own;
  }
  fail("forbidden");
}

/* Locks every game whose answer timer has run out. Returns true if anything changed. */
function lockExpired(docs, now = Date.now()) {
  let any = false;
  for (const [p, g] of Object.entries(docs)) {
    if (p.startsWith("games/") && g && g.phase === "open" && g.deadline && now >= g.deadline) {
      g.phase = "locked"; g.updatedAt = now; any = true;
    }
  }
  return any;
}

module.exports = { viewFor, applyWrite, lockExpired, norm, RuleError };

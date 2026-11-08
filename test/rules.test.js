"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { viewFor, applyWrite, lockExpired, norm } = require("../server/rules");

const HOST = { host: true, uid: "u_host" };
const A = { host: false, uid: "u_aaaa" };
const B = { host: false, uid: "u_bbbb" };

function docs(over = {}) {
  return {
    "game/live": { gid: "g1" },
    "games/g1": Object.assign({
      title: "T", lang: "en", regOpen: true, phase: "lobby", idx: -1, sid: "s1", aid: "a1", deadline: null,
      questions: [
        { id: "q1", type: "choice", options: ["x", "y", "", ""] },
        { id: "q2", type: "text", options: ["", "", "", ""] }
      ]
    }, over),
    "gkeys/g1": { keys: { q1: { correct: 1 } }, overrides: {} }
  };
}
const err = code => e => e.code === code;

test("normalisation ignores case, ё and punctuation", () => {
  assert.equal(norm("  Ёлка, ЁЖ!  "), "елка еж");
  assert.equal(norm("Canberra."), norm("canberra"));
});

test("teams never see answer keys or other teams' answers", () => {
  const d = docs();
  d["answers/u_bbbb"] = { a1: { q1: { c: 1 } } };
  const v = viewFor(d, A);
  assert.ok(!Object.keys(v).some(k => k.startsWith("gkeys/")));
  assert.ok(!("answers/u_bbbb" in v));
  assert.ok("games/g1" in v);
  assert.ok("gkeys/g1" in viewFor(d, HOST));
});

test("team registration: own doc only, unique names, closed registration", () => {
  const d = docs();
  assert.throws(() => applyWrite(d, A, "teams/u_bbbb", { s1: { name: "X" } }), err("forbidden"));
  applyWrite(d, A, "teams/u_aaaa", { s1: { name: "Owls" } });
  assert.throws(() => applyWrite(d, B, "teams/u_bbbb", { s1: { name: "owls!" } }), err("name_taken"));
  assert.throws(() => applyWrite(d, B, "teams/u_bbbb", { s1: { name: "" } }), err("bad_name"));
  d["games/g1"].regOpen = false;
  assert.throws(() => applyWrite(d, B, "teams/u_bbbb", { s1: { name: "Cats" } }), err("reg_closed"));
});

test("teams cannot write games or keys", () => {
  const d = docs();
  assert.throws(() => applyWrite(d, A, "gkeys/g1", { keys: {} }), err("forbidden"));
  assert.throws(() => applyWrite(d, A, "games/g1", {}), err("forbidden"));
});

test("answers are accepted only for the open question before the deadline", () => {
  const now = 1_000_000;
  const d = docs({ phase: "open", idx: 0, deadline: now + 10_000 });
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 1 } } }, now), err("not_registered"));
  applyWrite(d, A, "teams/u_aaaa", { s1: { name: "Owls" } }, now);
  const stored = applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 1 }, q2: { t: "sneaky" } } }, now);
  assert.equal(stored.a1.q1.c, 1);
  assert.ok(!stored.a1.q2, "only the current question is stored");
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 2 } } }, now), err("invalid_argument"), "empty option");
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 0 } } }, now + 20_000), err("closed"));
  d["games/g1"].phase = "locked";
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 0 } } }, now), err("closed"));
});

test("free-text answers are trimmed and limited", () => {
  const d = docs({ phase: "open", idx: 1 });
  applyWrite(d, A, "teams/u_aaaa", { s1: { name: "Owls" } });
  const s = applyWrite(d, A, "answers/u_aaaa", { a1: { q2: { t: "  " + "x".repeat(300) } } });
  assert.equal(s.a1.q2.t.length, 120);
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q2: { t: "   " } } }), err("invalid_argument"));
});

test("expired timers lock the game", () => {
  const d = docs({ phase: "open", idx: 0, deadline: 100 });
  assert.equal(lockExpired(d, 50), false);
  assert.equal(lockExpired(d, 150), true);
  assert.equal(d["games/g1"].phase, "locked");
});

test("host can write and delete any document", () => {
  const d = docs();
  applyWrite(d, HOST, "games/g2", { title: "New" });
  assert.equal(d["games/g2"].title, "New");
  applyWrite(d, HOST, "games/g2", null);
  assert.ok(!("games/g2" in d));
  assert.throws(() => applyWrite(d, HOST, "../etc/passwd", {}), err("invalid_argument"));
});

const REVIEW = { rid: "r1", step: 0, items: [
  { qid: "q1", correct: 1, accepted: [], right: ["u_aaaa"] },
  { qid: "q2", correct: null, accepted: ["canberra"], right: [] }
] };

test("round mode: teams get no review data outside the review phase", () => {
  for (const phase of ["open", "locked", "round", "final"]) {
    const d = docs({ phase, idx: 0, revealMode: "round", review: REVIEW });
    assert.equal(viewFor(d, A)["games/g1"].review, null, phase);
    assert.deepEqual(viewFor(d, HOST)["games/g1"].review, REVIEW, "host sees everything");
  }
});

test("round mode: during the review teams only get the questions the host has reached", () => {
  const d = docs({ phase: "review", idx: 1, revealMode: "round", review: REVIEW });
  let r = viewFor(d, A)["games/g1"].review;
  assert.deepEqual(r.items.map(i => i.qid), ["q1"]);
  d["games/g1"].review = { ...REVIEW, step: 1 };
  r = viewFor(d, A)["games/g1"].review;
  assert.deepEqual(r.items.map(i => i.qid), ["q1", "q2"]);
  d["games/g1"].review = { ...REVIEW, step: 2 };
  assert.equal(viewFor(d, A)["games/g1"].review.items.length, 2, "the results step shows the whole round");
  assert.equal(d["games/g1"].review.items.length, 2, "the stored game is not modified");
  d["games/g1"].review = { ...REVIEW, step: "junk" };
  assert.equal(viewFor(d, A)["games/g1"].review.items.length, 1, "a broken step falls back to the first question");
});

test("a stale reveal is never sent to teams", () => {
  const reveal = { qid: "q1", correct: 1, accepted: [], right: [] };
  const d = docs({ phase: "locked", idx: 0, reveal });
  assert.equal(viewFor(d, A)["games/g1"].reveal, null);
  d["games/g1"].phase = "reveal";
  assert.deepEqual(viewFor(d, A)["games/g1"].reveal, reveal);
});

test("old games without revealMode or review still work for teams", () => {
  const v = viewFor(docs({ phase: "open", idx: 0 }), A)["games/g1"];
  assert.ok(!("review" in v) && !("revealMode" in v));
  assert.equal(v.phase, "open");
});

test("round mode: answers are still accepted only while the question is open", () => {
  const d = docs({ phase: "locked", idx: 0, revealMode: "round" });
  applyWrite(d, A, "teams/u_aaaa", { s1: { name: "Owls" } });
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 1 } } }), err("closed"));
  d["games/g1"].phase = "review";
  assert.throws(() => applyWrite(d, A, "answers/u_aaaa", { a1: { q1: { c: 1 } } }), err("closed"));
});

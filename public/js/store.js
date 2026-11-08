/* Quiz Desk — store.js
 * Data layer. createServerDb() talks to the local server (SSE + REST); createMockDb() powers demo mode when the page is opened without a server.
 */
"use strict";
/* ---------- demo store ---------- */
function createMockDb() {
  const store = new Map(), dl = new Map(), cl = new Map();
  const parent = p => p.split("/").slice(0, -1).join("/");
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = p => { const d = store.get(p); return { id: p.split("/").pop(), exists: !!d, data: () => d ? clone(d) : undefined, metadata: meta }; };
  const snapCol = c => { const docs = [...store.keys()].filter(p => parent(p) === c).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }; };
  const notify = p => setTimeout(() => {
    (dl.get(p) || new Set()).forEach(f => f(snapDoc(p)));
    (cl.get(parent(p)) || new Set()).forEach(f => f(snapCol(parent(p))));
  });
  const doc = p => ({
    id: p.split("/").pop(), path: p,
    get: async () => snapDoc(p),
    set: async d => { store.set(p, clone(d)); notify(p); },
    delete: async () => { store.delete(p); notify(p); },
    onSnapshot(n) { if (!dl.has(p)) dl.set(p, new Set()); dl.get(p).add(n); setTimeout(() => n(snapDoc(p))); return () => dl.get(p).delete(n); }
  });
  const collection = c => ({
    doc: id => doc(c + "/" + id), get: async () => snapCol(c),
    onSnapshot(n) { if (!cl.has(c)) cl.set(c, new Set()); cl.get(c).add(n); setTimeout(() => n(snapCol(c))); return () => cl.get(c).delete(n); }
  });
  return { doc, collection };
}
const mockAssets = { async upload(file) { const id = (uid() + uid() + uid() + uid()).slice(0, 32); S.blobs[id] = URL.createObjectURL(file); return { id, url: S.blobs[id] }; } };
function demoSeed(db) {
  const now = Date.now(), day = 86400000;
  db.doc("games/g_demo_en").set({ ...clone(DEFAULT_GAME), title: "Friday Quiz", lang: "en", createdAt: now - 2 * day, sid: "s_en1", aid: "a_en1",
    rounds: [{ id: "r1", name: "Space & geography", image: null, music: null, musicName: "" }, { id: "r2", name: "Music break", image: null, music: null, musicName: "" }],
    questions: [
      { id: "q1", round: "r1", text: "Which is the largest planet in the Solar System?", type: "choice", options: ["Saturn", "Jupiter", "Neptune", "Earth"], time: 30, points: 1 },
      { id: "q2", round: "r1", text: "Name the capital of Australia", type: "text", options: ["", "", "", ""], time: 45, points: 1 },
      { id: "q3", round: "r2", text: "How many strings does a classical violin have?", type: "choice", options: ["3", "4", "5", "6"], time: 20, points: 1 }] });
  db.doc("gkeys/g_demo_en").set({ keys: { q1: { correct: 1, accepted: [] }, q2: { correct: null, accepted: ["Canberra"] }, q3: { correct: 1, accepted: [] } }, overrides: {} });
  db.doc("games/g_demo_ru").set({ ...clone(DEFAULT_GAME), title: "Кино и сериалы", lang: "ru", createdAt: now - 9 * day, sid: "s_ru2", aid: "a_ru2",
    history: [{ aid: "a_ru1", at: now - 7 * day, board: [{ id: "x1", name: "Совы", score: 3 }, { id: "x2", name: "Котики", score: 2 }, { id: "x3", name: "Без шансов", score: 1 }] }],
    rounds: [{ id: "r1", name: "Классика", image: null, music: null, musicName: "" }],
    questions: [
      { id: "q1", round: "r1", text: "В каком году вышел фильм «Титаник» Джеймса Кэмерона?", type: "choice", options: ["1995", "1997", "1999", "2001"], time: 30, points: 1 },
      { id: "q2", round: "r1", text: "Как зовут главного героя трилогии «Назад в будущее»?", type: "text", options: ["", "", "", ""], time: 40, points: 1 }] });
  db.doc("gkeys/g_demo_ru").set({ keys: { q1: { correct: 1, accepted: [] }, q2: { correct: null, accepted: ["Марти Макфлай", "Марти"] } }, overrides: {} });
  db.doc("game/live").set({ gid: null });
}

/* ---------- local server client ---------- */
const DEVICE = (() => {
  const make = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, x => x.toString(16).padStart(2, "0")).join(""); };
  try { let d = localStorage.getItem("quizdesk-device"); if (!d || !/^[a-f0-9]{32}$/.test(d)) { d = make(); localStorage.setItem("quizdesk-device", d); } return d; }
  catch (e) { return make(); }
})();
const HOST_TOKEN = (() => {
  try {
    const u = new URL(location.href), h = u.searchParams.get("host");
    if (h) { localStorage.setItem("quizdesk-host", h); u.searchParams.delete("host"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
    return localStorage.getItem("quizdesk-host") || "";
  } catch (e) { return ""; }
})();
async function api(method, url, body, extra) {
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  const headers = Object.assign({ "X-Device": DEVICE, "X-Host": HOST_TOKEN }, body && !isBlob ? { "Content-Type": "application/json" } : {}, extra || {});
  const r = await fetch(url, { method, headers, body: isBlob ? body : body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return j || { ok: false, code: "error" };
}
function createServerDb() {
  const mirror = {}, subs = new Set(); let ready = false;
  const parent = p => p.split("/").slice(0, -1).join("/");
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = p => { const d = mirror[p]; return { id: p.split("/").pop(), exists: !!d, data: () => d ? clone(d) : undefined, metadata: meta }; };
  const colPaths = c => Object.keys(mirror).filter(p => parent(p) === c).sort();
  const snapCol = c => { const docs = colPaths(c).map(snapDoc); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }; };
  const sig = s => s.kind === "doc" ? JSON.stringify(mirror[s.path] ?? null) : JSON.stringify(colPaths(s.path).map(p => [p, mirror[p]]));
  const fire = s => { const g = sig(s); if (g === s.last) return; s.last = g; s.next(s.kind === "doc" ? snapDoc(s.path) : snapCol(s.path)); };
  const fireAll = () => { if (ready) subs.forEach(fire); };
  const es = new EventSource(`/api/stream?d=${encodeURIComponent(DEVICE)}&h=${encodeURIComponent(HOST_TOKEN)}`);
  es.addEventListener("state", ev => {
    const v = JSON.parse(ev.data);
    Object.keys(mirror).forEach(k => delete mirror[k]); Object.assign(mirror, v);
    ready = true; if (S.stale) { S.stale = false; render(); } fireAll();
  });
  es.addEventListener("net", ev => { // host only: addresses and hotspot flag, refreshed by the server
    const n = JSON.parse(ev.data), cur = (S.join || [])[S.joinIdx];
    S.join = n.join || []; S.hotspot = !!n.hotspot;
    S.joinIdx = Math.max(0, S.join.indexOf(cur)); render();
  });
  es.onerror = () => { if (!S.stale) { S.stale = true; render(); } };
  const put = async (p, data) => {
    if (data) mirror[p] = clone(data); else delete mirror[p];
    fireAll();
    let r; try { r = await api("POST", "/api/doc", { path: p, data: data || null }); } catch (e) { r = { ok: false, code: "offline" }; }
    if (r.doc) mirror[p] = r.doc; else if (r.doc === null) delete mirror[p];
    fireAll();
    if (!r.ok) throw { code: r.code || "error" };
  };
  const sub = (kind, p, next) => { const s = { kind, path: p, next, last: undefined }; subs.add(s); if (ready) setTimeout(() => fire(s)); return () => subs.delete(s); };
  const doc = p => ({ id: p.split("/").pop(), path: p, get: async () => snapDoc(p), set: d => put(p, d), delete: () => put(p, null), onSnapshot: n => sub("doc", p, n) });
  const collection = c => ({ doc: id => doc(c + "/" + id), get: async () => snapCol(c), onSnapshot: n => sub("col", c, n) });
  return { doc, collection };
}
const serverAssets = {
  async upload(file, opts) {
    const r = await api("POST", "/api/upload", file, { "Content-Type": (opts && opts.type) || file.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name || "") });
    if (!r.ok) throw { code: r.code };
    return r;
  }
};

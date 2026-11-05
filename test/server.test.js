"use strict";
/* Starts the real server on a free port with a temporary data folder and checks the HTTP API. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const net = require("net");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "quizdesk-test-"));
let proc, PORT, BASE;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

test.before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  proc = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")], {
    env: Object.assign({}, process.env, { PORT: String(PORT), NO_OPEN: "1", QUIZDESK_DATA: DATA }), stdio: "ignore"
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + "/api/me"); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error("server did not start");
});
test.after(async () => {
  if (proc && proc.exitCode === null) await new Promise(resolve => { proc.once("exit", resolve); proc.kill(); });
  fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("localhost is the host and gets the example game", async () => {
  const me = await (await fetch(BASE + "/api/me")).json();
  assert.equal(me.host, true);
  assert.ok(fs.existsSync(path.join(DATA, "db.json")));
});

test("serves the app and its static files, blocks path traversal", async () => {
  assert.match(await (await fetch(BASE + "/")).text(), /<title>Quiz Desk<\/title>/);
  const css = await fetch(BASE + "/css/styles.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  const js = await fetch(BASE + "/js/qr.js");
  assert.match(js.headers.get("content-type"), /javascript/);
  const evil = await fetch(BASE + "/..%2fserver%2findex.js");
  assert.notEqual((await evil.text()).includes("require("), true);
});

test("uploads media and serves byte ranges", async () => {
  const body = Buffer.alloc(5000, 1);
  const up = await (await fetch(BASE + "/api/upload", { method: "POST", headers: { "Content-Type": "video/mp4", "X-Filename": "clip.mp4" }, body })).json();
  assert.equal(up.ok, true);
  const r = await fetch(BASE + up.url, { headers: { Range: "bytes=100-199" } });
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 100);
  const bad = await (await fetch(BASE + "/api/upload", { method: "POST", headers: { "Content-Type": "text/html" }, body: "<b>x</b>" })).json();
  assert.equal(bad.code, "unsupported_type");
});

test("streams state over Server-Sent Events", async () => {
  const ctl = new AbortController();
  const res = await fetch(BASE + "/api/stream", { signal: ctl.signal });
  const reader = res.body.getReader();
  let text = "";
  while (!/event: state\ndata: .*\n\n/.test(text)) text += Buffer.from((await reader.read()).value).toString();
  ctl.abort();
  const state = JSON.parse(text.match(/event: state\ndata: (.*)\n\n/)[1]);
  assert.ok(state["games/g_example"]);
});

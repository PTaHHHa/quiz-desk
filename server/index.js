#!/usr/bin/env node
"use strict";
/*
 * Quiz Desk — local server. No dependencies, Node.js 18+.
 * Start:  npm start   (or: node server/index.js)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");

const { PORT, PUBLIC, MEDIA, DATA, MAX_UPLOAD, OPEN_BROWSER } = require("./config");
const store = require("./store");
const { viewFor, applyWrite, lockExpired } = require("./rules");
const { send, readJson, serveFile, joinUrls, STATIC_TYPES } = require("./http-utils");

const db = store.db;

/* ---------- identity ---------- */
const uidFromSecret = s => "u_" + crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const isLoopback = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function who(req, url) {
  const secret = req.headers["x-device"] || url.searchParams.get("d") || "";
  const token = req.headers["x-host"] || url.searchParams.get("h") || "";
  return {
    uid: /^[a-f0-9]{16,64}$/.test(secret) ? uidFromSecret(secret) : null,
    host: isLoopback(req) || (!!token && safeEq(token, db.hostToken))
  };
}

/* ---------- realtime (Server-Sent Events) ---------- */
const clients = new Set();
function sendState(c, force) {
  const s = JSON.stringify(viewFor(db.docs, c));
  if (!force && s === c.last) return;
  c.last = s;
  c.res.write("event: state\ndata: " + s + "\n\n");
}
let pushTimer = null;
function changed() {
  store.save();
  if (pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; for (const c of clients) sendState(c); }, 25);
}
setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 20000);
setInterval(() => { if (lockExpired(db.docs)) changed(); }, 300);

/* ---------- uploads ---------- */
const MEDIA_TYPES = /^(image\/(png|jpeg|webp|gif)|audio\/[a-z0-9.+-]+|video\/(mp4|webm|quicktime|x-m4v))$/;
function upload(req, res, w) {
  if (!w.host) return send(res, 403, { ok: false, code: "forbidden" });
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!MEDIA_TYPES.test(type)) return send(res, 415, { ok: false, code: "unsupported_type" });
  if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { ok: false, code: "too_large" });
  const id = crypto.randomBytes(16).toString("hex"), file = path.join(MEDIA, id), tmp = file + ".part";
  const out = fs.createWriteStream(tmp);
  let size = 0, aborted = false;
  req.on("data", ch => {
    size += ch.length;
    if (size > MAX_UPLOAD && !aborted) { aborted = true; out.destroy(); fs.rm(tmp, () => {}); send(res, 413, { ok: false, code: "too_large" }); req.destroy(); }
  });
  req.pipe(out);
  out.on("finish", () => {
    if (aborted) return;
    if (!size) { fs.rm(tmp, () => {}); return send(res, 400, { ok: false, code: "invalid_request" }); }
    fs.renameSync(tmp, file);
    let name = ""; try { name = decodeURIComponent(String(req.headers["x-filename"] || "")).slice(0, 200); } catch (e) {}
    db.media[id] = { type, name, size, at: Date.now() };
    store.save();
    send(res, 200, { ok: true, id, url: "/media/" + id, sizeBytes: size, contentType: type });
  });
  out.on("error", () => { if (!aborted) send(res, 500, { ok: false, code: "upstream_error" }); });
}

/* ---------- static files ---------- */
function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden");
  const type = STATIC_TYPES[path.extname(file).toLowerCase()];
  fs.stat(file, (err, st) => {
    if (!err && st.isFile() && type) return serveFile(req, res, file, type, "no-cache");
    serveFile(req, res, path.join(PUBLIC, "index.html"), STATIC_TYPES[".html"], "no-cache");
  });
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1B1E3C"/><rect x="12" y="12" width="18" height="18" rx="4" fill="#FF6B57"/><rect x="34" y="12" width="18" height="18" rx="4" fill="#7B5CFA"/><rect x="12" y="34" width="18" height="18" rx="4" fill="#F5A623"/><rect x="34" y="34" width="18" height="18" rx="4" fill="#14A98F"/></svg>`;

/* ---------- routes ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/me" && req.method === "GET") {
      const w = who(req, url), urls = joinUrls(PORT);
      return send(res, 200, { uid: w.uid, host: w.host, join: urls, hostLink: w.host && urls[0] ? urls[0] + "?host=" + db.hostToken : null });
    }
    if (p === "/api/stream" && req.method === "GET") {
      const w = who(req, url);
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 2000\n\n");
      const c = { res, uid: w.uid, host: w.host, last: null };
      clients.add(c); sendState(c, true);
      req.on("close", () => clients.delete(c));
      return;
    }
    if (p === "/api/doc" && req.method === "POST") {
      const w = who(req, url), body = await readJson(req), docPath = String(body.path || "");
      try {
        const doc = applyWrite(db.docs, w, docPath, body.data === undefined ? null : body.data);
        changed();
        return send(res, 200, { ok: true, doc });
      } catch (e) {
        if (!e.code) throw e;
        return send(res, e.status || 500, { ok: false, code: e.code, doc: viewFor(db.docs, w)[docPath] ?? null });
      }
    }
    if (p === "/api/upload" && req.method === "POST") return upload(req, res, who(req, url));
    if (p.startsWith("/media/") && (req.method === "GET" || req.method === "HEAD")) {
      const id = p.slice(7);
      if (!/^[a-f0-9]{32}$/.test(id) || !db.media[id]) return send(res, 404, "Not found");
      return serveFile(req, res, path.join(MEDIA, id), db.media[id].type, "public, max-age=31536000, immutable");
    }
    if (p === "/favicon.svg") return send(res, 200, FAVICON, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, p);
    send(res, 405, "Method not allowed");
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { ok: false, code: e.code || "error" });
  }
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") console.error(`\nPort ${PORT} is busy. Close the other program or use another port, e.g.  PORT=3001 npm start\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  const urls = joinUrls(PORT);
  console.log("\n  Quiz Desk is running\n");
  console.log(`  Host, on this computer:     http://localhost:${PORT}/`);
  if (urls.length) {
    console.log(`  Teams join (same Wi-Fi):    ${urls[0]}`);
    urls.slice(1).forEach(u => console.log(`                              ${u}`));
    console.log(`  Host from another device:   ${urls[0]}?host=${db.hostToken}`);
  } else console.log("  No network found — teams can't join until this computer is on Wi-Fi.");
  console.log(`\n  Data folder: ${DATA}\n  Stop with Ctrl+C\n`);
  if (OPEN_BROWSER) {
    const u = `http://localhost:${PORT}/`;
    const cmd = process.platform === "darwin" ? `open "${u}"` : process.platform === "win32" ? `start "" "${u}"` : `xdg-open "${u}"`;
    exec(cmd, () => {});
  }
});

const shutdown = () => { try { store.flush(); } catch (e) {} process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

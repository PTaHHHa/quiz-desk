"use strict";
const fs = require("fs");
const os = require("os");

function send(res, status, body, headers = {}) {
  const raw = Buffer.isBuffer(body) || typeof body === "string";
  res.writeHead(status, Object.assign({
    "Content-Type": raw ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, headers));
  res.end(raw ? body : JSON.stringify(body));
}

function readJson(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", ch => {
      size += ch.length;
      if (size > limit) { reject(Object.assign(new Error("too_large"), { status: 413, code: "too_large" })); req.destroy(); }
      else chunks.push(ch);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (e) { reject(Object.assign(new Error("bad_json"), { status: 400, code: "invalid_argument" })); }
    });
    req.on("error", reject);
  });
}

/* Streams a file with HTTP Range support so audio and video can be seeked. */
function serveFile(req, res, file, type, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Not found");
    const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache || "no-cache", "X-Content-Type-Options": "nosniff" };
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : st.size - 1;
      if (!range[1] && range[2]) { start = Math.max(0, st.size - Number(range[2])); end = st.size - 1; }
      end = Math.min(end, st.size - 1);
      if (start > end || start >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, Object.assign(base, { "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${st.size}` }));
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign(base, { "Content-Length": st.size }));
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* Addresses the laptop gets when its mobile hotspot is on: Windows, macOS, Linux (NetworkManager). */
const HOTSPOT_IPS = ["192.168.137.1", "192.168.2.1", "10.42.0.1"];
const isHotspot = ips => ips.some(ip => HOTSPOT_IPS.includes(ip));

/* LAN addresses teams can use: the hotspot address first, then likely Wi-Fi ranges. */
function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(ifaces)) for (const a of list || []) {
    if (a.family === "IPv4" && !a.internal) out.push(a.address);
  }
  const rank = ip => HOTSPOT_IPS.includes(ip) ? -1 : ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}
/* What the host page needs for the QR code: join URLs (hotspot first) and the hotspot flag. */
function networkInfo(port, ifaces) {
  const ips = lanAddresses(ifaces);
  return { join: ips.map(ip => `http://${ip}:${port}/`), hotspot: isHotspot(ips) };
}
const joinUrls = (port, ifaces) => networkInfo(port, ifaces).join;

const STATIC_TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2" };

module.exports = { send, readJson, serveFile, joinUrls, networkInfo, lanAddresses, isHotspot, HOTSPOT_IPS, STATIC_TYPES };

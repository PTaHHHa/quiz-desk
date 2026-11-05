"use strict";
/* JSON-file storage: documents keyed by "collection/id", media metadata and the host token. */
const fs = require("fs");
const crypto = require("crypto");
const { DATA, MEDIA, DB_FILE } = require("./config");
const seed = require("./seed");

const rid = () => crypto.randomBytes(5).toString("hex");

function load() {
  fs.mkdirSync(MEDIA, { recursive: true });
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    d.docs = d.docs || {};
    d.media = d.media || {};
    if (!d.hostToken) d.hostToken = crypto.randomBytes(12).toString("hex");
    return d;
  } catch (e) {
    if (fs.existsSync(DB_FILE)) {
      const bak = DB_FILE + ".broken-" + Date.now();
      fs.copyFileSync(DB_FILE, bak);
      console.error("Could not read " + DB_FILE + " — a copy was saved to " + bak);
    }
    return { hostToken: crypto.randomBytes(12).toString("hex"), media: {}, docs: seed(rid) };
  }
}

const db = load();
let timer = null;

function saveNow() {
  clearTimeout(timer); timer = null;
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function save() { clearTimeout(timer); timer = setTimeout(saveNow, 250); }
function flush() { if (timer) saveNow(); }

saveNow();
module.exports = { db, save, flush, rid };

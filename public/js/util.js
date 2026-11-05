/* Quiz Desk — util.js
 * Small shared helpers: escaping, ids, cloning, text normalisation.
 */
"use strict";
/* ---------- helpers ---------- */
const $app = document.getElementById("app");
const LT = ["A","B","C","D"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

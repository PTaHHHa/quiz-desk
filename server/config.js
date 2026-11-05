"use strict";
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = process.env.QUIZDESK_DATA ? path.resolve(process.env.QUIZDESK_DATA) : path.join(ROOT, "data");

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ROOT,
  PUBLIC: path.join(ROOT, "public"),
  DATA,
  MEDIA: path.join(DATA, "media"),
  DB_FILE: path.join(DATA, "db.json"),
  MAX_UPLOAD: (Number(process.env.QUIZDESK_MAX_UPLOAD_MB) || 500) * 1024 * 1024,
  ANSWER_GRACE_MS: 1500,
  OPEN_BROWSER: !process.env.NO_OPEN
};

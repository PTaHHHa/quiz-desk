"use strict";
/* Example quiz created on the very first start (when data/db.json does not exist). */
module.exports = function seed(rid) {
  const now = Date.now();
  return {
    "game/live": { gid: null },
    "games/g_example": {
      title: "Example quiz", lang: "en", createdAt: now, updatedAt: now,
      regOpen: true, phase: "lobby", idx: -1, ri: null, deadline: null, reveal: null, board: null, boardKind: null,
      sid: "s_" + rid(), aid: "a_" + rid(), history: [],
      rounds: [
        { id: "r1", name: "Space & geography", image: null, music: null, musicName: "" },
        { id: "r2", name: "Music break", image: null, music: null, musicName: "" }
      ],
      questions: [
        { id: "q1", round: "r1", text: "Which is the largest planet in the Solar System?", type: "choice", options: ["Saturn", "Jupiter", "Neptune", "Earth"], time: 30, points: 1, audio: null, video: null },
        { id: "q2", round: "r1", text: "Name the capital of Australia", type: "text", options: ["", "", "", ""], time: 45, points: 1, audio: null, video: null },
        { id: "q3", round: "r2", text: "How many strings does a classical violin have?", type: "choice", options: ["3", "4", "5", "6"], time: 20, points: 1, audio: null, video: null }
      ]
    },
    "gkeys/g_example": {
      keys: { q1: { correct: 1, accepted: [] }, q2: { correct: null, accepted: ["Canberra"] }, q3: { correct: 1, accepted: [] } },
      overrides: {}
    }
  };
};

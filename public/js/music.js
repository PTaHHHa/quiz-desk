/* Quiz Desk — music.js
 * Background music: uploaded tracks or the built-in Web Audio synth loop.
 */
"use strict";
/* ---------- music ---------- */
const SONGS = [
  { bpm: 92, prog: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] },
  { bpm: 100, prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]] },
  { bpm: 86, prog: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]] },
  { bpm: 96, prog: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]] }
];
const Music = {
  ctx: null, master: null, noise: null, bus: null, timer: null, el: null, key: null, playing: false, blocked: false, vol: 0.6,
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol * 0.35;
    const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.3, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b; return true;
  },
  play(key, src, variant) {
    if (this.key === key && this.playing) return;
    this.stop(); this.key = key; this.playing = true; this.blocked = false;
    if (src) {
      const el = new Audio(src); el.loop = true; el.volume = this.vol; this.el = el;
      el.play().catch(() => { if (this.el === el) { this.blocked = true; render(); } });
    } else {
      if (!this.ensure()) return;
      this.ctx.resume().catch(() => {});
      setTimeout(() => { if (this.playing && !this.el && this.ctx.state !== "running") { this.blocked = true; render(); } }, 400);
      this.synth(variant || 0);
    }
  },
  stop() {
    this.playing = false; this.key = null;
    if (this.el) { this.el.pause(); this.el.removeAttribute("src"); this.el = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.bus) { const b = this.bus; b.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); setTimeout(() => b.disconnect(), 700); this.bus = null; }
  },
  setVol(v) { this.vol = v; if (this.el) this.el.volume = v; if (this.master) this.master.gain.value = v * 0.35; },
  synth(variant) {
    const ctx = this.ctx, bus = ctx.createGain(); bus.connect(this.master); this.bus = bus;
    const song = SONGS[variant % SONGS.length], spb = 60 / song.bpm / 4, noise = this.noise;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const tone = (m, tt, dur, type, gain, cut, att) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = type; o.frequency.value = mtof(m); f.type = "lowpass"; f.frequency.value = cut;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(gain, tt + att); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      o.connect(f); f.connect(g); g.connect(bus); o.start(tt); o.stop(tt + dur + 0.05);
    };
    const hat = (tt, gain) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; f.type = "highpass"; f.frequency.value = 7000;
      g.gain.setValueAtTime(gain, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      s.connect(f); f.connect(g); g.connect(bus); s.start(tt); s.stop(tt + 0.06);
    };
    const kick = tt => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, tt); o.frequency.exponentialRampToValueAtTime(45, tt + 0.12);
      g.gain.setValueAtTime(0.45, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
      o.connect(g); g.connect(bus); o.start(tt); o.stop(tt + 0.3);
    };
    const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
    let step = 0, tt = ctx.currentTime + 0.1;
    const sched = () => {
      while (tt < ctx.currentTime + 0.2) {
        const ch = song.prog[Math.floor(step / 16) % song.prog.length], s = step % 16;
        if (s === 0) { ch.forEach(m => tone(m, tt, spb * 16, "triangle", 0.05, 1200, 0.3)); tone(ch[0] - 12, tt, spb * 7, "sine", 0.2, 400, 0.02); kick(tt); }
        if (s === 8) { tone(ch[0] - 12, tt, spb * 7, "sine", 0.16, 400, 0.02); kick(tt); }
        if (s % 2 === 0) tone(ch[ARP[(s / 2) % 8]] + 12, tt, spb * 1.6, "square", 0.025, 2200, 0.01);
        if (s % 4 === 2) hat(tt, 0.05);
        tt += spb; step++;
      }
    };
    sched(); this.timer = setInterval(sched, 30);
  }
};
const mediaQActive = () => { const cq = curQ(); return !!(cq && (cq.audio || cq.video) && ["open", "locked", "reveal"].includes(S.game.phase)); };
function syncMusic() {
  if (S.preview) return;
  const g = S.game, rid = curRoundId();
  if (!S.me.canEdit || S.screen !== "game" || !S.musicOn || mediaQActive() || !["round", "open", "locked", "reveal"].includes(g.phase) || !rid) { if (Music.playing) Music.stop(); return; }
  const r = roundById(rid); if (!r) return;
  Music.play(S.cur + ":" + rid + ":" + (r.music || "synth"), r.music ? assetUrl(r.music) : null, roundIndex(rid));
}

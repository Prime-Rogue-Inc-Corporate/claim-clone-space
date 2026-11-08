// Bureau of Public Cheer · the Bulletin Tower Broadcast. A rhythm game.
// The anthem plays; cues fall in three lanes (SMILE · WAVE · CHEER). Hit them on the line, on the beat.
// Public Cheer is measured to two decimal places; let it hit zero and the broadcast is cut.
// From the third grade, FROWN cues appear: do not press those. "Smile. It's mandatory."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SONG_S = 60, LEAD_S = 1.6; // seconds a cue takes to fall
export const CHEER_GRADES = [
  ['Smile Trainee', 0], ['Applauder', 100], ['Crowd Warmer', 250], ['Slogan Reader', 450], ['Jingle Writer', 700], ['Cheer Officer', 1000],
  ['Senior Cheer Officer', 1400], ['Bulletin Editor', 1900], ['Weather Scheduler', 2500], ['Oath Keeper (Line Nine)', 3200],
  ['Deputy Director of Cheer', 4000], ['Director of Public Cheer', 5000], ['The Bulletin', 6500],
];
const LANES = [['SMILE', '#d6f08a', '1'], ['WAVE', '#4fc3f7', '2'], ['CHEER', '#ff7ad6', '3']];
const LANE_X0 = 170, LANE_W = 100, HIT_Y = 318, TOP_Y = 46;
const PERFECT = 0.05, GOOD = 0.11, STRAY = 0.16;
const SLOGANS = ['SMILE. IT’S MANDATORY.', 'PUBLIC CHEER IS UP 0.13%.', 'TOMORROW’S WEATHER HAS BEEN SCHEDULED.', 'LINE NINE IS NOT IMPORTANT.', 'THE SPRAWL IS GRATEFUL.', 'YOUR NUMBER LOVES YOU.', 'FROWNING IS A FORM OF LITTERING.', 'REPORT UNSMILING NEIGHBOURS.', 'THIS BROADCAST IS VOLUNTARY AND MANDATORY.'];

export function createBureau({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.bureau ||= { xp: 0, last: 0, best: 0, shifts: 0, mute: false };
  const B = ST.bureau;
  const blocks = world.spine.blocks || [];
  const b13 = blocks[12] || { x0: 14870, x1: 17730 };
  const SITE = { x: (b13.x0 + b13.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = B.xp) => { let i = 0; CHEER_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (B.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#2a2633'; c.fillRect(x0, y0, 480, 240);
    // the big screen
    c.fillStyle = '#111'; c.fillRect(x0 + 90, y0 + 44, 300, 110);
    const beat = Math.floor(time / 577) % 2;
    c.fillStyle = beat ? '#d6f08a' : '#c8e04a';
    c.beginPath(); c.arc(SITE.x, y0 + 99, 38, 0, 7); c.fill(); // the Bureau smile
    c.fillStyle = '#111'; c.beginPath(); c.arc(SITE.x - 13, y0 + 88, 5, 0, 7); c.arc(SITE.x + 13, y0 + 88, 5, 0, 7); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = 4; c.beginPath(); c.arc(SITE.x, y0 + 100, 20, 0.2, Math.PI - 0.2); c.stroke();
    // the crowd
    for (let i = 0; i < 26; i++) { const x = x0 + 20 + i * 17.5, bob = ((i + Math.floor(time / 577)) % 2) * 3; c.fillStyle = '#8a8496'; c.fillRect(x, y0 + 180 - bob, 10, 14); c.fillStyle = '#c8b8a8'; c.beginPath(); c.arc(x + 5, y0 + 175 - bob, 5, 0, 7); c.fill(); }
    c.fillStyle = '#d6f08a'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#1d2230'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('BUREAU OF PUBLIC CHEER · BULLETIN TOWER', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.8)';
    c.fillText('Smile. It’s mandatory.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(214,240,138,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#d6f08a'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'CHEER', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#d6f08a'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'bureau', type: 'race', title: 'Bulletin Broadcast · cheer on the beat', sub: `${CHEER_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Bureau Bulletin Tower' } }];

  function open() {
    const g = gradeOf(), nx = CHEER_GRADES[g + 1];
    openModal(
      `<h2>THE BULLETIN BROADCAST</h2>
       <div class="sub">Bureau of Public Cheer · “Smile. It’s mandatory.”</div>
       <div class="explain"><b>${esc(CHEER_GRADES[g][0])}</b> · ${B.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${B.best || 0} · broadcasts ${B.shifts || 0}</div>
       <div class="explain">The anthem plays; cues fall in three lanes: <b style="color:#d6f08a">SMILE</b>, <b style="color:#4fc3f7">WAVE</b>, <b style="color:#ff7ad6">CHEER</b>.
         Hit each as it crosses the line: <b>tap its lane</b>, or keys <b>1 2 3</b> (or ← ↓ →). On the beat is <b>PERFECT</b>; close is <b>GOOD</b>; late is a miss. Combos pay more. Tapping when nothing’s there counts against you.<br/>
         <b>Public Cheer</b> is measured to two decimal places: hits raise it, misses lower it; at the end it's added to your score. If it reaches 0.00% the broadcast is cut.
         ${g >= 2 ? '<br/><b style="color:#ff5a3a">FROWN</b> cues: do <b>not</b> press. Let them pass.' : '<br/><span class="sub">From Crowd Warmer on, FROWN cues appear. Do not press those.</span>'} ${SONG_S} seconds; the tempo rises as you rank up.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Go live (13–65 scrap)'}</button><button id="snd">Sound: ${B.mute ? 'off' : 'on'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#snd').addEventListener('click', (e) => { B.mute = !B.mute; econ.save(); e.target.textContent = `Sound: ${B.mute ? 'off' : 'on'}`; });
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="bureau" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Go off air (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#bureau');
        const dpr = Math.min(3, Math.max(1, (cv.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1)));
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const game = shift(c, cv, gradeOf(), !B.mute, (res) => finish(res, paid));
        el.querySelector('#quit').addEventListener('click', () => { game.stop(); open(); });
      }
    );
  }

  function finish(res, paid) {
    const before = gradeOf();
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 12)))).amount : 0;
    const merit = Math.max(0, Math.round(res.score / 5));
    if (paid) { B.last = Date.now(); B.xp += merit; B.shifts = (B.shifts || 0) + 1; }
    B.best = Math.max(B.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    const acc = res.notes ? Math.round(((res.perfect + res.good * 0.5) / res.notes) * 100) : 0;
    if (paid) log(`Bulletin Broadcast: ${res.perfect} perfect, ${res.good} good, ${res.miss} missed; Public Cheer ${res.cheer.toFixed(2)}%. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(CHEER_GRADES[after][0])}</b>, Bureau of Public Cheer. Please smile about it.`, 'money');
    emit('bureau', { score: res.score, perfect: res.perfect, good: res.good, miss: res.miss, frowns: res.frowns, combo: res.bestCombo, cheer: Math.round(res.cheer), cut: res.cut, paid, grade: after, fc: !res.cut && res.miss === 0 && res.frowns === 0 && res.notes >= 30 });
    openModal(
      `<h2>${res.cut ? 'BROADCAST CUT' : res.miss === 0 && !res.frowns ? 'FULL COMPLIANCE' : 'OFF AIR'}</h2>
       <div class="sub">Bulletin Broadcast · ${esc(CHEER_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Perfect · ${res.perfect}</td><td style="text-align:right;color:#d6f08a">+${res.perfect * 10}</td></tr>
         <tr><td>Good · ${res.good}</td><td style="text-align:right;color:#d6f08a">+${res.good * 5}</td></tr>
         <tr><td>Combo bonus (best combo ${res.bestCombo})</td><td style="text-align:right;color:#d6f08a">+${res.comboPts}</td></tr>
         ${res.miss ? `<tr><td>Missed · ${res.miss}</td><td style="text-align:right;color:#ff7a5c">−${res.miss * 3}</td></tr>` : ''}
         ${res.stray ? `<tr><td>Off-beat taps · ${res.stray}</td><td style="text-align:right;color:#ff7a5c">−${res.stray * 2}</td></tr>` : ''}
         ${res.frowns ? `<tr><td>Frowned on air · ${res.frowns}</td><td style="text-align:right;color:#ff7a5c">−${res.frowns * 10}</td></tr>` : ''}
         <tr><td>Public Cheer ${res.cheer.toFixed(2)}%</td><td style="text-align:right;color:#d6f08a">+${Math.round(res.cheer)}</td></tr>
         <tr><td><b>Total</b> · accuracy ${acc}%</td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${merit} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.cut ? '<br/><span class="sub">Public Cheer reached 0.00%. The Bureau has replaced the broadcast with footage of a smiling dog.</span>' : ''}
       ${board ? `<br/>${board.line('bureau')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Bulletin office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('bureau'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => CHEER_GRADES[gradeOf()][0] };
}

// ---------- the chart ----------
function makeChart(grade) {
  const bpm = Math.min(140, 100 + grade * 3.5), spb = 60 / bpm;
  const notes = [];
  const start = 2.0; // seconds of count-in
  let lastLane = 1;
  for (let b = 0; start + b * spb < SONG_S - 1; b++) {
    const t = start + b * spb, bar = Math.floor(b / 4), inBar = b % 4;
    if (bar === 0) continue; // count-in bar
    const density = Math.min(0.92, 0.55 + grade * 0.03 + bar * 0.008);
    const phrase = bar % 4 === 3 && inBar === 3; // breath at the end of each phrase
    if (phrase) continue;
    if (Math.random() < density) {
      let lane = Math.random() < 0.35 ? lastLane : Math.floor(Math.random() * 3);
      lastLane = lane;
      const frown = grade >= 2 && Math.random() < Math.min(0.14, 0.05 + grade * 0.008);
      notes.push({ t, lane, frown });
      if (!frown && grade >= 4 && Math.random() < 0.12) notes.push({ t, lane: (lane + 1 + Math.floor(Math.random() * 2)) % 3, frown: false }); // chord
    }
    // eighth-note pickups
    if (grade >= 3 && Math.random() < 0.08 + grade * 0.01 && inBar !== 3) notes.push({ t: t + spb / 2, lane: Math.floor(Math.random() * 3), frown: false });
  }
  notes.sort((a, b) => a.t - b.t);
  return { bpm, spb, start, notes };
}

// ---------- the anthem (Web Audio, synthesized) ----------
function makeAudio(on) {
  if (!on) return null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
    const ctx = new Ctx(); ctx.resume?.();
    const out = ctx.createGain(); out.gain.value = 0.32; out.connect(ctx.destination);
    const tone = (time, freq, dur, type = 'square', vol = 0.18, slide = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, time); if (slide) o.frequency.exponentialRampToValueAtTime(slide, time + dur);
      g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      o.connect(g); g.connect(out); o.start(time); o.stop(time + dur + 0.02);
    };
    return { ctx, tone, close: () => { try { ctx.close(); } catch { /* already closed */ } } };
  } catch { return null; }
}
// a cheerful, slightly sinister march in C major
const MELODY = [523, 659, 784, 659, 698, 659, 587, 523, 587, 659, 698, 784, 659, 587, 523, 392];
const BASS = [131, 131, 196, 196, 175, 175, 196, 196];

function shift(c, cv, grade, sound, done) {
  const chart = makeChart(grade);
  const notes = chart.notes.map((n) => ({ ...n, hit: null }));
  const res = { score: 0, perfect: 0, good: 0, miss: 0, stray: 0, frowns: 0, combo: 0, bestCombo: 0, comboPts: 0, cheer: 50, notes: notes.filter((n) => !n.frown).length, cut: false };
  let stopped = false, t0 = performance.now(), t = 0, slogan = 0;
  const flashes = [0, 0, 0], judg = [];
  const audio = makeAudio(sound);
  // the wall clock drives the game; the anthem is scheduled against it, shifted by the device's output latency
  const audioT0 = audio ? audio.ctx.currentTime : 0;
  const lat = audio ? Math.min(0.25, audio.ctx.outputLatency || audio.ctx.baseLatency || 0) : 0;
  let scheduled = 0; // beats scheduled so far

  function scheduleAudio() {
    if (!audio) return;
    const horizon = t + lat + 0.25;
    while (chart.start - chart.spb * 4 + scheduled * chart.spb < Math.min(horizon, SONG_S)) {
      const bt = chart.start - chart.spb * 4 + scheduled * chart.spb; const at = audioT0 + bt;
      if (at >= audio.ctx.currentTime - 0.01) {
        audio.tone(at, 110, 0.12, 'sine', 0.5, 45); // kick
        audio.tone(at + chart.spb / 2, 6000, 0.03, 'square', 0.03); // hat
        if (scheduled >= 4) {
          audio.tone(at, BASS[Math.floor(scheduled / 2) % BASS.length], chart.spb * 0.9, 'triangle', 0.22);
          if (scheduled % 2 === 0 || grade >= 3) audio.tone(at, MELODY[scheduled % MELODY.length], chart.spb * 0.45, 'square', 0.07);
        } else audio.tone(at, 880, 0.06, 'square', 0.08); // count-in
      }
      scheduled++;
    }
  }

  function judge(n, dtAbs) {
    if (dtAbs <= PERFECT) { res.perfect++; res.score += 10; res.cheer += 1.3; return 'PERFECT'; }
    res.good++; res.score += 5; res.cheer += 0.6; return 'GOOD';
  }
  function press(lane) {
    if (stopped) return;
    flashes[lane] = 0.12;
    // nearest unhit note in this lane
    let best = null, bd = 1e9;
    for (const n of notes) { if (n.lane !== lane || n.hit) continue; const d = Math.abs(n.t - t); if (d < bd) { bd = d; best = n; } if (n.t - t > STRAY) break; }
    if (best && bd <= GOOD) {
      if (best.frown) {
        best.hit = 'frown'; res.frowns++; res.score -= 10; res.cheer -= 6.5; res.combo = 0;
        judg.push({ lane, s: 'FROWNED', col: '#ff5a3a', t: 0.6 });
      } else {
        const j = judge(best, bd); best.hit = j;
        res.combo++; res.bestCombo = Math.max(res.bestCombo, res.combo);
        const bonus = Math.min(5, Math.floor(res.combo / 10)); res.score += bonus; res.comboPts += bonus;
        judg.push({ lane, s: j, col: j === 'PERFECT' ? '#d6f08a' : '#4fc3f7', t: 0.5 });
        if (audio) audio.tone(audio.ctx.currentTime, [784, 988, 1175][lane], 0.08, 'sine', 0.12);
      }
    } else if (!best || bd > STRAY) {
      res.stray++; res.score -= 2; res.cheer -= 0.8; res.combo = 0;
      judg.push({ lane, s: 'OFF-BEAT', col: '#ff9a5c', t: 0.45 });
    }
    res.cheer = Math.max(0, Math.min(100, res.cheer));
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    // generous columns: the whole width splits into three, so thumbs don't need precision
    const lane = p.x < LANE_X0 + LANE_W ? 0 : p.x < LANE_X0 + LANE_W * 2 ? 1 : 2;
    press(lane);
  };
  const KEYS = { 1: 0, 2: 1, 3: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, j: 0, k: 1, l: 2 };
  const kd = (e) => { const lane = KEYS[e.key]; if (lane === undefined || e.repeat) return; e.preventDefault(); e.stopPropagation(); press(lane); };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd, true);
  const stop = () => { if (stopped) return; stopped = true; window.removeEventListener('keydown', kd, true); audio?.close(); };
  function end() { if (stopped) return; stop(); res.cheer = Math.round(res.cheer * 100) / 100; res.score += Math.round(res.cheer); done(res); }
  cv.__debug = { notes, press, get t() { return t; }, chart };

  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const prev = t;
    t = (now - t0) / 1000 - lat;
    const dt = Math.max(0, Math.min(0.05, t - prev));
    scheduleAudio();
    for (let i = 0; i < 3; i++) flashes[i] = Math.max(0, flashes[i] - dt);
    for (const j of judg) j.t -= dt;
    for (const n of notes) {
      if (n.hit || t - n.t <= GOOD) continue;
      if (n.frown) { n.hit = 'passed'; continue; }
      n.hit = 'miss'; res.miss++; res.score -= 3; res.cheer = Math.max(0, res.cheer - 3.9); res.combo = 0;
      judg.push({ lane: n.lane, s: 'MISS', col: '#ff5a3a', t: 0.5 });
    }
    slogan = Math.floor(t / 6) % SLOGANS.length;
    if (res.cheer <= 0 && t > chart.start + 4) { res.cut = true; return end(); }
    if (t >= SONG_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#e8e4f0', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function face(x, y, r, mood, col) {
    c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.25, r * 0.13, 0, 7); c.arc(x + r * 0.35, y - r * 0.25, r * 0.13, 0, 7); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = Math.max(1.5, r * 0.12); c.beginPath();
    if (mood > 0) c.arc(x, y + r * 0.02, r * 0.5, 0.25, Math.PI - 0.25); else c.arc(x, y + r * 0.7, r * 0.45, Math.PI + 0.35, -0.35);
    c.stroke();
  }
  function draw() {
    const beatPh = ((t - chart.start) / chart.spb) % 1, pulse = t > 0 ? Math.max(0, 1 - (beatPh < 0 ? beatPh + 1 : beatPh) * 4) : 0;
    c.fillStyle = '#17141f'; c.fillRect(0, 0, W, H);
    // ticker
    c.fillStyle = '#d6f08a'; c.fillRect(0, 0, W, 26);
    txt(`BUREAU BULLETIN · ${SLOGANS[slogan]}`, 10, 18, 12, '#1d2230', 'left', true, W - 90);
    txt(`${Math.max(0, Math.ceil(SONG_S - t))}s`, W - 10, 18, 13, '#1d2230', 'right', true);
    // lanes
    LANES.forEach(([name, col, key], i) => {
      const x = LANE_X0 + i * LANE_W;
      c.fillStyle = flashes[i] > 0 ? 'rgba(255,255,255,0.10)' : i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)';
      c.fillRect(x + 2, TOP_Y - 14, LANE_W - 4, H - TOP_Y + 14);
      // the receptor
      c.strokeStyle = col; c.lineWidth = 2 + pulse * 2; c.globalAlpha = 0.6 + pulse * 0.4;
      c.beginPath(); c.arc(x + LANE_W / 2, HIT_Y, 24 + pulse * 3, 0, 7); c.stroke(); c.globalAlpha = 1;
      txt(name, x + LANE_W / 2, HIT_Y + 46, 13, col, 'center', true);
      txt(key, x + LANE_W / 2, HIT_Y + 64, 10, '#8a84a0', 'center');
    });
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(LANE_X0, HIT_Y); c.lineTo(LANE_X0 + LANE_W * 3, HIT_Y); c.stroke();
    // beat lines
    for (let k = -1; k < 6; k++) {
      const bt = chart.start + (Math.floor((t - chart.start) / chart.spb) + k) * chart.spb;
      const y = HIT_Y - ((bt - t) / LEAD_S) * (HIT_Y - TOP_Y);
      if (y < TOP_Y || y > H) continue;
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.beginPath(); c.moveTo(LANE_X0, y); c.lineTo(LANE_X0 + LANE_W * 3, y); c.stroke();
    }
    // cues
    for (const n of notes) {
      if (n.hit && n.hit !== 'passed' && n.hit !== 'miss') continue;
      const y = HIT_Y - ((n.t - t) / LEAD_S) * (HIT_Y - TOP_Y);
      if (y < TOP_Y - 30) break;
      if (y > H + 30) continue;
      const x = LANE_X0 + n.lane * LANE_W + LANE_W / 2;
      c.globalAlpha = n.hit ? 0.3 : 1;
      face(x, y, 19, n.frown ? -1 : 1, n.frown ? '#ff5a3a' : LANES[n.lane][1]);
      c.globalAlpha = 1;
    }
    for (const j of judg) if (j.t > 0) { c.globalAlpha = Math.min(1, j.t * 3); txt(j.s, LANE_X0 + j.lane * LANE_W + LANE_W / 2, HIT_Y - 40 - (0.5 - j.t) * 30, 13, j.col, 'center', true); }
    c.globalAlpha = 1;
    // left: the crowd, which mirrors the cheer
    txt('THE PUBLIC', 14, 50, 10, '#8a84a0', 'left', true);
    for (let i = 0; i < 24; i++) {
      const cx = 22 + (i % 4) * 36, cy = 78 + Math.floor(i / 4) * 40, happy = (i * 37 % 100) < res.cheer;
      face(cx, cy - (happy ? pulse * 4 : 0), 12, happy ? 1 : -1, happy ? '#e8d8b8' : '#9a90a0');
    }
    // right: the meter
    const mx = 500;
    txt('PUBLIC CHEER', mx + 8, 50, 10, '#8a84a0', 'left', true);
    const col = res.cheer > 60 ? '#d6f08a' : res.cheer > 25 ? '#ffd166' : '#ff5a3a';
    txt(`${res.cheer.toFixed(2)}%`, mx + 8, 80, 22, col, 'left', true);
    c.fillStyle = '#2a2633'; c.fillRect(mx + 8, 92, 120, 10); c.fillStyle = col; c.fillRect(mx + 8, 92, 1.2 * res.cheer, 10);
    txt(`score ${res.score}`, mx + 8, 134, 13, '#e8e4f0', 'left', true);
    txt(`combo ${res.combo}`, mx + 8, 156, 13, res.combo >= 10 ? '#d6f08a' : '#e8e4f0', 'left', true);
    txt(`${Math.round(chart.bpm)} BPM`, mx + 8, 178, 10, '#8a84a0');
    txt(`perfect ${res.perfect}`, mx + 8, 210, 10, '#d6f08a'); txt(`good ${res.good}`, mx + 8, 226, 10, '#4fc3f7'); txt(`miss ${res.miss}`, mx + 8, 242, 10, '#ff7a5c');
    if (grade >= 2) { face(mx + 20, 280, 10, -1, '#ff5a3a'); txt('= don’t press', mx + 36, 284, 10, '#ff9a8a'); }
    if (t < chart.start) txt(String(Math.max(1, Math.ceil((chart.start - t) / chart.spb))), LANE_X0 + LANE_W * 1.5, 190, 48, '#d6f08a', 'center', true);
  }

  return { stop };
}

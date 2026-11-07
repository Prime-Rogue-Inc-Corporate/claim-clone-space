// Shift work: one minigame at each organization's desk. ~30 seconds each, playable with a thumb.
// Pays scrap for now (13–39 by score), once per org per 13 minutes; replays after that are practice.
// Six mechanics, thirteen skins. Balance later against the resources that don't exist yet.
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const PAY_MIN = T13, PAY_MAX = T13 * 3;
const W = 320, H = 320;

// org id -> game. kind = mechanic; the rest is flavour and tuning.
export const GAMES = {
  vanta: { kind: 'hold', title: 'Exposure Test', how: 'Hold to push the dose up, let go to let it fall. Keep the needle in the band.', unit: 'mSv', color: '#7b5cff' },
  cinder: { kind: 'hold', title: 'Meter Reading', how: 'Hold to open the valve. Keep the pressure in the band. Air is metered.', unit: 'kPa', color: '#4fc3c8', wobble: 1.4 },
  kessler: { kind: 'tap', title: 'Assay Sorting', how: 'Tap the ore. Leave the slag. Everything is ore eventually (not yet).', good: 'ORE', bad: 'SLAG', goodC: '#e8c547', badC: '#5a524a' },
  mercy: { kind: 'tap', title: 'Triage', how: 'Tap the flatlines before they go cold. Leave the ones still breathing: they bill extra.', good: '—', bad: '♥', goodC: '#ff3b1f', badC: '#d6f08a' },
  ashiron: { kind: 'timing', title: 'Smelt a Batch', how: 'Tap when the temperature hits the green. Five pours.', rounds: 5, label: 'POUR', color: '#ff7a1f' },
  gavel: { kind: 'timing', title: 'Going, Going…', how: 'Tap GONE when the price lands on the reserve. Five lots.', rounds: 5, label: 'GONE', color: '#c9a227', speedUp: 1.25 },
  bureau: { kind: 'timing', title: 'Mandatory Smile', how: 'Smile on the beat. Five beats. Smiling is mandatory; timing is graded.', rounds: 5, label: 'SMILE', color: '#d6f08a', narrow: 0.7 },
  gullet: { kind: 'catch', title: 'Ration Line', how: 'Drag (or ←/→) to catch ration bricks. Dodge the grey ones: those are last week\'s.', good: '#c9a227', bad: '#6b6b6b', catch: true },
  ministry: { kind: 'catch', title: 'The Queue', how: 'Drag (or ←/→) to dodge the falling hazards. The Ministry thanks you for your patience.', bad: '#ff3b1f', dodge: true },
  null: { kind: 'memory', title: 'Processing', how: 'Watch the stamps, then repeat them in order. Compliance is safety.', symbols: ['◆', '●', '▲', '■'] },
  registry: { kind: 'memory', title: 'Number, Please', how: 'Watch the skiff numbers light up, then tap them back in order. You are a number.', symbols: ['001', '013', '069', '130'] },
  lastmile: { kind: 'sort', title: 'Parcel Sort', how: 'Left bin or right bin? Sort by the label\'s colour, not what the word says. Fast. Every package arrives eventually.', mode: 'colour' },
  assessor: { kind: 'sort', title: 'Fair Price', how: 'Lot A was bought at the first price. Is the second price at least 1.13× it? Yes or no.', mode: 'math' },
};

export function createMinigames({ econ, emit = () => {}, log = () => {}, esc, openModal, closeModal, onBack = null }) {
  const S = econ.state;
  S.shifts ||= {}; // org -> last paid timestamp
  const left = (org) => Math.max(0, (S.shifts[org] || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const payFor = (q) => Math.round(PAY_MIN + (PAY_MAX - PAY_MIN) * Math.max(0, Math.min(1, q)));

  function button(org) {
    const g = GAMES[org];
    if (!g) return '';
    const l = left(org);
    return `<button id="mg-play" data-org="${esc(org)}">Work a shift: ${esc(g.title)}${l ? ` (practice · paid again in ${fmt(l)})` : ` (${PAY_MIN}–${PAY_MAX} scrap)`}</button>`;
  }

  function open(org, orgInfo = {}) {
    const g = GAMES[org];
    if (!g) return;
    const paid = !left(org);
    openModal(
      `<h2>${esc(g.title.toUpperCase())}</h2>
       <div class="sub">${esc(orgInfo.name || org)} · shift work · ${paid ? `pays ${PAY_MIN}–${PAY_MAX} scrap by score` : `practice (paid again in ${fmt(left(org))})`}</div>
       <div class="explain">${esc(g.how)}</div>
       <div class="mg-wrap"><canvas id="mg" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button class="primary" id="mg-go">Start</button><button id="mg-back">Back</button></div>`,
      (el) => {
        const cv = el.querySelector('#mg');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawIdle(c, g);
        el.querySelector('#mg-back').addEventListener('click', () => (onBack ? onBack(org) : closeModal()));
        el.querySelector('#mg-go').addEventListener('click', (e) => {
          e.target.disabled = true;
          run(c, cv, g, (q) => finish(org, g, q, orgInfo));
        });
      }
    );
  }

  function finish(org, g, q, orgInfo) {
    const paid = !left(org);
    let pay = 0;
    if (paid) {
      pay = econ.reward(payFor(q)).amount;
      S.shifts[org] = Date.now();
      econ.save();
      log(`Shift done at ${esc(orgInfo.site || orgInfo.name || org)}: <b>${esc(g.title)}</b>, ${Math.round(q * 100)}%. +${pay} scrap.`, 'money');
    }
    emit('shift', { org, q, paid });
    openModal(
      `<h2>SHIFT OVER</h2>
       <div class="sub">${esc(g.title)} · ${esc(orgInfo.name || org)}</div>
       <div class="explain" style="font-size:15px">Score: <b>${Math.round(q * 100)}%</b><br/>
       ${paid ? `Paid: <b style="color:#d6f08a">+${pay} scrap</b>` : `Practice: no pay. Next paid shift in ${fmt(left(org))}.`}<br/>
       <span class="sub">${q >= 0.95 ? 'Exemplary. This has been noted.' : q >= 0.6 ? 'Adequate. This has been noted.' : 'This has been noted.'}</span></div>
       <div class="buttons"><button class="primary" id="again">Again</button><button id="back">Back</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', () => open(org, orgInfo));
        el.querySelector('#back').addEventListener('click', () => (onBack ? onBack(org) : closeModal()));
      }
    );
  }

  return { open, button, left, GAMES };
}

// ---------- shared drawing ----------
function bg(c) {
  c.fillStyle = '#0b0c0e';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(232,197,71,0.12)';
  for (let x = 0; x <= W; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y <= H; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}
function text(c, s, x, y, size = 14, color = '#efe6cf', align = 'center') {
  c.fillStyle = color; c.font = `bold ${size}px monospace`; c.textAlign = align; c.fillText(s, x, y);
}
function hud(c, t, T, score) {
  c.fillStyle = 'rgba(232,197,71,0.8)';
  c.fillRect(0, 0, W * Math.max(0, 1 - t / T), 4);
  if (score != null) text(c, score, W - 8, 20, 12, '#e8c547', 'right');
}
function drawIdle(c, g) {
  bg(c);
  text(c, g.title.toUpperCase(), W / 2, H / 2 - 10, 18, '#e8c547');
  text(c, 'press Start', W / 2, H / 2 + 16, 12, 'rgba(239,230,207,0.6)');
}

// ---------- the engine: every mechanic returns update/draw/input and a 0..1 score ----------
function run(c, cv, g, done) {
  const M = MECH[g.kind](g);
  const input = { down: false, x: W / 2, left: false, right: false, taps: [] };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); input.down = true; const p = pos(e); input.x = p.x; input.taps.push(p); };
  const pm = (e) => { if (input.down) input.x = pos(e).x; };
  const pu = () => { input.down = false; };
  const kd = (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!input.down) input.taps.push({ x: W / 2, y: H / 2, key: true }); input.down = true; }
    if (e.key === 'ArrowLeft' || e.key === 'a') { input.left = true; input.taps.push({ x: W * 0.25, y: H - 40, key: true }); }
    if (e.key === 'ArrowRight' || e.key === 'd') { input.right = true; input.taps.push({ x: W * 0.75, y: H - 40, key: true }); }
    const n = '1234'.indexOf(e.key); if (n >= 0) input.taps.push({ slot: n, key: true });
  };
  const ku = (e) => {
    if (e.key === ' ' || e.key === 'Enter') input.down = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
  };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const stop = () => { window.removeEventListener('pointerup', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  let last = performance.now(), t = 0;
  const tick = (now) => {
    if (!cv.isConnected) return stop(); // modal closed mid-shift: no pay
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    M.update(dt, t, input);
    input.taps.length = 0;
    bg(c); M.draw(c, t);
    hud(c, t, M.T, M.label?.());
    if (t >= M.T || M.over?.()) { stop(); return done(Math.max(0, Math.min(1, M.score()))); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const rnd = (a, b) => a + Math.random() * (b - a);

const MECH = {
  // Hold to raise, release to fall; stay in a drifting band. Score = time in band.
  hold(g) {
    const T = 26;
    let v = 0.3, vel = 0, inBand = 0, band = 0.5, bandV = 0;
    return {
      T,
      update(dt, t, inp) {
        vel += (inp.down ? 1.3 : -1.1) * dt;
        vel *= Math.pow(0.35, dt);
        vel += Math.sin(t * 3.1) * 0.05 * (g.wobble || 1) * dt;
        v = Math.max(0, Math.min(1, v + vel * dt * 1.6));
        if (v === 0 || v === 1) vel = 0;
        bandV += rnd(-0.6, 0.6) * dt; bandV *= Math.pow(0.5, dt);
        band = Math.max(0.2, Math.min(0.8, band + bandV * dt));
        if (Math.abs(v - band) < 0.09) inBand += dt;
      },
      draw(c) {
        const x0 = 130, x1 = 190, y0 = 30, y1 = 290, yOf = (q) => y1 - q * (y1 - y0);
        c.fillStyle = '#16181b'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.fillStyle = 'rgba(214,240,138,0.25)'; c.fillRect(x0, yOf(band + 0.09), x1 - x0, yOf(band - 0.09) - yOf(band + 0.09));
        c.fillStyle = g.color; c.fillRect(x0 - 14, yOf(v) - 3, x1 - x0 + 28, 6);
        text(c, `${Math.round(v * 130)} ${g.unit}`, 260, yOf(v) + 5, 13, g.color);
        text(c, 'HOLD', 60, H / 2, 16, 'rgba(239,230,207,0.5)');
      },
      score: () => inBand / (T * 0.8),
      label: () => `${Math.round((inBand / (T * 0.8)) * 100)}%`,
    };
  },
  // Things pop up; tap the good ones, not the bad ones.
  tap(g) {
    const T = 25, items = [];
    let next = 0, hit = 0, miss = 0, bad = 0, total = 0;
    return {
      T,
      update(dt, t, inp) {
        next -= dt;
        if (next <= 0) {
          next = Math.max(0.35, 0.85 - t * 0.018);
          const good = Math.random() < 0.7;
          if (good) total++;
          items.push({ x: rnd(30, W - 30), y: rnd(40, H - 30), r: 22, good, life: Math.max(0.9, 1.6 - t * 0.02) });
        }
        for (const it of items) it.life -= dt;
        for (const tp of inp.taps) {
          if (tp.key) continue;
          const i = items.findIndex((it) => Math.hypot(it.x - tp.x, it.y - tp.y) < it.r + 8);
          if (i >= 0) { if (items[i].good) hit++; else bad++; items.splice(i, 1); }
        }
        for (let i = items.length - 1; i >= 0; i--) if (items[i].life <= 0) { if (items[i].good) miss++; items.splice(i, 1); }
      },
      draw(c) {
        for (const it of items) {
          c.globalAlpha = Math.min(1, it.life * 2);
          c.fillStyle = it.good ? g.goodC : g.badC;
          c.beginPath(); c.arc(it.x, it.y, it.r, 0, Math.PI * 2); c.fill();
          text(c, it.good ? g.good : g.bad, it.x, it.y + 4, 11, '#0b0c0e');
          c.globalAlpha = 1;
        }
      },
      score: () => (total ? (hit - bad * 1.5) / total : 0),
      label: () => `${hit} ✓ ${bad} ✗`,
    };
  },
  // A marker sweeps; tap when it's in the zone. N rounds; closer = better.
  timing(g) {
    const N = g.rounds || 5;
    let round = 0, p = 0, dir = 1, speed = 0.9, zone = rnd(0.25, 0.75), zw = 0.12 * (g.narrow || 1), sum = 0, flash = 0, lastQ = null, pause = 0;
    const T = 40;
    return {
      T,
      update(dt, t, inp) {
        flash = Math.max(0, flash - dt);
        if (pause > 0) { pause -= dt; return; }
        p += dir * speed * dt;
        if (p > 1) { p = 1; dir = -1; } if (p < 0) { p = 0; dir = 1; }
        if (inp.taps.length) {
          const d = Math.abs(p - zone);
          lastQ = Math.max(0, 1 - d / (zw * 1.6));
          sum += lastQ; round++; flash = 0.5; pause = 0.45;
          speed *= g.speedUp || 1.15; zone = rnd(0.2, 0.8);
        }
      },
      draw(c) {
        const x0 = 30, x1 = W - 30, y = 150, xOf = (q) => x0 + q * (x1 - x0);
        c.fillStyle = '#16181b'; c.fillRect(x0, y - 20, x1 - x0, 40);
        c.fillStyle = 'rgba(214,240,138,0.35)'; c.fillRect(xOf(zone - zw / 2), y - 20, xOf(zone + zw / 2) - xOf(zone - zw / 2), 40);
        c.fillStyle = g.color; c.fillRect(xOf(p) - 3, y - 30, 6, 60);
        text(c, `${g.label} · ${Math.min(round + 1, N)}/${N}`, W / 2, 80, 14, '#e8c547');
        if (flash && lastQ != null) text(c, lastQ > 0.85 ? 'PERFECT' : lastQ > 0.5 ? 'GOOD' : lastQ > 0 ? 'MEH' : 'MISS', W / 2, 230, 18, lastQ > 0.5 ? '#d6f08a' : '#ff7a5c');
        text(c, 'tap anywhere / SPACE', W / 2, 290, 11, 'rgba(239,230,207,0.45)');
      },
      over: () => round >= N,
      score: () => sum / N,
      label: () => `${Math.round((sum / N) * 100)}%`,
    };
  },
  // Move a tray along the bottom. Catch good things, dodge bad ones (or just dodge).
  catch(g) {
    const T = 25, fall = [];
    let x = W / 2, next = 0, good = 0, goodTotal = 0, hitBad = 0, badTotal = 0;
    return {
      T,
      update(dt, t, inp) {
        if (inp.down) x += (inp.x - x) * Math.min(1, dt * 14);
        if (inp.left) x -= 260 * dt; if (inp.right) x += 260 * dt;
        x = Math.max(30, Math.min(W - 30, x));
        next -= dt;
        if (next <= 0) {
          next = Math.max(0.28, 0.7 - t * 0.015);
          const isGood = g.catch && Math.random() < 0.65;
          if (isGood) goodTotal++; else badTotal++;
          fall.push({ x: rnd(20, W - 20), y: -10, v: rnd(110, 160) + t * 4, good: isGood });
        }
        for (const f of fall) f.y += f.v * dt;
        for (let i = fall.length - 1; i >= 0; i--) {
          const f = fall[i];
          if (f.y > H - 34 && f.y < H - 14 && Math.abs(f.x - x) < 34) { if (f.good) good++; else hitBad++; fall.splice(i, 1); }
          else if (f.y > H + 10) fall.splice(i, 1);
        }
      },
      draw(c) {
        for (const f of fall) { c.fillStyle = f.good ? g.good : g.bad; c.fillRect(f.x - 9, f.y - 7, 18, 14); }
        c.fillStyle = '#e6dcc4'; c.fillRect(x - 32, H - 22, 64, 8);
        text(c, g.dodge ? 'you' : 'tray', x, H - 28, 10, 'rgba(239,230,207,0.6)');
      },
      score: () => (g.dodge ? 1 - hitBad / Math.max(4, badTotal * 0.35) : (good - hitBad) / Math.max(1, goodTotal)),
      label: () => (g.dodge ? `hit ${hitBad}` : `${good} caught`),
    };
  },
  // Simon: watch a sequence, repeat it. Gets longer each round.
  memory(g) {
    const slots = [[80, 110], [240, 110], [80, 240], [240, 240]];
    let seq = [Math.floor(rnd(0, 4))], phase = 'show', i = 0, timer = 0.6, lit = -1, rounds = 0, fail = false, flashBad = 0;
    const T = 45;
    return {
      T,
      update(dt, t, inp) {
        flashBad = Math.max(0, flashBad - dt);
        if (phase === 'show') {
          timer -= dt;
          if (timer <= 0) {
            if (lit >= 0) { lit = -1; timer = 0.18; i++; if (i >= seq.length) { phase = 'input'; i = 0; } }
            else { lit = seq[i]; timer = Math.max(0.3, 0.55 - rounds * 0.03); }
          }
          return;
        }
        for (const tp of inp.taps) {
          let s = tp.slot;
          if (s == null && !tp.key) s = slots.findIndex(([sx, sy]) => Math.abs(tp.x - sx) < 62 && Math.abs(tp.y - sy) < 55);
          if (s == null || s < 0) continue;
          lit = s; timer = 0.15;
          if (s !== seq[i]) { fail = true; flashBad = 1; return; }
          i++;
          if (i >= seq.length) { rounds++; seq.push(Math.floor(rnd(0, 4))); phase = 'show'; i = 0; lit = -1; timer = 0.7; return; }
        }
        if (timer > 0) { timer -= dt; if (timer <= 0) lit = -1; }
      },
      draw(c) {
        slots.forEach(([sx, sy], k) => {
          c.fillStyle = lit === k ? '#e8c547' : '#1d1f23';
          c.fillRect(sx - 58, sy - 50, 116, 100);
          c.strokeStyle = 'rgba(232,197,71,0.4)'; c.strokeRect(sx - 58, sy - 50, 116, 100);
          text(c, g.symbols[k], sx, sy + 8, g.symbols[k].length > 1 ? 22 : 30, lit === k ? '#0b0c0e' : '#efe6cf');
          text(c, String(k + 1), sx - 48, sy - 36, 9, 'rgba(239,230,207,0.35)', 'left');
        });
        text(c, fail ? 'NON-COMPLIANT' : phase === 'show' ? 'WATCH' : 'REPEAT', W / 2, 28, 13, fail || flashBad ? '#ff7a5c' : '#e8c547');
      },
      over: () => fail,
      score: () => rounds / 8,
      label: () => `round ${rounds + 1}`,
    };
  },
  // Two-choice reaction: left or right. Colour match, or "is it ≥ 1.13×?".
  sort(g) {
    const T = 25;
    let cur = null, right = 0, wrong = 0, fb = 0, fbOk = true;
    const COLS = [['#e8c547', 'AMBER'], ['#4f9fd0', 'BLUE']];
    const make = () => {
      if (g.mode === 'colour') {
        const side = Math.random() < 0.5 ? 0 : 1, word = Math.random() < 0.5 ? side : 1 - side; // the word lies sometimes
        return { side, draw: (c) => { c.fillStyle = COLS[side][0]; c.fillRect(110, 110, 100, 80); text(c, COLS[word][1], W / 2, 158, 14, '#0b0c0e'); } };
      }
      const a = Math.round(rnd(10, 400) * 100) / 100, k = Math.random() < 0.5 ? rnd(1.13, 1.4) : rnd(0.9, 1.129), b = Math.round(a * k * 100) / 100;
      const yes = b >= Math.round(a * 1.13 * 100) / 100;
      return { side: yes ? 0 : 1, draw: (c) => { text(c, `paid $${a.toFixed(2)}`, W / 2, 130, 16); text(c, `offer $${b.toFixed(2)}`, W / 2, 165, 16, '#e8c547'); text(c, '≥ 1.13× ?', W / 2, 200, 12, 'rgba(239,230,207,0.6)'); } };
    };
    cur = make();
    return {
      T,
      update(dt, t, inp) {
        fb = Math.max(0, fb - dt);
        for (const tp of inp.taps) {
          const side = tp.x < W / 2 ? 0 : 1;
          fbOk = side === cur.side; if (fbOk) right++; else wrong++;
          fb = 0.25; cur = make();
        }
      },
      draw(c) {
        const labels = g.mode === 'colour' ? ['AMBER BIN', 'BLUE BIN'] : ['YES', 'NO'];
        c.fillStyle = g.mode === 'colour' ? 'rgba(232,197,71,0.18)' : 'rgba(214,240,138,0.14)'; c.fillRect(0, 240, W / 2 - 4, 80);
        c.fillStyle = g.mode === 'colour' ? 'rgba(79,159,208,0.18)' : 'rgba(255,122,92,0.14)'; c.fillRect(W / 2 + 4, 240, W / 2 - 4, 80);
        text(c, `← ${labels[0]}`, W / 4, 285, 13); text(c, `${labels[1]} →`, (W * 3) / 4, 285, 13);
        cur.draw(c);
        if (fb) text(c, fbOk ? '✓' : '✗', W / 2, 70, 30, fbOk ? '#d6f08a' : '#ff7a5c');
      },
      score: () => (right - wrong) / (g.mode === 'colour' ? 22 : 12),
      label: () => `${right} ✓ ${wrong} ✗`,
    };
  },
};

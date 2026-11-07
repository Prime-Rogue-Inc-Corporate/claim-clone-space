// Space racetracks, south of the main drag. Each one traces a real F1 circuit's shape.
//   The Island Circuit — after Circuit Gilles-Villeneuve, Montréal (Île Notre-Dame)
//   The Temple Circuit — after the Autodromo Nazionale Monza
// Fly through the start gate in the race direction to start a lap. 13 gates per lap (start/finish
// + 12 sector gates), all in order, in the right direction. Laps go to a leaderboard per track.
// No backend yet: the board is this browser's laps against 12 seeded rival pilots from the orgs.
// A shared board needs accounts + a server (v0.2+).
import { mulberry32, hashStr } from './rng.js';
import { T13 } from './economy.js';

const WIDTH = 200; // track width (~7 skiffs across)
const GATES = T13;
const KM = 3000; // px per km on the circuits: The Island Circuit comes out at ~4.4 km, like the real one

// Shapes in rough "units" (x east, y south), traced by hand from the circuit maps. Race direction
// is the point order. Closed loops: the last point joins the first.
const TRACKS = [
  {
    id: 'island',
    name: 'THE ISLAND CIRCUIT',
    after: 'after Circuit Gilles-Villeneuve, Montréal',
    host: 'mercy',
    origin: [-12300, 3900],
    scale: 650,
    // start/finish straight heading west, Senna S hairpin, chicanes down the island, L'Épingle
    // hairpin at the far end, the Casino straight back, Wall of Champions chicane.
    pts: [
      [2.2, 0.2], [1.4, 0.2], [0.7, 0.22], [0.3, 0.4], [0.35, 0.72], [0.75, 0.82],
      [1.2, 0.9], [1.5, 1.18], [1.9, 1.05], [2.6, 1.05], [3.5, 1.12], [4.1, 1.38], [4.55, 1.15],
      [5.4, 1.18], [6.4, 1.26], [7.2, 1.3], [7.8, 1.52], [8.6, 1.62], [9.4, 1.72], [9.85, 1.55],
      [9.75, 1.27], [9.3, 1.15], [8.2, 1.0], [7.0, 0.85], [5.8, 0.7], [4.6, 0.55], [3.6, 0.45],
      [3.15, 0.42], [2.95, 0.22], [2.7, 0.32],
    ],
  },
  {
    id: 'temple',
    name: 'THE TEMPLE CIRCUIT',
    after: 'after the Autodromo Nazionale Monza',
    host: 'mercy',
    origin: [6000, 3700],
    scale: 600,
    // main straight east, Rettifilo chicane, Curva Grande, Roggia, the two Lesmos, Serraglio
    // straight back west, Ascari chicane, back straight, Parabolica onto the main straight.
    pts: [
      [3.0, 3.4], [4.8, 3.4], [6.6, 3.4], [6.9, 3.42], [7.1, 3.24], [7.35, 3.3], [8.2, 3.2],
      [8.9, 2.8], [9.3, 2.2], [9.45, 1.9], [9.3, 1.7], [9.5, 1.5], [9.55, 1.1], [9.3, 0.75],
      [8.9, 0.6], [8.55, 0.42], [7.5, 0.35], [5.5, 0.5], [4.0, 0.65], [3.6, 0.75], [3.35, 0.6],
      [3.0, 0.85], [2.7, 0.75], [1.9, 1.0], [1.2, 1.25], [0.6, 1.6], [0.35, 2.3], [0.55, 2.95],
      [1.2, 3.35], [2.0, 3.4],
    ],
  },
];

// Catmull-Rom through the hand points, then resample evenly.
function buildTrack(t) {
  const P = t.pts.map(([x, y]) => [t.origin[0] + x * t.scale, t.origin[1] + y * t.scale]);
  const n = P.length;
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let s = 0; s < 10; s++) {
      const u = s / 10, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1];
  const at = (d) => {
    d = ((d % length) + length) % length;
    let i = 1;
    while (cum[i] < d) i++;
    const a = dense[i - 1], b = dense[i % dense.length];
    const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    return { x: a[0] + tx * k, y: a[1] + ty * k, tx: tx / tl, ty: ty / tl };
  };
  const gates = Array.from({ length: GATES }, (_, g) => {
    const p = at((g / GATES) * length);
    const nx = -p.ty, ny = p.tx, h = WIDTH * 0.62;
    return { ...p, ax: p.x + nx * h, ay: p.y + ny * h, bx: p.x - nx * h, by: p.y - ny * h };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of dense) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = WIDTH;
  return { ...t, path: dense, length, gates, box: { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad } };
}

export const CIRCUITS = TRACKS.map(buildTrack);
export const circuitAt = (x, y) => CIRCUITS.find((c) => x > c.box.minX && x < c.box.maxX && y > c.box.minY && y < c.box.maxY) || null;

// segment p1→p2 crosses segment a→b?
function crosses(x1, y1, x2, y2, ax, ay, bx, by) {
  const d = (x2 - x1) * (by - ay) - (y2 - y1) * (bx - ax);
  if (!d) return false;
  const t = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / d;
  const u = ((ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

const KEY = 'claim-clone-space:circuits:v1';
const RIVALS = [
  ['Null Sector', 'Warden Okafor'], ['Mercy Unlimited', 'Sister Vale'], ['Kessler Mining Co.', 'Dusty Brannigan'],
  ['Ash & Iron', 'Deacon Rook'], ['Last Mile Freight', 'Contractor #4471'], ['Gavel & Rope', 'Lot 9'],
  ['Cinder Collective', 'Mx. Ozone'], ['Gullet Provisions', 'Chef Marrow'], ['Vantablack Holdings', 'Junior Associate'],
  ['Bureau of Public Cheer', 'Smiley'], ['The Assessor’s Office', 'Appraiser Grey'], ['Ministry of the Gentry', 'Lord Tenure III'],
];

export function createCircuits({ econ, log, esc, player, emit = () => {}, openModal, closeModal, sprites }) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const store = { laps: {}, day: {}, ...saved }; // laps[trackId] = [{ ms, at }]
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;

  // Seeded rival times: beatable with a few upgrades, the top few need a good line.
  const rivals = Object.fromEntries(
    CIRCUITS.map((c) => {
      const rng = mulberry32(hashStr(`rivals:${c.id}`));
      return [c.id, RIVALS.map(([org, name]) => ({ name, org, ms: Math.round((c.length / (300 + rng() * 210)) * 1000) }))];
    })
  );
  function board(id) {
    const mine = (store.laps[id] || []).map((l) => ({ name: 'You · skiff #001', org: 'you', ms: l.ms, at: l.at, you: true }));
    return [...rivals[id], ...mine].sort((a, b) => a.ms - b.ms);
  }

  const race = { track: null, next: 0, start: 0, wrongAt: 0 };
  let prev = null;

  function update(now, body) {
    if (player.mode !== 'ship') { prev = null; if (race.track) cancel('You left the ship. Lap void.'); return; }
    const cur = { x: body.x, y: body.y };
    const c = circuitAt(cur.x, cur.y);
    if (race.track && (!c || c.id !== race.track.id)) cancel('You left the circuit. Lap void.');
    if (race.track && now - race.start > T13 * 60000) cancel('Lap timed out.');
    // ignore teleports (respawns, tows): only real flying can cross a gate
    if (prev && c && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 400) {
      const mvx = cur.x - prev.x, mvy = cur.y - prev.y;
      c.gates.forEach((g, i) => {
        if (!crosses(prev.x, prev.y, cur.x, cur.y, g.ax, g.ay, g.bx, g.by)) return;
        const forward = mvx * g.tx + mvy * g.ty > 0;
        if (!forward) {
          if (now - race.wrongAt > 4000) {
            race.wrongAt = now;
            log(`WRONG WAY. ${esc(c.name)} runs the other direction.`);
            emit('wrong-way', { track: c.id });
          }
          return;
        }
        if (i === 0) return startOrFinish(c, now);
        if (race.track === c && i === race.next) race.next++;
      });
    }
    prev = cur;
  }

  function cancel(msg) {
    race.track = null;
    log(msg);
  }

  function startOrFinish(c, now) {
    if (race.track === c) {
      if (race.next >= GATES) finishLap(c, now - race.start);
      else log(`Lap void: you missed gate ${race.next + 1} of ${GATES}. New lap started.`);
    } else log(`<b>${esc(c.name)}</b> · LIGHTS OUT. ${GATES} gates, in order. Go.`);
    race.track = c;
    race.next = 1;
    race.start = now;
  }

  function finishLap(c, ms) {
    const list = (store.laps[c.id] ||= []);
    const prevBest = list.length ? Math.min(...list.map((l) => l.ms)) : null;
    list.push({ ms, at: Date.now() });
    list.sort((a, b) => a.ms - b.ms);
    list.length = Math.min(list.length, T13); // keep your best 13
    const today = new Date().toISOString().slice(0, 10);
    const b = board(c.id);
    const rank = b.findIndex((e) => e.you && e.ms === ms) + 1;
    let reward = T13;
    let why = `${c.name} lap ${fmt(ms)} · P${rank} of ${b.length}`;
    const best = prevBest != null && ms < prevBest;
    if (best) { reward += T13 * 2; why += ` · PB (was ${fmt(prevBest)})`; }
    if (store.day[c.id] !== today) { reward += T13 * 3; why += ' · first lap today'; store.day[c.id] = today; }
    save();
    const r = econ.reward(reward);
    log(`🏁 +${r.amount} scrap · ${esc(why)}`, 'good');
    emit('track-lap', { track: c.id, ms, best, podium: rank <= 3, win: rank === 1, bus: !!player.ship?.shuttle });
  }

  function status(now) {
    if (!race.track) return '';
    return `${race.track.name} ${fmt(now - race.start)} · gate ${race.next}/${GATES}`;
  }

  function nearBoard(x, y) {
    for (const c of CIRCUITS) {
      const g = c.gates[0];
      if (Math.hypot(g.bx - x, g.by - y) < 120) return c; // the timing board sits at the gate's right end
    }
    return null;
  }

  function openBoard(focus = CIRCUITS[0].id) {
    const tabs = CIRCUITS.map((c) => `<button data-t="${c.id}" class="${c.id === focus ? 'primary' : ''}">${esc(c.name)}</button>`).join('');
    const c = CIRCUITS.find((x) => x.id === focus);
    const b = board(c.id);
    const youBest = b.find((e) => e.you);
    const rows = b.slice(0, T13).map((e, i) => `<tr class="${e.you ? 'mine' : ''}"><td style="width:28px">P${i + 1}</td>
      <td>${e.you ? '' : `<img src="assets/sprites/logo_${orgId(e.org)}.png" width="16" height="16" alt="" style="vertical-align:middle" onerror="this.remove()"/> `}<b>${esc(e.name)}</b> <span class="sub">${esc(e.you ? new Date(e.at).toISOString().slice(0, 10) : e.org)}</span></td>
      <td style="text-align:right">${fmt(e.ms)}</td></tr>`).join('');
    const outside = youBest && b.indexOf(youBest) >= T13 ? `<div class="sub">Your best: P${b.indexOf(youBest) + 1}, ${fmt(youBest.ms)}</div>` : '';
    openModal(
      `<h2>LEADERBOARD · ${esc(c.name)}</h2>
       <div class="sub">${esc(c.after)} · ${(c.length / KM).toFixed(1)} km · ${GATES} gates · sponsored by Mercy Unlimited</div>
       <div class="buttons" style="margin-top:0">${tabs}</div>
       <table>${rows}</table>${outside}
       <div class="explain">Fly through the start gate in the race direction (follow the chevrons) to start a lap; hit all ${GATES} gates in order.
       ${T13} scrap per lap, +${T13 * 2} for a personal best, +${T13 * 3} for your first lap of the day here.<br/>
       <i>This board is local to this browser for now (you vs. 12 seeded rival pilots). It goes shared once accounts and a server exist.</i></div>
       <div class="buttons"><button class="primary" id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-t]').forEach((bt) => bt.addEventListener('click', () => openBoard(bt.dataset.t)));
      }
    );
  }
  const ORG_IDS = { 'Null Sector': 'null', 'Mercy Unlimited': 'mercy', 'Kessler Mining Co.': 'kessler', 'Ash & Iron': 'ashiron', 'Last Mile Freight': 'lastmile', 'Gavel & Rope': 'gavel', 'Cinder Collective': 'cinder', 'Gullet Provisions': 'gullet', 'Vantablack Holdings': 'vanta', 'Bureau of Public Cheer': 'bureau', 'The Assessor’s Office': 'assessor', 'Ministry of the Gentry': 'ministry' };
  const orgId = (name) => ORG_IDS[name] || 'mercy';

  // ---- drawing (world space) ----
  function drawWorld(ctx, cam, viewR, time) {
    for (const c of CIRCUITS) {
      const bx = c.box;
      if (bx.maxX < cam.x - viewR || bx.minX > cam.x + viewR || bx.maxY < cam.y - viewR || bx.minY > cam.y + viewR) continue;
      const trace = () => {
        ctx.beginPath();
        c.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // kerbs: red/white candy stripes either side
      trace();
      ctx.strokeStyle = '#b8382a';
      ctx.lineWidth = WIDTH + 26;
      ctx.stroke();
      ctx.setLineDash([26, 26]);
      ctx.strokeStyle = '#e6dcc4';
      ctx.stroke();
      ctx.setLineDash([]);
      // surface
      trace();
      ctx.strokeStyle = '#1b1d21';
      ctx.lineWidth = WIDTH;
      ctx.stroke();
      // racing line
      trace();
      ctx.strokeStyle = 'rgba(232,197,71,0.18)';
      ctx.lineWidth = 3;
      ctx.setLineDash([40, 50]);
      ctx.stroke();
      ctx.setLineDash([]);
      // direction chevrons
      ctx.fillStyle = 'rgba(232,220,190,0.25)';
      for (let d = 0; d < c.length; d += 520) {
        const i = Math.floor((d / c.length) * c.path.length);
        const [x, y] = c.path[i], [x2, y2] = c.path[(i + 1) % c.path.length];
        const a = Math.atan2(y2 - y, x2 - x);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -16);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, 16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // gates
      const active = race.track === c;
      c.gates.forEach((g, i) => {
        const isNext = active && i === race.next % GATES;
        if (i === 0) return drawStart(ctx, c, g, active, time);
        const buoy = sprites?.get(isNext || (!active && time % 1000 < 500) ? 'buoy_on' : 'buoy_off');
        for (const [x, y] of [[g.ax, g.ay], [g.bx, g.by]]) {
          if (buoy) ctx.drawImage(buoy, x - 14, y - 18, 28, 28 * (buoy.height / buoy.width));
          else { ctx.fillStyle = isNext ? '#d6f08a' : '#e8a33a'; ctx.fillRect(x - 5, y - 5, 10, 10); }
        }
        if (isNext) {
          ctx.strokeStyle = '#d6f08a';
          ctx.lineWidth = 4;
          ctx.setLineDash([12, 10]);
          ctx.beginPath();
          ctx.moveTo(g.ax, g.ay);
          ctx.lineTo(g.bx, g.by);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = 'rgba(232,220,190,0.45)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, g.x, g.y + 4);
      });
      ctx.fillStyle = 'rgba(232,200,140,0.6)';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, (bx.minX + bx.maxX) / 2, bx.minY - 20);
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${c.after} · ${(c.length / KM).toFixed(1)} km · MERCY UNLIMITED RACEWAY`, (bx.minX + bx.maxX) / 2, bx.minY + 6);
    }
  }

  function drawStart(ctx, c, g, active, time) {
    // chequered line
    const n = 12, dx = (g.bx - g.ax) / n, dy = (g.by - g.ay) / n;
    const ox = g.tx * 14, oy = g.ty * 14;
    for (let k = 0; k < n; k++) {
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = (k + r) % 2 ? '#e6dcc4' : '#111';
        const x = g.ax + dx * k + ox * (r - 1), y = g.ay + dy * k + oy * (r - 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.lineTo(x + dx + ox, y + dy + oy);
        ctx.lineTo(x + ox, y + oy);
        ctx.closePath();
        ctx.fill();
      }
    }
    // gantry posts + five start lights
    for (const [x, y] of [[g.ax, g.ay], [g.bx, g.by]]) {
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(x - 9, y - 9, 18, 18);
      ctx.strokeStyle = '#b8962e';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 9, y - 9, 18, 18);
    }
    const lit = active ? '#5fd35f' : Math.floor(time / 500) % 2 ? '#ff3b1f' : '#4a140c';
    for (let k = 0; k < 5; k++) {
      const f = (k + 1) / 6;
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(g.ax + (g.bx - g.ax) * f - g.tx * 34, g.ay + (g.by - g.ay) * f - g.ty * 34, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // timing board at the right-hand post
    const ml = sprites?.get('logo_mercy');
    if (ml) ctx.drawImage(ml, g.bx - 24 + g.tx * 0, g.by + 20, 48, 48);
    ctx.fillStyle = '#e8c547';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('START / FINISH · LEADERBOARD: E', g.bx, g.by + 84);
  }

  function drawMinimap(mctx, tx, ty, show = true) {
    for (const c of CIRCUITS) {
      if (!show && race.track !== c) continue;
      mctx.strokeStyle = race.track === c ? '#d6f08a' : 'rgba(184,56,42,0.8)';
      mctx.lineWidth = 2;
      mctx.beginPath();
      c.path.forEach(([x, y], i) => (i % 4 ? 0 : i ? mctx.lineTo(tx(x), ty(y)) : mctx.moveTo(tx(x), ty(y))));
      mctx.closePath();
      mctx.stroke();
    }
    mctx.lineWidth = 1;
  }

  const bestOf = (id) => { const l = store.laps[id]; return l && l.length ? Math.min(...l.map((x) => x.ms)) : null; };
  const rivalTop = (id) => rivals[id].reduce((a, b) => (a.ms < b.ms ? a : b));
  return { update, status, drawWorld, drawMinimap, nearBoard, openBoard, boardOf: board, active: () => race.track, bestOf, rivalTop, fmt, next: () => (race.track ? race.track.gates[race.next % GATES] : null) };
}

// Leaderboards for every game: races, Range 7, Dock 3 and all 13 shift games.
// No backend yet: each board is this browser's best runs against 12 seeded rival pilots from the
// organizations (the same crew as the circuit boards). Shared boards come with accounts + a server.
import { mulberry32, hashStr } from './rng.js';
import { T13 } from './economy.js';

const KEY = 'claim-clone-space:boards:v1';
const RIVALS = [
  ['null', 'Warden Okafor'], ['mercy', 'Sister Vale'], ['kessler', 'Dusty Brannigan'], ['ashiron', 'Deacon Rook'],
  ['lastmile', 'Contractor #4471'], ['gavel', 'Lot 9'], ['cinder', 'Mx. Ozone'], ['gullet', 'Chef Marrow'],
  ['vanta', 'Junior Associate'], ['bureau', 'Smiley'], ['assessor', 'Appraiser Grey'], ['ministry', 'Lord Tenure III'],
];
const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;

export function createBoards({ econ, esc, openModal, closeModal, circuits, circuitList = [], games = {}, lore = null, sprites = null }) {
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
  const orgName = (id) => lore?.organizations?.find((o) => o.id === id)?.name || id;

  // board definitions: id -> { name, group, unit, low (lower is better), range for rivals }
  const DEFS = {
    spine: { name: 'Spine Run', group: 'Races', unit: 'time', low: true, range: [85000, 210000], sub: '13 gates through the crossings' },
    militia: { name: 'Range 7 · Militia qualification', group: 'Lore games', unit: 'pts', range: [140, 560], sub: 'max 650' },
    dock: { name: 'Loading Dock 3', group: 'Lore games', unit: 'pts', range: [55, 205], sub: 'inspection total' },
    salvage: { name: 'Salvage Yard 9', group: 'Lore games', unit: 'pts', range: [45, 230], sub: 'Kessler Mining Co. · ore' },
    auction: { name: 'Auction Floor 13', group: 'Lore games', unit: 'pts', range: [60, 320], sub: 'Gavel & Rope · commission' },
    airworks: { name: 'Airworks 5', group: 'Lore games', unit: 'pts', range: [40, 170], sub: 'Cinder Collective · air metered' },
    ration: { name: 'Ration Counter 6', group: 'Lore games', unit: 'pts', range: [80, 340], sub: 'Gullet Provisions · trays served' },
    foundry: { name: 'Foundry Line 3', group: 'Lore games', unit: 'pts', range: [60, 260], sub: 'Ash & Iron · casts' },
    annex: { name: 'Allocation Annex', group: 'Lore games', unit: 'pts', range: [60, 260], sub: 'Ministry of the Gentry' },
  };
  for (const c of circuitList) DEFS[`circuit:${c.id}`] = { name: c.name.replace(/^THE /, 'The ').replace(/\B\w+/g, (w) => w.toLowerCase()), group: 'Races', unit: 'time', low: true, circuit: c.id, sub: c.after };
  for (const [org, g] of Object.entries(games)) DEFS[`shift:${org}`] = { name: g.title, group: 'Shifts', unit: '%', range: [38, 97], sub: orgName(org), org };

  const better = (d, a, b) => (d.low ? a < b : a > b);
  const show = (d, v) => (d.unit === 'time' ? fmtTime(v) : d.unit === '%' ? `${v}%` : `${v}`);

  function rivals(id) {
    const d = DEFS[id];
    const rng = mulberry32(hashStr(`board:${id}`));
    return RIVALS.map(([org, name]) => {
      const q = Math.pow(rng(), 1.4); // a few very good, most middling
      const v = d.low ? d.range[0] + (d.range[1] - d.range[0]) * q : d.range[1] - (d.range[1] - d.range[0]) * q;
      return { name, org, v: d.unit === 'time' ? Math.round(v) : Math.round(v) };
    });
  }

  // full board, best first
  function board(id) {
    const d = DEFS[id];
    if (!d) return [];
    if (d.circuit) {
      const rows = circuits.boardOf(d.circuit);
      return rows.map((e) => ({ name: e.name, org: e.you ? 'you' : orgIdOf(e.org), v: e.ms, at: e.at, you: !!e.you }));
    }
    const mine = (store[id] || []).map((e) => ({ name: 'You · skiff #001', org: 'you', v: e.v, at: e.at, you: true }));
    return [...rivals(id), ...mine].sort((a, b) => (d.low ? a.v - b.v : b.v - a.v));
  }
  const ORG_BY_NAME = Object.fromEntries((lore?.organizations || []).map((o) => [o.name, o.id]));
  const orgIdOf = (name) => ORG_BY_NAME[name] || ORG_BY_NAME[String(name).replace('’', "'")] || 'mercy';

  // ---- recording ----
  function record(id, v, extra = {}) {
    const d = DEFS[id];
    if (!d || d.circuit || !Number.isFinite(v)) return null;
    const list = store[id] || (store[id] = []);
    const prevBest = list[0]?.v;
    list.push({ v, at: Date.now(), ...extra });
    list.sort((a, b) => (d.low ? a.v - b.v : b.v - a.v));
    list.length = Math.min(list.length, T13);
    save();
    const b = board(id);
    const rank = b.findIndex((e) => e.you && e.v === v) + 1;
    last[id] = { v, rank, of: b.length, newBest: prevBest == null || better(d, v, prevBest) };
    return last[id];
  }
  const last = {};
  function onEvent(type, data) {
    if (type === 'shift') record(`shift:${data.org}`, Math.round(Math.max(0, data.q) * 100));
    else if (type === 'militia') record('militia', data.score);
    else if (type === 'dock') record('dock', data.total);
    else if (type === 'annex') record('annex', data.score);
    else if (type === 'salvage') record('salvage', data.score);
    else if (type === 'auction') record('auction', data.score);
    else if (type === 'airworks') record('airworks', data.score);
    else if (type === 'ration') record('ration', data.score);
    else if (type === 'foundry') record('foundry', data.score);
    else if (type === 'lap') record('spine', data.ms);
  }
  // one line for a results screen
  function line(id) {
    const d = DEFS[id], r = last[id];
    if (!d || !r) return '';
    const top = board(id)[0];
    return `<b>Leaderboard:</b> #${r.rank} of ${r.of}${r.newBest ? ' · <b style="color:#d6f08a">personal best</b>' : ''}${r.rank === 1 ? ' · <b style="color:#e8c547">P1</b>' : ` · P1 ${esc(top.name)} ${show(d, top.v)}`}`;
  }
  function myBest(id) { const b = board(id); const i = b.findIndex((e) => e.you); return i < 0 ? null : { rank: i + 1, v: b[i].v }; }

  // ---- the board UI (B, the menu, and the Hall of Records) ----
  const GROUPS = ['Races', 'Lore games', 'Shifts'];
  function open(focus = null) {
    const ids = Object.keys(DEFS);
    if (!focus || !DEFS[focus]) focus = ids.find((i) => DEFS[i].group === 'Races');
    const d = DEFS[focus];
    const b = board(focus);
    const mine = b.findIndex((e) => e.you);
    const rows = b.slice(0, T13).map((e, i) => `<tr class="${e.you ? 'mine' : ''}"><td style="width:30px">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
      <td>${e.you ? '' : `<img src="assets/sprites/logo_${esc(e.org)}.png" width="16" height="16" alt="" style="vertical-align:middle" onerror="this.remove()"/> `}<b>${esc(e.name)}</b> <span class="sub">${e.you ? esc(new Date(e.at).toISOString().slice(0, 10)) : esc(orgName(e.org))}</span></td>
      <td style="text-align:right">${show(d, e.v)}</td></tr>`).join('');
    const outside = mine >= T13 ? `<div class="sub">Your best: #${mine + 1}, ${show(d, b[mine].v)}</div>` : mine < 0 ? '<div class="sub">You have no run on this board yet.</div>' : '';
    const pick = GROUPS.map((g) => {
      const opts = ids.filter((i) => DEFS[i].group === g);
      return `<div class="lb-group"><span class="sub">${esc(g)}</span>${opts.map((i) => { const mb = myBest(i); return `<button data-b="${esc(i)}" class="${i === focus ? 'primary' : ''}">${esc(DEFS[i].name)}${mb ? ` <span class="lb-rank">#${mb.rank}</span>` : ''}</button>`; }).join('')}</div>`;
    }).join('');
    openModal(
      `<h2>LEADERBOARDS</h2>
       <div class="sub">Hall of Records · kept by the Assessor's Office · “Everything has a fair price.”</div>
       <div class="lb-pick">${pick}</div>
       <h3>${esc(d.name.toUpperCase())} <span class="sub">${esc(d.sub || '')}</span></h3>
       <table>${rows}</table>${outside}
       <div class="explain"><i>Local for now: your best runs on this device against 12 seeded rival pilots. Boards go shared, with every pilot on them, once accounts and a server exist.</i></div>
       <div class="buttons"><button class="primary" id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-b]').forEach((bt) => bt.addEventListener('click', () => open(bt.dataset.b)));
      }
    );
  }

  // ---- in the world: the Hall of Records, a big screen cycling through the boards ----
  const HALL = { x: 420, y: 760 };
  const PAD = { x: HALL.x, y: HALL.y + 120 };
  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - HALL.x) > 2400 || Math.abs(cam.y - HALL.y) > 2400) return;
    const ids = Object.keys(DEFS);
    const id = ids[Math.floor(time / 6000) % ids.length], d = DEFS[id], b = board(id).slice(0, 5);
    const x0 = HALL.x - 160, y0 = HALL.y - 90;
    c.fillStyle = '#0d0f12'; c.fillRect(x0, y0, 320, 180);
    c.strokeStyle = '#e8c547'; c.lineWidth = 3; c.strokeRect(x0, y0, 320, 180);
    c.fillStyle = '#e8c547'; c.fillRect(x0, y0, 320, 26);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 13px monospace'; c.textAlign = 'center';
    c.fillText('HALL OF RECORDS', HALL.x, y0 + 18);
    c.fillStyle = '#d6f08a'; c.font = 'bold 12px monospace';
    c.fillText(d.name.toUpperCase(), HALL.x, y0 + 44, 300);
    b.forEach((e, i) => {
      c.textAlign = 'left'; c.fillStyle = e.you ? '#e8c547' : '#efe6cf'; c.font = `${e.you ? 'bold ' : ''}12px monospace`;
      c.fillText(`${i + 1}. ${e.name}`, x0 + 14, y0 + 68 + i * 20, 210);
      c.textAlign = 'right'; c.fillText(show(d, e.v), x0 + 306, y0 + 68 + i * 20);
    });
    // scanline flicker
    c.fillStyle = `rgba(232,197,71,${0.03 + 0.03 * Math.sin(time / 90)})`; c.fillRect(x0, y0 + 26, 320, 154);
    c.strokeStyle = near ? '#e8c547' : 'rgba(232,197,71,0.45)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 24 + Math.sin(time / 200) * 3 : 20, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8c547'; c.font = 'bold 12px monospace'; c.textAlign = 'center';
    c.fillText(near ? 'E' : 'B', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#e8c547'; m.fillRect(tx(HALL.x) - 2, ty(HALL.y) - 3, 5, 6); };
  const nearHall = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;

  return { open, record, onEvent, line, board, myBest, drawWorld, drawMinimap, nearHall, pad: PAD, defs: DEFS };
}

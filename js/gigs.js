// The gig board (G): every open gig in one list, so the map and the log don't have to shout.
//
// - Up to 13 rows: your onboarding mission, the job you're on, freight offers, reported drops,
//   races, and residency stamps you still need.
// - Track one gig at a time (click a row). The tracked gig gets the flag + arrow on the map.
//   During onboarding the mission is tracked unless you pick something else.
// - "On map" toggles per type decide what else is drawn on the map and minimap.
// - Drops are listed by sector only, never exact spots: sight radius stays the earned edge.
//
// Adding a gig type: add a provider to rowsFor() returning { id, type, title, sub, pay, dist, ttl, target }.
import { T13 } from './economy.js';
import { CIRCUITS } from './circuits.js';

const KEY = 'claim-clone-space:gigs:v1';
const TYPES = {
  mission: { label: 'Mission', icon: 'icon_xp', color: '#d6f08a' },
  freight: { label: 'Freight', icon: 'ach_freight', color: '#4fc3f7' },
  drop: { label: 'Drops', icon: 'ach_scrounge', color: '#d6f08a' },
  race: { label: 'Races', icon: 'ach_racing', color: '#e8c547' },
  stamp: { label: 'Stamps', icon: 'ach_residency', color: '#e6dcc4' },
  shuttle: { label: 'Shuttle', icon: 'logo_ministry', color: '#d6f08a' },
  scooter: { label: 'Scooters', icon: 'logo_lastmile', color: '#4fc3f7' },
  magnet: { label: 'Magnet', icon: 'ach_scrounge', color: '#ffb347' },
};
const TOGGLES = ['freight', 'drop', 'race', 'stamp', 'scooter'];

export function createGigs({ world, econ, loops, circuits, progress, registries, sectorName, sectorCentre, getDrops, mission, onboarding, esc, log, $, extraRows = () => [], citizen = null, startClosed = false }) {
  const compact = startClosed; // touch screens: shorter tab label
  const CHURN = new Set(['freight', 'drop', 'scooter', 'race']);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const prefs = { open: !startClosed, sort: 'dist', map: { freight: false, drop: true, race: true, stamp: true, scooter: true }, ...saved };
  prefs.map = { freight: false, drop: true, race: true, stamp: true, scooter: true, ...(saved.map || {}) };
  let tracked = null; // row id; null = auto (mission during onboarding)
  let lastJobOffer = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: prefs.open, sort: prefs.sort, map: prefs.map })); } catch {} };
  const S = econ.state;

  const metres = (px) => px / 6;
  const fmtDist = (px) => { const m = metres(px); return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; };
  const fmtTtl = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; };

  function rowsFor(body, now) {
    const at = (t) => Math.hypot(t.x - body.x, t.y - body.y);
    const rows = [];
    // 1. onboarding mission
    const m = mission(body);
    if (m) rows.push({ id: 'mission', type: 'mission', title: m.label, sub: 'Onboarding', pay: '', target: m, pinned: 2 });
    // 2. freight: the job you're on, then offers
    const job = loops.freightJob();
    if (job) {
      rows.push({ id: 'job', type: 'freight', title: `Deliver ${job.cargo} → Lot ${job.to}`, sub: `${Math.round(job.damage * 100)}% damaged · X to dump`, pay: `${job.reward}`, ttl: job.deadline - now, target: { ...job.dropoff, label: `Deliver to Lot ${job.to}` }, pinned: 1 });
    }
    for (const o of job ? [] : loops.freightOffers()) {
      rows.push({ id: `offer:${o.id}`, offerId: o.id, type: 'freight', title: `Lot ${o.from} → Lot ${o.to}`, sub: `${o.cargo} · for ${econ.ownerName(o.owner)} · ${o.seconds}s to deliver`, pay: `${o.reward}`, ttl: o.expires - now, target: { ...o.pickup, label: `Freight pickup · Lot ${o.from}` } });
    }
    // 2b. other gig types (Humane Shuttle, …)
    rows.push(...extraRows(at));
    // 3. drops: by sector, never the exact spot
    const bySector = new Map();
    for (const d of getDrops()) {
      if (S.claimedDrops[d.key]) continue;
      const sec = sectorName(world, d.x, d.y);
      const e = bySector.get(sec) || { n: 0, d, expires: d.expires };
      e.n++;
      bySector.set(sec, e);
    }
    for (const [sec, e] of bySector) {
      const c = sectorCentre(world, e.d.x, e.d.y);
      rows.push({ id: `drop:${sec}`, type: 'drop', title: `Scrap reported in ${sec}`, sub: `${e.n > 1 ? `${e.n} drops` : 'a drop'} somewhere in the sector · inside your sight radius to see it`, pay: '13–39', ttl: e.expires - Date.now(), target: { ...c, label: `Scrap reported in ${sec}`, area: true } });
    }
    // 4. races
    const sr = loops.spineRun();
    rows.push({ id: 'race:spine', type: 'race', title: 'Spine Run', sub: `13 gates through the crossings${sr.best ? ` · your best ${(sr.best / 1000).toFixed(2)}s` : ''}`, pay: '13+', target: sr.active && sr.next ? { x: sr.next[0], y: sr.next[1], label: 'Spine Run · next gate' } : { x: sr.start[0], y: sr.start[1], label: 'Spine Run start' } });
    for (const c of CIRCUITS) {
      const best = circuits.bestOf(c.id), top = circuits.rivalTop(c.id);
      const next = circuits.active() === c ? circuits.next() : null;
      rows.push({ id: `race:${c.id}`, type: 'race', title: c.name.replace(/^THE /, 'The ').replace(/\B\w+/g, (w) => w.toLowerCase()), sub: `${c.after}${best ? ` · your best ${circuits.fmt(best)}` : ''} · P1 ${circuits.fmt(top.ms)}`, pay: '13+', target: next ? { x: next.x, y: next.y, label: `${c.name} · next gate` } : { x: c.gates[0].x, y: c.gates[0].y, label: `${c.name} start` } });
    }
    // 5. residency stamps you still need
    for (const st of progress.openStamps()) {
      const t = st.org === 'registry' ? registries.reduce((a, b) => (at(a) < at(b) ? a : b)) : st;
      rows.push({ id: `stamp:${st.org}`, type: 'stamp', title: `Stamp: ${st.name}`, sub: st.how, pay: 'stamp', target: { x: t.x, y: t.y, label: st.site || st.name } });
    }
    for (const r of rows) r.dist = at(r.target);
    rows.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (prefs.sort === 'pay' ? (parseInt(b.pay) || 0) - (parseInt(a.pay) || 0) : 0) || a.dist - b.dist);
    return rows;
  }

  let rows = [];
  let rowsAt = -1e9;
  const refresh = (body, now = performance.now()) => { rows = rowsFor(body, now); rowsAt = now; };
  function trackedRow(body) {
    if (body && performance.now() - rowsAt > 250) refresh(body);
    // a tracked offer turns into the job when you load it
    const job = loops.freightJob();
    if (job && job.offerId !== lastJobOffer) {
      lastJobOffer = job.offerId;
      if (!tracked || tracked === `offer:${job.offerId}` || tracked.startsWith('offer:') || tracked.startsWith('drop:')) tracked = 'job';
    }
    if (!job) lastJobOffer = null;
    let r = tracked && rows.find((x) => x.id === tracked);
    if (tracked && !r && body) { refresh(body); r = rows.find((x) => x.id === tracked); }
    if (tracked && !r) tracked = null; // expired or done
    if (!r && rows.find((x) => x.id === 'shuttle:run') && (!tracked || tracked.startsWith('shuttle:'))) r = rows.find((x) => x.id === 'shuttle:run');
    if (!r && onboarding()) r = rows.find((x) => x.id === 'mission');
    return r || null;
  }

  // ---- public: what the map should point at ----
  function target(body) {
    const r = trackedRow(body);
    return r ? { ...r.target, label: r.target.label || r.title, gig: r.id } : null;
  }
  const mapView = () => ({ freight: prefs.map.freight, races: prefs.map.race, drops: prefs.map.drop, stamps: prefs.map.stamp, scooters: prefs.map.scooter, trackedOffer: (trackedRow()?.offerId) || null });

  function track(id) {
    tracked = tracked === id ? (id === 'mission' ? '__none' : null) : id;
    if (tracked === '__none') tracked = null;
    const r = rows.find((x) => x.id === id);
    if (tracked && r) log(`Tracking: ${esc(r.title)}.`);
    lastHtml = '';
  }
  function untrack() { tracked = null; lastHtml = ''; }

  // ---- the sidebar ----
  let lastHtml = '', lastRender = 0, newCount = 0, seen = new Set();
  function render(body, now) {
    if (now - lastRender < 250) return;
    lastRender = now;
    refresh(body, now);
    const tr = trackedRow(body);
    // only count gigs worth a look; freight/drop/scooter offers churn constantly
    const fresh = rows.filter((r) => !seen.has(r.id) && !CHURN.has(r.type));
    if (!prefs.open) newCount += fresh.length;
    for (const r of rows) seen.add(r.id);
    const el = $('gigs');
    // keep a mix: no single type can take over the 13 rows
    const CAP = { mission: 1, freight: 5, drop: 4, race: 3, stamp: 3, shuttle: 2, scooter: 3, magnet: 1 };
    const used = {};
    const list = rows.filter((r) => (used[r.type] = (used[r.type] || 0) + 1) <= CAP[r.type]).slice(0, T13);
    const head = `<div class="gh"><b>GIGS</b> <span class="sub">${rows.length} open</span><span class="sp"></span>
      <button data-g="sort" title="Sort">${prefs.sort === 'dist' ? 'nearest' : 'best pay'}</button><button data-g="close" title="Hide (G)">G ✕</button></div>`;
    const c = citizen?.();
    const star = c ? `<div class="gc" title="Civic Warmth™ (K)">★ <b>Most Humane Citizen today:</b> ${esc(c.name)} (skiff ${esc(c.skiff)}), who ${esc(c.deed)}</div>` : '';
    const toggles = `<div class="gt"><span class="sub">on map:</span>${TOGGLES.map((t) => `<button data-g="map:${t}" class="${prefs.map[t] ? 'on' : ''}">${TYPES[t].label}</button>`).join('')}</div>`;
    const body_ = list.map((r) => {
      const ty = TYPES[r.type];
      const on = tr && tr.id === r.id;
      return `<div class="gr ${on ? 'tracked' : ''}" data-g="track:${esc(r.id)}" title="${on ? 'Click to stop tracking' : 'Click to track'}">
        <img src="assets/sprites/${ty.icon}.png" alt="" onerror="this.remove()"/>
        <div class="gm"><div class="gti" style="color:${ty.color}">${on ? '⚑ ' : ''}${esc(r.title)}</div><div class="sub">${esc(r.sub)}</div></div>
        <div class="gx"><div>${r.pay ? `${esc(r.pay)} <span class="sub">${r.pay === 'stamp' ? '' : 'scrap'}</span>` : ''}</div><div class="sub" data-dist="${esc(r.id)}"></div>${r.ttl != null ? `<div class="sub ttl" data-ttl="${esc(r.id)}"></div>` : ''}</div></div>`;
    }).join('');
    const html = prefs.open
      ? `${head}${star}${toggles}<div class="gl">${body_ || '<div class="sub" style="padding:8px">Nothing open right now. Fly into the city.</div>'}</div>${rows.length > list.length ? `<div class="gmore">+${rows.length - list.length} more further away (nearest of each type shown)</div>` : ''}`
      : `<button class="gtab" data-g="open">${compact ? 'GIGS' : 'G · GIGS'} ${rows.length}${newCount ? ` <b>+${newCount}</b>` : ''}</button>`;
    // rebuild only when the list itself changes (not every distance tick), never mid-swipe,
    // and keep the scroll position; distances and timers are patched in place
    if (html !== lastHtml && !(touching && prefs.open && lastHtml.includes('class="gl"'))) {
      const gl = el.querySelector('.gl');
      const top = gl ? gl.scrollTop : 0;
      lastHtml = html;
      el.innerHTML = html;
      const gl2 = el.querySelector('.gl');
      if (gl2) gl2.scrollTop = top;
    }
    if (prefs.open) {
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const d of el.querySelectorAll('[data-dist]')) { const r = byId.get(d.dataset.dist); if (r) d.textContent = fmtDist(r.dist); }
      for (const d of el.querySelectorAll('[data-ttl]')) { const r = byId.get(d.dataset.ttl); if (r && r.ttl != null) d.textContent = fmtTtl(r.ttl); }
    }
  }

  function onClick(e) {
    const t = e.target.closest('[data-g]');
    if (!t) return;
    const g = t.dataset.g;
    if (g === 'close') toggle(false);
    else if (g === 'open') toggle(true);
    else if (g === 'sort') { prefs.sort = prefs.sort === 'dist' ? 'pay' : 'dist'; save(); }
    else if (g.startsWith('map:')) { const k = g.slice(4); prefs.map[k] = !prefs.map[k]; save(); }
    else if (g.startsWith('track:')) {
      track(g.slice(6));
      if (compact && tracked) toggle(false); // phones: pick a gig, board gets out of the way
    }
    lastHtml = '';
    lastRender = 0;
    e.preventDefault();
  }
  // a tap, not a swipe: scrolling the list on a phone must not track whatever was under your thumb
  let touching = false, down = null;
  const gel = $('gigs');
  gel.addEventListener('pointerdown', (e) => { touching = true; down = { x: e.clientX, y: e.clientY, t: e.target }; });
  gel.addEventListener('pointerup', (e) => {
    touching = false;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12) onClick({ target: down.t, preventDefault: () => e.preventDefault() });
    down = null;
  });
  gel.addEventListener('pointercancel', () => { touching = false; down = null; });
  window.addEventListener('pointerup', () => { touching = false; });
  // phones: tapping the world closes the board
  if (compact) document.getElementById('game')?.addEventListener('pointerdown', () => { if (prefs.open) toggle(false); });

  function toggle(open = !prefs.open) {
    prefs.open = open;
    if (open) newCount = 0;
    save();
    lastHtml = '';
    lastRender = 0;
  }

  return { render, target, mapView, toggle, untrack, track, rows: () => rows, tracked: () => trackedRow() };
}

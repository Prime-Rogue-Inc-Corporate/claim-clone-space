// Humane Shuttle runs — a career with the Humane Transit Directorate (Ministry of the Gentry).
//
// Sign up for a route at a Shuttle Depot in either Sprawl. Routes are random but run through hubs:
// a Sprawl stop, maybe the Halfway Halt, the city gate, a few Spine crossings, then a terminal
// (Central Hub, a racetrack, the far gate, the Refit Bay). Stop at each one, doors open, people
// get on and off. The shuttle handles like dog shit. Drive "well" (Comfort ≥ 70%) AND beat the par
// time for a scrap bonus on top of base pay. Runs earn career points; 13 ranks, each with a bit
// better pay and a slightly less awful shuttle.
import { mulberry32, hashStr, randInt, pick } from './rng.js';
import { T13 } from './economy.js';
import { SPRAWLS, registryOf, CITY_HALF, SPRAWL_OFFSET, sprawlAt } from './world.js';
import { KINDS, speedOf } from './entities.js';
import { CIRCUITS } from './circuits.js';
import { makePerson } from './people.js';

const ROUTE_WINDOW_MS = T13 * 60 * 1000; // new routes every 13 minutes
export const CAPACITY = T13; // a Humane Shuttle seats 13…
export const MAX_LOAD = T13 * 2; // …and the Directorate looks the other way up to 26. Standing is "humane-adjacent".
// Overcrowding: more fares, but every standing passenger makes it heavier, slower to stop and touchier.
export const standing = (n) => Math.max(0, n - CAPACITY);
function loadedStats(base, n) {
  const f = standing(n) / T13; // 0 … 1
  return { ...base, thrust: base.thrust * (1 - 0.3 * f), max: base.max * (1 - 0.18 * f), brake: Math.min(0.995, base.brake + 0.012 * f), turn: base.turn * (1 - 0.15 * f), drag: Math.min(0.998, base.drag + 0.0015 * f) };
}
const FARE = 3; // scrap per passenger delivered (before rank and VIP modifiers)
const VIP_CHANCE = 0.13; // per run

// How many pilots are around. Until there's a server this is simulated: a daily curve (busy evenings,
// dead small hours) plus noise per 13-minute window. With a server it becomes the real online count.
export function population(now = Date.now()) {
  const h = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const curve = 0.55 + 0.45 * Math.sin(((h - 13) / 24) * Math.PI * 2); // peaks ~19:00, lowest ~07:00
  const rng = mulberry32(hashStr(`pop:${Math.floor(now / ROUTE_WINDOW_MS)}`));
  return Math.max(3, Math.round(13 + 156 * curve * (0.8 + rng() * 0.4)));
}
// population → how busy the shuttle gets (0.3 quiet … 1 packed)
const crowd = (pop) => Math.max(0.3, Math.min(1, pop / 169));

const VIPS = [
  { name: 'Lord Tenure III', org: 'ministry', title: 'Peer of the Gentry' },
  { name: 'Junior Associate Hale', org: 'vanta', title: 'Vantablack Holdings' },
  { name: 'Deacon-Foreman Ruth', org: 'ashiron', title: 'Ash & Iron' },
  { name: 'Commander Voss', org: 'null', title: 'Null Sector Trust' },
  { name: 'Appraiser-General Grey', org: 'assessor', title: 'The Assessor’s Office' },
  { name: 'Auctioneer Lot', org: 'gavel', title: 'Gavel & Rope' },
  { name: 'Director of Cheer Bright', org: 'bureau', title: 'Bureau of Public Cheer' },
  { name: 'Matron Absolute', org: 'mercy', title: 'Mercy Unlimited' },
  { name: 'Meter Baron Ash', org: 'cinder', title: 'Cinder Collective' },
  { name: 'Mr. Kessler (no relation)', org: 'kessler', title: 'Kessler Mining Co.' },
  { name: 'The Registrar', org: 'registry', title: 'Registry of Skiffs & Souls' },
  { name: 'Chef Supreme Marrow', org: 'gullet', title: 'Gullet Provisions' },
  { name: 'Dispatcher-in-Chief Pell', org: 'lastmile', title: 'Last Mile Freight' },
];
const STOP_RADIUS = 90, DOOR_SPEED = 1.2, DOOR_SECONDS = 2;
const PX_PER_M = 6;
export const RANKS = ['Probationary Conductor', 'Conductor', 'Senior Conductor', 'Route Steward', 'Senior Route Steward', 'Depot Warden',
  'Line Supervisor', 'Humane Inspector', 'Senior Humane Inspector', 'Deputy Director of Transit', 'Director of Transit', 'Undersecretary for Humane Mobility', 'Commissioner of Humane Transit'];
const RANK_AT = [0, 3, 7, 13, 20, 30, 42, 56, 72, 90, 110, 135, 169];
export const rankFor = (pts) => RANK_AT.reduce((r, need, i) => (pts >= need ? i : r), 0);

// Each rank gets you a slightly less awful shuttle. It never stops being bad.
export function shuttleStats(rank) {
  const b = KINDS.shuttle, f = rank / (T13 - 1);
  return { ...b, thrust: b.thrust + 0.03 * f, max: b.max + 1.2 * f, turn: b.turn + 0.012 * f, yawLag: b.yawLag + 0.06 * f, pull: b.pull * (1 - 0.7 * f), wobble: b.wobble * (1 - 0.7 * f), grip: b.grip + 0.04 * f, brake: b.brake - 0.03 * f };
}

const CROSSING_NAMES = ['Shoe Mile', 'Tithe Gap', 'Saint Slag', 'Pallid Pass', 'The Squeeze', 'Gallows Gap', 'Ninth Hole', 'Rustgate', 'Low Cheer', 'Sable Cut', 'Ledger Gap', 'Last Light'];

function hubs(world, refit) {
  const gates = { east: { x: CITY_HALF + 500, y: 450, name: 'East Gate' }, west: { x: -(CITY_HALF + 500), y: 450, name: 'West Gate' } };
  const crossings = (world.spine.gaps || []).map((g, i) => ({ x: g.x, y: 330, name: `Crossing ${i + 1} · ${CROSSING_NAMES[i] || ''}`.trim() }));
  const terminals = [
    { x: 0, y: 1050, name: 'Central Hub' },
    { x: refit.x + 40, y: refit.y + 220, name: 'Kessler Refit Bay' },
    ...CIRCUITS.map((c) => ({ x: c.gates[0].bx + 160, y: c.gates[0].by + 160, name: `${c.name.replace(/^THE /, 'The ').replace(/\B\w+/g, (w) => w.toLowerCase())} (raceday crowd)` })),
  ];
  return { gates, crossings, terminals };
}

export function depotsFor() {
  return SPRAWLS.map((sp) => { const r = registryOf(sp); return { sprawl: sp.id, title: sp.title, dir: sp.dir, x: r.x, y: 560 }; });
}

function makeRoutes(world, refit, depot, windowIndex) {
  const H = hubs(world, refit);
  const sp = SPRAWLS.find((s) => s.id === depot.sprawl);
  const rng = mulberry32(hashStr(`shuttle:${depot.sprawl}:${windowIndex}`));
  const routes = [];
  for (let k = 0; k < 3; k++) {
    const stops = [{ x: depot.x, y: depot.y, name: `${sp.title} Depot` }];
    stops.push({ x: sp.x + randInt(rng, -1500, 1500), y: sp.y + (rng() < 0.5 ? -760 : 760), name: `${sp.title}, Row ${'ABC'[randInt(rng, 0, 2)]}` });
    if (rng() < 0.5) stops.push({ x: sp.dir * (CITY_HALF + SPRAWL_OFFSET / 2), y: 560, name: 'The Halfway Halt' });
    stops.push(sp.dir > 0 ? H.gates.east : H.gates.west);
    // 1–3 crossings on the near half of the Spine, working inward
    const near = H.crossings.filter((c) => c.x * sp.dir > 0).sort((a, b) => b.x * sp.dir - a.x * sp.dir);
    const n = randInt(rng, 1, 3);
    const picks = [...near].sort(() => rng() - 0.5).slice(0, n).sort((a, b) => b.x * sp.dir - a.x * sp.dir);
    stops.push(...picks);
    const far = sp.dir > 0 ? H.gates.west : H.gates.east;
    const term = rng() < 0.15 ? { ...far, name: `${far.name} (cross-city express)` } : pick(rng, H.terminals);
    stops.push(term);
    let dist = 0;
    for (let i = 1; i < stops.length; i++) dist += Math.hypot(stops[i].x - stops[i - 1].x, stops[i].y - stops[i - 1].y);
    const nStops = stops.length - 1;
    routes.push({
      id: `${depot.sprawl}-${windowIndex}-${k}`,
      depot: depot.sprawl,
      stops,
      dist,
      par: Math.round(dist / 200 + nStops * 8), // seconds; a decent driver in a rank-0 shuttle makes it
      base: Math.round(dist / 500 + nStops * 5),
    });
  }
  return routes;
}

export function createShuttle({ world, econ, log, esc, player, emit, openModal, closeModal, sprites, refit, spawnShuttle, endShuttle, passengers = null, addHeat = () => {}, onScootersEjected = () => {} }) {
  // ---- passenger chatter (data/passengers.json): praise, heckles, jokes, boarding, lateness ----
  const PF = passengers?.factions || {};
  const recent = [];
  function riderMix(kind) {
    const mix = passengers?.riders?.[kind] || { sprawl: 1 };
    const bag = Object.entries(mix).flatMap(([f, w]) => (PF[f] ? Array(w).fill(f) : []));
    return () => bag[Math.floor(Math.random() * bag.length)] || 'sprawl';
  }
  const fromSprawl = riderMix('sprawl'), fromCity = riderMix('city');
  const personFrom = (mix) => makePerson(mix());
  // load = people + the scooters some of them drag aboard (each scooter takes a place)
  const loadOf = (v) => (v.riders || []).reduce((n, p) => n + (p.scooter ? 2 : 1), 0) + (run?.vip ? 1 : 0);
  const sync = (v) => { v.passengers = (v.riders || []).length; v.load = loadOf(v); v.scooters = (v.riders || []).filter((p) => p.scooter).length; v.stats = loadedStats(v.baseStats, v.load); };
  function say(cat, now, toLog = true) {
    if (!run) return;
    const v = run.vehicle;
    if (!v.passengers && !run.vip) return; // an empty shuttle is a quiet shuttle
    const riders = v.riders?.length ? v.riders : [makePerson('sprawl')];
    // a VIP aboard talks a lot (about a third of the time)
    const who = run.vip && PF.vip && Math.random() < 0.34 ? null : riders[Math.floor(Math.random() * riders.length)];
    const base = who ? PF[who.faction] || PF.sprawl : PF.vip;
    const fac = who ? { ...base, label: `${base.label} · ${who.name.split(' ')[0].toUpperCase()}, ${who.age}` } : { ...PF.vip, label: `VIP · ${run.vip.name.toUpperCase()}` };
    if (!fac) return;
    const pool = (fac[cat]?.length ? fac[cat] : PF.sprawl?.[cat]?.length ? PF.sprawl[cat] : fac.heckle) || [];
    const fresh = pool.filter((l) => !recent.includes(l));
    const line = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    if (!line) return;
    recent.push(line);
    if (recent.length > 40) recent.shift();
    v.bubble = { who: fac.label, color: fac.color, text: line, until: now + 4800 };
    run.lastTalk = now;
    if (toLog) log(`<span style="color:${fac.color}">${esc(fac.label)}:</span> “${esc(line)}”`);
  }
  const chatterTick = (now, mood) => {
    if (!run) return;
    const since = now - (run.lastTalk || run.start);
    const cd = (k, ms) => { if (now < (run.cd?.[k] || 0)) return false; run.cd = { ...(run.cd || {}), [k]: now + ms }; return true; };
    if (mood === 'hit') { if (cd('hit', 2500)) say('heckle', now); return; }
    if (mood === 'harsh') { if (since > 2500 && cd('harsh', 7000)) say('heckle', now); return; }
    if (mood === 'calm' && run.calmFor > 12 && run.comfort > 80 && since > 5000 && cd('praise', 14000)) return say('praise', now);
    if ((now - run.start) / 1000 > run.route.par && since > 6000 && cd('late', 30000)) return say('late', now);
    if (since > 16000 + Math.random() * 8000) say('joke', now);
  };
  const S = econ.state;
  S.shuttle ||= { points: 0, runs: 0, smooth: 0, onTime: 0 };
  const depots = depotsFor();
  let run = null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const km = (px) => `${(px / PX_PER_M / 1000).toFixed(1)} km`;
  const rank = () => rankFor(S.shuttle.points);
  const mult = () => 1 + rank() * 0.04;

  let cache = { w: -1, routes: {} };
  function routes(depot) {
    const w = Math.floor(Date.now() / ROUTE_WINDOW_MS);
    if (cache.w !== w) cache = { w, routes: {} };
    return (cache.routes[depot.sprawl] ||= makeRoutes(world, refit, depot, w));
  }

  function signUp(route) {
    const d = depots.find((x) => x.sprawl === route.depot);
    const vehicle = spawnShuttle(d.x, d.y, d.dir > 0 ? Math.PI : 0, shuttleStats(rank()));
    vehicle.baseStats = vehicle.stats;
    const pop = population(), c = crowd(pop);
    vehicle.riders = Array.from({ length: Math.min(MAX_LOAD, randInt(Math.random, 1, Math.round(2 + 13 * c))) }, () => personFrom(fromSprawl));
    run = { route, vehicle, idx: 1, start: performance.now(), comfort: 100, doors: 0, hitCd: 0, calmFor: 0, pop, crowd: c, delivered: 0, vip: null, vipChecked: false };
    while (loadOf(vehicle) > MAX_LOAD) vehicle.riders.pop();
    sync(vehicle);
    if (Math.random() < VIP_CHANCE / 2) boardVip('at the depot');
    setTimeout(() => say('board', performance.now()), 1200);
    log(`🚌 HUMANE SHUTTLE · ${route.stops.length - 1} stops to ${esc(route.stops[route.stops.length - 1].name)}. Par ${fmt(route.par)}. Comfort ≥ 70% and under par for the bonus. It handles like garbage. That's the job.`, 'good');
  }

  // ---- VIPs: rare, fussy, lucrative. Keep them comfortable. Or don't. ----
  function boardVip(where) {
    if (run.vip) return;
    const v = run.vehicle;
    run.vip = { ...VIPS[Math.floor(Math.random() * VIPS.length)] };
    while (loadOf(v) >= MAX_LOAD && v.riders.length) v.riders.shift(); // someone gets bumped. Of course they do.
    sync(v);
    v.vipAboard = true;
    log(`⭐ <b>VIP ABOARD</b> ${esc(where)}: <b>${esc(run.vip.name)}</b> (${esc(run.vip.title)}). Pay ×1.5 and a delivery bonus if they arrive comfortable (80%+). They feel every bump twice.`, 'money');
    setTimeout(() => say('board', performance.now()), 900);
  }
  // A VIP who doesn't survive the ride. Hidden honour, very public consequences.
  function vipDies(how, inManifest = false) {
    const vip = run.vip;
    if (!inManifest) recordSouls([{ name: vip.name, age: 40 + Math.floor(Math.random() * 40), label: `VIP · ${vip.title}`, job: vip.title, home: 'Tenure Heights', detail: how, vip: true }], run.vehicle.x, run.vehicle.y);
    run.vip = null;
    run.vehicle.vipAboard = false;
    log(`☠ <b>${esc(vip.name)}</b> (${esc(vip.title)}) ${how}. The Directorate is "reviewing your file". Null Sector is on the way. In the Squalor, somebody is buying a round.`, 'money');
    S.shuttle.points = Math.max(0, S.shuttle.points - T13); // demotion pressure
    addHeat(3, `a VIP died on your shuttle`);
    emit('vip-killed', { org: vip.org, name: vip.name, how });
  }

  // ---- the Registry of Skiffs & Souls keeps count ----
  S.souls ||= { count: 0, vips: 0, dumps: 0, recent: [] };
  function recordSouls(list, x, y) {
    S.souls.count += list.length;
    S.souls.vips += list.filter((p) => p.vip).length;
    S.souls.dumps++;
    S.souls.recent = [...list.map((p) => ({ name: p.name, age: p.age, label: p.label, at: Date.now() })), ...S.souls.recent].slice(0, 13);
    econ.save();
    emit('souls', { count: S.souls.count });
  }
  function showManifest(lost) {
    const rows = lost.map((p) => `<tr><td><b>${esc(p.name)}</b>, ${p.age}${p.vip ? ' ⭐' : ''}<div class="sub" style="margin:2px 0 0">${esc(p.label)} · ${esc(p.job)} · of ${esc(p.home)}${p.scooter ? ' · and their scooter' : ''}</div></td><td class="sub" style="text-align:right">${esc(p.detail)}</td></tr>`).join('');
    openModal(
      `<h2>MANIFEST OF THE DEPARTED</h2>
       <div class="sub">Registry of Skiffs &amp; Souls · ejected from a Humane Shuttle in the void · filed automatically</div>
       <table>${rows}</table>
       <div class="explain">Souls lost on your watch: <b>${S.souls.count}</b>${S.souls.vips ? ` (${S.souls.vips} VIP)` : ''} across ${S.souls.dumps} incident${S.souls.dumps === 1 ? '' : 's'}. The count is permanent. It is on your residency card. Mercy Unlimited has been notified, and is delighted.</div>
       <div class="buttons"><button class="primary" id="x">Close</button></div>`,
      (el) => el.querySelector('#x').addEventListener('click', closeModal)
    );
  }

  function end(reason, at) {
    const v = run.vehicle;
    run = null;
    endShuttle(v, at);
    if (reason) log(reason);
  }

  function update(dt, now, body, hit, input) {
    if (!run) return;
    if (player.ship !== run.vehicle || player.mode !== 'ship') {
      emit('shuttle-abandon');
      return end('You left the shuttle mid-route. The passengers are walking. The Directorate has noted it.', null);
    }
    const v = run.vehicle;
    // Comfort (tuned v0.1.8: hard, not impossible):
    // - walls: -8 a hit (1 s grace between hits)
    // - cornering: only what the passengers FEEL, i.e. how fast the direction of travel swings at speed.
    //   Steering corrections (the shuttle pulls left, so you're always correcting) don't count; only
    //   hard turns at speed do. Full lock at top speed costs ~15%/s; braking before a corner costs nothing.
    // - brake slams at speed: -3/s
    // - smooth driving lets passengers settle: +0.25/s back, up to 100
    // (Simulated: a careful driver finishes ~100% at about par; flooring it everywhere ends ~55–77%.)
    const sp = speedOf(v);
    // nobody aboard, nobody to upset; VIPs feel bumps 1.5×; standing passengers make everything worse (up to 2× at 26)
    const fuss = (run.vip ? 1.5 : 1) * (v.passengers || run.vip ? 1 : 0) * (1 + standing(v.load || 0) / T13);
    if (hit && now > run.hitCd) { run.comfort -= 8 * fuss; run.hitCd = now + 1000; emit('scrape'); log(`Passengers bounced off the ceiling. Comfort ${Math.max(0, Math.round(run.comfort))}%.`); chatterTick(now, 'hit'); }
    const head = Math.atan2(v.vy, v.vx);
    let swing = 0;
    if (sp > 1 && run.lastHead != null) { swing = Math.abs(Math.atan2(Math.sin(head - run.lastHead), Math.cos(head - run.lastHead))) / Math.max(dt * 60, 0.01); }
    run.lastHead = sp > 1 ? head : null;
    const lateral = sp * swing; // ~0.087 = full lock at top speed in a rank-0 shuttle (it slides)
    let calm = true;
    if (lateral > 0.05 && v.scooters && now > (run.scootCd || 0) && Math.random() < dt * 0.8) {
      run.scootCd = now + 5000;
      const owner = v.riders.filter((p) => p.scooter)[Math.floor(Math.random() * v.scooters)];
      const victim = v.riders[Math.floor(Math.random() * v.riders.length)];
      run.comfort -= 4 * fuss;
      log(`🛴 ${esc(owner.name)}'s scooter fell over on ${victim === owner ? 'them' : esc(victim.name)}. Comfort ${Math.max(0, Math.round(run.comfort))}%.`);
      chatterTick(now, 'hit');
    }
    if (lateral > 0.03) { run.comfort -= (lateral - 0.03) * 300 * dt * fuss; calm = false; }
    if (input.brake && sp > 3) { run.comfort -= 3 * dt * fuss; calm = false; }
    if (calm && now > run.hitCd) run.comfort = Math.min(100, run.comfort + (standing(v.load || 0) ? 0.1 : 0.25) * dt); // crammed passengers settle slower
    run.calmFor = calm ? run.calmFor + dt : 0;
    run.harshFor = calm ? 0 : (run.harshFor || 0) + dt;
    chatterTick(now, run.harshFor > 0.6 ? 'harsh' : calm ? 'calm' : 'meh');
    if (run.comfort <= 0 && (v.passengers || run.vip)) {
      if (run.vip) vipDies('suffered a fatal comfort deficiency');
      emit('passenger-incident');
      return end('🚨 PASSENGER INCIDENT. Everyone got off and walked. In space. Run failed, no pay. The Directorate will be in touch.', v);
    }
    // stops
    const stop = run.route.stops[run.idx];
    const d = Math.hypot(stop.x - v.x, stop.y - v.y);
    if (d < STOP_RADIUS && sp < DOOR_SPEED) {
      run.doors += dt;
      if (run.doors >= DOOR_SECONDS) arrive(now);
    } else run.doors = 0;
  }

  function arrive(now) {
    const v = run.vehicle, last = run.idx === run.route.stops.length - 1;
    const stop = run.route.stops[run.idx];
    run.doors = 0;
    if (last) return finish(now, stop);
    const off = Math.min(v.riders.length, randInt(Math.random, 0, Math.round(1 + 3 * run.crowd)));
    run.delivered += off;
    v.riders = v.riders.slice(off);
    const cityStop = Math.abs(stop.x) <= world.bounds.maxX + 600;
    if (!run.vipChecked && cityStop) { run.vipChecked = true; if (Math.random() < VIP_CHANCE) boardVip(`at ${stop.name}`); }
    const want = randInt(Math.random, 0, Math.round(1 + 9 * run.crowd));
    const boarded = [];
    for (let k = 0; k < want; k++) {
      const p = personFrom(cityStop ? fromCity : fromSprawl);
      if (loadOf(v) + (p.scooter ? 2 : 1) > MAX_LOAD) { p.scooter = false; if (loadOf(v) + 1 > MAX_LOAD) break; }
      v.riders.push(p);
      boarded.push(p);
    }
    const on = boarded.length, room = MAX_LOAD - loadOf(v);
    sync(v);
    const st = standing(v.load);
    if (st) run.peakStanding = Math.max(run.peakStanding || 0, st);
    log(`${esc(stop.name)}: ${off} off, ${on} on${boarded.some((p) => p.scooter) ? ` (${boarded.filter((p) => p.scooter).length} with scooters)` : ''}. ${v.passengers}${run.vip ? ' + VIP' : ''} aboard${st ? ` (<b>${st} standing</b>: heavier, touchier, more fares)` : ` (seats ${CAPACITY})`}.${on < want ? ' Packed solid. Others left at the stop, humanely.' : ''}`);
    if (st >= 6 && Math.random() < 0.7) setTimeout(() => say('crowd', performance.now()), 1500);
    if (on) { const all = v.riders; v.riders = boarded; say('board', now); v.riders = all; }
    run.idx++;
  }

  function finish(now, stop) {
    const r = run.route, secs = (now - run.start) / 1000;
    const rating = Math.round(Math.max(0, run.comfort));
    const onTime = secs <= r.par;
    const before = rank();
    run.delivered += run.vehicle.riders.length; // everybody off at the terminal
    const vipMult = run.vip ? 1.5 : 1;
    const fares = Math.round(run.delivered * FARE * mult());
    const dead = run.delivered === 0; // deadheading: nobody delivered, half pay, no bonus
    const base = Math.round((r.base * mult() * (dead ? 0.5 : 1) + fares) * vipMult);
    const bonus = !dead && rating >= 70 && onTime ? Math.round(r.base * 0.5 * mult() * vipMult) : 0;
    const vipBonus = run.vip && rating >= 80 ? T13 * 3 : 0;
    S.shuttle.runs++;
    if (rating >= 90) S.shuttle.smooth++;
    if (onTime) S.shuttle.onTime++;
    S.shuttle.points += 1 + (rating >= 70 ? 1 : 0) + (rating >= 90 ? 1 : 0) + (onTime ? 1 : 0);
    const res = econ.reward(base + bonus + vipBonus);
    log(`🚌 ${esc(stop.name)}. Everybody off: ${run.delivered} delivered${run.vip ? ` + VIP ${esc(run.vip.name)}` : ''}. ${fmt(secs)} (par ${fmt(r.par)}) · comfort ${rating}% · +${res.amount} scrap (incl. ${fares} in fares${run.vip ? ', ×1.5 VIP' : ''}${bonus ? `, +${bonus} smooth-and-on-time` : rating < 70 ? '; no bonus: rough ride' : '; no bonus: over par'}${vipBonus ? `, +${vipBonus} VIP delivered happy` : ''}).`, 'good');
    if (run.vip) emit('vip-delivered', { org: run.vip.org, happy: rating >= 80 });
    const after = rank();
    if (after > before) log(`PROMOTED: <b>${RANKS[after]}</b>, Humane Transit Directorate. Your next shuttle is marginally less terrible.`, 'money');
    emit('shuttle', { rating, onTime, rank: after, delivered: run.delivered, peakStanding: run.peakStanding || 0, vip: !!run.vip });
    end(null, stop);
  }

  // X: open the doors. Everybody aboard gets off right here (in the void, that's… a choice), but the
  // route carries on: new passengers board at the next stops and you can still finish it.
  // X with an empty shuttle abandons the route.
  function abandon() {
    if (!run) return false;
    const v = run.vehicle;
    const aboard = v.passengers + (run.vip ? 1 : 0);
    if (!aboard) {
      emit('shuttle-abandon', { void: false, passengers: 0 });
      end('You abandoned the route. The Directorate has noted it.', v);
      return true;
    }
    const inVoid = Math.abs(v.x) > world.bounds.maxX && !sprawlAt(v.x); // out between the city and the Sprawls
    const atStop = Math.hypot(run.route.stops[run.idx].x - v.x, run.route.stops[run.idx].y - v.y) < STOP_RADIUS * 2;
    if (inVoid) {
      const lost = v.riders.map((p) => ({ ...p, label: (PF[p.faction] || PF.sprawl || {}).label || p.faction }));
      if (run.vip) lost.unshift({ name: run.vip.name, age: 40 + Math.floor(Math.random() * 40), label: `VIP · ${run.vip.title}`, job: run.vip.title, home: 'Tenure Heights', detail: 'was very important', vip: true });
      const scoots = v.scooters || 0;
      if (run.vip) vipDies('was ejected into the void with the rest of them', true);
      recordSouls(lost, v.x, v.y);
      log(`You opened the doors in the void. ${lost.length} souls${scoots ? ` and ${scoots} scooters` : ''}. The Registry of Skiffs &amp; Souls has the manifest. The route goes on. Empty.`);
      if (scoots) onScootersEjected(v.x, v.y, scoots);
      if (v.passengers) emit('void-dump', { passengers: v.passengers });
      setTimeout(() => showManifest(lost), 400);
    } else {
      log(`You opened the doors ${atStop ? 'at the stop' : 'between stops'}: ${v.passengers}${run.vip ? ' + the VIP' : ''} got off, unpaid and unimpressed. Pick up more at the next stop. X again on an empty shuttle abandons the route.`);
      if (run.vip) { log(`⭐ ${esc(run.vip.name)} has left the shuttle. Furious. No VIP bonus.`); run.vip = null; v.vipAboard = false; }
      emit('passengers-dumped', { passengers: v.passengers });
    }
    v.riders = [];
    v.bubble = null;
    sync(v);
    return true;
  }

  // ---- depot sign-up ----
  const nearDepot = (x, y, r = 70) => depots.find((d) => Math.hypot(d.x - x, d.y - y) < r) || null;
  function openDepot(depot) {
    const rk = rank(), next = RANK_AT[rk + 1], pop = population();
    const list = routes(depot).map((r, i) => `<tr><td><b>${esc(r.stops[r.stops.length - 1].name)}</b> <span class="sub">· ${r.stops.length - 1} stops · ${km(r.dist)} · par ${fmt(r.par)}</span>
        <div class="sub" style="margin:2px 0 0">${r.stops.slice(1).map((s) => esc(s.name)).join(' → ')}</div></td>
        <td style="width:130px;text-align:right">${Math.round(r.base * mult())} scrap<div class="sub">+${Math.round(r.base * 0.5 * mult())} if smooth &amp; on time</div>${run ? '' : `<button data-r="${i}">Sign up</button>`}</td></tr>`).join('');
    openModal(
      `<h2>HUMANE SHUTTLE DEPOT · ${esc(depot.title.toUpperCase())}</h2>
       <div class="sub">Humane Transit Directorate · Ministry of the Gentry · “Getting the people where the gentry need them.”</div>
       <div class="explain"><b>Your career:</b> ${esc(RANKS[rk])} (rank ${rk + 1} of ${T13}) · ${S.shuttle.runs} runs · ${S.shuttle.points} points${next != null ? ` · next rank at ${next}` : ' · top of the ladder'}.<br/>
       <b>Pilots around: ~${pop}</b> (simulated until the server; later it's the real online count) → ${pop > 110 ? 'packed shuttles' : pop > 50 ? 'decent crowds' : 'quiet runs'}. Seats ${CAPACITY}, up to ${MAX_LOAD} with standing (heavier, touchier, more fares); fares ${FARE} scrap a head; ${Math.round(VIP_CHANCE * 100)}% chance of a VIP (pay ×1.5, +39 if they arrive 80%+ comfortable, feel every bump 1.5×).<br/>
       Pay ×${mult().toFixed(2)} at your rank. Stop at every stop (doors open after ${DOOR_SECONDS}s stopped). Comfort drops when you hit walls (−8), take corners hard at speed, or slam the brakes; it recovers slowly while you drive smoothly. At 0% the passengers walk.<br/>
       <b>The shuttle handles like dog shit.</b> It pulls left, the steering lags and the brakes are a suggestion. Each rank makes it slightly less bad.</div>
       <table>${list}</table>
       <div class="sub">New routes every 13 minutes. ${run ? 'You are already on a route.' : ''}</div>
       <div class="buttons"><button class="primary" id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { closeModal(); signUp(routes(depot)[Number(b.dataset.r)]); }));
      }
    );
  }

  // ---- HUD / board / drawing ----
  function status(now) {
    if (!run) return '';
    const secs = (now - run.start) / 1000, r = run.route;
    // a proper dashboard: big comfort number + bar, so you can read it while you drive
    const cf = Math.max(0, Math.round(run.comfort)), col = cf >= 80 ? '#d6f08a' : cf >= 50 ? '#ffd166' : '#ff7a5c';
    const over = secs > r.par;
    return `<div class="runhud"><div class="rh-top">SHUTTLE → <b>${esc(r.stops[run.idx].name)}</b> <span>(${run.idx}/${r.stops.length - 1})</span></div>
      <div class="rh-row"><span class="rh-cf" style="color:${col}">${cf}%</span><span class="rh-lbl">COMFORT${run.vip ? ' · ⭐ VIP' : ''}</span>
      <span class="rh-time" style="color:${over ? '#ff7a5c' : '#efe6cf'}">${fmt(secs)}<small> / par ${fmt(r.par)}</small></span></div>
      <div class="rh-bar"><i style="width:${cf}%;background:${col}"></i></div>
      <div class="rh-hint">${run.vehicle.passengers || run.vip ? 'X opens the doors' : 'empty · X abandons'}</div></div>`;
  }
  function prompt(body) {
    if (run) {
      const s = run.route.stops[run.idx];
      const d = Math.hypot(s.x - body.x, s.y - body.y);
      if (d < STOP_RADIUS * 2) return speedOf(body) >= DOOR_SPEED ? `Stop at ${s.name}: brake (SPACE)` : `Doors opening… ${Math.max(0, DOOR_SECONDS - run.doors).toFixed(1)}s`;
      return null;
    }
    const d = nearDepot(body.x, body.y);
    return d ? `E · Humane Shuttle Depot (sign up for a route)` : null;
  }
  function gigRows(at) {
    if (run) {
      const s = run.route.stops[run.idx];
      return [{ id: 'shuttle:run', type: 'shuttle', title: `Shuttle → ${s.name}`, sub: `stop ${run.idx}/${run.route.stops.length - 1} · comfort ${Math.max(0, Math.round(run.comfort))}% · ${run.vehicle.passengers} aboard${run.vip ? ' + ⭐ VIP' : ''}`, pay: `${Math.round(run.route.base * mult())}`, ttl: run.route.par * 1000 - (performance.now() - run.start), target: { x: s.x, y: s.y, label: `Shuttle stop · ${s.name}` }, pinned: 1 }];
    }
    return depots.map((d) => {
      const rs = routes(d), best = Math.max(...rs.map((r) => r.base));
      return { id: `shuttle:${d.sprawl}`, type: 'shuttle', title: `Humane Shuttle · ${d.title}`, sub: `${rs.length} routes · ~${population()} pilots around · ${RANKS[rank()]}`, pay: `≤${Math.round(best * 1.5 * mult())}`, target: { x: d.x, y: d.y, label: `Shuttle Depot · ${d.title}` } };
    });
  }
  function drawWorld(c, cam, time) {
    for (const d of depots) {
      if (Math.abs(cam.x - d.x) > 3000) continue;
      const img = sprites?.get('pad');
      if (img) c.drawImage(img, d.x - 34, d.y - 30, 68, 68 * (img.height / img.width));
      c.strokeStyle = '#d6f08a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(d.x, d.y, 42, 0, Math.PI * 2);
      c.stroke();
      const ml = sprites?.get('logo_ministry');
      if (ml) c.drawImage(ml, d.x - 22, d.y - 110, 44, 44);
      c.fillStyle = '#d6f08a';
      c.font = 'bold 13px monospace';
      c.textAlign = 'center';
      c.fillText('HUMANE SHUTTLE DEPOT', d.x, d.y - 52);
      c.font = '10px monospace';
      c.fillText('sign up for a route · E', d.x, d.y + 58);
    }
    if (!run) return;
    const st = run.route.stops;
    c.strokeStyle = 'rgba(214,240,138,0.25)';
    c.setLineDash([10, 16]);
    c.lineWidth = 3;
    c.beginPath();
    for (let i = run.idx - 1; i < st.length; i++) (i === run.idx - 1 ? c.moveTo(run.vehicle.x, run.vehicle.y) : c.lineTo(st[i].x, st[i].y));
    c.stroke();
    c.setLineDash([]);
    st.forEach((s, i) => {
      if (i < run.idx) return;
      const next = i === run.idx;
      c.strokeStyle = next ? '#d6f08a' : 'rgba(214,240,138,0.4)';
      c.lineWidth = next ? 5 : 2;
      c.beginPath();
      c.arc(s.x, s.y, next ? STOP_RADIUS + Math.sin(time / 200) * 6 : 30, 0, Math.PI * 2);
      c.stroke();
      if (next && run.doors > 0) {
        c.fillStyle = 'rgba(214,240,138,0.25)';
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.arc(s.x, s.y, STOP_RADIUS, -Math.PI / 2, -Math.PI / 2 + (run.doors / DOOR_SECONDS) * Math.PI * 2);
        c.fill();
      }
      c.fillStyle = next ? '#d6f08a' : 'rgba(214,240,138,0.6)';
      c.font = next ? 'bold 14px monospace' : '11px monospace';
      c.textAlign = 'center';
      c.fillText(`🚏 ${s.name}`, s.x, s.y - (next ? STOP_RADIUS + 14 : 38));
    });
  }
  function drawMinimap(m, tx, ty) {
    for (const d of depots) { m.fillStyle = '#d6f08a'; m.fillRect(tx(d.x) - 2, ty(d.y) - 2, 4, 4); }
    if (run) { const s = run.route.stops[run.idx]; m.strokeStyle = '#d6f08a'; m.strokeRect(tx(s.x) - 4, ty(s.y) - 4, 8, 8); }
  }

  return { souls: () => S.souls, _test: { vip: () => run && boardVip('(test)'), run: () => run }, update, status, prompt, nearDepot, openDepot, abandon, gigRows, drawWorld, drawMinimap, running: () => !!run, depots, rank, career: () => S.shuttle };
}

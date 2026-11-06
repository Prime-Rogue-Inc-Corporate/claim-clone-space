// Last Mile Scoot: dockless rental scooters (a Last Mile Freight brand).
//
// 1. Rentals: 39 scooters parked around the Spine, the crossings, the Sprawls and the Raceway.
//    Pull alongside in your skiff and press F to hop on (1 scrap to unlock, 1 scrap every 13 s).
//    Quick and twitchy; batteries run down; hit a wall fast and you eat it (scooter wrecked, a tug
//    drags you back to your skiff). F back into your skiff (or any ship) to end the ride; X ends it
//    from anywhere (3 scrap tug fee). Leave it wherever. Everybody does.
// 2. Juicing (gig): low or wrecked scooters show up on the gig board. Pick them up in your skiff
//    (E, slow, close; your hold takes 3), drop them at a Scoot Dock (E) for scrap. Recharged,
//    they go back out. Wrecks pay more; void wrecks (ejected from a shuttle) pay most.
import { mulberry32, hashStr, randInt } from './rng.js';
import { T13 } from './economy.js';
import { speedOf, KINDS } from './entities.js';
import { SPRAWLS, registryOf, CITY_HALF } from './world.js';
import { CIRCUITS } from './circuits.js';

const UNLOCK = 1, PER_TICK = 1, TICK_MS = 13000, TUG_FEE = 3;
const HOLD = 3, PICKUP_R = 55, PICKUP_SPEED = 3, DOCK_R = 70;
const PAY = { low: 6, empty: 9, wrecked: 13, void: 26 };

export function createScooters({ world, econ, log, esc, player, ships, makeShip, emit, sprites, returnToSkiff, spawnBase }) {
  const S = econ.state;
  S.juice ||= { delivered: 0 };
  const rng = mulberry32(hashStr(`scooters:${world.seed}`));
  const docks = [
    { x: 300, y: 1250, name: 'Central Hub Dock' },
    { x: CITY_HALF + 500, y: 760, name: 'East Gate Dock' },
    { x: -(CITY_HALF + 500), y: 760, name: 'West Gate Dock' },
    ...SPRAWLS.map((sp) => { const r = registryOf(sp); return { x: r.x, y: 860, name: `${sp.title} Dock` }; }),
  ];
  let seq = 0;
  const fleet = [];
  function add(x, y, extra = {}) {
    const sc = makeShip('scooter', x, y, rng() * Math.PI * 2, { rental: true, tag: `LMS-${String(++seq).padStart(3, '0')}`, battery: 100, ...extra });
    ships.push(sc);
    fleet.push(sc);
    return sc;
  }
  // 13 along the Spine, 13 in and around the Sprawls, 13 at crossings / the Raceway / docks
  const blocks = world.spine.blocks || [];
  for (let i = 0; i < T13; i++) {
    const b = blocks[i] || { x0: -1000, x1: 1000 };
    add(randInt(rng, b.x0 + 200, b.x1 - 200), randInt(rng, 240, 560), { battery: randInt(rng, 8, 100) });
  }
  for (let i = 0; i < T13; i++) {
    const sp = SPRAWLS[i % 2];
    add(sp.x + randInt(rng, -1900, 1900), sp.y + randInt(rng, -900, 900), { battery: randInt(rng, 5, 100) });
  }
  const gaps = world.spine.gaps || [];
  for (let i = 0; i < T13; i++) {
    const spot = i < 9 && gaps[i] ? { x: gaps[i].x, y: 420 } : i < 11 ? { x: CIRCUITS[i - 9].gates[0].bx, y: CIRCUITS[i - 9].gates[0].by + 220 } : docks[i - 11];
    add(spot.x + randInt(rng, -120, 120), spot.y + randInt(rng, -80, 80), { battery: randInt(rng, 3, 100) });
  }

  // ---- riding ----
  let ride = null;
  const statsFor = (sc) => ({ ...KINDS.scooter, max: sc.battery > 0 ? KINDS.scooter.max : 2, thrust: sc.battery > 0 ? KINDS.scooter.thrust : 0.05 });
  function canRide(sc) { return sc.rental && !sc.wrecked && !sc.carried; }
  function startRide(sc) {
    if (S.scrap < UNLOCK) { log('Last Mile Scoot: unlocking costs 1 scrap. You have none.'); return false; }
    econ.fine(UNLOCK);
    sc.stats = statsFor(sc);
    ride = { sc, start: performance.now(), nextCharge: performance.now() + TICK_MS, charged: UNLOCK, lastSpeed: 0 };
    emit('jump-scooter');
    log(`🛴 Unlocked ${sc.tag} · battery ${Math.round(sc.battery)}% · 1 scrap every 13 s. F back into a ship to park it anywhere; X to end the ride from here (${TUG_FEE} scrap tug).`);
    return true;
  }
  function parked(sc, msg = true) {
    if (!ride || ride.sc !== sc) return;
    if (msg) log(`🛴 Parked ${sc.tag} (${Math.round(sc.battery)}%). Ride cost ${ride.charged} scrap. Dockless. Where you leave it is its problem.`);
    ride = null;
  }
  function endRide(reason, fee = 0) {
    if (!ride) return false;
    const sc = ride.sc;
    if (fee) econ.fine(Math.min(S.scrap, fee));
    parked(sc, false);
    returnToSkiff(reason);
    return true;
  }
  function update(dt, now, body, hit) {
    if (!ride) return;
    const sc = ride.sc;
    if (player.ship !== sc) return; // switched ships (F) is handled by parked()
    if (hit && ride.lastSpeed > 5) {
      sc.wrecked = true;
      sc.battery = 0;
      sc.vx = sc.vy = 0;
      emit('wipeout');
      return endRide(`💥 You ate it on ${sc.tag} at ${(ride.lastSpeed * 10).toFixed(0)} m/s. Scooter wrecked. A Last Mile tug scrapes you up and drops you in your skiff.`);
    }
    ride.lastSpeed = speedOf(sc);
    if (body.thrusting) sc.battery = Math.max(0, sc.battery - 0.7 * dt);
    else sc.battery = Math.max(0, sc.battery - 0.1 * dt);
    sc.stats = statsFor(sc);
    if (now > ride.nextCharge) {
      ride.nextCharge = now + TICK_MS;
      if (S.scrap < PER_TICK) return endRide('🛴 Out of scrap. The scooter locks. A tug returns you to your skiff, sighing.');
      econ.fine(PER_TICK);
      ride.charged += PER_TICK;
    }
  }
  function onKey(k) {
    if (k === 'x' && ride && player.ship === ride.sc) return endRide(`🛴 Ride ended. ${ride.sc.tag} stays where it is. A tug returns you to your skiff (${TUG_FEE} scrap).`, TUG_FEE);
    return false;
  }

  // ---- juicing ----
  const hold = () => fleet.filter((sc) => sc.carried);
  const needsJuice = (sc) => !sc.carried && (sc.wrecked || sc.battery < 30) && !(ride && ride.sc === sc);
  const payFor = (sc) => (sc.voidWreck ? PAY.void : sc.wrecked ? PAY.wrecked : sc.battery < 5 ? PAY.empty : PAY.low);
  function nearPickup(body) {
    if (player.mode !== 'ship' || player.ship !== player.home) return null;
    if (hold().length >= HOLD || speedOf(body) > PICKUP_SPEED) return null;
    return fleet.find((sc) => needsJuice(sc) && Math.hypot(sc.x - body.x, sc.y - body.y) < PICKUP_R) || null;
  }
  const nearDock = (body) => (player.ship === player.home && hold().length ? docks.find((d) => Math.hypot(d.x - body.x, d.y - body.y) < DOCK_R) : null) || null;
  function pickup(sc) {
    sc.carried = true;
    const i = ships.indexOf(sc);
    if (i >= 0) ships.splice(i, 1);
    log(`🛴 Loaded ${sc.tag} (${sc.wrecked ? (sc.voidWreck ? 'void wreck' : 'wrecked') : `${Math.round(sc.battery)}%`}). Hold ${hold().length}/${HOLD}. Take it to a Scoot Dock.`);
  }
  function dropAt(dock) {
    const list = hold();
    let pay = 0;
    list.forEach((sc, k) => {
      pay += payFor(sc);
      Object.assign(sc, { carried: false, wrecked: false, voidWreck: false, battery: 100, x: dock.x + (k - 1) * 30, y: dock.y + 40, vx: 0, vy: 0 });
      ships.push(sc);
    });
    S.juice.delivered += list.length;
    const r = econ.reward(pay);
    log(`🔌 ${dock.name}: ${list.length} scooter${list.length === 1 ? '' : 's'} recharged and back in service. +${r.amount} scrap. Last Mile thanks its independent contractor.`, 'good');
    emit('juiced', { n: list.length, total: S.juice.delivered });
    econ.save();
  }
  // shuttle passengers' scooters, ejected in the void, become wrecks out there
  function ejected(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 200;
      add(x + Math.cos(a) * d, y + Math.sin(a) * d, { wrecked: true, voidWreck: true, battery: 0, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 });
    }
  }

  function prompt(body) {
    if (ride && player.ship === ride.sc) return `🛴 ${ride.sc.tag} · ${Math.round(ride.sc.battery)}% · ${ride.charged} scrap so far · F into a ship to park · X to end`;
    const p = nearPickup(body);
    if (p) return `E · load ${p.tag} into your hold (${hold().length}/${HOLD})`;
    const d = nearDock(body);
    if (d) return `E · drop ${hold().length} scooter${hold().length === 1 ? '' : 's'} at ${d.name}`;
    return null;
  }
  function onE(body) {
    const p = nearPickup(body);
    if (p) { pickup(p); return true; }
    const d = nearDock(body);
    if (d) { dropAt(d); return true; }
    return false;
  }

  function gigRows(at) {
    const rows = fleet.filter(needsJuice).map((sc) => ({
      id: `scoot:${sc.tag}`, type: 'scooter', title: `Juice ${sc.tag}`, sub: `${sc.wrecked ? (sc.voidWreck ? 'void wreck, drifting' : 'wrecked') : `${Math.round(sc.battery)}% battery`} · hold ${hold().length}/${HOLD} · Last Mile Scoot`,
      pay: `${payFor(sc)}`, target: { x: sc.x, y: sc.y, label: `Scooter ${sc.tag}` },
    }));
    if (hold().length) {
      const best = docks.reduce((a, b) => (at(a) < at(b) ? a : b));
      rows.push({ id: 'scoot:dock', type: 'scooter', title: `Drop ${hold().length} at ${best.name}`, sub: 'recharge them, get paid', pay: `${hold().reduce((n, sc) => n + payFor(sc), 0)}`, target: { ...best, label: best.name }, pinned: 1 });
    }
    return rows;
  }
  function drawWorld(c, cam) {
    for (const d of docks) {
      if (Math.abs(cam.x - d.x) > 2500 || Math.abs(cam.y - d.y) > 2500) continue;
      const img = sprites?.get('pad');
      if (img) c.drawImage(img, d.x - 28, d.y - 26, 56, 56 * (img.height / img.width));
      c.strokeStyle = '#4fc3f7';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(d.x, d.y, 36, 0, Math.PI * 2);
      c.stroke();
      const lg = sprites?.get('logo_lastmile');
      if (lg) c.drawImage(lg, d.x + 40, d.y - 20, 36, 36);
      c.fillStyle = '#4fc3f7';
      c.font = 'bold 12px monospace';
      c.textAlign = 'center';
      c.fillText(`🔌 ${d.name.toUpperCase()}`, d.x, d.y - 46);
    }
  }
  function drawMinimap(m, tx, ty, show = true) {
    if (!show) return;
    for (const d of docks) { m.fillStyle = '#4fc3f7'; m.fillRect(tx(d.x) - 2, ty(d.y) - 2, 4, 4); }
    for (const sc of fleet) if (needsJuice(sc)) { m.fillStyle = sc.wrecked ? '#ff5a3a' : '#ffb347'; m.fillRect(tx(sc.x) - 1, ty(sc.y) - 1, 2, 2); }
  }

  return { canRide, startRide, parked, update, onKey, prompt, onE, gigRows, drawWorld, drawMinimap, ejected, riding: () => ride, fleet, docks, hold };
}

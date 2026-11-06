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
import { SPRAWLS, registryOf, CITY_HALF, SPRAWL_OFFSET } from './world.js';
import { KINDS, speedOf } from './entities.js';
import { CIRCUITS } from './circuits.js';

const ROUTE_WINDOW_MS = T13 * 60 * 1000; // new routes every 13 minutes
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

export function createShuttle({ world, econ, log, esc, player, emit, openModal, closeModal, sprites, refit, spawnShuttle, endShuttle }) {
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
    vehicle.passengers = randInt(Math.random, 2, 7);
    run = { route, vehicle, idx: 1, start: performance.now(), comfort: 100, doors: 0, hitCd: 0 };
    log(`🚌 HUMANE SHUTTLE · ${route.stops.length - 1} stops to ${esc(route.stops[route.stops.length - 1].name)}. Par ${fmt(route.par)}. Comfort ≥ 70% and under par for the bonus. It handles like garbage. That's the job.`, 'good');
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
    // Comfort: walls, harsh turning, slamming the brakes
    if (hit && now > run.hitCd) { run.comfort -= 13; run.hitCd = now + 600; emit('scrape'); log(`Passengers bounced off the ceiling. Comfort ${Math.max(0, Math.round(run.comfort))}%.`); }
    const sp = speedOf(v);
    const harsh = sp * Math.abs(v.av || 0);
    if (harsh > 0.06) run.comfort -= (harsh - 0.06) * 300 * dt;
    if (input.brake && sp > 2) run.comfort -= 4 * dt;
    if (run.comfort <= 0) {
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
    const off = Math.min(v.passengers, randInt(Math.random, 0, 3));
    const on = randInt(Math.random, 0, 5);
    v.passengers = Math.max(1, v.passengers - off + on);
    log(`${esc(stop.name)}: ${off} off, ${on} on. ${v.passengers} aboard.`);
    run.idx++;
  }

  function finish(now, stop) {
    const r = run.route, secs = (now - run.start) / 1000;
    const rating = Math.round(Math.max(0, run.comfort));
    const onTime = secs <= r.par;
    const before = rank();
    const base = Math.round(r.base * mult());
    const bonus = rating >= 70 && onTime ? Math.round(r.base * 0.5 * mult()) : 0;
    S.shuttle.runs++;
    if (rating >= 90) S.shuttle.smooth++;
    if (onTime) S.shuttle.onTime++;
    S.shuttle.points += 1 + (rating >= 70 ? 1 : 0) + (rating >= 90 ? 1 : 0) + (onTime ? 1 : 0);
    const res = econ.reward(base + bonus);
    log(`🚌 ${esc(stop.name)}. Everybody off. ${fmt(secs)} (par ${fmt(r.par)}) · comfort ${rating}% · +${res.amount} scrap${bonus ? ` (incl. +${bonus} smooth-and-on-time bonus)` : rating < 70 ? ' · no bonus: rough ride' : ' · no bonus: over par'}.`, 'good');
    const after = rank();
    if (after > before) log(`PROMOTED: <b>${RANKS[after]}</b>, Humane Transit Directorate. Your next shuttle is marginally less terrible.`, 'money');
    emit('shuttle', { rating, onTime, rank: after });
    end(null, stop);
  }

  function abandon() {
    if (!run) return false;
    emit('shuttle-abandon');
    end('You abandoned the route. The passengers disembark into the void with some dignity.', run.vehicle);
    return true;
  }

  // ---- depot sign-up ----
  const nearDepot = (x, y) => depots.find((d) => Math.hypot(d.x - x, d.y - y) < 70) || null;
  function openDepot(depot) {
    const rk = rank(), next = RANK_AT[rk + 1];
    const list = routes(depot).map((r, i) => `<tr><td><b>${esc(r.stops[r.stops.length - 1].name)}</b> <span class="sub">· ${r.stops.length - 1} stops · ${km(r.dist)} · par ${fmt(r.par)}</span>
        <div class="sub" style="margin:2px 0 0">${r.stops.slice(1).map((s) => esc(s.name)).join(' → ')}</div></td>
        <td style="width:130px;text-align:right">${Math.round(r.base * mult())} scrap<div class="sub">+${Math.round(r.base * 0.5 * mult())} if smooth &amp; on time</div>${run ? '' : `<button data-r="${i}">Sign up</button>`}</td></tr>`).join('');
    openModal(
      `<h2>HUMANE SHUTTLE DEPOT · ${esc(depot.title.toUpperCase())}</h2>
       <div class="sub">Humane Transit Directorate · Ministry of the Gentry · “Getting the people where the gentry need them.”</div>
       <div class="explain"><b>Your career:</b> ${esc(RANKS[rk])} (rank ${rk + 1} of ${T13}) · ${S.shuttle.runs} runs · ${S.shuttle.points} points${next != null ? ` · next rank at ${next}` : ' · top of the ladder'}.<br/>
       Pay ×${mult().toFixed(2)} at your rank. Stop at every stop (doors open after ${DOOR_SECONDS}s stopped). Comfort drops when you hit walls, corner hard or slam the brakes; at 0% the passengers walk.<br/>
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
    return `<span style="color:#d6f08a">SHUTTLE → ${esc(r.stops[run.idx].name)} (${run.idx}/${r.stops.length - 1}) · ${fmt(secs)} / par ${fmt(r.par)} · comfort ${Math.max(0, Math.round(run.comfort))}% · X to abandon</span>`;
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
      return [{ id: 'shuttle:run', type: 'shuttle', title: `Shuttle → ${s.name}`, sub: `stop ${run.idx}/${run.route.stops.length - 1} · comfort ${Math.max(0, Math.round(run.comfort))}% · ${run.vehicle.passengers} aboard`, pay: `${Math.round(run.route.base * mult())}`, ttl: run.route.par * 1000 - (performance.now() - run.start), target: { x: s.x, y: s.y, label: `Shuttle stop · ${s.name}` }, pinned: 1 }];
    }
    return depots.map((d) => {
      const rs = routes(d), best = Math.max(...rs.map((r) => r.base));
      return { id: `shuttle:${d.sprawl}`, type: 'shuttle', title: `Humane Shuttle · ${d.title}`, sub: `${rs.length} routes · ${RANKS[rank()]} · handles like garbage`, pay: `≤${Math.round(best * 1.5 * mult())}`, target: { x: d.x, y: d.y, label: `Shuttle Depot · ${d.title}` } };
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

  return { update, status, prompt, nearDepot, openDepot, abandon, gigRows, drawWorld, drawMinimap, running: () => !!run, depots, rank, career: () => S.shuttle };
}

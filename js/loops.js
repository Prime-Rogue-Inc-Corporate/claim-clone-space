// Three gameplay loops. All rewards are scrap/XP: game-only, never credits or cash.
//  1. Freight jobs  — GTA courier missions. Pick up at one pad, deliver to another, beat the clock.
//  2. Heat          — GTA wanted level. Jack ships or speed on the Spine and Corp drones hunt you.
//  3. Spine Run     — 13-gate slalom through the Spine crossings. Beat your best time.
import { plotPad, collide } from './world.js';
import { HULL_TAP_TIER, T13 } from './economy.js';
import { speedOf } from './entities.js';

const KEY = 'claim-clone-space:loops:v1';
const CARGO = ['coolant cells', 'unmarked crates', 'ration bricks', 'reactor slag', 'a sealed casket', 'contraband prayer beads', 'fifty litres of recycled water'];

// Spine Run: 13 gates. Gate 1 (start/finish) sits south of the Spine's west end; gates 2–13
// are the 12 crossings, so the lap weaves north-south-north through the city, then home.
function raceGates(world) {
  const gaps = world.spine.gaps || [];
  if (gaps.length < 2) return [[-2900, 700], [0, -700], [2900, 700]];
  return [[gaps[0].x - 1300, 700], ...gaps.slice(0, T13 - 1).map((g) => [g.x, 0])];
}
const RACE_LIMIT_MS = T13 * 30 * 1000; // 6.5 minutes
const RING = 70;
// Pads: same rule as grabbing a drop. Close-ish and slowed down; the starter skiff drifts a lot.
const PAD_RADIUS = 75;
const PAD_SPEED = 5;

export function createLoops({ world, econ, log, rng, player, esc, getSolids, bust, sprites, hullLevel = () => 0, emit = () => {} }) {
  const RACE = raceGates(world);
  const saved = load();
  const persist = { bestLap: null, raceDay: '', jobsDone: 0, escapes: 0, ...saved };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(persist)); } catch {}
  };
  const claimed = () => world.plots.filter((p) => p.owner);
  const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;

  function pay(amount, why) {
    const res = econ.reward(amount);
    log(`+${res.amount} scrap · ${why}`, 'good');
    if (res.levelUp) log(`LEVEL ${res.levelUp}. Your sight widens.`, 'money');
  }

  // ---------------- 1. Freight jobs ----------------
  const freight = { offer: null, job: null, nextOffer: 0 };

  function newOffer(body) {
    const lots = claimed();
    if (lots.length < 2) return;
    const near = lots.filter((p) => Math.hypot(plotPad(world, p).x - body.x, plotPad(world, p).y - body.y) < 2500);
    const from = (near.length ? near : lots)[Math.floor(rng() * (near.length || lots.length))];
    // deliveries stay within ~2 blocks either way; the city is 42 km end to end
    const dests = lots.filter((p) => p !== from && Math.abs(p.x - from.x) < 6500);
    const pool = dests.length ? dests : lots.filter((p) => p !== from);
    const to = pool[Math.floor(rng() * pool.length)];
    const a = plotPad(world, from), b = plotPad(world, to);
    const dist = Math.hypot(a.x - b.x, a.y - b.y) + 400;
    freight.offer = {
      from: from.id, to: to.id,
      cargo: CARGO[Math.floor(rng() * CARGO.length)],
      reward: Math.round(15 + dist / 70),
      seconds: Math.round(dist / 150 + 20), // generous: tuned for the starter skiff, not an upgraded one
    };
    log(`JOB: ${esc(econ.ownerName(to.owner))} needs ${esc(freight.offer.cargo)} moved, Lot ${from.id} → Lot ${to.id}. ${freight.offer.reward} scrap. Blue beacon = pickup.`);
  }

  function updateFreight(now, body, hit) {
    // jobs are offered in the city only (not out in the void or the Sprawls)
    if (!freight.job && !freight.offer && now > freight.nextOffer && Math.abs(body.x) <= world.bounds.maxX) newOffer(body);
    if (freight.offer && !freight.job) {
      const pad = plotPad(world, econ.plotById(freight.offer.from));
      if (Math.hypot(pad.x - body.x, pad.y - body.y) < PAD_RADIUS) {
        if (player.mode !== 'ship') return;
        if (speedOf(body) >= PAD_SPEED) return;
        freight.job = { ...freight.offer, deadline: now + freight.offer.seconds * 1000, damage: 0, hitCooldown: 0 };
        freight.offer = null;
        log(`Loaded ${esc(freight.job.cargo)}. ${freight.job.seconds}s to Lot ${freight.job.to}. Don't scrape the paint.`);
      }
    }
    const job = freight.job;
    if (!job) return;
    if (player.mode !== 'ship') {
      log(`You bailed out with the cargo still aboard. Job failed.`);
      emit('bailed');
      return endJob(now);
    }
    if (hit && now > job.hitCooldown) {
      job.damage = Math.min(0.9, job.damage + Math.max(0.03, 0.15 - 0.12 * (hullLevel() / T13)));
      job.hitCooldown = now + 600;
      emit('scrape');
      log(`Cargo damaged (${Math.round(job.damage * 100)}%).`);
    }
    if (now > job.deadline) {
      log(`Too slow. ${esc(econ.ownerName(econ.plotById(job.to).owner))} has noted your name.`);
      emit('late');
      return endJob(now);
    }
    const pad = plotPad(world, econ.plotById(job.to));
    if (Math.hypot(pad.x - body.x, pad.y - body.y) < PAD_RADIUS && speedOf(body) < PAD_SPEED) {
      const timeBonus = Math.round(((job.deadline - now) / 1000) * 0.5);
      persist.jobsDone++;
      save();
      pay(Math.max(1, Math.round((job.reward + timeBonus) * (1 - job.damage))), `delivered ${job.cargo}${job.damage ? `, ${Math.round(job.damage * 100)}% damaged` : ''}`);
      endJob(now);
      emit('delivery', { damage: job.damage });
    }
  }

  function endJob(now) {
    freight.job = null;
    freight.offer = null;
    freight.nextOffer = now + 8000;
  }

  // ---------------- 2. Heat ----------------
  const heat = { level: 0, peak: 0, drones: [], calmSince: 0, speedCooldown: 0, nextSpawn: 0 };

  function addHeat(n, why, now) {
    const before = heat.level;
    if (before === 0) {
      heat.nextSpawn = now + 2500; // a head start: the first drone launches after 2.5s
      heat.tapped = false; // hull plating gets one save per pursuit
    }
    heat.level = Math.min(5, heat.level + n);
    heat.peak = Math.max(heat.peak, heat.level);
    heat.calmSince = now;
    if (heat.level > before) log(`HEAT ${'★'.repeat(heat.level)} · ${why}`);
  }

  function spawnDrone(body) {
    const a = rng() * Math.PI * 2;
    heat.drones.push({ x: body.x + Math.cos(a) * 1500, y: body.y + Math.sin(a) * 1500, vx: 0, vy: 0, angle: a + Math.PI });
  }

  function updateHeat(dt, now, body) {
    // speeding through the Spine traffic zone
    if (Math.abs(body.y) < 520 && speedOf(body) > 9.5 && now > heat.speedCooldown) {
      addHeat(1, 'speeding in the Spine zone', now);
      heat.speedCooldown = now + 6000;
    }
    if (heat.level === 0) return;

    while (heat.drones.length < heat.level && now > heat.nextSpawn) {
      spawnDrone(body);
      heat.nextSpawn = now + 1500;
    }
    const k = dt * 60;
    // 1 star: slower than a skiff. 3 stars: a boosting skiff just keeps ahead. 5: only an interceptor escapes.
    const max = 5.6 + heat.level * 0.85;
    let anyClose = false;
    for (const d of heat.drones) {
      const lead = 20;
      const tx = body.x + body.vx * lead, ty = body.y + body.vy * lead;
      const want = Math.atan2(ty - d.y, tx - d.x);
      let diff = Math.atan2(Math.sin(want - d.angle), Math.cos(want - d.angle));
      d.angle += Math.max(-0.07, Math.min(0.07, diff)) * k;
      d.vx += Math.cos(d.angle) * 0.28 * k;
      d.vy += Math.sin(d.angle) * 0.28 * k;
      d.vx *= Math.pow(0.97, k);
      d.vy *= Math.pow(0.97, k);
      const s = Math.hypot(d.vx, d.vy);
      if (s > max) { d.vx = (d.vx / s) * max; d.vy = (d.vy / s) * max; }
      d.x += d.vx * k;
      d.y += d.vy * k;
      collide(d, 10, getSolids());
      const dist = Math.hypot(d.x - body.x, d.y - body.y);
      if (dist < 700) anyClose = true;
      if (dist < 24) {
        // Hull plating VII+ shrugs off one drone tap per pursuit
        if (hullLevel() >= HULL_TAP_TIER && !heat.tapped) {
          heat.tapped = true;
          d.vx = -d.vx * 2;
          d.vy = -d.vy * 2;
          d.x += (d.x - body.x) * 2;
          d.y += (d.y - body.y) * 2;
          log('Drone tap! Hull plating held. Go, go, go.');
          continue;
        }
        return busted(now);
      }
    }
    if (anyClose) heat.calmSince = now;
    else if (now - heat.calmSince > 10000) {
      heat.level--;
      heat.drones.pop();
      heat.calmSince = now;
      if (heat.level === 0) {
        persist.escapes++;
        save();
        pay(15 * heat.peak, `shook a ${heat.peak}-star Corp pursuit`);
        emit('escape', { peak: heat.peak });
        heat.peak = 0;
        heat.drones = [];
      } else log(`Heat dropping: ${'★'.repeat(heat.level)}`);
    }
  }

  function busted(now) {
    const fine = Math.min(econ.state.scrap, 10 * heat.level);
    econ.fine(fine);
    log(`BUSTED. Corp drones impounded your ship${fine ? ` and fined you ${fine} scrap` : ''}. Have a nice EVA.`);
    emit('busted');
    heat.level = 0;
    heat.peak = 0;
    heat.drones = [];
    heat.tapped = false;
    if (freight.job) endJob(now);
    if (race.active) race.active = false;
    bust();
  }

  // ---------------- 3. Spine Run ----------------
  const race = { active: false, next: 1, start: 0, armedAt: 0 };

  function updateRace(now, body) {
    const [sx, sy] = RACE[0];
    if (!race.active) {
      if (player.mode === 'ship' && Math.hypot(sx - body.x, sy - body.y) < RING && now > race.armedAt) {
        race.active = true;
        race.next = 1;
        race.start = now;
        log(`SPINE RUN started. ${RACE.length - 1} crossings, slalom north-south, then back here.${persist.bestLap ? ` Best: ${fmt(persist.bestLap)}` : ''}`);
      }
      return;
    }
    if (player.mode !== 'ship' || now - race.start > RACE_LIMIT_MS) {
      race.active = false;
      race.armedAt = now + 3000;
      return log('Spine Run abandoned.');
    }
    const idx = race.next % RACE.length;
    const [cx, cy] = RACE[idx];
    if (Math.hypot(cx - body.x, cy - body.y) < RING) {
      if (idx === 0) {
        const lap = now - race.start;
        race.active = false;
        race.armedAt = now + 3000;
        const today = new Date().toISOString().slice(0, 10);
        let reward = T13;
        let why = `Spine Run ${fmt(lap)}`;
        let best = false;
        if (!persist.bestLap || lap < persist.bestLap) {
          if (persist.bestLap) { reward += T13 * 2; why += ` · NEW BEST (was ${fmt(persist.bestLap)})`; best = true; }
          persist.bestLap = lap;
        }
        if (persist.raceDay !== today) { reward += T13 * 3; why += ' · first lap today'; persist.raceDay = today; }
        save();
        pay(reward, why);
        emit('lap', { ms: lap, best });
      } else race.next++;
    }
  }

  // ---------------- shared ----------------
  return {
    update(dt, now, body, hit) {
      updateFreight(now, body, hit);
      updateHeat(dt, now, body);
      updateRace(now, body);
    },
    onJack(now) {
      addHeat(2, 'grand theft spacecraft', now);
    },
    addHeat(n, why) {
      addHeat(n, why, performance.now());
    },
    raceStart: RACE[0],
    onKey(k, now) {
      if (k === 'x' && (freight.job || freight.offer)) {
        log(freight.job ? 'You dumped the cargo. Job abandoned.' : 'Job declined.');
        endJob(now);
        return true;
      }
      return false;
    },
    prompt(body) {
      const near = (id) => {
        const pad = plotPad(world, econ.plotById(id));
        return Math.hypot(pad.x - body.x, pad.y - body.y) < 140;
      };
      const fast = speedOf(body) >= PAD_SPEED;
      if (freight.offer && !freight.job && near(freight.offer.from)) {
        if (player.mode !== 'ship') return 'Need a ship to haul cargo';
        return fast ? 'Too fast to load: brake (SPACE) on the blue pad' : 'Ease onto the blue pad to load cargo';
      }
      if (freight.job && near(freight.job.to)) return fast ? 'Too fast to unload: brake (SPACE) on the yellow pad' : 'Ease onto the yellow pad to deliver';
      return null;
    },
    status(now) {
      const parts = [];
      if (heat.level) parts.push(`<span style="color:#ff5a3a">HEAT ${'★'.repeat(heat.level)}${'☆'.repeat(5 - heat.level)}</span>`);
      if (freight.job) parts.push(`JOB → Lot ${freight.job.to} · ${Math.max(0, Math.ceil((freight.job.deadline - now) / 1000))}s${freight.job.damage ? ` · ${Math.round(freight.job.damage * 100)}% dmg` : ''}`);
      else if (freight.offer) parts.push(`OFFER: pickup Lot ${freight.offer.from} · X to decline`);
      if (race.active) parts.push(`RUN ${fmt(now - race.start)} · gate ${race.next % RACE.length || RACE.length}/${RACE.length}`);
      else if (persist.bestLap) parts.push(`best lap ${fmt(persist.bestLap)}`);
      return parts.join('<br/>');
    },
    drawWorld(ctx, body, time) {
      // freight beacons
      const beacon = (p, color, label) => {
        const pad = plotPad(world, p);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, 30 + Math.sin(time / 180) * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, pad.x, pad.y - 44);
        return pad;
      };
      let target = null;
      if (freight.job) target = beacon(econ.plotById(freight.job.to), '#ffd166', `DELIVER · ${freight.job.cargo.toUpperCase()}`);
      else if (freight.offer) target = beacon(econ.plotById(freight.offer.from), '#4fc3f7', `PICKUP · ${freight.offer.reward} SCRAP`);
      if (target) {
        ctx.strokeStyle = freight.job ? 'rgba(255,209,102,0.35)' : 'rgba(79,195,247,0.3)';
        ctx.setLineDash([4, 14]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(body.x, body.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // race gates
      RACE.forEach(([x, y], i) => {
        const isNext = race.active && i === race.next % RACE.length;
        const isStart = i === 0;
        if (!race.active && !isStart) return;
        ctx.strokeStyle = isNext ? '#d6f08a' : isStart ? '#e8c547' : 'rgba(214,240,138,0.25)';
        ctx.lineWidth = isNext ? 6 : 3;
        ctx.beginPath();
        ctx.arc(x, y, RING, 0, Math.PI * 2);
        ctx.stroke();
        if (isStart && !race.active) {
          ctx.fillStyle = '#e8c547';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SPINE RUN · FLY THROUGH', x, y - RING - 10);
          const ml = sprites?.get('logo_mercy');
          if (ml) ctx.drawImage(ml, x - 24, y - RING - 78, 48, 48);
        }
        if (isNext) {
          ctx.fillStyle = '#d6f08a';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(i === 0 ? 'FINISH' : `GATE ${i}`, x, y + 5);
        }
      });
      // drones
      const droneImg = sprites?.get('drone');
      for (const d of heat.drones) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        if (droneImg) {
          const w = 40, h = w * (droneImg.height / droneImg.width);
          ctx.drawImage(droneImg, -w * 0.6, -h / 2, w, h);
          ctx.restore();
          continue;
        }
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(0, -9); ctx.lineTo(-10, 0); ctx.lineTo(0, 9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = Math.floor(time / 120) % 2 ? '#ff3b1f' : '#3b6bff';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
    },
    drawMinimap(mctx, tx, ty) {
      const dot = (x, y, c, s = 4) => { mctx.fillStyle = c; mctx.fillRect(tx(x) - s / 2, ty(y) - s / 2, s, s); };
      if (freight.job) { const p = plotPad(world, econ.plotById(freight.job.to)); dot(p.x, p.y, '#ffd166', 5); }
      else if (freight.offer) { const p = plotPad(world, econ.plotById(freight.offer.from)); dot(p.x, p.y, '#4fc3f7', 5); }
      if (race.active) { const [x, y] = RACE[race.next % RACE.length]; dot(x, y, '#d6f08a', 5); }
      else dot(RACE[0][0], RACE[0][1], '#e8c547', 4);
      for (const d of heat.drones) dot(d.x, d.y, '#ff3b1f', 3);
    },
  };
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

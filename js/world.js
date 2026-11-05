// World geometry, collision, sectors and the shared drop schedule.
import { mulberry32, hashStr, pick, randInt } from './rng.js';

export const PLOT_W = 180;
export const DROP_WINDOW_MS = 150_000; // a new batch of drops every 2.5 minutes

// Footprint of a lot's structure. Taller buildings reach further from the spine.
export function plotRect(world, plot) {
  const hw = world.spine.halfWidth;
  const depth = plot.owner ? 70 + plot.floors * 3 : 50;
  const x = plot.x - PLOT_W / 2;
  if (plot.side === 'north') return { x, y: -hw - depth, w: PLOT_W, h: depth };
  return { x, y: hw, w: PLOT_W, h: depth };
}

// Docking pad: where you stop to open the lot terminal.
export function plotPad(world, plot) {
  const r = plotRect(world, plot);
  return plot.side === 'north' ? { x: plot.x, y: r.y - 46 } : { x: plot.x, y: r.y + r.h + 46 };
}

export function spineRect(world) {
  const { halfLength, halfWidth } = world.spine;
  return { x: -halfLength, y: -halfWidth, w: halfLength * 2, h: halfWidth * 2 };
}

export function solids(world) {
  return [spineRect(world), ...world.plots.map((p) => plotRect(world, p))];
}

// Circle vs rects: push the body out and kill velocity into the wall.
export function collide(body, radius, rects) {
  let hit = false;
  for (const r of rects) {
    const cx = Math.max(r.x, Math.min(body.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(body.y, r.y + r.h));
    let dx = body.x - cx;
    let dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    let d = Math.sqrt(d2);
    if (d === 0) {
      // centre inside the rect: push out the nearest side
      const left = body.x - r.x, right = r.x + r.w - body.x, top = body.y - r.y, bottom = r.y + r.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { dx = -1; dy = 0; d = -left; }
      else if (m === right) { dx = 1; dy = 0; d = -right; }
      else if (m === top) { dx = 0; dy = -1; d = -top; }
      else { dx = 0; dy = 1; d = -bottom; }
      const push = radius - d;
      body.x += dx * push;
      body.y += dy * push;
    } else {
      const nx = dx / d, ny = dy / d;
      body.x += nx * (radius - d);
      body.y += ny * (radius - d);
      dx = nx; dy = ny;
    }
    const vn = body.vx * dx + body.vy * dy;
    if (vn < 0) {
      body.vx -= 1.4 * vn * dx;
      body.vy -= 1.4 * vn * dy;
      body.vx *= 0.6;
      body.vy *= 0.6;
    }
  }
  return hit;
}

export function insideAny(x, y, rects, pad = 0) {
  return rects.some((r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);
}

// ---- The Sprawl: residential zone ~1 minute's flight east of the Spine (skiff at cruise). ----
export const SPRAWL = { x: 30000, y: 0, radius: 2200 };

export function flyBounds(world) {
  const b = world.bounds;
  return { minX: b.minX, maxX: SPRAWL.x + SPRAWL.radius + 600, minY: b.minY, maxY: b.maxY };
}

export function region(world, x) {
  if (x <= world.bounds.maxX) return 'city';
  if (x >= SPRAWL.x - SPRAWL.radius - 400) return 'sprawl';
  return 'void';
}

const SQUATTERS = ['Vel', 'Orrin', 'Mother Kade', 'the twins', 'Pike', 'Old Sorrow', 'Jessop', 'nobody you know', 'Rook', 'Ninefingers'];

// Hut sites on a ragged grid. Roughly half are already squatted by NPCs.
export function sprawlSites(world) {
  const rng = mulberry32(hashStr(`sprawl:${world.seed}`));
  const sites = [];
  const cols = 10, rows = 8, gap = 300;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = SPRAWL.x + (c - (cols - 1) / 2) * gap + (rng() - 0.5) * 80;
      const y = SPRAWL.y + (r - (rows - 1) / 2) * gap + (rng() - 0.5) * 80;
      const id = `H-${r + 1}${'ABCDEFGHIJ'[c]}`;
      const squatted = rng() < 0.5;
      sites.push({ id, x, y, squatter: squatted ? pick(rng, SQUATTERS) : null, npcTier: squatted ? randInt(rng, 0, 2) : null });
    }
  }
  const fires = Array.from({ length: 14 }, () => ({ x: SPRAWL.x + (rng() - 0.5) * 3000, y: SPRAWL.y + (rng() - 0.5) * 2400 }));
  // street clutter: sits on the tracks between huts, purely decorative
  const KINDS = ['junk', 'junk', 'dish', 'laundry', 'planter', 'fence'];
  const props = [];
  for (let i = -5; i <= 5; i++) {
    for (let j = -4; j <= 4; j++) {
      if (rng() > 0.32) continue;
      props.push({ x: SPRAWL.x + i * 300 + (rng() - 0.5) * 30, y: SPRAWL.y + j * 300 + 150 + (rng() - 0.5) * 60, kind: pick(rng, KINDS), flip: rng() < 0.5 });
    }
  }
  return { sites, fires, props };
}

export const HUT_SIZE = [ [40, 30], [54, 40], [68, 52] ];

export function hutRect(site, tier) {
  const [w, h] = HUT_SIZE[tier];
  return { x: site.x - w / 2, y: site.y - h / 2, w, h };
}

// Where you stop to use a hut site (just below it).
export function hutPad(site) {
  return { x: site.x, y: site.y + 58 };
}

const COLS = 'ABCDEFGH';
export function sectorName(world, x, y) {
  const reg = region(world, x);
  if (reg === 'sprawl') return 'THE SPRAWL';
  if (reg === 'void') return 'DEEP VOID';
  const b = world.bounds;
  const c = Math.max(0, Math.min(7, Math.floor(((x - b.minX) / (b.maxX - b.minX)) * 8)));
  const r = Math.max(0, Math.min(5, Math.floor(((y - b.minY) / (b.maxY - b.minY)) * 6)));
  return `${COLS[c]}${r + 1}`;
}

const DROP_TYPES = [
  { creature: 'A void whale', verb: 'relieved itself', noun: 'whale dung' },
  { creature: 'A Corp patrol drone', verb: 'exploded', noun: 'drone wreck' },
  { creature: 'A derelict hauler', verb: 'shed its cargo', noun: 'cargo spill' },
  { creature: 'A space bear', verb: 'shat in the dark', noun: 'bear turd' },
  { creature: 'A mining rig', verb: 'vented its hopper', noun: 'slag vent' },
];

// Every client computes the same drops from the clock: a shared world with no server.
// (First-claim is local in this prototype; a realtime server will arbitrate it later.)
export function dropsForWindow(world, windowIndex, multiplier = 1) {
  const rng = mulberry32(hashStr(`drops:${world.seed}:${windowIndex}`));
  const count = Math.max(1, Math.round(3 * multiplier));
  const rects = solids(world);
  const b = world.bounds;
  const drops = [];
  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    do {
      x = randInt(rng, b.minX + 200, b.maxX - 200);
      y = randInt(rng, b.minY + 200, b.maxY - 200);
      tries++;
    } while (insideAny(x, y, rects, 60) && tries < 20);
    const type = pick(rng, DROP_TYPES);
    drops.push({
      key: `${windowIndex}:${i}`,
      x,
      y,
      amount: randInt(rng, 10, 60),
      ...type,
      expires: (windowIndex + 1) * DROP_WINDOW_MS,
    });
  }
  return drops;
}

export function decorations(world) {
  const rng = mulberry32(hashStr(`deco:${world.seed}`));
  const rects = solids(world);
  const b = world.bounds;
  const rocks = [];
  const fb = flyBounds(world);
  for (let i = 0; i < 420; i++) {
    // ~1/3 in the city, the rest scattered along the long haul to the Sprawl
    const x = i < 140 ? randInt(rng, b.minX, b.maxX) : randInt(rng, b.maxX, fb.maxX);
    const y = randInt(rng, b.minY, b.maxY);
    if (insideAny(x, y, rects, 120)) continue;
    if (Math.hypot(x - SPRAWL.x, (y - SPRAWL.y) / 0.85) < SPRAWL.radius + 150) continue;
    const r = randInt(rng, 6, 34);
    const pts = [];
    const n = randInt(rng, 6, 9);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (0.7 + rng() * 0.45);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    rocks.push({ x, y, r, pts, shade: 30 + Math.floor(rng() * 30) });
  }
  return { rocks };
}

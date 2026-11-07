// World geometry, collision, sectors and the shared drop schedule.
import { mulberry32, hashStr, pick, randInt } from './rng.js';

export const T = 13;
export const PLOT_W = 180;
export const DROP_WINDOW_MS = 130_000; // a new batch of 13 drops every 130 seconds
// The city: 13 blocks of 13 lots along the Spine. Gaps between blocks cut through the Spine
// (placeholder crossings until north-south roads and real intersections exist).
export const SLOT = 220;
export const BLOCK_GAP = 300;
export const BLOCK_W = T * SLOT;
export const CITY_HALF = 21000; // city bounds: x in ±21000 (13 sector columns)
export const SPRAWL_OFFSET = 26000; // city edge → Sprawl centre: same ~1 minute flight as before

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

// Whole Spine extent (minimap, labels). Collision uses the per-block segments below.
export function spineRect(world) {
  const { halfLength, halfWidth } = world.spine;
  return { x: -halfLength, y: -halfWidth, w: halfLength * 2, h: halfWidth * 2 };
}

// The Spine as solid segments, one per block. The gaps between them are flyable crossings.
export function spineRects(world) {
  const hw = world.spine.halfWidth;
  if (!world.spine.blocks) return [spineRect(world)];
  return world.spine.blocks.map((b) => ({ x: b.x0, y: -hw, w: b.x1 - b.x0, h: hw * 2 }));
}

// ---- The Architects: Prime Rogue Inc. and Wilco Corporation ----
// Two campuses just off the Atlas (block 7), each at the end of its own Nerve. Each tower is a
// four-lot square (2 × 2 slots), 130 floors, and can never be bought.
export const ARCH_SIZE = SLOT * 2;
export const ARCH_FLOORS = 130;
export const ARCHITECT_INFO = {
  primerogue: { name: 'Prime Rogue Inc.', short: 'PRIME ROGUE', motto: 'Everything is on the record.', color: '#b8962e', nerveName: 'Prime Rogue Nerve' },
  wilco: { name: 'Wilco Corporation', short: 'WILCO', motto: 'Will comply.', color: '#4f7fa0', nerveName: 'Wilco Nerve' },
};
let archCache = null;
export function architects(world) {
  if (archCache && archCache.world === world) return archCache.list;
  const gaps = world.spine.gaps || [];
  const north = gaps[5] || { x: -1580 }; // the crossing between blocks 6 and 7
  const south = gaps[6] || { x: 1580 }; // the crossing between blocks 7 and 8
  const hw = world.spine.halfWidth, H = ARCH_SIZE / 2;
  const mk = (id, x, y, dir) => {
    const rect = { x: x - H, y: y - H, w: ARCH_SIZE, h: ARCH_SIZE };
    const pad = { x, y: dir < 0 ? y + H + 70 : y - H - 70 }; // on the Nerve, facing the Spine
    const nerve = dir < 0 ? { x, y0: y + H, y1: -hw } : { x, y0: hw, y1: y - H };
    const plaza = { x: x - H - 170, y: y - H - 170, w: ARCH_SIZE + 340, h: ARCH_SIZE + 340 };
    return { id, ...ARCHITECT_INFO[id], x, y, dir, rect, pad, nerve, plaza, floors: ARCH_FLOORS };
  };
  const list = [mk('primerogue', north.x, -1500, -1), mk('wilco', south.x, 1700, 1)];
  archCache = { world, list };
  return list;
}

export function solids(world) {
  return [...spineRects(world), ...world.plots.map((p) => plotRect(world, p)), ...architects(world).map((a) => a.rect)];
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

// ---- The two Sprawls: residential zones a ~1 minute flight off each end of the city. ----
// Free players' housing. Ridiculous names are the Assessor's doing.
export const SPRAWLS = [
  { id: 'east', prefix: 'E', name: 'LOWER UPPER SQUALOR', title: 'Lower Upper Squalor', x: CITY_HALF + SPRAWL_OFFSET, y: 0, rx: 2400, ry: 1100, dir: 1 },
  { id: 'west', prefix: 'W', name: 'UPPER LOWER SQUALOR', title: 'Upper Lower Squalor', x: -(CITY_HALF + SPRAWL_OFFSET), y: 0, rx: 2400, ry: 1100, dir: -1 },
];
export const SPRAWL = SPRAWLS[0]; // legacy alias
export const sprawlById = (id) => SPRAWLS.find((s) => s.id === id);

// Which Sprawl a point is in (or near), else null.
export function sprawlAt(x, margin = 400) {
  return SPRAWLS.find((s) => Math.abs(x - s.x) <= s.rx + margin) || null;
}
// Each Sprawl's Housing Registry kiosk sits on its city-facing edge.
export function registryOf(sp) {
  return { x: sp.x - sp.dir * (sp.rx - 200), y: sp.y, sprawl: sp.id };
}

export function flyBounds(world) {
  const b = world.bounds;
  const w = SPRAWLS.find((s) => s.dir < 0), e = SPRAWLS.find((s) => s.dir > 0);
  return { minX: w.x - w.rx - 600, maxX: e.x + e.rx + 600, minY: b.minY, maxY: b.maxY };
}

export function region(world, x) {
  if (Math.abs(x) <= world.bounds.maxX) return 'city';
  if (sprawlAt(x)) return 'sprawl';
  return 'void';
}

const SQUATTERS = ['Vel', 'Orrin', 'Mother Kade', 'the twins', 'Pike', 'Old Sorrow', 'Jessop', 'nobody you know', 'Rook', 'Ninefingers', 'Aunt Tallow', 'Sixpence', 'the Deacon'];
export const COLS13 = 'ABCDEFGHIJKLM';
export const SITE_COLS = T, SITE_ROWS = 3, SITE_GAP = 300;

// 13 × 3 = 39 hut sites per Sprawl, on a ragged grid. Roughly half are already squatted by NPCs.
export function sprawlSites(world) {
  const sites = [], fires = [], props = [];
  const PROP_KINDS = ['junk', 'junk', 'dish', 'laundry', 'planter', 'fence'];
  for (const sp of SPRAWLS) {
    const rng = mulberry32(hashStr(`sprawl:${sp.id}:${world.seed}`));
    for (let r = 0; r < SITE_ROWS; r++) {
      for (let c = 0; c < SITE_COLS; c++) {
        const x = sp.x + (c - (SITE_COLS - 1) / 2) * SITE_GAP + (rng() - 0.5) * 60;
        const y = sp.y + (r - (SITE_ROWS - 1) / 2) * SITE_GAP * 1.4 + (rng() - 0.5) * 60;
        const squatted = rng() < 0.5;
        // squatters mostly live rough: low tiers are common, a Big Bunker is rare
        const npcTier = squatted ? Math.min(T - 1, Math.floor(Math.pow(rng(), 2.2) * T)) : null;
        sites.push({ id: `${sp.prefix}-${r + 1}${COLS13[c]}`, sprawl: sp.id, x, y, squatter: squatted ? pick(rng, SQUATTERS) : null, npcTier });
      }
    }
    for (let i = 0; i < T; i++) fires.push({ x: sp.x + (rng() - 0.5) * sp.rx * 1.6, y: sp.y + (rng() - 0.5) * sp.ry * 1.6, sprawl: sp.id });
    // street clutter on the tracks between huts, purely decorative
    for (let i = -7; i <= 7; i++) {
      for (let j = -2; j <= 2; j++) {
        if (rng() > 0.32) continue;
        props.push({ x: sp.x + i * SITE_GAP + 150 + (rng() - 0.5) * 30, y: sp.y + j * SITE_GAP * 0.7 + (rng() - 0.5) * 40, kind: pick(rng, PROP_KINDS), flip: rng() < 0.5, sprawl: sp.id });
      }
    }
  }
  return { sites, fires, props };
}

// 13 hut tiers share three art sets: I–IV shack, V–VIII hut, IX–XIII bunker.
export const hutArt = (tier) => (tier < 4 ? 0 : tier < 8 ? 1 : 2);
export const HUT_SIZE = [ [40, 30], [54, 40], [68, 52] ];

export function hutRect(site, tier) {
  const [w0, h0] = HUT_SIZE[hutArt(tier)];
  const grow = 1 + (tier % 4) * 0.06; // a little bigger within each art set
  const w = w0 * grow, h = h0 * grow;
  return { x: site.x - w / 2, y: site.y - h / 2, w, h };
}

// Where you stop to use a hut site (just below it).
export function hutPad(site) {
  return { x: site.x, y: site.y + 58 };
}

// 13 sector columns (A–M) × 6 rows across the city.
export const SECTOR_ROWS = 6;
export function sectorCol(world, x) {
  const b = world.bounds;
  return Math.max(0, Math.min(T - 1, Math.floor(((x - b.minX) / (b.maxX - b.minX)) * T)));
}
export function sectorName(world, x, y) {
  const reg = region(world, x);
  if (reg === 'sprawl') return sprawlAt(x).name;
  if (reg === 'void') return 'DEEP VOID';
  const b = world.bounds;
  const r = Math.max(0, Math.min(SECTOR_ROWS - 1, Math.floor(((y - b.minY) / (b.maxY - b.minY)) * SECTOR_ROWS)));
  return `${COLS13[sectorCol(world, x)]}${r + 1}`;
}
export function sectorCentre(world, x, y) {
  const b = world.bounds;
  const cw = (b.maxX - b.minX) / T, rh = (b.maxY - b.minY) / SECTOR_ROWS;
  const c = sectorCol(world, x);
  const r = Math.max(0, Math.min(SECTOR_ROWS - 1, Math.floor((y - b.minY) / rh)));
  return { x: b.minX + (c + 0.5) * cw, y: b.minY + (r + 0.5) * rh };
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
// 13 per window, one per sector column, so there's always something within reach.
export function dropsForWindow(world, windowIndex, multiplier = 1) {
  const rng = mulberry32(hashStr(`drops:${world.seed}:${windowIndex}`));
  const count = Math.max(1, Math.round(T * multiplier));
  const rects = solids(world);
  const b = world.bounds;
  const cw = (b.maxX - b.minX) / T;
  const drops = [];
  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    const col = i % T;
    do {
      x = randInt(rng, Math.round(b.minX + col * cw + 150), Math.round(b.minX + (col + 1) * cw - 150));
      y = randInt(rng, b.minY + 200, b.maxY - 200);
      tries++;
    } while (insideAny(x, y, rects, 60) && tries < 20);
    const type = pick(rng, DROP_TYPES);
    drops.push({
      key: `${windowIndex}:${i}`,
      x,
      y,
      amount: randInt(rng, T, T * 3), // 13–39
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
  for (let i = 0; i < 1300; i++) {
    // ~half in the city, the rest scattered along the long hauls to the two Sprawls
    const x = i < 650 ? randInt(rng, b.minX, b.maxX) : randInt(rng, fb.minX, fb.maxX);
    const y = randInt(rng, b.minY, b.maxY);
    if (insideAny(x, y, rects, 120)) continue;
    if (Math.abs(y) < 140 && Math.abs(x) < b.maxX) continue; // keep the Spine gaps clear
    if (SPRAWLS.some((sp) => Math.hypot((x - sp.x) / (sp.rx + 150), (y - sp.y) / (sp.ry + 150)) < 1)) continue;
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

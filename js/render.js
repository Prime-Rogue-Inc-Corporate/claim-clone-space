// Canvas renderer. Top-down GTA1/2 trick: buildings are footprints whose roofs are
// pushed away from the camera by their height, so towers lean as you fly past.
import { KINDS } from './entities.js';
import { plotRect, plotPad, spineRect, spineRects, SPRAWLS, sprawlAt, flyBounds, region, hutRect, hutPad, hutArt, COLS13, SECTOR_ROWS } from './world.js';
import { mulberry32 } from './rng.js';
import { PLAYER } from './economy.js';
import { roofFor, shipSpriteName } from './sprites.js';

// Sprites are optional; every draw below falls back to canvas shapes when one is missing.
let SPR = null;
const spr = (name) => (SPR ? SPR.get(name) : null);
const hashNum = (x, y) => Math.abs(Math.floor(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453));
const patterns = {};
function pattern(ctx, name) {
  if (patterns[name] !== undefined) return patterns[name];
  const img = spr(name);
  patterns[name] = img ? ctx.createPattern(img, 'repeat') : null;
  return patterns[name];
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

export function makeStars() {
  const rng = mulberry32(42);
  const layers = [0.08, 0.2, 0.4].map((depth) => ({
    depth,
    stars: Array.from({ length: 140 }, () => ({ x: rng() * 2048, y: rng() * 2048, s: rng() < 0.1 ? 2 : 1, a: 0.3 + rng() * 0.6 })),
  }));
  return layers;
}

export function drawScene(ctx, W, H, cam, scene) {
  const { world, time } = scene;
  ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  SPR = scene.sprites || null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // backdrop: smog + stars
  ctx.fillStyle = '#060708';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.3 - cam.x * 0.02, H * 0.4 - cam.y * 0.02, 50, W * 0.5, H * 0.5, Math.max(W, H));
  g.addColorStop(0, 'rgba(90,40,20,0.35)');
  g.addColorStop(0.5, 'rgba(40,30,25,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const layer of scene.stars) {
    for (const st of layer.stars) {
      const sx = (((st.x - cam.x * layer.depth) % 2048) + 2048) % 2048;
      const sy = (((st.y - cam.y * layer.depth) % 2048) + 2048) % 2048;
      if (sx > W || sy > H) continue;
      ctx.fillStyle = `rgba(220,210,190,${st.a})`;
      ctx.fillRect(sx, sy, st.s, st.s);
    }
  }

  // world transform
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const viewR = Math.hypot(W, H) / 2 / cam.zoom + 100;
  const view = { x0: cam.x - viewR - 400, x1: cam.x + viewR + 400 }; // the city is 42 km wide: cull
  const inView = (x0, x1 = x0) => x1 >= view.x0 && x0 <= view.x1;
  drawGrid(ctx, world, cam, W, H, view);

  for (const r of scene.deco.rocks) {
    if (Math.abs(r.x - cam.x) > viewR || Math.abs(r.y - cam.y) > viewR) continue;
    ctx.save();
    ctx.translate(r.x, r.y);
    const img = spr(`rock_${(r.shade % 4) + 1}`);
    if (img) {
      ctx.rotate((r.x % 628) / 100);
      const sz = r.r * 2.6;
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz * (img.height / img.width));
    } else {
      ctx.fillStyle = `rgb(${r.shade},${r.shade - 4},${r.shade - 8})`;
      ctx.beginPath();
      r.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  scene.underWorld?.(ctx, viewR); // ground-level layers: racetracks
  drawSpine(ctx, world, time, view);
  drawCorridor(ctx, world, time, view);
  for (const sp of SPRAWLS) if (inView(sp.x - sp.rx - 2500, sp.x + sp.rx + 2500)) drawSprawl(ctx, scene, time, sp);

  // buildings, far-to-near so near walls overlap correctly
  const visible = world.plots.filter((p) => inView(p.x - 400, p.x + 400));
  const plots = [...visible].sort((a, b) => Math.abs(b.x - cam.x) - Math.abs(a.x - cam.x));
  for (const p of plots) drawPlot(ctx, world, p, cam, time, scene);

  for (const p of visible) {
    const pad = plotPad(world, p);
    const near = scene.nearPlot && scene.nearPlot.id === p.id;
    const padImg = spr('pad');
    if (padImg) {
      ctx.globalAlpha = near ? 1 : 0.55;
      ctx.drawImage(padImg, pad.x - 22, pad.y - 20, 44, 44 * (padImg.height / padImg.width));
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = near ? '#e8c547' : padImg ? 'rgba(0,0,0,0)' : 'rgba(200,180,120,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, near && padImg ? 26 : 18, 0, Math.PI * 2);
    ctx.stroke();
    if (near) {
      ctx.fillStyle = '#e8c547';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('E', pad.x, pad.y + 4);
    }
  }

  for (const d of scene.drops) drawDrop(ctx, d, time, scene.holdDrop === d ? scene.holdProgress : 0);

  for (const p of scene.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  scene.extraWorld?.(ctx);

  for (const s of scene.ships) drawShip(ctx, s, scene, time);
  if (scene.pilot) drawShip(ctx, scene.pilot, scene, time);

  // sight radius: the only perk, earned by levelling
  const me = scene.me;
  ctx.strokeStyle = 'rgba(120,200,140,0.12)';
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 2 / cam.zoom;
  ctx.beginPath();
  ctx.arc(me.x, me.y, scene.sight, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (scene.objective) drawObjectiveFlag(ctx, scene.objective, time, cam);

  if (scene.waypoint) {
    const w = scene.waypoint;
    ctx.strokeStyle = 'rgba(255,59,31,0.5)';
    ctx.setLineDash([12, 12]);
    ctx.lineWidth = 2 / cam.zoom;
    ctx.beginPath();
    ctx.moveTo(me.x, me.y);
    ctx.lineTo(w.x, w.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ff3b1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 26 + Math.sin(time / 150) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (scene.objective) drawObjectiveArrow(ctx, scene.objective, scene.me, cam, W, H, time);

  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGrid(ctx, world, cam, W, H, view) {
  const b = world.bounds;
  const cw = (b.maxX - b.minX) / COLS13.length, rh = (b.maxY - b.minY) / SECTOR_ROWS;
  ctx.strokeStyle = 'rgba(160,120,80,0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let c = 0; c <= COLS13.length; c++) {
    const x = b.minX + c * cw;
    if (x < view.x0 || x > view.x1) continue;
    ctx.moveTo(x, b.minY);
    ctx.lineTo(x, b.maxY);
  }
  for (let r = 0; r <= SECTOR_ROWS; r++) {
    const y = b.minY + r * rh;
    ctx.moveTo(Math.max(b.minX, view.x0), y);
    ctx.lineTo(Math.min(b.maxX, view.x1), y);
  }
  ctx.stroke();
  const fb = flyBounds(world);
  ctx.strokeStyle = 'rgba(180,60,40,0.4)';
  ctx.lineWidth = 6;
  ctx.strokeRect(fb.minX, fb.minY, fb.maxX - fb.minX, fb.maxY - fb.minY);
  ctx.strokeStyle = 'rgba(184,150,46,0.25)';
  ctx.setLineDash([30, 20]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const x of [b.minX, b.maxX]) {
    ctx.moveTo(x, b.minY);
    ctx.lineTo(x, b.maxY);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(160,120,80,0.18)';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'left';
  for (let c = 0; c < COLS13.length; c++) {
    const x = b.minX + c * cw;
    if (x + cw < view.x0 || x > view.x1) continue;
    for (let r = 0; r < SECTOR_ROWS; r++) ctx.fillText(`${COLS13[c]}${r + 1}`, x + 20, b.minY + r * rh + 60);
  }
}

function drawSpine(ctx, world, time, view) {
  for (const seg of spineRects(world)) {
    const x0 = Math.max(seg.x, view.x0), x1 = Math.min(seg.x + seg.w, view.x1);
    if (x1 > x0) drawSpineSegment(ctx, world, time, seg, x0, x1);
  }
  // the crossings: placeholder gaps until real north-south roads and intersections exist
  for (const [i, g] of (world.spine.gaps || []).entries()) {
    if (g.x1 < view.x0 || g.x0 > view.x1) continue;
    ctx.fillStyle = 'rgba(184,150,46,0.08)';
    ctx.fillRect(g.x0, -world.spine.halfWidth, g.x1 - g.x0, world.spine.halfWidth * 2);
    ctx.strokeStyle = 'rgba(184,150,46,0.45)';
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.x, -600);
    ctx.lineTo(g.x, 600);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(220,200,150,0.5)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`CROSSING ${i + 1}`, g.x, 640);
    ctx.font = '11px monospace';
    ctx.fillText('NORTH-SOUTH ROAD · COMING SOON', g.x, 658);
  }
  ctx.fillStyle = 'rgba(220,200,150,0.45)';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  for (const [k, b] of (world.spine.blocks || []).entries()) {
    const mid = (b.x0 + b.x1) / 2;
    if (mid > view.x0 && mid < view.x1) ctx.fillText(`THE SPINE  ·  AVENUE ZERO  ·  BLOCK ${k + 1}`, mid, -12);
  }
  if (!world.spine.blocks) ctx.fillText('THE SPINE  ·  AVENUE ZERO', 0, -12);
}

function drawSpineSegment(ctx, world, time, r, vx0, vx1) {
  const tiles = [spr('spine_plain'), spr('spine_beacon'), spr('spine_cross')];
  if (tiles[0]) {
    // corridor tiles run vertically in the art; the Spine runs east-west, so rotate them
    const t = r.h;
    for (let x = r.x, i = 0; x < r.x + r.w; x += t, i++) {
      if (x + t < vx0 || x > vx1) continue;
      const img = (i % 7 === 3 && tiles[2]) || (i % 5 === 0 && tiles[1]) || tiles[0];
      ctx.save();
      ctx.translate(x + t / 2, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -t / 2, -t / 2, t, Math.min(t, r.x + r.w - x));
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#17191c';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#22252a';
    for (let x = r.x; x < r.x + r.w; x += 40) ctx.fillRect(x, r.y + 10, 30, r.h - 20);
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(r.x, -4, r.w, 8);
  }
  // hazard edges
  for (let x = r.x, i = 0; x < r.x + r.w; x += 16, i++) {
    if (x + 16 < vx0 || x > vx1) continue;
    ctx.fillStyle = i % 2 ? '#1a1a1a' : '#b8962e';
    ctx.fillRect(x, r.y, 16, 5);
    ctx.fillRect(x, r.y + r.h - 5, 16, 5);
  }
  // beacons
  const on = Math.floor(time / 600) % 2 === 0;
  for (let x = r.x + 30; x < r.x + r.w; x += world.spine.slot) {
    ctx.fillStyle = on ? '#ff3b1f' : '#4a140c';
    ctx.fillRect(x - 3, -3, 6, 6);
  }
}

function drawPlot(ctx, world, p, cam, time, scene) {
  const r = plotRect(world, p);
  if (!p.owner) {
    const lot = spr('lot_empty');
    if (lot) ctx.drawImage(lot, r.x, r.y, r.w, r.h);
    else {
      ctx.fillStyle = '#131416';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.strokeStyle = 'rgba(184,150,46,0.35)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(220,200,150,0.6)';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LOT ${p.id} · UNCLAIMED`, p.x, r.y + r.h / 2 + 4);
    return;
  }
  const k = Math.min(0.22, p.floors * 0.0022);
  const lift = (px, py) => [cam.x + (px - cam.x) * (1 + k), cam.y + (py - cam.y) * (1 + k)];
  const base = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const roof = base.map(([x, y]) => lift(x, y));
  const color = p.brand?.color || '#666666';

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(r.x + 8, r.y + 8, r.w, r.h);

  // walls
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    ctx.fillStyle = shade(color, i % 2 ? 0.45 : 0.32);
    ctx.beginPath();
    ctx.moveTo(base[i][0], base[i][1]);
    ctx.lineTo(base[j][0], base[j][1]);
    ctx.lineTo(roof[j][0], roof[j][1]);
    ctx.lineTo(roof[i][0], roof[i][1]);
    ctx.closePath();
    ctx.fill();
    // window rows
    ctx.strokeStyle = 'rgba(255,200,120,0.18)';
    ctx.lineWidth = 1;
    const rows = Math.min(12, Math.floor(p.floors / 8));
    for (let f = 1; f <= rows; f++) {
      const t = f / (rows + 1);
      ctx.beginPath();
      ctx.moveTo(base[i][0] + (roof[i][0] - base[i][0]) * t, base[i][1] + (roof[i][1] - base[i][1]) * t);
      ctx.lineTo(base[j][0] + (roof[j][0] - base[j][0]) * t, base[j][1] + (roof[j][1] - base[j][1]) * t);
      ctx.stroke();
    }
  }

  // roof
  const [rx, ry] = roof[0];
  const rw = roof[1][0] - roof[0][0];
  const rh = roof[3][1] - roof[0][1];
  const roofImg = spr(roofFor(color));
  if (roofImg) {
    // mirror every other lot so a corp's towers don't all look identical
    if (p.id % 2) {
      ctx.save();
      ctx.translate(rx + rw, ry);
      ctx.scale(-1, 1);
      ctx.drawImage(roofImg, 0, 0, rw, rh);
      ctx.restore();
    } else ctx.drawImage(roofImg, rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(8,8,9,0.62)';
    ctx.fillRect(rx + 10, ry + rh / 2 - 17, rw - 20, 36);
  } else {
    ctx.fillStyle = shade(color, 0.85);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = shade(color, 0.65);
    ctx.fillRect(rx + 8, ry + 8, rw - 16, rh - 16);
    // rooftop junk
    ctx.fillStyle = shade(color, 0.5);
    ctx.fillRect(rx + rw - 34, ry + 12, 18, 14);
    ctx.fillRect(rx + 14, ry + rh - 26, 24, 12);
  }

  const mine = p.owner === PLAYER;
  if (mine) {
    ctx.strokeStyle = Math.floor(time / 400) % 2 ? '#e8c547' : '#a8892c';
    ctx.lineWidth = 4;
    ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);
  }
  if (scene.featured === p.id) {
    ctx.fillStyle = Math.floor(time / 300) % 2 ? '#ff3b1f' : '#ffd166';
    ctx.beginPath();
    ctx.arc(rx + rw / 2, ry + 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#efe6cf';
  ctx.font = 'bold 15px monospace';
  ctx.fillText((p.brand?.name || `Lot ${p.id}`).toUpperCase(), rx + rw / 2, ry + rh / 2 - 2, rw - 16);
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(239,230,207,0.7)';
  ctx.fillText(`LOT ${p.id} · ${p.floors}F · $${p.value.toLocaleString()}`, rx + rw / 2, ry + rh / 2 + 14, rw - 16);
}

function drawDrop(ctx, d, time, progress) {
  const pulse = 1 + Math.sin(time / 200) * 0.12;
  ctx.save();
  ctx.translate(d.x, d.y);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 60 * pulse);
  glow.addColorStop(0, 'rgba(160,200,80,0.45)');
  glow.addColorStop(1, 'rgba(160,200,80,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 60 * pulse, 0, Math.PI * 2);
  ctx.fill();
  const DROP_SPR = { 'bear turd': 'drop_turd', 'whale dung': 'drop_whale', 'drone wreck': 'drop_drone', 'cargo spill': 'drop_cargo', 'slag vent': 'drop_slag' };
  const dimg = spr(DROP_SPR[d.noun]);
  if (dimg) {
    const sz = 58 * pulse;
    ctx.drawImage(dimg, -sz / 2, -sz / 2, sz, sz * (dimg.height / dimg.width));
  } else if (/turd|dung/.test(d.noun)) {
    // the turd, rendered with the dignity it deserves
    ctx.fillStyle = '#6b4a2b';
    [[0, 8, 16, 7], [0, 0, 12, 6], [0, -7, 8, 5], [2, -12, 3, 3]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-6, -2, 4, 2);
  } else {
    ctx.fillStyle = '#7d7f84';
    for (let i = 0; i < 6; i++) {
      const a = i + time / 1500;
      ctx.fillRect(Math.cos(a) * 14 - 4, Math.sin(a) * 14 - 3, 8, 6);
    }
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(-5, -5, 10, 10);
  }
  ctx.fillStyle = '#d6f08a';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${d.amount} SCRAP`, 0, -28);
  if (progress > 0) {
    ctx.strokeStyle = '#d6f08a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

const SHIP_LEN = { skiff: 42, hauler: 60, interceptor: 38, eva: 22, shuttle: 68 };

function drawShip(ctx, s, scene, time) {
  const spec = KINDS[s.kind];
  const corp = s.corp ? scene.corpsById[s.corp] : null;
  const col = corp ? corp.color : spec.color;
  const name = shipSpriteName(s);
  const img = spr(name);
  if (img) {
    // art faces right with a baked flame; show the flame only while thrusting
    const meta = SPR.meta(name) || {};
    const cut = s.thrusting ? 0 : meta.cut || 0;
    const bodyW = img.width - (meta.cut || 0);
    const sc = SHIP_LEN[s.kind] / bodyW;
    const cx = ((meta.cut || 0) + img.width) / 2;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.drawImage(img, cut, 0, img.width - cut, img.height, (cut - cx) * sc, (-img.height / 2) * sc, (img.width - cut) * sc, img.height * sc);
    ctx.restore();
    drawShipMarks(ctx, s, scene, spec);
    return;
  }
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  if (s.thrusting) {
    const len = 10 + Math.random() * 10;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-spec.radius, -4);
    ctx.lineTo(-spec.radius - len, 0);
    ctx.lineTo(-spec.radius, 4);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(5, 5, spec.radius, 0, Math.PI * 2);
  ctx.fill();
  if (s.kind === 'eva') {
    ctx.fillStyle = '#d0c8b0';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a6e8f';
    ctx.fillRect(1, -3, 4, 6);
    ctx.fillStyle = '#777';
    ctx.fillRect(-9, -3, 4, 6);
  } else if (s.kind === 'hauler') {
    ctx.fillStyle = shade(col, 0.9);
    ctx.fillRect(-22, -14, 34, 28);
    ctx.fillStyle = shade(col, 0.6);
    ctx.fillRect(-18, -11, 10, 22);
    ctx.fillRect(-5, -11, 10, 22);
    ctx.fillStyle = shade(col, 1.2);
    ctx.fillRect(12, -8, 12, 16);
    ctx.fillStyle = '#9fd3e6';
    ctx.fillRect(18, -5, 4, 10);
  } else if (s.kind === 'scooter') {
    ctx.globalAlpha = s.wrecked ? 0.55 : 1;
    ctx.fillStyle = s.wrecked ? '#5a4b3a' : '#2b3a44';
    ctx.fillRect(-11, -4, 20, 8); // deck
    ctx.fillStyle = s.wrecked ? '#7a3b2e' : '#4fc3f7';
    ctx.fillRect(-11, -4, 20, 2);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-10, 0, 3.5, 0, Math.PI * 2); ctx.arc(10, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(13, 0); ctx.moveTo(13, -7); ctx.lineTo(13, 7); ctx.stroke(); // stem + bars
    ctx.globalAlpha = 1;
  } else if (s.kind === 'interceptor') {
    ctx.fillStyle = shade(col, 1.1);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9fd3e6';
    ctx.fillRect(2, -2, 6, 4);
  } else {
    ctx.fillStyle = shade(col, 1.05);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(col, 0.6);
    ctx.fillRect(-12, -4, 8, 8);
    ctx.fillStyle = '#9fd3e6';
    ctx.fillRect(3, -2, 6, 4);
  }
  ctx.restore();
  drawShipMarks(ctx, s, scene, spec);
}

// Passenger speech bubble over the shuttle (who's talking + what they said, wrapped).
function drawBubble(ctx, s, b, spec) {
  ctx.font = '12px monospace';
  const words = b.text.split(' '), lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 34) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  const w = Math.max(ctx.measureText(b.who).width, ...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = 18 + lines.length * 15;
  const x = s.x - w / 2, y = s.y - spec.radius - 22 - h;
  ctx.fillStyle = 'rgba(14,15,17,0.92)';
  ctx.strokeStyle = b.color || '#e8c547';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.moveTo(s.x - 6, y + h);
  ctx.lineTo(s.x, y + h + 9);
  ctx.lineTo(s.x + 6, y + h);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = b.color || '#e8c547';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(b.who, x + 8, y + 13);
  ctx.fillStyle = '#e6dcc4';
  ctx.font = '12px monospace';
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 28 + i * 15));
}

function drawShipMarks(ctx, s, scene, spec) {
  if (s.kind === 'scooter' && s !== scene.me) {
    const b = Math.round(s.battery ?? 100);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = s.wrecked ? '#ff5a3a' : b < 30 ? '#ffb347' : '#4fc3f7';
    ctx.fillText(s.wrecked ? (s.voidWreck ? 'VOID WRECK' : 'WRECKED') : `${b}%`, s.x, s.y - 14);
  }
  if (s.kind === 'shuttle') {
    ctx.fillStyle = '#d6f08a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const load = s.load ?? s.passengers ?? 0;
    if (load > 13) ctx.fillStyle = '#ffb347';
    ctx.fillText(`HUMANE SHUTTLE · ${s.passengers || 0} aboard${s.scooters ? ` + ${s.scooters} 🛴` : ''} · ${load}/13${load > 13 ? ` (${load - 13} STANDING)` : ''}${s.vipAboard ? ' + ⭐ VIP' : ''}`, s.x, s.y + spec.radius + 22);
    if (s.bubble && scene.time < s.bubble.until) drawBubble(ctx, s, s.bubble, spec);
  }
  if (s === scene.me && s.kind !== 'eva') {
    ctx.strokeStyle = 'rgba(232,197,71,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, spec.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
  } else if (scene.boardable === s) {
    ctx.fillStyle = '#e8c547';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('F · JUMP', s.x, s.y - spec.radius - 10);
  } else if (s.home) {
    ctx.fillStyle = 'rgba(232,197,71,0.85)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`YOUR SKIFF ${s.reg}`, s.x, s.y - spec.radius - 10);
  }
}

// ---- objective flag (world) + edge arrow (screen) ----
const OBJ = '#d6f08a';
function drawObjectiveFlag(ctx, o, time, cam) {
  const s = 1 / Math.max(0.6, cam.zoom); // stay readable when zoomed out
  if (o.area) {
    // a reported area, not an exact spot
    ctx.strokeStyle = 'rgba(214,240,138,0.25)';
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 380, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const wave = Math.sin(time / 180) * 6 * s;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.strokeStyle = '#e6dcc4';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -60 * s);
  ctx.stroke();
  ctx.fillStyle = OBJ;
  ctx.beginPath();
  ctx.moveTo(0, -60 * s);
  ctx.quadraticCurveTo(22 * s, -60 * s + wave, 42 * s, -50 * s);
  ctx.quadraticCurveTo(22 * s, -40 * s - wave, 0, -40 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OBJ;
  ctx.font = `bold ${Math.round(13 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(o.label.toUpperCase(), 0, -70 * s);
  ctx.restore();
}

function drawObjectiveArrow(ctx, o, me, cam, W, H, time) {
  const sx = (o.x - cam.x) * cam.zoom + W / 2;
  const sy = (o.y - cam.y) * cam.zoom + H / 2;
  // keep clear of the HUD (top-left), banner (top) and log/minimap (bottom)
  const top = 220, bottom = 200, side = 60;
  if (sx > side && sx < W - side && sy > 60 && sy < H - 60) return; // on screen: the flag is enough
  const cx = W / 2, cy = (top + (H - bottom)) / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  // clamp to an inset rectangle along the direction of the objective
  const hw = W / 2 - side, hh = (H - bottom - top) / 2;
  const t = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), Math.max(40, hh) / Math.abs(Math.sin(a) || 1e-6));
  const ax = cx + Math.cos(a) * t, ay = cy + Math.sin(a) * t;
  const pulse = 1 + Math.sin(time / 200) * 0.12;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(a);
  ctx.fillStyle = OBJ;
  ctx.strokeStyle = '#0b0b0c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18 * pulse, 0);
  ctx.lineTo(-10, -12 * pulse);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 12 * pulse);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const dist = Math.hypot(o.x - me.x, o.y - me.y) / 6; // 6 px per metre (matches the speed readout)
  const txt = `${o.label} · ${dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}`;
  ctx.font = 'bold 12px monospace';
  const tw = ctx.measureText(txt).width;
  const lx = Math.max(10 + tw / 2, Math.min(W - 10 - tw / 2, ax - Math.cos(a) * 34));
  const ly = Math.max(20, Math.min(H - 12, ay - Math.sin(a) * 34 + 4));
  ctx.fillStyle = 'rgba(8,9,10,0.75)';
  ctx.fillRect(lx - tw / 2 - 6, ly - 13, tw + 12, 18);
  ctx.fillStyle = OBJ;
  ctx.textAlign = 'center';
  ctx.fillText(txt, lx, ly);
}

// Buoys across the void so you always know which way home is.
function drawCorridor(ctx, world, time, view) {
  for (const sp of SPRAWLS) drawCorridorTo(ctx, world, time, view, sp);
}

function drawCorridorTo(ctx, world, time, view, sp) {
  const edge = sp.dir * world.bounds.maxX;
  const on = Math.floor(time / 500) % 2 === 0;
  const len = Math.abs(sp.x - edge) - sp.rx - 1200;
  for (let d = 900; d < len; d += 1800) {
    const x = edge + sp.dir * d;
    if (x < view.x0 || x > view.x1) continue;
    for (const y of [-260, 260]) {
      const b = spr(on ? 'buoy_on' : 'buoy_off');
      if (b) {
        ctx.drawImage(b, x - 18, y - 22, 36, 36 * (b.height / b.width));
        continue;
      }
      ctx.fillStyle = on ? '#e8a33a' : '#5a3d14';
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.strokeStyle = 'rgba(232,163,58,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,200,140,0.5)';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    const toSprawl = `${(Math.abs(sp.x - x) / 6000).toFixed(1)} KM`;
    const toSpine = `${(Math.abs(x - edge) / 6000 + 0.4).toFixed(1)} KM`;
    ctx.fillText(sp.dir > 0 ? `${sp.name} ${toSprawl} →` : `← ${sp.name} ${toSprawl}`, x, -290);
    ctx.fillText(sp.dir > 0 ? `← THE SPINE ${toSpine}` : `THE SPINE ${toSpine} →`, x, 300);
  }
  if (Math.abs(edge - (view.x0 + view.x1) / 2) < 3000) {
    ctx.fillStyle = 'rgba(232,200,140,0.35)';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CITY LIMIT · CORP JURISDICTION ENDS', edge + sp.dir * 700, -420);
  }
}

function drawSprawl(ctx, scene, time, SP) {
  const sprawl = { sites: scene.sprawl.sites.filter((s) => s.sprawl === SP.id), fires: scene.sprawl.fires.filter((f) => f.sprawl === SP.id), props: (scene.sprawl.props || []).filter((p) => p.sprawl === SP.id) };
  // ground: a scab of slag and junk floating in the void
  ctx.fillStyle = pattern(ctx, 'ground_slag') || '#17110c';
  ctx.beginPath();
  ctx.ellipse(SP.x, SP.y, SP.rx, SP.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pattern(ctx, 'ground_mud') || '#1e1610';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(SP.x - 300 * SP.dir, SP.y + 150, SP.rx * 0.8, SP.ry * 0.6, 0.15 * SP.dir, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,8,6,0.35)'; // darken the tiles so huts read on top
  ctx.beginPath();
  ctx.ellipse(SP.x, SP.y, SP.rx, SP.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // dirt tracks between the 13 columns and 3 rows
  ctx.strokeStyle = 'rgba(90,70,45,0.35)';
  ctx.lineWidth = 26;
  ctx.beginPath();
  for (let i = -6; i <= 7; i++) {
    ctx.moveTo(SP.x + i * 300 - 150, SP.y - SP.ry * 0.8);
    ctx.lineTo(SP.x + i * 300 - 150, SP.y + SP.ry * 0.8);
  }
  for (let j = -1; j <= 2; j++) {
    ctx.moveTo(SP.x - SP.rx * 0.85, SP.y + (j - 0.5) * 420);
    ctx.lineTo(SP.x + SP.rx * 0.85, SP.y + (j - 0.5) * 420);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,200,140,0.55)';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(SP.name, SP.x, SP.y - SP.ry - 70);
  ctx.font = 'bold 15px monospace';
  ctx.fillText('RESIDENTIAL · NO CORPS · NO LOGOS · NO BRANDING · BUILD WITH SCRAP', SP.x, SP.y - SP.ry - 40);

  // burn barrels
  for (const pr of sprawl.props || []) {
    const img = spr(pr.kind);
    if (!img) continue;
    const sz = pr.kind === 'fence' || pr.kind === 'laundry' ? 70 : 56;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (pr.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz * (img.height / img.width));
    ctx.restore();
  }

  for (const [fi, f] of sprawl.fires.entries()) {
    const flick = 0.7 + Math.random() * 0.3;
    const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 70 * flick);
    g.addColorStop(0, 'rgba(255,150,50,0.5)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 70 * flick, 0, Math.PI * 2);
    ctx.fill();
    const barrel = spr(`barrel_${(Math.floor(time / 140) + fi) % 3}`);
    if (barrel) ctx.drawImage(barrel, f.x - 13, f.y - 18, 26, 26 * (barrel.height / barrel.width));
    else {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(f.x - 6, f.y - 6, 12, 12);
      ctx.fillStyle = '#ff9a3a';
      ctx.fillRect(f.x - 3, f.y - 4, 6, 4);
    }
  }

  for (const site of sprawl.sites) {
    const occ = scene.hutOf(site);
    const near = scene.nearHut === site;
    const pad = hutPad(site);
    if (!occ) {
      const r = hutRect(site, 0);
      ctx.strokeStyle = near ? '#e8c547' : 'rgba(184,150,46,0.3)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220,200,150,0.45)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${site.id} · VACANT`, site.x, site.y + 4);
    } else {
      drawHut(ctx, site, occ.tier, occ.mine, time, occ.mine && scene.ownsLot);
      ctx.fillStyle = occ.mine ? '#e8c547' : 'rgba(220,200,150,0.55)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${site.id} · ${occ.mine ? 'YOU' : occ.who}`, site.x, site.y - hutRect(site, occ.tier).w * 0.72 - 6);
    }
    if (near) {
      ctx.strokeStyle = '#e8c547';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8c547';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('E', pad.x, pad.y + 4);
    }
  }
}

// Huts are deliberately generic: tier decides the shape, nobody decides the logo.
// Lot owners who live among the people get an owner-tier home: better, still never branded.
function drawHut(ctx, site, tier, mine, time, owner = false) {
  const r = hutRect(site, tier);
  const art = hutArt(tier);
  const img = (owner && spr(`ownerhome${1 + Math.min(3, Math.floor((tier * 4) / 13))}`)) || spr(`hut${art}_${hashNum(site.x, site.y) % 2 ? 'a' : 'b'}`);
  if (img) {
    const w = r.w * 1.3;
    const h = w * (img.height / img.width);
    ctx.drawImage(img, site.x - w / 2, site.y - h / 2, w, h);
    if (mine) {
      ctx.strokeStyle = 'rgba(232,197,71,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(site.x - w / 2 - 3, site.y - h / 2 - 3, w + 6, h + 6);
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(r.x + 5, r.y + 5, r.w, r.h);
  if (art === 0) {
    ctx.fillStyle = '#5a3b26';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#6e4a30';
    for (let x = r.x + 2; x < r.x + r.w; x += 6) ctx.fillRect(x, r.y, 3, r.h);
    ctx.fillStyle = '#2f4a5a'; // tarp
    ctx.fillRect(r.x + 4, r.y + 4, r.w * 0.45, r.h * 0.5);
  } else if (art === 1) {
    ctx.fillStyle = '#6b5a45';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#7d6a52';
    ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    ctx.fillStyle = '#3a2f24';
    ctx.fillRect(site.x - 5, r.y + r.h - 10, 10, 10);
    ctx.fillStyle = '#4a4a4a'; // chimney
    ctx.fillRect(r.x + r.w - 14, r.y + 4, 8, 8);
    ctx.fillStyle = 'rgba(160,160,160,0.25)';
    ctx.beginPath();
    ctx.arc(r.x + r.w - 10 + Math.sin(time / 400) * 3, r.y - 6, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#4b4f52';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#5c6165';
    ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
    ctx.fillStyle = '#7a6a48'; // sandbags
    for (let x = r.x - 4; x < r.x + r.w + 4; x += 10) ctx.fillRect(x, r.y + r.h, 8, 5);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x + 12, r.y + 12);
    ctx.lineTo(r.x + 12, r.y - 14);
    ctx.stroke();
    ctx.fillStyle = Math.floor(time / 700) % 2 ? '#ff3b1f' : '#4a140c';
    ctx.fillRect(r.x + 10, r.y - 17, 4, 4);
  }
  if (mine) {
    ctx.strokeStyle = 'rgba(232,197,71,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  }
}

export function drawMinimap(mctx, MW, MH, scene) {
  const reg = region(scene.world, scene.me.x);
  if (reg === 'void') return drawMinimapLong(mctx, MW, MH, scene);
  if (reg === 'sprawl') return drawMinimapSprawl(mctx, MW, MH, scene);
  return drawMinimapCity(mctx, MW, MH, scene);
}

function miniFlag(mctx, x, y, MW, MH) {
  // clamp to the minimap edge if the objective is outside this view
  const cx = Math.max(4, Math.min(MW - 8, x)), cy = Math.max(10, Math.min(MH - 2, y));
  mctx.strokeStyle = '#e6dcc4';
  mctx.beginPath();
  mctx.moveTo(cx, cy);
  mctx.lineTo(cx, cy - 9);
  mctx.stroke();
  mctx.fillStyle = OBJ;
  mctx.beginPath();
  mctx.moveTo(cx, cy - 9);
  mctx.lineTo(cx + 7, cy - 6);
  mctx.lineTo(cx, cy - 3);
  mctx.closePath();
  mctx.fill();
}

function drawMinimapLong(mctx, MW, MH, scene) {
  const { world, me } = scene;
  const fb = flyBounds(world);
  const tx = (x) => ((x - fb.minX) / (fb.maxX - fb.minX)) * MW;
  const ty = (y) => ((y - fb.minY) / (fb.maxY - fb.minY)) * MH;
  mctx.fillStyle = 'rgba(8,9,10,0.92)';
  mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = '#3a3d42';
  mctx.fillRect(tx(world.bounds.minX), ty(-200), tx(world.bounds.maxX) - tx(world.bounds.minX), ty(200) - ty(-200));
  mctx.fillStyle = '#3a2a1c';
  for (const sp of SPRAWLS) mctx.fillRect(tx(sp.x - sp.rx), ty(-sp.ry), tx(sp.x + sp.rx) - tx(sp.x - sp.rx), ty(sp.ry) - ty(-sp.ry));
  mctx.fillStyle = '#8f8670';
  mctx.font = '10px monospace';
  mctx.textAlign = 'left';
  mctx.fillText('W SQUALOR', 4, 14);
  mctx.textAlign = 'right';
  mctx.fillText('E SQUALOR', MW - 4, 14);
  mctx.textAlign = 'center';
  mctx.fillText('SPINE', tx(0), 14);
  const sp = me.x > 0 ? SPRAWLS[0] : SPRAWLS[1];
  const toSprawl = Math.abs(sp.x - me.x), toCity = Math.abs(Math.abs(me.x) - world.bounds.maxX);
  mctx.fillText(`${(toSprawl / 6000).toFixed(1)} km to ${sp.title} · ${(toCity / 6000).toFixed(1)} km to city`, MW / 2, MH - 8);
  if (scene.objective) miniFlag(mctx, tx(scene.objective.x), ty(scene.objective.y), MW, MH);
  mctx.fillStyle = '#fff';
  mctx.fillRect(tx(me.x) - 2, ty(me.y) - 2, 4, 4);
}

function drawMinimapSprawl(mctx, MW, MH, scene) {
  const { me } = scene;
  const SP = sprawlAt(me.x);
  const span = SP.rx * 2.3;
  const s = MW / span;
  const tx = (x) => MW / 2 + (x - SP.x) * s;
  const ty = (y) => MH / 2 + (y - SP.y) * s;
  mctx.fillStyle = 'rgba(8,9,10,0.92)';
  mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = '#2a1f16';
  mctx.beginPath();
  mctx.ellipse(tx(SP.x), ty(SP.y), SP.rx * s, SP.ry * s, 0, 0, Math.PI * 2);
  mctx.fill();
  for (const site of scene.sprawl.sites) {
    if (site.sprawl !== SP.id) continue;
    const occ = scene.hutOf(site);
    if (!occ) {
      mctx.strokeStyle = 'rgba(184,150,46,0.5)';
      mctx.strokeRect(tx(site.x) - 1.5, ty(site.y) - 1.5, 3, 3);
    } else {
      mctx.fillStyle = occ.mine ? '#e8c547' : '#6b5a45';
      mctx.fillRect(tx(site.x) - 2, ty(site.y) - 2, 4, 4);
    }
  }
  mctx.fillStyle = '#8f8670';
  mctx.font = '10px monospace';
  mctx.textAlign = SP.dir > 0 ? 'left' : 'right';
  mctx.fillText(SP.dir > 0 ? '← SPINE' : 'SPINE →', SP.dir > 0 ? 4 : MW - 4, 14);
  mctx.textAlign = 'center';
  mctx.fillText(SP.name, MW / 2, MH - 8);
  if (scene.objective) miniFlag(mctx, tx(scene.objective.x), ty(scene.objective.y), MW, MH);
  mctx.fillStyle = '#fff';
  mctx.fillRect(tx(me.x) - 2, ty(me.y) - 2, 4, 4);
}

// The city is 42 km wide, so the city minimap is a scrolling window ~3 sectors across,
// with a strip along the bottom showing where you are on the whole Spine.
function drawMinimapCity(mctx, MW, MH, scene) {
  const { world, me } = scene;
  const b = world.bounds;
  const cw = (b.maxX - b.minX) / COLS13.length, rh = (b.maxY - b.minY) / SECTOR_ROWS;
  const spanX = cw * 3;
  const cx = Math.max(b.minX + spanX / 2, Math.min(b.maxX - spanX / 2, me.x));
  const vx0 = cx - spanX / 2;
  const MHm = MH - 12;
  const sx = MW / spanX;
  const sy = MHm / (b.maxY - b.minY);
  const tx = (x) => (x - vx0) * sx;
  const ty = (y) => (y - b.minY) * sy;
  mctx.fillStyle = 'rgba(8,9,10,0.92)';
  mctx.fillRect(0, 0, MW, MH);
  mctx.save();
  mctx.beginPath();
  mctx.rect(0, 0, MW, MHm);
  mctx.clip();
  mctx.strokeStyle = 'rgba(160,120,80,0.15)';
  mctx.fillStyle = 'rgba(160,120,80,0.45)';
  mctx.font = '9px monospace';
  mctx.textAlign = 'left';
  for (let c = 0; c <= COLS13.length; c++) {
    const x = b.minX + c * cw;
    mctx.beginPath();
    mctx.moveTo(tx(x), 0);
    mctx.lineTo(tx(x), MHm);
    mctx.stroke();
    if (c < COLS13.length) mctx.fillText(COLS13[c], tx(x) + 3, 10);
  }
  for (let r = 0; r <= SECTOR_ROWS; r++) {
    mctx.beginPath();
    mctx.moveTo(0, ty(b.minY + r * rh));
    mctx.lineTo(MW, ty(b.minY + r * rh));
    mctx.stroke();
  }
  mctx.fillStyle = '#3a3d42';
  for (const sp of spineRects(world)) mctx.fillRect(tx(sp.x), ty(sp.y), sp.w * sx, Math.max(2, sp.h * sy));
  for (const p of world.plots) {
    const r = plotRect(world, p);
    mctx.fillStyle = p.owner === PLAYER ? '#e8c547' : p.owner ? '#6b6457' : '#26282b';
    mctx.fillRect(tx(r.x), ty(r.y), Math.max(1, r.w * sx), Math.max(1, r.h * sy));
  }
  for (const s of scene.ships) {
    mctx.fillStyle = s.npc ? '#a85a3a' : '#8fb3c4';
    mctx.fillRect(tx(s.x) - 1, ty(s.y) - 1, 2, 2);
  }
  for (const d of scene.drops) {
    mctx.fillStyle = '#d6f08a';
    mctx.fillRect(tx(d.x) - 2, ty(d.y) - 2, 4, 4);
  }
  mctx.strokeStyle = 'rgba(120,200,140,0.5)';
  mctx.beginPath();
  mctx.arc(tx(me.x), ty(me.y), scene.sight * sx, 0, Math.PI * 2);
  mctx.stroke();
  scene.extraMinimap?.(mctx, tx, ty);
  if (scene.waypoint) {
    mctx.strokeStyle = '#ff3b1f';
    mctx.beginPath();
    mctx.moveTo(tx(scene.waypoint.x) - 3, ty(scene.waypoint.y) - 3);
    mctx.lineTo(tx(scene.waypoint.x) + 3, ty(scene.waypoint.y) + 3);
    mctx.moveTo(tx(scene.waypoint.x) + 3, ty(scene.waypoint.y) - 3);
    mctx.lineTo(tx(scene.waypoint.x) - 3, ty(scene.waypoint.y) + 3);
    mctx.stroke();
  }
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(tx(me.x) - 2, ty(me.y) - 2, 4, 4);
  mctx.restore();
  if (scene.objective) miniFlag(mctx, tx(scene.objective.x), ty(scene.objective.y), MW, MHm);
  // whole-Spine strip: 13 blocks, your position, the objective
  const fx = (x) => 4 + ((x - b.minX) / (b.maxX - b.minX)) * (MW - 8);
  mctx.fillStyle = '#1a1c1f';
  mctx.fillRect(0, MH - 12, MW, 12);
  mctx.fillStyle = '#3a3d42';
  for (const sp of spineRects(world)) mctx.fillRect(fx(sp.x), MH - 8, Math.max(1, fx(sp.x + sp.w) - fx(sp.x)), 4);
  mctx.strokeStyle = 'rgba(232,197,71,0.6)';
  mctx.strokeRect(fx(vx0), MH - 11, fx(vx0 + spanX) - fx(vx0), 10);
  if (scene.objective) { mctx.fillStyle = OBJ; mctx.fillRect(fx(Math.max(b.minX, Math.min(b.maxX, scene.objective.x))) - 1.5, MH - 11, 3, 10); }
  mctx.fillStyle = '#fff';
  mctx.fillRect(fx(me.x) - 1, MH - 11, 2, 10);
}

// Canvas renderer. Top-down GTA1/2 trick: buildings are footprints whose roofs are
// pushed away from the camera by their height, so towers lean as you fly past.
import { KINDS } from './entities.js';
import { plotRect, plotPad, spineRect } from './world.js';
import { mulberry32 } from './rng.js';
import { PLAYER } from './economy.js';

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
  ctx.imageSmoothingEnabled = false;

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

  drawGrid(ctx, world, cam, W, H);

  for (const r of scene.deco.rocks) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.fillStyle = `rgb(${r.shade},${r.shade - 4},${r.shade - 8})`;
    ctx.beginPath();
    r.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawSpine(ctx, world, time);

  // buildings, far-to-near so near walls overlap correctly
  const plots = [...world.plots].sort((a, b) => Math.abs(b.x - cam.x) - Math.abs(a.x - cam.x));
  for (const p of plots) drawPlot(ctx, world, p, cam, time, scene);

  for (const p of world.plots) {
    const pad = plotPad(world, p);
    const near = scene.nearPlot && scene.nearPlot.id === p.id;
    ctx.strokeStyle = near ? '#e8c547' : 'rgba(200,180,120,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 18, 0, Math.PI * 2);
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

  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawGrid(ctx, world, cam, W, H) {
  const b = world.bounds;
  ctx.strokeStyle = 'rgba(160,120,80,0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = b.minX; x <= b.maxX; x += 1000) {
    ctx.moveTo(x, b.minY);
    ctx.lineTo(x, b.maxY);
  }
  for (let y = b.minY; y <= b.maxY; y += 1000) {
    ctx.moveTo(b.minX, y);
    ctx.lineTo(b.maxX, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,60,40,0.4)';
  ctx.lineWidth = 6;
  ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  ctx.fillStyle = 'rgba(160,120,80,0.18)';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'left';
  const cols = 'ABCDEFGH';
  for (let c = 0; c < 8; c++) for (let r = 0; r < 6; r++) ctx.fillText(`${cols[c]}${r + 1}`, b.minX + c * 1000 + 20, b.minY + r * 1000 + 60);
}

function drawSpine(ctx, world, time) {
  const r = spineRect(world);
  ctx.fillStyle = '#17191c';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#22252a';
  for (let x = r.x; x < r.x + r.w; x += 40) ctx.fillRect(x, r.y + 10, 30, r.h - 20);
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(r.x, -4, r.w, 8);
  // hazard edges
  for (let x = r.x, i = 0; x < r.x + r.w; x += 16, i++) {
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
  ctx.fillStyle = 'rgba(220,200,150,0.45)';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THE SPINE  ·  AVENUE ZERO', 0, -12);
}

function drawPlot(ctx, world, p, cam, time, scene) {
  const r = plotRect(world, p);
  if (!p.owner) {
    ctx.fillStyle = '#131416';
    ctx.fillRect(r.x, r.y, r.w, r.h);
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
  ctx.fillStyle = shade(color, 0.85);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.fillStyle = shade(color, 0.65);
  ctx.fillRect(rx + 8, ry + 8, rw - 16, rh - 16);
  // rooftop junk
  ctx.fillStyle = shade(color, 0.5);
  ctx.fillRect(rx + rw - 34, ry + 12, 18, 14);
  ctx.fillRect(rx + 14, ry + rh - 26, 24, 12);

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
  if (/turd|dung/.test(d.noun)) {
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

function drawShip(ctx, s, scene, time) {
  const spec = KINDS[s.kind];
  const corp = s.corp ? scene.corpsById[s.corp] : null;
  const col = corp ? corp.color : spec.color;
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
    ctx.fillText('F · BOARD', s.x, s.y - spec.radius - 10);
  }
}

export function drawMinimap(mctx, MW, MH, scene) {
  const { world, me } = scene;
  const b = world.bounds;
  const sx = MW / (b.maxX - b.minX);
  const sy = MH / (b.maxY - b.minY);
  const tx = (x) => (x - b.minX) * sx;
  const ty = (y) => (y - b.minY) * sy;
  mctx.fillStyle = 'rgba(8,9,10,0.92)';
  mctx.fillRect(0, 0, MW, MH);
  mctx.strokeStyle = 'rgba(160,120,80,0.15)';
  for (let x = b.minX; x <= b.maxX; x += 1000) {
    mctx.beginPath();
    mctx.moveTo(tx(x), 0);
    mctx.lineTo(tx(x), MH);
    mctx.stroke();
  }
  for (let y = b.minY; y <= b.maxY; y += 1000) {
    mctx.beginPath();
    mctx.moveTo(0, ty(y));
    mctx.lineTo(MW, ty(y));
    mctx.stroke();
  }
  const sp = spineRect(world);
  mctx.fillStyle = '#3a3d42';
  mctx.fillRect(tx(sp.x), ty(sp.y), sp.w * sx, Math.max(2, sp.h * sy));
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
}

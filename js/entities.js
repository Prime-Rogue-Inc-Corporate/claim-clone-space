// Ships, the pilot on EVA, NPC traffic. GTA rules: anything parked or slow is yours if you walk up to it.

export const KINDS = {
  skiff: { label: 'Skiff', thrust: 0.2, max: 8, turn: 0.06, radius: 14, color: '#8d8a80' },
  hauler: { label: 'Hauler', thrust: 0.11, max: 5, turn: 0.032, radius: 22, color: '#6f6450' },
  interceptor: { label: 'Interceptor', thrust: 0.3, max: 11.5, turn: 0.075, radius: 12, color: '#5a6470' },
  // The Humane Shuttle: handles like dog shit on purpose. Laggy steering, pulls left, wobbles,
  // slides like a fridge on ice, and the brakes are a suggestion. Career ranks make it slightly less bad.
  shuttle: { label: 'Humane Shuttle', thrust: 0.075, max: 4.6, turn: 0.022, drag: 0.996, grip: 0.012, yawLag: 0.06, pull: 0.0025, wobble: 0.004, brake: 0.975, radius: 24, color: '#9c8b5e' },
  // Last Mile Scoot rentals: quick, twitchy, fragile. Hit a wall fast and you're eating it.
  scooter: { label: 'Scooter', thrust: 0.17, max: 8.5, turn: 0.085, drag: 0.986, grip: 0.12, radius: 9, color: '#4fc3f7' },
  eva: { label: 'EVA suit', thrust: 0.07, max: 2.3, turn: 0.11, radius: 6, color: '#d0c8b0' },
};

let nextId = 1;

export function makeShip(kind, x, y, angle = 0, extra = {}) {
  return { id: nextId++, kind, x, y, angle, vx: 0, vy: 0, thrusting: false, npc: false, corp: null, ai: null, ...extra };
}

export function speedOf(b) {
  return Math.hypot(b.vx, b.vy);
}

// Shared flight model: rotate + thrust with inertia and drag (GTA2-ish handling, space-ish drift).
export function fly(body, input, dt, boost = false) {
  // body.stats (your upgraded skiff) overrides the stock spec for its kind
  const spec = body.stats || KINDS[body.kind];
  const k = dt * 60;
  if (spec.yawLag) {
    // laggy steering: the wheel turns, the vehicle thinks about it
    const want = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    body.av = (body.av || 0) + (want * spec.turn - (body.av || 0)) * Math.min(1, spec.yawLag * k);
    body.angle += body.av * k;
    if (input.up && spec.pull) body.angle -= spec.pull * k; // pulls left under power
    if (spec.wobble) body.angle += Math.sin(performance.now() / 270 + body.id) * spec.wobble * k * Math.min(1, speedOf(body) / 2);
  } else {
    if (input.left) body.angle -= spec.turn * k;
    if (input.right) body.angle += spec.turn * k;
  }
  body.thrusting = !!input.up;
  const thrust = spec.thrust * (boost ? 1.8 : 1);
  if (input.up) {
    body.vx += Math.cos(body.angle) * thrust * k;
    body.vy += Math.sin(body.angle) * thrust * k;
  }
  if (input.down) {
    body.vx -= Math.cos(body.angle) * thrust * 0.5 * k;
    body.vy -= Math.sin(body.angle) * thrust * 0.5 * k;
  }
  const drag = input.brake ? spec.brake ?? 0.9 : spec.drag ?? 0.988;
  body.vx *= Math.pow(drag, k);
  body.vy *= Math.pow(drag, k);
  // grip: bleed off sideways velocity so the ship goes where it points (stock ships have some; the starter skiff has none)
  const grip = spec.grip ?? 0.04;
  if (grip) {
    const rx = -Math.sin(body.angle), ry = Math.cos(body.angle);
    const lat = body.vx * rx + body.vy * ry;
    const f = Math.min(1, grip * k);
    body.vx -= rx * lat * f;
    body.vy -= ry * lat * f;
  }
  const max = spec.max * (boost ? 1.35 : 1);
  const s = speedOf(body);
  if (s > max) {
    body.vx = (body.vx / s) * max;
    body.vy = (body.vy / s) * max;
  }
  body.x += body.vx * k;
  body.y += body.vy * k;
}

// NPC traffic flies between waypoints on the lanes above and below the spine.
const LANES = [-1500, -900, 900, 1500];

export function makeTraffic(rng, corps, count = 10) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const lane = LANES[Math.floor(rng() * LANES.length)];
    const kind = rng() < 0.5 ? 'hauler' : rng() < 0.5 ? 'skiff' : 'interceptor';
    const corp = corps[Math.floor(rng() * corps.length)];
    const s = makeShip(kind, -20000 + rng() * 40000, lane + (rng() - 0.5) * 200, 0, { npc: true, corp: corp.id, color: corp.color });
    s.ai = { tx: 0, ty: lane };
    retarget(s, rng);
    out.push(s);
  }
  return out;
}

function retarget(ship, rng) {
  const lane = LANES[Math.floor(rng() * LANES.length)];
  // short hops along the lane, so traffic spreads along the whole 42 km Spine
  ship.ai.tx = Math.max(-20500, Math.min(20500, ship.x + (rng() - 0.5) * 9000));
  ship.ai.ty = lane + (rng() - 0.5) * 240;
}

export function steerNpc(ship, rng, dt) {
  const dx = ship.ai.tx - ship.x;
  const dy = ship.ai.ty - ship.y;
  if (Math.hypot(dx, dy) < 120) retarget(ship, rng);
  const want = Math.atan2(dy, dx);
  let diff = want - ship.angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const input = { left: diff < -0.05, right: diff > 0.05, up: Math.abs(diff) < 0.6 && speedOf(ship) < KINDS[ship.kind].max * 0.6 };
  fly(ship, input, dt);
}

// Sprite loader. Every sprite is optional: if a file is missing or fails to load,
// get() returns null and the renderer falls back to the canvas-drawn shapes.
export async function loadSprites(base = 'assets/') {
  let manifest = {};
  try {
    const r = await fetch(`${base}sprites.json`, { cache: 'no-store' });
    if (r.ok) manifest = await r.json();
  } catch {
    /* no sprites: canvas fallbacks everywhere */
  }
  const images = {};
  await Promise.allSettled(
    Object.keys(manifest).map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            images[name] = img;
            resolve();
          };
          img.onerror = resolve;
          img.src = `${base}sprites/${name}.png`;
        })
    )
  );
  return {
    get: (name) => images[name] || null,
    meta: (name) => manifest[name] || null,
    count: Object.keys(images).length,
  };
}

// Nearest roof tile for any colour, so a player's custom colour still gets real art.
const ROOFS = [
  ['roof_slate', [0x5c, 0x6b, 0x73]],
  ['roof_tan', [0x9c, 0x8b, 0x5e]],
  ['roof_red', [0x7a, 0x3b, 0x2e]],
  ['roof_olive', [0x4d, 0x5a, 0x3a]],
  ['roof_rust', [0xb0, 0x62, 0x3a]],
  ['roof_steel', [0x6f, 0x8a, 0xa3]],
];
export function roofFor(hex) {
  const n = parseInt((hex || '#5c6b73').slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = ROOFS[0][0], bd = Infinity;
  for (const [name, rgb] of ROOFS) {
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

const CORP_VARIANT = { vanta: 'slate', kessler: 'tan', ashiron: 'red', null: 'olive', cinder: 'red' };
export function shipSpriteName(ship) {
  if (ship.kind === 'eva') return 'eva';
  if (ship.kind === 'interceptor') return 'interceptor';
  const v = (ship.corp && CORP_VARIANT[ship.corp]) || 'slate';
  return `${ship.kind}_${v}`;
}

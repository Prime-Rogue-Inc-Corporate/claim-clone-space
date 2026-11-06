// Generates data/world.json: the Spine (13 blocks of 13 = 169 lots, all on the north side), the 13 organizations
// that own them (read from data/lore.json, the same source as the wiki), and parked ships.
// Run once (npm run world) and commit the output. A real backend replaces this file later.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, hashStr, pick, randInt } from '../js/rng.js';
import { CLAIM_PRICE, TAKEOVER_MULT, cents, floorsFor, T13 } from '../js/economy.js';
import { SLOT, BLOCK_GAP, BLOCK_W, CITY_HALF } from '../js/world.js';

const SEED = process.env.WORLD_SEED || 'spine-thirteen';
const rng = mulberry32(hashStr(SEED));

const BLOCKS = T13;
const LOTS = T13 * BLOCKS; // 169, all on the north side for now
const SPAN = BLOCKS * BLOCK_W + (BLOCKS - 1) * BLOCK_GAP; // 40,780
const X0 = -SPAN / 2;
const blockX0 = (k) => X0 + k * (BLOCK_W + BLOCK_GAP);

const PREFIX = ['Hollow', 'Ash', 'Iron', 'Grey', 'Null', 'Rust', 'Sable', 'Tithe', 'Gallows', 'Slag', 'Pallid', 'Cinder', 'Dread'];
const SUFFIX = ['Foundry', 'Arcology', 'Refinery', 'Spire', 'Hab-Block', 'Depot', 'Relay', 'Bastion', 'Silo', 'Exchange', 'Kiln', 'Yard', 'Works'];

const lore = JSON.parse(readFileSync('data/lore.json', 'utf8'));
export const CORPS = lore.organizations.map(({ id, name, type, color, motto, does }) => ({ id, name, type, color, motto, does }));

const plots = [];
for (let i = 0; i < LOTS; i++) {
  const id = i + 1;
  const block = Math.floor(i / T13);
  const x = blockX0(block) + (i % T13) * SLOT + SLOT / 2;
  const claimed = rng() > 0.3;
  const corp = pick(rng, CORPS);
  const history = [];
  let value = 0;
  if (claimed) {
    value = CLAIM_PRICE;
    let owner = corp.id;
    history.push({ t: 0, kind: 'build', to: owner, price: value });
    const flips = randInt(rng, 0, 8);
    for (let f = 0; f < flips; f++) {
      const price = cents(value * TAKEOVER_MULT);
      const next = pick(rng, CORPS.filter((c) => c.id !== owner)).id;
      history.push({ t: f + 1, kind: 'takeover', from: owner, to: next, price });
      owner = next;
      value = price;
    }
  }
  const owner = claimed ? history[history.length - 1].to : null;
  const ownerCorp = CORPS.find((c) => c.id === owner);
  plots.push({
    id,
    side: 'north',
    block: block + 1,
    x,
    floors: floorsFor(value),
    owner,
    value,
    history,
    brand: claimed
      ? { name: `${pick(rng, PREFIX)} ${pick(rng, SUFFIX)}`, tagline: ownerCorp.motto, color: ownerCorp.color, link: '' }
      : null,
  });
}

const parked = [];
const kinds = ['skiff', 'skiff', 'hauler', 'interceptor'];
for (let i = 0; i < T13; i++) {
  parked.push({
    kind: pick(rng, kinds),
    x: randInt(rng, -CITY_HALF + 600, CITY_HALF - 600),
    // north side is buildings now; park in the lanes and the open south
    y: rng() > 0.35 ? randInt(rng, 260, 1300) : -randInt(rng, 650, 1000),
    angle: rng() * Math.PI * 2,
  });
}

const blocks = Array.from({ length: BLOCKS }, (_, k) => ({ x0: Math.round(blockX0(k) - (k === 0 ? 60 : 0)), x1: Math.round(blockX0(k) + BLOCK_W + (k === BLOCKS - 1 ? 60 : 0)) }));
const gaps = Array.from({ length: BLOCKS - 1 }, (_, k) => ({ x0: blockX0(k) + BLOCK_W, x1: blockX0(k + 1), x: blockX0(k) + BLOCK_W + BLOCK_GAP / 2 }));
const world = {
  seed: SEED,
  generated: new Date().toISOString(),
  bounds: { minX: -CITY_HALF, maxX: CITY_HALF, minY: -3000, maxY: 6800 }, // 13 sector columns; the south holds the racetracks
  spine: { halfLength: SPAN / 2 + 60, halfWidth: 60, slot: SLOT, blockGap: BLOCK_GAP, blocks, gaps },
  corps: CORPS,
  plots,
  parked,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/world.json', JSON.stringify(world, null, 2) + '\n');
console.log(`world.json: ${plots.length} lots in ${BLOCKS} blocks (north), ${plots.filter((p) => p.owner).length} claimed, ${CORPS.length} organizations`);

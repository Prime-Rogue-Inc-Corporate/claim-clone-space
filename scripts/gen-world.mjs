// Generates data/world.json: the station spine, 48 lots, NPC corps and parked ships.
// Run once (npm run world) and commit the output. A real backend replaces this file later.
import { writeFileSync, mkdirSync } from 'node:fs';
import { mulberry32, hashStr, pick, randInt } from '../js/rng.js';
import { CLAIM_PRICE, TAKEOVER_MULT, cents, floorsFor } from '../js/economy.js';

const SEED = process.env.WORLD_SEED || 'spine-zero';
const rng = mulberry32(hashStr(SEED));

const PER_SIDE = 24;
const SLOT = 220;

const PREFIX = ['Hollow', 'Ash', 'Iron', 'Grey', 'Null', 'Rust', 'Sable', 'Vant', 'Kessler', 'Dread', 'Cinder', 'Obsidian', 'Tithe', 'Gallows', 'Slag', 'Pallid'];
const SUFFIX = ['Foundry', 'Arcology', 'Refinery', 'Spire', 'Hab-Block', 'Depot', 'Relay', 'Bastion', 'Silo', 'Exchange', 'Kiln', 'Yard', 'Reclamation', 'Chapel', 'Works'];
const TAGS = [
  'Quota met. Quota raised.',
  'Breathe responsibly. Air is metered.',
  'Your shift begins when you wake.',
  'Loyalty is a renewable resource.',
  'Now hiring: expendables.',
  'We recycle everything. Everything.',
  'Production is prayer.',
  'Do not look at the sun. There is no sun.',
];

// The five corps that own the Spine. "does" is shown in-game (ledger) and is the brief for their logos.
export const CORPS = [
  {
    id: 'vanta', name: 'Vantablack Holdings', color: '#5c6b73', motto: 'We hold. You hold on.',
    does: 'Landlord-finance conglomerate. Holds the Spine charter and most of the debt in orbit. Runs the Science Centre, still "testing" whether EVA is survivable.',
  },
  {
    id: 'kessler', name: 'Kessler Mining Co.', color: '#9c8b5e', motto: 'Everything is ore eventually.',
    does: 'Asteroid mining and salvage. Strips derelicts, sells scrap, and runs the Refit Bays where skiffs get fitted out.',
  },
  {
    id: 'ashiron', name: 'Ash & Iron', color: '#7a3b2e', motto: 'Production is prayer.',
    does: 'Heavy industry: foundries, refineries, smelters. Source of the smog, the slag vents and most of the jobs nobody wants.',
  },
  {
    id: 'null', name: 'Null Sector Trust', color: '#4d5a3a', motto: 'Compliance is safety.',
    does: 'Security and insurance. Owns the patrol drones, the impound yards and (soon) detention. Insures the corps against the people.',
  },
  {
    id: 'cinder', name: 'Cinder Collective', color: '#8a5a3a', motto: 'Breathe responsibly. Air is metered.',
    does: 'Utilities cartel: air, water, power. Everything you breathe is metered, and the Collective owns the meter.',
  },
];

const plots = [];
for (let side = 0; side < 2; side++) {
  for (let i = 0; i < PER_SIDE; i++) {
    const id = side * PER_SIDE + i + 1;
    const x = -((PER_SIDE * SLOT) / 2) + i * SLOT + SLOT / 2;
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
      side: side === 0 ? 'north' : 'south',
      x,
      floors: floorsFor(value),
      owner,
      value,
      history,
      brand: claimed
        ? {
            name: `${pick(rng, PREFIX)} ${pick(rng, SUFFIX)}`,
            tagline: pick(rng, TAGS),
            color: ownerCorp.color,
            link: '',
          }
        : null,
    });
  }
}

const parked = [];
const kinds = ['skiff', 'skiff', 'hauler', 'interceptor'];
for (let i = 0; i < 8; i++) {
  parked.push({
    kind: pick(rng, kinds),
    x: randInt(rng, -2400, 2400),
    y: (rng() > 0.5 ? 1 : -1) * randInt(rng, 620, 900),
    angle: rng() * Math.PI * 2,
  });
}

const world = {
  seed: SEED,
  generated: new Date().toISOString(),
  bounds: { minX: -4000, maxX: 4000, minY: -3000, maxY: 3000 },
  spine: { halfLength: (PER_SIDE * SLOT) / 2 + 60, halfWidth: 60, slot: SLOT },
  corps: CORPS,
  plots,
  parked,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/world.json', JSON.stringify(world, null, 2) + '\n');
console.log(`world.json: ${plots.length} lots, ${plots.filter((p) => p.owner).length} claimed`);

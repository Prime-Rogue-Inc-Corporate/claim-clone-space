// The "server" for pre-pre-alpha: a scheduled GitHub Action runs this and commits
// data/bulletin.json. Every client reads it, so everyone shares the same daily
// event modifier. Swap for a real realtime server once the concept is proven.
import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32, hashStr, pick } from '../js/rng.js';

const day = new Date().toISOString().slice(0, 10);
const rng = mulberry32(hashStr(`bulletin:${day}`));
const world = JSON.parse(readFileSync('data/world.json', 'utf8'));

const EVENTS = [
  { id: 'calm', label: 'Dead calm on the spine', dropMultiplier: 1, headline: 'Corp Weather: nothing moves. Productivity expected.' },
  { id: 'migration', label: 'Void whale migration', dropMultiplier: 2, headline: 'Void whales migrating through the lanes. Expect excrement.' },
  { id: 'scrapstorm', label: 'Scrap storm', dropMultiplier: 3, headline: 'Ion storm shredding derelicts. Scrap everywhere. Helmets mandatory.' },
  { id: 'lockdown', label: 'Corp lockdown', dropMultiplier: 0.5, headline: 'Lockdown in effect. Drops reduced. Remain productive.' },
];

const event = pick(rng, EVENTS);
const claimed = world.plots.filter((p) => p.owner);
const featured = pick(rng, claimed);

const bulletin = {
  day,
  generated: new Date().toISOString(),
  event,
  featuredPlot: featured ? featured.id : null,
};

writeFileSync('data/bulletin.json', JSON.stringify(bulletin, null, 2) + '\n');
console.log(`bulletin ${day}: ${event.label}, featured lot ${bulletin.featuredPlot}`);

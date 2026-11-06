# SpaceSquat (pre-pre-alpha)

**Staging:** spacesquat.fun · **Final:** spacesquat.com

Clone 1 of the claim/buy-out concept: **GTA 1/2 in space meets Total Annihilation dystopia.**
A top-down sandbox where you fly the Spine (a station "avenue"), jack ships, hunt drops, and buy, brand and lose lots.

> All money is fake. No payments, no accounts, no backend. Saves are in your browser's localStorage.

## Run it

```bash
npm run serve        # python3 -m http.server 8080
# open http://localhost:8080
```

It's a static site with no build step: ES modules, a canvas and JSON files. Don't open `index.html` via `file://`, because `fetch()` won't load the data.

## Controls

| Key | Does |
|---|---|
| W A S D / arrows | Thrust and turn |
| Shift | Boost |
| Space | Brake |
| F | Jump ship-to-ship (<3s): pull alongside a slow ship, NPC ones too. Stolen ships are hot: remote-killed after 2 min, and you land back in your skiff |
| E | At a lot's pad, the Refit Bay or a Sprawl hut site: open it. At a drop: press to grab it (slow down first) |
| X | Decline / abandon a freight job |
| Tab | The ledger: every lot, owner, value, buy-out price |
| L | The wiki: the 13 organizations, places, glossary (from `data/lore.json`; also `docs/WIKI.md`, regenerate with `npm run wiki`) |
| C | Residency card: 13 stamps from the 13 organizations, Level 0.00 → 0.13 → Level 1 (“Fully Processed”) |
| J | Achievements (`data/achievements.json`): 13 categories × 13, shame ones hidden until earned |
| B | Racetrack leaderboards |
| G | Gig board: every open gig in one list; click to track one (it gets the flag + arrow), toggle which types show on the map |
| K | Civic Warmth™: the Bureau's friendly score, today's ledger, Most Humane Citizen of the Day, certificate |
| Q | Clear the waypoint, then untrack / hide the objective flag |
| H | Help |

## What's in it

- **Flight**: inertia and drag, GTA2-style camera that zooms out with speed. Buildings are footprints whose roofs push away from the camera by their height, so towers lean as you pass.
- **The Spine**: 13 blocks of 13 lots (169), all on the north side, owned by the 13 organizations. The 12 gaps between blocks cut through the Spine as north-south crossings (placeholders for real intersections). Empty lots cost **$1**. Prices are in cents. Towers start at 13 floors and grow 13 floors every two buy-outs, capped at 100, so contested lots become the skyline. NPC corps claim empty lots too, leaving some for players.
- **Rule of 13**: everything is 13 except the max building height (100): 13 sector columns (A–M), 13 upgrade tiers per route, 13 hut tiers, 13 drops per 130 s window, $13 test cash.
- **Your skiff (#001)**: handles like garbage on purpose. Spend scrap at the **Kessler Refit Bay** (west of the start) on Gyros, Dampeners, Thrusters and Hull plating (13 tiers each, ×1.25 per tier); Road chassis is coming. Upgrades are scrap only. **Onboarding**: Mission 1, scrounge 120 scrap (~2–3 min) and fit an upgrade. Mission 2, "you need a home": 150 scrap, then pick any vacant site from the grid at either Sprawl's **Housing Registry** (on its city-facing edge). Rookies always get the base drop rate (the bulletin's storm and lockdown modifiers kick in after onboarding).
- **No free EVA** (the Vantablack Science Centre hasn't cleared it). You can jump ship-to-ship in under 3 seconds. If you're busted in a stolen ship it's impounded; if you're busted in your skiff you're towed to the start.
- **Buy-outs**: any lot can be bought for **1.25× its current value**. The owner can't refuse and gets the **full price back as credits** (not cash). Credits pay first, cash tops up.
- **Idiot-proof transparency**: every terminal shows what you pay, from what, and what happens when someone buys you out. Every lot has its full ownership ledger. Tab shows the whole market.
- **Getting bought out**: an NPC corp market buys lots off each other, and off you. You get a popup with the buy-back maths ("your credits cover $X, top up $Y") and a waypoint button.
- **Drops**: "a space bear shat in the dark", among others. Every client computes the same drops from the clock (seeded), so the world is shared without a server. Fly there, slow down and press E.
- **Levelling**: scrap gives XP. Levels widen your **sight radius**, the only edge anyone gets, earned by playing. Drops are only visible inside your sight radius.
- **Three side hustles** (scrap + XP only, `js/loops.js`):
  - **Freight jobs**: GTA courier missions. Up to 5 offers at a time on the gig board (they expire). Load at the blue beacon, deliver to the yellow one before the clock runs out. Hitting walls damages the cargo and cuts the pay. Needs a ship, so bailing out fails the job.
  - **Heat**: a GTA wanted level. Jacking a ship (+2 stars) or speeding in the Spine zone (+1) sends Corp drones after you. From Hull VII your plating shrugs off one drone tap per pursuit. Stay 700m clear for 10s to drop a star; shake them all for 15 scrap × peak stars. Get caught: ship impounded, a small scrap fine, and you're on EVA.
  - **Spine Run**: 13 gates. Start at the gold ring south of the Spine's west end, slalom north-south through all 12 crossings, then fly home. Your best time is saved. Bonus for the first lap each day and for beating your best.
- **The Sprawls**: two residential zones, each about a minute's flight past a city limit (skiff at cruise), with buoys and distance markers across the void: **Lower Upper Squalor** (east) and **Upper Lower Squalor** (west). 39 sites each (13 × 3). Free players build **huts with scrap only**: 13 tiers from Lean-to (150) to The Big Bunker, each ×1.25. One per pilot; huts are **never branded** and can't be bought out. About half the sites are already squatted by NPCs. You respawn at your hut.
- **Residency card (C)**: Level 0.00 → 0.13: one stamp from each of the 13 organizations, then Level 1, “Fully Processed”. Ten desks sit on the Spine, one per block (the Ministry's is north of the Spine, in the heat zone); Kessler, Mercy and the Registry stamp you at the Refit Bay, the Spine Run gate and the Housing Registries. Desks use stand-in actions where the real system doesn't exist yet.
- **Achievements (J)**: `data/achievements.json`. 13 categories × 13 known + 169 hidden; 48 are live so far. Shame achievements stay hidden until earned and pay a cosmetic once; the rest pay scrap.
- **Racetracks**: two space circuits south of the main drag, traced from real F1 tracks: **The Island Circuit** (after Circuit Gilles-Villeneuve, Montréal; southwest) and **The Temple Circuit** (after Monza; southeast). Fly through the start gate in the race direction to start a lap, hit all 13 gates in order; wrong-way crossings are flagged. Laps go to a leaderboard per track (**B**, or E at the timing board): for now it's this browser's laps vs. 12 seeded rival pilots from the orgs, shared once accounts and a server exist. 13 scrap a lap, +26 for a PB, +39 for the first lap of the day per track.
- **Art**: org emblems (desks, residency card, wiki, ledger, lot terminals), achievement-category icons, Tenure Heights / owner-home / deck art sliced from `assets/src/` by `scripts/slice-assets.py`. Lot owners who live in a Sprawl get the owner-home art.
- **Gig board (G)**: freight offers, the job you're on, reported drops (by sector only: sight radius stays the earned edge), races and residency stamps, up to 13 rows with a mix of types. Track one gig at a time; the onboarding mission is tracked by default. Per-type "on map" toggles (freight offers are list-only by default). Offers no longer spam the log.
- **Humane Shuttle runs**: sign up at the depot next to either Sprawl's Housing Registry; 3 random routes through the hubs every 13 minutes. The shuttle handles like dog shit on purpose. Stop at every stop; keep passenger comfort ≥ 70% and beat par for a bonus on top of base pay. Career with the Humane Transit Directorate (Ministry of the Gentry): 13 ranks, better pay and a marginally less awful shuttle each time. X abandons.
- **Civic Warmth™ (K)**: a friendly score from the Bureau of Public Cheer (0–1300, 13 tiers, start 650). Deliveries, shuttle runs, stamps and homes warm it; jacking, evading or getting busted, dumping cargo, late jobs, wall-scraping and wrong-way laps cool it. Consequences are on the roadmap. Most Humane Citizen of the Day is on the gig board and in the feed (seeded until accounts); out-warm the pick and you can print a certificate. E-mailed certificates (opt-in) and paper copies (for purchase) come later.
- **Branding**: owners only, with an opt-in public-content consent step first. Editable or clearable any time; https links only.

## The "server" (GitHub Actions)

| Workflow | Does |
|---|---|
| `world-tick.yml` | Daily (and on demand): runs `scripts/tick.mjs` to roll the Corp Bulletin (`data/bulletin.json`: event modifier such as drops ×2 during a void whale migration, plus a featured lot), commits it and triggers a deploy |
| `deploy.yml` | On push to `main`: syntax-checks, then FTP-uploads the site to Hostinger |

### Hostinger setup

1. In hPanel, open **Files → FTP Accounts** and note the host, username and password.
2. In this repo, open **Settings → Secrets and variables → Actions** and add the secrets `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
3. Optional: add the variable `FTP_SERVER_DIR` if the site doesn't live in `public_html/` (for example a subdomain folder).
4. Push to `main`, or run **Deploy to Hostinger** manually.

Until the secrets exist, the deploy runs its checks and skips the upload.

`.htaccess` stops LiteSpeed from caching the JSON data files.

### Domains

- **spacesquat.fun** is staging and testing. Point it at the folder `FTP_SERVER_DIR` uploads to. `robots.txt` and the `noindex` meta tag keep it out of search engines.
- **spacesquat.com** is the final site. At launch, remove the `noindex` meta tag in `index.html` and replace `robots.txt`.

## Staging tools (spacesquat.fun, localhost, or `?dev`)

These are hidden on the production domain.

| Key | Does |
|---|---|
| N | Pin a note where you're standing. It auto-stamps sector, position, ship, level and build. Tags: idea, bug, balance, art, copy, legal. Can be linked to a roadmap item. Ctrl/⌘+Enter pins it. |
| R | Roadmap / notes / costs panel. Notes can be waypointed, deleted, copied as Markdown or downloaded as `notes.md`. |

- Notes are stored in your browser. Export them to share or keep them.
- Roadmap: edit `data/roadmap.json`.
- Costs: edit `data/costs.json`, adding one block per version checkpoint and flipping `basis` to `actual` once you have real figures.
- The deploy stamps `data/build.json` with the commit sha and time, so every note records which build it was made on.

## Art

Sprites are generated sheets in `assets/src/` (four sheets: ships, structures, the Sprawl, and drops/props/UI), sliced by `scripts/slice-assets.py` into `assets/sprites/*.png` plus `assets/sprites.json`:

```bash
pip install pillow scipy numpy
python3 scripts/slice-assets.py
```

The slicer finds sprites as connected components and names them from the sheet layout. For ships it also records where the baked-in thruster flame ends (`cut`), so the game shows the flame only while thrusting.

Every sprite is optional. If one is missing, the renderer falls back to the old canvas shapes, so a new sheet can be swapped in a piece at a time. Ship art must face **right** (east). Raw sheets are excluded from the Hostinger upload.

## Layout

```
index.html, css/style.css
js/rng.js        seeded RNG, shared by browser + Actions
js/world.js      geometry, collision, sectors, drop schedule
js/entities.js   ships, EVA, NPC traffic
js/economy.js    the rules: build, buy-out, credits, levels, huts (localStorage)
js/loops.js      freight jobs, heat/drones, Spine Run
js/devtools.js   staging-only roadmap/notes/costs panel
data/roadmap.json, data/costs.json   edit these directly
js/render.js     canvas renderer + minimap (sprites with canvas fallbacks)
js/sprites.js    sprite loader, roof/ship sprite pickers
js/main.js       loop, input, UI/terminals
data/world.json  generated by scripts/gen-world.mjs (npm run world)
data/bulletin.json  generated by scripts/tick.mjs (the daily tick)
```

## Known limits (on purpose, for now)

- Single-player against a simulated market. First-claim on drops is local, not arbitrated.
- No real payments. When it's time: payments behind one module, test mode first.
- No moderation pipeline yet (in-game reporting, daily automated scan, two-week human review).
- Bot defences are only partial so far: drops are claimed in the world (you must be within range and slowed down) and are visible only inside your sight radius. Server-side movement validation comes with a realtime server.

## Next steps

1. A realtime server (Cloudflare Durable Objects or a small Node + WebSocket on a VPS) for multiplayer, server-arbitrated drop claims and validated movement.
2. Real lots in Postgres, with Stripe test mode behind a payments interface.
3. Clone 2: a different setting on the same economy core (`economy.js` is meant to be lifted as-is).

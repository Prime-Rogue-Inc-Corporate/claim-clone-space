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
| F | Bail out to EVA / board any parked or slow ship (NPC ships too) |
| E | At a lot's pad or a Sprawl hut site: open it. At a drop: **hold** to claim |
| X | Decline / abandon a freight job |
| Tab | The ledger: every lot, owner, value, buy-out price |
| H | Help |

## What's in it

- **Flight**: inertia and drag, GTA2-style camera that zooms out with speed. Buildings are footprints whose roofs push away from the camera by their height, so towers lean as you pass.
- **The Spine**: 48 lots (24 per side). Unclaimed lots cost **$5 per floor** (1–100).
- **Buy-outs**: any lot can be bought for **1.25× its current value**. The owner can't refuse and gets the **full price back as credits** (not cash). Credits pay first, cash tops up.
- **Idiot-proof transparency**: every terminal shows what you pay, from what, and what happens when someone buys you out. Every lot has its full ownership ledger. Tab shows the whole market.
- **Getting bought out**: an NPC corp market buys lots off each other, and off you. You get a popup with the buy-back maths ("your credits cover $X, top up $Y") and a waypoint button.
- **Drops**: "a space bear shat in the dark", among others. Every client computes the same drops from the clock (seeded), so the world is shared without a server. Fly there and hold E.
- **Levelling**: scrap gives XP. Levels widen your **sight radius**, the only edge anyone gets, earned by playing. Drops are only visible inside your sight radius.
- **Three side hustles** (scrap + XP only, `js/loops.js`):
  - **Freight jobs**: GTA courier missions. Load at the blue beacon, deliver to the yellow one before the clock runs out. Hitting walls damages the cargo and cuts the pay. Needs a ship, so bailing out fails the job.
  - **Heat**: a GTA wanted level. Jacking a ship (+2 stars) or speeding in the Spine zone (+1) sends Corp drones after you. Stay 700m clear for 10s to drop a star; shake them all for 15 scrap × peak stars. Get caught: ship impounded, a small scrap fine, and you're on EVA.
  - **Spine Run**: a 10-gate lap around the station, starting at the gold ring at the west end. Your best time is saved. Bonus for the first lap each day and for beating your best.
- **The Sprawl**: a residential zone about a minute's flight east of the city limit (skiff at cruise), with buoys and distance markers across the void. Free players build **huts with scrap only** (shack 150, hab hut 300, bunker 600). One per pilot; huts are **never branded** and can't be bought out. About half the 80 sites are already squatted by NPCs. You respawn at your hut.
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
- Bot defences are only partial so far: drops are claimed in the world, take a deliberate 1.2-second hold, and are visible only inside your sight radius. Server-side movement validation comes with a realtime server.

## Next steps

1. A realtime server (Cloudflare Durable Objects or a small Node + WebSocket on a VPS) for multiplayer, server-arbitrated drop claims and validated movement.
2. Real lots in Postgres, with Stripe test mode behind a payments interface.
3. Clone 2: a different setting on the same economy core (`economy.js` is meant to be lifted as-is).

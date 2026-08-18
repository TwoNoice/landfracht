# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Landfracht" — a browser game about running a small agricultural haulage
business. Vanilla HTML/CSS/JS, no build step, no dependencies, no test suite,
no package manager. The full design brief lives in the conversation history;
`README.md` documents the player-facing side and the tuning knobs.

Stage 1 and 2 of the planned four are implemented. Stage 3 (weather, seasons,
events, cargo damage, daily goals) and stage 4 (hired drivers, depot, second
region, regular customers) are not.

## Running it

There is nothing to build. Open `index.html` directly, or use the dev server:

```bash
python -m http.server 8177
```

`.claude/launch.json` wires that up for `preview_start` (name: `landfracht`).
The port is deliberately not 8123 — that one collides with another project on
this machine.

## Testing

No test framework. Verification happens in the browser console; every module
is reachable through the `TG` global, and the game state is plain JSON.

```js
// fresh state without touching the saved game
TG.spiel.neu(); TG.ui.schliessen();

// drive: the key handler listens on window, so synthetic events work
window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'}));

// teleport instead of driving across the map
TG.spiel.gespann.setzen(x, y, heading);

// inspect
TG.spiel.state; TG.welt.untergrundAn(x, y); TG.spiel.ladeChance();
```

To reset the saved game, call `TG.spiel.loeschen()` **before** reloading.
Removing the localStorage key by hand does not work: the `beforeunload` hook
writes the old state straight back. `loeschen()` sets an internal `gesperrt`
flag that blocks further writes until `neu()` clears it.

## Architecture

### Module pattern and load order

Each file is an IIFE hanging off a global `TG` namespace. These are **classic
scripts, not ES modules** — deliberately, so the game runs from `file://`
without a server. Do not convert them to modules.

`index.html` fixes the load order: `util → data → world → physics → jobs →
game → render → ui → sound → main`. Cross-references that run at load time must
respect it. `jobs.js` reads `TG.spiel.ZEITFAKTOR` even though `game.js` loads
later; that is safe only because the read happens inside a function.

### Where the responsibilities sit

- `world.js` owns the map: road polylines, buildings, loading zones, and the
  `gibt`/`nimmt` goods lists per location. It also answers `untergrundAn()`
  (road / dirt track / open ground) from a coarse 120 m spatial grid built
  once at startup, and `imGebaeude()` for collision.
- `jobs.js` composes jobs *out of* that world data. Add a location with
  `gibt`/`nimmt` entries and routes appear on the job board automatically —
  nothing else needs editing.
- `game.js` is the state machine: money, reputation, fuel, wear, loading,
  settlement, saving. It owns the single `state` object and the one `Gespann`
  instance.
- `physics.js` is stateless with respect to the game; it receives everything
  it needs through a `technik` object that `game.js` assembles.
- `ui.js` and `render.js` only read state and call `game.js` actions.
- `sound.js` synthesises everything at runtime through Web Audio; there are
  no audio files, deliberately, so `file://` keeps working. It reads nothing
  from the game — `main.js` hands it a small state object each frame and
  forwards the `meldung` / `vorgang` / `geladen` / `stufe` events.

### Coordinate and scale conventions

1 world unit = 1 metre. The map is 3000 × 3000. Vehicle dimensions, buildings
and zones are all in real metres — a barn is ~30 m long, a tight loading zone
is 11 × 5 m. Getting this wrong once already produced buildings three times
too large.

Speeds are km/h in data and m/s internally. Distances are displayed via
`util.strecke()`.

### The time-scale tension

`ZEITFAKTOR` in `game.js` (game minutes per real minute, currently 40) is the
most load-bearing constant in the project. Real driving over real distances
costs real minutes; a fast clock makes a single haul swallow half a game day
and produces nonsense time windows. The brief asked for 12-minute game days
(which would be 120); that value was tried and rejected because the job board
then advertised "Zeitfenster 79 Std". Raising it again requires shrinking the
map at the same time.

Everything downstream depends on it: `jobs.fahrzeit()` converts metres to game
minutes, which sets every job's time window, which sets penalties.

### Sound

The engine is a periodic wave on the firing frequency (26 Hz idle to ~88 Hz)
plus band-passed noise for clatter, behind a low-pass that opens with revs.
Revs come from a notional four-speed gearbox, so speed stays audible instead
of the pitch creeping up over a whole trip. Two constraints worth knowing:

- The `AudioContext` must be built inside a user gesture, otherwise Chrome
  keeps it suspended. `ton.start()` only registers the wake-up listeners.
- Volume and on/off live under their own localStorage key `landfracht_ton`,
  not in the save. Putting them in `state` would mean bumping the save
  version, and `laden()` discards rather than migrates.

### Driving model

`Gespann` is a kinematic bicycle model: the tractor's rear axle is the
reference point, the hitch sits `KUPPLUNG` metres behind it, and the trailer
heading `th` integrates toward the tractor heading. Articulation is clamped at
`KNICK_MAX`; reversing past that point kills speed instead of letting the rig
fold through itself.

Loaded top speed is deliberately close to unloaded: the wear factor and the
load factor multiply, and at `0.70 + 0.30 * zust` times `0.74 + 0.26 * (1 -
last)` the starting tractor came out at 19 km/h with a full trailer — below
the 24 km/h that `jobs.fahrzeit()` assumes when it sizes every time window.
Load belongs in the acceleration (through `masseGesamt`), not in the top
speed. The trailer only counts 0.55 towards the accelerating mass; counting
it fully modelled a rig that took over twenty seconds to get going.

Two traps that have already bitten:

- The near-zero speed deadband must not apply while throttle or brake is held.
  Per-frame acceleration from standstill is smaller than the deadband, so
  rounding to zero every frame is a silent "cannot move" bug.
- Steering lock is speed-dependent (`maxEin`). Full lock at road speed folds
  the trailer past the warning threshold in an ordinary corner.

### Job generation coupling

Job quantities are derived from the *player's own* largest trailer of that
type (`eigeneKapazitaet`), capped at two loads. This is intentional: it keeps
trips short and makes buying a bigger trailer visibly raise job sizes and
pay. It also means job data is not comparable across saves.

`guete` (actual / expected pay ratio) is stored on each job and drives the
"gut bezahlt" / "mager bezahlt" labels. Do not judge pay quality from €/km —
that varies by an order of magnitude between bulk goods and vehicle transport.

### Loading and unloading

Fully automatic. `game.vorgangSchritt()` runs every frame: it asks
`ladeChance()` whether the trailer axle sits inside a zone whose `arten`
include the trailer type, whether the rig is stationary, and whether an
accepted job matches. Zones flagged `eng` additionally require the trailer to
be aligned with the zone's long axis within ~±29°.

Progress is reported to the UI through the small event bus
(`spiel.bei(name, fn)` / `melden`). Events in use: `meldung`, `vorgang`,
`geladen`, `stufe`.

### UI

Panels are rendered by building HTML strings into `#panel-inhalt`, with a
single delegated click handler keyed on `data-tat` attributes. The simulation
pauses while a panel is open (`UI.istOffen()` gates the update in `main.js`),
so panels can be opened anywhere without abuse.

The title screen `#titel` is the one panel `ui.js` does not own; `main.js`
drives it, and its `titelAn` flag gates the simulation exactly the way
`UI.istOffen()` does. It serves two purposes at once: it is the landing page
of the hosted site, and the click on "Spiel starten" is the user gesture
without which Chrome keeps the `AudioContext` suspended. Saving is suppressed
while it is up (`beforeunload` and `visibilitychange` both check `titelAn`) —
otherwise merely opening the page would leave a save behind, and the next
visit would offer "Weiterspielen" to someone who never played. `S.laden()`
therefore runs *before* the title screen so the button can read either
"Weiterspielen — Tag N" or "Spiel starten".

### Site assets

`favicon.svg`, `symbol-180/192/512.png`, `manifest.webmanifest` and
`vorschau.png` exist only for the hosted page and are dead weight when the
game runs from `file://`. The PNGs are generated by the two scripts in
`werkzeug/`, which rasterise polygons by hand and assemble the PNG through
`zlib` — there was no imaging library on the machine. Regenerate rather than
edit them. `symbole_bauen.py` duplicates the geometry of `favicon.svg`; a
change to the icon has to happen in both.

`VEROEFFENTLICHEN.md` is the deployment guide written for someone who has
never published a site. Keep it in that register.

### Save format

One localStorage key, `landfracht_v1`. The whole `state` object is serialised
as-is, plus the rig position. `laden()` refuses anything whose `v` field is
not 1 — bump that and the old save is discarded rather than migrated.

## Conventions

Identifiers, comments and UI strings are German, using farming vocabulary
rather than software vocabulary (`Ladung`, `Zustand`, `Ankoppeln`,
`Gespann`, `Anhänger`). Keep new code in the same register. Comments explain
*why* a value or guard exists, not what the line does.

Balance constants are collected so they can be found: `BAL` at the top of
`game.js`, `TARIF` at the top of `jobs.js`, the steering constants at the top
of `physics.js`.

No real machinery manufacturer names anywhere — this is a hard requirement
from the brief.

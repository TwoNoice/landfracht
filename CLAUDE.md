# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Landfracht" — a browser game about running a small agricultural haulage
business. Vanilla HTML/CSS/JS, no build step, no dependencies, no test suite,
no package manager. `README.md` documents the player-facing side and the
tuning knobs. The original design brief is not in the repository and is not
recoverable — everything that survived from it is written down here or in
`README.md`, so do not go looking for it.

Stages 1 to 3 of the planned four are implemented. Stage 4 (hired drivers,
depot, second region, regular customers) is not.

## Running it

There is nothing to build. Open `index.html` directly, or use the dev server:

```bash
python -m http.server 8177
```

`.claude/launch.json` wires that up for `preview_start` (name: `landfracht`).
The port is deliberately not 8123 — that one collides with another project on
this machine.

`python -m http.server` sends `Last-Modified` and browsers happily serve the
old JS from memory cache without revalidating, so an edit can look like it did
nothing. Reloading does not always help. The reliable trick is to change the
*origin*: `localhost:8177`, `127.0.0.1:8177` and `[::1]:8177` are three
separate cache buckets for the same server. Check you have the build you think
you have before debugging anything — e.g. `TG.welt.GROESSE` should be 720 and
`TG.welt.wege.length` 36.

### Scripts in `werkzeug/`

None of them run at play time; they are one-off generators and are called
from the project root. The sound workbench is a page, not a script: with the
dev server up it sits at `http://localhost:8177/werkzeug/klang.html`.

```bash
# The geometric probe on the road network: lengths, building clearance,
# junctions, the detour factor and the drive test. Must run without a
# violation after any change to the map.
python werkzeug/wege_pruefen.py

# Embed engine recordings as js/klang_motor.js. Each argument is
# Datei:Drehzahl — the rpm the engine runs at in *that* recording.
python werkzeug/klang_einbetten.py leerlauf.ogg:800 volllast.ogg:2100

# Rasterise favicon.svg into symbol-180/192/512.png
python werkzeug/symbole_bauen.py

# Render vorschau.png, the link-preview image
python werkzeug/vorschau_bauen.py
```

`js/klang_motor.js` is generated, carries the recordings as base64, and is
neither committed nor listed in `.gitignore`. Running the embed script is
therefore a deliberate decision about what lands in the repository, not a
build step.

## Testing

No test framework. Verification happens in the browser console; every module
is reachable through the `TG` global, and the game state is plain JSON.

**A change to the map is not done until all three of these pass**, and they
have to be run together — they measure different things and have caught each
other out twice:

1. `python werkzeug/wege_pruefen.py` — the offline probe. Fast to iterate
   against, but it mirrors `physics.js` rather than running it.
2. The drive test in the browser, further down this section. It runs the real
   `TG.spiel.schritt()`, so it sees the surface grid and the map-border fence
   that the offline probe does not model.
3. The centreline sampling below it (surface, buildings, fields).

Where 1 and 2 disagree, one of them is wrong about the game and the
disagreement is the finding. It has happened both ways: the offline probe once
carried its own copies of the tuning constants and was measuring a map that no
longer existed, and the browser once failed two routes that the probe passed
because `physics.js` fences the rig away from the map border and bounces it.

```js
// fresh state without touching the saved game
TG.spiel.neu(); TG.ui.schliessen();

// drive: the key handler listens on window, so synthetic events work
window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'}));

// teleport instead of driving across the map
TG.spiel.gespann.setzen(x, y, heading);

// inspect
TG.spiel.state; TG.welt.untergrundAn(x, y); TG.spiel.ladeChance();

// the mouse steering, without a frame loop
TG.steuerung.setzen('maus'); TG.steuerung.zustand(); TG.steuerung.lenkung();

// panels: boerse | hof | haendler | buch | karte (key N)
TG.ui.oeffnen('karte');

// draw the whole world into any context, at any scale
TG.zeichnen.karte(ctx, 620, 620, {x: 360, y: 360}, 720, TG.spiel,
                  {namen: true, zielLinie: true});
```

Two things block a naive console session. Keys do nothing while the title
screen is up, because `main.js` returns early on `titelAn` — click it away
first (`document.getElementById('t-los').click()`)
or call `TG.ui.oeffnen()` directly. And `annehmen()` takes the job *object*
from `TG.spiel.state.boerse`, not its id; passing an id returns "Der Auftrag
ist nicht mehr zu haben."

**Changing the map? Run this.** It is the check that actually proves a road
network drivable, and it catches what geometry alone does not: a corner the
rig cannot hold at speed. The lookahead has to scale with speed — a fixed one
cuts corners and reports false failures. Its floor is 8 m and belongs to the
*rig*, not to the map: it is about a wheelbase and a half. On the old, four
times wider map it stood at 14 m; that value cuts every corner here and
reports failures that are none.

The same probe runs outside the browser as `werkzeug/wege_pruefen.py`, which
is quicker to iterate against and also measures clearances, junctions and the
detour factor. Both must agree — measured 2.05 m against 2.11 m largest
excursion on the same network.

```js
// follow every route end to end at full throttle, measure the worst
// lateral excursion from the centreline against the carriageway's half-width
(function () {
  var raus = [];
  for (var k = 0; k < TG.welt.wege.length; k++) {
    TG.spiel.neu(); TG.ui.schliessen(); TG.spiel.motorStarten();
    for (var i = 0; i < 400; i++) TG.spiel.zuendungSchritt(1 / 60);
    var w = TG.welt.wege[k], p = w.p, g = TG.spiel.gespann;
    g.setzen(p[0][0], p[0][1], Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]));
    g.v = 0; g.th = g.h;
    var idx = 1, n = 0, maxAb = 0;
    while (idx < p.length - 1 && n++ < 40000) {
      TG.spiel.aktiverTraktor().f.tank = TG.spiel.tankGroesse();   // Sprit ist nicht das Thema
      var voraus = Math.max(8, Math.abs(g.v) * 1.1);
      while (idx < p.length - 1 &&
             Math.hypot(p[idx][0] - g.x, p[idx][1] - g.y) < voraus) idx++;
      var d = TG.util.winkel(Math.atan2(p[idx][1] - g.y, p[idx][0] - g.x) - g.h);
      TG.spiel.schritt(1 / 60, {gas: true, lenkZiel: Math.max(-1, Math.min(1, d * 2))});
      var nah = 1e9;
      for (var q = Math.max(0, idx - 40); q < Math.min(p.length - 1, idx + 40); q++) {
        nah = Math.min(nah, TG.util.abstandStrecke(g.x, g.y,
                p[q][0], p[q][1], p[q + 1][0], p[q + 1][1]));
      }
      if (n > 90 && nah > maxAb) maxAb = nah;      // die ersten Bilder rollen erst an
    }
    if (maxAb > w.breite / 2 || idx < p.length - 1) raus.push([k, w.typ, maxAb.toFixed(1)]);
  }
  return raus;          // muss leer sein
})();
```

Sampling the centrelines catches the cheaper class of mistake and costs
nothing:

```js
// every centreline point must report its own surface and hit no building
TG.welt.wege.forEach(function (w) {
  w.p.forEach(function (q) {
    var u = TG.welt.untergrundAn(q[0], q[1]);
    if (w.typ === 'strasse' ? u !== 'strasse' : u === 'gelaende') console.log('Untergrund', w.typ, q);
    if (TG.welt.imGebaeude(q[0], q[1], 1.0)) console.log('Gebaeude', q);
  });
});
```

**Seeing the canvas when screenshots are unavailable.** A background or hidden
preview composites no frames, so the screenshot tool times out while
`javascript_tool` still works fine. Draw into an offscreen canvas, take
`toDataURL('image/png')`, pull it out in slices and reassemble it to a file —
that is a picture of the real render, not a reconstruction. Keep each slice
above ~60 000 characters so the harness spills it to a file instead of
returning it inline and burning context.

A hidden tab runs no `requestAnimationFrame`, so the game loop is stopped in
any headless or background preview. Step the simulation by hand instead —
`TG.spiel.schritt(1/60, {gas: true, lenkZiel: 1})` in a `for` loop takes the
same path the loop does, and `TG.spiel.zuendungSchritt(dt)` advances the
starter. `TG.zeichnen.kamera` has to be moved onto the rig by hand before
`TG.steuerung.lenkung()` means anything, because `kameraFolgen()` only runs
while frames are drawn.

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
umwelt → game → render → ui → entwickler → anleitung → sound → main`.
Cross-references that run at load time must respect it. `jobs.js` reads
`TG.spiel.ZEITFAKTOR` even though `game.js` loads later; that is safe only
because the read happens inside a function. `umwelt.js` has to come before
`game.js`, because `game.js` hooks its callbacks in at load time
(`UW.anmelden`).

### Where the responsibilities sit

- `world.js` owns the map: road polylines, buildings, loading zones, and the
  `gibt`/`nimmt` goods lists per location. It also answers `untergrundAn()`
  (road / dirt track / open ground) from a coarse 120 m spatial grid built
  once at startup, and `imGebaeude()` for collision. It also streams the
  purely decorative `beiwerk()` — copses, ponds, boulders.
- `jobs.js` composes jobs *out of* that world data. Add a location with
  `gibt`/`nimmt` entries and routes appear on the job board automatically —
  nothing else needs editing. `erzeugen()` takes an optional `{art, von, nach}`
  wish; with `von` set it works backwards from the location's `gibt` list
  instead of picking a cargo first. That is what `anschluss()` uses. `nach`
  does the same from the `nimmt` list and serves the *Fest* events.
- `game.js` is the state machine: money, reputation, fuel, wear, loading,
  settlement, saving. It owns the single `state` object and the one `Gespann`
  instance.
- `umwelt.js` is everything that changes over the day and the year without
  the player causing it: seasons, weather, events and daily goals. Like
  `jobs.js` it takes `state` as a parameter and holds none of its own. It
  talks back through two callbacks `game.js` registers with `anmelden()` —
  `melden` and `belohnen`; the reward goes through `game.js` because only
  there is the rank-up handled.
- `physics.js` is stateless with respect to the game; it receives everything
  it needs through a `technik` object that `game.js` assembles.
- `ui.js` and `render.js` only read state and call `game.js` actions.
- `sound.js` synthesises everything at runtime through Web Audio; there are
  no audio files, deliberately, so `file://` keeps working. It reads nothing
  from the game — `main.js` hands it a small state object each frame and
  forwards the `meldung` / `vorgang` / `geladen` / `stufe` events.

### The road network

**Most of the numbers in `world.js` were generated, not typed.** The skeleton
is the old 3000 m network multiplied by 0.24, the farmyards were placed by a
search that rotates and shifts each yard as a rigid body until it clears every
road, and the fields and ponds by a second search. Hand-editing a coordinate
is still the right way to make a small change — but nothing in there was
placed by eye, so a value that looks arbitrary probably is the output of a
constraint, and `werkzeug/wege_pruefen.py` is what tells you which one you
just broke.

36 routes, 4.48 km of Landstraße and 2.78 km of Feldweg, deliberately meshed
rather than radial: every location is reachable by at least two routes, and
the *Spangen* cross-link the spurs to each other. A radial network forces
every haul through the same junction and all jobs start to drive alike.

The whole network is the old 3000 m one multiplied by **0.24** — control point
for control point, so the topology and every junction survived the compression
untouched. Only four corners were reworked afterwards, and only because the
drive test found them (see below).

Carriageways are narrower than they were: 7 / 6.5 / 5.5 / 4.5 m instead of
10 / 8 / 7 / 5.5. Widths are in real metres and did *not* shrink with the map,
so at a quarter of the size the old widths turned the map into 10 % asphalt
and every junction into a blob. The new ones are also the more honest figures
— a Landstraße is 6 to 7.5 m in the real world, a Feldweg 3 to 4. How far they
could come down is not a matter of taste: the drive test fixes it, see
**Driving model**.

`wege` holds only a skeleton: a control point every 20–50 m. Two passes turn
it into the real road at load:

1. `schlaengeln()` bows each skeleton segment sideways and inserts
   intermediate points, alternating left / right along the route.
2. `ausrollen()` smooths the result into a dense polyline (a point every
   `AUSROLL_SCHRITT` = 2 m), stashes the skeleton in `stuetz`, replaces `p`.

Everything downstream — renderer, surface grid, minimap — reads the rolled-out
`p`, so look, surface and collision cannot drift apart. Roads are authored by
steering a handful of control points; the bends come out of the two passes.

The spline is **centripetal** Catmull-Rom, not the uniform kind. It passes
through every control point, which is what makes junctions work: two roads
meeting simply name the same control point, and both curves go through it.
`schlaengeln()` leaves control points where they are, so that survives the
first pass. The centripetal parameterisation is not decoration either —
uniform Catmull-Rom overshoots when control points are unevenly spaced, and an
overshoot here is a road through a farmhouse.

Four things about `schlaengeln()` were each arrived at by getting them wrong
first:

- **Half a wave per segment, not a whole one.** A full wave (out and back
  inside one segment) looks livelier on paper but cannot be made large: its
  curvature carries a shape factor three times bigger, so at the same radius
  only about a seventh of the sideways travel fits — invisible. The half wave
  `sin(pi*u)^2` gets the rest.
- **The envelope must be flat at both ends, not merely zero.** `sin(pi*u)`
  alone is zero at the control points but arrives at an angle, so every
  junction becomes a corner. Squaring it makes value *and* slope vanish.
- **The side alternates strictly; it is not rolled.** Two neighbouring
  segments bowing the same way add their curvatures at the shared control
  point and halve the radius there, and that is exactly where a rig with a
  trailer gets stuck. Alternating, they cancel into an inflection. Only the
  strength and the side a route *starts* on are rolled.
- `AUSSCHLAG_NENNER` = 480 fixes the radius of the bow at about 24 m by making
  the amplitude grow with the **square** of the segment length. Hold the
  amplitude constant instead and a short segment gets an arbitrarily tight
  bend. Because the amplitude follows from the length, the radius falls out of
  the equation entirely — it is the same 24 m whatever the segment length, and
  therefore the same at any map scale. That is why the compression left it
  alone while the amplitude itself collapsed from tens of metres to a few.

Four properties are checked, not assumed. The drive test is written out under
**Testing** and runs in the console; the *geometric* half — clearances,
junction exactness, field and pond crossings, the detour factor — is
`werkzeug/wege_pruefen.py`, which re-implements `schlaengeln()` and
`ausrollen()` against `world.js`. It reads the four tuning constants out of
`world.js` rather than carrying its own copies; an earlier version hard-coded
them and quietly measured a map that no longer existed.

- No centreline point comes within `breite / 2 + 1.0` of a building; the 1.0
  is the buffer `physics.js` uses. Checked over 3 657 samples. Narrower
  carriageways make this *easier*, not harder — but one Dorf house still had
  to move 3 m when the Dorfstraße's corner was reworked.
- The rig follows all 36 routes end to end at full throttle and never leaves
  the carriageway — with the starting tractor (worst excursion 2.05 m) and
  with the largest one fully loaded (2.66 m). The second half is new: the old
  map failed it on five routes, because at 90 km/h nothing held those corners.
  Four corners had to be reworked to get there — Nordstraße, Lindenbachstraße,
  the Biogas–Lagerhaus track and the Dorfstraße — each by moving a *single*
  control point outwards, which widens the bend. Note that the shared point of
  Nordstraße and Waldweg had to move in both routes at once, or the junction
  hangs beside itself.
- **Do not try to fix a tight corner by smoothing.** It was tried twice, once
  globally and once driven by the measured radius, and both made it worse:
  straighter approaches let the rig arrive faster, and the corner that is left
  is then taken at a higher speed than before. Weg 13 went from 3.85 m to
  5.20 m that way. Widen the one bend instead of flattening the road.
- Every route's two ends either sit exactly on another route's control point,
  reach the map border, or die in a farmyard. "Nearly on" is the failure mode
  that looks like a road hanging beside its junction. Both main axes were
  extended to run out to the border for this reason: they used to stop about
  40 m short, which on the old map was 1.3 % of the width and invisible, and
  here is half a screen and reads as an unfinished road. They stop 10 m short
  and not 0, because a centreline point exactly on the border falls out of the
  surface grid and reports `gelaende`. And `physics.js` fences the rig away
  from the border — that fence had to come down from 20 m to 8 m at the same
  time, or the last stretch of both main axes would be a road the rig bounces
  off. It is a rig-scale number (about one rig length) that was written when
  the map was four times wider.
- **Two roads that cross must share a control point, not merely intersect.**
  Querstraße and the Ostschleife crossed without one. At the old scale that
  was a Feldweg cutting a Landstraße, slightly odd; at a quarter of the size
  the two carriageways merged into one over 80 m and it was the single worst
  looking spot on the map. The rule already existed for junctions — this is
  the same rule, and it also holds where one road merely passes another.
- **No road of any kind crosses a field.** On the wide map a Feldweg through a
  field was right — that is what a field track is — and the rule allowed it.
  At a quarter of the size the track is as wide as the field is long and it
  reads as a mistake, so the rule now covers both road types. Fields go where
  the road network leaves a gap: 30 of them, 11 % of the map.

`fahrstrecke()` still estimates distance as straight line × `UMWEG` rather
than routing, deliberately — the job board's numbers stay explainable. But
`UMWEG` belongs to the geometry, not to the balance: measured over all 55
location pairs by routing over the rolled-out network the real ratio is
1.13 / 1.39 / 2.70 (min / median / max), mean 1.45, and it is set to 1.45.
Compressing the map barely moved it — it is a property of the network's shape,
not of its size. Making the roads windier without raising it silently tightens
every time window, because `jobs.fahrzeit()` sizes them from this number.

The distances themselves, routed rather than estimated: 146 m shortest,
432 m median, 880 m longest, over all 55 pairs. That is the point of the
compression — the median haul measured 1 785 m before it.

`felder` entries carry a small `dreh`; the renderer rotates them about their
centre. Their positions were searched rather than placed — a rectangle is
accepted only if it clears every road of either type, every building, zone,
pond and other field, with the road margin widened by `dreh * halbe Diagonale`
because a rotated rectangle sticks out past its axis-aligned box. Everything
else about a field still treats it as that box, including the check that keeps
`beiwerk` off it, which is close enough for scenery.

**A field's `x`/`y` is its top left corner, not its centre.** `fillRect` and
`freiFuerBeiwerk()` both read it that way, while `orte`, `zonen` and
`gebaeude` all do the opposite — an easy half-a-field mistake to make when
generating them, and it was made once.

### The developer mode (Prüfstand)

`js/entwickler.js` is a workbench, not a feature of the game: unlimited money,
a tank that never empties, no wear, jumps to any location, and the scaffolding
drawn over the world. `Strg+Alt+E` toggles it; while it runs, `P` opens the
panel, `T` teleports the rig to the mouse pointer, `O` toggles the overlay and
`Z` the numbers panel. Everything about it is designed to be removable: delete
the script tag and the game behaves exactly as before.

Three things are load-bearing:

- **It is asked, it never pushes.** `game.js`, `render.js` and `main.js` call
  `TG.entwickler.hat(name)` at *runtime* through a local `pruef()` helper, and
  every one of them tolerates the module being absent. That is what keeps the
  mode out of the load order's critical path — entwickler.js sits after
  `ui.js` only because it needs `TG.spiel` for its own IIFE.
- **The mode lives under its own localStorage key** `landfracht_pruefstand`,
  like sound and steering, and for the same reason: `laden()` discards saves
  whose `v` is not 1 rather than migrating them, so putting a developer flag
  into `state` would cost every existing save.
- **`pflegen()` runs from `main.js`, outside the `pausiert` branch.** Buying
  and repairing happen inside panels, and `schritt()` does not run while a
  panel is open — a wallet topped up from inside `schritt()` would be empty
  exactly when it is needed. Same reasoning as `zuendungSchritt()`.

The panel's actions all carry the `p-` prefix on `data-tat`; `ui.klick()`
offers every button to `TG.entwickler.klick()` first and only falls through to
its own chain when nothing there was responsible. `ui.zeichnen()` closes the
panel if the mode is off, which is what happens when the panel switches itself
off.

`springen(ortId)` aims for the loading zone that matches the *coupled* trailer
and adopts its heading, so the rig lands ready to load rather than skewed in a
tight zone. It offsets forward by `6 + trailer.geo.b` because the zone test
looks at the trailer axle, not the tractor.

Two switches are worth knowing about before touching balance: `tempo` scales
`vmaxKmh` *and* `ps` together (raising top speed alone makes the run-up grow
with it), and `einfrieren` blocks `speichern()` — the only safe way to play
with an unlimited wallet without overwriting a real save.

### Coordinate and scale conventions

1 world unit = 1 metre. The map is 720 × 720. Vehicle dimensions, buildings
and zones are all in real metres — a barn is ~30 m long, a tight loading zone
is 11 × 5 m. Getting this wrong once already produced buildings three times
too large.

The map used to be 3000 × 3000 and was compressed by 0.24 so a haul stopped
taking two minutes. **Only the geometry scaled; nothing with a real-world size
did.** Farms, buildings, loading zones, trailers and tractors kept their
metres, and that is what set the floor on how far the map could shrink: a
farmyard occupies about 85 m whatever the map measures, two of them need
110 m between their centres, and eleven of them then need roughly the map we
have. 0.22 was tried and two buildings no longer cleared their road. If a
future change wants the map smaller still, it has to shrink the farms first,
and a 30 m barn is a hard requirement from the brief.

Speeds are km/h in data and m/s internally. Distances are displayed via
`util.strecke()`.

### The time-scale tension

`ZEITFAKTOR` in `game.js` (game minutes per real minute, currently 40) is the
most load-bearing constant in the project. Real driving over real distances
costs real minutes; a fast clock makes a single haul swallow half a game day
and produces nonsense time windows. The brief asked for 12-minute game days
(which would be 120); that value was tried and rejected because the job board
then advertised "Zeitfenster 79 Std". Raising it again requires shrinking the
map at the same time — which has since happened once, by a factor of four, and
`ZEITFAKTOR` was deliberately *not* touched along with it. The reason is that
income per game day came out unchanged by accident of arithmetic: a haul now
costs about a third of the game minutes it did, and pays about a third as
much, because `grund` in `jobs.js` is dominated by the distance term. Moving
the clock now would break that balance without anything else moving.

Everything downstream depends on it: `jobs.fahrzeit()` converts metres to game
minutes, which sets every job's time window, which sets penalties.

### Sound

**Two engine builds.** `bauen()` picks one and both satisfy the same
interface, `setzen(umin, dreh, ladedruck, aus)` — rpm is the shared currency,
since the synthesiser derives its firing frequency from it and the recordings
their playback rate. `motorAusProben` wins whenever `js/klang_motor.js` has
been loaded and set `TG.klangMotor`; otherwise `motorSynthetisch`. Everything
below describes the synthesised build, which is what ships.

`werkzeug/klang_einbetten.py` generates `klang_motor.js` from audio files, as
base64 inside a script rather than files on disk — `fetch()` is blocked under
`file://`, and running without a server is a hard property of this project. It
also inserts the script tag into `index.html` and `werkzeug/klang.html`, and
only when a recording actually exists, so no 404 appears when there is none.
Recordings are crossfaded between rev bands weighted logarithmically; a single
recording stretched across the whole range drags the block resonances with it
and stops sounding like a machine past about 1.5x. If every sample fails to
decode, the sample build silently constructs the synthesised one and reports
its `art` as `'ersatz'` — a silent engine is the worst possible failure.

Any recording added here has to be licence-clean; the repository is published
on GitHub Pages. `werkzeug/LIESMICH.md` holds the source and licence table and
must be filled in when something is embedded.

The synthesised engine models a turbocharged inline six of roughly seven litres: 756 rpm
idle, ~2170 rpm at full load. Six cylinders on a four-stroke fire three times
per revolution, so the firing frequency is rpm/20 — 38 Hz to 108 Hz, set by
`f = 27 + 77 * dreh`. That slope exists to hit those two rpm figures at the
`dreh` values the gearbox actually produces (0.14 standing, ~1.06 under load);
changing either end means re-deriving it.

Only the numbers are modelled. No recording from any other product is in the
repository, and the manufacturer-name rule below applies to the sound docs
too — the engine is described by its layout and displacement, never named.

It is built as **excitation and body**, not as a waveform, and that split is
the whole design:

- The excitation is one pre-rendered buffer (`anregungsPuffer`) holding 360
  combustion events, six seconds of loop — a pressure hump with a rough edge
  per firing, valve ticks between them, a fixed per-cylinder scatter in timing
  and force, and on top a free per-firing scatter in force (`STREU_ZYKLUS`).
  The loop used to be 72 firings, 1.2 s, and the ear learned that pattern
  within a minute; that was half of why the engine sounded monotonous.
- The body is a parallel bank of band-pass resonators outside the buffer,
  fixed in frequency, that ring after each blow.

Everything inside the buffer is defined as a *fraction of the firing interval*,
so it scales linearly with rpm. Playing the buffer faster is therefore not
pitch-shifting, it is the correct excitation for the higher speed — which is
why one buffer covers the entire 38–108 Hz range with no crossfaded rev bands.
The resonators stay put while it speeds up, exactly as a real block does.

Revs come from a notional four-speed gearbox, so speed stays audible instead
of the pitch creeping up over a whole trip.

**Why not a harmonic stack.** Two earlier versions built the engine as a
periodic wave on the firing frequency and tried to filter the boom out
afterwards. That cannot work, and the reason is worth keeping: in a harmonic
stack the fundamental *is* the rpm cue, so it has to be present for the engine
to sound like it is turning that fast — and the fundamental at 38 Hz is
precisely the wummern. Filtering it removed the pitch along with the mud.

An impulse train has no such conflict. The ear takes the rpm from the
repetition rate of the blows (residue pitch), not from energy at 38 Hz, so
`HOCHPASS` can sit at 120 Hz (150 Hz since the rework below) and the engine
still reads as a slow-turning diesel. Measured on the current build: 0.1–1.1 % of the engine's energy is
below 90 Hz, and an autocorrelation of the output still locks onto the firing
frequency to within 0.3 Hz. The version before this had 86 % below 90 Hz.

Two consequences that are easy to get wrong:

- `MEISTER` was set twice and both times too loud. Matching the old
  oscillator's RMS gave 1.4; matching its A-weighted loudness gave the same
  figure again (measured ratio 0.83-1.22 across the rev range). It still had
  to come down to 0.55 by ear. Two reasons, both worth remembering: an impulse
  train asserts itself more than its measured level suggests, and at 1.4 its
  peaks (0.38 x master 0.7 = 0.27) crossed the limiter's 0.25 threshold, so
  the engine ducked the wind, roll and birds once per firing. Do not re-derive
  this number from a level measurement; it is a listening decision.
- `STREU_KRAFT` must stay small. Widening the per-cylinder force scatter makes
  the autocorrelation lock onto the crankshaft revolution instead of the
  firing, one third of the rate, and the engine reads as slower than it is.
  0.07 measured clean; 0.16 did not; it is now 0.05. The per-*firing*
  scatter `STREU_ZYKLUS` (0.14) does not have that problem: it never repeats,
  so there is nothing for the autocorrelation to lock onto.

**The second rework: from "too loud and monotonous" to tolerable for long.**
The player found the build above tiring to listen to. Measured against it,
three things caused that, and each has its fix:

- Energy where the ear tires fastest: 7–43 % of it sat between 1 and 3 kHz
  and 6–13 % above 3 kHz, from the valve ticks and three narrow resonances at
  1.5 / 2.7 / 4.2 kHz. Now 4–8 % and about 1 %; the spectral centroid moved
  from 780–1500 Hz down to about 400 Hz.
- Narrow resonances (Q 5–7) ring after every blow and lay a fixed tone under
  the engine that no rpm changes. The Qs are now 2–3.6.
- No dynamics. Idle was only 4 dB below full load. Gain and a new low-pass
  over the whole engine (`TIEFPASS_ZU` / `TIEFPASS_AUF`) now follow a smoothed
  throttle value `last`, passed to `setzen()` as a fifth argument the sample
  build ignores. Idle is about 10 dB quieter than before, full load about
  4 dB, and the two are 11 dB apart. A short drop in load when shifting up
  under throttle (`schaltPause`) and a small governor wobble in rpm do the
  rest.

Do not make the combustion pulse much rounder than `BRENN_ANTEIL` 0.26 /
`BERG` 0.45. That was tried (0.34 / 0.78): with nothing above 1 kHz in the
blow itself no filter can open the sound under load, and the centroid fell to
190 Hz — no more stinging, but droning instead.

These measurements came from rendering the engine in an
`OfflineAudioContext` (patch `window.AudioContext` to return one whose
`state` reads `'running'`, `eval` a fresh copy of `sound.js`, step
`schritt()`, render, FFT) — a live context stays suspended without a real
user gesture, so a console session cannot measure it any other way. The
numbers say where the energy is; whether it is pleasant is still a listening
decision.

Boost is its own state variable (`ladedruck`), keyed to throttle rather than
revs, rising over ~2.5 s and falling in ~1 s. It drives a band-pass on
noise (a pure oscillator sounds like a kettle; it sweeps 1.5–3.5 kHz, no
longer up to 7 kHz) and adds a little engine gain,
so the rig audibly leans into a load. It must stay clamped to 0..1: `dreh`
itself exceeds 1 under load. A quiet sine whine keyed to road speed (not
revs) makes it read as a moving vehicle; it was a triangle, whose overtones
stood above everything as a thin whistle. Engine, boost and whine run through
their own gain `motorBus`, which the second slider in the Buch panel sets, so
the engine can be turned down without silencing wind and birds. Three constraints worth knowing:

- The `AudioContext` must be built inside a user gesture, otherwise Chrome
  keeps it suspended. `ton.start()` only registers the wake-up listeners.
- Nothing in the excitation buffer may carry energy above `SR/2/1.8` — the
  buffer is read up to 1.8× faster at full revs and anything above that folds
  back as chirping. Hence the smoothed noise inside the bursts and the two
  one-pole passes at the end. Their start value is taken from the end of the
  buffer so the loop seam does not click.
- `KLANG` and `koerperNeu()` are exported for `werkzeug/klang.html` only. The
  game never touches either.
- Volume, engine volume and on/off live under their own localStorage key
  `landfracht_ton`,
  not in the save. Putting them in `state` would mean bumping the save
  version, and `laden()` discards rather than migrates.

### Ignition

The engine starts off — new game and loaded game alike — and `I` cranks it.
The state lives in a module-level `motor = {laeuft, anlasser}` in `game.js`
and is deliberately *not* in the save: a parked tractor is the right state to
come back to, and keeping it out means the save format stays at `v: 1`
(`laden()` discards rather than migrates).

`ANLASSER_DAUER` seconds of cranking run before the engine catches. That
countdown lives in `motorSchritt()`, exported as `zuendungSchritt()` and
called from `main.js` *outside* the `pausiert` branch — the Buch panel has a
start button, and while a panel is open `schritt()` does not run, so a starter
stepped from inside it would crank forever.

Without a running engine `schritt()` blanks `gas` but passes `bremse`,
`links`/`rechts` and `lenkZiel` through: a rolling rig has to stay catchable.
Fuel is burnt only while running, plus a trickle while cranking. An empty tank
stops the engine rather than merely cutting the throttle.

### Driving model

`Gespann` is a kinematic bicycle model: the tractor's rear axle is the
reference point, the hitch sits `KUPPLUNG` metres behind it, and the trailer
heading `th` integrates toward the tractor heading. Articulation is clamped at
`KNICK_MAX`; reversing past that point kills speed instead of letting the rig
fold through itself.

**Top speed belongs to the size of the map.** The old rule was that a loaded
rig must exceed 45 km/h, because at a 1.8 km median haul anything slower was
waiting. At a 430 m median haul that rule is gone: 40 km/h crosses it in under
a minute, and more speed would only make the trip a blink. `vmax` per tractor
in `data.js` is now 40 / 48 / 57 / 67 km/h. Four numbers move together, and
changing one alone breaks the set:

- The two penalty factors in `physics.js`: `0.92 + 0.08 * zust` for wear and
  `0.95 + 0.05 * (1 - last)` for load. They multiply, so the worst case is
  0.874 — a spent starting tractor with a full trailer runs 35 km/h. An
  earlier version cost 30 % plus 26 % here and left it at 19 km/h. Load
  belongs in the acceleration (through `masseGesamt`), not in the top speed.
- `PLANTEMPO` in `jobs.js` (24 km/h) — the speed the job board assumes when it
  sizes every time window. It is not a top speed: measured over the whole
  network the loaded starting tractor averages 28 km/h (31 on Landstraße
  alone) though it could do 38, because between two corners there is no longer
  room to reach it. The gap between 24 and 28 is the reserve out of which a
  deadline is achievable at all. It was 38 when the rig could average 44.
- Carriageway widths in `world.js`. The drive test measures how far the rig
  swings off the centreline at full throttle, and the carriageway has to be at
  least twice that. Lower top speeds are what let the widths come down to
  7 / 6.5 / 5.5 / 4.5 m; at 90 km/h the largest rig needed more than 8 m in
  places. Raise the speeds again and the roads have to get wider again, or the
  corners flatter.

Off-road speed follows from `speed` per surface in `world.js`: about 27 km/h
on a field track, 17 across open ground, for the loaded starting tractor.

The trailer only counts 0.55 towards the accelerating mass; counting it fully
modelled a rig that took over twenty seconds to get going. Drive power is
`ps * 0.20` per tonne. It was *not* lowered along with the top speeds: the
straights are short now, and a rig that pulls away lazily would never reach
cruising speed between two corners at all. Measured, the starting tractor with
a full skip takes eight and a half seconds to its 37 km/h, four and a half
empty — which is most of why it only averages 28 over the network.

Note that rolling resistance is only subtracted while coasting, never under
throttle. Top speed is therefore set by `vmax` alone, and `aRoll` can be tuned
without moving it.

Three traps that have already bitten:

- The near-zero speed deadband must not apply while throttle or brake is held.
  Per-frame acceleration from standstill is smaller than the deadband, so
  rounding to zero every frame is a silent "cannot move" bug.
- Steering lock is speed-dependent (`maxEin`). Full lock at road speed folds
  the trailer past the warning threshold in an ordinary corner. The rolloff
  (`0.16 + 0.84 / (1 + v / 4.2)`) is a function of speed alone and was left
  untouched when the speeds came down; at the new top speed of 67 km/h it
  leaves just under a third of `LENK_MAX` instead of a bit over a quarter at
  90. On a map with this many corners that is wanted, not tolerated. Raising
  the speeds again means steepening it again.
- `schritt()` takes an optional `eingabe.lenkZiel` (-1..1) that replaces
  `links` / `rechts`. That is the analogue channel the mouse steering feeds;
  the keyboard still only ever asks for full lock in one direction.

### Job generation coupling

Job quantities are derived from the *player's own* largest trailer of that
type (`eigeneKapazitaet`), capped at two loads. This is intentional: it keeps
trips short and makes buying a bigger trailer visibly raise job sizes and
pay. It also means job data is not comparable across saves.

`guete` (actual / expected pay ratio) is stored on each job and drives the
"gut bezahlt" / "mager bezahlt" labels. Do not judge pay quality from €/km —
that varies by an order of magnitude between bulk goods and vehicle transport.

### Return freight

After every completed unload, `game.rueckfracht(ortId)` calls
`auftraege.anschluss()`, which tops the location up to three offers *starting
there*. The point is that the drive home must not have to be empty. Three
things follow from it and are easy to break:

- The board itself holds 12–16 offers (`BOERSE_MIN`/`BOERSE_MAX`) and
  `BAL.maxAuftraege` is 5, not 3. Both moved together: showing a player return
  freight they are not allowed to accept is worse than not showing it.
- `anschluss()` tolerates the same route twice, `auffuellen()` does not. On
  stage 1 only bulk goods are unlocked, and a place like Feldscheune then has
  exactly one legal route — the strict rule left a single card, which is an
  instruction rather than a choice.
- A location whose `gibt` list holds nothing unlocked (Dorf, Baumarkt on
  stage 1) produces nothing, and `rueckfracht()` then stays silent instead of
  announcing an empty board.

`ui.boerse()` splits the offers on `game.naheOrt()` (within 45 m) and puts
that location's jobs in their own section at the top.

### Loading and unloading

Fully automatic. `game.vorgangSchritt()` runs every frame: it asks
`ladeChance()` whether the trailer axle sits inside a zone whose `arten`
include the trailer type, whether the rig is stationary, and whether an
accepted job matches. Zones flagged `eng` additionally require the trailer to
be aligned with the zone's long axis within ~±29°.

Progress is reported to the UI through the small event bus
(`spiel.bei(name, fn)` / `melden`). Events in use: `meldung`, `vorgang`,
`geladen`, `stufe`, `anlasser`, `motor`, `ziel`.

### Stage 3: seasons, weather, events, daily goals

All of it lives in `umwelt.js` and is stored in `state` as *new fields only*
(`wetter`, `ereignisse`, `ziele`, `stunde`, `saison`). `einrichten()` fills
whatever an older save lacks, from both `neu()` and `laden()`, so the save
format stayed at `v: 1`. Keep it that way: add fields, never rename them.

`takt(state)` runs after every advance of the clock — from `schritt()` and
from `zeitVoran()`. It catches up large jumps (repair, jerrycan, Prüfstand)
but rolls at most one event for them; four hours in the workshop should not
dump four events at once.

- **Seasons** last `SAISON_TAGE` = 3 game days, so a year is 12 days. A week
  per season was the obvious choice and would have meant four real hours per
  season — most players would never see autumn. Each season carries
  `nachfrage`, a pay factor per good that `jobs.erzeugen()` also uses,
  cubed, as the weight when it picks a good (`saisonWahl()`). It is stored on
  the job as `saison`, *separately* from `guete`, so "gut bezahlt" keeps
  meaning the customer is generous and not that it is harvest time. The
  render shows the season as a single colour veil (`SAISON_SCHLEIER`), not
  as per-season field tiles — four times the textures for something that
  reads the same at a glance.
- **Weather** changes every 2–6 game hours with a forecast (`naechste`) and a
  bias towards staying as it is. Each kind carries `tempo` per surface (into
  `vmaxKmh`), `griff` (a new `technik.griff` that `physics.js` multiplies
  onto the surface's `halt` — acceleration, braking *and* how well the front
  wheels bite), `nass` (cargo damage) and `plan` (multiplies `PLANTEMPO` for
  jobs offered *while* that weather lasts). The drive test still runs in
  sunshine; in snow and in a thunderstorm the rig is slower and its worst
  excursion actually drops (1.69 / 1.78 m against 2.11 m).
- **Events** are rolled once per game hour at `EREIGNIS_CHANCE` = 0.08, a
  little under two a day. 0.14 produced three a day and the message column
  never went quiet. A *Fest* raises pay for deliveries to one place by 30 %
  and spawns two jobs there (`erzeugen()` learned a `nach` wish for it);
  *Werkstatt* cuts repair cost by a third; *Diesel* moves the price within the
  weekly bounds; *Sonderfahrt* is one single-trip job at ×1.45 pay with a
  tight window (at ×1.6 and allowing two-trip jobs it reached 2 100 €, six
  times a normal haul); *Unwetter* (summer and autumn only) forces a storm and
  gives every running job an hour's grace. The tyre puncture is not a clock
  event: it hangs off metres driven and condition and lives in `game.js`.
- **Daily goals**: three per day, rerolled at midnight. Progress arrives
  through `zielMelden(state, art, daten)` with `'meter'`, `'abgeladen'` and
  `'fertig'`. `'abgeladen'` is reported *after* the settlement so the goal's
  message does not appear before the delivery's.

Weather messages carry no `art`, deliberately: `main.js` turns every `art`
into a signal tone, and the weather changes too often for that.

### Cargo damage

`game.ladungSchritt()` adds to `state.ladung.schaden` (0..0.8) from four
sources: lateral acceleration above `SCHADEN.querGrund × trailer.kurve`,
collisions, rumbling across open ground faster than 3 m/s, and rain on the
goods in `NASS_WAREN` unless the `plane` equipment is owned. Each trailer
type has a sensitivity in `EMPFINDLICH`. On delivery the damage is weighted by
quantity onto the job (`j.schaden`), and settlement cuts the pay in the same
proportion; above 10 % it also halves the reputation gain at twice the rate.

`querGrund` = 3.4 comes from measurement, not taste: over the whole network
at full throttle the lateral acceleration is 1.0 m/s² median, 2.2 at the
90th and 3.7 at the 99th percentile. With it, measured with the same bot as
the drive test, a full skip loses 0.4 % per 400 m flat out, a bale wagon
20 % flat out and about 1 % at 22 km/h, a pallet trailer 7 %. `querBeschl`
is smoothed over 0.25 s first — single frames reach 9 m/s² when the trailer
hits its articulation stop, and that is not cornering.

Messages fire only when the damage crosses 5, 15, 30 and 50 %; the
`hinweis` line and the red load in the tacho show it continuously while it is
happening (`ladungsZustand().grund`).

The puncture (`PANNE_PRO_KM` = 0.02, ×4 when the tractor is spent) stops the
rig dead and costs money and 40 minutes. The documented drive test does not
reset the condition, so over its seven kilometres a puncture can stop the rig
once; it simply pulls away again and the result is unaffected.

### The Einweisung (tutorial)

`js/anleitung.js` is a guided tour over the paused game, started from the
title screen (`#t-einweisung`) or from the Buch. Each step highlights an
element with a frame whose huge `box-shadow` darkens everything else, opens
real panels where needed and explains them in a card placed beside the
target. Things that are easy to break:

- A transparent blocking layer sits over everything but the card. The tour
  shows, it does not operate — a click on "Annehmen" during it would start a
  job's clock.
- `main.js` treats `laeuft()` like an open panel (`pausiert`) and ignores
  keys while it runs; the tour takes its keys in the *capture* phase and
  stops them. `titelTaste` checks it too, or Enter on the tour would also
  start the game.
- A panel that has just been opened is still sliding in. The first
  measurement waits 260 ms, then `nachfuehren()` re-measures every frame for
  800 ms and `transitionend` on `#panel` once more; one fixed delay put the
  frame beside the button on a slow machine.
- From the title screen the title is hidden (`aus`) and `titel-an` removed so
  the HUD shows, and both are restored on Esc. "Spiel starten" on the last
  step calls `losfahren()` instead.

The steps are plain data at the top of the file. A step's `ziel` is a
selector, a list of them (the hull around all), or a function returning an
element or a rectangle — `gespann()` turns the rig's screen position into
one.

### Mouse steering

Optional, off by default, toggled with `L` or in the Buch panel — and
**additive**: it never takes the keyboard away. The rig steers toward the
pointer, left button is throttle, right button is brake and reverse; every key
keeps working alongside it, and a held arrow key outranks the pointer for as
long as it is held (the unambiguous input wins when manoeuvring next to a
building).

It lives in `main.js`, next to the key table, because it is input and nothing
else needs it:

- Pointer events are bound to the **window**, not the canvas, and "is the
  pointer on the map" is read from `e.target === leinwand` rather than
  remembered from `mouseleave`. The earlier version dropped the steering
  whenever the pointer crossed an overlay and only picked it up again on the
  next move — mid-corner, that reads as broken. Overlays with
  `pointer-events:none` let the target fall through to the canvas, so the
  test costs nothing.
- `mousedown` only counts as throttle when the target is the canvas;
  otherwise clicking a header button would also open the throttle.

- `mausLenkung()` turns the pointer into `lenkZiel`. `MAUS_VOLL` (0.55 rad) is
  the offset at which it asks for full lock, `MAUS_TOT` (5 m) the radius
  around the rig where it asks for nothing — closer than that the bearing
  jumps by half turns on every twitch of the hand.
- Reversing aims the *rear* at the pointer and mirrors the lock. The same
  wheel angle turns the rig the other way when `v < 0`, so without both the
  pointer would push instead of pull.
- `mouseup` is bound to the window, not the canvas: releasing outside it would
  otherwise leave the throttle stuck.
- The preference sits under its own key `landfracht_steuerung`, for the same
  reason the sound settings do — `laden()` discards saves it does not
  recognise rather than migrating them. The coarse-pointer check only applies
  when nothing has been stored yet; on a touchscreen laptop a deliberate
  choice has to survive a reload.
- The switch exists three times — title screen, Buch panel, key `L`. All three
  carry `data-steuerart` and go through `mausSetzen()`, and `mausAnzeigen()`
  re-marks every `[data-steuerart]` button in the document, so the two panels
  cannot drift apart.
- `TG.steuerung` (`istAn` / `art` / `setzen` / `umschalten`, plus `zustand`
  and `lenkung` for inspection from the console) is the only thing `main.js`
  exports; `ui.js` uses it for the switch in the Buch panel.
- `render.js` draws the crosshair and the dashed line via `mausZiel(punkt)`,
  which `main.js` sets per frame and clears while a panel is open.
- The display-only overlays (`#tacho`, `#hinweis`, `#fortschritt`,
  `#minikarte`) are `pointer-events:none`. Without that the canvas gets a
  `mouseleave` whenever the pointer crosses one and the steering drops out
  mid-corner.

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

### Drawing the roads

Roads are drawn in **four passes, not road by road**: all Feldweg casings, all
Feldweg surfaces, all Landstraße casings, all Landstraße surfaces. Per type
the casings must all precede the surfaces, or the next road's casing lays a
dark stripe across the previous road's carriageway at every junction; across
types, Landstraßen have to finish on top. The centre dashes come last for the
same reason.

This holds in **both** renderers. `karte()` always did it; `wegeZeichnen()`,
the eye-level view, did not, and drew casing-then-surface per road. On the old
map two junctions were rarely on screen at once and it hardly showed. On the
compressed map it showed at every junction, and it was the larger half of what
looked like "the roads overlap".

The eye-level view has since grown to six layers, and the rule still holds
layer by layer. The Landstraße's white edge lines are not strokes beside the
carriageway: every road is first stroked white at `breite - 0.5`, then every
road is stroked asphalt at `breite - 0.9` on top. Because all the asphalt
comes after all the white, a road's asphalt covers the other road's edge line
at a junction, and the lines stop at the mouth of the junction the way they do
outdoors. Drawing white-then-asphalt per road would paint edge lines straight
across every junction.

The markings that must *not* cross a junction — the Landstraße centre dashes
and the Feldweg's grass strip — are drawn through a per-point mask, `w.frei`,
that `wegMasken()` computes once at start: a centreline point is not free if
another road's centreline lies within that road's half-width plus 0.8 m. The
Feldweg's wheel ruts (`w.spurL` / `w.spurR`, offset polylines) deliberately
ignore the mask; tracks crossing tracks is what a junction of field tracks
looks like.

### The eye-level look

Everything that gives the view texture is built once in `texturenBauen()` and
tiled as a pattern: grass blades, dirt, asphalt, one tile per field type, plus
a 128 px noise image stretched over the whole map for large-scale light and
dark patches. Each tile carries its size in metres and is scaled with
`pattern.setTransform()`, which pins it to the world rather than the screen —
it does not swim while driving. Where a browser lacks `setTransform` on
patterns, `muster()` returns null and the flat colours of before are used;
an unscaled tile would be one metre per pixel. All of it is seeded, so the
landscape is the same on every load.

The light comes from the top left, everywhere: shadows fall down-right,
roof slopes facing up or left are the light half, tree crowns and silos carry
their highlight top left. Change the direction in one place and it has to
change in all of them. Shadows are two flat layers, not `shadowBlur`, which
costs more per shape than the whole rest of the rig; `shadowBlur` is used
only for the one active loading zone and the edge arrow.

`beiwerkZeichnen(s, oben)` runs twice: ponds and stones before the zones,
tree crowns and bushes after the rig, with all crown shadows in one path
first so one tree's shadow does not fall across its neighbour's crown.

Dust and exhaust are a particle list that lives only in `render.js` and only
advances with `dt`, so it freezes while a panel is open. Dust spawns off the
Landstraße above 2.2 m/s; exhaust spawns while `motorLaeuft()`. Neither is
visible to the game.

Measured on the Dorf, the busiest view, a frame costs about 0.55 ms of
script time.

### The map screen

`render.js` exports one `karte(zctx, bp, hp, mitte, spanne, spiel, opt)` that
draws the whole world into *any* 2D context at any scale. The minimap and the
`karte` panel are both calls to it — there is deliberately no second
implementation, because two would drift apart. `minikarte()` is a one-line
wrapper; `ui.js` owns only the viewport (`kartenBlick` = centre plus metres
across) and the wheel / drag / button handling.

The map panel is the one panel that is not finished when its HTML string is
written: `zeichnen()` calls `karteAufbauen()` afterwards, which finds the
canvas, hangs the pointer handlers on it and draws. It has to run every time,
because `zeichnen()` replaces `#panel-inhalt` wholesale and the previous
canvas — handlers and all — is thrown away with it. The canvas also has no
size until it is in the document, so the backing store is sized inside
`malen()`, not when the element is created. There is no frame loop: the clock
is stopped while a panel is open, so the map is redrawn only on input.

Three things it does that are easy to lose in a rewrite:

- **Line widths have a floor in pixels.** At minimap scale (230 px over
  720 m) a 7 m road is 2.2 px wide and a 4.5 m track 1.4 px. On the old
  3000 m map the same road came out at 0.77 px — not a thin road, no road at
  all — which is where the floor comes from. It binds less now but still
  binds for the field tracks. Each width is
  `max(breite_in_metern, floor_in_pixeln / m)`.
- **Roads are drawn in four passes**, as described under *Drawing the roads*
  above. That rule applies here and in the eye-level view alike.
- **`namenSetzen()` drops labels rather than stacking them.** It keeps a list
  of occupied boxes in screen space and skips any label that collides,
  working through the places in priority order — job target, then the player's
  own farm, then the rest — so the one you are looking for is the last to go.
  Near the right edge the label flips to the other side of its dot. On the
  230 px minimap all eleven currently fit; that is luck, not a guarantee, and
  the compression nearly cost it — Tankstelle dropped out until the filling
  station was moved from 71 m to 90 m away from the Dorf. If a location has to
  move, check the minimap afterwards.

Font size follows the canvas (12 px above 420 px wide, else 9), the short or
long form of the name follows the scale (`m > 0.35` px/m gives full names).
Those are two different questions and conflating them once produced 9 px
abbreviations on a 730 px sheet.

Two naming traps in `ui.js`: `karte()` was already taken by the job-card
renderer, so the map panel builder is `kartenblatt()`; and `.karte` is the
job-card CSS class, so the panel's wide modifier is `#panel.breit`.

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

The site is live. `origin` is `TwoNoice/landfracht` and GitHub Pages serves
the default branch, so a push publishes straight away — there is no staging
step. `index.html` names that address three times over, in `canonical`,
`og:url` and `og:image`; moving the repository means editing all three.

### Save format

One localStorage key, `landfracht_v1`. The whole `state` object is serialised
as-is, plus the rig position. `laden()` refuses anything whose `v` field is
not 1 — bump that and the old save is discarded rather than migrated. New
fields are fine: stage 3 added five, and `umwelt.einrichten()` plus two
defaults in `laden()` fill them in for older saves.

## Conventions

Identifiers, comments and UI strings are German, using farming vocabulary
rather than software vocabulary (`Ladung`, `Zustand`, `Ankoppeln`,
`Gespann`, `Anhänger`). Keep new code in the same register. Comments explain
*why* a value or guard exists, not what the line does.

Balance constants are collected so they can be found: `BAL` at the top of
`game.js`, `TARIF` at the top of `jobs.js`, the steering constants at the top
of `physics.js`.

`README.md` carries a good many of the same numbers — `ZEITFAKTOR`, the `vmax`
list, `PLANTEMPO`, `AUSSCHLAG_NENNER`, the network's length — in German and
for the player. **Change one of those and change it in both files.** They have
drifted apart before.

No real machinery manufacturer names anywhere — this is a hard requirement
from the brief.

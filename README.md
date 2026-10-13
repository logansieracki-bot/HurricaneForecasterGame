# Hurricane Forecaster Game

Basin hurricane simulation / forecasting game. Long-term goal: pick a basin and a
mode from a main menu, then either watch storms form and experiment with the
ocean (Simulation mode) or run a real forecasting desk — hunters, models, cones,
AOIs (Forecaster mode, not started yet).

**Phase 1 (in progress): Atlantic SST simulator + main menu shell.** See
`docs/roadmap.md` for what's next.

**Play it live:** https://logansieracki-bot.github.io/HurricaneForecasterGame/
(redeploys automatically after every push to `main` that passes tests — see
Deployment below).

## Commands
- `npm install` (Leaflet is vendored, not an npm dep — see Layout — but `playwright`
  for tests needs installing)
- `npm run build` assembles `dist/atlantic-sst-simulator.html` from `src/template.html`
  + `vendor/leaflet` + `data/generated/data.json`
- `npm test` end-to-end checks in headless Chromium (network stubbed to `file://`
  only, so it also proves the app never depends on reaching a live tile provider).
  Needs a Chromium build matching the installed `playwright` version — if you're
  in a sandbox with a pre-provisioned but differently-versioned browser, point
  `tests/run.mjs` at it with `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm test`;
  otherwise `npx playwright install chromium` once and just run `npm test`.
  CI (`.github/workflows/test.yml`) builds and runs this on every push/PR and
  uploads the built HTML as a downloadable artifact.
- `npx http-server .` (or any static server) to try `index.html` → basin/mode
  select → the built simulator

## Deployment
`.github/workflows/test.yml` has a second job, `deploy`, that publishes
`index.html` + the built simulator to GitHub Pages after `build-and-test`
passes on a push to `main`. One-time setup this repo needs (can't be done from
a workflow file): **Settings → Pages → Build and deployment → Source: "GitHub
Actions"**. After that, every green push to `main` redeploys
https://logansieracki-bot.github.io/HurricaneForecasterGame/ automatically —
nothing to run by hand.

## Layout
- `index.html` main menu: basin select + mode select. Only Atlantic / Simulation
  are wired up; every other card is present but disabled ("Coming soon").
- `src/template.html` the Atlantic simulator app: vanilla JS in one IIFE, three
  build placeholders (`/*__LEAFLET_CSS__*/`, `/*__LEAFLET_JS__*/`, `/*__DATA__*/`).
  `window.SSTSIM` is the test/debug hook.
- `vendor/leaflet/` Leaflet 1.9.4 CSS/JS, vendored verbatim (not fetched at build
  time, so the build has no network dependency either).
- `data/generated/data.json` the embedded climate + geography + imagery data the
  build stitches into the template. Committed for now (see Known gaps).
- `tools/build.mjs` the build script.
- `tests/run.mjs` the test suite.
- `docs/roadmap.md` what's next, basin by basin.

## How the simulation works (keep these ideas when changing things)
- Grid: 0.25° over lon -110..40, lat -40..72 (601×449). Time: 1 sim hour per 60 ms
  at 1×; starts June 1 00Z of the current year.
- SST = real ERSST v5 1991–2020 monthly climatology (2°, upsampled bicubic,
  Catmull-Rom in time) + hand-tuned features the coarse data can't show (Gulf
  Stream ribbon + cold wall, Loop Current + shed eddies, NW Africa/Iberia/
  Benguela/Venezuela upwelling, Northeast-shelf and winter shelf cooling, Gulf
  fall warm pool) + interannual anomalies (14 EOFs, daily AR(1)) + ENSO
  (stochastic oscillator calibrated to observed Niño 3.4, Atlantic response
  fitted by ridge regression at lags 0/3/6 months) + user experiment sliders.
- "Normal" (`normal[]`, the vs-normal view) excludes anomalies, ENSO, and Gulf
  Stream path shifts/eddies.
- Realism guards (do not remove): `seaCeil(lat)` latitude ceiling on SST (rises
  with the warming slider); anomaly soft-limit at ~3.5 °C; summer heat saturates
  when the seasonal swing is stretched; shelf effect only cools.
- Seeds fix the random year and nudge seasonal swing / currents / ENSO strength
  by roughly 10–35% (checkbox turns it off).
- Humidity (all 9 basins): 700 hPa relative humidity, same shape as SST (real
  ERA5 2007–2021 monthly climatology + its own 6 EOFs/ENSO fit), a third
  option in the Temperature/SST Anomaly view toggle. Only `variability`/`enso`/
  `synoptic` drive it (not `warming`/`seasonal`/`features` — see
  `tools/make_humidity.py` and the humidity combine loop in `computeField()`
  for why). Data comes from the public ARCO-ERA5 archive on Google Cloud
  Storage, not NOAA directly (see `climate_lib.py`'s `load_era5_rh700()`).
  Also carries real day-to-day ("synoptic") weather noise on top of the
  monthly climatology — a per-cell AR(1) process at each cell's own real
  measured amplitude/persistence (not a shared EOF pattern; a real spectrum
  check found this field doesn't decompose into a few dominant modes the way
  interannual variability does — see `tools/make_humidity_synoptic.py`),
  driven by its own `synoptic` slider since real SST doesn't swing day to day
  the way mid-level humidity does. The "favorable for development" `key`
  threshold and color-stop spacing are calibrated per basin against that
  basin's own real peak-season p75 RH (not copied from Atlantic's 58%) —
  East Pacific 53%, West Pacific 68%, North Indian Ocean 63%, Australian
  Region 67%, South-West Indian Ocean 58%, South Pacific 54%, South Atlantic
  59%, Mediterranean 49% — each using that basin's own real hemisphere-
  appropriate cyclone season (Southern Hemisphere basins and the bimodal
  North Indian Ocean do not share the Atlantic's Jun–Nov window).
- Wind Shear (Atlantic only): 200–850 hPa deep-layer vertical wind shear in
  knots, the standard NHC/SHIPS definition, a fourth option in the view
  toggle. Climatology + EOF interannual variability + ENSO regression (real
  ERA5 2007–2021 monthly data, its own 6 EOFs/ENSO fit), driven by
  `variability`/`enso` (see `tools/make_shear.py` and the shear combine loop
  in `computeField()`). Averages `u_component_of_wind`/`v_component_of_wind`
  at 200/850 hPa over each month *first*, then takes the vector-difference
  magnitude once (not the other order — checked directly, deriving the
  magnitude per 6-hourly reading and averaging *that* instead runs 5–17 kt
  high everywhere sampled and makes low-shear hurricane season look falsely
  hostile; see `climate_lib.py`'s `load_era5_shear()`). `key: 20` (kt) is the
  real NHC/SHIPS "low shear" threshold, confirmed against real data as a
  genuine, roughly 44/56 split in the MDR/Caribbean/Gulf during peak season,
  not stuck on one side. Color polarity is the opposite of Humidity's own:
  low shear is favorable here. Phase 1 on its own has no jet-stream layer —
  ENSO drives the field's values (the real teleconnection, confirmed both in
  the raw ERA5 regression and with a live end-to-end test forcing El Niño vs.
  La Niña), the same way Gulf Stream physics drive SST with no current layer
  of its own. The explicit jet described below was added on top of it.

  Also carries an explicit, continuous **jet stream**: a ribbon of strong
  shear that is always there, meanders (ridges and troughs), and shifts day
  to day. A statistical noise field can't do this — the first version (an EOF
  of the shear *values*, then per-cell noise) was built, rendered, and read as
  scattered patches rather than a flowing band, because the thing that's
  actually coherent in the real data is the jet's *position*, not the shear
  value at each point. Checked against 5 years of daily ERA5 (Jun–Nov): trace
  the jet axis each day (latitude of peak shear at each longitude), and that
  path's own wave modes carry 73% of its variance in just 8 modes (vs. 31% at
  k=6 for the raw field) — so the axis is driven by those 8 modes around the
  real mean path (~35–46°N): their shapes and amplitudes are the real ones,
  while how fast they evolve is deliberately calmer than the data (see "How
  the jet moves" below). The
  ribbon's cross-section is the real axis-following profile (+39 kt at the
  axis, ~0 by 10° away). Because the monthly climatology already contains a
  blurred copy of the jet, the client subtracts that smear from the
  climatology and draws the ribbon back in where the axis actually is, so the
  field's long-run average still equals the real climatology while any one
  day shows a sharp band over a quieter background (see
  `tools/make_shear_jet.py` for the derivation and the real numbers). Local
  weather texture (`tools/make_shear_synoptic.py`) is fit on what the jet
  *doesn't* explain and drawn at half weight (`SHEAR_TEXTURE_GAIN`, a
  legibility choice, not a fit) so the ribbon isn't buried in clutter.

  ENSO reaches the jet through the one channel verified in the real data:
  the ribbon rides on top of the Phase 1 climatology+ENSO background, so El
  Niño's higher shear lifts the whole field including the jet. The axis's own
  latitude showed essentially no ENSO signal (daily correlations 0.0–0.17), so
  nothing is invented there. Its own `Day-to-day weather (wind shear)` slider
  (`P.shearSynoptic`) scales how far the jet strays from its mean path (and
  the texture); at 0 the jet is still there, just parked.

  The axis is soft-limited to 20–64°N, the band the real axis was traced in
  (and piles up against both edges of: 11–16% of real days sit within 4° of the
  floor at −40..0° lon). The simulated axis is a sum of Gaussian wave modes with
  the real spread, so unlimited it wandered out to 1°N and 85°N in testing —
  which would also have dragged the ribbon over the equator (see `limitJetAxis`).

  **How the jet moves.** The real axis is the per-column *maximum of shear*, so
  its higher modes mostly record which of several competing shear maxima is
  strongest on a given day: modes 2–8 have daily lag-1 autocorrelations of only
  0.25–0.63, and the axis moves a median 2.8°/day (90th percentile 21°). A
  continuous-ridge tracer gives the same (2.6 / 17), so that's the shear
  maximum's real behaviour, not a tracing artefact — but played at 1× (a day
  every 1.4 s) a simulation faithful to it thrashes: 3.9°/day median, a new
  random direction every midnight (straight segments between daily snapshots),
  and a redraw only every ~360 ms. So the timing is deliberately not the
  data's. The whole evolution is dilated 2.5× (`JET_DILATION`): the leading
  mode's real 6-day e-folding becomes ~15 days (0.85 → 0.94/day), every other
  mode is floored at that same 0.94 instead of flickering every day or two,
  and the samples between days are a Catmull-Rom cubic, so position *and*
  velocity are continuous. Measured on the simulation: 1.6°/day median (was
  3.9), 0.45° per 6-hour redraw (was 1.3), and the hourly second difference —
  the size of a direction change — peaks at 0.02–0.05°/h² on 40 seeds (the old
  version: 1.0–1.1).

  It also **flows east**, which the real data supports and a standing pattern
  can't do: for two longitudes 10–40° apart the cross-correlation of axis
  anomalies peaks 0.6–2.9 days later at the eastern one — a steady 14–17°/day
  at every separation. Each column therefore reads the mode amplitudes with a
  delay proportional to how far east it is (`jetDelayC`; 15°/day dilated to
  6°/day), so a change shows up downstream a few days later, like real
  downstream development of troughs and ridges. Delaying a stationary series
  leaves its distribution at every column untouched, so the real per-column
  spread (and the smear derived from it) is unchanged; the simulation's lagged
  correlations peak at +2, +3 and +5 days for 10, 20 and 30° apart (design:
  1.7, 3.3, 5.0). The delay does roughen the curve along longitude (the modes
  are only smooth in space when combined at the same time), by ~35%, so one
  light [1 4 6 4 1]/16 pass along longitude follows it, costing 1.8% of the
  amplitude (per-column spread 8.54 → 8.39°) and leaving the curve's kinks
  ~25% smaller than before the delay existed. The jet has its own clock and random stream: a seed gives the
  same jet however a run is chunked or how fast it's played, and the
  `Jet stream speed` slider (`P.jetSpeed`, default 1×, 0 = frozen) rescales the
  jet's time itself — 2× for 5 days is exactly 1× for 10 — so moving it never
  makes the jet jump.

  **Jet stream line (every view).** `Customization → Jet stream line` draws a
  line along that same axis (`jetAxisFinal`), off by default. It sits on the
  crest of the ribbon in the Wind Shear view and marks where the jet is in
  Temperature / SST Anomaly / Humidity too. It lives on a canvas of its own
  (`drawJetLine`), not in the field raster, so it doesn't depend on the selected
  view or on "Show sea temperature", and it crosses land (the jet is atmospheric,
  not oceanic). Magenta with a dark casing rather than white, so it can't be
  mistaken for the white threshold/contour lines or borders. That canvas is
  re-stroked from the live jet clock on every animation frame while playing
  (76 points: free), so the line glides at the display's frame rate; the shear
  raster beneath it costs 50–70 ms to redraw, so it updates every 3 simulated
  hours up to 2× (6 above), paced so redraws never take more than ~40% of the
  main thread, and trails the line by at most that much.

## Imagery
The "Blue Marble" theme is a crop **embedded in the build** (`data.bm`, drawn on
a canvas, Mercator-correct per scanline) — always available, zero network
dependency, zero load-time variance. Above zoom 6.6 it optionally fades in live
Esri imagery for closer-up sharpness (opt-in "Sharper imagery" checkbox, silently
skipped if it can't load). The "Satellite" theme is that same live Esri imagery
full time; if it can't load, it falls back to Blue Marble automatically.

This replaced an earlier design that chained through 4 live tile sources (NASA
GIBS + mirrors) before falling back — reliable when it worked, but failed or hung
often enough to be the main visible complaint. `npm test` includes a network-off
check that Satellite still resolves to something usable.

## Known gaps
- **No data pipeline yet.** `data/generated/data.json` was extracted from a
  previously-built file, not generated from raw sources — there's no
  `tools/make_climate.py` / `tools/make_geo.py` / `npm run fetch` in this repo
  yet. Until that pipeline exists, treat `data/generated/data.json` as a
  checked-in asset, not a regenerable build artifact.
- Domain is the North Atlantic basin only; SST south of the equator and in the
  Mediterranean/Black Sea is intentionally masked out (they're future basins).
  ENSO changes SST and humidity in all 9 basins, but wind shear (climatology +
  EOF + ENSO + its own day-to-day synoptic noise) is still Atlantic-only.
- ERSST at 2° is warm-biased in coastal cells; several corrections are hand-tuned
  (see the shelf, Northeast shelf, Gulf Stream blocks in `src/template.html`).
- Only Atlantic + Simulation mode are wired up in the main menu. The other 8
  basins are listed but disabled ("Coming soon") — see `docs/roadmap.md` for
  order; Forecaster mode hasn't been started.

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
  low shear is favorable here. No jet-stream visualization — ENSO drives the
  field's values (the real teleconnection, confirmed both in the raw ERA5
  regression and with a live end-to-end test forcing El Niño vs. La Niña),
  the same way Gulf Stream physics drive SST with no current layer of its
  own.

  Also carries real day-to-day ("synoptic") shear noise on top of the
  monthly climatology — upper-level trough passages and jet streaks, the
  things a monthly mean can't show and that make the climatological-only
  field read as too static/diffuse to look like a real jet. Unlike
  Humidity's own synoptic layer (pure per-cell AR(1) — its real spectrum is
  flat), shear's real daily anomalies (checked against 5 years of ERA5,
  restricted to Jun–Nov) showed a genuine EOF elbow — a coherent,
  jet-latitude-shift-like mode 1 alone explaining 14.3% of domain variance —
  so this is a hybrid: a 15-mode EOF component (`shearSynEofC`/`shearSynPhiC`,
  already-daily phi) plus a per-cell AR(1) residual on the leftover variance
  (`shearSynResidStdC`/`shearSynResidPhiC`, fit on anomaly-minus-EOF-
  reconstruction so the two layers' variance isn't double-counted) — see
  `tools/make_shear_synoptic.py`. Its own `Day-to-day weather (wind shear)`
  slider (`P.shearSynoptic`), separate from Humidity's, since the two
  fields' day-to-day noise is mechanistically distinct, confirmed by the
  very different real structure each one's own build script found. Drawing
  each coarse (2°) cell's own daily random shock fully independently (the
  same simplification Humidity's own synoptic layer uses) looked like pure
  static once actually rendered here — real shear anomalies correlate
  +0.69 to +0.94 at 2–5°, a real local coherence an independent-per-cell
  model throws away entirely, and upsample()'s own bicubic smoothing can't
  manufacture correlation between coarse samples that were never correlated
  to begin with. Fixed with an exactly variance-preserving separable
  smoothing pass on each day's random shock before use (see the
  `smoothedShearInnovation()` comment in `src/template.html`), calibrated to
  the real measured correlation length, not guessed.

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

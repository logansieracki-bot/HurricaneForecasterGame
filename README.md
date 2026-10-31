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
- `npm test` first the node-only storm-engine tests (`tests/storms.mjs`, about eight seconds, no build or
  browser needed), then the end-to-end checks in headless Chromium (network stubbed to `file://`
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
- `index.html` main menu: basin select + mode select. All nine basins run in
  Simulation mode; the Forecaster card is present but disabled ("Coming soon"). With an Atlantic season
  saved in the browser it also has a Continue card (beside the picker on a wide screen, above it on a phone).
- `src/template.html` the Atlantic simulator app: vanilla JS in one IIFE, build
  placeholders (`/*__LEAFLET_CSS__*/`, `/*__LEAFLET_JS__*/`, `/*__DATA__*/`,
  `/*__STORMS__*/`, and for the storm layer `/*__STORM_HOOKS__*/`, `/*__STORM_LATE__*/`,
  `/*__STORM_CSS__*/`, `<!--__STORM_HTML:name-->`, `{{BASIN_LABEL}}`).
  `window.SSTSIM` is the test/debug hook. `src/template-<basin>.html` are the other
  eight basins' versions of the same app (per-basin constants and data; the steering
  and shear blocks are ported between them by script, see `docs/roadmap.md`).
- `src/storm-hooks.js`, `src/storm-summary.js` (the season summary card), `src/storm-late.js`, `src/storm-ui.css`, `src/storm-ui.html` the storm layer's page code, ONE copy for
  all nine pages (the build inlines it at the placeholders above): the storm grid (the engine's own, lighter copy of the environment),
  the keyframes and the clock, lakes as water, the drawing, hover and click cards, Place mode, the season bar and summary, and the
  save / resume. A template only says which basin it is (`const STORM_BASIN`) and how to read and set its ocean-feature state
  (`featState`); `tools/port_storms.mjs` ported the rest of the Atlantic's storm-era edits (the 1-degree storm grid, the lazy
  synoptic up-sampling, the features split) into the other eight templates once (`--check` proves it reproduces the Atlantic's).
- `vendor/leaflet/` Leaflet 1.9.4 CSS/JS, vendored verbatim (not fetched at build
  time, so the build has no network dependency either).
- `data/generated/data.json` (Atlantic) and `<basin>-data.json` (the others): the
  embedded climate + geography + imagery data the build stitches into each template.
  Committed (see Known gaps); `tools/` has the pipelines that make them.
- `src/storms.js` the storm engine (waves, tropical / subtropical / extratropical cyclones, lows,
  names, ACE): pure JS with no DOM, inlined into the pages through `/*__STORMS__*/` and loaded as-is by
  its node tests.
- `src/storm-nest.js` the 2-km storm-scale nest behind the **radar floater** (a moist-convective vorticity model on a 256 x 256 grid of 2 km cells, the
  radar operator, the cirrus and the infrared brightness temperature, the forcing of a system from the engine, the land and environment grids): pure JS with no DOM, inlined after the engine through
  `/*__STORMS__*/` and loaded as-is by `tests/nest.mjs`. `src/storm-floater.js` is the floater's page half (its clock, the radar and the infrared picture, the coastline, the radar sites and products), inlined in front of the hooks.
- `tools/build.mjs` the build script.
- `tests/nest.mjs` the nest's node tests (physics, the radar operator, the weather on a storm's sides, the engine's forcing and look-ahead; run by `npm test` after the engine's);
  `tests/run.mjs` the browser test suite; `tests/storms.mjs` the node-only storm-engine tests (run first by
  `npm test`; they need no build and no browser) with synthetic environments in `tests/storms_env.mjs`.
- `docs/roadmap.md` what's next, basin by basin. `docs/storms-plan.md` is the approved design of the storm system (tropical
  waves, lows, cyclones, names, ACE, season stats, save/resume).
- `tools/make_tc_ref.py` + `data/generated/atlantic-tc-ref.json`: the real Atlantic best-track statistics the storm engine is
  calibrated and tested against (1991-2020 normals, daily ACE bands, genesis, rapid intensification, wind-pressure, ENSO).
  `tools/make_tc_maps.py` + `atlantic-tc-maps.json`: the real maps the engine is anchored to (where and when tropical and subtropical
  cyclones form, how each kind of system drifts, landfalls by region, track density); `tools/make_tc_validate.py` +
  `atlantic-tc-validate.json`: what the simulated tracks are checked against (residual motion, 2- and 4-day displacements, reach,
  loops, the fate of depressions by latitude); `tools/make_tc_et.py` + `atlantic-tc-et.json`: how real storms become extratropical (the rate as a
  function of latitude, sea temperature, shear and the storm's own wind, the wind kept through the change, the length of the post-tropical track, the remnant lows) with
  `tools/storm_et.mjs` computing the same statistics for the simulated storms; `tools/make_tc_ri.py` + `atlantic-tc-ri.json`: how often real storms gain 30 / 50 / 65 / 80 kt in 24 hours,
  by sea temperature and by the wind they start with (IBTrACS 1980-2021 with the monthly ERSST at the point), with `tools/storm_ri.mjs` computing the same table for the simulated storms; `tools/make_tc_env.py`, `make_tc_motion.py`, `check_lows.py`: the environment, motion
  and pressure-low references. `tools/storm_fit.mjs` fits the engine's maps to the page's own weather (`clim`, `wet`, `fit`, `rescale`, `refine`, `motion`, `maps`;
  result `atlantic-tc-storm-maps.json`, merged into `data.json` under `storms.maps` by `merge_data.mjs --storm-maps`; the real normals and daily ACE
  percentiles the season summary draws against go in beside them as `storms.ace` / `storms.normals` with `merge_data.mjs --storms`),
  `tools/storm_mc.mjs` runs whole seasons through the built page (any number of parameter sets at once, same weather),
  `tools/storm_opt.mjs` calibrates the intensity law and the environmental coupling with CMA-ES, `tools/storm_validate.mjs`
  checks tracks, landfalls and genesis against the real best track, and `tools/storm_mutants.mjs` breaks the storm code in 333 ways, one at a time, and runs the
  checks that should notice (all 186 are caught; `docs/roadmap.md` has what the passes found and how the checks were changed).
  The other eight basins' storm climatology is made by the same chain with a basin name: `tools/tc_basins.json` (the table: page, season, grid, hemisphere ...), `tools/storm_region.mjs`
  (which cells of a page are inside its basin and land for a storm), `tools/make_tc_basin.py` (the real targets and maps of the storms that form inside a page, by wind), `tools/storm_fit.mjs --basin`,
  `tools/storm_basin.mjs` (whole seasons of any basin against its reference), `tools/storm_basin_opt.mjs` (the CMA-ES calibration of a basin's intensity law, its `--rescore` on fresh seasons and `--resume`),
  `tools/storm_basin_scan.mjs` (one parameter of a result at a time) and `HF_DIST=<dir> npm run build` for a lab build beside a test run. The South Atlantic and the Mediterranean have no best-track record to fit: their targets are
  written in `tools/tc_synthetic.json` with their sources and `tools/make_tc_synthetic.py` makes their reference and maps from it. The storm engine reads the page's humidity and shear, so the year-to-year
  part of those two fields has to be right in the cyclone season: `tools/make_env_seasonality.py` refits their El Nino coefficients jointly and fits a gain for each calendar month on the El Nino part and on the EOF modes
  (the seven pages other than the Atlantic and the East Pacific carry it, `humidity.seas` / `shear.seas` in their data; `tools/merge_data.mjs <basin> --env-seas`).

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
- Experimentation panel (all 9 basins): two tabs. **Basic** = `Set ENSO now`, `Keep ENSO at this value`,
  `Warming`, `Moisture (average humidity)` and `Wind shear (average)`; **Advanced** = year-to-year variability,
  both day-to-day weather sliders, weather speed, seasonal swing, currents and upwelling, El Niño / La Niña
  influence, the seed-nudge checkbox and the steering arrows' `Storm strength` selector. The seed row (Seed,
  New seed, Reset) sits under both tabs; `Customization` is separate and unchanged. The two new sliders shift
  the *average* everywhere the way `Warming` does for sea temperature (`P.moisture`: −20..+20 points of 700 hPa
  relative humidity; `P.shearShift`: −20..+20 kt of 200–850 hPa shear), added inside the combine loop before the
  soft limits, so they move the weather and the jet's ribbon along with the average. The limits are now smooth
  squeezes that keep humidity inside (0, 100) % and shear above 0 kt at any slider value — the old ones let the
  unshifted field reach −2 kt shear in up to 20.5 % of a basin's cells and RH below 0 or above 100 in up to
  6.7 % and 3.1 % (numbers in `docs/roadmap.md`).
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
- Wind Shear (all 9 basins; the next paragraphs describe the Atlantic's, the other eight are at the end of the section): 200–850 hPa deep-layer vertical wind shear in
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

  **The other eight basins** carry the same system. The client code is the
  Atlantic's, ported by script (every block lifted from `src/template.html`,
  every anchor matched exactly once), so the per-basin differences are data and
  a few constants. Each basin's jet statistics come from its own cyclone season
  (the months its humidity uses) and its climatology/EOF/ENSO fit from its own
  box. What had to be generalized: (1) the jet search band is a signed latitude
  interval — 20–65°N, or 65–20°S for the four southern basins (`limitJetAxis` and
  `JET_AXIS_LO/HI` work in either sign). (2) Most boxes do not contain the jet,
  so `tools/make_shear_jet.py` traces the axis, and measures the ribbon
  cross-section and the smear, on an *analysis* box (the displayed longitudes,
  latitudes extended to cover the band plus the ribbon's 12° reach) and cuts only
  the smear back to the displayed rows. How often the axis is inside the displayed
  area: Atlantic 100%, West Pacific 97%, Australian 84%, East Pacific 76%,
  South-West Indian 73%, South Pacific 72%, South Atlantic 63%, North Indian 55%,
  Mediterranean 25%. A jet outside the box still throws its flank across the edge;
  and when the whole axis is off the map — or just not in what is on screen,
  zoomed in away from it — the `Jet stream line` option says so ("· north/south
  of this area today", "· north/south of what is on screen") instead of looking
  broken. The line also fades over the last 2° at the top and bottom of the
  simulated area. With
  `--no-extend` the generalized scripts reproduce the Atlantic's shipped data
  byte for byte, and `tools/build_shear_all.sh` rebuilds the other eight basins'. Measured per basin: the eastward speed of axis anomalies (EPAC
  13, WPAC 14, NIO 11, AUS 15, SWIO 19, SPAC 16, SATL 16, MED 21°/day;
  `JET_DRIFT_REAL`), the share of the axis's variance that 8 modes carry
  (80–91%, Atlantic 73%), and the ribbon (peak +38.5 to +47.5 kt, Atlantic +39.5).
  The colour scale is the same absolute-kt stops everywhere (a colour means the
  same shear in every basin), stretched to 140 kt in the West Pacific and 120 kt
  in the North Indian Ocean where the real monthly jet core exceeds the
  Atlantic's 110. Averaged over many seeds the simulated field reproduces the
  real climatology to within 1 kt over each basin (3.3 in the Mediterranean) and
  within 4 kt near the jet (5 in the Mediterranean), where without the ribbon it
  would read 7–19 kt low; see `docs/roadmap.md` for the numbers, the ENSO checks
  against the documented teleconnections, and the caveats.

- ENSO hold: a checkbox next to `Set ENSO now` ("Keep ENSO at this value") pins Niño 3.4 at the value on the
  slider instead of letting the oscillator move it away (the gauge says "· held"). The 3- and 6-month lagged
  terms are held too, so the fields get the event's full response once six months have passed, and it survives
  restart and a new seed. Same code in all nine basins.
- Steering flow and highs (all nine basins): `Customization → Steering arrows` draws
  arrows whose direction is where the flow pushes a storm and whose colour is its speed (0–70+ kt, own legend),
  for one of three layers picked with `Storm strength` (weak 850–700 hPa, medium 850–500, strong 850–200 hPa —
  the standard BAM family); `Highs (H) with sea-level pressure` marks every high with an H and its central
  pressure. Both work over every view, like the jet line, and the hover readout gains the heading, speed and
  pressure. One field on a 4° grid (`DATA.steer`, bicubic), three parts. (1) The slow part is the usual recipe:
  real ERA5 2007–2021 monthly climatology of the layer winds *and* sea-level pressure, one joint EOF set (so the
  patterns keep the real coupling between a high and the flow round it; `variability`), an ENSO response whose
  three lags are fitted *together*, and a seasonal amplitude for the EOF part — the real year-to-year spread of
  the deep-layer wind at 25–35°N is 3.4 kt in August and 11.4 in February, where pooled EOFs would give both
  5.6–6.1. (2) The jet ribbon: a westerly stripe along the same simulated axis that draws the jet line and the
  shear ribbon, pointing along the axis' local direction, minus the mean ribbon that jet produces (measured on
  the built page, `tools/calibrate_steer_means.mjs`) so the climate mean stays the real one. (3) Pressure
  weather: travelling highs and lows whose size, speed and strength by latitude band and month are the measured
  ones, whose geostrophic wind (times the fitted coupling, 0.7–0.8 poleward of 35°) drives the winds, so the
  arrows circulate round each high (12–14 kt eight degrees out; real 11.7), plus a rotational residual flow for
  what no surface pattern explains, sized so the whole budget — year-to-year plus day-to-day variance, per
  calendar month and node — is the real one (simulated/real standard deviation 0.96–1.08 over four seasons ×
  four latitude bands). The highs are the maxima of the total pressure (at least 1017 hPa, 2.5 hPa above their
  surroundings, outside 15°), found on the node grid and refined with a parabola; both semi-permanent highs
  (the climatology and EOFs) and migratory ones (the travelling pressure field) come out of the same field. The
  weather runs on the jet's own dilated, slider-scaled clock, and `Day-to-day weather (shear, steering, highs)`
  is the one slider for all three; steering has its own random stream, so adding it changed nothing else a seed
  does. `tools/build_steer_all.sh` lists the pipeline; `docs/roadmap.md` has the numbers and the caveats.
  The eight basins after the Atlantic run the same client (the steering block is lifted out of `src/template.html`
  by script, so the nine pages are identical apart from per-basin constants and the box edge: the arrows fade over
  the outer 6° of the simulated area, and the South Pacific's box across the date line is read in its own 160..240°
  frame) on their own data. Each one's real-data checks come from a spec entry (`STEER_SPECS` in `tests/run.mjs`):
  mean winds and pressure within sampling noise of the real climatology, simulated/real standard deviation of the
  deep-layer winds 0.92–1.16 over month × latitude-band cells (1.30 in one summer cell of the North Indian
  Ocean, see the caveat in `docs/roadmap.md`), highs a day within a few tenths of the real count month by month,
  the El Niño response in the sign the real data have. The ribbon and the per-latitude statistics are measured on an
  analysis box wider than the displayed one (most boxes do not contain the jet), like the shear jet.
- Storms (step 1 of the 7-step storm roadmap in `docs/storms-plan.md`; the Atlantic was the test basin and all nine pages have them now: a page carries the same code
  whichever basin it is and its storms switch on when its data file holds the climatology the engine is
  anchored to (`storms.maps`, `STORMS_READY` in `src/storm-hooks.js`); a page without one shows none of the storm controls and runs the
  plain simulation, and the tests make one to check that). `src/storms.js` is the engine (pure JS, no DOM) and `src/storm-hooks.js` / `src/storm-late.js` (see Layout)
  are everything that connects it to the page. **Systems:** the precursors are one lifecycle: a tropical wave (dashed line) or a
  low (a red `L`) that has the potential to become a cyclone is an *area of interest* (the outlook, below), which turns into a
  depression; then tropical depressions / storms / hurricanes (circles coloured by the 1-minute wind in Saffir-Simpson steps, the same on every page, and named in the basin's own intensity
  scale: Typhoon and Super Typhoon, Very Severe and Extremely Severe Cyclonic Storm, Intense Tropical Cyclone, Category 3 Severe Tropical Cyclone ...; `SCALES` in `src/storms.js`, below),
  subtropical depressions / storms (squares) and extratropical / post-tropical cyclones and remnant or other non-tropical lows (grey triangles), each with a track of advisory dots every three hours
  (big at the synoptic 00 / 06 / 12 / 18Z, small between, so a peak that comes and goes in a few hours still shows), a white dot where it
  became a depression, and a name label; the waves, lows, areas of interest and name labels are toggles under `Customization`, and the
  Advanced tab has `Storms form on their own` and `Storm activity (seeds)`. **The look of the storms** is also under `Customization` (kept in this browser): *Storm paths* is
  the **Default** path (ours: a dark halo under the line, a big dot every six hours and a small one between, all a little larger than before) or the **Wiki** path, as the track maps of Wikipedia draw it: a thin white line
  through the six-hourly fixes, a dot of one size at each and none between, no outline, coloured by the Saffir-Simpson scale in every basin with the colours the maps use today (read off a real one: `#6EC1E7` depression, `#4DFFFF` storm, `#FFFFD9`, `#FFD98C`, `#FF9E59`, `#FF738A`, `#A188FC`
  for categories 1 to 5), a triangle (about four fifths of a circle across) for an extratropical or remnant low and for the disturbance or low that was followed before the depression, and a square for a subtropical cyclone, in the colour of their own wind. *Current-position icons* mark where a cyclone is now: a cyclone of tropical
  storm strength or more is the weather map's symbol (a disc with two curled tails) turning the way its hemisphere turns (counter-clockwise in the north, mirrored and clockwise in the south, faster the stronger it is) with its intensity
  on it (the category, `TS` below a hurricane, or the basin's own letters: `T ST VT SU`, `CS SCS VSCS`, `MTS STS TC ITC VITC`, `1` to `5`) in the colour of its class, a depression is a ring, and both are larger than the track's line; they are drawn
  on their own canvas (the storms are not redrawn for them) and not on the radar floater, which keeps its small marker. *Landfall markers*: when the centre of a tropical or subtropical cyclone comes ashore (its hourly position
  over water, then over land; the coast found by halving between the two; not twice within six hours) an X in the colour of its intensity shoots out at the coast for a moment, shrinks into a square that turns for three seconds
  and fades; on the radar floater only the square, smaller, and it comes when the floater's head reaches the coast (and none at all when the floater's overlays are cleared). Hover a dot for name, category, wind in mph
  (kt) and gusts; click a live storm or a finished track for the stat card (category, wind, pressure, Peak, ACE, shear,
  gusts, movement, SST, formed). The top bar is the season: `Atlantic 2026 | DEP | NAMED | HURR | MAJOR | CAT 5 | ACE`
  from the fixes with HURDAT2's own definitions (the ACE from the 00 / 06 / 12 / 18Z ones only); the three strength tags are the basin's own (`TYPH | MAJOR | SUPER` in the West Pacific,
  `VSCS | ESCS | SUPER` in the North Indian Ocean, `CYC | INTENSE | V.INT` in the South-West Indian, `SEVERE | CAT 4+ | CAT 5` in the Australian region and the South Pacific) and the counters keep their
  64 / 96 / 137 kt thresholds, so the real averages beside them stay comparable. **Intensity scales:** the engine's wind is a 1-minute wind; each page's classes start at its agency's cut-offs
  converted to it (10-minute winds / 0.88 for JMA-style agencies, Meteo-France, the Bureau of Meteorology and Fiji, 3-minute winds x 1.05 for IMD, rounded to 5 kt; the West Pacific takes
  JTWC's own Typhoon at 64 kt and Super Typhoon at 130 kt with JMA's Severe Tropical Storm at 55), and a storm is named at 34 kt of 1-minute wind in every basin. **Season summary:** the bar's `Summary` button opens a card with the totals and the real 1991-2020 average
  beneath each, a graph of the season's accumulated cyclone energy through the year over the real seasons (the middle 50 % and 80 % as bands, the median dashed; the
  other seasons of the run as thin lines) and one row per cyclone (a click flies to it and opens its stat card); at Jan 1 the finished season's paths disappear, the bar
  starts the new year from zero, a cyclone still alive finishes under its own year, and the card opens by itself on the season that has just ended. **Save / resume:**
  the season is kept in the browser (`localStorage`, 135-540 KB over a whole season, written in 2-7 ms: the weather generators' states and clocks, the storms as plain JSON, the
  controls) every few seconds while the clock runs, a moment after a change while it is paused, and when the page is hidden, closed or left by the dock's Menu button; the
  main menu then shows a `Continue` card (season, date, named storms and hurricanes, ACE) that reopens the simulator paused with `?resume=1`, and `Start` (a new game) or
  `Discard this season` deletes it. A season saved at 00Z continues bit for bit like the uninterrupted one; saved at another hour the storms, fields and counters are
  identical at the moment of the resume and the continuation is statistical (the engine takes fresh keyframes there). A simulator page opened directly beside a saved season
  it did not resume leaves that season alone until `Restart`, and a save from another version is refused and removed. **Place:** the dock's `Place` button (key `P`) holds the clock and opens a picker (tropical wave,
  tropical depression, subtropical depression, low); a white dot follows the pointer with a line of the next seven days of a system put right there (the engine run through a *shadow
  environment*: the simulator's own weather looked up seven days ahead from a copy of its state, which is put back), labelled e.g. `Cat 1 hurricane · peak 85 mph · by day 6.0` or
  `Does not develop`; a click places it exactly there (it then does what the preview said) and `Esc` cancels. **Outlook (areas of interest):** the National Hurricane Center's graphic for every basin, one implementation in `src/storms.js`
  (`Manager.prototype.outlook`) and one drawing layer in `src/storm-hooks.js`, with nothing fitted per basin. A shape is where a tropical or subtropical cyclone could form in the next seven days, filled with
  diagonal lines (a pattern over a faint wash, closer and thicker for a higher chance) in yellow (low, up to 35 %), orange (medium, 40-60 %) or red (high, 65 % and over) by its 7-day chance, with
  the 2-day and 7-day chance written on it, in steps of 5 and never a decimal (the Storm names box turns the numbers and the titles off). With **Ensembles** on, whatever you select (a cyclone, a wave, a low, a disturbance or invest; a plain wave or L can be clicked) gets a fan of 24 thin ensemble tracks that move on smoothly with each issue, tight for a mature storm and wide for a wave, and hovering one shows its name, length, initial time and peak wind; **Track density** paints where the ensembles agree (red) and spread (yellow, green, blue). **Cones** draws the NHC cone of uncertainty (a circle of the NHC's mean track error round each forecast point, 26 nmi at 12 h to 220 at 120 h) for the cyclone you select, with forecast points lettered by their wind in the basin's own letters and colours (D S H M for the NHC, D S SS T ST VT SU in the West Pacific, the category numbers in Australia, the agencies' abbreviations in the Indian Ocean; grey when post-tropical, and a post-tropical storm's cone goes on to 120 h), a smooth centre line and a hover with winds, gusts and pressure, refreshed every three hours. **Wind fields** draws how far the 34, 50 and 64 kt winds reach round a storm (the one you select, or each when none is): the roots of one wind profile (the wind falls as a power law outside the eyewall, fixed by the storm's wind there and its 34 kt radius), so a strengthening storm's hurricane-force radius grows at once and its eye contracts while the 34 kt field, which is nearly independent of intensity, changes slowly and grows with age and latitude, the storm's own motion strengthens its right-front side, a hurricane that has held its strength for half a day gets **eyewall replacement cycles** (the wind dips by about 20 kt for a day while the eye jumps out to two or three times its size, the hurricane-force radius and the 34 kt field grow and stay grown, then the wind comes back: the card says which phase it is in), and a post-tropical low grows over a day or two into the very large field the high wind warnings use, a post-tropical cyclone living until it has filled or is absorbed rather than for a set time. A cyclone that forms over cool water poleward of the tropics is more often subtropical. **Cities:** hover a city for what the storms have done to it: the wind and gusts now (mph), the rain of the last 72 hours (inches), the deaths and injuries and the damage in dollars (with its share of the city), and how far it has recovered; a ring on the marker shows a damaged city (yellow, orange, red, dark red by the share of its value damaged), the storm's card has its own tally and the season summary the totals and the worst-hit city. Damage heals over a time that grows with the damage (a few days for the lightest, a season at the worst), the injured heal three times as fast, and deaths stay in the record until the city has recovered. **Watches & warnings** draws the NHC's watches and warnings (hurricane and tropical storm, with the high wind warning for post-tropical lows) for every storm at once, over the land and along the coasts, running inland as the winds do, issued every six hours and kept while the threat lasts. These layers, with the jet stream, highs and lows, the NHC disturbances (waves, areas of interest) and the streamlines (steering arrows), are the buttons at the bottom right; the two new ones show a small key at the left while they are on. A bold X, filled with the colour of its chance (and so is its arrow), is a disturbance that exists (a wave, a local seed, a tracked low or a
  placed wave) -- the wave or the L *becomes* the X, with its title beside it (`Invest 92L`, `Wave`, `Low`, `Disturbance`; the dashed line or the L comes back when its area goes): it sits inside its shape (which follows it) while its 2-day chance is not 0, and when the 2-day chance is 0 -- nothing is expected from it in two days, so it is not in favourable conditions yet -- it is outside the shape, with an arrow to where the chance starts to build up (the shape starts there; the arrow is between 2.5 and 30 degrees long, and one that stays for more than a day and a half has said for that long that conditions will improve ahead of the disturbance without being right, so the chances it gives are believed less and less, down to half). A shape with
  neither is a disturbance that has not formed yet, drawn only inside the lead a forecaster would have (a wave leaving Africa for up to a week, a local seed for a day or two, three in ten with no warning
  at all); one that forms unexpectedly shows up with its X. The shape is where most of the formation is expected (the 10th to the 90th percentile of its time) along the disturbance's mean track, widening with
  lead, so a high chance soon after favourable conditions is short and compact and a thin chance spread over days long and wide. An issue is made at 00, 06, 12 and 18Z (the legend says which) and held
  for its six hours; a hand-placed disturbance is in it at once. Hover an X or a shape for the chances, what it is, where it is going and when it should get good conditions or form; **click one to look at that disturbance alone**: every other system and area goes (as with a cyclone) and a card gives its chances, conditions, movement, position, shear, sea temperature, the issue and the window of formation (`Esc`, the cross or an empty click put everything back; a disturbance that becomes a depression hands the card to the cyclone). **Calm, simple shapes:** each issue moves on from the one before it (the engine keeps what the last one said of every disturbance, saved with the season): a chance changes by at most 20 points (a disturbance seen for the first time starts at 40 % / 30 % at most, a placed one at the chance it has the first time), a shape goes 30 % of the way to the new forecast and at most 2 degrees in one issue (it is carried along with its X meanwhile, and one that a neighbour held short grows back by at most 2 degrees an issue), and the issues are made one after another as the clock goes by (every one up to 4x, every few above, the limits widened for the gap). A shape is the zero line of a distance field, one closed loop whatever the track does (the offset curves it replaced crossed themselves and drew an outline inside the outline), at most 14 degrees of track long, and two shapes do not overlap (the younger disturbance's shape stops 0.5 degrees short of the older one's, and keeps only the disc round its X where the X sits inside the older one's) (the arrow comes out of the X as the shape moves away from it, 2 degrees an issue, and an arrow that is there stays while the gate is only half open). **How it is made:** each candidate is followed
  along its mean track (the real drift of a weak system there and then plus the steering anomaly the page shows now, decaying to the climate over three days) through the environment the page has now with
  its anomalies decaying to the page's own climate over days (a persistence forecast: honest, not sharp, it does not know the weather beyond the next keyframe); along the track the development rate is
  the one the engine itself uses (the map rate, times how favourable humidity, shear and sea temperature are, times the system's quality and the activity factor), thinned by the chance that a development
  event becomes a depression and competing with what ends a disturbance (cold water, latitude, age, land, a seed's own drawn life); the chance of formation by a time is the integral of rate times survival.
  The disturbances that do not exist yet are the births the supply will make: the generators that make them (`_waveNext`, `_waveBirth`, `_localSeed`, `_floorSeed`) are shared by the engine and the outlook, so
  the one drawn ahead of time is the one that is born (a check compares 405 of 405 over eight starting times). A node check runs 200 identical disturbances through the engine and compares the fractions that
  become depressions in 2 and 7 days with the outlook's chances (0.47 against 0.47 in a favourable environment, 0.15 against 0.14 in a marginal one, 0.13 against 0.09 for a subtropical seed). A fresh issue
  costs 1-5 ms; the page recomputes at most every 0.6 s at 8x and above. **Invests:** a disturbance the engine flags (its development has begun, or its environment holds its wind near what a depression needs)
  is given the next number from 90 to 99 of its region's letter at the first six-hourly look (L Atlantic, E East Pacific and C west of 140W, W West Pacific, A Arabian Sea and B Bay of Bengal either side of
  78E, S and P either side of 135E in the Australian region, S South-West Indian, P South Pacific, Q South Atlantic, M Mediterranean), counted again from 90 each season; it is in the tooltip (`Invest 92L`), on
  the stat card of the depression it becomes (`as Invest 92L`) and in the save. **How a storm lives (climatology-anchored):** a *disturbance*
  (an African easterly wave, a local seed where the real Atlantic forms storms from troughs and gyres, or a tracked pressure
  low) develops at the hourly rate of the real genesis map for that place and month, times how much better the simulated
  humidity, shear and SST are than their own mean there and a large-scale random activity factor (a draw per season and a few
  pulses of 14-60 days: the climate the page does not carry), and is declared a depression only while the growth law could keep one
  alive; a system moves with the real mean drift of its kind at its place and time of year plus the anomaly of the page's own
  steering from its mean (so the weather decides which of the real tracks it follows, and ENSO acts through it); intensity is
  a logistic growth law bounded by the environment's potential, with rapid-intensification episodes (they start at a rate that rises with
  warm water, little shear, moist air and room below the potential wind: none in a hostile environment, 30 kt or more in a day in about
  6 % of the 24-hour windows over the real record's warm water, and in a perfect one, water above 29.5 °C with next to no shear in very moist air, they run
  up to 2.5 times faster and take a storm up by 80 to 100 kt in about a day), a cold wake, a soft limit on how fast wind can be lost, and land decay; a tropical cyclone ends by one of two competing random exits at the real best track's rate (it
  becomes extratropical, keeping its wind, at about 41N over 20 °C water in strong shear; or it dissipates, a weak storm far more often
  than a strong one), a post-tropical cyclone starts fast (25 kt in its first row) and slows with age, may re-intensify in a strong jet,
  and a weak storm over land is finished in half a day. **No walls:** nothing in the engine is a threshold that switches a rule on or off or a clamp: every limit is a ramp, a
  hazard or a soft cap (`satur(x, cap)` bends over toward its cap and never reaches it). Lakes are water for the storms (the 638 lake polygons of the map are rastered onto its fine grid and take
  the temperature the page draws for them), the fall of the potential wind with latitude is lifted in a perfect tropical environment (warm water, next to no shear, moist air: a depression
  over 27.5 degC water at the latitude of Lake Michigan becomes a hurricane in 37 of 40 seeds, it was 10), the post-tropical transition and the sea-temperature gate no longer shut a warm, calm
  sea, a map that is zero is not a wall (a development-rate floor and a supply of disturbances over the whole box make the Great Lakes, the Mediterranean and the rest of the water possible,
  and extremely rare), a system never crosses the equator (the step toward it bends into a soft floor on |latitude| below 2.5 degrees, `keepSide`: untouched poleward of it, never zero), and the sliders have the only ranges the model has. `docs/roadmap.md` (milestone 9) lists every limit and what it became. Selecting a storm (or one of its dots) hides every other path until it is
  deselected. **Re-fitting:** the maps are a calibration of this simulator's weather, committed as data, so they are re-fitted when the
  weather changes (`npm run build`, then with `PLAYWRIGHT_CHROMIUM_PATH` set `node tools/storm_fit.mjs clim`, `wet`, `fit --ipf`,
  then `refine` and `motion` on `node tools/storm_mc.mjs --diag` runs of 70+ seasons until the regional totals stop moving, `maps`,
  `node tools/merge_data.mjs atlantic --storm-maps data.json`, rebuild, and check on seeds the fit never saw with
  `node tools/storm_mc.mjs --seeds 401-496 --out raw.json` and `node tools/storm_validate.mjs raw.json`; the intensity law and the
  transition's intercepts come from `tools/storm_opt.mjs` and `storm_mc.mjs --sets` scans; `docs/roadmap.md` has the whole procedure and
  its numbers). **Speed:** the engine reads SST, humidity and shear from its own one-degree grid (every fourth node of the map's, a sixteenth of the
  work; the values are exactly the map's at those nodes, a browser check compares them) and the steering from keyframes every six hours with the hours between carried forward linearly in time,
  the map's fine synoptic texture is built only when the map is drawn, the clock's frame loop stops advancing after 12 ms of simulation and owes
  the rest (at most 24 hours), so a slow machine falls behind instead of freezing, and the layers redraw less often the faster the clock runs; in headless Chromium
  here a simulated day costs 17-21 ms (it was 44), the clock runs 34 / 31 frames a second at 4× / 16× (it was 20 / 17), 412 simulated hours a second at 64× (190) and pressing `Place` at 16× blocks for 0.19 s (0.47 s);
  `docs/roadmap.md` has the table. **Time and weather:** `advanceHours()` walks in sub-chunks that end on every absolute 3-hour
  boundary; the engine runs hour by hour on the last *keyframe* (a copy of the three steering layers and sea-level pressure
  every 6 h, the hours between carried forward in time; of SST, humidity and shear once a day at 00Z and whenever a slider, ENSO or the seed changed). Storms are
  therefore a pure function of the seed, the settings and the actions, however fast the clock runs or often the page
  redraws. That needed one change to the weather itself: SST / humidity / shear / ENSO used to draw their random numbers lazily
  whenever `computeField()` happened to run, so the same seed gave different weather at different render rates (measured
  over 120 days, two seeds, 243 cells: a redraw every 160 h instead of daily changes humidity by 15-17 points and shear by
  9-10 kt on average per cell, SST by 0.4-0.5 °C, Niño 3.4 by 0.3-0.7 °C), so with storms on those draws are pinned to
  the midnight keyframe. With storms off (`SSTSIM.storms(false)`, which the existing environment checks use, and the other
  eight basins which have no engine yet) nothing changes. Every random
  draw in the engine is a pure function of (seed, system id, hour, stream), so a checkpoint is plain JSON and a hand-placed
  system never changes an automatic one. **Not yet:** storm surge as a layer of its own (the cities' surge is a proxy inside their impacts), flood watches, and the real best track's wind radii
  (not downloadable here: the sizes are set from the published statistics).

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
- **The generated data is committed, not rebuilt by `npm run build`.** The pipelines that
  make it live in `tools/` (`make_climate.py`, `make_geo.mjs`, `make_imagery.py`,
  `make_humidity*.py`, `make_shear*.py`, `make_steer*.py`, `merge_data.mjs`; the
  `tools/build_*_all.sh` scripts list the per-basin commands) and need network access to
  the NOAA ERSST and ERA5 archives plus the raw caches in `data/raw` (git-ignored), so
  they are run by hand when a calibration changes.
- Domain is the North Atlantic basin only; SST south of the equator and in the
  Mediterranean/Black Sea is intentionally masked out (they're future basins).
  ENSO changes SST, humidity and wind shear in all 9 basins. The Atlantic's and the East
  Pacific's humidity and shear sum three lag terms that were each fitted on their own
  (a sustained event is counted about twice) and have the same El Nino pattern and
  year-to-year spread in every month, which the real record does not (their storm
  physics was calibrated on those fields, so they keep them). The other seven pages
  have the joint-lag coefficients and a gain by calendar month
  (`tools/make_env_seasonality.py`; the steering field already fitted its lags jointly,
  and SST is unchanged) — see `docs/roadmap.md` for the numbers.
- ERSST at 2° is warm-biased in coastal cells; several corrections are hand-tuned
  (see the shelf, Northeast shelf, Gulf Stream blocks in `src/template.html`).
- The numbers that follow are the Atlantic's (the test basin; the other basins' are in `docs/roadmap.md`, milestone 10: each page's storms against the real 1991-2020 best track over 96 seasons it was not fitted on, and what misses; the South Atlantic and the Mediterranean are calibrated to literature numbers, not to a record). 240 seasons the calibration was not fitted on (seeds 1401-1448, 1501-1596, 1601-1696; the 214 days from Jun 1)
  average 16.7 depressions, 14.0 named storms, 7.9 hurricanes, 3.8 majors, 0.37 category 5 storms and ACE 137 against the real 1991-2020 15.8 / 13.9 / 7.2 / 3.2 / 0.47 / 122 (the three blocks of
  seeds differ more than chance explains: ACE 129, 147 and 132), with season-to-season SD of the named count 4.9 (real 5.5) and of ACE 77 (66, but a heavier top: the
  highest simulated season is 440, the real record's 250), and 43 % of named storms becoming extratropical (45 %) at a median 41N (41N). Rapid intensification
  (24-hour gains of 30 / 50 / 65 / 80 kt in 6.6 / 0.90 / 0.17 / 0.03 % of the windows over water, real 6.3 / 0.73 / 0.16 / 0.03) follows the sea temperature, but starts earlier in a
  storm's life than the real record's (14 % of the windows that start at 45-65 kt gain 30 kt, real 7 %; 1 % from 95 kt up, real 4 %). Known misses (`docs/roadmap.md` has them all):
  East Coast landfalls 0.86 a season (real 1.13), Mexico 1.56 (2.17) and Canada 0.07 (0.23) are low and the Greater Antilles / Bahamas (1.94 against 1.23) and South America (0.53 against
  0.03) high; category 5 storms 0.37 a season (0.47) and ACE 12 % above the real normal (the perfect-environment relief adds a few majors); a sixth of numbered depressions never reach storm strength (real 12 %); post-tropical systems are about 20 % too slow after
  their transition and there are fewer of them than in the data; subtropical storms are 1.1 a year (1.7); the page's own pressure lows are
  fewer and longer-lived than ERA5's; the moisture slider's effect is far stronger than the warming slider's. The lows thresholds, the
  2027+ name lists and the clock at 32× and 64× (about a third of its nominal speed in headless Chromium) are also open. The city impacts, the surge proxy and the wind radii are a calibrated model, not a forecast of real losses. The radar floater's storm is the engine's (its mean wind and size, its eyewall replacements and its transition are the engine's statistics, shown by a convective model); the nest has no terrain and no vertical structure, and its satellite view is infrared only (visible and water-vapour channels are still to come), and a very large storm's outer field is cut by the 512 km square.
- **Radar floater** (storms on): select a cyclone, or a disturbance that is on the map, and press **Radar floater** on its card. The map frames a 512 km square round the system and a 2-km model of
  its inside runs there, drawn as radar over the map (over land too): the National Weather Service's reflectivity steps, crisp (the picture is made at the screen's sharpness by a bicubic reconstruction of the
  2-km field that keeps no ripple, in 5 dBZ steps with sharp edges between them). The main clock stops and the floater has its own, running inside the hour between the engine's state now and its look-ahead one
  hour on (`Manager.peek`: the engine's own `stepSystem` on a copy), at **a quarter of real time up to 45 minutes a second** (the playback buttons, `[`, `]` and Space are the floater's while it is open); when it
  passes the hour the engine really advances one hour and the floater goes on from there. Two hours of the system's life are spun up first (a bar says so). The storm layers stay on top of the radar: the
  system alone with its past path and its place (moving between two hours), the **cone**, the **ensembles**, the **wind fields**. **Radar** chooses a composite (every echo of the model) or the radar of a
  nearby city: range rings (50 to 460 km), the beam's height at the **tilt** you pick (0.5, 1.5, 3, 6 degrees: the beam passes over low echoes far away and weakens them near their tops, 4/3 earth radius),
  and with a site the **velocity** product too (Doppler: green toward the radar, red away, the couplet of the storm's circulation plus its own motion).
  **View** switches the picture to **Satellite (infrared)**: the brightness temperature of the model's clouds in the colours of the usual enhanced infrared picture (a grey ramp from black at +40 C to white at -20 C, then cyan, blue, green, yellow,
  orange and red for the cold tops, black at -70 C, grey to white, and pink and purple at -80 to -90 C; the key, laid out like the colour bar it was made from, shows +40 to -90 C). The cirrus is made by the model's convection and carried by its own
  upper-level flow (an outflow, the shear blowing it downshear) and spreads sideways as an anvil does (so a cold canopy has no cracks in it), the tops of the clouds and the tropopause follow the latitude. A weak system's burst of convection has a slow moisture memory: in warm, moist air it is one constant mass that covers the system and winds into bands, in shear one mass on the downshear side, in dry air or over cool water only small isolated clusters. An eye begins to form in category 2, is there by category 3, needs a ring of rain round it, and erodes sooner in shear, dry air or cool water. The land is outlined in **white** over either picture so a landfall is easy to see, and
  there are two more clock speeds, **30 and 45 minutes a second** (nothing faster: the model steps four minutes at a time there, so they cost no more than 20 minutes a second).
  *What the model is, honestly:* the balanced limit of the moist-convective rotating shallow-water model (Bouchut et al. 2009, Rostami and Zeitlin 2017-2022: the gravity waves left out), with no vertical
  dimension and no microphysics, not a numerical weather prediction model. The low-level vorticity is advected by its own winds (semi-Lagrangian), so differential rotation shears everything into spiral bands, vortex Rossby waves
  travel and rings break up; the boundary layer lifts moist air where the surface stress has curl (Ekman pumping, the slab layer's strength, more drag over land) and converges moisture; a column of water rains out above a
  threshold in ten minutes, fed by that convergence, by the sea (evaporation grows with the wind) and by a background ascent and mesoscale clusters, so cells have a life cycle and a spacing; the rain's mass flux stretches the
  vorticity (convection builds the vortex' asymmetries, hot towers, mesovortices); rain is a convective tracer (Z = 250 R^1.2) and a stratiform one (Z = 200 R^1.6) made from the decay of the first and from broad ascent.
  **The engine owns the storm**: it hands the nest its mean wind profile (a ring with a hollow core when strong; **two rings during an eyewall replacement**, the inner fading as the outer forms and takes over, with a moat
  between: concentric eyewalls), its motion and the weather round it, and the nest's mean vorticity is held to it by a relaxation of 20 minutes and its heating efficiency adapts so its convection supports the intensity the
  engine says; the structure inside is the nest's: the eye (a convection-free hole once the vortex is strong enough to have one), the eyewall and its hot spots, the bands, the moat, the gaps. **The weather on a storm's sides makes
  it lopsided**: the page's own sea temperature, humidity and shear are sampled over the whole square (16-km grid), so dry air on one flank erodes it, cold water weakens that side, shear ventilates the upshear side, land dries
  and drags and makes a coastal band, the right-front side of a moving storm converges more; an **extratropical transition** brings the warm-conveyor-belt stratiform shield ahead and to the left, a convective front behind
  and the dry slot, scaled to the system's size. A weak or disorganised system (a disturbance, a depression, a storm that weakens, crosses a coast or turns extratropical) is made by the broad ascent of the moist tropical air over the area it fills, through a heavy-tailed variability at three scales: scattered cells, clusters and mesoscale rain areas with gaps and cores, a stratiform skirt round every cell, not a disc and not a few blobs; its radar is large and widespread. **Shear** puts the convection on the downshear-left side and **dry air** on one side starves that side, so a sheared or dried-out storm looks lopsided; the eye is ragged, soft-edged and clears fully in a strong storm; land dries the air over tens of km and the rain fades inland, with no line at the coast; a hurricane has a rain shield round its eyewall; **subtropical** systems (cold air aloft over a cool sea) have a radar too. For a very large storm the box grows: every length and speed is divided by a scale of up to 3 (the cells are 2 to 6 km, the box 512 to 1536 km) and the floater says so ("4 km cells") and re-frames the map. The picture has a texture the 2-km cells cannot hold and the Doppler wind has turbulence and the downdraughts' outflow. A step is 2 minutes of the system's life and takes about 28 ms, the picture about 7 ms.
- All nine basins run in Simulation mode; Forecaster mode hasn't been started (its
  menu card is disabled). Steering arrows and highs are in all nine basins; the
  Mediterranean and the North Indian Ocean have hardly any highs to show (about one day in ten in winter).

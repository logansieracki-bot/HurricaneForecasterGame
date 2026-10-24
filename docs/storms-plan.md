# Core Tropical-Cyclone System — Atlantic test basin (Step 1 of the 7-step TC roadmap)

> Hook points below are confirmed against `src/template.html`, `index.html`, `tools/build.mjs`, `tests/run.mjs` and
> `.github/workflows/test.yml`. A real best-track dataset **is reachable** from the sandbox (an IBTrACS-derived copy; raw NHC
> HURDAT2 still is not — see "Reference data"), which earlier roadmap entries assumed was not the case for any real data.

## Context

The simulator has a real-data-calibrated environment (SST, 700-hPa humidity, 200–850-hPa shear, three steering layers with
highs/jet/sea-level pressure including travelling lows, ENSO) and nothing living in it. This is **Step 1** of the roadmap:
core systems → AOIs/invests → cone → wind field 1 → wind field 2 (EWRCs, size) → watches/warnings → city damage/stats, with
radar (2-km models) then satellite much later (Phase 2). Step 1 delivers **every kind of system** — tropical waves, lows,
tropical + subtropical cyclones, extratropical/post-tropical — born automatically *or* placed by hand with a smoothly
changing forecast preview, plus names, ACE, advisory tracks, hover/click cards, a season bar, a season summary with an ACE
graph, end-of-season clean-up, and mid-season save/resume with a **Continue** card on the main menu. **Atlantic only**
(rollout to the other 8 basins follows the test, like steering/shear did). Latent hooks for later steps (size/structure
terms, forecast machinery) stay in; none of those steps are built here.

**Out of scope now** (invests and the areas of interest came with milestone 11, see the status below): impacts (city markers, watches/warnings, damage — cards show "—"), invests / automatic AOIs, cone,
wind fields / EWRCs, autosave toggle + GIF export, other basins, radar, satellite. (Open question for Step 7, not now:
what "DES 2 (8–15)" on your reference card means.)

## Decisions (defaults assumed; change any in review)

| Topic | Default |
|---|---|
| Season | **Calendar year** (Jan 1–Dec 31): matches the ACE graph's Jan–Dec axis and HURDAT2 bookkeeping. The sim already labels the season by the real UTC year at load and starts Jun 1 (Atlantic) — keep that, so the first season is partial. A system alive at Jan 1 finishes under its formation year. At rollover: archive, clear paths, next year's name list. |
| Status vocabulary | HURDAT2 codes — `WV` wave, `DB` disturbance, `LO` low, `TD`, `TS`, `HU`, `SD`/`SS` subtropical, `EX` extratropical — one enumeration, directly comparable to best-track data. |
| Place button | Small type picker: tropical wave (default) · tropical depression · subtropical depression · non-tropical low. Preview shows whether/how it develops (may fizzle). |
| Advisory dots | 6-hourly (00/06/12/18Z, HURDAT2 convention); display option thins to 12-hourly. |
| Units | mph primary with kt in brackets (your card); gust factor 1.21 over water (your card: 120 mph → 145 mph). |
| Markers | tropical = circle by intensity (TD blue, TS green, C1 yellow, C2 orange, C3 red, C4 magenta, C5 purple); **subtropical = square** (same colors); extratropical/post-tropical = grey triangle; wave = dashed axis; low = small "L". White dot = genesis/placement. |
| Save | One slot: last midnight checkpoint + ≤23 h replay (see Persistence); written on leave (`pagehide`/`visibilitychange`) and throttled while playing — no autosave toggle / GIF UI. Archived seasons live inside the save, so starting new deletes them too. |
| Names | Real WMO Atlantic lists by year (2026: Arthur, Bertha, Cristobal, Dolly, Edouard, Fay, Gonzalo, Hanna, Isaias, Josephine, Kyle, Leah, Marco, Nana, Omar, Paulette, Rene, Sally, Teddy, Vicky, Wilfred), 6-year rotation (2027 = 2021 list with Imani for Ida; 2028 = 2022 list with Farrah, Idris; 2030 = 2024 list with Brianna, Holly, Miguel), supplemental list after 21 (Adria, Braylen, Caridad, …). Unverified from here (official tables are blocked): later replacements and any 2025 retirements — see Reference data. |

## Reference data (found while exploring; milestone 0 re-verifies and records source, version and hash)

NHC, NCEI, AOML, CSU, WMO and Wikipedia are all blocked from the sandbox, so raw HURDAT2 text and the official name tables
are **not** reachable; PyPI, npm, `raw/media.githubusercontent.com` and `storage.googleapis.com` are.
- **Atlantic best track (real, IBTrACS-derived)**: PyPI wheel `huracanpy==1.5.0` ships `_data/_ibtracs_files/wmo.csv` and
  `jtwc.csv` (all basins, seasons 1980–2024; Atlantic = 730 tracks / 20,428 six-hourly rows; wind kt, pressure hPa, and
  HURDAT2-style `status` codes TD/TS/HU/EX/SD/SS/WV/DB/LO in `jtwc.csv`). No names, no wind radii. Third-party mirror of NOAA
  public data, version not stated — so it is cross-checked against NHC tallies (e.g. 2020 = 30/13/6, 2021 = 21/7/4,
  2022 = 14/8/2). Heavier optional copy for names + wind radii/RMW (useful for the later wind-field steps): Git-LFS
  `…/ibtracs.since1980.list.v04r01….csv` (139 MB, 174 columns) via `media.githubusercontent.com`. Only *derived* statistics are
  committed (`data/generated/atlantic-tc-ref.json`); raw copies stay in git-ignored `data/raw/` with their hashes.
- **Already computed (1991–2020, 30 seasons) — the calibration targets**: 14.5 / 7.3 / 3.2 storms reaching 34 / 64 / 96 kt
  (NHC 14.4 / 7.2 / 3.2), 16.3 tracks incl. depressions; mean ACE **123** (range 32–253; NOAA ≈ 122); median ACE date Sep 12,
  15-day peak Sep 8. Genesis (first ≥34 kt) per year by month: Apr 0.10, May 0.33, Jun 0.83, Jul 1.53, Aug 3.63, Sep 4.60,
  Oct 2.53, Nov 0.77, Dec 0.17; median genesis 20.3°N (IQR 14.0–27.9), 62.7°W; biggest 10°×20° cells 10–20°N 40–20°W (17 %),
  20–30°N 100–80°W (16 %), 10–20°N 60–40°W (13 %). Rapid intensification (≥ +30 kt/24 h): **4.8 %** of 24-h windows
  (6.0 % for storms ≥35 kt); 24-h change for ≥35-kt storms P5/P25/P50/P75/P95/P99 = −30/−10/0/+10/+30/+45 kt; **61 %** of
  hurricanes, **90 %** of majors, **98 %** of Cat-4+ storms had RI at least once. Median pressure by wind: 30 kt 1005 hPa, 50 → 995,
  70 → 980, 100 → 957, 120 → 941, 150 → 915; fit V = 16.2·(1013−P)^0.423 kt (rms 10 kt) ⇔ P = 1013 − 0.0089·V^1.903 (rms 7.4 hPa).
- **ERA5**: ARCO (`gcp-public-data-arco-era5`, 1.5°, to 2021-12, no vorticity/RH) and WeatherBench2 (to 2023-01, adds vorticity,
  divergence, RH, PV) are reachable. `data/raw` (2.1 GB, local) already holds MSLP 6-hourly 2007–2021, steering winds (monthly
  2007–21, daily 2017–21), RH700/shear (monthly + daily 2017–21), ERSST 1970–2021: enough for the low-detection check and for
  sampling the environment at best-track points (units in those files are mislabelled — kt and hPa, not m/s and Pa).
- **Names**: the 2026–2031 lists and the supplemental list are from memory (2026 list high confidence; the replacement for
  Idalia in the 2029 list, any 2025 retirements such as Melissa, and some supplemental entries are uncertain). They live in one
  editable data table with a structure test (21 unique names, A–W without Q/U/X/Y/Z, alphabetical); the v04r01 file's NAME
  column can verify the lists actually used in 2021–2025.

## Architecture

1. **`src/storms.js` (new, pure JS, no DOM)** — the whole engine as a classic-script IIFE that sets `globalThis.HFStorms`
   (`package.json` is `"type":"module"`, so `export` would break the inlined `<script>`). Build inlines it through a new
   4th placeholder `/*__STORMS__*/` in its own `<script>` placed before the main IIFE (`tools/build.mjs` L17-20 chain;
   missing placeholders are silent no-ops, so the 8 other templates are untouched until rollout). README/build comment
   "three placeholders" gets updated. Node tests `import '../src/storms.js'` for the side effect.
2. **Hash-keyed randomness**: every draw is a pure function `hash(seasonSeed, systemId, hourIndex, stream)` — no hidden RNG
   state, no new stateful stream (keeps the repo's "new subsystem never changes an existing seed" rule and the bit-for-bit
   isolation test at `tests/run.mjs:1034`), identical storms for any advance chunking, trivial checkpointing. System ids are
   namespaced — automatic waves `W<k>` from a deterministic renewal schedule, other seeds `N<k>`, hand-placed `M<j>` — so
   placing a storm never changes any automatic one, and the pending preview (`M<next j>`) has exactly the noise the placed
   storm will have.
3. **Environment adapter** in the template (`stormEnv`): steering `stSample(stU/stV[layer])` (kt, 3 layers), sea-level
   pressure `stSample(stPt)`, `sampleField(sst|humid|shear)`, `isLand`, ENSO `n34`, `P` sliders — the sim's existing
   accessors (`SSTSIM.steerAt/pressureAt/highs/isLand/sample`). Node tests use a synthetic analytic environment.
4. **Time hook**: `advanceHours(n)` (L2366) is the *only* time funnel and has no per-hour code: it jumps `simHour`, runs
   `stepDay()` once per midnight crossed (capped at 800), then adds `n·P.jetSpeed` to `jetClockH` in one lump — and the steering
   block can only be evaluated at the current clocks. So the storms-on path walks in sub-chunks that end at every absolute 3-h
   boundary (and midnight), runs `stepDay()` there, and calls `HFStorms.advanceTo(simHour, env)`. Storms off ⇒ the original
   code, bit-for-bit (the existing suite and `tick`-heavy calibrations keep their speed).
   **Finding that shapes everything:** today the same seed does *not* give the same weather — SST, RH, shear and ENSO draw
   from the main stream `rs` lazily inside `computeField()` (`ensureSynDay`/`ensureShearSynDay`), which the live page calls on a
   wall-clock throttle (every ~3 sim-hours at 1×, ~160 h at 64×); measured over 120 days, four render cadences differ by
   0.8–1.7 °C in Niño 3.4, 12–63 points in RH, 7–20 kt in shear (steering and the jet are fine: own streams). Storms-on mode
   therefore **pins those lazy draws to midnight keyframes** (right after each `stepDay()`: `ensureSynDay/ensureShearSynDay`,
   plus the full `computeField()` whenever the engine needs the fields), which makes the whole environment — and the storms —
   reproducible from seed + settings + actions at any speed or render cadence. A test runs two cadences and requires identical
   storms. Keyframes sit at **absolute** times: steering every 3 h (`steerEnsure()` ≈ 1.1 ms measured), fields once a day at 00Z
   (`computeField()` ≈ 13 ms same-day / ≈ 39 ms on a new day; `stepDay()` ≈ 3 µs), engine steps hourly with the latest
   keyframe held. ≈ 47 ms per sim-day (≈ 15 ms estimated in quiet off-season mode) ⇒ ≈ 20 sim-days/s headless; live play at 64× roughly
   doubles its frame cost, so heavy statistics run as background jobs and the spike in milestone 2 may coarsen the cadence.
   Edge semantics already in the sim: land cells carry finite SST/RH/shear (always test `isLand` first); cells outside the
   Atlantic mask (south of the equator, Pacific side of Panama) are NaN ⇒ a natural "left the basin" signal; steering is held
   constant beyond the box edge, so systems are ended when they leave the box.
5. **UI layer**: a separate `#storm-canvas` (`canvas.overlay`, pattern of `steerCanvas`/`drawSteer`; z-index 461 = above the
   borders/city dots of `gridCanvas` 460, below the cards at 900), created after `STEER DRAW END` so the test that takes
   `canvas.overlay[1]` as the SST canvas still works, added to `fitCanvases()`'s list, drawn from `render()` (after
   `drawSteer()`, multi-line anchor) **and** the per-frame branch while playing, and redrawn from `render()` while paused. Never
   draw on `#steer-canvas` (tests assert zero painted pixels there with the arrows off). Overlays are `pointer-events:none`, so
   hover/click are manual hit-tests (like `cityAt`, ~9 px) from the existing `map.on('mousemove')` and a new `map.on('click')`;
   a hovered storm owns its own `#storm-tip` and hides `#city-tip`; a storm highlight redraws only its canvas (a hovered-city
   change currently triggers a full raster `scheduleRender()`). Place mode uses Leaflet's `.leaflet-crosshair` and turns
   double-click zoom off. Hooks go between `/* ==== STORM … BEGIN/END ==== */` markers (like the steering blocks) and the port
   script that copies them to the 8 other templates is committed this time (the previous one was ad hoc and is not in the repo).
6. **Menu**: `index.html` side card + shared save module (see Persistence).

## Meteorology

> **Superseded in part:** motion, genesis and the way the seeds work are the *climatology-anchored model* described in the revision at the end of this document (milestone 3). The intensity law below is still the one in use, recalibrated.

State per system: lat, lon, Vmax (kt, 1-min), Pmin (hPa), status, age, motion vector, SST under storm (with cold wake),
OU-noise states, ACE, 6-hourly best-track fixes; latent `rmw`/`r34`/structure defaults reserved for the wind-field steps.

- **Motion** — intensity-weighted blend of the sim's shallow (850–700) / medium (850–500) / deep (850–200) steering layers
  (BAM-style: TD/weak TS → shallow … major hurricanes → deep) + beta drift (~2–4 kt toward NW, scaled by intensity/size) +
  first-order lag to the steering (τ ≈ 8–12 h) + smooth OU "wobble". Recurvature comes from the sim's own jet/highs.
  **Validate steering against real best-track motion here** (roadmap L1834: "once the storm model exists").
- **Intensity** — LGEM-style logistic growth bounded by an environment-limited potential. Empirical MPI
  Vpot = 28.2 + 55.8·exp(0.1813·(SST_eff−30)) is **m/s** (84 m/s = 163 kt at 30 °C; checked) and is an upper envelope
  (it gives 72 kt at 20 °C), so a cool-water efficiency factor is fitted against best-track Vmax-vs-SST. Reduced by shear
  (SHIPS-like, weaker storms more sensitive), mid-level RH, slow translation / **cold wake** (SST deficit that recovers over
  days), latitude; **stochastic rapid intensification** (SHIPS-RII-like: warm SST, low shear, moist, mid-intensity, not near
  MPI); smooth internal variability; **land** via Kaplan–DeMaria decay with re-intensification after short crossings; Pmin from the
  Atlantic wind–pressure relation fitted to the best-track copy (P = 1013 − 0.0089·V^1.903, rms 7 hPa, with a latitude/size
  hook; regression-tested so category↔pressure bands behave). Saffir–Simpson in kt (TS 34–63, C1 64–82, C2 83–95, C3 96–112,
  C4 113–136, C5 ≥137). Model structure comes from the literature; its handful of coefficients are fitted/checked against the
  best-track statistics above, never copied from memory of SHIPS/LGEM tables.
- **Genesis = seeds + environmental filtering** (the synthetic-TC approach): African easterly waves are seeded every ~3–5 d
  (seasonally weighted, ~60/yr, ~5–8°/day westward, OU amplitude), plus non-wave seeds (frontal/cut-off lows, Caribbean–Gulf
  gyre early/late season). A seed is a weak vortex (V ≈ 10–25 kt, status `WV`/`DB`) that obeys the *same* growth law as a
  cyclone, so it develops (→ `TD` at ≥25 kt, name at 34) only where the sim's SST / RH / shear / latitude allow — no separate
  genesis switch, and a hand-placed seed behaves identically (that is what the preview shows). Seed rate/amplitude are the
  calibration knobs (≈15 % of waves develop); the Emanuel–Nolan GPI is an *independent diagnostic* of the resulting genesis map.
  Subtropical route: lows over ~22–27 °C with moderate shear convert to SD/SS, then to tropical if SST ≥ 26 °C and shear drops.
- **Lows / extratropical** — non-tropical lows are **tracked minima of the sim's own sea-level-pressure field** (it already
  has travelling highs *and lows*, `P'`; mirror `steerDetectHighs()` with the same parabola refinement, nearest-neighbour matching
  every 6 h), consistent with the displayed highs and steering. First check: low counts/depth by month vs ERA5 MSLP
  (`data/raw/era5_mslp_*.nc`, same method as `tools/real_steer_highs.py`); fallback = engine-owned lows that also feed back
  into the pressure field. ET of a TC when SST_eff < ~22–23 °C or jet-position + shear criteria are met, with pressure falling
  and the wind field widening (re-intensification possible), then absorption/dissipation.
- **Dissipation** — sustained <25 kt over water → remnant low; inland decay; crossing into the Pacific side ends the system
  (crossover hand-off is a later all-basins item); leaving the domain ends it.
- **Names / ACE** — name at first TS or SS; TDs numbered; ACE = Σ(Vmax_kt/100)² over 6-hourly fixes ≥34 kt, tropical +
  subtropical only; season bar = DEP / NAMED / HURR / MAJOR / CAT 5 / ACE (your image).
- **Forecast preview** — same integrator, same per-system noise, run through a cached **shadow environment** (7 days ahead):
  steering is *exactly* looked ahead by swapping a handful of globals and restoring them (`simHour`, `jetClockH`,
  `pcStPrev/pcStCur`, `strs`, `stStamp`): wave sets are fixed at init; the jet axis extends forward in order from its own
  stream (`ensureJetThrough`, so looking ahead consumes exactly what the live sim would later) **but must pass the live
  `firstDay`**, otherwise its pruning (`jetHist.size > JET_HIST+12`) would delete history the live sim still reads; ENSO's
  lag-0 term barely moves in a week. A test interleaves lookahead calls with a normal run and requires identical sim state
  and identical later live keyframes. SST/RH/shear use persistence + climatological drift (their lazy daily generators are
  not worth forking) — so tracks are "nearly exact" for days and intensity diverges honestly, changing smoothly as the
  environment evolves or the cursor moves. Line fades beyond ~5 days. Placement reuses the
  pending id/noise, so a storm placed right now follows its preview exactly while the SST/RH/shear persistence holds, and
  drifts from it (smoothly) as the real fields evolve.

## UI / UX (layout confirmed against the page)

- **Place** button in the dock (`#dock`, next to speed): `aria-pressed`, white dot follows the pointer, type picker popover,
  live preview polyline with intensity-colored dots and a label ("peak ≈ 85 kt (C1)" / "fizzles"); click places, Esc cancels.
- **Season bar** `#season` card, top-centre (the `#toast` moves below it): `<Basin> <Year> | DEP | NAMED | HURR | MAJOR |
  CAT 5 | ACE` + Summary button. **Stat card** `#storm-card`, middle-right, offset left of `#panel` when it is open.
  **Tooltip** `#storm-tip` (like `#city-tip`, `pointer-events:none`). **Season summary** card: storm table + ACE graph canvas
  (cumulative curve Jan–Dec, archived seasons, climatology bands — real reference until ≥3 of the player's own seasons).
- **Tracks**: intensity-colored polyline, 6-hourly dots (square = subtropical, grey triangle = EX/post-tropical, white start
  dot), name label at the head ("EX Arthur"). Hover a dot: name, category, wind (mph/kt), gusts, time. Click a live storm or a
  dead track: stat card (name · category, wind, pressure, Peak badge, ACE, Shear, Gusts, Movement, SST, Formed; Damage/DES "—").
- Customization panel gains layer toggles (tropical waves, lows, labels); Advanced tab gains `Automatic systems` + activity
  multiplier. Restart/new seed resets the storm engine. New cards follow the page's responsive rules (`max-width:1040px` and
  `640px` blocks): season bar wraps/shrinks, stat card becomes a bottom sheet on phones.

## Persistence (mid-season save / resume)

**A pure "seed + action log" replay is unsafe in this sim** (the weather depends on render timing today; the start year comes
from the wall clock; the 800-day call cap; slider values are re-read from the DOM by `applySeed`; engines may differ in
`Math.exp/log/cos`), and replaying is slow anyway (≈ 47 ms per sim-day ⇒ ≈ 5–17 s). Instead: **a compact checkpoint at every
midnight keyframe + a short replay.** Storms-on mode already pins all lazy draws to the midnight keyframe, so at the instant just
after `stepDay()` and *before* `ensureSynDay` the coarse synoptic generators hold exactly the state a restore needs (no 4.3 MB of
fine `Prev/Cur` arrays — they are rebuilt by the first `ensureSynDay`). The checkpoint holds: `simHour, dayCount, jetClockH`,
`rs/jrs/strs`, `pc/pcH/pcS`, `pcStPrev/pcStCur`, ENSO (`ensoZr/Zi, n34, ensoHi, ensoHist[200], ensoHold/Held`), `gsShift, eddies,
nextShed, lcDip`, `humidSynC/shearSynC` + `lastSynDay/lastShearSynDay`, `jetHist/jetNewest` (keys about −27…+2 days around the
jet clock, can be negative), `P` **and the DOM slider values** (`seed-vary` included), `START_YEAR/START_MS`, build/model
version, the storm engine's systems and the season archive (≈ 100 KB JSON). Restore = `initSim(seed)` (rebuilds the static wave
sets via `initSteer/initJet`) then overwrite the above, set `anomDirty = true; stStamp = ''`. On leave the page saves the latest
midnight checkpoint + the sim hours since it (< 24) + the few logged actions since it (slider/ENSO/placement); resume restores and
re-advances those ≤ 23 hours (≈ tens of ms). Validated by a **restore ≡ continue test** (run A: advance X, checkpoint, advance Y;
run B: fresh page, restore, advance Y; compare fields, steering nodes, storms) that also finds any state we forgot.
Stored in `localStorage` (menu and sim pages share an origin on Pages: `_site/index.html` + `_site/dist/*.html` — verify under
`file://` in the pinned Chromium; else add a tiny `node:http` server to the tests; writes throttled to a few seconds). Sim pages
currently have **no** `pagehide/visibilitychange` handlers, no storage use, and no link back to the menu: add them (plus a small
"Menu" link). On load with `?resume=1` the page restores, then goes live. **Menu**: `index.html` is not built; add a
`.continue` card (not `button.card`, so `checkMenu`'s `button.card:has-text(...)` selectors and the `.endsWith(...)` URL
check stay valid) as a side column ≥ ~1060 px and stacked above the basin grid below that; "Start" deletes the save before
navigating (URL unchanged). Save only after ≥1 sim day of progress. Version mismatch ⇒ offer start-new. Caveat: a resumed run
continues on whatever engine/build opens it (same-browser resume is the use case).

## Milestones (each ends: `npm test` green, docs updated with real numbers, commit to `main` only)

0. **Reference data + plan** — commit this plan as `docs/storms-plan.md` (the plan file here lives outside the repo).
   `tools/make_tc_ref.py` → `data/generated/atlantic-tc-ref.json`: annual counts/ACE, daily cumulative-ACE bands, genesis
   density by month, translation speed by latitude, 24-h intensity-change distribution, lifetime, status mix, ET fraction, ENSO
   composites (from the best-track copy above, cross-checked against NOAA's published 1991–2020 normals: 14.4 named / 7.2
   hurricanes / 3.2 majors, ACE ≈ 122, peak ≈ Sep 10); name lists (verified against the WMO tables where reachable).
1. **Engine core + node tests** — constants, SSHWS/ACE/names/wind–pressure, hash RNG, motion + intensity on synthetic
   environments, transitions, lifecycle, determinism + chunk-invariance. No UI. `tests/storms.mjs`; `"test"` becomes
   `node tests/storms.mjs && node tests/run.mjs` (`run.mjs` imports Playwright at load, so node-only tests need their own entry).
2. **Sim integration + display = first visible storms** — adapter, `advanceHours` sub-chunk path, keyframes, auto-spawn
   (waves → TD → TC, lows, subtropical, ET), `SSTSIM` storm API, performance spike; `#storm-canvas` with markers, hover tooltip,
   click stat card, season bar, layer toggles. (Looking at tracks by eye comes before calibrating them.)
3. **Calibration** — headless Monte-Carlo (≥100 seasons, driven through the built page like the existing steering
   calibration). **Calibrate on aggregates (named/hurricanes/majors/ACE, genesis density, translation speed), validate on
   held-out facts** (monthly shape, lifetime, RI/ET fractions, recurvature, ENSO: La Niña ACE > El Niño; warming slider);
   steering-vs-best-track motion check; low counts/depth vs ERA5.
4. **Place mode + preview** — shadow environment, type picker, smooth preview.
5. **Season engine + summary** — calendar rollover, end-of-season clear, archive, ACE graph.
6. **Save/resume + Continue** — midnight checkpoint, save module, menu card, restore ≡ continue tests.
7. **Docs + final validation** — README (Layout, How it works, Known gaps), roadmap "Just landed" (real tables + caveats),
   mutation checks, CI + Pages check.

Suggested session split (each ends shippable): **A** = 0–2 (visible storms), **B** = 3–4 (calibrated + Place/preview),
**C** = 5–7 (season summary, save/resume, docs).

## Tests & validation

- Node-only (`tests/storms.mjs`, custom `check` style): exact SSHWS kt/mph boundaries, ACE on known sequences, wind–pressure
  monotone + category bands, name lists (21 unique, alphabetical, supplemental), DEP/NAMED counting, determinism and
  chunk-invariance (track hash identical for 1-h vs 6-h vs 24-h vs 800-day advance), checkpoint round-trip, physical controls on
  synthetic environments (shear↑ ⇒ weaker, SST↑ ⇒ stronger, Kaplan–DeMaria decay numbers, recurvature in a westerly trough),
  no NaN, Vmax ≤ Vpot + tolerance, nothing spawns within ~5° of the equator.
- Statistical (thresholds from the reference file and from many seeds, never from one passing run): counts, ACE, peak date,
  monthly distribution, genesis map, speed by latitude, RI/ET fractions. **Stop rule** so calibration cannot run forever:
  aggregates within sampling error plus a stated band (named storms ±1.5, hurricanes ±1, majors ±0.7, ACE ±20 % of the
  reference mean, peak date ±10 d); anything outside is documented as a caveat, not chased.
- Preview smoothness: the preview is a continuous function of (cursor position, sim time) — a small cursor move or 1 sim-hour
  step moves the 24-h/72-h preview points by a bounded multiple of the displacement for ≥95 % of random placements
  (bifurcations such as recurve-vs-not are the allowed exceptions); preview vs realized track error is reported by lead time.
- Existing environment checks (thousands of sim-days across 40-seed families; `tick` is ~3 µs/day today) run with storms **off**
  through a debug switch (`SSTSIM.storms(false)` in `checkBasin`'s common setup) so they stay fast and bit-for-bit unchanged;
  storm tests turn it on. Chunk-invariance is exact at the default `jetSpeed = 1` (integer clock arithmetic) and within ~1e-9
  otherwise. **Cadence test**: the same seed advanced with two different render/`computeField` cadences gives identical
  weather and storms in storms-on mode (and still differs today with storms off — the documented baseline).
- Playwright (added to the Atlantic callback of `tests/run.mjs`): Place mode (dot, preview pixels, click creates), marker
  shapes (pixel probes: square corner filled, circle corner empty, triangle apex), hover/click cards, season bar, ACE graph,
  rollover clear; menu: save → reload → Continue → state equal, new game deletes the save. Existing structural checks must keep
  passing: the floating cards are direct children of `body` with the dock visible (L626 — new cards get added to that list),
  `#steer-canvas` stays unpainted with the arrows off, autoplay on load, no `pageerror`, `index.html`'s `checkMenu` selectors.
  CI's `npm test` step is ~12 min today (707 s): keep additions ≲ 2 min (few seeds in CI; the 100-season runs are offline).
- Mutation checks on the new physics/tests, recorded in the roadmap like earlier rollouts.

## Critical files

`src/storms.js` (new) · `tools/build.mjs` (placeholder) · `src/template.html` (Atlantic hooks: `advanceHours` L2366, `initSim` L742 /
`stepDay` L761 / `restart` L2390, env adapter near the steering block L936–1173, `computeField` L1175, `makeCanvas` L1730 /
`fitCanvases` L1828, `render` L2212 / `frame` L2374, `map.on('mousemove')` L2294, `window.SSTSIM` L2460, dock L295 / panel L165
markup) · `index.html` · `tests/storms.mjs` (new) + `tests/run.mjs` · `tools/make_tc_ref.py` + `data/generated/atlantic-tc-ref.json` ·
`tools/port_block.mjs` (new; copies marked blocks to the other 8 templates at rollout, asserting each anchor matches once) ·
`README.md`, `docs/roadmap.md`, `docs/storms-plan.md` · `package.json` (test script) · `.github/workflows/test.yml` only if Pages
assembly needs more than the inlined build.

## Risks / honest caveats

Genesis is statistical (seeds filtered by the environment), not explicit convection; steering has not been validated against
best-track motion (milestone 3); lows from the sim's pressure field are synoptic-scale and shallower than real bombs (fallback
above); pinning the lazy weather draws to midnight keyframes changes the weather a given seed produces in storms-on mode (storms-off
runs are untouched); a resumed run continues on whatever engine/build opens it; official name tables are unreachable from here;
no SAL / explicit ocean heat content (cold wake is parameterized); the performance budget (≈ 47 ms/sim-day with fields) may force
coarser keyframes; the best-track copy is an unchecksummed third-party mirror of IBTrACS (cross-checked against NHC tallies).

## Verification

`npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm test`; Monte-Carlo table in the roadmap entry;
screenshots of the Place preview, tracks with every marker type, stat card, season summary; save → reload → Continue round trip;
CI + Pages deploy check after each push to `main`.

## Revision after the first trial (milestone 3): a climatology-anchored model

**What the first trial showed.** The first visible version (M2) drew storms from a physical model of seeds growing under the simulator's own SST, humidity,
shear and steering. Played for a few seasons it had: far too little activity (ACE about 50 every time, one or two majors), paths that no real storm takes
(subtropical systems running south-west to Florida, nearly every main-development-region storm ending in South America), a Gulf of Mexico and an East Coast
with almost nothing, waves that had nothing to do with the depressions, and too many subtropical storms. Two findings explain most of it:
  * **The page's steering is not the flow a storm feels.** It is a point value of an unconditional field that contains the circulation of every low (a storm
    that formed in one orbited it), and a real storm's motion is *conditioned* on where and when it is: the real mean drift of a tropical storm at 10N 40W in
    August differs from the unconditional mean flow there by several knots. A calibration of the intensity law cannot repair a track.
  * **Selection by gates is degenerate.** Genesis happened wherever the growth gates (SST, humidity, shear) opened for a seed, which concentrates it in the one
    corner of the basin where all three are best, however the gates were tuned; the calibration found that and put the sources where the gates allowed.

**The model now.** Four things are anchored to the real Atlantic (IBTrACS 1991-2020 / 1980-2024) and what the simulator's weather decides is *which of the
real possibilities happens this time*.
  1. *Motion.* A system moves with the **real mean translation of its kind** (weak tropical, hurricane, subtropical, extratropical) at its place and time of year
     (`data/generated/atlantic-tc-maps.json`, 5-degree nodes, Gaussian-smoothed in space and time), plus `driftGain` times the **anomaly of the page's own
     steering** (the layers the storm follows, averaged over a ring of 3 degrees so that the circulation of a low it sits in drops out, minus the page's own
     mean steering at that place and month, measured on the same ring). The real mean gives the mean tracks, landfalls and recurvature rate; the weather gives
     the spread (a high that builds, a trough that arrives) and the response to ENSO. The remaining unsteered wobble is the same smooth noise as before.
  2. *Genesis.* A **disturbance** (an African easterly wave from a seasonal schedule of about 60 a year; a *local seed* born where the real Atlantic forms
     storms from troughs and gyres that the waves and the pressure lows do not supply; a tracked pressure low) develops into a depression at an **hourly rate**
     `haz(place, month) x E`: `haz` is the real genesis density divided by the exposure the disturbances provide (fitted through the page, below), and
     `E = exp(c_rh dRH - c_shear dShear + c_sst d(SST - main development region mean) + c_sstabs dSST)` is how much better the environment is than its own mean
     there and then, with soft gates (open sea, warm water, not extreme shear, not on the equator) and the **intensity law's own growth gate** (a depression is
     not formed where it could not live: without that gate a third of the depressions formed in air they could not survive and died within a day and a half,
     which no best track contains), times the seed's own quality and a **large-scale activity factor** (a draw per season and a few pulses of 14-60 days, mean 1)
     that stands for the climate the simulated environment does not carry (Atlantic meridional mode, the African monsoon, intraseasonal pulses): it is what lets
     some seasons be hyperactive and others quiet. So the genesis map, the monthly shape and the share of waves
     that develop (about 16 %) are the real ones by construction, and what varies from year to year is the environment: ENSO acts through shear and humidity,
     warming through the absolute SST term. A low develops into a tropical *or* a subtropical depression, whichever draw it wins, which is what keeps the
     subtropical share at its real 10 %. Waves, local seeds (at that time an X in a dashed ring, since milestone 11 an area of interest with its own X) and lows (an L) are drawn, and the path of the disturbance leads into the
     depression's.
  3. *Intensity.* The same form (logistic growth to an environment-limited potential, stochastic rapid intensification, cold wake, Kaplan-DeMaria decay),
     recalibrated for the new structure on the real aggregates *and* on where depressions of each latitude become named storms and hurricanes and where the
     named storms spend their time, with four additions the trials asked for: a cap on the potential wind poleward of 14N (the real share of tropical rows of 96 kt
     or more falls from 13-16 % at 15-25N to 10 % at 25-30N and 4 % at 30-35N), a cap on how fast a tropical cyclone can lose wind, an established storm that sees
     5 points more humidity than the page's 2-degree field says (it moistens its own environment), and a disturbance that is declared a depression only while the
     growth law could keep one alive (otherwise a fifth of the numbered depressions were depressions for a day and gone, real one in nine).
  4. *The transition.* A tropical or subtropical cyclone leaves the tropics by one of two competing random exits at the real best track's rates (logit of the six-hour
     probability = b0 + latitude + SST + shear + wind: it becomes extratropical, keeping its wind, or it dissipates), a post-tropical cyclone relaxes toward the wind the
     baroclinic zone supports, may re-intensify in a strong jet, follows the real age profile of the post-tropical speed, lasts a lognormal 30 h and ends absorbed; a remnant
     low lasts about 24 h. Details and the held-out numbers are in `docs/roadmap.md` (milestone 3).

**Fitting the maps to the page.** `tools/storm_fit.mjs` runs the built page: `clim` measures the page's own mean steering (ring-averaged) and mean SST, humidity and
shear on the maps' grid by month (8 seasons of 365 days); `fit` measures the exposure of the disturbances (hours weighted by E, per node and month, from waves,
seeds and lows) in 24-season passes and sets `haz = G_real / X` (smoothed, damped, with the last two passes pooled), and sets the local seeds' supply so that they
carry their prior share of the real genesis (0.55 over the Gulf and the western Caribbean, 0.5 off the south-eastern US, 0.3 in the subtropical Atlantic, 0.05
elsewhere). The maps are therefore a calibration *of this simulator's weather*, committed as data and re-run when the weather changes.

## Status: step 1 delivered (milestones 0-9)

All ten milestones are on `main`: M0 the plan and the real Atlantic reference (4dae2a6), M1 the engine and its node checks (41647d3), M2 the storms in the page (4a0393b), M3 the
calibration and the climatology-anchored model (6a6fcdd), M4 Place mode and the preview (708b4da), M5 the season summary and the turn of the year (91c29dc), M6 save / resume and the
Continue card (9fc40aa), M7 the mutation checks and this pass (130923b) M8 the lifecycle, the rapid intensification, the three-hourly dots and the lighter engine, and M9 no walls (lakes are water, every limit a ramp, a hazard or a soft cap) and the clock at 4x to 64x with `Place`. `docs/roadmap.md` has an entry for each with the measured numbers and the caveats. Where what shipped differs from the plan above:

- **The model** is the four-part climatology-anchored one of the revision above, not the first design (steering blend, genesis by gates): the trial of milestone 2 showed that design could not be
  repaired by calibration.
- **Persistence** is not "a midnight checkpoint plus a replay of the logged actions". A save is a *light capture* of the weather generators' states and clocks, the storms as plain JSON and what the
  controls say, written at any hour (125-362 KB and 2-6 ms over a whole season; 135-540 KB and 2-7 ms since the fixes became three-hourly), and a restore takes fresh keyframes of the fields and the steering at the restored hour. A season saved at 00Z
  continues bit for bit like the uninterrupted one; saved at another hour the storms, fields and counters are identical at the moment of the resume and the continuation is statistical (the uninterrupted
  run would be working from keyframes up to a day old). No action log and no replay were needed. The save is written every 8 s while the clock runs, 1.2 s after a change while paused, when the page is
  hidden or closed and before the dock's Menu button navigates; the Menu "link" of the plan is a house button in the dock; the Continue card is a side column from 1100 px and sits above the basin grid below that.
- **The season summary** always draws the real 1991-2020 bands (the plan: until three of the player's own seasons exist) and adds the run's other seasons as thin lines; the first season of a run is
  counted from Jun 1. The Place line is solid for three days and fades after (the plan: about five).
- **After the first trials (milestones 3 and 8):** waves and lows are the first stages of one lifecycle (wave or low, then a disturbance once it has the potential to be a cyclone, then a depression),
  fixes and dots come every three hours (the ACE keeps to the synoptic 00 / 06 / 12 / 18Z ones), rapid intensification follows the conditions (calibrated to the real record, with a pinnacle index for the
  perfect environment), and the engine and the frame loop are lighter at 4x to 64x (milestone 8: a time budget per frame; milestone 9: the engine's own one-degree environment grid, six-hourly steering keyframes carried forward in time, the map's fine texture built only when drawn): `docs/roadmap.md`, milestones 8 and 9, have the numbers. Milestone 9 also removed the walls: `src/storms.js` has no threshold that switches a rule on or off and no clamp, each is a ramp, a hazard or a soft cap, lakes are water, and a perfect tropical environment lifts the fall of the potential wind with latitude.
- **The rollout (milestone 10):** the page code of the storm layer is one copy for all nine pages (`src/storm-hooks.js`, `src/storm-late.js`, `src/storm-ui.css`, `src/storm-ui.html`, inlined by the build; `tools/port_storms.mjs` carried the rest of the Atlantic's edits into the other templates, the plan's `tools/port_block.mjs`),
  the engine has a basin table (season start, names, the word for hurricane strength, waves or not), a southern season is July to June, and a basin's storms switch on when its data file carries its fitted climatology (the lab chain of `tools/tc_basins.json`, `storm_region.mjs`, `make_tc_basin.py`, `storm_fit.mjs --basin`, `storm_basin.mjs`); all nine are on (`docs/roadmap.md`, milestone 10, has each basin's numbers and misses; the South Atlantic and the Mediterranean are calibrated to the literature, `tools/tc_synthetic.json`, because the best-track tables hold no record of them). The storms read the page's humidity and shear, so the rollout also fixed their year-to-year part where it was wrong for a cyclone season (`tools/make_env_seasonality.py`: joint-lag El Nino coefficients and a gain by calendar month, in seven pages' data), and the engine has an El Nino term of its own (`par.enso`: activity and the move of the development region per degree of Nino 3.4, zero by default, fitted per basin).
- **The outlook and the equator (milestone 11):** one global part of the TC system, not a per-basin job (no data, calibration or fitting). `Manager.prototype.outlook` follows every disturbance that exists, every tracked low and the
  births the supply has already scheduled (the very generators `_spawn` uses: `_waveNext`, `_waveBirth`, `_localSeed`, `_floorSeed`) along their mean track through the page's environment held as anomalies decaying to the climate, integrates the engine's own development rate
  times the survival of the disturbance into the chance of formation in 2 and 7 days (steps of 5), and draws the area where most of the formation is expected as a hatched shape in the NHC's yellow, orange and red, with an X on a disturbance that exists and an arrow
  to its area while the conditions are not favourable yet; an issue every six hours, a lead model for the ones that do not exist yet (some come with no warning), invests (9x plus the region's letter) from the engine's own disturbance flag. The same milestone stopped a system crossing the
  equator (a soft floor on |latitude|), made remnant lows triangles and gave each basin its own intensity scale (`SCALES`, cut-offs converted to the engine's 1-minute wind). `docs/roadmap.md` (milestone 11) has the design, the numbers and the limits.
  The second round (after the first trial) made the outlook calm and simple: the engine keeps what the last issue said of every disturbance (`olMem`, saved with the season; a continuity key `ck` that an area has before its system is born and the system keeps) so a chance moves by at most 20 points per
  issue, a newcomer starts at 40 / 30 at most and a shape goes 30 % of the way (at most 2 degrees) to the new forecast; shapes are the zero line of a distance field (`swathFull`: one closed loop, a pole for the label), at most 14 degrees of track, kept 0.5 degrees from the shape of an older disturbance; the X is outside its shape, with an arrow, exactly while the 2-day chance is 0
  (a band of 1.5 and 3 % of raw chance between going out and coming in), the arrow is between 2.5 and 30 degrees long to the place where the chance has built up to 2.5 %, and one that stays for more than six issues loses the belief in its chances (down to half over twelve more); the page draws the X and the arrow in the colour of the chance, makes the wave or the L the X (with its title beside it), makes the issues one after another (`olEager`) and lets a click on a
  disturbance show it alone with a card (`#aoi-card`).
- **As planned, not built:** impacts (the cards show a dash for them), wind fields, the autosave switch and the GIF export (the cone landed with milestone 13: the consensus of the ensemble with the NHC's error circles, `docs/roadmap.md`).
- **Mutation checks** (`tools/storm_mutants.mjs`): the 24 edits of milestone 1 on the node tests, and 186 edits over milestones 3-11 on the node and browser checks, all caught after the checks were tightened where
  the first pass found a gap (`docs/roadmap.md`, milestones 7 to 9).

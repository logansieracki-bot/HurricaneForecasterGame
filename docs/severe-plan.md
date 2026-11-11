# Severe (tornadoes, hail, derechos): the plan

> **Planning only. Nothing of this is built.** First written on 11 Nov 2026 from the brief and four reference clips, and revised the same day with the answers to the first
> round of questions. *Measured* means measured in the sandbox that day (the scripts are in `tools/severe_research/`); *estimated* means arithmetic that the first benchmark page
> has to confirm on real devices. Figures from the meteorology literature are typical values from memory: where a number is going to be a test target, it is taken from the paper
> when that piece is built (marked *check*).

## 1. The brief

- **The whole discipline looks like a radar app:** dark, light and satellite themes. Not only the radar window: the drawing screen and the results too.
- **Simulation first.** Hypothetical days: set the conditions with guidance and start the run *easily*. **The weather is drawn:** place lows and highs, connect fronts, a dryline and
  the rest, each with an **arrow for the way it moves**. **Forecaster comes much later** and is not designed now, but nothing here may rule it out (truth and observation are kept apart
  from the first line, section 4; and a forecaster draws the same kind of chart).
- **A real microphysics system and a simulated atmosphere.** A 3-D cloud model with hydrometeors that fall, rime, melt and make hail, in an environment built from the drawing.
  Radar is *measured from* that model, as a real radar measures a real storm. No painted echoes.
- **Frames and a slider.** The run keeps a frame every 1, 3, 5 or 10 model minutes from the very first minute; a slider moves over all of them; the playback speed is selectable.
- **Resolution is spent where the storm is:** a coarse run of the whole region, and a fine one that follows one storm (section 6.7).

## 2. Decided so far (11 Nov 2026)

| Topic | Decision |
| --- | --- |
| "Satellite" | the **basemap only**. No satellite imagery product, so there is no satellite or lightning milestone |
| GPU | the full simulation requires **WebGPU**; only a slow, coarse CPU fallback exists without it |
| First phenomenon | supercells and tornadoes first; then squall lines and derechos; hail inside both |
| Time | the model runs faster than real time; the **playback speed is selectable**; a **frame slider** covers everything since the first frame; frames every **1, 3, 5 or 10** minutes **of game time**, chosen at any moment (it applies to the frames saved from then on); the speed (game minutes per real second) is independent of the interval. The model still steps every few seconds inside (it is unstable otherwise); only frames are kept |
| Real physics only | everything that appears on screen as weather comes out of the physics model. **No painted or analytic storms, ever:** analytic fields exist only inside tests (a rain shaft, a vortex) where the right answer is known exactly |
| Weather input | **lows, highs, fronts and the rest are placed by hand, each with an arrow** (section 6.2) |
| Drawing details | the feature list of section 6.2 is confirmed (lows, highs, the four fronts, dryline, troughs, outflow boundaries, upper trough and jet, low-level jet, moisture axis, wind arrows); every object has a motion arrow, and a separate wind-arrow tool makes wind |
| How the day follows the drawing | it should **look much like the drawing and still work meteorologically**: the large-scale pattern is held (several hours by default; a slider from "only the start" to "the whole run") and the model's physics does the rest |
| Satellite basemap | baked offline first (a "satellite-style" shaded relief from open data); NASA's free tiles later as an optional sharper layer |
| First release | the editor plus Lab runs from a tapped spot (end of S5); the Day (S6) and Zoom (S7) after it |
| Time of day and season | controls on the drawing screen (they set the sun and the heating) |
| Resolution | not the whole outbreak region at high resolution: a coarse *Day* for the region and a fine *Storm* nest that follows one storm |
| "Nudger" labels | the yellow `missed / merged / storm gone` labels of clips 3 and 4 come from another server's examples and are **not wanted now**, perhaps much later or never; "missed" is read as "no storm could form in that environment", which the model gives for free |
| Page, stamp, card | a separate Severe page; stamp "HYPOTHETICAL from Isobar Severe Simulator"; the menu card turns on at the end of S5. (My defaults, not yet confirmed: change any.) |

## 3. The four reference clips (the look to match)

| Clip | What it shows | What we take from it |
| --- | --- | --- |
| 1. Two panes on a satellite basemap | KDIX reflectivity and velocity side by side, vertical colour bars, a pill-shaped site label, a title chip, a tight rotation couplet in velocity | the **satellite theme**; two linked panes; velocity must show a couplet a few gates wide |
| 2. Dark hook echo | one pane, dark map, a hook-echo supercell near Enid and Stillwater, OK | **gate-scale speckle and ground clutter**; a hook only a few kilometres across: the operator has to produce texture, not blur |
| 3. Dark US map | a blurred moving cell on a state map and small yellow labels | the dark map look; the labels are not wanted now (section 2) |
| 4. Dark KINX | a big supercell or MCS with a magenta core and an unnaturally *straight* echo edge | the straight edge is exactly the painted-storm artefact to avoid; confirms the dark look at scale |

## 4. The decisions that shape everything (recommended defaults)

| Topic | Recommendation | Why |
| --- | --- | --- |
| Model | 3-D, **compressible, split-explicit** (acoustic substeps), Runge-Kutta 3 with 5th-order flux advection, a positive-definite limiter for all water fields, a 1.5-order TKE sub-grid scheme, perturbation form about a hydrostatic base state (the CM1 / WRF-ARW family) | only local stencils (no global pressure solve), the best-understood design for storms, and it maps to a GPU |
| Where it runs | **WebGPU compute (WGSL)** as the engine; a double-precision JS **reference** of the same algorithms as the test oracle and as a slow, coarse fallback | measured: plain JS is 2 to 7 s *per step* at 500 m (section 5) |
| Drawing the weather | an **editor** (lows, highs, fronts, dryline, troughs, jets, arrows) and a **builder** that turns the drawing into a balanced 3-D state, used as the initial state and as the large-scale target the runs are nudged towards | the same drawing then serves every run mode and, later, Forecaster |
| Run modes | **Lab** (one spot, 500 m), **Day** (the whole region, 2.5-3 km, hours) and **Storm** (500 m, follows one storm, re-simulated on demand from a Day frame) | the full region at 500 m does not fit (section 6.7) |
| Frames | the frame holds the *observable* fields (quantised), not the whole state; full-state checkpoints every ~30 model minutes only for zoom, resume and "what if" restarts | a slider over everything since the start is affordable (section 7.4) |
| Microphysics | a **ladder**: Kessler warm rain, then single-moment ice (cloud, rain, ice, snow, graupel, hail), then two-moment rain, graupel and hail | each rung is testable and shippable; the top rung gives dual-pol and hail sizes a reason to exist |
| Radar | a forward **observation operator** (beam geometry, noise, speckle, clutter, aliasing) on the model's fields, written once and used for every product, evaluated at display time from the stored frame | the radar can be moved after the run; the same operator serves Forecaster |
| Truth versus observation | the app only sees the model through observation operators; "truth" (swaths, tracks, where the front really is) is a separate set of fields | what makes a forecaster mode possible later |
| Page | a separate page (`severe`), its own shell; shares the menu, the places and impact idea, the summary and save conventions, the radar colour tables and the menu's surface-analysis drawing code; **not** part of the nine basin pages | the tropical engine and nest are reduced 2-D models and cannot be reused physically |
| Release | the menu card turns on when a user can pick or draw a day, press Start and watch a supercell with ice microphysics on the radar app (end of S5); before that, preview pages the menu does not link | a first release that is already worth using |

## 5. What was measured (11 Nov 2026, in the sandbox)

**CPU, plain JS, one thread, Float32Array** (`tools/severe_research/cpu_bench.mjs`: a 5th-order 3-D flux advection of one scalar and a Kessler-like warm-rain kernel; the
numbers move by about 15 percent from run to run):

| Grid | Cells | One scalar, one advection stage | Warm-rain kernel, dense, one pass | Step, estimated (3 stages × 12 / 15 / 21 advected fields + microphysics) |
| --- | --- | --- | --- | --- |
| 160 × 160 × 55 (500 m, 80 km box) | 1.41 M | 41 ms (34 M cell-updates per s) | 375 ms (3.8 M cells per s: pow and exp dominate) | **1.9 s / 3.4 s / 7.1 s** for warm rain / single-moment ice / two-moment |
| 80 × 80 × 40 (1 km) | 0.26 M | 9 ms | 64 ms | **0.4 s / 0.7 s / 1.3 s** |

The step estimate leaves out the acoustic substeps and the turbulence closure (add 30 to 60 percent); a sparse, table-driven microphysics would be several times cheaper
than the dense kernel (not measured). A two-hour run is 2,400 steps at 500 m (dt about 3 s): **hours on the CPU, so the CPU is a reference and a coarse fallback only.**

**GPU, estimated** (memory-traffic arithmetic: about 2.5 to 3 GB per step at 1.4 M cells and about 20 fields, which is about 1.8 kB per cell and step): roughly **36 ns per cell
and step on an integrated GPU (about 50 GB/s) and 4.5 ns on a discrete one (about 400 GB/s)**. At 1.4 M cells that is 40 to 80 ms and 5 to 10 ms per step, a two-hour storm in
about 1.5 to 3 minutes and 15 to 30 seconds. The first benchmark page measures this on the devices you actually use; the grids offered are set from it.

**WebGPU in the sandbox's headless Chromium: works, in software** (`tools/severe_research/webgpu_probe.mjs`). With `--enable-unsafe-webgpu` and a secure page (localhost)
`navigator.gpu` exists and a SwiftShader adapter runs compute shaders correctly (a 1 M-cell pass of 64 multiply-adds: 32 ms, the result checked against JS). Limits of that adapter worth
designing around: 10 storage buffers per shader stage, 1 GiB per storage buffer, 256 invocations per workgroup, no `shader-f16`. (Spec defaults are lower: 8 buffers, 128 MiB.) So **the
same WGSL can be tested in CI against the JS reference**, slowly and on small grids; speed can only be judged on real hardware. Without the flag the page gets `navigator.gpu` but no
adapter: the page must handle that.

**Data reachable through the sandbox's proxy** (checked, including byte-range reads):

- NEXRAD Level II archive: `unidata-nexrad-level2` (listing and range reads work; the `noaa-nexrad-level2` bucket answers AccessDenied from S3 itself).
- HRRR analyses and forecasts: `noaa-hrrr-bdp-pds` (`.idx` files and a single field at a single level by byte range; the hybrid-level files carry cloud, rain, snow, graupel and ice mass).
- GOES ABI imagery: `noaa-goes16` (HDF5-based NetCDF, `h5py` is installed): not needed now, there is no satellite product.
- Natural Earth vector data from `raw.githubusercontent.com`, the Natural Earth S3 bucket (rasters), `us-atlas` (states and counties) from npm, and the AWS open terrain tiles
  (`elevation-tiles-prod`, elevation PNGs): the material for a **baked** basemap.
- Python wheels install (pip is direct): `pygrib` (brings its own ecCodes), `arm_pyart` (NEXRAD Level II), `metpy` (soundings and indices: our test oracle).
- **Not reachable:** the Iowa Mesonet, SPC, the University of Wyoming and archive.org (so no archive of proximity soundings or storm reports; HRRR analysis profiles are the substitute),
  and every **map-tile host** tried: NASA GIBS, CARTO, Esri, OpenStreetMap and Stadia. A run-time tile layer therefore cannot be tested from the sandbox (a browser or a CI runner reaches them).

## 6. The atmosphere

### 6.1 The dynamical core

- **Equations:** fully compressible, flux form, perturbations about a hydrostatic base state, Coriolis on, moist buoyancy with the weight of all hydrometeors, latent heats of
  condensation, freezing and sublimation (Klemp & Wilhelmson 1978 style acoustic substepping inside a Wicker & Skamarock 2002 RK3 step).
- **Why compressible and not anelastic:** an anelastic model needs an elliptic solve every stage (FFT or multigrid): awkward on a GPU with open boundaries. Split-explicit
  needs only stencils. Cost: 4 to 6 acoustic substeps per step with an explicit vertical (a vertically implicit option, one tridiagonal solve per column, is the escape if the
  near-surface layers are made thinner than about 250 m).
- **Advection:** 5th-order upwind-biased fluxes, a monotone or positive-definite limiter on every water and number field (non-negative by construction: microphysics breaks
  on negative mass).
- **Sub-grid:** 1.5-order TKE with 3-D mixing at 500 m and finer; 6th-order background diffusion; a damping layer under the lid; open (radiation) lateral boundaries with a
  sponge and a relaxation zone towards the drawing (6.2), or periodic for lab days. A **Galilean frame** that moves with the storm keeps a long-lived supercell inside an 80 km box.
- **Surface and boundary layer.** The Lab can start with free slip, but a *Day* cannot: it needs surface heat and moisture fluxes with a diurnal cycle (from the sun's height and a
  soil-dryness setting), a boundary-layer scheme for the eddies a 2.5-3 km grid cannot see, and prescribed radiative heating and cooling. Without them the cap never erodes and no dryline
  storm ever forms. Drag with a roughness length matters for the cold pool and low-level rotation too.
- **Single precision on the GPU** is workable in perturbation form (the base state is exact, only small things are stored); the f64 reference run tells us when it stops being workable.
  **One storage buffer per time level, fields at offsets**, because of the buffers-per-stage limit above.
- **Flat ground first.** Terrain-following coordinates are a later option.

### 6.2 Drawing the weather: the analysis editor and the analysis builder

**What you do (the editor).** A map with the radar app's look and a drawing toolbar, in the manner of a surface analysis chart (the menu backdrop already draws one: numbered
isobars, L and H, wind barbs; that renderer is the starting point):

- **Pressure centres:** lows (L) and highs (H), with a central pressure, a size and a deepening or filling rate.
- **Fronts:** cold, warm, stationary and occluded, drawn as curves; an end can snap to a low so the front belongs to it and swings round it; the usual symbols (barbs and semicircles on
  the side the front moves towards). Temperature contrast and sharpness are properties.
- **Dryline** (with its moisture contrast), **surface troughs**, **outflow boundaries** (an old storm's gust front, the usual trigger of the next storm).
- **Upper air:** an upper trough and a **jet** axis with a speed, a **low-level jet** and a **moisture axis** (the warm, moist tongue of the return flow); plain **wind arrows**.
- **Every object carries an arrow for its motion** (direction and speed) and shows it; the arrow is also how a front's speed and a low's track are set. A feature drawn without an
  upper-air partner gets a sensible one ("auto upper air", a slider for its strength), so a beginner can draw a low and a front and press Start.
- **Live guidance while you draw:** labelled isobars, barbs, temperature and dew-point maps, and **mesoanalysis maps** (CAPE, CIN, 0-6 km shear, SRH and the composite indices) recomputed
  as you drag; a tap anywhere gives a skew-T and a hodograph for that spot; a "what to expect" box from published index thresholds; and **warnings when the drawing contradicts itself**
  (a cold front whose arrow points into the cold air; a dryline with no moisture contrast).
- **Presets are ready-made drawings** (section 8) that can be edited.

**What the builder does** (CPU code; the same function fills any grid, so a 500 m box and a 2.5 km region come from one drawing):

1. **Surface pressure** from the lows, highs and troughs (analytic profiles); fronts and the dryline add the pressure troughs along their lines.
2. **Air masses:** a warm-sector, a cold-sector, a dry-sector and a cool stable-sector sounding from the sounding generator (6.3), blended with smooth transitions across the fronts
   (typically 10-50 km for a cold front, 50-200 km for a warm front, 10-30 km for a dryline; *check*). The frontal surfaces **slope** (cold fronts about 1:50 to 1:100, warm fronts about
   1:100 to 1:300; *check*), so aloft the boundary lies over the cold air.
3. **Temperature and moisture in 3-D** from the blended soundings; **pressure and density by hydrostatic integration** from the surface pressure.
4. **Winds:** geostrophic from the 3-D height field, plus a friction layer (slower and backed near the ground; that also gives the convergence along troughs and fronts that lifts the
   air), plus the jet and low-level-jet objects. Wind shifts at fronts and the dryline come out of their pressure troughs.
5. **Everything is a function of (x, y, z, t):** the features move along their arrows and deepen at their set rates. The builder's output is the **initial state** and also the
   **target** that Lab and Day runs are *nudged* towards: the smoothed, large-scale part of the model's state is relaxed towards the target and the storm scales are left free. One
   slider sets how strictly the day holds to the drawing (from "only the start" to "holds for the whole run").
6. **A short adjustment run** (the model with strong damping) removes the imbalance that a drawn state always has before the storms are allowed to start.

**What it is not:** a forecast model. The drawing is the *large-scale truth* of the hypothetical day; the model adds what a drawing cannot hold (cold pools, outflow boundaries, storm
interactions, a front pushed ahead by a squall line). Both positions are shown, the drawn front and the model's own (found from the temperature gradient): that comparison is also the base
of a later Forecaster.

### 6.3 The environment at a point: soundings, indices, presets

- A **parametric sounding generator**, in terms a forecaster uses: mixed-layer depth and moisture, low and mid-level lapse rates, the cap (CIN), tropopause height and temperature,
  freezing level, and winds at 0, 1, 3, 6, 9 and 12 km with the shape of the hodograph. Plus the analytic Weisman-Klemp (1982) family used as the benchmark.
- **Derived readouts**, computed from definitions and checked against MetPy: MLCAPE, MLCIN, LCL, LFC, EL, 0-1, 0-3 and 0-6 km shear, SRH with Bunkers storm motion, bulk Richardson number,
  DCAPE, freezing level and wet-bulb zero height, and the composite indices (supercell, significant tornado, significant hail).
- **The "single-storm" view is a special case:** a horizontally uniform sounding and a bubble (the Lab with nothing drawn), which is also the benchmark set-up.

### 6.4 Initiation

A storm needs a trigger, and the trigger is part of the "hypothetical". In order of need: a **warm bubble** (+1.5 to +3 K, about 10 km wide and 1.4 km deep, the standard device; several
allowed); the **convergence along a drawn front, dryline or outflow boundary**, which is what the drawing is for; and, in a Day, the **heating of the day** eroding the cap. A little random
noise in the boundary layer is always added: a perfectly symmetric start gives perfectly mirrored split storms, which no real storm does. If the environment cannot support a storm, none forms.

### 6.5 Microphysics: the ladder

Every rung is first a **box model** (a rising parcel; a falling column) with conservation and positivity tests, then the same arithmetic in the 3-D model.

| Rung | Species | What it adds that is visible |
| --- | --- | --- |
| M1 Kessler | vapour, cloud, rain | saturation adjustment, autoconversion and accretion, rain evaporation and fall: the first real storm, cold pool and outflow |
| M2 single-moment ice | + ice, snow, graupel, hail | ice nucleation and deposition, Bergeron growth, riming, freezing of rain, melting at 0 °C (the **bright band**), sublimation, graupel to hail; real anvils, 60-70 dBZ cores, a hail core |
| M3 two-moment | + number of rain, graupel and hail (cloud and ice optional) | **size sorting** (big hail falls out first, a ZDR arc exists), wet growth and shedding, rain break-up: dual-pol products and **hail sizes** become honest |

- P3 (predicted particle properties) is a possible alternative to the categories later. Not the default: categories are easier to test and to explain.
- Constants of each scheme live in one table at the top of its file with the source of each number (from the papers, *check* before use). The schemes are written from the
  literature, not copied from a model, so the validation of section 10 is not optional.
- Latent-heat consistency is a test of its own: the total water and the moist enthalpy budgets of a closed box close to rounding error.

### 6.6 Hazards

| Hazard | Plan |
| --- | --- |
| Hail | hail content and (M3) the size distribution at the surface; a swath; a MESH-like radar estimate **next to** the truth, so the player can see how well radar sees it |
| Straight-line wind | surface gust diagnostics from the lowest levels with a sub-grid gust factor; downbursts come out of precipitation loading and evaporative cooling, they are not painted; swaths |
| Tornado | at 500 m the mesocyclone and the low-level rotation are resolved, the tornado (50-500 m wide) is **not**. Staged, and honest about each stage: (a) rotation tracks (low-level vertical vorticity and azimuthal shear maxima over time); (b) a "tornado potential" diagnostic from low-level vorticity, stretching and the rear-flank cold pool; (c) an embedded vortex for the radar's tornadic signature, **labelled as a parameterisation**; (d) an on-demand **nested large-eddy run** (50-100 m, a few kilometres wide) that makes a vortex or does not. Tornadogenesis is an open research problem: (d) is the real thing and may disappoint |
| Flooding rain | rain accumulation swaths: free from the model |
| Where the supercells are | **updraft helicity tracks** (the standard product of convection-permitting models) in the Day, so the player can see which cells rotate and zoom into one |

### 6.7 Domains: Day, Storm, Detail (and what fits)

The instinct to run the whole region coarsely and one storm finely is how research models are run: a **coarse parent and a fine child over the storm of interest**. The numbers
(estimated, from the arithmetic of section 5; 55 levels to about 18 km):

| Name | Grid and size | Cells | Step, integrated / discrete GPU | A run | Fits? |
| --- | --- | --- | --- | --- | --- |
| **Day** | 2.5-3 km, 800 × 600 km | 3-4 M | 0.11-0.15 s / 14-19 ms (dt about 10-12 s) | 6 h in about 3-6 min / 25-45 s | yes |
| Regional (optional) | 1 km, 400 × 300 km | 6.6 M | 0.24 s / 30 ms (dt about 5 s) | 6 h in about 17 min / 2 min | discrete GPUs |
| **Storm** | 500 m, 80 × 80 km, follows one storm | 1.4 M | 50 ms / 6 ms (dt about 3 s) | 2 h in about 2 min / 15 s | yes |
| **Detail** | 250 m, 40 × 40 km | 1.4 M | 50 ms / 6 ms (dt about 1.5 s) | 1 h in about 2 min | yes |
| Tornado nest | 50-100 m, about 5 km wide | about 0.6 M | | minutes of storm time | on demand |
| The whole region at 1 km | 800 × 600 km | 26 M | | | no: memory for fields and scratch is several GB |
| The whole region at 500 m | 800 × 600 km | about 105 M | 3.8 s / 0.5 s | 6 h in about 8 h / 1 h | **no** (about 75 times the Storm nest; memory 8 GB and more) |

**How the Day and the Storm work together** (one-way nesting, the usual 3:1 or 5:1 step; hence a Day at 2.5 km for a 500 m Storm, or an intermediate 1 km step from 3 km):

1. The Day runs once from the drawing and keeps its frames. Its picture is the *model's reflectivity* plus updraft-helicity tracks and the drawn fronts overlaid: a 2.5-3 km grid cannot
   give a radar's texture and does not pretend to.
2. You pick a storm and a time on the slider and press **Zoom**. The Storm run starts from that Day state (interpolated to 500 m) and is driven at its edges by the Day's frames; the
   box moves with the storm. It is a **re-simulation seeded from the Day storm, not the same storm**: it needs 15-30 minutes of spin-up to grow real structure, and may strengthen, weaken
   or split differently. The timeline marks where the zoom starts; before it the Day's frames, after it the Storm's.
3. The Day keeps a **full-state checkpoint** every ~30 model minutes; a zoom replays the Day from the nearest checkpoint alongside the Storm run, so the Storm gets boundary values at every
   step without the Day having stored whole states for every frame.
4. The **Lab** is the same Storm run without a Day: it takes the environment straight from the drawing (the builder fills the 500 m grid, horizontal gradients across a front or dryline
   included), so a point of the drawing can be simulated in minutes. A bigger **MCS box** (1 km, 400 × 200 km, 3.2 M cells) is the Lab for squall lines and bows.

## 7. The radar app

### 7.1 The observation operator (the part that makes it look measured)

- **Geometry:** the 4/3-earth beam model (a 0.5° beam is about 1.5 km above the ground at 100 km and about 4 km at 200 km: why far storms lose their hooks), a 0.9° beamwidth
  with Gaussian weighting across and a range weighting along the pulse, 250 m gates, 0.5° to 1° radials, the cone of silence.
- **Reflectivity:** the sixth moment of each species' size distribution through scattering tables (Rayleigh for rain and small ice; Mie or T-matrix tables for large wet hail,
  built by a Python tool and baked to a small file); melting layers and wet hail look like water; attenuation negligible at S band.
- **Velocity:** the reflectivity-weighted radial wind **plus the fall speed** of the hydrometeors (it matters at high tilts), spectrum width from the shear and turbulence inside the beam.
- **Noise and speckle from physics, not from a texture:** power from a random scatterer population is exponentially distributed; averaging the power of N independent samples gives a spread of
  about 4.3/√N dB (5.6 dB for a single sample; exactly 4.34·√ψ′(N) dB, ψ′ being the trigamma function). That *is* the gate-to-gate speckle of clip 2, and it gives us a closed-form test. The random numbers are seeded by (frame, radial, gate), so a frame always looks the same.
- **Artefacts, added one at a time:** ground clutter near the radar with a filter, velocity **aliasing** at the Nyquist velocity (with a dealiasing switch), range folding, a
  three-body scatter spike behind hail, sun spikes. Each is a switch.
- **Scanning:** VCP 12 and 212 style volumes (14 tilts from 0.5° to 19.5°, a volume in about 4-6 minutes); the radar placed anywhere, **also after the run**, because the operator
  works on the stored frame; a moving storm may show the sweep (each radial sampled at its own time) as an option.

### 7.2 Products (in the order they are built)

Base reflectivity and base velocity (S0), storm-relative velocity and spectrum width, composite reflectivity, echo tops, VIL (S3-S4); correlation coefficient, differential
reflectivity and specific differential phase (S8, they need drop-size information from M3); rotation tracks and hail swath as accumulated products (S8-S9).
The tropical floater already has the NWS reflectivity colours (`FL_BANDS`) and the velocity palette (`FL_VEL`): they carry over.

### 7.3 The look

- **Themes:** dark and light vector basemaps (state and county lines, roads, places with zoom-dependent labels, water) and a **satellite** basemap (nothing else is "satellite"). Radar
  colours are tuned per theme (low dBZ on white needs care).
- **The satellite basemap, a data decision** (question 1): the project's Blue Marble source is 2048 × 1024 (or 4096 × 2048) for the whole world, far too coarse at county scale, and
  every tile host is blocked from the sandbox. Two routes: **baked offline** from open data that is reachable (Natural Earth rasters at about 1.8 km per pixel, AWS terrain tiles for
  hillshade, a land tint): a "satellite-style" shaded-relief picture that works anywhere and can be tested; and/or **run-time tiles** (NASA GIBS Blue Marble at 500 m is free and needs
  no key; commercial tiles have terms): sharper, but an outside dependency and untestable here. Recommendation: bake first, add GIBS later as an optional sharper layer with the baked one as the fallback.
- **Pixelated like real radar (decided 11 Nov):** the storm underneath may be smooth, but the radar view shows what a radar shows. Each gate is a block (250 m in range by 0.5° to 1° in azimuth, drawn nearest-neighbour: never smoothed, never interpolated), the data are in steps, and the speckle, the noisy weak edge and the clutter of 7.1 are on it. Zooming in makes the blocks bigger, not smoother.
- **Panes:** one or two linked panes (reflectivity and velocity as in clip 1), vertical colour bars, a pill for the site and a title chip for product, tilt and time; a loop bar and
  the frame slider (7.4); tap to probe. **Overlays:** the drawn fronts and isobars (moving as the run does), updraft-helicity tracks, truth swaths.
- **The teaching view that only a simulation can give:** a probe that shows what the radar sees *and* what is true at that point (temperature, vertical velocity, hail size).
- **Exports** carry the hypothetical stamp.

### 7.4 Frames and playback

- **A frame** is the run's state *as the operators need it*: for the Storm and the Lab, reflectivity, the three wind components and (from M3) the dual-pol terms on the model grid,
  quantised to 8 bits and stored sparsely (most cells are empty): about 10 MB raw and 1-2 MB stored per frame at 500 m, so two hours at 5-minute frames is about 25 frames (some tens of MB),
  at 1-minute frames 120. A Day frame is a set of 2-D products (composite reflectivity, echo tops, updraft helicity, surface wind and gusts, temperature, dew point, pressure): under a megabyte.
- **Frame interval:** 1, 3, 5 or 10 minutes of game time (5 is a radar volume; 1 is for rotation and tornado studies; 10 for Days), selectable at any moment and applying to the frames saved from then on (the slider works on the stored time of each frame, so the spacing may differ between parts of a run). Frames are kept from the first minute and the slider spans
  all of them; frames not yet computed are greyed and the run keeps computing ahead of the playhead as fast as the device allows (it can be paused to save the battery).
- **Playback speed** is selectable (model minutes per second) and independent of how fast the run computes; scrubbing backwards is instant.
- **Checkpoints and branches:** a full-state checkpoint every ~30 model minutes allows resuming, **zooming** (6.7) and, later, "what if" restarts (change the shear or add a trigger at a
  frame and run on from there). Large stores go to the browser's origin-private file system rather than memory.
- **The model still steps every few seconds** (1-3 s at 250-500 m, 10-12 s in a Day); that is a stability limit, not something a frame system can skip. Only frames are kept.

## 8. Simulation mode: draw a day, press Start

1. **Pick a day** (a ready drawing with a one-line story and a thumbnail) or **start from nothing**.
2. **Draw and tune, with guidance** (6.2): place and edit the features and their arrows; watch the isobars and the mesoanalysis maps follow; tap for a skew-T and hodograph; read the
   warnings and the "what to expect" box; a few plain sliders (instability, low-level moisture, cap strength, shear, how strictly the day holds to the drawing, the time of day and the
   season). Everything has a default, so the shortest path is: pick a day, press Start.
3. **Choose what to run:** *Lab* at a spot you tap, the *Day* for the whole region, or an *MCS box*; the frame interval; the quality (*Quick* 1 km, *Standard* 500 m, *Detail* 250 m for Lab
   and Storm runs), suggested from the device's benchmark, with the estimated time shown. **Start.**
4. **Watch:** the Day view (model reflectivity, helicity tracks, the drawn fronts), the frame slider from the first frame, selectable speeds; **tap a storm and press Zoom** for the radar
   view of a Storm run; drag the virtual radar or pick a site; dark, light or satellite basemap.
5. **After:** a summary like the tropical one: swaths (hail, wind, rotation), the day's numbers, the drawn front against the model's, an image carrying the stamp.

**Presets, as drawings** (each can be edited): *dryline day on the southern Plains* (a deep lee low, a dryline, a cold front behind it, a warm front, a strong upper trough); *tornado
outbreak day* (a deep negatively tilted trough, a strong low, a large warm sector); *cold-front line* (a strong front with the shear along it: a linear storm mode); *high-plains hail day*
(a lee trough, upslope flow, a high cloud base and steep lapse rates); *Dixie Alley cool season* (a strong low-level jet and warm front, high shear, modest CAPE); *humid pulse-storm day* (a
stationary front and weak flow); *derecho set-up* (a stationary front, a strong low-level jet and dry mid-levels; needs the MCS box or a Day).

## 9. Compute plan

- **One step is many dispatches in one submission;** only small diagnostics (maximum w, a few budgets) and the frames are read back, asynchronously.
- **Stencil kernels** use workgroup tiles (for example 8 × 8 × 4) with shared memory; fields at offsets in one buffer per time level; perturbation variables; a fixed order of operations
  so a given GPU is repeatable. **Runs are not bit-identical across GPUs**: the record of a run is its inputs and its **frames and swaths**, not a promise of the same chaos twice.
- **Day and Storm together:** two models in one submission, the child reading the parent's boundary values every step; the Day replays from a checkpoint while the Storm runs (6.7).
- **CPU reference** (f64, same algorithms): the oracle for tests and the coarse fallback in Workers (about 10 to 45 minutes for a two-hour storm at 1 km on one thread, estimated; hours
  at 500 m); WASM SIMD only if the fallback turns out to matter.
- **The builder, the editor and the mesoanalysis maps are ordinary CPU code** (a coarse lattice of a few hundred columns: milliseconds), so they work on every device and are tested without a GPU.
- **CI:** a fast tier (reference only, small grids, a few minutes) and a SwiftShader tier (the WGSL kernels against the reference on tiny grids, tolerances set by experiment); the
  long validation runs are a separate workflow job so the tropical suite (about 44 minutes) does not grow.

## 10. How we know it is "real" (validation)

**Tests that need no literature:** hydrostatic rest stays at rest; advection of a translated Gaussian and a solid-body rotation converge at the scheme's order; a gravity wave has
its dispersion relation; mass, total water and moist enthalpy close; positivity; the speckle spread equals 4.34·√ψ′(N) dB; beam height equals the 4/3-earth formula; a solid-body or Rankine
vortex gives the analytic velocity couplet; aliasing arithmetic; the sounding calculator equals MetPy. **For the builder:** the 3-D state is hydrostatic to rounding error; its winds are
geostrophic away from the ground; the noise after the adjustment run (maximum vertical velocity and pressure tendency) is small against the storms' own; a drawn front moves at its arrow's
speed when nothing else acts; contradictions in a drawing are caught. **For nesting:** the child's large scales follow the parent's at its edges; results do not change when the box is
moved over a quiet area; the step ratio is varied.

**Benchmarks with published results** (numbers taken from the papers when built, *check*):
1. **Straka et al. (1993) density current:** a 15 K cold bubble (4 km × 2 km, centred at 3 km) in a neutral atmosphere with constant viscosity 75 m² s⁻¹; compare the front position and the extrema at 900 s with the published solution.
2. **Rising bubbles**, dry and moist (Bryan & Fritsch 2002).
3. **Weisman-Klemp (1982) supercell**, quarter-circle hodograph: splitting after roughly 40-60 minutes, a persistent right mover, a mid-level mesocyclone; a bulk Richardson number of about 10-45 gives
   supercells and above that multicells.
4. **Rotunno-Klemp-Weisman (1988) squall line:** the cold-pool speed from c² = 2∫(−B)dz against the measured propagation speed, and the dependence on low-level shear.
5. **Microphysics:** the parcel and column boxes; the Z-R of our own size distributions; the two-moment results against the published squall-line comparison.
6. **Regimes of a drawn day:** the storm *mode* follows the environment as it does in the literature (discrete supercells with a dryline and a shear vector across it; a line with a front and
   the shear along it), and the CAPE, shear and SRH of the presets fall inside the ranges of published proximity soundings (*check*).

**Against real storms** (the sandbox can fetch them): real NEXRAD volumes from the Unidata archive read with Py-ART, and the HRRR analysis for the same hour for the environment; compare
**CFADs** (reflectivity against height, the standard microphysics diagnostic), echo-top heights, hook scale, rotational velocity, hail-core extent. HRRR's own forecast of the event is a
second yardstick. The aim is *statistically realistic storms in matched environments*, not forecast skill.

**Mutation testing** (`tools/storm_mutants.mjs` style) on the reference kernels and on the builder, as for the tropical nest.

## 11. Milestones: each one has something to look at

Sizes are guesses relative to a tropical milestone such as 32: M about 2-3 of those, L 4-6, XL 8 or more.

| # | Milestone | What you can see | Size |
| --- | --- | --- | --- |
| S0 | **The radar app, the operator and the frame system, on recorded runs of the real model** (from S3; analytic fields such as a rain shaft or a vortex exist only inside the operator's tests). Dark, light and satellite themes, two panes, colour bars, site pills, speckle, clutter, aliasing, a draggable radar; **the frame slider, the 1/3/5/10-minute intervals and the speeds**. A preview page the menu does not link | the look of all three clips, on a real simulated storm, with a slider that works | L |
| S1 | **The analysis editor and builder, with no cloud model.** Lows, highs, the four fronts, dryline, troughs, jets, arrows; isobars and barbs; the mesoanalysis maps; skew-T and hodograph at a tap; warnings; the presets as drawings. Preview page | **draw a day, see where the CAPE and the shear are** | XL |
| S2a | **The real core, as a double-precision CPU reference:** compressible split-explicit dynamics in 3-D (and 2-D), with tests for rest, advection order, acoustic and gravity-wave speeds, and the Straka density current | the first real physics results (gate A1) | L |
| S2b | **The WGSL port and the benchmark page.** The same algorithm on the GPU, tested against the reference in CI (SwiftShader); the page prints milliseconds per step on the device and which grids it can afford | **real timings from your devices** (gate A2) | L |
| S3 | **Moist convection, warm rain (M1)**, as a Lab run: the Weisman-Klemp day first, run on the CPU reference at 1 km and **recorded**; the radar app plays the recording until the GPU port runs it live | **the first real storm on the radar** (gate B: met in the first 2 km run, which splits at about 50 minutes and keeps a rotating right mover; `docs/severe-research.md` part 2) | M |
| S4 | **Ice microphysics, single-moment (M2).** Bright band, anvil, hail core, 60-70 dBZ; velocity at tilts including fall speed; first CFAD comparison with real radar | storms with real structure (gate C: CFAD in range) | L |
| S5 | **Simulation mode, first release:** the editor and presets, Lab runs from a tapped spot, the frame slider and speeds, summary and stamped export. **The Severe card turns on.** | **draw or pick a day, tap a spot, press Start, watch a supercell** | L |
| S6 | **The Day:** the 2.5-3 km driver with surface fluxes, boundary layer and the diurnal cycle, nudged towards the drawing, storms initiated along the drawn boundaries, updraft-helicity tracks, the Day view | **draw fronts and lows and watch storms break out along them** (gate D: the regimes of section 10) | XL |
| S7 | **Zoom:** the 500 m Storm run from a Day frame (one-way nest, checkpoints, one timeline) | pick a storm in the Day and get its radar look | L |
| S8 | **Two-moment microphysics and dual-pol** (CC, ZDR, KDP), hail sizes, rotation and hail swaths, storm-relative velocity | the hail, ZDR arc and KDP foot of real supercells | XL |
| S9 | **Tornadoes:** rotation tracks, tornado potential, the embedded vortex, then the on-demand nested LES; a stamped damage swath | a tornadic signature on velocity | XL |
| S10 | **Squall lines and derechos** in the MCS box and in Days; **real days** (HRRR initial conditions, comparison with real radar) and the **groundwork for Forecaster** (hidden truth, warning polygons, scoring; the drawing tool reused to draw a forecast) | a bow echo; replay a real event; guess before you see | XL |

**Order (revised: the real physics first, the riskiest part first):** S2a, then S3 (the real core and the first real storm), then S0 (the radar app, on that recording) and S2b (the GPU port, which makes it live and decides the grid sizes) in either order; S1 (the drawing tool, which needs no cloud model) whenever you want to see it. S4 after S3. S6 and S7 come before S8
because they make the drawn fronts matter (S8 deepens what already works); they can swap if you want the microphysics first. Go/no-go gates (A1, A2, B, C, D): if one fails, the next piece does not
start until it is understood.

## 12. What carries over from the tropical side, and what does not

| Carries over | Does not |
| --- | --- |
| The menu card and flow; the build-a-page-from-`src` pattern; the radar colour tables; the surface-analysis drawing code of the menu backdrop (isobar contours with numbers, barbs, L and H); the summary-image and save/resume conventions; the places-and-impacts idea (with US towns); the research-document and mutation-testing habits; the stamp | the nest and the engine (`storm-nest.js`, `storms.js`): reduced 2-D models of a rotating tropical storm; the radar and infrared operators of the nest; everything basin- or ocean-specific |

## 13. Risks, said plainly

1. **A correct, stable 3-D cloud model in WGSL and single precision** is the largest technical risk and nothing of the kind exists in this repo yet. Mitigation: the f64 reference, small steps, gate A.
2. **Microphysics is a rabbit hole.** The rule is to implement a published scheme faithfully, validate it, and only then tune within its published uncertainty. Real is not the same as correct: operational models disagree with each other.
3. **Speed is unmeasured on real GPUs.** The numbers above are arithmetic; the benchmark page comes first so the product is sized by facts.
4. **A drawing is not a balanced atmosphere.** Blended air masses can be unphysical, and a drawn wind field produces gravity-wave noise. Mitigation: build from balance, run the adjustment, nudge only the large scales, warn about contradictions, test on the presets (gate D).
5. **The Day may do too much or nothing.** Initiation along a dryline depends on a cap, heating and convergence all being about right, and a 2.5-3 km grid is crude for it. The mesoanalysis maps warn before the run; the regimes test (section 10, item 6) calibrates it; a bubble or a drawn boundary is always available to force the issue.
6. **A zoomed storm is not the Day's storm.** It is a re-simulation with a spin-up and may differ; the timeline says so. A concurrent follow-nest (the box moving with the storm during the Day itself) is a possible later step.
7. **Tornadoes are not resolved by a storm-scale grid.** Say what each stage is (diagnostic, parameterised, or resolved) on screen.
8. **Devices.** WebGPU is in current Chrome and Edge and, as far as I know, in recent Safari and Firefox (*verify on your devices*); phones and tablets have tighter memory; hence the grid choice. Drawing on a touch screen needs its own care.
9. **Test time.** The tropical suite already takes about 44 minutes; Severe needs its own tiers (section 9).
10. **Basemap and data licences** (question 1): public-domain data for vectors, a decision for imagery.
11. **Scope.** The ladder is ordered so that every rung is usable; stopping after any rung leaves something real, not a half-built engine.

## 14. Open questions

None at the moment: the first round of five is answered and recorded in section 2. New ones are added here as they come up.

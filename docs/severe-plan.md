# Severe (tornadoes, hail, derechos): the plan

> **Planning only. Nothing of this is built.** Written on 11 Nov 2026 from the brief and four reference clips. *Measured* means measured in the sandbox that day
> (the scripts are in `tools/severe_research/`); *estimated* means arithmetic that the first benchmark page has to confirm on real devices. Figures from the meteorology
> literature are typical values from memory: where a number is going to be a test target, it is taken from the paper when that piece is built (marked *check*).

## 1. The brief

- **The whole discipline looks like a radar app:** dark, light and satellite basemaps. Not only the radar window: the setup screen and the results too.
- **Simulation first.** Hypothetical days: set the conditions with guidance and start the run *easily*. **Forecaster comes much later** and is not designed now, but the
  architecture must not rule it out (section 3: truth and observation are kept apart from the first line).
- **A real microphysics system and a simulated atmosphere.** A 3-D cloud model with hydrometeors that fall, rime, melt and make hail, in an environment built from
  soundings and fronts. Radar, and later satellite, are *measured from* that model, as a real radar measures a real storm. No painted echoes.

## 2. The four reference clips (the look to match)

| Clip | What it shows | What we take from it |
| --- | --- | --- |
| 1. Two panes on a satellite basemap | KDIX reflectivity and velocity side by side, vertical colour bars, a pill-shaped site label, a title chip, a tight rotation couplet in velocity | the **satellite theme**; two linked panes; velocity must show a couplet a few gates wide |
| 2. Dark hook echo | one pane, dark map, a hook-echo supercell near Enid and Stillwater, OK | **gate-scale speckle and ground clutter**; a hook only a few kilometres across: the operator has to produce texture, not blur |
| 3. Dark US map | a blurred moving cell on a state map and small yellow labels `nudger #n: missed / merged / storm gone` | **not a radar product**; the mechanic behind the labels is unknown (question 1) |
| 4. Dark KINX | a big supercell or MCS with a magenta core, an unnaturally *straight* echo edge, one `nudger #1: missed` label | the straight edge is exactly the painted-storm artefact to avoid; confirms the dark look at scale |

## 3. The decisions that shape everything (recommended defaults, change any)

| Topic | Recommendation | Why |
| --- | --- | --- |
| Model | 3-D, **compressible, split-explicit** (acoustic substeps), Runge-Kutta 3 with 5th-order flux advection, a positive-definite limiter for all water fields, a 1.5-order TKE sub-grid scheme, perturbation form about a hydrostatic base state (the CM1 / WRF-ARW family) | only local stencils (no global pressure solve), the best-understood design for storms, and it maps to a GPU |
| Where it runs | **WebGPU compute (WGSL)** as the engine; a double-precision JS **reference** of the same algorithms as the test oracle and as a slow, coarse fallback | measured: plain JS is 2 to 7 s *per step* at 500 m (section 4) |
| Grids | *Quick* 1 km (0.26 M cells), *Standard* 500 m (1.4 M), *Detail* 250 m for strong GPUs; 55-60 levels to about 18 km, 100-150 m near the ground | the supercell is resolved at 500 m; the tornado is not (section 5.5) |
| Microphysics | a **ladder**: Kessler warm rain, then single-moment ice (cloud, rain, ice, snow, graupel, hail), then two-moment rain, graupel and hail | each rung is testable and shippable; the top rung is what gives dual-pol and hail sizes a reason to exist |
| Radar | a forward **observation operator** (beam geometry, noise, speckle, clutter, aliasing) on the model's fields, written once and used for every product | the same operator will serve Simulation and, later, Forecaster |
| Truth versus observation | the app only sees the model through observation operators; "truth" (swaths, tracks) is a separate set of fields | what makes a forecaster mode possible later |
| Page | a separate page (`severe`), its own shell; shares the menu, the places and impact idea, the summary and save conventions and the colour tables of the tropical radar; **not** part of the nine basin pages | the tropical engine and nest are reduced 2-D models and cannot be reused physically |
| Release | the menu card turns on when a user can pick a day, press Start and watch a supercell with ice microphysics on the radar app (end of S4); before that, a preview page that the menu does not link | a first release that is already worth using |

## 4. What was measured (11 Nov 2026, in the sandbox)

**CPU, plain JS, one thread, Float32Array** (`tools/severe_research/cpu_bench.mjs`: a 5th-order 3-D flux advection of one scalar and a Kessler-like warm-rain kernel; the
numbers move by about 15 percent from run to run):

| Grid | Cells | One scalar, one advection stage | Warm-rain kernel, dense, one pass | Step, estimated (3 stages × 12 / 15 / 21 advected fields + microphysics) |
| --- | --- | --- | --- | --- |
| 160 × 160 × 55 (500 m, 80 km box) | 1.41 M | 41 ms (34 M cell-updates per s) | 375 ms (3.8 M cells per s: pow and exp dominate) | **1.9 s / 3.4 s / 7.1 s** for warm rain / single-moment ice / two-moment |
| 80 × 80 × 40 (1 km) | 0.26 M | 9 ms | 64 ms | **0.4 s / 0.7 s / 1.3 s** |

The step estimate leaves out the acoustic substeps and the turbulence closure (add 30 to 60 percent); a sparse, table-driven microphysics would be several times cheaper
than the dense kernel (not measured). A two-hour run is 2,400 steps at 500 m (dt about 3 s): **hours on the CPU, so the CPU is a reference and a coarse fallback only.**

**GPU, estimated** (memory-traffic arithmetic: about 2.5 to 3 GB per step at 1.4 M cells and about 20 fields): roughly **40 to 80 ms per step on an integrated GPU and
5 to 10 ms on a discrete one**, so a two-hour storm in about 1.5 to 3 minutes and 15 to 30 seconds. This is the number the first benchmark page measures on the devices
you actually use; the grids offered by "Quick / Standard / Detail" are set from it.

**WebGPU in the sandbox's headless Chromium: works, in software** (`tools/severe_research/webgpu_probe.mjs`). With `--enable-unsafe-webgpu` and a secure page (localhost)
`navigator.gpu` exists and a SwiftShader adapter runs compute shaders correctly (a 1 M-cell pass of 64 multiply-adds: 32 ms, the result checked against JS). Limits of that adapter worth designing around: 10 storage buffers per shader stage,
1 GiB per storage buffer, 256 invocations per workgroup, no `shader-f16`. (Spec defaults are lower: 8 buffers, 128 MiB.) So **the same WGSL can be tested in CI against the
JS reference**, slowly and on small grids; speed can only be judged on real hardware. Without the flag the page gets `navigator.gpu` but no adapter: the page must handle that.

**Data reachable through the sandbox's proxy** (checked, including byte-range reads):

- NEXRAD Level II archive: `unidata-nexrad-level2` (listing and range reads work; the `noaa-nexrad-level2` bucket answers AccessDenied from S3 itself).
- HRRR analyses and forecasts: `noaa-hrrr-bdp-pds` (`.idx` files and a single field at a single level by byte range; the hybrid-level files carry cloud, rain, snow, graupel and ice mass).
- GOES ABI imagery: `noaa-goes16` (listing works; HDF5-based NetCDF, `h5py` is installed).
- Natural Earth vector data from `raw.githubusercontent.com`; `us-atlas` (states and counties) from npm.
- Python wheels install (pip is direct): `pygrib` (brings its own ecCodes), `arm_pyart` (NEXRAD Level II), `metpy` (soundings and indices: our test oracle).
- **Not reachable:** the Iowa Mesonet, SPC, the University of Wyoming and archive.org. So the archive of proximity soundings and storm reports is out; HRRR analysis
  profiles are the substitute, and storm reports have to come from somewhere else (not needed before the Forecaster mode).

## 5. The atmosphere

### 5.1 The dynamical core

- **Equations:** fully compressible, flux form, perturbations about a hydrostatic base state, Coriolis on, moist buoyancy with the weight of all hydrometeors, latent heats of
  condensation, freezing and sublimation (Klemp & Wilhelmson 1978 style acoustic substepping inside a Wicker & Skamarock 2002 RK3 step).
- **Why compressible and not anelastic:** an anelastic model needs an elliptic solve every stage (FFT or multigrid): awkward on a GPU with open boundaries. Split-explicit
  needs only stencils. Cost: 4 to 6 acoustic substeps per step with an explicit vertical (a vertically implicit option, one tridiagonal solve per column, is the escape if the
  near-surface layers are made thinner than about 250 m).
- **Advection:** 5th-order upwind-biased fluxes, a monotone or positive-definite limiter on every water and number field (non-negative by construction: microphysics breaks
  on negative mass).
- **Sub-grid:** 1.5-order TKE with 3-D mixing at 500 m and finer; 6th-order background diffusion; a damping layer under the lid; open (radiation) lateral boundaries with a
  sponge, or periodic for lab days. A **Galilean frame** that moves with the storm keeps a long-lived supercell inside an 80 km box.
- **Surface:** free slip at first; then drag with a roughness length and an optional surface heat flux. It matters for the cold pool and for low-level rotation, so it is a
  planned step, not an afterthought.
- **Single precision on the GPU** is workable in perturbation form (the base state is exact, only small things are stored); the f64 reference run tells us when it stops
  being workable. **One storage buffer per time level, fields at offsets**, because of the buffers-per-stage limit above.
- **Flat ground first.** Terrain-following coordinates are a later option.

### 5.2 The environment: "the day"

- The primary object is a **sounding**: temperature, dew point, and a wind profile (a hodograph). Two sources: a parametric generator (below) and the analytic
  Weisman-Klemp (1982) family used as the benchmark.
- **Parametric generator**, in terms a forecaster uses: mixed-layer depth and moisture, low and mid-level lapse rates, the cap (CIN), tropopause height and temperature,
  freezing level, and winds at 0, 1, 3, 6, 9 and 12 km with the shape of the hodograph (straight, curved, quarter-circle, with or without a low-level jet).
- **Derived readouts**, computed from definitions and checked against MetPy: MLCAPE, MLCIN, LCL, LFC, EL, 0-1, 0-3 and 0-6 km shear, SRH with Bunkers storm motion,
  bulk Richardson number, DCAPE, freezing level and wet-bulb zero height, and the composite indices (supercell, significant tornado, significant hail).
- **Later (S6): the day has a spatial structure.** A dryline, a front, an outflow boundary or a low-level jet as horizontal gradients of the sounding (balanced through the
  thermal wind), a diurnal boundary layer, a 1-3 km driver domain that hands boundary conditions to moving storm-scale nests.
- **Presets** (each a sounding with a one-line story and a hodograph thumbnail): southern Plains dryline supercell; high-plains hail day (high cloud base, steep lapse
  rates); Dixie Alley cool-season, high shear, modest CAPE, low LCL; humid pulse storm (weak shear, high CAPE); low-topped supercell; high-precipitation supercell; bow
  echo and derecho (needs S6); QLCS in strong low-level shear (needs S6).

### 5.3 Initiation

A storm needs a trigger, and the choice of trigger is part of the "hypothetical". The defaults, in order of need: a **warm bubble** (+1.5 to +3 K, about 10 km wide and 1.4 km
deep, the standard device; several allowed), a **convergence line or outflow boundary**, and later a **dryline or front** that comes from the day's structure. A little random
noise in the boundary layer is always added: a perfectly symmetric start gives perfectly mirrored split storms, which no real storm does.

### 5.4 Microphysics: the ladder

Every rung is first a **box model** (a rising parcel; a falling column) with conservation and positivity tests, then the same arithmetic in the 3-D model.

| Rung | Species | What it adds that is visible |
| --- | --- | --- |
| M1 Kessler | vapour, cloud, rain | saturation adjustment, autoconversion and accretion, rain evaporation and fall: the first real storm, cold pool and outflow |
| M2 single-moment ice | + ice, snow, graupel, hail | ice nucleation and deposition, Bergeron growth, riming, freezing of rain, melting at 0 °C (the **bright band**), sublimation, graupel to hail; real anvils, 60-70 dBZ cores, a hail core |
| M3 two-moment | + number of rain, graupel and hail (cloud and ice optional) | **size sorting** (big hail falls out first, a ZDR arc exists), wet growth and shedding, rain break-up: dual-pol products and **hail sizes** become honest |

- P3 (predicted particle properties) is a possible alternative to the categories later. Not the default: categories are easier to test and to explain.
- Constants of each scheme live in one table at the top of its file with the source of each number (from the papers, *check* before use). The schemes are written from the
  literature, not copied from a model, so the validation of section 9 is not optional.
- Latent-heat consistency is a test of its own: the total water and the moist enthalpy budgets of a closed box close to rounding error.

### 5.5 Hazards

| Hazard | Plan |
| --- | --- |
| Hail | hail content and (M3) the size distribution at the surface; a swath; a MESH-like radar estimate **next to** the truth, so the player can see how well radar sees it |
| Straight-line wind | surface gust diagnostics from the lowest levels with a sub-grid gust factor; downbursts come out of precipitation loading and evaporative cooling, they are not painted; swaths |
| Tornado | at 500 m the mesocyclone and the low-level rotation are resolved, the tornado (50-500 m wide) is **not**. Staged, and honest about each stage: (a) rotation tracks (low-level vertical vorticity and azimuthal shear maxima over time); (b) a "tornado potential" diagnostic from low-level vorticity, stretching and the rear-flank cold pool; (c) an embedded vortex for the radar's tornadic signature, **labelled as a parameterisation**; (d) an on-demand **nested large-eddy run** (50-100 m, a few kilometres wide) that makes a vortex or does not. Tornadogenesis is an open research problem: (d) is the real thing and may disappoint |
| Flooding rain | rain accumulation swaths: free from the model |

### 5.6 Domains and the resolution ladder

| Name | Grid | Cells | Use |
| --- | --- | --- | --- |
| Supercell lab (default) | 500 m, 80 × 80 × 18 km | 1.4 M | one to three storms; the S2-S5 workhorse |
| MCS / derecho | 1 km, 400 × 200 × 18 km | 3.2 M | squall lines and bows; cold-pool dynamics are credible at 1 km, updraft detail is not |
| The day | 3 km, 800 × 600 km | a few M, fewer fields | the driver for S6; hands boundaries to nests |
| Tornado nest | 50-100 m, about 5 × 5 × 5 km | about 0.5 M | S7, on demand |

## 6. The radar app

### 6.1 The observation operator (the part that makes it look measured)

- **Geometry:** the 4/3-earth beam model (a 0.5° beam is about 1.5 km above the ground at 100 km and about 4 km at 200 km: why far storms lose their hooks), a 0.9° beamwidth
  with Gaussian weighting across and a range weighting along the pulse, 250 m gates, 0.5° to 1° radials, the cone of silence.
- **Reflectivity:** the sixth moment of each species' size distribution through scattering tables (Rayleigh for rain and small ice; Mie or T-matrix tables for large wet hail,
  built by a Python tool and baked to a small file); melting layers and wet hail look like water; attenuation negligible at S band.
- **Velocity:** the reflectivity-weighted radial wind **plus the fall speed** of the hydrometeors (it matters at high tilts), spectrum width from the shear and turbulence inside the beam.
- **Noise and speckle from physics, not from a texture:** power from a random scatterer population is exponentially distributed; averaging N independent samples gives a spread of
  about 5.6/√N dB. That *is* the gate-to-gate speckle of clip 2, and it gives us a closed-form test.
- **Artefacts, added one at a time:** ground clutter near the radar with a filter, velocity **aliasing** at the Nyquist velocity (with a dealiasing switch), range folding, a
  three-body scatter spike behind hail, sun spikes. Not everything on day one; each is a switch.
- **Scanning:** VCP 12 and 212 style volumes (14 tilts from 0.5° to 19.5°, a volume in about 4-6 minutes), the radar placed anywhere, each radial sampled at its own time so a
  moving storm shows the sweep.

### 6.2 Products (in the order they are built)

Base reflectivity and base velocity (S0), storm-relative velocity and spectrum width, composite reflectivity, echo tops, VIL (S2-S3); correlation coefficient, differential
reflectivity and specific differential phase (S5, they need drop-size information from M3); rotation tracks and hail swath as accumulated products (S5-S7).
The tropical floater already has the NWS reflectivity colours (`FL_BANDS`) and the velocity palette (`FL_VEL`): they carry over.

### 6.3 The look

- **Themes:** dark and light vector basemaps (state and county lines, roads, places with zoom-dependent labels, water) and a **satellite** basemap. Radar colours are tuned per
  theme (low dBZ on white needs care). The satellite basemap is a data decision (question 2): the project's Blue Marble source is 2048 × 1024 for the whole world, far too
  coarse at county scale.
- **Panes:** one or two linked panes (reflectivity and velocity as in clip 1), vertical colour bars, a pill for the site and a title chip for product, tilt and time; a loop bar
  and a scrub bar; tap to probe.
- **The teaching view that only a simulation can give:** a probe that shows what the radar sees *and* what is true at that point (temperature, vertical velocity, hail size).
- **Exports** carry the hypothetical stamp (question 8).

### 6.4 Satellite and lightning (S8)

Visible imagery from cloud optical depth with sun-angle shading of overshooting tops, infrared brightness temperature (the tropical side's cloud-top and colour-bar work applies),
and a lightning flash-rate diagnostic from graupel and ice (non-inductive charging proxy) for a GLM-like layer. These share the model; they cost no new dynamics.

## 7. Simulation mode: pick a day, press Start

1. **Pick a day:** cards with a one-line story, a hodograph thumbnail and the headline numbers.
2. **Tune, with guidance:** about six plain sliders (instability, low-level moisture, moisture depth, cap strength, shear, low-level turning), each with a plain sentence about what
   it does ("more shear: longer-lived rotating storms; too much, and storms are torn apart"); a live **skew-T and hodograph**; the derived numbers; a **"what to expect"** box from published
   index thresholds, labelled as guidance from the parameters, not as output of the run.
3. **Trigger and radar:** auto (a physically sensible boundary or bubble, the default), or choose; a radar site picker, or drag a virtual radar to any spot.
4. **Start:** one button; the run length and the grid are chosen from the benchmark of the device (*Quick*, *Standard*, *Detail*), with the estimated time shown. The model runs faster than
   real time (on a GPU) and the radar loop plays behind it; a scrub bar rewinds.
5. **After:** a summary like the tropical one: swaths (hail, wind, rotation), the day's numbers, an image carrying the stamp.

## 8. Compute plan

- **One step is many dispatches in one submission;** only small diagnostics (maximum w, a few budgets) and the radar sweeps are read back, asynchronously.
- **Stencil kernels** use workgroup tiles (for example 8 × 8 × 4) with shared memory; fields at offsets in one buffer per time level; perturbation variables; a fixed order of operations
  so a given GPU is repeatable. **Runs are not bit-identical across GPUs**: the record of a run is its inputs and its **radar frames and swaths**, not a promise of the same chaos twice.
- **Scrub and replay:** store sweeps (and a few truth swaths) per scan, and full-state checkpoints every ten model minutes on request; memory budgets decided from the benchmark.
- **CPU reference** (f64, same algorithms): the oracle for tests and the coarse fallback in Workers (about 10 to 45 minutes for a two-hour storm at 1 km on one thread, estimated; hours at 500 m);
  WASM SIMD only if the fallback turns out to matter.
- **CI:** a fast tier (reference only, small grids, a few minutes) and a SwiftShader tier (the WGSL kernels against the reference on tiny grids, tolerances set by experiment); the
  long validation runs are a separate workflow job so the tropical suite (about 44 minutes) does not grow.

## 9. How we know it is "real" (validation)

**Tests that need no literature:** hydrostatic rest stays at rest; advection of a translated Gaussian and a solid-body rotation converge at the scheme's order; a gravity wave has
its dispersion relation; mass, total water and moist enthalpy close; positivity; the speckle spread equals 5.6/√N dB; beam height equals the 4/3-earth formula; a solid-body or Rankine
vortex gives the analytic velocity couplet; aliasing arithmetic; the sounding calculator equals MetPy.

**Benchmarks with published results** (numbers taken from the papers when built, *check*):
1. **Straka et al. (1993) density current:** a 15 K cold bubble (4 km × 2 km, centred at 3 km) in a neutral atmosphere with constant viscosity 75 m² s⁻¹; compare the front position and the extrema at 900 s with the published solution.
2. **Rising bubbles**, dry and moist (Bryan & Fritsch 2002).
3. **Weisman-Klemp (1982) supercell**, quarter-circle hodograph: splitting after roughly 40-60 minutes, a persistent right mover, a mid-level mesocyclone; a bulk Richardson number of about 10-45 gives
   supercells and above that multicells.
4. **Rotunno-Klemp-Weisman (1988) squall line:** the cold-pool speed from c² = 2∫(−B)dz against the measured propagation speed, and the dependence on low-level shear.
5. **Microphysics:** the parcel and column boxes; the Z-R of our own size distributions; the two-moment results against the published squall-line comparison.

**Against real storms** (the sandbox can fetch them): real NEXRAD volumes from the Unidata archive read with Py-ART, and the HRRR analysis for the same hour for the environment; compare
**CFADs** (reflectivity against height, the standard microphysics diagnostic), echo-top heights, hook scale, rotational velocity, hail-core extent. HRRR's own forecast of the event is a
second yardstick. The aim is *statistically realistic storms in matched environments*, not forecast skill.

**Mutation testing** (`tools/storm_mutants.mjs` style) on the reference kernels, as for the tropical nest.

## 10. Milestones: each one has something to look at

Sizes are guesses relative to a tropical milestone such as 32: M about 2-3 of those, L 4-6, XL 8 or more.

| # | Milestone | What you can see | Size |
| --- | --- | --- | --- |
| S0 | **The radar app and the operator, on analytic volumes** (a rain shaft, a rotating column, a hook-shaped analytic supercell: test fixtures, not a simulator). Dark, light and satellite themes, two panes, colour bars, site pills, loop, speckle, clutter, aliasing, a draggable radar. A preview page the menu does not link | the look of all three clips, on your phone or computer | L |
| S1 | **The core and the benchmark page.** Dry compressible core in WGSL plus the f64 reference; rest, advection, gravity wave, warm bubble, Straka. The page prints milliseconds per step on the device and which grids it can afford | a cold pool in a slice; **real timings from your devices** (gate A) | L |
| S2 | **Moist convection, warm rain (M1).** Weisman-Klemp day, bubble, Galilean frame; the radar app plays it | **the first real storm on the radar** (gate B: it splits and rotates as published) | M |
| S3 | **Ice microphysics, single-moment (M2).** Bright band, anvil, hail core, 60-70 dBZ; velocity at tilts including fall speed; first CFAD comparison with real radar | storms with real structure (gate C: CFAD in range) | L |
| S4 | **Simulation mode.** Presets, sliders with guidance, skew-T and hodograph, the derived numbers, Start, speed control, scrub, summary and stamped export. **The Severe card turns on.** | **pick a day, press Start, watch a supercell** | L |
| S5 | **Two-moment microphysics and dual-pol** (CC, ZDR, KDP), hail sizes, rotation and hail swaths, storm-relative velocity | the hail, ZDR arc and KDP foot of real supercells | XL |
| S6 | **The day:** a 1-3 km driver with a dryline, front, outflow and low-level jet, a diurnal cycle, moving nests; squall lines and derechos at 1 km | multi-storm days, a bow echo | XL |
| S7 | **Tornadoes:** rotation tracks, tornado potential, the embedded vortex, then the on-demand nested LES; a stamped damage swath | a tornadic signature on velocity | XL |
| S8 | **Satellite imagery and lightning** | visible and infrared with overshooting tops; flashes | M |
| S9 | **Real days** (HRRR initial conditions, comparison with real radar) and the **groundwork for Forecaster** (hidden truth, warning polygons, scoring; possibly what the "nudger" labels are) | replay a real event; guess before you see | XL |

**Order:** S0 and the S1 benchmark first (S0 is the visible win; the benchmark decides the grid sizes), S2 and S3 in series, S4 once S2 runs (it can start in parallel with S3).
Three go/no-go gates (A, B, C above): if one fails, the next piece does not start until it is understood.

## 11. What carries over from the tropical side, and what does not

| Carries over | Does not |
| --- | --- |
| The menu card and flow; the build-a-page-from-`src` pattern; the radar colour tables; the summary-image and save/resume conventions; the places-and-impacts idea (with US towns); the research-document and mutation-testing habits; the stamp | the nest and the engine (`storm-nest.js`, `storms.js`): reduced 2-D models of a rotating tropical storm; the radar and infrared operators of the nest; everything basin- or ocean-specific |

## 12. Risks, said plainly

1. **A correct, stable 3-D cloud model in WGSL and single precision** is the largest technical risk and nothing of the kind exists in this repo yet. Mitigation: the f64 reference, small steps, gate A.
2. **Microphysics is a rabbit hole.** The rule is to implement a published scheme faithfully, validate it, and only then tune within its published uncertainty. Real is not the same as correct: operational models disagree with each other.
3. **Speed is unmeasured on real GPUs.** The numbers above are arithmetic; the benchmark page comes first so the product is sized by facts.
4. **Tornadoes are not resolved by a storm-scale grid.** Say what each stage is (diagnostic, parameterised, or resolved) on screen.
5. **Devices.** WebGPU is in current Chrome and Edge and, as far as I know, in recent Safari and Firefox (*verify on your devices*); phones and tablets have tighter memory; hence the grid choice.
6. **Test time.** The tropical suite already takes about 44 minutes; Severe needs its own tiers (section 8).
7. **Basemap and data licences** (question 2): public-domain data for vectors, a decision for imagery.
8. **Scope.** The ladder is ordered so that every rung is usable; stopping after any rung leaves something real, not a half-built engine.

## 13. Open questions

1. **What are the yellow `nudger #n: missed / merged / storm gone` labels in clips 3 and 4?** My two guesses: a forecasting mechanic (you nudge a storm's forecast position and are scored: a Forecaster feature)
   or storm-initiation triggers you place (a Simulation feature, the "missed" meaning that no storm formed). Which, if either, do you want?
2. **The look:** is clip 1 (satellite basemap, two panes) or the dark single pane the main look, with the other two as themes? Is "satellite" the **basemap** only, or also **satellite imagery** as a product (S8)? For the basemap,
   a sharp one means either online tiles at run time (easy, but the project has stayed offline and single-file) or a few MB of baked imagery per region.
3. **GPU stance:** is it acceptable that the full simulation requires WebGPU, with only a slow coarse fallback otherwise? Which devices do you actually use?
4. **First phenomenon:** supercell and tornado first (recommended: it is what clips 2 and 4 show), then squall line and derecho, then hail as part of both?
5. **Geography:** the US Plains first and only (the NEXRAD look), or other countries later?
6. **Run style:** faster than real time, then scrub (recommended), or strictly real time?
7. **Page:** a separate Severe page (recommended) rather than inside the basin pages?
8. **Stamp wording** for anything saved or copied: "HYPOTHETICAL from Isobar Severe Simulator"?
9. **When does the menu card turn on:** after S4 (recommended), with a hidden preview before?

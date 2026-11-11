# Severe research notes

Measurements and checks behind the Severe discipline (the plan is `docs/severe-plan.md`). Newest part last. Scripts that are not part of the test suite are in
`tools/severe_research/`.

## Part 1. The real core (milestone S2a, 11 Nov 2026)

### What it is

`src/severe-core.js` is a fully compressible, non-hydrostatic cloud-model core in double precision, written to be the **reference** that the WebGPU port will be tested against, so it
favours being simple and checkable over being fast. Nothing in it is painted or fitted: it integrates the equations of motion.

- **Equations:** Klemp & Wilhelmson (1978), in perturbations about a hydrostatic base state: the winds, the potential temperature θ′ and the Exner function π′. The pressure equation
  is the exact one for dry air, with the base-state advection inside a density-weighted divergence, so a base state at rest is *exactly* at rest (no base-state pressure gradient is
  ever computed).
- **Space:** an Arakawa C grid, uniform spacing, a halo of three cells, walls (free slip, nothing through) or periodic boundaries; a 2-D slice is a grid with `ny = 1`.
- **Advection:** the 5th-order upwind-biased flux form of Wicker & Skamarock (2002), written as flux differences minus the field times the divergence of the advecting flow, so a
  constant field is never changed. One generic routine serves all four grid positions (centres, u, v and w faces).
- **Time:** their RK3; each stage integrates the fast acoustic terms (the pressure gradient and the divergence) with forward-backward small steps while the slow tendencies stay
  fixed, plus **divergence damping** (coefficient 0.1, as in WRF's `smdiv`).
- **Also in:** a constant viscosity, Coriolis (3-D), passive tracers, a stratified base state from any θ(z).
- **Not in yet:** moisture and microphysics, a sub-grid turbulence closure, open lateral boundaries, a stretched vertical grid, surface fluxes. Each is a later step of the plan.

### What was found while building it: a late blow-up, and its cure

The first version had no divergence damping. The Straka run was clean until about 800 s and then blew up (π′ from 2·10⁻³ to 0.5, winds of 400 m/s in 100 s), **but only for some
time steps**: 1 s, 3 s and 4 s survived, 1.5 s and 2 s did not; 4 times more acoustic substeps cured it. That pattern (a growth that depends on how the fast and slow steps happen to
line up) is the signature of acoustic noise that the plain forward-backward scheme does not damp. With divergence damping at 0.1 every time step from 1 to 4 s gives **the same**
answer (front 14.7 km, coldest −10.05 to −10.11 K, w up to 12.6 m/s at 200 m), which is what a correct time integration should do.

### What the tests check (`tests/severe_core.mjs`, 11 checks, 14 s)

| Check | Result |
| --- | --- |
| a stratified base state at rest stays at rest | exactly (0 in every field) |
| a tracer carried once round a periodic domain by a uniform wind | error 0.89 % at 1 km and 0.079 % at 500 m (a factor 11 for a halved grid); a constant tracer is unchanged to rounding; in 3-D (y) 0.46 % |
| a sound pulse | travels 20,710 m in 60 s against 20,761 m expected (c = 346.0 m/s): 0.25 % short, and keeps half its amplitude in each direction |
| an internal gravity wave | period 1408 s against 1405 s from ω = N k / √(k² + m²) |
| Coriolis | an inertial oscillation with u = U cos ft, v = −U sin ft, to three decimals |
| a 3-D bubble in a square box | the x-y symmetry holds to 1.4·10⁻¹⁵ |
| the Straka density current at 200 m | front between 14 and 16 km, coldest air between −11 and −8.5 K (and, with `SLOW=1`, the 100 m run agrees within 0.5 km) |

### The Straka et al. (1993) density current

A −15 K cosine bubble (4 km × 2 km, centred at 3 km height) in a neutral atmosphere of 300 K with a constant viscosity of 75 m² s⁻¹, half the domain run (the symmetry plane is a
wall), 900 s. The picture is `docs/severe-research/straka-50m.png`: the cold air falls and spreads (300 s), a head and a Kelvin-Helmholtz rotor form (600 s), and at 900 s the
front is at 14.7 km with the head's billows and the trailing rotor.

| Grid | dt | Front (−1 K on the ground) | Coldest | Largest w | Largest u |
| --- | --- | --- | --- | --- | --- |
| 200 m | 2 s | 14.70 km | −10.07 K | 12.6 m/s | 33.0 m/s |
| 100 m | 1 s | 14.72 km | −9.11 K | 12.1 m/s | 33.4 m/s |
| 50 m | 0.5 s | 14.72 km | −8.82 K | 12.1 m/s | 33.5 m/s |

The front does not move with the grid (14.70, 14.72, 14.72 km): the solution has converged in space for the front, the winds and the structure, and the coldest air is still easing
(−10.07, −9.11, −8.82 K). How much the physics matters is the viscosity: at 100 m, K = 50 / 75 / 100 m² s⁻¹ gives fronts at 14.84 / 14.72 / 14.60 km, coldest air −10.02 / −9.11 /
−8.43 K and w up to 14.4 / 12.1 / 11.2 m/s.

**Against the published solution, said plainly:** the paper's reference values are, from memory, a front at about 15 km and coldest air near −9.8 K with somewhat stronger winds; the
paper itself cannot be reached from the sandbox (WRF's open-source test case `em_grav2d_x`, reached through `raw.githubusercontent.com`, names it and uses the same settings: K = 75,
5th-order horizontal advection, divergence damping 0.1, but gives no numbers). Our front is about 2 % short and our extremes 10 to 15 % weaker, which is the size of changing K by a
quarter and is plausible from the way the diffusion is discretised, but it is **not yet checked against the paper's table**; that is the first thing to do when a copy is at hand.

### Speed

Plain JavaScript, one thread, double precision: the 200 m case (4,096 cells, 450 steps) takes about 1 s, the 100 m case (16,384 cells, 900 steps) 7 s and the 50 m case
(65,536 cells, 1,800 steps) 75 s: about 0.6 µs per cell and step in 2-D. A 3-D run costs a few times more per cell; the 1 km Weisman-Klemp storm of the next step (about 100,000 cells,
dt about 6 s) should take of the order of 0.15 s per step, a couple of hours of storm time in minutes. That is the CPU reference; the GPU port is a separate step.

### Next

Moisture (θ_v, vapour, cloud and rain with the Kessler scheme, rain fall), a sub-grid closure and the Weisman-Klemp sounding with a warm bubble: the first real storm (milestone S3).
The open-source WRF microphysics (`phys/module_mp_kessler.F` and its relatives, readable through `raw.githubusercontent.com`) is there to check constants against while the schemes are
written from the equations.

## Part 2. Moisture, and the first real storm (milestone S3, 11 Nov 2026)

### What was added to the core

- **Moist dynamics:** the buoyancy and the pressure gradient use the density potential temperature θᵥ = θ (1 + 0.608 q_v − q_c − q_r), so the weight of cloud and rain is in the buoyancy; the base state
  is hydrostatic in θᵥ; the heat released by condensation also enters the pressure equation (the expansion it causes), as a compressible model must.
- **Kessler's warm-rain scheme as in WRF's `module_mp_kessler`** (read through `raw.githubusercontent.com`; written from its equations, constants checked): rain falls with
  36.34 (0.001 ρ q_r)^0.1364 √(ρ₀/ρ) in steps short enough for a Courant number of 0.75; autoconversion 0.001 (q_c − 0.001) and accretion 2.2 q_c q_r^0.875 (implicit); rain evaporates
  in subsaturated air with Kessler's ventilation formula; one Newton step of saturation adjustment condenses or evaporates cloud. Once per step, after the dynamics.
- **Positive-definite advection of cloud and rain**, in flux form with the base-state density and the outgoing flux of every cell scaled so that it cannot give away more than it holds
  (Skamarock & Weisman 2009, WRF's `moist_adv_opt = 1`): conservative, and nothing goes negative. Why it was needed: with the unlimited 5th-order scheme, clipping the negative undershoots at
  the cloud edge **added about 15 % spurious cloud water** in a 25-minute bubble run (1.6·10⁴ kg per metre against 1.1·10⁵ kg of cloud); with the limiter nothing is clipped, and the water budget
  of that run improved from 5.4·10⁻³ to 1.7·10⁻³.
- **Damping:** a Rayleigh layer under the lid (5 km deep, 0.003 s⁻¹, as in WRF's case) and a lateral sponge, both relaxing the perturbations (and the winds towards the base-state winds).

### What the tests check (`tests/severe_moist.mjs`, 12 checks, 3 s)

| Check | Result |
| --- | --- |
| condensation conserves water and moist enthalpy | to rounding (0 and 2·10⁻¹¹ J/kg of 236) |
| one step of saturation adjustment from 3 % supersaturation | leaves the air −0.01 % from saturation |
| autoconversion and accretion | rain 0.0200 g/kg and 0.1611 g/kg, equal to the hand calculation (the fall of the cell's own rain included) |
| a rain shower falling and evaporating in dry air | the column's water budget closes to 3·10⁻¹⁶, 1.1 mm reach the ground, the heat budget to 10⁻⁶, the air cools by up to 1.7 K, nothing is clipped |
| the sounding's surface parcel (pseudo-adiabatic ascent, an independent calculation) | CAPE 2134 J/kg, condensation level 1010 m, level of free convection 1630 m, equilibrium level 11,990 m (√(2 CAPE) = 65 m/s) |
| a 3 K warm bubble in a 2-D slice of the sounding, 25 minutes | updraft 33 m/s at 22 minutes, 3.3 g/kg of cloud, first cloud at 1250 m (10 minutes), 0.3 mm of rain, water budget 1.7·10⁻³, nothing clipped |

### The first real storm: the Weisman-Klemp supercell

The set-up is WRF's `test/em_quarter_ss`: an 84 km square, 20 km deep, a 2 km grid with 500 m levels, the Weisman-Klemp (1982) sounding with its quarter-circle hodograph (the winds already
shifted so that the storm stays in the box; the file is `tools/severe_research/wk82_sounding.txt`), a +3 K bubble 10 km wide and 1.5 km deep centred at 1.5 km, no ice, a constant viscosity of
500 m² s⁻¹, periodic sides with a 10 km sponge. `tools/severe_research/wk82_run.mjs 2000 120 10 out.json` runs it: **two hours of storm time in two minutes** (0.17 s per 10 s step on 70,560 cells: about
2.4 µs per cell and step in 3-D with moisture). The picture is `docs/severe-research/wk82-2km.png`.

| Minute | Updraft (m/s) | Coldest air at the ground (K) | Rain water (g/kg) | Echo top (dBZ) | Vorticity 1 km / 3-5 km (10⁻³ s⁻¹) | Updraft helicity (m² s⁻²) | Updraft cores at 5 km |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 15 | 19.6 | −0.5 | 4.0 | 51 | 1.8 / 4.9 | 113 | 1 |
| 25 | 36.7 | −3.2 | 15.0 | 58 | 1.9 / 7.9 | 256 | 1 |
| 35 | 40.9 | −5.2 | 16.7 | 59 | 1.0 / 9.0 | 303 | 1 |
| 45 | 36.6 | −8.3 | 16.0 | 58 | 3.7 / 7.7 | 249 | **2** |
| 60 | 44.9 | −8.7 | 15.0 | 58 | 4.1 / 8.7 | 182 | **2** (24 and 23 m/s, 14 km apart) |
| 75 | 44.4 | −8.8 | 17.4 | 58 | 5.0 / 9.4 | 232 | 4 |
| 90 | 35.5 | −9.1 | 15.9 | 59 | 5.8 / 10.7 | 372 | 4 |
| 105 | 31.1 | −10.1 | 14.6 | 58 | 3.9 / 11.9 | 85 | 2 |

What it shows, in the order of the pictures: a single cell grows to 41 m/s by 35 minutes and its cold pool spreads; between 40 and 60 minutes **a second updraft core appears and the storm splits** into a left mover
(to the north) and a right mover (to the south and east), as the quarter-circle hodograph makes it; **the right mover keeps a mid-level vorticity of 0.008 to 0.013 s⁻¹** (the usual threshold of a mesocyclone is about 0.01)
and a low-level vorticity that grows to 0.006 s⁻¹, and an updraft helicity of 250 to 370 m² s⁻² (strongly rotating storms of a 2 km model are above 75 to 100), until the storms drift into the sponge at the east edge
at about 100 minutes and decay. The cold pool of −8 to −10 K and the heavy rain (up to 66 mm) are those of a warm-rain supercell. **Gate B of the plan (it splits and rotates as published) is met qualitatively;** the
splitting at 40 to 60 minutes and the 40 to 45 m/s updraft are in the range of published simulations of this sounding (from memory, not checked against the paper).

**Said plainly:**
- *Warm rain only.* There is no ice: no anvil, no hail, no bright band, and the reflectivity from the rain mixing ratio caps near 59 dBZ (the 16 g/kg of rain is more than a real storm holds at one place).
  Ice microphysics is the next step.
- *A 2 km grid.* The echo is a large smooth blob: the hook and the rear-flank structure of clip 2 need 1 km or finer (below).
- *Viscosity, not a turbulence closure.* The constant 500 m² s⁻¹ is WRF's own setting for this case at this grid, but a 3-D closure comes later.
- *The water budget of the full run* is not a conservation test (the sponge feeds the base state in at the edges, which is what an open boundary does); the 25-minute bubble run without a sponge closes to 1.7·10⁻³.
- *Not compared with the paper's numbers:* the paper cannot be reached from the sandbox.

### The same storm at 1 km

`wk82_run.mjs 1000 120 6 out.json`: the same set-up on 282,240 cells (84 km square, 1 km grid, viscosity 250 m² s⁻¹), 767 s of CPU for the two hours (0.64 s per 6 s step: 2.3 µs per cell and step).
The picture is `docs/severe-research/wk82-1km.png`. The story is the same and sharper:

| Minute | Updraft (m/s) | Coldest air (K) | Vorticity 1 km / 3-5 km (10⁻³ s⁻¹) | Updraft helicity (m² s⁻²) | Updraft cores at 5 km (m/s at x, y km) |
| --- | --- | --- | --- | --- | --- |
| 15 | 21.7 | −0.5 | 3.2 / 11.1 | 475 | 1 |
| 25 | 37.3 | −4.0 | 2.2 / 17.8 | 890 | 1 |
| 35 | 55.8 | −6.4 | 5.1 / 16.9 | 670 | 1 |
| 45 | 48.6 | −7.1 | 8.7 / 19.6 | 510 | **2**: 34 at 50, 42 and 29 at 43, 50 |
| 55 | 49.2 | −8.1 | 7.1 / 22.4 | 469 | 2: 34 at 54, 41 and 27 at 45, 52 |
| 65 | 51.2 | −8.7 | 9.1 / 20.9 | 496 | 2: 35 at 58, 39 and 26 at 48, 57 |
| 85 | 43.1 | −10.1 | 9.8 / 17.3 | 524 | 4 (the right mover at 66, 35) |
| 105 | 43.5 | −8.8 | 8.2 / 13.0 | 434 | 4 (the right mover at 75, 39, at the sponge) |

The updraft is stronger (56 m/s at 35 minutes), the split happens a little earlier (at about 45 minutes), the mid-level vorticity of the right mover is 0.017 to 0.022 s⁻¹ and its low-level vorticity 0.007 to
0.010 s⁻¹ (a strong low-level mesocyclone), the updraft helicity 380 to 890 m² s⁻², and the right mover is followed for 60 minutes as it moves south-east from (50, 42) to (75, 39) km. The echo is notched on its
south-west side at 45 and 60 minutes, the first sign of the rear-flank structure of a supercell; **a hook echo proper needs 500 m and ice**, and the rain is still capped at 59 dBZ.

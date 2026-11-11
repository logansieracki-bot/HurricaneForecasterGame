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

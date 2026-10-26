# Roadmap

## Just landed
- **Storms, milestone 16, second round: the radar of weak systems, transitions, landfalls, subtropical storms and eyes made realistic; a scale that grows with the storm.**
  *What you asked (after the first screenshots):* (1) invests and very weak depressions to tropical storms were three to six tiny blobs: in a favourable environment they should have strong, large, widespread, disorganised convection everywhere; (2) a system turning extratropical or making landfall must not shrink to a small glitchy circle: the core opens while convection goes on forming, the **scale gets very large** and the rain stays widespread (tropical moisture pushed inland; an extratropical transition does the same but slower, or deepens while larger with an open, nearly closed core); (3) a strict circular cut-off for the eye is unrealistic: blobs of convection form round it, or it fades better; (4) over land and near the coast convection went from nothing to a strict line (two screenshots: a coastline that stops the rain dead, and a line of convection at it); (5) the eye should clear out fully, more often; (6) the Doppler velocity was too smooth; (7) a weakening system left only a small circle of very weak echo and nothing else tried to form; a tropical storm is usually one big blob of rotating convection; **nothing at all round the eye** (a last screenshot); **no radar for subtropical systems**; and later: **the scale of the simulation should change as the tropical cyclone gets larger**; a cyclone should **look dried out or sheared** (lopsided), extratropicals are not symmetric either; and southern-hemisphere cyclones must **spin the right way**.
  *What the first version did wrong, found by rendering it:* the rain of a weak system was the vortex's own lift (a disc with a sharp edge where the vorticity of a Rankine-like core stops) plus a Gaussian trickle of background ascent over 170 km, a single rain-rate per unit of lift (no cores), a linear noise that left a mean and no tail; a transition's shield was one smooth Gaussian; land dried the column in 40 minutes and made friction a step; the box edge faded every supply; and the eye mask was a circle that cleared only the convective rain, so the stratiform skirt of the eyewall filled the eye.
  *What it is now* (`src/storm-nest.js`): **weak and disorganised systems** (blended in over 41 to 64 kt of mean wind, `orgV`) are made by the broad ascent of a moist tropical atmosphere over the area the system fills (its size is read from its own wind table: where the wind falls to 34 kt, `sizeOf`; the weather decides how much of it is alive, the humidity range being the page's own, 28 to 69 % with a median of 48 in the tropics in season, measured), through a **heavy-tailed multiplicative variability at three scales** (cells of 4 to 6 km, clusters of 30 km, mesoscale areas of 64 km and more, carried and sheared by the flow into arcs and bands: a third field `cl2`), the supply's vortex part being blurred over 10 km for a weak vortex so there is no disc; **heavier cells rain more per unit of condensation** (the precipitation efficiency grows with the updraught, `pcx`) so a cell of a depression reaches 50 dBZ; the **stratiform rain of every cell is made from its own blurred convective rain** (`gsC`), a skirt that fades out; **water and rain flow in and out of the box openly** (clamped, not periodic) and the supply no longer fades toward the box edge for a large system, so a shield goes on beyond it; a hurricane has an **inner-core rain** (`inA`: a rain shield with embedded cells out to a few radii of maximum wind, the first bands) so there is rain round the eye; **land** dries the air over tens of km (`landK`), takes only a tenth of the supply (`landSq`) and its roughness is smoothed over 16 km (`landR`), so the rain goes on across a coast and fades over 100 km or so inland, with a gentle coastal enhancement, not a line; the **eye** has a ragged soft edge (its radius varies with the cluster noise by 30 %), clears from 43 to 70 kt (it was 47 to 82) and is cleared of the stratiform rain too (the source is cut and the leftover decays), and a transitioning low loses it (`eyeA` x (1 - 0.9 eta)); an **extratropical transition** scales its warm-sector shield, convective front and dry slot with the size of the system (`Lsc`, 150 to 420 km), as convection embedded in the shield through the heavy-tailed variability and not a smooth blanket; **the cold air aloft of a subtropical or transitioning system makes up for a cool sea** (`cold`: an effective sea temperature up to 27.5 C), and a subtropical system is a hybrid (40 % of a transition's lift and shield, no eye): over 21 C water its radar covers 53 % of the box against 16 % for a tropical-type storm of the same size; subtropical disturbances can open a floater too (`S.sub`).
  *Lopsided storms:* **shear** puts the convection on the downshear-left side (a factor 1 + 1.3 x amplitude x cos of the angle to it, from 3 to 13 m/s of shear, a storm that is strong resists by 45 %): a hurricane in 20 kt of shear from the west is wet over 56 % of its downshear-left third and 11 % of its upshear-right third, a tropical storm 0.26 and a depression 0.1 of that ratio; **dry air** on one side (the page's humidity there 3 to 30 points below the storm's own, so a storm in air that is dry everywhere is not starved, only a side that is drier than the rest) starves the supply of that side to 12 % and dries the column in an hour: the dry half of a hurricane is wet over 13 % against 25 % for the other half and 31 % for the same storm in moist air; an extratropical low's lopsidedness is its geometry (the comma, the front, the dry slot) and its subtropical cousin's the same at 40 %.
  *The scale* (`HFNest.scaleOf`, `scaleForcing`, `Nest.rescale`, `m` in the nest and the floater): the nest is always 256 x 256 cells; for a storm whose true size (the 34 kt radius) needs more than 512 km (1.25 of its size must fit) every length is divided by a scale m (1 to 3, in quarter steps, with a 20 % hysteresis, and the radius of maximum wind kept at 9 cells or more) and so is every speed (a storm m times smaller and m times slower: vorticity, rotation rates, times, rain rates unchanged; the boundary layer's pumping constant is multiplied by m, the speed thresholds read the true speed, the radar's wind is in true m/s), so the cells are 2 m km and the box 512 m km: a very large hurricane (R34 550 km) gets 4 km cells in a 1024 km box. The floater checks it at every hour, resamples the fields about the storm's centre when it changes (the area of the rain stays within a factor three), re-frames the map and says it ("4 km cells") in its subtitle; the land and the environment grids, the sites, the rings, the texture and the Doppler geometry follow. A hurricane of 150 nmi R34 already has 2.5 km cells; most are at 2 to 2.5.
  *The radar's picture:* a **texture** (`texture`, the supply's own noise carried by the flow, 25 % at cell scale and 45 % at cluster scale on the stratiform rain, 25 % and 15 % on the convective) is put on what is drawn (not on the model's fields), so the stratiform field is patchy like a real one; the **Doppler velocity** is the nest's wind plus a turbulence of 1 m/s and 6 % of the wind and 0.45 of the square root of the rain rate (correlated over a few km, gone in 7 minutes) and the **outflow of the downdraughts** of the heavy cells (away from the rain, 700 m x the rain's gradient, at most 9 m/s): 2.7 m/s rms, a gate-to-gate change of 2.2 m/s against 0.3 for the smooth wind. The nest costs 28 ms a step (it was 23) and 31 with the turbulence on.
  *Southern hemisphere:* the nest works in a northern frame and the host mirrors it (rows, heading, shear, steering, the environment and the land grids, the Doppler winds), so the winds turn clockwise on the map and the rain spirals in clockwise. It was checked rather than changed: the Doppler couplet check on the Australian page (clockwise: red on the left of the line from the radar to the centre), a new check that a southern system and its northern mirror twin (same storm, mirrored latitude and motion, steering and shear mirrored) hand the nest the same forcing (heading, shear direction, flow of the layers), and the existing mirror mutants (the heading, the land, the Doppler sign). A picture-based test of the sense of the spiral was tried and dropped: the rain pattern of a held vortex does not turn fast enough in a quarter of an hour to measure (the Doppler and the forcing are the exact tests).
  *Tests:* **81 node checks** in `tests/nest.mjs` (30 new: a depression's widespread convection, a disturbance's rain areas counted, a tropical storm as one large mass, the environment deciding, a ragged edge, a weakening hurricane keeping its rain area, a remnant over land, a very large transition with embedded convection that goes on beyond the box, the eye clear in 5 of 5 runs and ragged, the texture, the radar's wind and the cells' outflow, the coast not a cliff and no line at it, the fade inland, the inner-core rain, shear and dry-air lopsidedness in a hurricane, a tropical storm and a depression, the mirror twin, the scale (choice, hysteresis, eye resolved, the scaled forcing keeping the circulation, a huge storm holding its wind, the radar's wind in true speed, a change of scale while running), subtropical hybrid and radar over cool water) and browser checks on every page (a subtropical storm and a subtropical disturbance have the button and a radar picture; a very large storm gets a larger scale, a larger frame and a picture that fills it; the disturbance's strongest cell under 60 dBZ). Mutants **N1-N45 and F1-F17** on the nest and the floater (MUTANT_COUNT in all; twelve of the first round's were rewritten for the new code, 28 are new; see the tool's header for the drivers). Changed checks, and why: the old "dry surroundings" and "rainbands" checks asked for a clear carpet-free field round the eye (it is a rain shield with gaps now: 25 to 90 %), the land check asked that land take two thirds of the rain (it fades it over 100 km now), the right-front check compares a storm with itself still (the lead is a 1.2 gain; a single ratio of two sides is noisier than that), the tropical storm centre check averages three seeds.
  *Known limits:* the box is still 256 cells (a very large storm is coarser, 4 to 6 km cells, not finer anywhere); a change of scale resamples (the picture jumps a little and the cells change size); no terrain (the coast's friction and the drying are all there is: no orographic rain); the shear and dry-air asymmetries are the supply's, not a tilted vortex, so the centre of a very sheared storm is not drawn exposed on its own; the picture's texture and the Doppler turbulence are statistics of what a 2-km grid cannot hold, not cells; a southern-hemisphere check of the rain's sense of spiral by the picture was not possible (the forcing and the Doppler are tested); satellite (infrared) is still the next push.
- **Storms, milestone 16: the radar floater, a 2-km model of the inside of one storm drawn as radar (satellite is next).**
  *What you asked:* "the absolute hardest thing any radar sim has ever done": a 2 km physics model for radar (and satellite, later); first the radar. For any disturbance or higher you can open the **radar floater**: it takes an area round the system with some room, **slows time below the lowest the page has**, with adjustable speeds like the clock's but much slower, shows radar (and later satellite) **over land too**, with the **past path and the current location**, the **cone, the ensembles and the wind fields** as overlays, and **realistic growth, eyewall replacement cycles and extratropical transition**. Your steers on the way: the five reference images show a physics model that **uses real convection to build a tropical cyclone** (so the nest was rebuilt around convection that makes the vortex, not rain painted on a wind field); the picture **must not be blurry**; and **how symmetrical the storm is must depend on the conditions on its sides**.
  *The physics, and the dead end on the way:* the first try was the full moist-convective rotating shallow-water model (Bouchut et al. 2009; Rostami and Zeitlin 2017-2022: a C-grid, a rain-out threshold, the condensation heating the layer) written in node. It is unusable here: explicit gravity waves force a step of about 10 s, forward-Euler blew up in the kinetic-energy gradient and the continuity, the periodic box left a wave seam, and what it drew was noise. What shipped is the **balanced limit** of the same model (the gravity waves left out, so the step is 2 minutes, 20 to 25 ms of computing): a 256 x 256 grid of 2 km cells (a 512 km square that follows the storm), the low-level **vorticity advected by its own winds** (semi-Lagrangian, Catmull-Rom cubic, clamped), the winds from the vortex's circulation and flux through circles of each radius (so the far field is exact) plus a periodic Poisson solve on a 128 x 128 grid with an FFT, tapered to nothing at the box's edge. The **boundary layer** (a slab: Ekman pumping of the surface stress, `w = k curl(Cd |u| u) / (f + zeta)`, a vorticity inflow, drag 2.4e-3 over sea and 5e-3 over land) lifts moist air; a **column of water** Q rains out above a threshold in ten minutes (rain capped so it cannot run away), fed by that convergence, by the sea (**evaporation grows with the wind**: WISHE) and by a background ascent and mesoscale clusters that the swirl **shears into spiral arms**; the **rain's mass flux stretches the vorticity** (`d zeta / dt = (f + zeta)(W - w) / H`): convection builds the vortex, the eyewall's hot towers, the mesovortices and the vortex Rossby waves, and the boundary layer's suction spins it down. Rain is a convective tracer (Z = 250 R^1.2, the NHC's tropical relation) and a stratiform one (Z = 200 R^1.6) made from the decay of the first and from broad ascent; both are carried by the flow. An **eye** (a hole of convection inside 0.8 of the nest's own radius of maximum wind once the vortex is strong enough to have one), shear **ventilating the upshear side**, the right-front side of a moving storm converging more, land drying the column and dragging.
  *The engine owns the storm* (honest statement): the engine hands the nest its mean wind profile (a ring with a hollow core when strong, **two rings during an eyewall replacement** with the inner fading and the outer taking over across a moat: concentric eyewalls), its motion, its transition state and the weather round it, and the nest's **mean vorticity is relaxed to the engine's** (20 and 15 minutes) with an integral controller on the heating efficiency (3 hours) so the convection supports the intensity the engine says; departures from the circle mean are damped slowly so the eye does not fill. So the mean vortex is the engine's and the structure inside it (eye, eyewall and its hot spots, bands, moat, gaps, the comma, the dry slot) is the nest's. The look-ahead is the engine's own next step (`Manager.peek`: a clone stepped one hour with `stepSystem`, checked equal to the real next hour for 1225 systems), so the floater's clock runs inside the hour and the engine really advances at the hour. **Extratropical transition** (`eta`): a warm-conveyor-belt **stratiform shield** ahead and to the left of the motion, a **convective front** behind, a **dry slot** to the rear right. **A disturbance** is a broad weak vortex whose convection is clusters.
  *The weather on a storm's sides* (your last steer): the page's own sea temperature, humidity, shear and land are sampled over the whole square (a 32 x 32 grid of 16 km, `setEnv`, `HFNest.envGridOf`, mirrored in the southern hemisphere) and set, cell by cell, the sea's saturation, the moisture the air relaxes to, the threshold, the background ascent and the shear's ventilation; so dry air on one flank erodes that side (the echo cover of the dry west half 0.14 against 0.53 on the east and 0.49 for the same half in a symmetric environment), cold water weakens the south, land on the north-west takes the rain out of the land half (a cover of 0.27 where the same cells are 0.62 over sea) and brings a coastal band, strong shear leaves the downshear side the wetter. A symmetric environment gives a storm symmetric to within 20 %.
  *What you see* (`src/storm-floater.js`, `src/storm-ui.*`): a **Radar floater** button on the card of any cyclone or disturbance (a plain wave has none); the map frames the 512 km square, the main clock stops, and a bar shows the system, the time into the hour, the spin-up (two hours of the system's life are run first, 30 steps of 4 minutes, a bar says so), a **Radar** chooser, a **Product** and a **Tilt** chooser. The speeds are the clock's buttons, `[`, `]` and Space: **a quarter of real time, half, real time, 2x, 5x, 10x, 30x, 1 minute a second, 2, 5, 10 and 20 minutes a second**; Escape or the close button puts everything back. The storm layers stay on top of the radar (the storm canvas above it): the system alone with its **past path** and its place, **moving between the hour's two states** (a quarter of an hour in it is a quarter of the way: found by a mutant, the interpolation counted the hour twice, so the picture sat 64 % of the way at the 42 % mark), the **cone**, the **ensembles**, the **wind fields**, all through the layer buttons. **The picture is crisp** (the first version was blurry: a 2-3 times bilinear stretch with a smooth colour gradient): the National Weather Service's 15 reflectivity steps from 5 dBZ (04e9e7 to ffffff) with sharp edges, the 2-km field reconstructed at the screen's own sharpness with a bicubic filter that is kept between the two samples it lies between (no ripple), cut to the echo's box and written through a 32-bit colour table (36 ms became 7 ms), north up in both hemispheres, scaled by cos(latitude) in 8-pixel strips, and the glide between two steps is one semi-Lagrangian step of the rain. **Radar sites**: the cities within 420 km of the storm (up to nine) are radars: 50 km range rings out to the 460 km limit, the beam's height at the **tilt** (0.5, 1.5, 3, 6 degrees; 4/3 earth radius) against the echo's estimated top (`3.2 + 2.3 ln(1 + rc/3) + 1.4 ln(1 + rs/1.5)` km: a high tilt passes over the low echoes far away, weakens echoes above the melting layer and near their top, and sees less far out), and the **velocity** product (Doppler: the nest's low-level wind plus the storm's own motion, mirrored back for the southern hemisphere, along the line of sight, green toward the radar and red away, only where the reflectivity is 5 dBZ or more, with its own key): a cyclonic storm has green on the left of the line from the radar to its centre, a southern one red. A phone gets a bar that fits.
  *Tests:* **51 node checks** in the new `tests/nest.mjs` (the grid and the Z-R relations, the operator, a forcing's interpolation, the same seed the same storm, an eye and an eyewall at the engine's radius, the hollow core, the mean wind held to the engine's (within 25 %), rain only where it should be (under 1 % of the dry surroundings beyond 300 km), concentric eyewalls with a moat, the weather on the sides (dry, cold, land, shear), the transition's shield and front and dry slot, the lumps of vorticity going with the lumps of rain (correlation 0.70, 0.3 with the wrong sign), the right-front lead (1.5 against 1.16 for a still storm), the frame of the picture (land grid, environment grid, the southern mirror, the glide), the engine's forcing for every kind of system, the look-ahead equal to the real next hour for 1225 systems, and a step under 120 ms); **browser checks on every page** (the button, the bar, the spin-up, the crisp steps at the pixel, the buttons and keys, the speeds, the hour roll, the layers on top, the picture's place by the minute, a radar site's rings and tilt on the Atlantic page near San Juan and the Australian page near Darwin, the couplet of the velocity in both hemispheres, the reflectivity back, a disturbance and a plain wave, Escape: 2017 checks in all); **34 new mutants** N1-N20 and F1-F14 on the nest and the floater (305 in all; new drivers `nest`, `floater` and `floaterS` for the southern hemisphere), **24 killed at once and 10 survived at first**, each a gap: the dry-air and cold-water mutants removed only one of two paths of the same effect (now both), nothing checked that the transition's shield was stratiform (the convective cells hid it) or that the front stood alone (a weak vortex with and without the transition now), nothing separated the stretching's sign from the relaxation that holds the mean (the departures' correlation does), a moving storm's lead was only measured against the other side (now against a still storm), the beam mutant removed a line that the dBZ reduction duplicates (it removes the beam's height now), the card's hiding was refilled by the next refresh (it is checked in the same call), the southern velocity needed a southern page (the new driver), and **the picture's place counted the hour twice**, a real bug (fixed, and the picture's place is measured by the minute); all 34 are killed. The first complete browser run found three failures of the new checks (the crisp-palette check asked for 70 % of the opaque pixels to be exactly a colour of the scale and two pages got 68 and 70 %, the cells on a step's edge being mixes: it asks for 60 % now, a gradient or a blur leaves under half; the generic site check wanted pixels of a storm that had not reached its radar, and the dedicated site check on both pages, with a storm placed at the radar, carries the beam comparison).
  *CI and Pages:* the push of the milestone (commit c96c55c) passed "Build & test" (the node suites and all 2017 browser checks on the runner) and the Pages deploy (run 98); the pages are the nine `dist/*.html` with the nest and the floater inlined (1.7 MB each).
  *Known limits:* **the mean vortex, its size and its eyewall replacements are the engine's statistics shown by a convective model, not the model's own forecast** (the nest does not predict intensity); no terrain (a coast and land dry the column and drag, mountains do nothing), no vertical structure, no microphysics (a tracer of rain, two Z-R relations), no attenuation and no ground clutter, the velocity product has no folding; one system at a time (two close systems are one square each); a very large storm's outer field is cut by the 512 km square; the transition's front and shield are the engine's flag turned into lift, not a frontal model; **satellite (infrared) is not built yet: it is the next push** (cloud-top temperature from the same convection, the cirrus shield from the outflow, the overlays already work with any picture under the storm canvas).
- **Storms, milestone 15: what a storm does to a city, a researched wind field with eyewall replacement cycles, post-tropical cyclones that live until they dissipate, more subtropical storms.**
  *What you asked:* (1) city impacts, the "Storm impact" block of the city tooltip (it was a column of dashes): damage in dollars, deaths, injuries, sustained winds and gusts in mph, rainfall in inches that refreshes after 72 hours; damage, deaths and injuries recover slowly, faster than in real life, longer for worse damage, a full season for damage so severe that it is total, faster for the lighter; (2) a realistic wind field from in-depth research, with eyewall replacement cycles ("EWCs") changing the size and the intensity for a while; (3) extratropical cyclones that go on until they dissipate and are not killed while strong; (4) a cyclone that forms in water well below the hurricane threshold in the north more often subtropical. Your answers on the way: deaths **stay, then clear** with the city's recovery; the 34 kt field is the **realistic split** (the core and the hurricane-force radius follow the intensity, the 34 kt field is slow); impacts also as a **ring on the marker** and as **season totals**.
  *The research (what each finding is used for; the sources are web searches, the papers themselves were not downloadable here and NOAA's best-track radii are blocked in this sandbox, so every size is set from the published statistics and tested against them, not fitted to HURDAT2):* outer size is nearly independent of intensity (r about 0.36), lognormal and spins up after the peak (Merrill 1984, Chavas and Emanuel 2010) -> R34 follows the intensity only as V^0.42, with a memory of 36 hours, and grows with age (18 % over a week), latitude (2.1 % a degree) and its own slow anomaly (sd 34 %); Rmax is larger for weaker storms, larger outer size and higher latitude (Willoughby et al. 2006, Chavas and Knaff 2022) -> the engine's Rmax law times (size / its climate)^0.4, relaxing over 12 hours, contracting by 15 % in rapid intensification; outside Rmax a power law fixed by the wind at Rmax and 34 kt at R34 (modified Rankine / Willoughby / Chavas family) -> R50 and R64 are the roots of that profile, and the wind at any point is the same function (`windAt`), the radii by quadrant its roots along each quadrant's centre line, the storm's own motion adding 0.35 of its speed on the right-front side (Shapiro 1983: about a half); an eyewall replacement weakens the inner wind maximum by about 10 m/s before the outer takes over, takes about 36 hours, starts with maxima at 35 and 106 km, raises the integrated kinetic energy by 28 % with little change in peak wind, and in Rita left the core weaker with the hurricane-force area 125 % larger (Sitkowski, Kossin and Rozoff 2011, Maclay et al. 2008) -> `stepErc`; 13 % climatological chance of a secondary eyewall for a hurricane over water and about half to two thirds of intense hurricanes (Kossin and Sitkowski 2009) -> the hazard; outer winds typically unchanged until transition ends, a minority expanding strongly, a cyclone that often deepens and grows for one to two days after it (Nguyen and Schenkel, Evans and Hart, NHC) -> the post-tropical growth; 197 Atlantic subtropical cyclones, 60 % over water above 25 C (Guishard, Evans and Hart 2009) -> the subtropical share; damage as vn^3 / (1 + vn^3) above 25.7 m/s (Emanuel 2011, with the half-damage wind by income class after Eberenz et al.), 8th-power losses (Nordhaus), categories 3 to 5 85 % of damage (NOAA); deaths 49 % surge, 27 % rain, 8 % wind in 1963 to 2012 and 57 % freshwater flooding in 2013 to 2022 (Rappaport 2014 and update); rain above 15 mm/h at the core of a major hurricane, about 3 mm/h for a tropical storm, under 1 mm/h beyond 200 km (Lonfat, Marks and Chen; Tuleya et al. R-CLIPER); 3 s gusts over 1 min sustained 1.11 at sea, 1.23 onshore at the coast, 1.49 inland (Harper, Kepert and Ginger).
  *The wind field* (`stepWind`, `windProfile`, `windAt`, `windRadii`, `par.wind`): see above; on 48 seasons of the page's own weather (687 named storms) the median fields are R34 90 / 107 / 113 / 115 / 115 nmi for 50-60 kt, Category 1, 2, 3 and 4 storms (the NHC's: about 85, 105, 105, 115), R50 45 / 53 / 57 / 59 and R64 23 / 33 / 36 / 37 nmi for Categories 1 to 4, R34 92 / 105 / 116 / 146 nmi at 10-18, 18-25, 25-32 and 32-45 degrees, the correlation of wind and R34 across fixes of 50 kt and more 0.20 (the published 0.3 to 0.4 is for all fixes; held-wind storms 0.53 is the strongest coupling there can be). Season statistics did not move: 14.5 named storms a season, hurricane share 0.571, major 0.29, ACE 145 to 142 (-2 %).
  *The eyewall replacement cycle* (`stepErc`, `ercShape`, `par.wind.erc`): a hurricane that has held 90 kt for 6 to 14 hours, over water above 25.5 to 27.5 C, in light shear, off land and not in rapid intensification, forms a secondary eyewall at 0.08 an hour times the ramps of its wind (76 to 102 kt); three phases (the outer eyewall forms in 6 to 12 hours, the inner one weakens over 12 to 24 hours with a loss of 19 kt on average, sd 7, Rmax going out to 1.8 to 2.8 times and the 34 kt field growing 10 to 18 %, it re-intensifies over 12 to 30 hours taking back 70 to 100 % of the loss, Rmax contracting to 0.7 of its peak), a cool-down of 36 to 84 hours; the dip is a deficit on the reported wind only (the intensity law, rapid intensification and the ACE tail are as they were), the larger eye, the larger field and the residual of the dip fade over 48, 96 and 36 hours; the central pressure follows the size (6 hPa a unit of log size) and carries half of the wind loss only. The shares on the page's weather: Category 3 peaks 31 % (target 25-50), Category 4 67 %, Category 5 60 % (55-80), below 96 kt 2 %, none below 64 kt; one ERC in 0.57 of the storms of Category 3 and over; the storm card says "Eyewall replacement: inner eyewall weakening / outer eyewall taking over" and gives the eyewall's distance in the wind-field row.
  *Post-tropical cyclones* (`par.ex`, `becomePostTropical`, `Manager._merge`): no lifetime any more (the best track's median 30 hours is the forecasters stopping, not the low): the wind relaxes towards what the baroclinic zone supports times a life cycle (held for 48 hours, then occlusion and friction with an e-folding of 100), and it ends when it has filled (below 20 kt for 12 hours: a weak low that fills as a remnant low does), when it is absorbed (a hazard for a weak low in the westerlies only: 1 / 36 an hour below 22 kt and none above 38) or by a merger with a stronger post-tropical or non-tropical low within 3 degrees (the weaker goes, 0.15 an hour), at the latest at two weeks. On 48 seasons: the median post-tropical phase 120 hours (it was 36), the 90th percentile 240, a strong one (55 kt or more) 198 hours; of 177 absorbed, 1 had 45 kt (of 232 absorbed before, 34 had). A post-tropical cyclone's field now grows over 60 hours by a gain set by the jet (x1.2 to x2.5, a few smaller), not by x2.2 at once. Fans never absorb a member at random (`ctx.keep`), so cones go on.
  *Subtropical storms in cool water* (`subShare`, `par.subShift`): the share of the developments that are subtropical instead is 0.9 x ramp(latitude 22 to 30) x (1 - ramp(sea temperature 25 to 27 C)), decided by one draw per system at the event and again where the depression is declared, which can be a day later and farther north (the cause of the cold-water tropical storms was that: the draw was made over the Gulf Stream and the system drifted onto 23 C water before it was declared); the total number of developments is unchanged. On 48 seasons: over water below 25 C 100 % of the developments are subtropical (they were 67-91 %), at 30-35 degrees 33 % (26), at 35 and over 57 % (49), the tropics untouched.
  *City impacts* (`Manager.setCities`, `_impacts`, `impactOf`, `impactRings`, `par.impact`, src/storm-cities.js): the table gives each of the 568 city names people, an income class, terrain and a coast; each hour, for every system within reach, the sustained wind at nine points of a 3 x 3 grid of 0.2 degrees round the city (x0.92 on a coast, x0.85 inland) with the gust on it by exposure (1.23 onshore, 1.36 off the land, 1.49 inland), the rain of a symmetric profile (0.05 to 1 in/h by wind, an exponential tail of 0.3 R34, 35 % more on the right-front side) summed over the hours of the visit (so a slow storm rains more) and lifted by the terrain, a surge proxy on the coast from the onshore wind and the size of the storm (only with water upwind of the city). Damage is 1 - (1 - wind)(1 - flood)(1 - surge): Emanuel's law averaged over the nine points, 0.0001 (rain - 5 in)^1.7 above 5 inches, the surge law by the coast; value at risk is people x $380k / $90k / $35k / $12k by income class. Deaths are three terms (surge, rain above 8 inches, wind) times the people and 1 / 3 / 8 / 25 by income class and a lognormal draw of the event, injuries 6 / 6 / 5 / 4 to a death plus a wind term. An event opens at 25 kt or 0.04 in/h and closes 12 hours after; its damage then heals over 200 days x sqrt(d / 0.4) (2 days at least, a season at 40 % and over) with nothing healed for the first tenth, the injured three times as fast, deaths stay until the end and then the record goes; a second storm is a second event; each storm and the season keep their totals and the worst-hit city; the save carries the ledger (an old save resumes with none). Rain is a ring of 72 hourly slots: it empties by itself. Calibrated on landfalls: a Category 4 over Miami $270 B and 340 deaths (the 1926 hurricane re-run today: about $235 B), a Category 1 $9.8 B, a tropical storm $0.7 B; a Category 4 over Port-au-Prince 1,450 deaths and 43 % of its value; a Category 5 over a small city (Freeport) 28 % of it; a stalled 65 kt storm over Houston 24 inches and $81 B; a Category 3 over New Orleans $69 B and 1,700 deaths.
  *Where it shows:* the city tooltip in all nine pages (sustained winds and gusts, rainfall (72h), deaths and injuries, damage with its share of the city, recovery, dashes where nothing is going on); a ring on the marker of a damaged city (yellow from 0.1 % of the city's value, orange 1 %, red 5 %, dark red 20 %, fading as it recovers, gone with the markers); the storm card's Damage and Deaths cells and Structure row; the summary's totals line (damage, deaths, injured, worst hit) and a Damage column.
  *Tests:* 347 node checks (new: the radii are the roots of the wind at a point, the profile, Rmax, size against intensity, the eyewall replacement shape, hazard, cool-down, independence of members and the engine, the pressure, post-tropical life and absorption and merger and the cap, the subtropical share, every impact benchmark above, units, the 72 hour window, recovery times, a second storm and the totals, healing, the ledger in a save, the surge needing water upwind, the table covering every city) and a browser check on every page (the tooltip before and after a hit, the ring and its colour, the card, the summary, a save, healing: 1903 browser checks in all); mutants Z162-Z198 (37, all killed by a failing check) and the repaired S3 and Z146-Z149 (271 in all; the mutant tool's snapshot had not carried the new city table to the node driver, so every node mutant had crashed and counted as killed until it was fixed). The summary table loses its pressure column on a phone: with the damage column the table was 11 px too wide for the 336 px of the CI runner's wider fonts. The turn-of-the-year browser test ends its late hurricane by hand now (a post-tropical cyclone can live past Jan 1), and the wind-field check asks for the profile's ratios.
  *Known limits:* the radii are the published statistics, not fitted to the real best track; an eyewall replacement is a statistical episode with no inner-core physics; the surge is a proxy and the flood a law of the rain, not a map; populations and capital stock are approximate (to a few tens of percent) and per city name, not per district; damage, deaths and injuries are a calibrated model (checked on benchmark landfalls), not a forecast of real losses; fans cannot see mergers; the 34 kt field coupling to the wind (0.2 across fixes) is a little under the published 0.3 to 0.4.
- **Storms, milestone 14: watches and warnings, and the wind fields.**
  *What you asked:* two more buttons at the bottom right, one for **watches and warnings** (not per storm: one map for every storm) and one for the **wind fields** (per storm); the NHC's key of watches and warnings plus a high wind warning; the way they run inland, updated with realism; a basic wind field that grows with strengthening and shrinks with weakening, with the very large fields of extratropical lows (which the high wind warnings use); the colours not blurry and not transparent; the stronger winds not too big beside the 40 mph zone; the key on the left smaller and shown only while the layer is on; some letters black instead of white, fixed in the same push.
  *The wind field* (`stepWind`, `windRadii`, `par.wind`, src/storms.js; every system keeps `lr`, `rs`, `rq`, `w`, so a save from before carries on): the mean radius of the 34 kt winds R34 relaxes (a day's memory) towards its target, the climate of the latitude (92 nmi at 15 degrees for a 55 kt storm, 2.1 % more a degree poleward; raised by a quarter after the first look, when the field of the tropical-storm-force winds looked small beside the NHC's graphics), a size anomaly of its own (a slow draw, sd 32 %: some storms are big, some small), the intensity (R34 ~ V^0.55: a storm that strengthens grows, one that weakens shrinks, not at once) and the land (a landfall costs a third); a post-tropical cyclone broadens to about twice that over a day (the large fields of the extratropical lows: median R34 118 nmi at the transition, 150 after a day, 245 after a day and a half, the biggest tenth over 550 nmi), a remnant low is smaller. Rmax comes from the intensity and the latitude (24 nmi at 60 kt, 10 at 140 kt, bigger poleward) and the outer profile V ~ r^-0.46 out from R34 gives R50 and R64: **the 64 kt radius is a quarter of the 34 kt radius and the 50 kt radius two fifths** (a large field of tropical-storm-force winds round a small core of hurricane force, as in the NHC's wind field graphics: Helene's and Ian's) (the research the numbers come from: Knaff and Chavas on Rmax from R34, V and latitude; the NHC's radii climatology; outer winds grow with latitude and, for the storms that broaden, after the transition, as a storm strengthens and keeps growing as it weakens (Helene) but with the intensity the radius mostly follows, so the model does the first two; the hurricanes of the check are about 110 / 60 / 30 nmi). The quadrants differ by the track (the right-front quadrant, the left-front in the south, is the strong one: up to 0.2 + 0.012 per kt of speed, at most 0.45 more) and by a slow anomaly each. The fixes carry the mean radii (`fix.w`), the ensemble members every three hours, the cone the median (`r34 r50 r64` per row and per hour). Measured on the page's own storms (3 seeds, 56 storms): a tropical storm (35-60 kt) R34 median 75 nmi, a Category 1-2 hurricane 119 / 52 / 28 nmi, a Category 3 and up 142 / 62 / 36, the fields of two hurricanes differ by a factor of two.
  *Watches and warnings* (`alertsOf`, `par.alerts`, src/storms.js; the page: `wwRefresh`, `drawWW`): the NHC's rule (a warning for conditions *expected* within 36 hours of the onset of tropical-storm-force winds, a watch for conditions *possible* within 48) on the cones of **every active cyclone** (a fan of 10 members and 60 hours each, at each six-hour issue; while the clock runs no more than one issue a second and at 8x and above one every twelve hours). On a grid of an eighth of a degree in longitude and Mercator y: Te, the first hour the forecast's 34 kt radius plus half of the cone's error circle plus 10 nmi reaches a cell (expected), Tp the same with 1.1 times the circle plus 25 nmi (possible); the same with the 64 kt radius for hurricane force (a storm forecast at 60 kt or more counts for half of its 50 kt radius). The codes: **tropical storm watch** (yellow), **hurricane watch** (pink), **tropical storm warning** (blue), **hurricane watch with a tropical storm warning** (blue and pink stripes), **hurricane warning** (red), and the new **high wind warning** (goldenrod, the National Weather Service's) for a post-tropical or remnant cyclone's large field within 24 hours; overlapping storms take the higher. Realism: a cell that had a warning keeps one while the threat is anywhere in the next 72 hours and a watch likewise (so an area is not dropped and picked up again as the forecast wobbles, and an upgraded watch stays), and it is cancelled when the forecast no longer reaches it (the storm has passed or has dissipated). The warning follows the land inland as far as the forecast's wind radius shrinks (a hurricane warning over Mississippi and Alabama, tropical storm warnings and watches reaching far beyond it, a typhoon warning on an islet in the Ryukyus). Drawn **solid and sharp**: the cells blown up three times with smoothing and cut at half, every pixel one colour of the key at full strength, over the land and along the coast only (the land polygons filled and stroked 6 px as a mask: colour inland, a coloured line along the shore), with the state lines drawn over them; the hatching is pixel by pixel. Hovering the land or coast names the alert and the time.
  *Where it shows:* **Wind fields** and **Watches & warnings** are the 4th and 5th of nine pills (the panel's rows are hidden like the others); the wind field is drawn for the storm you picked, or for each storm when none is (34 kt amber, 50 kt orange, 64 kt red, the radii in four quadrants smoothly joined); the storm card has a new "Wind field" row (`39 mph out to 125 mi . 74 mph out to 45 mi`). Each layer has a **small key** at the left, shown only while it is on (the NHC names with the basin's word: Typhoon Watch ...); on a screen under 1040 px wide the watches-and-warnings key replaces the outlook's and the wind field's is not shown, on a phone neither. The panel and the pills were re-fitted to nine pills (the panel gives up 76 px, and on a window under 820 px high the pills are smaller).
  *Letters:* the forecast points' letters were white with a dark edge 2.6 px wide that swallowed them (they read black), and the card's class chip had dark text on the pale colours: both are white now, the edge 1.7 px (white pixels in each circle 34-36, the dark edge 2-3, checked).
  *Tests:* 318 node checks (new: the size of a hurricane's field, none for a depression, the ratios of the radii in every quadrant, growth with strengthening and with latitude, shrinking with weakening and landfall, the right-front quadrant in both hemispheres, a post-tropical broadening, a save from before, 30 storms' median field; the cones carry the radii; the alerts: a landfall within the day, the clock (a watch before a warning, nothing beyond 48 h), a hurricane watch with a tropical storm warning, hysteresis, cancellation, high wind warnings and the stronger alert of two) and 11 browser checks on the Atlantic (the pills and their keys, the layout of the three keys at 1280, 900 and 390 px, the colours of a hurricane warning, a tropical storm warning and a watch at the pixel, solid and sharp along a line over the land, the hover, the key, not per storm, nothing when off, the radii and the field painted round the picked storm only, its key, the white letters); mutants Z146-Z161 (the profile, the intensity coupling, the quadrants in the south, the post-tropical growth, the 36 and 48 hours, the memory, the high wind warning, the hurricane warning, the land, the cone's radii, see-through colours, blur, alerts that disappear when a storm is picked, wind fields of every storm, black letters) with a new mutant driver `alerts`.
  *Known limits:* the alerts follow the consensus track of the ensembles (the NHC's follow its forecast), on a grid of an eighth of a degree and not county zones or breakpoints; a warning is a swath of the forecast radius plus a share of the cone's error circle, the same rule for every storm; no storm surge, no flood watches, and the wind field is a model (no eyewall replacement, no inner-core structure); the key of the wind field and of the outlook are not both shown on a small screen.
- **Storms, milestone 13, third round: every basin has its own colours and letters.**
  *What you asked:* different colour palettes and letters for different basins, as in the examples (a Zoom Earth strip of the West Pacific, Wikipedia's storm-formation charts of the Australian region, the South-West Indian Ocean and the North Indian Ocean), for the point letters and for the path colours; the colours from Wikipedia, the pictures' data not copied.
  *How:* a basin's intensity scale (`SCALES`, src/storms.js) now carries its look as well as its cut-offs: `cols`, one colour for each class, and `tag`, the letters of each class on a forecast point. The colours were read off the pictures' pixels. **NHC pages** (Atlantic, East Pacific, and the Saffir-Simpson South Atlantic and Mediterranean) keep their blue, green, yellow, orange, red, magenta and purple and the cone's D S H H M M M. **West Pacific**: Zoom Earth's seven classes, D `#0a84ff`, S `#00f060`, SS `#ffcc00`, T `#ff9400`, ST `#ff5900`, VT `#ff0022`, SU `#ff55bb` (Tropical Depression, Tropical Storm, Severe Tropical Storm, Typhoon, Strong Typhoon from 95 kt, Violent Typhoon from 120 kt, Super Typhoon from 130 kt; the scale had five classes, JMA's very strong and violent typhoon cut-offs of 85 and 105 kt of 10-minute wind are added, converted to the 1-minute wind like the others). **Australia and the South Pacific**: Wikipedia's chart colours from the top, purple `#a188fc` (Category 5), pink `#ff738a`, peach `#ffd98c`, light green `#c0ffc0`, cyan `#4dffff` (Category 1), sky blue `#6ec1ea` (the tropical low, or the depression), with the category numbers as letters (L 1 2 3 4 5, D 1 2 3 4 5). **South-West Indian Ocean**: the same ranked colours over Meteo-France's six classes (D MTS STS TC ITC VITC). **North Indian Ocean**: IMD's seven classes (D DD CS SCS VSCS ESCS SuCS) from dark blue `#1591de` through sky blue, teal `#00faf4`, light green, peach and pink to purple. Post-tropical is grey everywhere, the letter still the intensity.
  *Where it shows:* the colour of the track (every leg, the advisory dots, the live head), the ensemble members, the Place preview, the season table's swatch, the cone's points (a circle for one or two letters, a pill for the agency's longer ones such as VSCS), and a new chip on the storm card, the class in its letters on its colour (`ST` on orange next to Strong Typhoon, `ESCS` on pink). A subtropical storm is coloured by its wind in the basin's scale, as before.
  *Tests:* 300 node checks (new: every scale has a colour and a letter group for each class, the NHC look unchanged, the exact hex values and letters of the West Pacific, Australian and South Pacific, South-West Indian and North Indian looks, the cone letter of every wind in every scale, the same fan lettered three ways) and a browser check on every page (the head of a 105-kt storm is the region's colour at the pixel, the card chip names the class on that colour, the cone's letters are the region's: 1812 + 9); mutants Z140-Z145 (swapped West Pacific colours, the Australian cyan in the Indian teal's place, C4 for 4, the NHC palette or letters on every page) and Z49 and Z131 rewritten; a new mutant driver `look`.
  *The stripe across the South-West Indian Ocean (also in Australia and the South Pacific):* a grey line and a transparent stripe through the sea-temperature layer at about 16.8S from edge to edge. Found by measuring, not guessing: it vanished with "Show sea temperature" off, stayed put in latitude at every zoom and in every view (temperature, anomaly, humidity, shear), and the field itself (`SSTSIM.sample`) was smooth there, so it was drawn, not data. The land polygons of the three pages had the classic antimeridian artifact: Natural Earth's Vanua Levu and Taveuni (16.5S, 179E) are drawn from -180 to 180, so clipped to a basin box they left a 5-point polygon 82 degrees long and 0.14 tall (the generator's sliver test stopped at 0.1) and a spike of two far vertices on the island's ring (87E, nowhere near it); the sea layer is erased with every land polygon, so each one erased a stripe and stroked a coast line right across the basin. `tools/geo_repair.mjs` drops such slivers (under 0.3 degrees one way, over 3 the other, 30 points or fewer) and takes out the spike (at most four vertices between two flat edges longer than 6 degrees, never one on the box's own north or south side); it repaired the three data files (`data/generated/aus-`, `spac-`, `swio-data.json`: one sliver in each, a spiked island in Australia and the South Pacific) and `tools/make_geo.mjs` applies the same two functions to what it clips, so a rebuilt file has none. New `tests/geo.mjs` (5 checks, in `npm test`): no basin has a sliver, a spike or a long flat coast edge, and the repair on the shape of the real artifacts (it fails on the old swio file). A row scan of all nine pages afterwards finds no stripe (the equator's dashed line, which the North Indian and Australian pages draw on purpose, is the one sharp row left).
  *Known limits:* the West Pacific classes above Typhoon are named as Zoom Earth names them; Wikipedia's charts have a seventh, darkest blue for the South-West Indian Ocean's tropical disturbance, which the engine draws as a wave (pale), not a class; on the cream Chart theme the pastel Wikipedia colours are fainter than the NHC ones (the track keeps its dark halo).
- **Storms, milestone 13, second round: the cone and the fans fixed (turns, kinks, last point, colours, post-tropical life).**
  *What you asked:* thicker ensemble lines and cone outlines; post-tropical storms no longer end a cone; lines that never zig-zag and a cone that looks like a cone; turns (recurvature) that are not usually wrong or late; the last point never gone; colours that are right (a TD is not green, every category its own colour and letter).
  *The cause of the wrong and late turns, found by measuring on the page rather than by reading the engine:* the page's look-ahead weather (`shadowEnv`) carries its steering forward **in place**, and `Manager.prototype.ensemble` asked for the environment of all 168 hours before it stepped any member, so every member read the steering of the last hour (about +167 h) at every lead. The fans and cones were made from the wrong weather, which is why they agreed on a movement that did not happen and turned at the wrong time. The engine tests never saw it (their environments are static), and the Place preview was right (it steps straight after each hour's environment). The members now advance **hour by hour together**, each hour's environment read at that hour. Measured on the page (the Atlantic, 250 cones of 3 seeds, the consensus against the real track that followed): the real position inside the NHC-sized circle at 24 / 48 / 72 / 96 / 120 h was **7 / 2 / 3 / 3 / 8 %** and the turn of the consensus came a mean 28 h from the real one (the actual turn missed in a quarter of the cases); it is now **67 / 61 / 60 / 63 / 66 %** (the NHC's are about two thirds), the turn **0 h** off in the median and **10.5 h** on average (19 late and 24 early in 115 turns, unbiased), the mean error 64 / 124 / 191 / 273 / 387 km (the NHC cone radii 76 / 130 / 189 / 280 / 407). The other basins on the same measure: West Pacific 60 / 51 / 46 / 55 / 61 %, East Pacific 62 / 51 / 57 / 71 / 75 %, Australia 71 / 68 / 50 / 45 / 36 % (few cones).
  *Re-fitted on the page's weather, not on a flow that is the same everywhere:* with the weather right, the fans were twice as wide as a forecast's error (a displaced ridge or trough steers differently where the flow has structure, which the old uniform-flow fit had not counted), so the sizes came down: predictability factor 0.75 for a depression to 0.3 for a hurricane (it was 1.3 and 0.5), the shared error 0.4 of a member (it was 0.8), and a new `par.ens.wv` = 1.6 for waves, lows and disturbances (a wave is a worse forecast than a depression of the same wind). The fan of a cyclone is now 78 / 168 / 282 / 429 / 607 km wide at 24 / 48 / 72 / 96 / 120 h (the consensus is off by 64 / 124 / 191 / 273 / 387), a wave's in a uniform flow 58 / 137 / 304 / 549 km at 1, 2, 4 and 7 days (NHC-like 78 / 143 / 312 / 624).
  *Post-tropical:* the engine's own post-tropical life stays what the best track says (median 30 h, the real 3 / 12 / 30 / 60 / 102 h), but a **forecast** goes on: a member is not taken out when its post-tropical clock runs out (`ctx.keep` in `stepSystem`, set only by the fans; dissipation over land and leaving the map still end a member), so a cone of a storm that turns post-tropical runs on in grey to 120 h like a real one (24 of 24 members still there at 120 h in the check, while the engine still ends the real one at its own age).
  *The centre line:* the consensus is smoothed with a straight-line fit over 6 hours (no lag where the track ends), read every 12 hours, and a monotone cubic (pchip) runs through those points, so the line cannot wiggle, overshoot or loop where members come and go; it is drawn from the curve's hourly samples (`C.line`), not through the three-hourly rows. The circles' sizes run through the NHC's numbers the same way. On the page's weather the sharpest bend between two six-hour legs of a moving storm is under 40 degrees, and the line swings back and forth in 2 % of the cones (a real S-shaped track). Where nearly all the members are gone, a cone that ends early still ends in a point (the last hour of the forecast, `end`), so the last point is never just gone; the 120-hour point is missing only where the storm dissipates over land or leaves the map (a third of the West Pacific cones reach the date line first).
  *Colours:* the letter of a forecast point was cut from the raw wind (33 kt was a D) while the colour came from the category of the wind in 5-kt steps (33 kt is 35: a tropical storm, green), so a D could be green and an S yellow; both now come from `category`, the letter by `coneLetter(v) = category(v)` (TD D, TS S, C1-C2 H, C3-C5 M), the same function for every winds from 1 to 200 kt.
  *Thicker:* ensemble lines 1.3 -> 2 px (the picked one 3 -> 4), cone outline 2.6 -> 3.6, centre line 2 -> 3 with a dark halo.
  *Tests:* 293 node checks (new: a steering that changes with the hour is read at that hour, which fails on the old code; the shared error moves the whole fan; the letter is the colour's category; the centre line is smooth through real fans, a jagged consensus and five jittering members; a cone that ends early ends in a point; a post-tropical cyclone goes on in a forecast; the spread and coverage checks of the uniform-flow environment now only bound the numbers, the NHC sizes are checked on the page) and 4 browser checks on the page's own weather (57 % of 242 positions inside the cone, the turns 0 h off in the median and 8 h on average, the fan 78 km wide at 24 h and 639 at 120, the line's sharpest bend 42 degrees between two six-hour legs and 55 of 61 cones reaching 120 h; 1812 browser checks in all); mutants Z135-Z139 (the last-hour steering, the post-tropical members, no smoothing, a polyline, no end point) all killed, with Z122, Z128, Z129 and Z131 rewritten against the new code (212 mutants, every anchor found once).
  *Known limits:* the same as the first round, and the fans on the page are about 1.5 times as wide as the consensus is wrong (real ensembles are narrower than their errors, ours are a little wide); a third of the cones in a basin with a hard edge (West Pacific at the date line) end there, as the storms do.
- **Storms, milestone 13: the layer buttons and the cone of uncertainty.**
  *What you asked:* the layers that look at the weather and the storms moved from the big panel to buttons at the bottom right (the panel keeps the map theme, city icons, the 26.5 line, the contours and the like); the NHC cone of uncertainty with its forecast points, their letters (grey for post-tropical, the letter still the intensity) and a hover with winds, gusts and pressure; no warnings yet; a cone that updates smoothly every three hours or so and does not move constantly; and, because ensembles are often all wrong about a turn, a forecast that is sometimes wrong, as in real life.
  *The layer buttons* (src/storm-ui.html, .css, storm-late.js, so one implementation for all nine pages): seven labelled pills in a column above the colour bars, pressed = lit: **Ensembles**, **Cones**, **Track density** (enabled when ensembles are on), **Jet stream**, **Highs & lows** (the highs and the lows layers together), **NHC disturbances** (the tropical waves and the areas of interest, X's and arrows together) and **Streamlines** (the steering arrows, renamed). The checkboxes they stand for keep their ids and stay in the panel, hidden (`.lyr-src`): a button clicks them, so everything that reads or sets them still works, and a `change` on one lights or unlights its button. On a phone the column is one row that scrolls. The steering legend moves the column up (`body.steer-on`), and the panel gives up its height to it; the panel keeps the map tabs, overlay strength, map theme, sharper imagery, sea temperature, state lines, city markers, coordinates, the 26.5 line, the contours, Storm names and Experimentation.
  *A forecast that can be wrong:* every member of a fan now also shares one error (`par.ens.common` = 0.8 of a member's size): the same shift of the steering features, steering speed and direction error, shear, sea temperature and humidity error and starting error for all of them, scaled by the same predictability factor. Its coefficients are drawn per 48-hour epoch and interpolated, so the error drifts from one issue to the next instead of being drawn again. The real storm (the true weather, its own chances) is then one more draw from the distribution, not the exact mean: the real position at 2, 4 and 7 days lies inside the 90 % of members nearest the fan's mean in 85 of 89 cases (it was 88 before, with a fan that centred on the truth), a fan made six hours later moves its members by 117 km in the median (168 at the 90th percentile) against a fan 342 km wide, and the fan's spread is as before (a wave's 66 / 155 / 335 / 592 km at 1, 2, 4 and 7 days against the NHC-like 78 / 143 / 312 / 624, a 90 kt hurricane's 71 / 123 / 237 / 357).
  *The cone* (`HFStorms.coneOf`, src/storms.js): the consensus (the mean position of the members still alive) every three hours to 120 hours, with a circle round each point as big as the NHC's mean track error (8 nmi at the start, 26 at 12 h, 41, 55, 70, 88, 102, 151, and 220 at 120 h, the same for every storm whatever the fan looks like), drawn as the outline of the chain of circles (`swathFull`, one smooth loop); the forecast points at 12, 24, 36, 48, 72, 96 and 120 h carry the median wind and pressure and a letter, D below 34 kt, S to 63, H to 95, M above, in the colour of the category and grey when most members are post-tropical or remnant (the letter stays). It stops where fewer than half the members are alive. A new cone is blended with the last by valid time, all the way to the new forecast at the start (it begins at the storm) and half way beyond a day and a half, so it moves part of the way to a changed forecast and never jumps (at four days a cone three hours on is 9 nmi from the last one where the new forecast alone would be 19). The real track is inside the cone 70 % of the time (600 real positions at 1 to 5 days: a wave's 80 %, a storm's 61 %, a hurricane's 68 %; by day 69 / 60 / 58 / 74 / 86 %), about two thirds as in the NHC's, and a mature storm's forecast is the better one at 4 and 5 days (85 % against a wave's 80 %).
  *On the page:* the cone belongs to the **selected cyclone** (it is not drawn for waves, lows or unpicked storms); a new fan and cone every **three hours** (once a day at 8x and above); the cone is a blue-grey area with a light outline, a centre line, and forecast points as coloured circles with the letter; the cone starts at the advisory position and stays still between issues. Hovering a point rings it and shows `+72 h . 120 mph (1-min)` (`+120 h . Post-tropical . 60 mph (1-min)` when grey), the class, `gusts 145 mph . 957 hPa` and the valid time. No warnings, watches or landfall boxes. `SSTSIM.coneState()` and `conePoint(lead)` are the hooks of the checks.
  *Tests:* 287 node checks (new: the cone's coverage, its seven points and letters and circles, the outline as one simple loop holding the points, the blending, the grey rule and the end where the members die; the ensemble checks re-baselined for the shared error) and 11 browser checks (the cone and its points on the map, the hover text, un-ringing, nothing when nothing is picked; the seven buttons, the combined ones driving both checkboxes, Track density freed by Ensembles, the panel hiding them; the buttons clear of the clock, panel, playback dock, colour bars and season bar at 1280, 900 and 390 px with the steering legend on and off); the 22 clicks of the older checks on the hidden checkboxes now go through one helper; mutants Z128-Z134 (the circles, the blending, the grey rule, the letters, the shared error, the hover, Highs & lows).
  *Known limits:* the cone is drawn round the ensemble consensus, not a human forecast; its size is the NHC's whatever the storm (the fans are tighter for mature storms, the cone is not); the shared error is a model of forecast error, not a different weather; the jet stream layer's note, which sat in the hidden row, is in the button's tooltip.
- **Storms, milestone 12: ensembles and the track density -- a fan of tracks for whatever you select, and where they agree.**
  *What you asked:* with the layer on, selecting a low, wave, disturbance, invest or tropical cyclone shows various ensembles that update smoothly; hovering one highlights it and gives its data; a second layer, Track density, shows where the ensembles line up by colour (red where all agree, then as they spread); the spread realistic, not code-looking, and the fans of a mature storm the most accurate.
  *How a member is made* (`Manager.prototype.ensemble`, src/storms.js, one implementation for all nine pages): a copy of the live system (`cloneSystem`; for a tracked low the same low a placed one is, moving as the track moved) is stepped hour by hour by the engine's own `stepSystem` through the page's own weather of the next seven days (the shadow environment the Place preview uses, rebuilt when it is 12 hours old, 0.2-0.7 s once), with what a forecast does not know made different from member to member: (1) the *features the steering is read from are shifted* (sd 0.4 degrees at the start growing to 5 degrees a week out), so where the flow changes sharply (a ridge's edge, a trough) members recurve at different times and the fan opens up by physics, not by jitter (across a steering edge the spread at four days is 322 km against 237 km with no shift of the features and 278 in uniform flow); (2) a slowly changing speed and direction error of the steering (1.3 kt growing to 1.9); (3) shear x (1 + e), sea temperature +/-0.4 C and humidity +/-4 reaching full size after 48 h, and new draws of chance (wobble, rapid intensification, genesis); (4) an analysis error at the start (0.1 degrees, +/-5 kt). Everything is scaled by a *predictability factor*: 1.3 for a wave or a low, 0.5 for a hurricane (falling with the wind between 25 and 80 kt), so an invest is a wide fan and a mature storm a tight one. The sizes were fitted to NHC-like mean track errors, not by eye: the spread of a wave's 24 members at 24 / 48 / 96 / 168 h is 61 / 145 / 324 / 588 km (NHC-like 78 / 143 / 312 / 624), a 45 kt storm's 79 / 168 / 332 / 539 and a 90 kt hurricane's 71 / 125 / 237 / 350. The real storm, continued in the same weather with its own chances, lies inside the 90 % of the members nearest the fan's mean in 88 of 89 positions at 2, 4 and 7 days (30 systems).
  *Smooth updates:* a member's coefficients are hashed from the seed, the system and the member, never from the hour, so a fan made six hours later is the same fan moved on: the same member's position four days out moves by 93 km in the median and 146 km at the 90th percentile against a fan 332 km wide. The page makes a fan at each six-hour issue (once a day at 8x and above, where the weather look-ahead would otherwise run every second) and draws it anchored to where the system is now, the anchor fading out over two days.
  *Names:* 24 members in three families, GEFS p01-p10, ECENS e01-e08 and CMCE c01-c06; they are one engine with different draws, the names are labels.
  *The page:* two layer rows (`Ensembles`, and `Track density` once ensembles are on, both off to start with). With Ensembles on, any selected system gets thin curves (1.3 px, through the midpoints of the three-hourly points) coloured by each member's intensity, pale for a wave and grey once post-tropical, fading with lead. Hovering a line draws it thick with a halo, dims the others and shows `GEFS p07 . 168 h`, `init 12z Aug 22 2026`, `peak 85 mph (1-min)`. Track density is a grid in longitude and Mercator y (so it lands exactly on the map's projection) of the share of members within a footprint (0.6 degrees growing to 1.4 with lead) of each cell, blurred once and drawn as a smoothed image (0.99 at the start, 0.98 at a day, 0.50 at three days, 0.17 at seven in the check): red where every member passes, then orange, yellow, green and blue. A plain wave or L can be clicked now: it is picked alone like a cyclone (no card; the hover tip) and gets its fan; `Esc`, an empty click, Place or a new season put it all back. `SSTSIM.ensState()`, `ensPoint(k, i)` and `plainSelState()` are the hooks of the checks.
  *Tests:* 282 node checks (24 members and names, the same twice, the live system untouched; start and widening; the spread against NHC-like errors and the order wave > storm > hurricane; the real track inside the fan; a refresh six hours later; a steering edge and the shift of the features; a tracked low and nothing; the density's values) and 7 browser checks (the layers exist and start off, the fan is painted in several colours from the storm, hover and un-hover, the density paints the map, nothing once deselected, a plain wave picked alone with its fan); mutants Z121-Z127 (the shift of the features, the predictability factor, a new fan every issue, the density never red, members far from the system, hover, picking a plain wave) all killed, and U5, Z66, Z104 and Z108 written against the code as it is (200 mutants, every anchor found once).
  *Known limits:* the members are one engine with perturbed weather, not different models; the look-ahead is seven days, the length of the page's own weather forecast; at 8x and above the fan refreshes once a day; the spread is fitted to typical track errors, not to the weather the page happens to make (the page's weather is the truth, so the real track sits near the middle of the fan rather than at a random member); selecting an area with no system yet shows no fan.
- **Storms, milestone 11, third round: a disturbance with a 2-day chance of 0 is not in its shape yet, and an arrow that keeps pointing at conditions that run away from the disturbance loses the belief in its chance.**
  *What you asked:* "When the chance is 0 for 2 day, it means IT IS NOT IN FAVORABLE CONDITIONS, so it SHOULDN'T be in the shape yet. Maybe the prediction system is not working well because it predicts it will go into favorable conditions then sets it back even further and keeps doing that until it's dead or at 100%".
  *What was wrong (measured on the real Atlantic page: three seeds, sixty days from the first of August, an issue every six hours, the engine's own outcomes as the truth).* (1) **Favourable was the growth gate at the X, not the chance.** The X was inside its shape while the gate (humidity, shear and sea temperature where it is) was open, and the chance comes from the hazard along the whole track, so 18 % (seed 4242) and 24 % (seed 777) of the areas with their X inside had a 2-day chance of 0: a disturbance sitting in an open gate where nothing forms for days (a hazard that is small where it is and large farther along its track) was drawn in its shape. The gate itself flipped by more than 0.8 between two issues at the same disturbance in 11-16 % of the pairs: the page's humidity is noise on a scale of a degree or two (a standard deviation of 14.5 points along a latitude line, a correlation of 0.91 at half a degree and 0.04 at two degrees; at a disturbance its autocorrelation at 6, 12, 24 and 36 hours is 0.60, 0.23, 0.15 and 0.00) in front of a gate that is open between 53 and 63 % of humidity. (2) **The forecast onset did not come closer.** For an arrow, the hours to the start of the shape got no closer by at least 2 of the 6 hours between two issues in 47-49 % of the pairs, and the worst case is the one you described: a wave whose arrow grew from 2.5 to 17.6 degrees over 16 issues with the start of the shape 76-90 hours ahead the whole time while its 7-day chance climbed from 50 to 95 %. The track forecast is not the cause (the real motion over the forecast one, along the track, 1.02 at 24 hours, 1.03 at 48 and 1.06 at 72; the miss 0.3, 1.3 and 2.5 degrees): the weather in front of the disturbance changes under a forecast that holds it.
  *The rule.* The X is inside its shape only while the 2-day chance is not 0: the chance of formation within two days has to reach 3 % for it to come in and fall under 1.5 % for it to leave (a band, so that it does not go in and out at the edge; an X that the band keeps inside shows 5 %, the 2.5-3 % that round up, never 0). Outside, an arrow runs from the X to the place of its mean track at the hour when the chance of formation has reached 2.5 % (what the 2-day chance would round up to 5 % from), and the shape starts there (`par.outlook.favP2`, `onsetP`); the arrow is at least 2.5 degrees long (a disturbance that moves slowly has the shape start farther along its track), a shape on its way from the X has its head put that far from it at once and moves at most 2 degrees in an issue after that, and an arrow never points farther than 30 degrees (36 once it is there): beyond that the area is not drawn until it is nearer, its chance kept. The growth gate has no part in it any more; it is gone from the forecast. On the real Atlantic page the X's inside their shapes with a 2-day chance of 0 went from 76 and 150 to 0 and 0 in the same two seeds, and 3 of 1,736 areas over three more Atlantic seeds and 2 of 443 in the West Pacific (disturbances that hardly move).
  *The belief in an arrow.* The forecasts were checked against what the engine did (the 7-day chance of every area at every issue against whether the system became a depression within 7 days, three seeds, 1,382 area-issues: a Brier score of 0.180, and 0.069 for the 2-day chance): an arrow that has been there for up to 8 issues is believed correctly (a 7-day chance of 0.25 for 0.24 that happened), after 9 issues or more it is not (0.46 for 0.24 over 49 issues): conditions that keep running away from the disturbance are a reason to give up, not to climb to 100 %. An arrow that stays for more than 6 issues in a row (a day and a half) multiplies the chances by a belief that falls from 1 to 0.5 over the next 12 (`par.outlook.cred`; the number of issues is in the memory, `ar`): in the same seeds the arrows of 9-16 issues went from 0.38 to 0.29 (0.17 happened) and those of 17 and more from 0.73 to 0.37, and the Brier score of the arrows from 0.2137 to 0.2077, with no change for the disturbances in their shapes.
  *What was tried and did not work, and is not in:* longer or shorter persistence of the weather (the 7-day Brier score is 0.1796 with the 480 hours of the humidity and the shear that it has, 0.1799 and 0.1804 with 240 and 96, 0.1937 and 0.1990 with 48 / 24 and 24 / 12 hours: the persistent part of the anomaly is real, the noise on top of it is not worth forecasting but does not hurt), a share of the humidity and the shear anomaly that travels with the disturbance (0.1811 with half, 0.2086 with all of it), the humidity averaged over a ring of five points (0.1781 for 7 days, 0.0770 for 2: better for the one, worse for the other), a longer persistence of the steering anomaly (the arrows' non-approach is not the track).
  *On the page* (real Atlantic, seed 777, 22 August: a wave with a 7-day chance of 65 % and a 2-day chance of 0 %, a red X outside its shape with a red arrow into it, `0% · 65%` on the shape): the tip of an arrow reads "Not yet in favourable conditions: nothing is expected in 2 days, the chance starts to build up in about N days"; `SSTSIM.stormEnvAt(name, lat, lon)` gives the page's sea temperature, humidity and shear at a place (the tools and the checks).
  *Tests:* node checks 274 (new: the season rule (no X in its shape with 0 %, 24 arrows against 25 X's with 0 % when the rule is off), the zone ahead (10 and 14 degrees: inside at 5 %, outside with a 16-degree arrow and the shape starting 68 h on), the cap (26 degrees drawn, 31 not, drawn with the cap raised), the band at the edge, the belief in a running-away arrow (65 % at the fourth issue, 30 % at the last, against 65 and 65 when nothing is discounted), the head's 2 degrees an issue) and a browser check on all nine pages (the real outlook over ninety days: no more than 5 % of the X's in their shapes with a 2-day chance of 0); 13 mutants, all killed by a failed check: Z114-Z119 new (the 5 % of an X kept in by the band, the belief in an arrow, the least length, the onset at 2.5 %, the count of issues) and Z53, Z55, Z61, Z70, Z89, Z90 and Z111 written again (their anchors were the growth gate or the old arrow code).
  *Known limits (new):* an X can still be in its shape with a 2-day chance of 0 when the disturbance hardly moves (a seed that stays where it is has no place to point to); the belief in an arrow was fitted on the Atlantic and looked at on three more seeds and the West Pacific, where the arrows' chance is still higher than what happens (0.26 for 0.09 on the new Atlantic seeds, 0.14 for 0.05 in the Pacific): the forecast cannot know the weather the page will make, so it is optimistic about the conditions ahead of a disturbance that is not in good ones; an area whose chance builds up more than 30 degrees ahead is not drawn until it is nearer.
  *Outlines (a follow-up):* the shapes looked jagged zoomed in because `swathFull` kept about 50 points of the outline and gave every coordinate to a tenth of a degree (3 px at zoom 6, a stair step along every edge). It keeps up to 110 points before the corner rounding (at most 220 after it, the cap the check keeps) and gives the coordinates to a hundredth of a degree; the 274 node checks pass unchanged (one simple loop, no disc outside, none across the equator, the point cap).
- **Storms, milestone 11, second round (after the first trial of the outlook): chances and shapes that move on from the last issue instead of starting again, one clean outline, no two areas on top of each other, the X and the arrow in the colour of the chance, the wave or the L *becomes* the X, titles beside the X's, a click that shows one disturbance alone, and an arrow that does not run away from its disturbance.**
  *What you asked:* "Shapes break every now and then", "can the X and arrow fill color be the color of the chances?", "Chances sometimes go from 15 to 100 extremely quick and shapes and chances fluctuate VERY fast, yes chances can go up or down fast but not 15 or 30 to 90 or 100 fast", "Shapes always fluctuate very fast ... but they FULLY change in just one advisory", "add a title next to invests without having to hover like TC's do? Same for Disturbances", "instead of an X being placed ON TOP of the wave/low, the wave/low becomes the X instead. Yes it can devolve back", "When clicking on disturbances make it just show that disturbance and it's shape, like how TC's do", and "the shape moves further and further away and has a longer and longer arrow. If the disturbance IS in favorable conditions it can just stay in the shape and adjust for position of the disturbance".
  *What was wrong (measured, not guessed).* (1) **Every issue was made from nothing.** Nothing carried a disturbance from one issue to the next, so a threshold crossed by a hair moved a shape across the basin and a chance by 80 points (over two weeks of a synthetic season the 7-day chance of one disturbance moved by up to 80 points between two issues, and a shape and the one before it had overlaps down to 0.03); the page also skipped issues at 8x and above, and a system that was only an area (key `uW2:173`) and the wave it became (`W2`) were two different things, so its chance started again at its birth. (2) **The outline was the two offset curves of a capsule chain.** Where the track bent more than the radius they crossed and drew a small lens-shaped loop inside the area (the "break"). (3) **The arrow compared the rate the disturbance has with the best rate along its track.** The best rate was always a little farther ahead (the anomalies decay along the way), so the shape ran ahead of the disturbance, the arrow grew, and the X was never inside. (4) **Shapes were long and overlapped:** before the length cap and the overlap rule below (the engine with the memory but not yet those two) the Atlantic page's shapes were 21.5 degrees long in the median (90th percentile 31.5, longest 37.4, radii included) and two areas overlapped in 106 of 120 issues (252 of 528 pairs), each drawing its outline through the other.
  *The engine remembers the last issue* (`olMem`, in `serialize()`, so a saved season goes on exactly): a chance changes by at most `rise` / `fall` = 20 points per issue (scaled by the gap when issues were skipped: 40 for two), a disturbance seen for the first time starts at 40 % (7-day) and 30 % (2-day) at most (a hand-placed one at the chance it has, the first time), and a shape moves 30 % of the way to the new forecast, at most 2 degrees (its radius at most 0.5 degrees) in an issue; a shape that was round its X is carried along with the X first, so a moving disturbance's shape moves with it, and an arrow grows out of the X as the shape moves away from it. A shape that a neighbour held short (see below) grows back by at most 2 degrees an issue. The memory is kept under a *continuity key* (`ck`): an area that does not exist yet has the key of the birth it will become (`uW2:173`, `uN1243:275`), the wave or seed born from it keeps it (`S.ck`), a tracked low and the depression it becomes the low's id, so the chance and the shape go on across the birth (a shape's overlap with the one before it at the birth: 0.45-0.75 over 30 births, the chance moves by at most 20). After a gap of more than 30 hours (a page that was not looking) the memory is not used.
  *One outline, never a stray loop.* `swathFull` (src/storms.js): the zero line of the distance field of the chain of discs (marching squares on a grid of 70 cells, the saddles decided by the centre, the biggest closed loop kept, one Chaikin pass, then the equator's soft floor), which is one closed loop whatever the track does; it also finds the *pole* of the shape (the deepest point, by flood fill), where the chances are written. 363 random and awkward chains (out and back, a spiral, swinging radii, 340 random walks, some at the equator, some in the south): none crosses itself, none loses a disc, none crosses the equator; every outline of 1,111 shapes of six synthetic seasons fills at least 93 % of its convex hull (an oval, not a crescent; 0.94 over the 635 of the three weeks the tests use).
  *No overlapping areas, and shorter ones.* A swath is at most `maxLen` = 14 degrees of track (the longest chain after blending is capped at 1.25 times that), and the shapes are made oldest disturbance first (an X before an area that is still to be born, births in the order of their hours): a swath stops where it would come within `gap` = 0.5 degrees of a shape already made, the way a wave's area ends before the area of the wave ahead of it, and keeps the disc round its X whatever happens; an area whose first disc is under an older shape is not drawn (its chance is kept and it is drawn when the older one has moved away). The Atlantic page over a month: median length 18 degrees including the radii (90th percentile 22, longest 23.5), 0 overlapping pairs of 234 (13 of 1,092 in three synthetic weeks, all because the X of one sits in the shape of another, against 373 of 1,029 when the shapes are not kept apart).
  *Favourable means the growth gate is open.* An X sits inside its shape (which follows it) while `devGateOf` (the engine's growth gate for a tropical or subtropical system, times the doors the genesis rule closes) is at least 0.4 where the disturbance is (0.6 to open again: a hysteresis); when it is shut an arrow runs from the X to where the gate opens within the week and the disturbance is still likely to be there (`surv` at least 0.3), 2.5 to 18 degrees long (24 when it already has one), and it shortens as the disturbance comes toward that place: in a band of shear a wave leaves behind it, the arrow of 15.2 degrees became 14.0, 12.7, 11.4, 10.1, 8.9, 7.8, 6.5 and 5.3 in the next eight issues with its tip between 41.2 and 42.5 W, then the X was in the shape. An arrow that is there stays while the gate is half open (0.49: it comes and goes at 0.6 and 0.4), grows out of the X as the shape moves away from it, and is never longer than 18 degrees (a wave with good water 14 degrees west of it gets a 17-degree arrow, 16 degrees west none). Longer anomaly time constants (720 h for the sea, 480 h for humidity and shear) keep the places where the conditions are good where they are. On the real engine (Atlantic, 160 days) 83 of 1,373 areas had an arrow, 2.5 to 13.5 degrees long (median 6).
  *The page.* The X and the arrow are filled with the colour of the chance (yellow, orange, red) on a dark outline; a wave or an L that has an X is the X (no dashed line or L under it, one thing to hover and click; it comes back when its area goes), with its title beside it on the side away from its shape (`Invest 92L`, `Wave`, `Low`, `Disturbance`, `Placed wave`), under the Storm names box with the chances; a click on an X or on an area (a cyclone under the pointer wins over an area) shows that disturbance alone, as a cyclone is shown alone: every other path, wave, L and area goes, its own trail, area, X and arrow stay and a card (`#aoi-card`: the chances in 2 and 7 days and the class, the conditions, the movement, the position, the shear and the sea temperature there, the issue and the window of formation) says what it is; `Esc`, the cross, an empty click, Place or a new season put everything back, and a disturbance that becomes a depression hands the card to the cyclone. The issues are made one after another as the clock goes by (`olEager`: every one at 4x and below, every second at 8x, every fourth at 16x ..., never more than about eleven a second), so each has the one before it to move on from; `stormJSON()` (the determinism checks' state) leaves the outlook's memory out, since which issues were made depends on the speed the page was played at.
  *Cost:* a fresh issue 2-6 ms on the Atlantic and West Pacific pages (at most 5.8 ms over eighty issues, up to four areas), so the eager issues cost about 5 % of a core at 4x and 11 issues a second above it.
  *Tests:* 271 node checks (22 new on the outlook's calm and shapes: no chance moves by more than 20 points in 963 steps of three synthetic weeks, and a newcomer starts at 40 / 25 at most, against 80 with the memory off; the overlap of a shape with the one before it carried along with its X: median 0.88, 10th percentile 0.72, 1.8 % under a half and none under 0.41, against 8.4 % under a half and one of 0.03 with the memory off; every second issue skipped: at most 40; the 363 awkward chains; the arrow that shrinks without running away; the shape that follows a disturbance in good conditions; the key that goes on across a birth; a hand-placed wave at its own chance, also when the engine has a memory to cap it with; no overlaps; poles; the track cap, also at a disturbance's first issue, where nothing else shortens it; ovals; the stream of issues the same for any chunking of the clock; a saved memory restoring to the same next issues) and browser checks (the X colour of each class, the dark outline, the arrow's colour, shaft and head; a wave that has an X has no dashed axis and gets it back; titles on the correct side and gone without the names box; a click on an X, on an area, Esc, the cross, Place; the hand-over to a depression; ten days of six-hour steps on the real engine with no 7-day chance moving by more than 20) and mutants for each of these (31 new, Z83-Z113, and the older Z53-Z82, X1, X4 and U5 repaired for the new page). *Mutants:* the 26 engine mutants on the node checks: 24 died the first time, and the two that got through now have a check each (Z85, a placed wave held to the cap of a newcomer: the check's first issue had no memory for the cap to apply to, so it makes an issue the hour before; Z94, the cut of a swath's track at `maxLen`: the later cap at 1.25 times that hid it, so the track is measured at a disturbance's first issue, 14.1 degrees against 17.5 with the cut off and 55.1 with both off); the 17 page mutants on the browser checks (U5, X1, X4, Z72, Z75, Z80, Z82, Z100-Z109): all killed by a failed check. One of the 17 (Z105, an area can only be picked by its X) first 'died' of its own syntax (it cut one `else if` out and left the next `else` without its `if`, the page did not load, and the tool counts any crash as a kill); it is repaired, and `node tools/storm_mutants.mjs --dry` now parses every mutated file as well as finding every anchor once, which found one older mutant with the same fault (S7, a pattern that stopped halfway through a line comment): all 186 mutants parse and both of those are killed by their own checks now.
  *CI and Pages:* the first push of this round (`4fcd708`, then `795e916`) failed in the browser job, in the Place checks, with the deploy skipped: the checks before them left the map zoomed in on some other place and the pointer's test spot (15N 45W) was under the Place picker, so the preview never started (the view was the cause, not the speed of the runner). The Place checks now set the page's own view first (`a54fa43`): the run passed in 19 minutes and the Pages deploy went out.
  *Known limits (new):* an area that sits under an older disturbance's shape is not drawn, and neither is an X whose arrow would point into one (it is a plain wave again); a chance that the limiter holds back can take several issues to arrive when the raw forecast jumps (it moves 20 points an issue toward it); at 32x and 64x only every eighth or sixteenth issue is made, which is beyond the 30 hours the memory is used for, so at those speeds the outlook is the raw one; shapes are ovals along the mean track, not forecasters' hand-drawn polygons.
- **Storms, milestone 11: one outlook for every basin (areas of interest with the chance of formation in 2 and 7 days, X's, arrows and invests from one implementation in the engine and the page layer; no crossing of the equator; remnant lows as triangles; each basin's own intensity scale).**
  *What you asked:* "make it a PART of the TC system and not per basin system" (so one shared implementation, no calibration or data runs), "TC's can go through the equator, that shouldn't happen", "make remnant lows have a triangle too not a dot" and "native scaling for basins like west pacific is not category 1 2 3 4 and 5 its Typhoon, etc."
  *No crossing of the equator.* The motion had no latitude rule: only the growth gate's own edge spun a system down near it, and a steady steer toward the equator took weak ones across. After the meridional step `keepSide` (src/storms.js) now bends the latitude into a soft floor, x = a exp((x - a) / a) below a = 2.5 degrees (`par.eqSoft`, x the distance from the equator on the system's own side): the same latitude to the last bit poleward of it (no calibrated storm moves), positive for any step, so a system pushed toward the equator by 25 kt of steering for 15 days ends near 1.3 degrees in either hemisphere (a cyclone, a wave and a low, 9,704 system-hours: lowest 1.25) and the growth gate's own edge spins it down there. No wall, in the spirit of milestone 9.
  *Remnant lows as triangles.* A remnant low or any other non-tropical low is a grey triangle like a post-tropical cyclone (`shapeOf`, src/storm-hooks.js), in the advisory dots, the live head and the Place preview.
  *Each basin's own intensity scale.* `SCALES` and `classOf(basin, wind, class)` in src/storms.js. The engine's wind is a 1-minute wind (the US best-track convention, and what the real normals are counted in); the agencies of the other regions classify on 10-minute winds (JMA, Meteo-France, the Bureau of Meteorology, Fiji) or 3-minute winds (IMD). Each class starts at the agency's official cut-off converted to the 1-minute wind (10-minute / 0.88, 3-minute x 1.05: rule-of-thumb factors, not measurements) and rounded to 5 kt, so a storm is called what that agency would call it; the first storm class stays at 34 kt, the naming wind of every basin. Atlantic, East Pacific, South Atlantic and Mediterranean: Saffir-Simpson as before (with the local word: Hurricane, Cyclone, Medicane). West Pacific: Tropical Storm 34, Severe Tropical Storm 55 (JMA's 48 kt of 10-minute wind), Typhoon 64, Super Typhoon 130 (JTWC's own 1-minute cut-offs). North Indian: Depression, Deep Depression 30, Cyclonic Storm 34, Severe 50, Very Severe 65, Extremely Severe 95, Super 125. South-West Indian: Moderate Tropical Storm 34, Severe 55, Tropical Cyclone 75, Intense 100, Very Intense 130. Australian region: Tropical Low, Category 1 34, 2 55, 3 (severe) 75, 4 100, 5 125; the South Pacific the same from a Tropical Depression. Used in the tooltip and the stat card, the Place line ("Typhoon . peak 115 mph . by day 4") and the Peak column of the season summary; a marker's colour stays its wind (one colour language on every page). The season bar's three strength counters keep their engine thresholds (64 / 96 / 137 kt, which the real averages beside them count) and only their tags are native: `TYPH | MAJOR | SUPER`, `VSCS | ESCS | SUPER`, `CYC | INTENSE | V.INT`, `SEVERE | CAT 4+ | CAT 5`, `HURR | MAJOR | CAT 5` (so the third tag of the North Indian, South-West Indian, Australian and South Pacific pages counts a slightly stronger storm than its name: 137 kt against 125-130).
  *The outlook (areas of interest).* The National Hurricane Center's graphic for every basin from one implementation: `Manager.prototype.outlook(env)` (src/storms.js) makes it; src/storm-hooks.js draws, picks and describes it (`drawOutlookAreas`, `olGlyphX`, `olGlyphArrow`, `olTip`); src/storm-ui.* hold the legend and the layer row, now "Areas of interest (outlook)". The dashed-ring X of the old disturbance stage is gone (a flagged disturbance is drawn as the wave or low it is; the engine's flag now decides the invests). Nothing in it is fitted, measured or ported per basin: it reads the engine's own rates and each page's own maps, and `par.outlook` holds choices, not fits.
  *What is drawn.* A shape is where a tropical or subtropical cyclone could form in the next seven days: diagonal lines over a faint wash (a repeating pattern, closer and thicker for a higher chance: 9 px / 1.4 px, 7.5 / 1.7, 6 / 2.0) inside a coloured outline on a dark halo, in the NHC's yellow (7-day chance up to 35 %), orange (40-60 %) or red (65 % and over: the 0-30 / 40-60 / 70-100 of the request, with 35 and 65 going to the nearer side) with "2-day % · 7-day %" written on it (with the Storm names box), in steps of 5 and never a decimal, nothing below 10 %. An X (dark on a white halo) is a disturbance that exists (an easterly wave, a local seed, a tracked low, a placed wave) and follows it between issues; it sits inside its shape when the rate it has now is at least half of the best it will have, otherwise an arrow (at least 2.5 degrees long) runs from it to the shape, which is then where the conditions come right; a shape with neither is a disturbance that has not formed yet. A disturbance that has become a depression, or is gone, takes its X and shape with it; the held issue is replaced at the next 00, 06, 12 or 18Z (the legend says which; a hand-placed disturbance is in it at once). Hover an X or a shape for the chances, what it is, where it is going and when it should get good conditions or form; the invest number is the title.
  *How the chance is made.* Each candidate (every alive wave or seed, every tracked low over water, and every birth the supply has scheduled in the next 168 h) is followed along its mean track in 3-hour steps: the real drift of a weak system at its place and month plus the steering anomaly the page shows now (decaying with a 72 h time constant), through the environment the page has now with every anomaly from the page's own climate decaying (300 h for the sea, 96 h for humidity and shear), so the season goes on under the forecast and the forecast regresses to the mean. The rate along it is the engine's own, hour for hour (`envFactor`, `devGateOf`, `hazAt`, `satur`, the quality's mean `E[exp(qSd q)]` given the quality now, the activity factor, the El Nino term), thinned by the chance that a development event becomes a depression (`tdShare` 0.92, the doors the genesis rule closes -- land, the equator, cold water -- and, where `tdMargin` is set, the chance the growth gate holds it, a normal distribution of the quality) and competing with what ends a disturbance (cold water, latitude, age, land, a seed's own drawn life, a tracked low's 60 h life); the depression forms `(devV - the wind its environment holds)/devRate + 7` hours after the event (12 to 34 h). The chance of formation by a time is the integral of rate times survival, rounded to 5. The shape is the outline of a chain of discs (radius 1.2 degrees + 0.6 degrees a day of lead, 1.5 more for one that does not exist yet) along the track over the 10th to 90th percentile of the formation time, smoothed twice and folded at the equator by the soft floor, so a high chance soon after favourable conditions is short and compact and a thin chance spread over days long and wide. A disturbance that already has its development under way (`S.dev`) has its chance from the survival to the hours still needed (90 % in a good environment) and a short shape.
  *What exists and what does not yet.* `_spawn`'s generators (`_waveNext`, `_waveBirth`, `_localSeed`, `_floorSeed`) were cut out of it, so the outlook asks the very functions the engine runs for the hours ahead: of the births of a week from eight starting times it saw coming 405 of 405 (position, hour, strength and life), and made up none. A birth is drawn as a shape only inside its lead, a hash draw of the birth (`ST.LEAD`): a wave 48 to 168 h, a local or floor seed 12 to 120 h, three in ten of them none at all (204 of 308 seeds due within 12 hours are seen), so some disturbances come with up to a week of notice and some form unexpectedly and show first as an X.
  *Invests.* A disturbance the engine flags (`S.dist` / `t.dist`: its development has begun, or its environment holds its wind near what a depression needs) is given the next number 90-99 of its region's letter at the first six-hourly look (`BASINS[..].inv`: L Atlantic, E East Pacific and C west of 140W, W West Pacific, A Arabian Sea and B Bay of Bengal either side of 78E, S and P either side of 135E in the Australian region, S South-West Indian, P South Pacific, Q South Atlantic, M Mediterranean), numbered from 90 again each season and round again after 99; a low that becomes a depression hands its number on (it always has one). It is a property of the system, so it is the same whatever the clock's chunking or speed, and it is in the save (`invN`, default empty for a save made before). It is the title of the tooltip (`Invest 92L`) and the stat card of the depression says `as Invest 92L`; no map label.
  *What it looks like and costs.* 240 daily issues per page (two seeds, 120 days from the day the page's season starts), areas per issue: Atlantic 2.6 (at most 9), East Pacific 1.3, West Pacific 1.9, North Indian 0.3, Australian 0.6, South-West Indian 1.0, South Pacific 0.4, South Atlantic 0.2, Mediterranean 0.1; by class the Atlantic's 611 areas are 441 yellow, 83 orange and 87 red (the East Pacific's 316: 126, 66 and 124: its seeds develop easily), 229 of the Atlantic's have an arrow, 147 an X inside, 235 are disturbances not formed yet. A fresh issue costs a median 0.1-2 ms (p95 1-5.5, at most 10 ms, measured with a mutation run going beside it), and the page shows a held one for up to 0.6 s at 8x and above; with the layer on, one redraw of the map's storm canvas costs 0.45 ms against 0.15 ms without it (four areas) and the clock runs 131 against 134 simulated hours a second at 8x and 916 against 988 at 64x (headless Chromium, the Atlantic page).
  *Tests:* step 1 (the equator, the triangles, the scales) added 11 node checks (the soft floor's identity, its sign and monotonicity, six systems of three kinds pushed toward the equator in both hemispheres; the nine scales ascending with a storm class at 34 kt, every cut-off a boundary, the converted cut-offs against the agencies' own numbers, the names at chosen winds, Saffir-Simpson exactly where it should be), changed the browser checks in place (the remnant-low triangle by pixel probe, the season bar's native tags, the tooltip and the card in each basin's own class) and six mutants (Z47-Z52). Step 2 (the outlook and invests): 249 node checks in all (29 new on top of the 220: the outlook's chances against the engine's own for 200 identical disturbances in a favourable, a marginal and a subtropical environment and with a stricter depression, a better environment a better chance, regression to the mean under a decaying anomaly, rounding, the three classes and their cut-offs, outlines, X's and arrows against the shapes (a front the wave leaves behind it gets an arrow, the least length, X inside), the short window of a high chance, a developing disturbance, the widening shape, 405 of 405 births, the lead, the six-hour hold, a placed disturbance at once, any chunking of the clock, a save, tracked lows, the equator, the invest letters, 90-99 and round again, the new season, an old save, a low's hand-over) and 1789 browser checks (13 new: the hatch as lines over a wash and not a fill, the three colours, the dark halo on the outline, the X, the arrow, the L under an X, hover, the legend, the numbers on the shapes, the box, formed disturbances, the end-to-end outlook of waves put in the main development region, the per-basin check of ninety days on all eight other pages, the legend gone with the storms), 155 mutants in all (30 new, Z53-Z82, and the eight whose anchors the refactor moved) all caught: the first pass left two alive (the 2-day chance equal to the 7-day one, and the least arrow length) and the node checks were tightened.
  *Known limits.* The forecast is a persistence forecast (the anomalies of the page's environment decaying to its climate): honest but not sharp, it does not know the weather beyond the next keyframe, and the real outcome of a disturbance can differ from its chance as a coin does from its odds; a tracked low is extrapolated at its motion decaying over 48 h; the shapes of neighbouring disturbances are not merged; the delay from event to depression, `tdShare`, the anomaly time constants, the radii, the lead ranges and the no-warning share are choices, checked against the engine where they can be (the chances) and not fitted; the unborn systems are known exactly (place and hour of their birth) but their quality is not; the invest rule is the engine's flag at a six-hourly look, not an operational decision.
  *CI and Pages:* both commits of the milestone (ea44124 for the equator, the triangles and the scales; a16c40a for the outlook and the invests) passed `Build & test` on GitHub Actions (the node checks and the browser checks on all nine pages: 17 minutes for the second) and the Pages deploy that follows it (run 39344811969).
- **Storms, milestone 10: the storm system on all nine pages (one storm layer, the basin layer in the engine, the tools that make a basin's climatology, the lag test that was missing, the seasons of the humidity and shear the storms read and the engine's El Nino term; all nine basins are switched on: the Atlantic, the East Pacific, the West Pacific, the North Indian Ocean, the Australian region, the South-West Indian Ocean, the South Pacific, the South Atlantic and the Mediterranean).**
  *What you asked:* "we got to move on to rolling this out to all basins".
  *One storm layer.* The Atlantic's storm code was a 1,000-line block inside `src/template.html`; rolling out by copying it eight times would have left nine copies to keep in step. The page code now lives in four shared files, `src/storm-hooks.js` (the storm grid, keyframes and clock, lakes as water, drawing, hover and click cards,
  Place mode, season bar and summary), `src/storm-late.js` (the controls' wiring, save / resume and the storm half of `window.SSTSIM`), `src/storm-ui.css` and `src/storm-ui.html` (named sections), which `tools/build.mjs` inlines at placeholders (`/*__STORM_HOOKS__*/`, `/*__STORM_LATE__*/`, `/*__STORM_CSS__*/`, `<!--__STORM_HTML:name-->`, `{{BASIN_LABEL}}`).
  A template says only which basin it is (`const STORM_BASIN`) and how to read and set its ocean-feature state (`featState`: the Atlantic's Gulf Stream shift, eddies and Loop Current dip; the others' gap index). `tools/port_storms.mjs` carried the rest of the Atlantic's storm-era edits (the one-degree storm grid, the lazy synoptic up-sampling, the features split, the frame loop, `window.SSTSIM`)
  into the other eight templates, change group by change group with unique anchors (`--check` rebuilds the Atlantic's template from the base commit and requires it to match byte for byte; `--base` / `--out` for other bases). All nine pages build, start and pass the suite.
  *The basin layer in the engine* (`BASINS` in `src/storms.js`): label, the main menu's id, the month the season starts in, the word for hurricane strength (hurricane, typhoon, cyclone, medicane), the latitude where tracked lows begin to count, the main development region (the box the relative sea temperature is measured over), whether the basin has a wave train of
  its own (`waves`: the Atlantic only; the other basins' disturbances are the local seeds of their fitted supply and the tracked lows) and the naming scheme. **Seasons:** a northern season is the calendar year; a southern one runs July to June and is named for the year it starts in (`2026-27` on the bar and the card, the ACE graph's axis starts on Jul 1, the season turns over on Jul 1, a checkpoint keeps it), and the season's
  activity draw is one number per *season* (it was per calendar year, which would have stepped it on Jan 1 in the middle of a southern season). **Names:** the Atlantic and Eastern Pacific yearly lists (six, rotating, with a supplemental list), the Central Pacific list for a storm west of 140W with a cursor of its own, and the sequential lists of the Western Pacific, North Indian, Australian, South Pacific, South Atlantic and Mediterranean
  (the list goes on from storm to storm and season to season and wraps). The lists are written from memory, as for the Atlantic: the 2026 Atlantic list is high confidence, the others and the replacements are not verified (`verified: false`, edit them in `src/storms.js`). **Hemispheres:** everything in the engine is by |latitude|; the structural (no-maps) beta drift of a tropical and a subtropical system was north-west-only and is now poleward-west.
  *Switched on by data.* A page runs the storm engine and shows the storm controls only when its data file carries the climatology the engine is anchored to (`storms.maps`, `STORMS_READY`); until a basin's maps are fitted its page is exactly the page it was (no season bar, no Place button, none of the Customization or Advanced rows, the plain simulation), with the Menu button. The lab and the region dump force the engine on (`SSTSIM.stormsForce`).
  *The tools that make a basin* (`tools/tc_basins.json` is their table): `tools/storm_region.mjs` asks the built page which half-degree cells are inside the basin and which are land for a storm (the East Pacific page, 79 % inside, masks the Atlantic side of Central America; the pages' boxes reach across the equator, so each basin has a `hemisphere`: the East Pacific page holds the South Pacific cyclones east of the date line, which are the South Pacific page's);
  `tools/make_tc_basin.py` makes `<basin>-tc-ref.json` (the targets) and `<basin>-tc-maps.json` (genesis and drift maps on the basin's node grid) from the same pinned IBTrACS tables, by *wind*, because the status codes of the Atlantic do not exist elsewhere (TY, ST, TC, MD, XX ...): a storm belongs to a page when it forms inside it over water and its track is cut where it leaves; depression = first tropical row of 25 kt, named 34, hurricane-strength 64,
  major 96, category 5 137, ACE over tropical rows of 34 kt or more, a season the calendar year or July to June. The definitions reproduce the Atlantic's published numbers (14.4 named / 7.2 hurricanes / 3.2 majors / ACE 122 over 1991-2020) before they are applied elsewhere. `tools/storm_mc.mjs`' `runLab` takes a `basin` (its page, the first day of its season, its main development region, the days its Nino 3.4 is read on), `tools/storm_fit.mjs` takes `--basin` / `STORM_BASIN`
  (its real maps, its wet nodes, a local-seed share of 0.9 where there are no waves, automatic regions for `refine`), `tools/storm_basin.mjs` runs whole seasons of any basin and prints them against its reference, and `HF_DIST=<dir>` lets the build and the lab use a build beside the one a test run is reading. The real references, 1991-2020 normals of the storms that form inside each page (depressions / named /
  hurricane-strength / major / category 5 / ACE, sd of the ACE): Eastern Pacific 19.6 / 16.6 / 8.8 / 4.6 / 0.53 / 132 (72); Western Pacific 29.7 / 25.1 / 15.7 / 9.1 / 2.9 / 289 (106); North Indian 5.4 / 5.2 / 2.0 / 1.0 / 0.20 / 22.9 (16); Australian region 12.7 / 11.7 / 5.7 / 2.9 / 0.40 / 74.9 (30); South-West Indian 11.6 / 11.4 / 6.4 / 3.6 / 0.47 / 102 (42); South Pacific 6.4 / 6.2 / 3.4 / 1.7 / 0.37 / 46 (34);
  the South Atlantic (3 tracks in the tables) and the Mediterranean (none) have no best track here and take literature-based maps.
  *The test that was missing.* The first full run on the ported tree found 4 failures, all one cause: the Australian steering-readout checks hover a point on the bottom edge of the view, which the dock (now with the Place button) covers; the point moved. An isolated pass of all 89 mutants then left one alive, **Y16** (the clock takes as long as it needs in a frame): since a simulated day costs 17 ms instead of 44, the frame budget no longer binds at 16x on a third of a processor,
  so the throttled-processor check could not see it. It now also runs at 64x, where the page draws 41 frames in 3 s with the budget and 5 without (one blocked for 1.2 s) and the clock owes 24 hours capped against 3,400 without the cap; both Y16 and Y17 are killed.
  *The environment the storms read.* The first West Pacific calibration came out with the El Nino response reversed (ACE 180 in the El Nino seasons, 271 neutral, 404 in La Nina; the record 386 / 291 / 193) and seasons far more different from one another than real ones (SD of the named count 12.7 against 4.6, ACE from 0 to 826 against 108 to 479). Measuring the page's own weather found why: the humidity of the western North Pacific's main development region (8-20N, 130-165E)
  varied by 7.0 points from one August-October to the next on the built page, where ERA5 (2007-2021) has 1.5, and fell 5-7 points per degree of El Nino where ERA5 has 0.9-1.4 for those months. Two gaps this document has listed since the shear roll-out: (1) the three lag terms of the El Nino response were fitted one at a time and summed, so a sustained event was counted about twice (reconstructing the 2007-2021 anomalies from the real Nino 3.4 history gives about twice the real anomaly in every basin), and (2) the year-to-year (EOF) modes and the El Nino pattern were fitted over all months together, while the real spread
  has a strong seasonal cycle (the region's three-month-mean humidity varies by 5.6-7.0 points from year to year centred on January to April and by 1.5-2.6 centred on August to October; its regression on Nino 3.4 is -4.7 to -8.3 points per degree in January to May and about zero from June to September). `tools/make_env_seasonality.py <basin> --write` (from the same ERA5 monthly means) refits the humidity and shear El Nino coefficients jointly (`climate_lib.enso_regression_lagsum`, as the steering field already had; the sustained-event response falls to 47-58 % of what it was in the seven pages, humidity in points per degree
  West Pacific 6.4 -> 3.0, North Indian 3.8 -> 1.8, Australian 4.8 -> 2.7, South-West Indian 3.1 -> 1.6, South Pacific 8.1 -> 4.0, South Atlantic 1.8 -> 1.1, Mediterranean 1.5 -> 0.9 and shear in kt 5.3 -> 2.6, 4.9 -> 2.5, 5.1 -> 2.6, 3.9 -> 2.1, 14.0 -> 6.6, 5.6 -> 2.6, 3.3 -> 1.9) and fits `seas`, a gain for each calendar month on the El Nino part (0.2-1) and on the EOF modes (0.3-1.5) to the three-month means of the main development region (the El Nino gain pulled toward its all-month value where the 15 years of a month cannot say, both smoothed across the months;
  West Pacific humidity: El Nino gain 1.0 in January-April falling to 0.52 in August-September, EOF gain 0.44-0.97). Each page's `computeField()` and the storm grid's `computeStormFields()` multiply the two terms by the gain of the day, interpolated between the middles of the months (`seasGain`, the nine templates and `src/storm-hooks.js`; `tools/merge_data.mjs <basin> --env-seas`). On the built West Pacific page the region's August-October humidity spread falls from 7.0 to 2.3 points (the real 1.5), the shear's goes from 1.7 to 1.6 kt (2.0), and sea temperature, whose spread (0.36 degC against 0.34) was already right, is untouched.
  The Atlantic and the East Pacific keep the original fields, because their storm physics was calibrated on them (a page without `seas` is bit for bit what it was); the price is that their "Keep ENSO at this value" runs still count a sustained event about twice.
  *What the fields still cannot do, and the engine's El Nino term.* The real western North Pacific genesis region moves 4.7 degrees of longitude east and 1.1 south per degree of Nino 3.4 (r 0.73 and -0.59 over 1991-2021) and ACE follows (slope of ln(ACE + 10) 0.33, La Nina over El Nino 0.50); the page's humidity falls and its shear rises with El Nino all over the basin, so even the corrected fields give a sliver of that (+1.3 degrees a degree and an ACE slope of +0.06 in 72 seasons of the Atlantic's law on the fitted maps).
  `par.enso = {act, lon, lat}` (`src/storms.js`; all zero by default, which is the engine without it, bit for bit) is the part of the response the fields do not carry: every development rate is multiplied by `exp(act * index)` and the places of the maps' development rate, and of the seeds, are moved `(lat, lon)` degrees per degree of the index (the host gives it as `env.enso()`, the page's own Nino 3.4; a seed the move would take out of the box is put just inside it). The tools take the real slopes of every basin from the record (`tools/make_tc_basin.py`: per degree of the index, ln(named + 1), ln(depressions + 1), the season's mean genesis longitude and latitude, in `<basin>-tc-ref.json` `enso`),
  `tools/storm_basin.mjs` reports the simulated ones, and the calibration (`tools/storm_basin_opt.mjs`, now 18 free parameters, 36 generations) fits `act`, `lon` and `lat` against them together with the spread between seasons (the random season factor `act.seasSd`, a multiple of the Atlantic's coupling of the development rates to the page's humidity, shear and sea) against the SD of the named count, the hurricanes and the ACE. `tools/rollout_basin.sh <basin> env` is the first step of the chain.
  *Tests:* 209 node checks (31 new: the pages' gains and joint-lag data, the El Nino part of the engine at zero bit for bit, its activity, its move of the development region, of a tracked low's, the box edge, the three sea thresholds of a subtropical disturbance, and the table, the menu ids, seasons and the year of a southern season, the name lists and schemes, the southern season's turn on Jul 1 and a northern one's on Jan 1, a checkpoint keeping basin / season / name cursor, waves in the Atlantic only, the activity draw per season year, the mirror-image drift, the fitted physics of a basin applied, and, at the end of the rollout, that all nine pages carry their maps, normals and daily ACE and that every basin but the Atlantic has a law of its own) and 1776 browser checks (a generic one on every page that the storm controls follow the data, eight on every page that the drawn and the storms' humidity and shear carry the month's gains: the ratio of the El Nino and of the year-to-year parts on the strongest-gain and the weakest-gain day is the ratio of the gains, one on every page that the storm environment and the Place preview carry the Nino 3.4 index the page shows, and the storm layer's checks on every page but the Atlantic's own); 30 new mutants (Z17-Z25: the gate, the waves flag and generator,
  the activity year, the southern drift, the southern season start, the sequential name cursor, the Central Pacific list, the basin's fitted physics; Z26-Z34: each of the four gains in the drawn field and in the storm grid, and their interpolation; Z35-Z38: the engine's El Nino activity, its move of the development region, of the seeds and of a tracked low's; Z39-Z40: the index the live and the shadow environment hand the engine; Z41-Z43: the three sea thresholds of a subtropical disturbance; Z44-Z46: the gate on a page that has a climatology, on one that has none and the visitor's switch), all caught, with Y16 and Y17: 119 in all (a new driver, `env`, runs the gain check on the West Pacific page). `ONLY='Atlantic,East Pacific' node tests/run.mjs` runs a few pages (a working aid).
  *The East Pacific (the pilot, switched on).* The chain on the page's own weather, each step a command of `tools/rollout_basin.sh`: the page's mean steering and environment by month (`clim`, 8 seasons); the development rates and the supply of local seeds (the page has no wave train, so every disturbance is a local seed or a tracked low): one pass to see where disturbances
  go, `wet` to drop the nodes they never reach, three IPF passes on 24 seasons, `rescale`; then 13 rounds of 72-96 seasons, each `refine` (the real map of first fixes, smoothed 1.5 nodes and later 1.0, against the simulated one, node by node and by region) and `motion` (the real mean drift less the anomaly the page's weather adds where storms are: -1.0 / +0.2 kt for weak storms, -1.0 / -0.3 for strong ones); and a CMA-ES
  calibration of the intensity law (`tools/storm_basin_opt.mjs`: 13 free parameters, two runs of 14 and 18 generations of 12 candidates, each on the same 24 seasons, the loss the standardised misses of the counts, ACE, the hurricane / major / category-5 shares, the mean peak, rapid intensification, lifetime, the extratropical share, where storms form, the El Nino slope and, added after the first run, the latitude of the
  hurricane-strength rows). What it found (`BASIN_PARAMS.eastpacific`): the Atlantic's law with a warmer, stricter sea-temperature gate for growth (it opens at 24.5 degC relative to the main development region's mean and 27 absolute), a quicker loss of wind (0.26 a day-fraction against 0.075), shear counted for more (the page's shear divided by 1.8, not 4), half the Atlantic's growth rate (0.022), the growth gate's latitude edge at 6.2-13.2 degrees
  (the first fit let hurricanes form at 5-10N, where the real record has 1 % of its hurricane-strength rows and the model had 10 %) and a genesis gate that starts at 6.9 degrees (the real depressions' 2nd percentile is 8.4). *Before and after on the same weather:* with the Atlantic's law unchanged and the maps fitted (72 seasons, counts converged), the East Pacific had 19.7 depressions / 17.4 named / 12.3 hurricanes / 8.4 majors / 1.4 category 5 / ACE 251 (twice the real), a mean peak of 89 kt (75) and named storms that lived 5.7 days (4.2): the Atlantic's physics is too strong over
  the East Pacific's water, which is what the calibration took out; the fitted law, 96 held-out seasons (seeds 1201-1296): **20.8 depressions, 16.1 named storms, 9.1 hurricanes, 4.7 majors, 0.31 category 5, ACE 133 (SD 82)** against the real 19.6 / 16.6 / 8.8 / 4.6 / 0.53 / 132 (SD 73); hurricane share of the named 0.56 (0.53), major share 0.28 (0.28), mean peak 74 kt (75), rapid intensification 6.0 % of the 24-hour windows (7.6 %),
  mean life of a named storm 4.4 days (4.2), extratropical 4 % (2 %), the 64-kt rows' latitude q1 / 5 / 25 / 50 / 75 of 9 / 10 / 13 / 16 / 19 (10 / 12 / 15 / 17 / 19), the genesis longitude q5 / 25 / 50 / 75 / 95 of -148 / -118 / -110 / -104 / -96 (-155 / -117 / -109 / -103 / -96). The El Nino response, which no step fitted, came out as the record's: ACE 167 / 130 / 107 in the El Nino / neutral / La Nina seasons (real 179 / 120 / 100), La Nina over
  El Nino 0.64 (0.56), the slope of ln(ACE + 10) on the Nino 3.4 of Aug-Oct 0.21 (0.27). Tracks (`named-storm six-hourly rows per 5-degree cell`): 294 a season (real 289), the correlation of the two maps 0.957, the centre of mass (16.4N, 122.4W) against (16.9N, 122.1W). Known misses: category 5 storms are 0.31 a season against 0.53, rapid intensification 6.0 against 7.6 %, the
  months of May and June are a little short and the season's end a little long, and 85 % of the depressions are named storms in the real record against 77 % here. The lab chain, with its runs, takes about an hour a basin (the optimiser 15-20 minutes, a season of 365 days 4-5 seconds on four pages).
  *The West Pacific (switched on).* The same chain on the corrected environment: `clim` and `rates` (the page's weather, the development rates and the supply of local seeds), three rounds, then the calibration with 18 free parameters (36 generations of 12 candidates on 24 seasons, after which the best six candidates and the last five means of the search are scored again on 72 fresh seasons: the winner's loss was 26.9 there against 53.4 on the seasons it was found on, which is why the re-scoring is a step now), `BASIN_PARAMS.westpacific`, and nine rounds in all (the counts settle after the sixth: 39.7, 34.0 and then 30.6 and 29.8 depressions).
  What it found: the Atlantic's law with a warmer, stricter sea gate for growth (opens at 25.6 degC relative to the main development region's mean), the humidity gate at 53.8-63.9, shear counted for more (the page's shear divided by 3.8), potential wind 10 % above the Atlantic's envelope (the warm pool), the growth gate's latitude edge from 2 degrees and the genesis gate 3.4-7.9 degrees (the real depressions' 2nd percentile is 5.4), rapid intensification 0.024 against 0.038, a development rate that follows the page's humidity, shear and sea three times as strongly as the Atlantic's and no random season factor (`seasSd` 0: the corrected fields carry the spread), and the El Nino term `act 0.54, lon 5.3, lat -2.1` (rates up 72 % a degree, the genesis region 5.3 degrees east and 2.1 south).
  *Before and after on the same weather:* with the Atlantic's law and the maps fitted (72 seasons) the page had 32.7 depressions, 28.4 named, 20.3 typhoons, 13.2 majors and ACE 392 (the Atlantic's law is too strong over this water too), the seasons' SD of the named count was 9.1 and the El Nino slope +0.06; the fitted law, 96 held-out seasons (seeds 901-996): **29.7 depressions, 23.6 named storms, 15.2 typhoons, 9.5 majors, 2.17 category 5, ACE 279 (SD 132, range 41-770)** against the real 29.7 / 25.1 / 15.7 / 9.1 / 2.87 / 289 (SD 106, range 108-479); typhoon share of the named 0.64 (0.62), major share 0.39 (0.36), mean peak 84 kt (84), rapid intensification 7.6 % of the 24-hour windows (8.4),
  mean life of a named storm 5.2 days (5.0), the 64-kt rows' latitude q1 / 5 / 25 / 50 / 75 of 7 / 10 / 15 / 20 / 25 (8 / 11 / 16 / 20 / 25), the genesis longitude q5 / 25 / 50 / 75 / 95 of 112 / 125 / 135 / 148 / 163 (112 / 125 / 135 / 148 / 163). The El Nino response, which the fields and the engine's term give together and no step fitted to these groups: ACE 378 / 286 / 197 in the El Nino / neutral / La Nina seasons (real 386 / 291 / 193), La Nina over El Nino 0.52 (0.50), the slope of ln(ACE + 10) on the Nino 3.4 of Aug-Oct 0.30 (0.33),
  genesis 4.4 degrees of longitude east and 1.0 south a degree (4.7 and 1.1). Tracks (named-storm six-hourly rows per 5-degree cell): 504 a season (real 519), the correlation of the two maps 0.965, the centre of mass (19.8N, 132.1E) against (20.7N, 133.6E). Known misses: the spread between seasons is a third too large (SD of the named count 6.7 against 4.6, of ACE 132 against 106, the largest season 770 against 479), 35 % of the named storms become post-tropical (23 %), 79 % of the depressions become named (85 %), category 5 storms are 2.2 a season (2.9),
  and the season is too sharply peaked in ACE (July to September 67 % against 53 %, November and December 6 % against 14 %).
  *The North Indian Ocean (switched on).* The same chain, nine rounds, and the calibration run twice: the first, with the share of depressions that become storms left to the Atlantic's declaration margin, left 71 % of them named against the real 97 % (the best track starts a North Indian system when it is nearly a storm), so `tdMargin` became a free parameter (a depression is declared only where its growth gate exceeds the critical one by that much) and the second run got 85 %. What it found (`BASIN_PARAMS.nio`): potential wind 5 % above the Atlantic's, a sea gate from 22 degC and a humidity gate of 42-52 (the page's North Indian Ocean is dry), shear counted for more (the page's divided by 3.5),
  a quick loss of wind (0.5 against 0.075, the end of the search range), growth from 2.6 degrees, a declaration margin of 0.45 (the Atlantic's 0.12), almost no coupling of the development rates to the page's humidity and shear anomalies (0.15 times the Atlantic's: the monsoon decides, not the local anomaly) and an El Nino term (`act` 0.58, `lon` -4.4, `lat` -1.5) that offsets what the page's fields do, because the record has no response (slope -0.03, r -0.09). 96 held-out seasons (seeds 901-996): **5.2 depressions, 4.4 named storms, 2.3 cyclones, 1.1 majors, 0.21 category 5, ACE 28 (SD 23, range 0-108)**
  against the real 5.4 / 5.2 / 2.0 / 1.0 / 0.20 / 22.9 (SD 16, range 4-84); mean peak 72 kt (64), mean life 3.3 days (2.9), the 64-kt rows' latitude q1 / 5 / 25 / 50 / 75 of 7 / 9 / 13 / 16 / 19 (6 / 11 / 14 / 16 / 19), the genesis longitude q5 / 25 / 50 / 75 / 95 of 60 / 70 / 85 / 89 / 94 (59 / 69 / 85 / 88 / 92); the two seasons are there (named storms a year, May 0.73 against 0.80, June 0.34 / 0.60, October 0.81 / 1.03, November 0.90 / 1.30, December 0.53 / 0.63).
  Tracks: 61 six-hourly named-storm rows a season (real 64), map correlation 0.954, centre (15.0N, 77.7E) against (14.6N, 76.3E). El Nino: ACE 30 / 32 / 22 in the El Nino / neutral / La Nina seasons (real 26 / 18 / 23); the slope of ln(ACE + 10) is +0.11 (-0.03), the genesis longitude -1.0 degree a degree (-1.05). Known misses: 85 % of the depressions become named storms (97 %), the cyclone share of the named is 0.52 (0.39) and the post-tropical share 10 % (1 %), and the monsoon months of June and November are a little short.
  *Also in this step.* Hovering the live head of a storm now picks the head and not the advisory dot under it (the West Pacific's test found the dot: the last advisory fix is where the storm is, to a fraction of a pixel); the engine takes the sea a subtropical disturbance needs from parameters (`subSstOK`, `subCold`, `seedCold`: to be declared a depression, to go on developing, and for one that has not begun to develop to survive; the Atlantic's 19 / 17 / 22 degC are the defaults, the Mediterranean will lower them); the calibration fits `tdMargin` (the share of depressions that become storms) and, for a basin of subtropical storms (`--sub`), the subtropical class's own law,
  and `--rescore` scores the best candidates of a run again on fresh seasons (the first candidate of a 24-season search is partly lucky: the West Pacific's chosen one lost 53 there and 27 on 72 new seasons, the North Indian's 54 and 32).
  *The three southern basins (switched on).* The same chain (`clim`, `rates`, three rounds, the calibration, the patch, six more rounds, 96 held-out seasons) with two lessons that came out of the Southern Hemisphere and changed the tools. *First:* the search ran its candidates without the genesis latitude gate that `--gate` writes afterwards from where the basin's depressions really form (the Atlantic's 8.5-11.5 degrees stayed in the candidates), so it tuned an intensity law for storms that only form poleward of 10 degrees, and the law that shipped, with storms forming at 3-8 degrees as the record says, was a stronger one: the South-West Indian's first 96-season check had ACE 197 against 102 although the search's best had 116 on its own seasons. `tools/storm_basin_opt.mjs` now puts the gate in every candidate (`gateLat`, the numbers of the patch tool). *Second:* the rounds of `refine` do not bring the number of depressions to the real one in a basin with no wave train. After six rounds the South-West Indian had 15.9 depressions against 11.6 and the Australian region 16.4 against 12.7: the events follow where the seeds are born and where they drift before they develop, a factor on a rate that has met its ceiling does nothing, and the rounds chase each other (the south of the basin over, the north under, every round). What closes it is one factor on the supply of local seeds (`maps.spawn`; with no waves the events follow it linearly: 0.78 on the South-West Indian gave 12.4 depressions where 12.4 were predicted). It is 0.80 for the South-West Indian, 0.88 for the Australian region and none for the South Pacific, whose rounds converged, and the final checks below are with it.
  *The Australian region (switched on).* The calibration had to be run twice: the first (24 seasons, `envScale` up to 6, the El Nino shift of the genesis region up to 14 degrees) put several parameters on their bounds, its rounds diverged (24 depressions) and its 96-season check had 21.9 depressions, ACE 171 and a La Nina / El Nino ratio of 2.9, so the bounds went to 3 and to 10 degrees (4 for the latitude) and the search ran on 48 seasons (36 generations of 12 candidates, the best six and the last five means scored again on 72 fresh ones). What it found (`BASIN_PARAMS.aus`): potential wind 6 % below the Atlantic's, growth at the Atlantic's rate and wind lost 6.7 times faster (0.50, 0.075), a sea gate from 20.9 degC and a humidity gate of 45-55, shear divided by 3.9, the cool-water efficiency of the potential wind from 20.5 degC, growth from 8.4 degrees of latitude and the genesis gate 4.2-8.9, rapid intensification 1.7 times as often, a declaration margin of 0.17, the coupling of the development rates to the page's anomalies 0.85 times the Atlantic's and an El Nino term of `act` +0.12, `lon` -4.1, `lat` +0.67. 96 held-out seasons (seeds 901-996): **14.2 depressions, 10.9 named storms, 5.8 cyclones, 2.9 majors, 0.10 category 5, ACE 86 (SD 52, range 6-320)**
  against the real 12.7 / 11.7 / 5.7 / 2.9 / 0.40 / 75 (SD 30, range 21-147); the SD of the named count 3.7 (3.6), mean peak 71 kt (71), mean life 4.2 days (3.8), rapid intensification in 7.0 % of the 24-hour windows (7.8), the extratropical share of the named 11 % (8), the 64-kt rows' latitude q1 / 5 / 25 / 50 / 75 of 10 / 12 / 15 / 17 / 21 (10 / 12 / 14 / 16 / 19), the genesis longitude q5 / 25 / 50 / 75 / 95 of 94 / 110 / 138 / 162 / 172 (93 / 113 / 134 / 159 / 172); named storms a month from January to December 2.49 / 1.77 / 2.17 / 1.36 / 0.30 / 0.18 / 0.04 / 0.04 / 0.01 / 0.41 / 0.65 / 1.52 (2.43 / 2.27 / 2.47 / 1.60 / 0.33 / 0.10 / 0.03 / 0.03 / 0.03 / 0.23 / 0.60 / 1.60). Tracks: the correlation of the 5-degree maps of named-storm rows 0.889, centre of mass (18.3S, 138.5E) against (16.5S, 134.6E). El Nino: ACE 77 / 99 / 81 in the El Nino / neutral / La Nina seasons (real 75 / 72 / 77), the slope of ln(ACE + 10) -0.07 (-0.03), of ln(named + 1) -0.114 (-0.12), but the genesis longitude +1.0 degree a degree where the record has +3.4. Known misses: ACE 15 % high with a spread between seasons of 1.7 times the real, a quarter of the depressions never named (the real 8 %), category 5 at a quarter of the real rate, and the tracks' centre two degrees south and four east.
  *The South-West Indian Ocean (switched on).* Calibrated twice (see above): the first search, without the genesis gate in its candidates, then a second, narrower one from its best values on the final maps (11 of the parameters free, 18 generations of 12 candidates on 48 seasons, the best six and the last four means scored again on 72 fresh ones). `BASIN_PARAMS.swio`: potential wind 15 % below the Atlantic's, growth 14 % faster and wind lost 2.7 times faster (0.20, 0.075), a sea gate from 25.3 degC, a humidity gate of 45-55.5, shear divided by 3.5, the cool-water efficiency from 8 degC (the Atlantic's 18), growth from 2.7 degrees and the genesis gate 3.1-7.3, rapid intensification at 0.42 times the Atlantic's rate, a declaration margin of 0.21, almost no coupling to the page's anomalies (0.35 times the Atlantic's, a season factor of 0.06) and an El Nino term of `act` -0.08, `lon` -2.0, `lat` -0.1. 96 held-out seasons (seeds 901-996, local-seed supply times 0.80): **13.1 depressions, 11.3 named storms, 7.2 cyclones, 3.5 majors, 0.06 category 5, ACE 131 (SD 82, range 17-351)**
  against the real 11.6 / 11.4 / 6.4 / 3.6 / 0.47 / 102 (SD 42, range 23-186); mean peak 77 kt (76), mean life 5.7 days (4.9), the extratropical share 17 % (14), the genesis longitude q5 / 25 / 50 / 75 / 95 of 42 / 64 / 79 / 91 / 101 (42 / 60 / 72 / 87 / 99), named storms a month from January 2.50 / 1.95 / 1.64 / 1.03 / 0.27 / 0.17 / 0.13 / 0.24 / 0.26 / 0.56 / 1.13 / 1.47 (2.27 / 2.23 / 1.80 / 1.20 / 0.30 / 0.07 / 0.17 / 0.07 / 0.27 / 0.47 / 1.10 / 1.47). Tracks: correlation 0.836, centre (15.6S, 71.8E) against (17.0S, 68.4E). Known misses: ACE 28 % high with twice the real spread between seasons, category 5 at an eighth of the real rate (the potential wind scale of 0.85 that fits the rest cannot reach 137 kt), the strong storms' rows too near the equator (the 64-kt rows' latitude q5 of 8 against 11, q25 11 against 15), the La Nina / El Nino ACE ratio 0.58 against 0.91 (the page's humidity and shear give the Indian Ocean more of a response than the record has: ACE 158 / 147 / 93 in El Nino / neutral / La Nina seasons, real 103 / 114 / 94) and January a tenth over and February and March a tenth under.
  *The South Pacific (switched on).* The search (36 generations of 12 candidates on 48 seasons, then the best six and last five means on 72 fresh ones) and six rounds; no supply trim, the rounds converged. `BASIN_PARAMS.spac`: potential wind 3 % above the Atlantic's, growth 1.9 times as fast and wind lost 3.9 times as fast (0.29), a sea gate from 25.7 degC, a humidity gate of 38-48 (the page's South Pacific is dry), shear divided by 1.4 (the end of the search range: the page's shear counts nearly three times as much as the Atlantic's), the cool-water efficiency from 7.5 degC, a latitude loss of 0.79, growth from 6.1 degrees and the genesis gate 6-9.5, rapid intensification at 0.43 times the Atlantic's rate, a declaration margin of 0.05, the largest random season factor of any basin (0.32, the end of its range 0.35), the coupling to the page's anomalies 1.2 times the Atlantic's and an El Nino term of `act` +0.08, `lon` +0.7, `lat` -0.8. 96 held-out seasons (seeds 901-996): **6.4 depressions, 5.5 named storms, 3.6 cyclones, 1.7 majors, 0.15 category 5, ACE 50 (SD 35, range 0-156)**
  against the real 6.4 / 6.2 / 3.4 / 1.7 / 0.37 / 46 (SD 34, range 2-129); the SD of the named count 2.8 (3.1), mean peak 78 kt (75), mean life 4.6 days (3.7), rapid intensification in 8.8 % of the windows (9.9) and in 81 % of the cyclones (77), the extratropical share 22 % (22), the 64-kt rows' latitude q1 / 5 / 25 / 50 / 75 of 10 / 12 / 15 / 18 / 21 (the same five numbers), the genesis longitude q5 / 25 / 50 / 75 / 95 of 163 / 170 / 178 / 189 / 207 (163 / 170 / 181 / 190 / 208), named storms a month from January 1.33 / 1.07 / 1.21 / 0.46 / 0.09 / 0.06 / 0.02 / 0.03 / 0.03 / 0.20 / 0.35 / 0.68 (1.50 / 1.50 / 1.13 / 0.57 / 0.13 / 0.10 / 0.00 / 0.03 / 0.00 / 0.17 / 0.27 / 0.77). Tracks: correlation 0.952, centre (19.0S, 184.1E) against (18.7S, 181.6E). El Nino: ACE 60 / 50 / 44 in the El Nino / neutral / La Nina seasons (real 67 / 40 / 31), the slope of ln(ACE + 10) +0.14 (+0.28), of ln(named + 1) +0.171 (+0.172), the genesis longitude +2.0 degrees a degree (+1.0) and latitude +0.2 (+1.5). Known misses: two fifths of the real rate of category 5, storms that live a day longer than the real ones (4.6 against 3.7) and a share of the named that become cyclones of 0.64 (0.55), and an El Nino that moves the genesis region east more and south less than the record.
  *The South Atlantic and the Mediterranean (switched on, from the literature).* Neither has a record the best-track tables can calibrate on (three South Atlantic tracks in 1991-2020, no Mediterranean one), so their targets are written down: `tools/tc_synthetic.json` holds, with its sources named, the normals of a season (depressions, named storms, hurricane-strength, ACE and its spread), the shape of the season, where the cyclones form (Gaussian blobs), how strong they get and how long they last, and `tools/make_tc_synthetic.py` turns it into the same `<basin>-tc-ref.json` and `<basin>-tc-maps.json` the fit tools read. *South Atlantic:* about one named system a year, mostly subtropical, 35-55 kt (the Brazilian Navy's names since 2011), the season October to May and the place 20-35S off south-east Brazil, Catarina (2004) the only hurricane. *Mediterranean:* about one named medicane a year, the season September to January, the western basin, the Ionian and the Aegean in 40 / 35 / 25 %, Ianos (2020) and Daniel (2023) the strong ones. The depressions that never reach 34 kt are recorded for neither, so their number is a fifth more than the named (1.15 a year; the first draft had 1.6 and 1.9, the engine could not make a depression fail to become a storm that often, and the search drove itself to a basin with no storms). The sea a subtropical disturbance needs was set by hand before the fit, as the page's Mediterranean is 14-16 degC from December to February: South Atlantic `subSstOK` 18, `subCold` 16, `seedCold` 20, the hazard gate 19.5-22.5 and the growth gate 21-24 degC; Mediterranean 13.5 / 11.5 / 11.5, 13.5-17.5 and 14.5-18.5 degC with a humidity gate of 24-45, and the cool-water efficiency of the potential wind from 8 degC (the search moved it to 10). The search (30 generations of 12 candidates on 48 seasons, 16 free parameters: the Atlantic's law and the subtropical class's own wind cap, growth rate, critical gate and shear scale; the best six candidates and the last four means scored again on 72 fresh seasons) sat on an end of its range for the South Atlantic's potential wind scale (0.70), wind cap (110 kt) and critical gate (0.6) and for eight of the Mediterranean's (potential wind 1.12, growth 0.07, shear divided by 6.5, declaration margin 0.68 of 0.7, season factor 0.35, coupling 3 times the Atlantic's, the subtropical growth rate 0.06 and critical gate 0.05): in water this cold and with this much shear the engine has to be pushed to make a storm at all, and these values are what that costs, not measurements. The local-seed supply is times 0.85 for the South Atlantic.
  96 held-out seasons (seeds 901-996). **South Atlantic: 1.0 depressions, 0.9 named storms, 0.00 hurricane-strength, ACE 2 (SD 3, range 0-20)** against 1.15 / 0.9 / 0.05 / 1.0 (SD 1.8, range 0-8): the SD of the named count 1.2 (1.0), 47 % of the seasons with none (the literature's one a year read as a Poisson count gives 41 %), mean peak 42 kt (47), mean life 2.4 days (2.7) with 54 % shorter than two days (40), 21 % extratropical (30), 0.8 subtropical named storms a year (0.6). **Mediterranean: 0.9 depressions, 0.9 named storms, 0.04 hurricane-strength, ACE 0.7 (range 0-6)** against 1.15 / 0.9 / 0.08 / 0.45 (SD 0.9, range 0-4): the SD of the named count 1.2 (1.0), 46 % of the seasons with none and 35 % with one, mean peak 42 kt (46), 0.85 subtropical named storms a year (0.75), 14 % extratropical (20), formed at 33 / 36 / 38 / 39 / 43 N (33 / 35 / 37 / 39 / 42) and 6 / 11 / 16 / 21 / 26 E (2 / 8 / 15 / 22 / 32), named storms a month in October and November 0.17 and 0.19 (0.16, 0.19). Known misses: a Mediterranean storm lives a day (1.0 days against 1.9 in the literature, 81 % under two days against 55), nearly every South Atlantic and Mediterranean depression becomes a named storm (96-98 %, the target 78), the South Atlantic's season peaks in November-December and not in January-March (0.22 / 0.22 against 0.11 / 0.14 in November-December, and 0.14 / 0.08 / 0.13 in January-March against 0.14 / 0.16 / 0.15), its storms form five degrees too far east (named longitude q5 / 50 / 95 of -46 / -38 / -25 against -55 / -43 / -32), the Mediterranean has too few storms from January to March and too many in July and August, and neither has an El Nino response (none was asked). If you have measurements, `tools/tc_synthetic.json` is where they go.
  *Also in the last three steps.* The tools: candidates of the calibration carry the genesis gate (`gateLat`); `storm_basin_opt.mjs` has scales of its own for a basin with fewer than two named storms a season (counts and ACE to a tenth of a storm, the depression count a target, the guessed targets of rapid intensification, extratropical share, spread and El Nino at a fifth to a third of their weight), and a search that stopped can `--resume` from the mean and step it had reached; `tools/storm_basin_scan.mjs` scans one parameter of a result on the same seasons (minutes where another search is hours: it showed that the South-West Indian's El Nino activity, scanned from -0.08 to -0.4, moves the slope of ln(ACE + 10) from +0.01 to -0.14 and nothing else); `storm_fit.mjs refine` has a regional step for the subtropical class and thresholds that scale down for a basin with a few depressions a season, and doubles the subtropical rate where the record has depressions and the lab has none (as the tropical class does); the lab's page loads wait up to fifteen minutes (a search shares the machine with five others). The tests: no real page lacks a storm climatology any more, so the browser tests make one (`checkStormGateOff`: the Atlantic's page with its `STORMS_READY` forced off must come up with the engine off, every storm control hidden, the Menu button there, no way for a visitor to switch the engine on and no error); the three-season check of a page has a variant for a basin with a named storm in half its seasons (a season with none is allowed and the hurricane count has an upper bound only); three more mutants (Z44-Z46: a page with a climatology comes up without the engine, a page without one shows the controls, a visitor can switch the engine on) are caught by that page, besides Z17, which now fails because the line it edits is the line the test copies. Node checks that all nine pages carry their maps, normals and daily ACE and that every basin but the Atlantic has a law of its own.
  *Next in this milestone:* nothing: all nine pages are switched on. *Checks of the last three steps together:* 209 node checks and 1776 browser checks pass and all 119 mutants are caught. *CI and Pages:* the pushes of the milestone's steps (a19784a, 64fb1aa and, for the last five pages, 68f7116) each passed `Build & test`; the last one (run 39257226312) took 16 min 37 s for the build and the whole suite and 26 s for the Pages deploy, so all nine pages are live.
- **Storms, milestone 9: no walls (lakes and every other water are water, every limit is a ramp, a hazard or a soft cap), and the clock at 4x to 64x with `Place` (after the next round of trying it).**
  *What you found:* placing at any speed above 1x was laggier and laggier; a tropical cyclone could not be placed on the Great Lakes (hurricane-threshold water, perfect conditions all round) and strengthen there, and "there should be NO hard caps on anything, just soft caps".
  *The lag, again.* Where the time went (the page profiled headless, one simulated day with no storm alive, same machine for both builds): 43.4-44.2 ms, of which the steering waves 12, the storm grid's SST / humidity / shear 12-17, the up-sampling of the
  map's fine synoptic texture 7 (which only the display needs), the features 2.8 and the engine 2.5, plus the display's own refresh, which cost as much again at 16x. What changed: (1) the engine's grid is one degree (a sixteenth of the map's cells, it was a
  quarter), up-sampled from the coarse anomalies by a strided bicubic; (2) the map's fine texture is built only when the map is drawn (the storm nodes take it from the coarse pair, to the same values); (3) the steering is a keyframe every six hours, not three, and
  the hours between are carried forward linearly in time from the last two keyframes, a pure function of the seed, so the storms are still the same however the clock is chunked (a save made on a keyframe hour carries the previous keyframe too, 36 KB, so a resume is
  still bit for bit); (4) the storm grid has its own jet arrays and a `Place` press no longer recomputes the map (a shadow environment older than a day is rebuilt at the press); (5) the display refresh is held to 2.5 / 4 / 6 times its own cost at 2x or less / 8x /
  faster. Measured (headless Chromium, software rendering, 5 s of play, old build against new on this machine): a simulated day 43.4-44.2 -> 17.0 / 20.6 ms; 4x 20 -> 34 frames a second; 16x 17 -> 31 (200 -> 243 simulated hours a second); 64x 190 -> 412 hours a second;
  pressing `Place` 465 -> 194 ms; a `Place` session at 16x (frames a second while the preview is drawn, three runs) 14 / 11 / 10 -> 36 / 19 / 35. The weather is the same weather (the fingerprints of the fields match the old build); the storms are not the same storms (a different
  grid and steering clock), and the three blocks of held-out seasons moved by noise: ACE 110 -> 124 for the first 48 seeds, 144 -> 143 for the next 96.
  *Lakes are water.* The Great Lakes, Nicaragua, Maracaibo and the 630-odd other lakes of the map were land to the storms (they are drawn as lakes, with their own temperatures, on top of a land mask): a depression put on Lake Michigan was over land at once. The 638
  lake polygons are rastered onto the map's fine grid (`lakeGrid`), `stormLand` is the land mask minus the lakes, and a lake's temperature is the page's own lake formula, evaluated on the storm grid's anomalies at each keyframe (the same number the map draws, to
  0.02 degC: a browser check compares them). Hudson Bay, the Gulf of St Lawrence, the Mediterranean, the Black Sea and the Baltic were already water in the Atlantic page.
  *Walls.* Every limit the engine had was either a wall (a threshold that switches a rule on or off) or a hard clamp, and is now a ramp, a hazard or a soft cap (`satur(x, cap)`: x for x well under the cap, bending over toward it, never reaching it). The audit, with what each became:
  (1) the fall of the potential wind with latitude (`vpLat`, the stand-in for what the page's fields do not carry poleward) is relieved by up to 90 % in a *perfect tropical environment* (`perf`: warm water on a ramp 25.5-27.5 degC, shear half-way at 2.2 kt of storm-centred shear,
  humidity 52-64 %), so a depression over 27.5 degC water, in no shear and moist air, at the latitude of Lake Michigan, becomes a hurricane in 37 of 40 seeds (mean peak 91 kt, post-tropical within a day in none, still tropical after a week in 36; the old engine: 10 of 40, 55 kt, 4 and 6; over 29 degC water 28 of 40 with a mean peak of 66 kt against 37 of 40 and 119 kt);
  at the hurricane threshold (26.5 degC) 13 of 40 do (0 of 40); over 22 degC water in 25 kt of shear none gets near it, and the mean peak of a week at 43.5N rises smoothly with the sea temperature (no step above 17 kt in half a degree, 35 kt at 22 degC, 134 kt at 30);
  (2) the post-tropical hazard was zero south of 20N and a wall there: it is a ramp from 12N, and `perf` takes 85 % of its latitude term away; (3) the sea-temperature gate of the growth law and of genesis was relative to the main development region's mean (so a warmed world shut every
  water that is not as warm as the tropics): it is now the more permissive of the relative gate and the absolute one (the same ramp 1.3 degC warmer; up to +2 degC of warming nothing changes); (4) a rapid-intensification episode ended when the wind passed 93 % of the potential wind or
  a quarter of the neighbourhood was land, and could only start with no land at all: its push now tapers with the room left (ramp 2-10 % below the potential wind) and with the share of land (ramp 10-40 %); (5) the fastest loss of wind was a clamp (`decayCap`): a soft limit now;
  (6) development of a disturbance needed less than 30 % land and 4 degrees from the equator, a depression needed less than half land, 6 degrees and water over 24 degC (19 for a subtropical one), the first contact with land cut the wind by a tenth at one half land, a weak circulation was
  finished at 8 kt (18 over land), a subtropical storm became tropical on four hard conditions, dissipation over water applied below 30 % land: all ramps and hazards now, centred on the old thresholds so the totals stay; (7) a wave or seed that was not developing died the moment the water was under 22 degC (17 for a subtropical one),
  it was older than 21 days or poleward of 32N (42N for a local seed): a hazard with a mean life of 4 hours, its ramp centred on the old line (a first try with ramps starting at the line gave 0.8 more depressions a season, the centred one none: 16.5 -> 16.5); (8) a tracked low counted only between
  18 and 45N: a ramp from 14 to 18N and from 45 to 50N; (9) a development rate map is zero where the real Atlantic never formed a storm: the rate has a floor (`hazFloor`, 2e-6 an hour before E, odds of one in a few thousand per disturbance-week in a perfect environment) and there is a supply of
  disturbances over the whole box (`seedFloor`, 3 a year, uniform over the water, ids `F<k>` so no other system's id moves); (10) the subtropical wind cap (62 kt) is a soft minimum, the lifetimes of post-tropical systems and remnant lows are soft at the long end, the extra deepening of a post-tropical cyclone saturates toward 40 hPa and the
  cap on a development rate is soft. What is still a wall, on purpose: the edge of the simulated box and of the ocean mask (a system that leaves them ends), the numerical guards (a wind of at least 1 kt, a floor under cos(lat)), the definitions (the Saffir-Simpson thresholds, the 34-kt naming wind) and the ranges of the
  sliders (the model itself has no limit beyond them: a warming of 4 degC lifts the potential wind exponentially). 16 mutants (Z1-Z16) cover the new rules and 5 whose anchors moved (P2, X3, Y14, Y21, Y22) were rewritten; 89 in all. An isolated pass of all of them (each in a worktree of its own) left one alive, Y16, which milestone 10 kills.
  *What the Atlantic does with it.* 240 held-out seasons (seeds 1401-1448, 1501-1596, 1601-1696, the 214 days from Jun 1, ship set): 16.7 depressions, 14.0 named storms, 7.9 hurricanes, 3.8 majors, 0.37 category 5 and ACE 137 (A 129, B 147, C 132) against the real 15.8 / 13.9 / 7.2 / 3.2 / 0.47 / 122
  (milestone 8: 17.0 / 14.1 / 7.7 / 3.6 / 0.25 / 131). The softening alone (the relief switched off) is neutral: 16.5 / 13.4 / 7.3 / 3.4 / 125 on the first block against 16.5 / 13.4 / 6.7 / 3.1 / 110 before and 16.6 / 13.6 / 7.3 / 3.4 / 124 with the new grid and the old rules; the relief
  adds 0.3 majors and 3-4 % ACE, mostly category 5 storms (0.15 -> 0.31 on the first block, 0.46 on the second) and the share of tropical rows of 96 kt or more at 25-30 / 30-35 / 35-40N goes from 0.09 / 0.01 / 0.00 to 0.10 / 0.02 / 0.01 (real 0.10 / 0.04 / 0.01). Rapid intensification on the second block: 24-hour gains of
  30 / 50 / 65 / 80 kt in 7.2 / 1.1 / 0.24 / 0.06 % of the windows (real 6.3 / 0.73 / 0.16 / 0.03). Known: the totals are 4-5 % higher than before, ACE is 12 % above the real normal (the stop rule is 20 %), and the lake itself is small: a depression put on Lake Michigan crosses it in about six
  hours at the steering of a calm August day, so it is the water *around* the Great Lakes (Hudson Bay, the Gulf of St Lawrence, the Mediterranean) where a placed storm has the time to strengthen.
  *Tests:* 178 node checks and 1585 browser checks; the new node ones (the soft cap and soft minimum, the post-tropical hazard without a wall and relieved by `perf`, the sea gate in a warmed world, the Great Lakes depression in perfect / threshold / hostile environments and the smoothness of its peak in the
  sea temperature, the lake-sized patch of water, the rapid-intensification episode that runs past 93 % of the potential wind and tapers, waves over cold water that die gradually, the weight of a tracked low by latitude, the development-rate floor and the supply of floor seeds that moves no other system's id, the loss limit, the land weight
  of dissipation, the doors that close on a depression over land, at the equator and over cold water, the finished circulation) and the browser one (lakes are water and take the page's temperature, Kansas is land, Hudson Bay and the Mediterranean are water, a depression on Lake Michigan on a calm day is still tropical six hours later).
  *CI and Pages:* the push of 71ca25c: Build & test passed (its end-to-end step took 15 min 18 s) and the Pages deploy job passed (Actions run 39167042676).
- **Storms, milestone 8: the precursors as one lifecycle, rapid intensification that follows the conditions, advisory dots every three hours, and a lighter engine at 4x to 16x (after the next round of trying it).**
  *What you found:* a wave could not become a disturbance (a disturbance was a separate kind of thing, "it's like evolution": wave or low, then the potential to be a cyclone, then a disturbance); the
  clock lagged badly at 4x, 8x and 16x, most of all with `Place` and a placed system; rapid intensification should come when the conditions are great and be extreme (a day or so) when they are perfect, "do some
  research"; and the dots were too far apart for a peak that comes and goes quickly to show.
  *One lifecycle.* A tropical wave or a non-tropical low is a precursor with a state, not a kind: when its wind reaches 19 kt, or the growth law has begun to develop it (`dev >= 0`), it is a *disturbance*
  (`S.dist`, with a hysteresis: back to a wave or a low only under 17 kt), and a disturbance that holds its development becomes a depression. The status codes follow (`WV`, `LO`, `DB`, then `TD` and on: HURDAT2's
  own), the tracked pressure lows of the page's weather carry the same flag (from their potential), and the page draws the stage a system has reached: a dashed line (wave), a red `L` with its pressure (low), an X in a
  dashed ring (disturbance), under three boxes in `Customization` (`Tropical waves`, `Lows`, `Disturbances`, all on). Over four seasons of 214 days sampled every six hours there are on average 2.0 waves, 0.15 lows and 0.73 disturbances alive at any time, and all 137 of the 137 depressions of eight seasons (seeds 1301-1308) that began as a wave, a seed or a low passed through the disturbance stage first (the median stay in it is 18 to 51 hours depending on the season).
  *Dots every three hours.* Every fix, name, counter and peak is now three-hourly; the ACE (and the season's ACE curve) still takes only the synoptic 00 / 06 / 12 / 18Z fixes, as HURDAT2 does, so the totals did not move.
  The big dots are the synoptic ones, the small dots between them, both can be hovered (hit radius 8 and 6 px), a placed system's seven days are 56 fixes and the preview line draws the synoptic ones only. The lab's rows stay
  six-hourly (with a `land` flag), a save of a whole season is 135-540 KB (it was 125-360) and takes 2-7 ms.
  *A lighter engine.* Where the time went (the page profiled headless at 16x, one simulated day): the engine's hour-by-hour physics is nothing; a day costs the environment (the fine fields: ten up-samplings of the
  coarse anomalies, two combine passes over 601 x 449 cells), the steering waves (`evalWaves`, 8 ms a day) and the browser's own canvas commit; a `Place` press ran the whole seven-day shadow environment on the main thread
  (0.65 s at 16x). What changed: (1) the engine gets its own copy of SST, humidity and shear on every second node (0.5 degrees, 301 x 225: a quarter of the cells), computed by the same combine code from the same up-sampled
  anomalies, so its values are *exactly* the map's at those nodes (a browser check compares them, largest difference 0 in all three fields at three times and with the sliders moved, and the lookups between the nodes
  against the same weights written out by hand); (2) exact micro-optimisations (the clamp bounds of the up-sampling hoisted out of the loops, a copy instead of a recomputation when the next day's synoptic
  texture is wanted), with the same fingerprint of the weather and the storms before and after; (3) a frame loop that spends at most 12 ms of a frame on the simulation and owes the rest (never more than 24
  hours, so a slow machine runs behind instead of freezing and does not burst when it recovers), (4) redraws of the big layers that get rarer as the clock gets faster, and (5) the storm canvas redrawn 20-30 times a
  second, not 60. Measured in headless Chromium (software rendering, 5 s of play each, no profiler), old build against new:
  `speed   sim hours/s (asked)   frames/s   longest gap` -
  4x: 67 / 67 (67), 21 / 37, 150 / 150 ms; 8x: 133 / 133 (133), 14 / 35, 150 / 200 ms; 16x: 229 / 253 (267), 4 / 27, 383 / 217 ms; 32x: 256 / 363 (533), 2 / 17, 667 / 200 ms; 64x: 252 / 312 (1067), 1 / 18, 1333 / 200 ms;
  pressing `Place` at 16x blocks the page for 645 ms before and 222 ms after. A simulated day costs 70.5 ms before and 31.9 ms after in the sampling profiler. Not solved: 32x and 64x still run at about a third of
  their nominal speed (the up-sampling of the fine map fields, which the display needs, and the steering waves are what is left).
  *Rapid intensification that follows the conditions.* The research, in `tools/make_tc_ri.py` and `data/generated/atlantic-tc-ri.json` (IBTrACS 1980-2021, 10,996 24-hour windows of tropical rows over water
  south of 40N, each with the monthly ERSST at the point): a window gains 30 kt or more in 6.3 % of cases, 50 kt in 0.73 %, 65 kt in 0.16 %, 80 kt in 0.03 %; by sea temperature (under 27, 27-28, 28-29, 29 and over) the
  30-kt share is 1.2 / 5.8 / 7.1 / 12.3 % and the 50-kt share 0 / 0.54 / 0.69 / 2.1 %; by the wind at the start (under 45, 45-65, 65-95, 95 and over kt) 4.8 / 7.4 / 8.8 / 3.8 %; the strongest windows are Wilma 2005 (95 kt
  in a day from 65 kt, over 29.4 degC water at 16N 80W; three of the top six windows are hers), Felix 2007 (85), Matthew 2016 (75), Eta 2020 (70) and one storm each of 2017 and 2008 (70), all in the Caribbean over water of 28.7 degC or more but the last (27.7); the rows are the best track's six-hourly ones. The
  model (`ri` in `src/storms.js`): while a tropical cyclone over water has no episode running and the last one ended 18 hours ago, an episode starts in an hour with probability `haz x cond^hp` where `cond` is the product of
  how warm the sea is (a smooth gate, 25.5-27.8 degC), how little shear it feels, how moist the air is, whether the wind is in the range where episodes start (34-58 kt up, 135-160 kt down) and how much of the potential wind
  is still free, and an episode adds `rate x sin(pi t / duration)` kt an hour for 12 to 36 hours (and ends early at 93 % of the potential wind). *In a perfect environment* (the pinnacle index `pn`, 0 to 1: sea
  temperature rising from 27.6 to 29.6 degC, shear going to nothing (half-way at 9 kt on the page's scale), humidity rising from 52 to 64 %, and a quarter to a half of the potential wind still free) the range of the rates is wider on both ends (`xLo`, `xHi`): from 1.2-2.1 kt an hour up
  to 2.0-5.9, drawn so that the fast ones are rare (`rk`). The values are the product of nine rounds of paired-seed sweeps (48 seasons each, the same weather for every variant, `tools/storm_mc.mjs --sets`, compared with
  `tools/storm_ri.mjs`); the intensity law's `kUp` stayed at its calibrated 0.029 and the start rate `haz` was trimmed to 0.038 so the season totals stay where they were. In synthetic environments held fixed (node check, 40
  seeds each, a 50-kt storm at 18N for a week) the strongest 24-hour gain averages 1 / 37 / 43 / 51 / 65 kt from a hostile to a perfect environment, and in the perfect one it is 65 kt or more in 18 of 40 seeds and 80 kt or more in
  8 (maximum 107 kt), against 7 and 1 in a great one (29 degC, 5 kt of shear). On 240 seasons (1401-1448, 1501-1596, 1601-1696; the first block steered the choice of the values, the other 192 did not):
  the windows gaining 30 / 50 / 65 / 80 kt are 6.6 / 0.90 / 0.17 / 0.03 % (real 6.3 / 0.73 / 0.16 / 0.03), by sea temperature 0.5 / 3.5 / 6.3 / 9.6 % (real 1.2 / 5.8 / 7.1 / 12.3) for 30 kt and 0 / 0.2 / 0.6 / 1.6 %
  (0 / 0.54 / 0.69 / 2.1) for 50 kt; 68 % of hurricanes (66 %) and 95 % of majors (90 %) gain 30 kt or more in a day at least once; the six strongest gains of a storm in the 240 seasons are 105, 105, 100, 95, 85 and 85 kt (the
  real record's rate of one storm of 95 kt or more in 42 seasons would give about six in 240; we have four). Season totals (214 days) with the new values: 17.0 depressions / 14.1 named / 7.7 hurricanes / 3.6 majors / ACE 131
  (A, 48 seasons: 16.5 / 13.4 / 6.7 / 3.1 / 110; B, 96: 17.5 / 14.5 / 8.3 / 4.0 / 144; C, 96: 16.7 / 13.9 / 7.6 / 3.5 / 129; the previous build on the 96 seasons of B: 17.4 / 14.4 / 7.9 / 3.8 / 144, whose
  rapid intensification was 3 to 4 times the real one at 50 kt and above). Known misses: the episodes start earlier in a storm's life than the real record's (windows starting at 45-65 kt gain 30 kt in 14 % of cases against
  7.4 %, from 65-95 kt 5.8 % against 8.8 %, from 95 kt up 1.0 % against 3.8 %: the sea-temperature gate and the potential wind, which is fixed by the page's SST and has no ocean heat content, hold the late episodes back), the
  27-28 degC and 29 degC and up classes are 40 % and 22 % below the real share at 30 kt, and category 5 storms are 0.25 a season (0.47).
  *Tests:* 160 node checks and 1584 browser checks pass: the node ones added for the lifecycle (a disturbance is a stage, not a kind; every depression passed through it in the lifecycle seasons), the three-hourly
  record, and the ladder above; the browser ones for the three drawn stages, the dots and the hover on a small one, the storm grid, the clock at 16x for 3 s (the storms are exactly those of one call to the same hour) and on
  a processor throttled to a third. *Mutation checks:* `tools/storm_mutants.mjs` has 73 edits now (22 new ones for this milestone; the old X4, which turned a disturbance into a wave, is replaced by the pair Y1 / Y2). The first pass over the 22 and the changed X6 killed 19; the
  survivors each showed a check that did not look at what its name said: *the Disturbances box doing nothing* (no check ever unticked a box: each now hides its own stage), *the storm grid keeping the previous day's large-scale anomalies*
  (the check forced a fresh grid, which hid the missing refresh: it now also compares the keyframe the engine actually reads, at the midnights, and with the sliders moved) and *rapid intensification ignoring the shear, the sea
  temperature or the room under the potential wind* (a soft factor in a product is invisible to a check of totals: the new node check counts the episodes that start in 40 week-long runs with each factor as shipped and made blind). The
  clock's time budget and the cap on what it owes are caught only by the checks on a processor throttled to a third (Chrome's own CPU throttling, `Emulation.setCPUThrottlingRate`): on a fast machine without it neither changes anything.
  The full run then left one survivor, E6 of milestone 5 (a storm summary that rounds its ACE twice): its check only fails when a storm's ACE sits within 0.005 of a rounding boundary, which the new weather did not give;
  a node check that the archived storms keep their ACE unrounded kills it. All 73 are caught. The limit of the claim is the one of milestone 7: the edits are hand-made, and the offline lab, not CI, measures the engine
  against the real record.
  *CI and Pages:* the push (2ae0b8d) passed `Build & test` (run 39145988318: 13 min 43 s for the build and the tests) and deployed to Pages (the API's deployment status for that sha is `success`).
- **Storms, milestone 7: mutation checks of the storm work, and the end of step 1 (the core system, Atlantic).** *What step 1 is now:* every kind of system (waves, disturbances, lows, tropical and
  subtropical cyclones, extratropical and post-tropical cyclones) born by the simulator's own weather or put on the map with `Place` and a seven-day preview; names, six-hourly advisory dots, hover and
  click cards, the season bar, the season summary with the ACE graph over the real seasons and a card that opens by itself when the year turns, paths that disappear at the end of the season, and a
  season that waits behind a `Continue` card on the main menu. It was calibrated against the real 1991-2020 Atlantic and checked on seeds the calibration never saw (milestone 3's entry has the numbers and
  the known misses). Not in it, as planned: impacts, invests, the cone, wind fields, the other eight basins.
  *Mutation checks.* `tools/storm_mutants.mjs` breaks the code one edit at a time, builds the page, and runs the checks that should notice (the node tests, or `checkStorms`, `checkPlace`, `checkSummary`
  or `checkSave` of `tests/run.mjs`, cut out of it into a driver and run against the broken build; unmodified, every driver passes). It has 51 edits: the season record and the summary card (E, U),
  Place mode and its look-ahead (P), the calibrated engine and the page's layers (X), save / resume and the menu (S). The first pass over the 38 edits of milestones 4-6 killed 33; the five that lived
  each showed a check that did not look at what its name said, and the checks were changed until their edits died: *the DEP / NAMED totals of the card swapped* lived because the test season had
  2 depressions and 2 named storms (it now has four systems whose five totals are 4 / 3 / 2 / 1 / 0, so a total in the wrong box is seen); *the real bands not drawn* lived because the probe pixel sat on the
  median line, which is drawn over them (the probes are now inside the middle-50 % band, inside the 10th-90th band beyond it and above both: darker, lighter, empty); *a save of another engine
  version accepted* (and, added with it, of another grid and of an old format) lived because the test's bad save was `{v: 999}`, which every guard refuses (it is now a real save changed in one way
  each); *nothing saved as the page goes away* lived because the 1.2-s autosave covered for the missing handlers (the test now saves, changes something and leaves inside that second); and
  *the rollover not clearing the finished season's paths itself* lived because the six-hourly clean-up does it six hours later (a node check now looks at 01Z on Jan 1). A second pass over ten edits of
  milestone 3 (selecting a storm not hiding the rest, lows off by default, a local disturbance drawn as a wave, no extratropical transition, no age profile of the post-tropical speed, lows drawn over land
  and everywhere, no rapid intensification, no latitude cap on the potential wind, depressions declared that could not live, storms ignoring the anomaly of the page's steering) found five that lived:
  the calibrated values had been validated by the offline lab and never pinned by a check. They are now: a browser check that a low is drawn only over water between 18 and 45N (`stormLowsSet` /
  `stormLowsDrawn` are the hooks) and four node checks of the shipped values (a cyclone moves 0.75 of the steering anomaly; in a good synthetic environment the strongest 24-h gain of a week averages 57 kt
  and is 30 kt or more in 36 of 40 seeds, 32 kt without rapid intensification; a 100-kt hurricane over 29 degC water is at 114 kt after three days at 15N and 74 kt at 32N, 115 kt at both without the cap; a
  developing disturbance is declared a depression in 11 of 12 seeds in a good environment and in 2 of 12 in a marginal one, 11 of 12 without the margin). All 51 edits are now caught. That is the
  limit of the claim: the edits are hand-made, not exhaustive, and the statistical checks (eight seasons of 214 days, 20 placed hurricanes at 41N) still let a physics error within their bands through;
  the offline lab (96 held-out seasons, `tools/storm_mc.mjs`), not CI, is what measures the engine against the real record.
  *A bug the exercise found in milestone 6:* the page read `localStorage` once, at start-up, without a guard, so in a browser that refuses site data (cookies blocked, some private modes: every access throws) the simulator
  would not have started at all. Every other access was guarded. It is fixed (`hasSaveMeta()`), a browser check now loads the page with a storage whose every access throws and requires that it starts, runs and
  saves nothing; the unguarded read is one of the 51 edits (S17).
  *Tests:* 151 node checks and 1579 browser checks pass; the node-only tests take about 8 s.
  *CI and Pages:* the pushes of milestones 3 to 6 each passed `Build & test` (about 15 minutes, runs 58-61) and deployed to Pages (the API's deployment status for the sha of milestone 6 is `success`).
- **Save and resume: a season left in progress waits behind a Continue card on the main menu (step 1 of 7, milestone M6).** The Atlantic page keeps the season in the browser
  and the dock has a Menu button (a house, left of Restart) that goes back to `index.html`. The menu then shows a **Continue** card, beside the basin picker on a wide screen and above
  the basin grid on a phone (`Atlantic 2026 · Simulation · Sep 4 · 9 named, 4 hurricanes · ACE 65.3 · Saved just now`, a `Continue` button and `Discard this season`, which
  asks for a second click); `Continue` opens the simulator with `?resume=1`, **paused**, with a message (`Welcome back: Atlantic 2026, Sep 4, 09Z. The clock is paused; press play to go
  on.`), and `Start` (a new game) deletes the saved season, which the hint under it says before you press it (`Starting a new game replaces your saved Atlantic 2026 season.`).
  *When it is written:* at most every 8 s while the clock runs and every 1.2 s while it is paused and something has changed (a slider, a placement, a switch), and when the page is hidden or closed
  (`visibilitychange`, `pagehide`) and before the Menu link navigates; nothing is saved until the season is a day old. It is `localStorage` and written synchronously, because
  a write started while a page is closing has to land before it goes (an IndexedDB write started then was cut off: 0-2 of 8 arrived). *What is in it* (one JSON text, plus a few
  bytes of metadata next to it that let the menu offer Continue without parsing the season): the weather as the generators' states and clocks (`simCaptureLight()`: the
  principal components behind SST, humidity and shear, the day-to-day humidity and shear generators, the steering and pressure ones, ENSO, the jet history, the eddies, the random streams; the four fine daily snapshots of several MB are not
  written, they are rebuilt from the coarse states, which are stored as the exact bytes of their float32 arrays), the storms as plain JSON (`serialize()`: every fix, ACE, the
  season counters and the finished seasons) and what the controls say. *Cost:* measured on three seeds through a whole season (214 days, one of them hyperactive with 25
  depressions and ACE 294) a save is 125-362 KB (94 KB of it the weather, which does not grow) and takes 2-6 ms, so a full season never gets near a browser's 5 MB.
  *Does it come back as it was?* A season saved at 00Z continues **bit for bit** like the uninterrupted one (after four more days the storms, 62 KB of JSON, SST, humidity, shear
  and Niño 3.4 are identical). One saved at another hour (21Z in the test) resumes with identical storms, clock, fields and counters, and twelve hours later the storms are within 0.00
  degrees and 0.2 kt of the uninterrupted ones (8 systems): the engine takes fresh keyframes of the fields and the steering at the restored hour, where the uninterrupted run would be
  working from keyframes up to a day old, so from there the two are statistically the same weather rather than the same numbers. *Safety:* a simulator page opened directly (a
  bookmark, the built file) beside a saved season it did not resume leaves that season alone, says so (`A saved season is waiting in the main menu. This new one is not being
  saved: press Restart to replace the saved season, or go back to the menu and press Continue.`) and starts saving its own only after `Restart`; `?resume=1` with nothing saved
  says so and starts a new season; a save from another version of the engine or the grid is refused, said so and removed; blocked or full storage leaves the previous save in
  place without an error. *Where it lives:* in this browser only (nothing leaves the machine), one slot, so starting a new game deletes the saved season along with the finished seasons archived inside it.
  *Tests:* 16 browser checks (`checkSave` in `tests/run.mjs`, one browser context so the menu and the simulator share storage as they do in one browser): no card with nothing saved; nothing saved
  before the first day, saved by itself within seconds after three days and a change; the Menu link, and the card it leads to (name, season, counts, ACE); the card's place on a wide and
  a narrow screen; the hint under Start; Continue restores the same season, paused; the midnight and the 21Z continuations above; Start deletes the save and runs at once; a page left any other way
  saves as it goes; the page beside a saved season; `?resume=1` with nothing saved; another version's save; Discard's second click; no page error on the way; 146 + 1577 checks pass.
  *Caveat:* a resumed run continues on whatever build opens it, which is why a save carries the engine's version and the grid it was made on and is refused when either differs.
- **The season summary and the turn of the year (step 1 of 7, milestone M5).** The season bar has a `Summary` button that opens a card for the season on the bar. It
  says how far the season has got (`Season so far, to Aug 19 · counted from Jun 1`: the first season of a run counts from the day the run started), shows the six totals of the bar with the real 1991-2020 average under each (16.3 depressions, 14.4 named storms, 7.2 hurricanes, 3.2 majors, 0.5
  Category 5, ACE 122.5), a graph of the accumulated cyclone energy through the year and a table of the season's cyclones. *The graph* draws the season's cumulative ACE
  day by day from Jan 1 to Dec 31, ending in a white dot at today's value, over the real seasons: the middle 50 % and the 10th-90th percentile of the 30 seasons 1991-2020
  (the daily cumulative ACE of the IBTrACS best track, computed by `tools/make_tc_ref.py` and shipped as `storms` in `data.json` by `node tools/merge_data.mjs atlantic
  --storms data.json`, 11 KB) as two shades of one band with their median dashed, the other seasons of the run as thin lines, and a caption that says where this one stands
  (`By Aug 19 the median season had 12 ACE (10th-90th percentile 4-37)`); the axis grows to the largest of them, so a hyperactive season is never cut off. *The table* has one
  row per numbered cyclone in order of formation (its name, or `TD 7` for a depression that never became a storm; peak category and wind in mph; lowest pressure; the dates
  from depression to end, `now` while it lives; the ACE the storm itself holds), and a click on a row flies to the storm and opens its stat card while its track still exists.
  The two arrows step between the seasons of the run, `Esc` closes the stat card first and then the summary, and the card stays on screen clear of the dock at 1280, 900 and
  390 px wide (on a phone it spans the width of the screen and its table needs no sideways scroll). *At Jan 1* the finished season is archived: its dead paths disappear from the map, the bar starts the new year from zero (and the next list of
  names), a cyclone still alive on that day finishes under its formation year (its name, its counters and its ACE stay in the old season, on the old curve's Dec 31, and the old
  season is marked `Season over, a storm is still active` until it ends), and the card opens by itself on the season that has just ended. *How:* the engine gained
  `seasonRecord(year)` and `seasonYears()` (one uniform record for the current season, one still being closed by a live storm, or an archived one: counters, the daily ACE
  array, the cyclones summarised in order of formation, the day the count started), the season keeps a daily ACE array (each six-hourly fix adds to the day it falls on), and
  the page only draws it.
  *Tests:* 6 more node checks (146 in all: the record of the current season, both seasons after the turn of the year, a live storm keeping the old season open, the old curve
  empty before the storm and its overnight ACE on Dec 31, the new season empty, the season closing with the same counters once the storm is gone) and 13 more browser checks
  per run of the Atlantic (the button and the closed card, the opened card, totals equal to the bar and the real averages under them, one row per cyclone with the ACE the
  storm holds, the graph by pixel probes (white dot at the season's total, nothing after today, the band lighter than the empty plot above it, nothing before the season in
  January), the caption, a row opening its stat card, `Esc` / button / cross, the card fitting on screen clear of the dock at 1280, 900 and 390 px, the turn of the year,
  the card opening by itself, the archived curve and counters, the arrows); 146 + 1561 checks pass.
  *Caveat:* a run counts its first season from Jun 1, so it lacks the storms of January-May that the real bands include (0.9 ACE in the mean real season, 0.7 %); the
  seasons after the first start on Jan 1 and are whole.
- **Place mode: put a wave, a depression or a low on the map and see where it would go (step 1 of 7, milestone M4).** The dock has a `Place` button
  (key `P`): pressing it holds the clock and opens a small picker (tropical wave, tropical depression, subtropical depression, low-pressure area);
  a white dot follows the pointer and a line from it shows the next seven days of a system put right there, coloured by category at every
  six-hourly fix (squares for subtropical, grey triangles once post-tropical), solid for three days and fading after, with a label such as
  `Cat 2 hurricane · peak 105 mph · by day 4.5`, `Tropical depression · peak 35 mph · within a day`, `Does not develop` or `Low-pressure area · up to 35 mph ·
  gone by day 2.3`. A click puts the system exactly there and leaves Place mode (the clock runs again if it was running); `Esc` cancels. *How:*
  the preview is the engine run through a **shadow environment**: the simulator's own weather looked up seven days ahead (a captured copy of its whole
  state is run forward in 3-hour steps, the steering and pressure keyframes of every 3 h and the SST / humidity / shear of every midnight are
  copied into pooled arrays, and the live state is put back), and `stormMgr.forecast()` runs the same physics with exactly the random numbers the placed
  system would get (they are a pure function of the seed and the id the placement will take). So a placed system does exactly what its preview said:
  largest position difference 0.00 degrees and 0 kt over seven days (28 six-hourly fixes) in the browser check, and eight previews during 40 days of weather leave SST,
  humidity, shear, steering, jet, ENSO and every storm identical to a run without them (53 KB of state compared). The look-ahead carries the climatology of the relative sea temperature
  that the genesis rate is measured against, taken at every field keyframe like the live engine's. The preview is a continuous function of the pointer: over
  244 pairs of placements half a degree apart the 72-hour points are 1.3× (median) and 4.0× (95th percentile, 11.9× at most; 100 % within 8×) as far apart as the placements (a disturbance develops by
  a random hazard, so a half-degree move can change the hour it does).
  Building the look-ahead takes 0.5-0.7 s when Place is pressed (and again a day later or after a slider moved, which makes it stale); each preview then costs about 1.6 ms (16 ms for the first one, measured with the processor shared). A cyclone put on the map is counted as a numbered depression at its first
  six-hourly fix even when it has already turned post-tropical (a 70-kt storm placed at 41N does so one time in three; the first version dropped it from the record).
  *Caveat:* the look-ahead is the simulation's true future, not a forecast with errors; the later steps (the cone, the model guidance) are where uncertainty comes in.
- **Storms, milestone 3: realistic seasons, tracks, landfalls and extratropical transitions in the Atlantic (step 1 of 7), after trying the first version.** What you found
  was right, and every part of it had a measurable cause. You saw ACE near 50 every time with one or two majors and mostly depressions and tropical storms; paths no real
  storm takes (subtropical systems running south-west to Florida, nearly every main-development-region storm ending in South America); a northern Gulf and an East Coast with
  next to nothing; subtropical storms a bit too common; waves and lows that had nothing to do with the depressions; and you asked that selecting a storm or a path hide all
  the others. Twelve seasons of the first version had given 18.0 depressions, 9.5 named storms, 2.5 hurricanes, 1.0 majors and ACE 68 against the real 16.3 / 14.4 / 7.2 / 3.2 /
  122, with ACE anywhere from 0.1 to 283 (real SD 66, range 32-250), and a real-versus-simulated map of 30 seasons of named-storm tracks (`tools/make_tc_validate.py`,
  `tools/storm_validate.mjs`) showed 1.08 South American landfalls a season (real 0.03), loops in the subtropics (a storm that formed in a pressure low sat inside its own
  circulation and orbited it) and about a third of the real traffic through the Gulf and along the East Coast. Two causes explain nearly all of it. *The page's steering is not the
  flow a storm feels:* it is a point value of an unconditional field that contains the circulation of every low, while the motion of a real storm is conditioned on where and
  when it is (the real mean drift of a tropical storm at 10N 40W in August differs from the unconditional mean flow there by several knots), so no recalibration of the
  intensity law could repair a track. *Genesis by gates is degenerate:* a seed that develops wherever SST, humidity and shear allow concentrates the activity in the one corner of
  the basin where all three are best, however the gates are tuned, and nothing ties it to the waves and lows you can see. A second look, at your remark that a storm must
  *actually* become extratropical, found the transition itself wrong in the same way: the first version slid every storm north of ~22N toward a weak "extratropical" wind (25 kt
  against the real 45) because the optimiser had traded it for strength elsewhere.
  *The model now* has four parts anchored to the real Atlantic (IBTrACS 1991-2020 for the aggregates, 1980-2024 for the motion), and what the simulator's weather decides is *which of
  the real possibilities happens this time*. **Motion:** a system moves with the real mean translation of its kind (weak tropical, hurricane, subtropical, extratropical) at its place
  and time of year (`data/generated/atlantic-tc-maps.json`, 5-degree nodes from 9,082 + 4,185 + 541 + 3,003 six-hourly pairs, fitted as local-linear Gaussian means of 4 degrees and 20
  days) plus 0.75 times the anomaly of the page's own steering (the layers it follows, averaged over a ring of 3 degrees round the centre so that the circulation of a low it sits
  in drops out, minus the page's own mean steering there and then) and 0.85 of that anomaly's north-south part; only the response to the anomaly lags (the real mean is already a
  lagged velocity), and the maps are corrected for the mean anomaly the page's flow adds where storms are (the real mean belongs to storms that were there *because of* the flow
  they met); a post-tropical cyclone also follows the real age profile of its speed (25 kt in its first row against 20 for the all-ages mean, 16 kt after three days and 11 after four). **Genesis:** a
  *disturbance* (an easterly wave from the African coast, about 60 a year; a *local seed*, an X in a dashed ring on the map, born where the real Atlantic forms storms from troughs and
  gyres that waves and lows do not supply; or a tracked pressure low, an L) develops at the hourly rate `haz(place, month) x E x quality x activity`. `haz` is the real genesis density
  (first TD / SD row of 505 tropical and 58 subtropical tracks, 1991-2020) divided by the exposure that the page's own disturbances provide; `E` is how much better the humidity, shear and
  sea temperature are than their own mean there and then, behind the growth law's own gate; `activity` is a large-scale random factor (a draw per season, SD 0.25, and a few pulses of
  14-60 days) for the climate the page does not carry, which is what makes the real season counts over-dispersed (SD 5.5 against a Poisson 3.7). It is declared a depression only while the
  growth law could keep one alive at that place (`tdMargin`): the event pushes the wind to the depression threshold whatever the environment does next, and without that test a fifth of
  the numbered depressions (real: one in nine) were depressions for a day and gone. A low develops into a tropical or a subtropical depression, whichever draw it wins, and the path of
  the disturbance leads into the depression's own, so you can watch a wave or a low become a storm. **Intensity:** the same logistic law, recalibrated with the new structure: wind
  grows toward what the environment supports (SST, humidity, shear and latitude gates, a cap on the potential wind poleward of 14N), rapid intensification, a cold wake, Kaplan-DeMaria
  decay over land (and a storm that stays under 30 kt over land for half a day is finished), a cap on how fast a tropical cyclone can lose wind (a hurricane over cold water loses
  about 20 kt a day, not 100), and an established storm sees 5 points more humidity than the page's 2-degree field says (it moistens its own environment: without that, a storm in little
  shear over 28 C water died of every dry pocket in the field, and 11 % of the simulated named phases ended south of 15N against 4.6 % in the data). **The transition:** a tropical or
  subtropical cyclone leaves the tropics by one of two competing random exits whose rates are the real best track's (logit of the six-hour probability = b0 + lat + SST + shear +
  wind, 8,636 rows and 184 transitions, AUC 0.91: it becomes extratropical, keeping its wind, at a median 41N over 20 C water in 33 kt of shear; or it dissipates, a weak storm far more
  often than a strong one), poleward of ~30N the jet's shear holds a weak system up, a post-tropical cyclone relaxes toward the wind that zone supports and, in a strong jet, has a 0.38 chance of an episode of
  re-intensification (+0.5-1.5 kt/h for 12-36 h, and the gain stays), it lasts a lognormal 30 h (real 3 / 12 / 30 / 60 / 102 h at the 10 / 25 / 50 / 75 / 90th percentile) and ends absorbed, and a remnant low lasts about 24 h at 20 kt.
  *Fitting.* The maps are a calibration of this simulator's weather, so they are fitted through the built page (`tools/storm_fit.mjs`, `tools/storm_mc.mjs`): the page's own mean
  steering and environment on the maps' grid (`clim`), the nodes a disturbance can develop at (a quarter of the cell water and ten disturbance-hours a year: the first version's
  centre-point mask dropped the Yucatan, Honduran and Louisiana coasts and left the Gulf and the Caribbean a quarter short), the development rate and the supply of local seeds by
  iterative proportional fitting of the real genesis map on 24-season passes (`fit --ipf`), then a refinement on the numbered depressions (`refine`: regional totals first, then node by
  node, reported at the activity of an average season because the seeds' own activity moves the mean of 72 seasons by 5 %; a rate already at its 0.04-an-hour ceiling hands what is
  left to the supply of local seeds), and the correction of the drift maps for the mean anomaly the page's weather adds where storms are (`motion`). The intensity law and the
  transition's intercepts were fitted with a CMA-ES optimiser on identical weather (`tools/storm_opt.mjs`) and then by structured scans of one parameter at a time on the same seasons
  (`tools/storm_mc.mjs --sets`): the optimiser is noisy at the 5 % level that the seasons' own spread allows, and it had compensated for the old transition with permissive latitude
  gates. Fitting is not validating: every table below is from 96 seasons (seeds 1301-1396) that no fitting step saw.
  *Held-out numbers* (the 214 days from Jun 1, which is the whole real season but for a few storms of Jan-May; real = 1991-2020; the seeds' own activity was 1.01, so no adjustment is needed, and the
  second column is scaled to an average season by the elasticity of the counts to it, 0.55):
  ```
                                                   simulated          real
  depressions (TD or stronger)                         16.6           15.8
  named storms                                         13.2           13.9
  hurricanes                                            7.1            7.2
  major hurricanes                                      3.5            3.2
  category 5                                           0.50           0.47
  ACE                                                   133            122
  SD of named / hurricanes / majors              5.1 / 3.4 / 2.1  5.5 / 3.3 / 1.9
  SD of ACE; lowest .. highest season               75; 9..383    66; 32..250
  hurricanes / majors / category 5 per named storm  .54 / .27 / .038  .50 / .22 / .032
  depressions that become named storms                   .80            .88
  24-h windows with rapid intensification (+30 kt)      .056           .057
  hurricanes / majors that had one                  .63 / .90      .66 / .90
  days as a named storm (mean); under two days       4.9; .30     4.84; .255
  named storms reaching 30N / 35N                   .70 / .52      .71 / .59
  subtropical storms a year                              1.2            1.7
  named storms by month Jun..Nov      1.1 1.4 3.0 4.5 2.4 0.7  0.8 1.5 3.6 4.5 2.5 0.8
  share of ACE by month Jun..Nov      3 6 21 43 23 5 %         1 6 21 48 18 5 %
```
  The tropical cyclones that become extratropical (named storms; real 1991-2020 in brackets): 43 % do (45), ending as extratropical / remnant low / still tropical in 43 / 26 /
  31 % of the cases (44 / 25 / 31), at latitudes 32 / 36 / 41 / 45 / 47N at the 10 / 25 / 50 / 75 / 90th percentile (31 / 36 / 41 / 45 / 48) and 76 / 64 / 52 / 39 / 30W (82 / 75 / 57 / 43 /
  29), over 15 / 19 / 23 / 26 / 28 C water (13 / 16 / 21 / 24 / 27), with 40 kt at the median first post-tropical row (45; hurricanes 65 as in the data, storms 40 against 45), 13 %
  of them being hurricanes (18), 30 hours of post-tropical track at the median and 114 at the 90th percentile (30 / 102); tropical rows north of 33N are 54 a season (65), their winds
  30 / 35 / 50 / 65 / 75 kt (30 / 40 / 55 / 70 / 80) with 12 % of the 25-30N rows at 96 kt or more (10 %); a post-tropical cyclone moves at 19 kt at its first row (23; 15 before the age profile) and its track runs
  402 km east and 328 north in the median (650 / 450).
  *Geography* (same seasons; real 1991-2020): track density correlation 0.953 between the 5-degree maps (total 266 rows a season at 34 kt or more, real 278 which includes Jan-May); first landfalls of named storms per season, simulated vs real: US East coast 0.70 (real 1.13), Florida 0.86 (1.00), US Gulf coast 2.23 (2.37), Mexico 1.35 (2.17), Central America 0.50 (0.60), Greater Antilles and Bahamas 1.84 (1.23), Lesser Antilles 0.07 (0.03), South America 0.42 (0.03), Canada 0.08 (0.23); the first version had 1.08 South American landfalls and a third of the Gulf and East Coast traffic. Numbered tropical depressions Jun-Dec by region: east of 40W and south of 20N 4.28 (4.39), western main development region 2.11 (1.86), Caribbean 1.68 (1.60), Gulf 2.84 (2.55), south-east US coast and Bahamas 3.01 (2.46), subtropics north of 25N 1.23 (1.18), the whole basin 15.4 (14.5; the first version put them where all three gates were best). Share of named storms forming in the largest 10 x 20 degree cells: 20 % at 10-20N 40-20W (17 % real), 16 % in the Gulf box (16 %), 13 % at 10-20N 60-40W (13 %), 12 % at 20-30N 80-60W (10 %), 9 % at 30-40N 80-60W (10 %). The simulated translation differs from the maps' real mean by a standard deviation of 5.8 / 4.5 kt (weak storms; real 6.3 / 4.9) and 6.2 / 4.7 kt (hurricanes; 6.7 / 5.5), with 48-hour displacements in the main development region of 875 east / 397 north km (872 / 396) and 0.5 % of named storms looping (300 degrees of turning in five days) against 2.1 % real.
  *Environment:* the main development region in Aug-Oct has SST 28.77 C with a year-to-year SD of 0.50 (ERSST 28.13, 0.34), humidity 53.5 / 2.42 (ERA5 54.0 / 1.72), shear 19.9 / 2.85 kt (19.5 / 2.84); at its first tropical fix a simulated storm sees 28.8 C, 15 kt of (page) shear and 56 % humidity (real 28.3 C, 17.7 kt). ENSO, 96 seasons by the August-October Nino 3.4: El Nino years (23) average 11.6 named storms and ACE 94, neutral (42) 13.3 and 127, La Nina (31) 14.3 and 169, a ratio of 1.80 (real 1.94: 9.5 / 14.1 / 15.9 named storms, ACE 69 / 125 / 134), and the slope of ln(ACE + 10) on Nino 3.4 is -0.26 (real -0.33 +- 0.09). What becomes of the depressions that formed in a latitude band (named / hurricane / major share, real in brackets): 0-13N 0.87 / 0.67 / 0.47 (0.88 / 0.59 / 0.39), 13-17N 0.78 / 0.49 / 0.26 (0.88 / 0.56 / 0.31), 17-25N 0.78 / 0.48 / 0.19 (0.86 / 0.36 / 0.11), 25N and beyond 0.71 / 0.19 / 0.03 (0.90 / 0.30 / 0.07).
  *Sensitivities* (24 paired seasons): measured on the 24 seasons 1601-1624 one adjustment before the last (a 0.002 lower growth rate and a rapid-intensification rate of 0.04 instead of 0.05 an hour, which moved seasons by under 8 %), against the same seasons without the slider: Warming +1 C gives named storms x1.04, hurricanes x1.14, majors x1.41, ACE x1.25 (the design targets for one degree of uniform warming, with the humidity and shear unchanged, were named x1.15 and ACE x1.5; the engine is weaker on the first and on the second); Moisture +10 points x1.56, x1.94, x2.56, ACE x2.22 (an extreme experiment: the year-to-year SD of the main development region's humidity is 2 points); Wind shear +5 kt x0.84, x0.84, x0.86, ACE x0.82.
  *What you see now.* Waves and disturbances (X in a dashed ring) and lows (L, only over water between 18 and 45N, where one could still develop) are on by default, each with a
  faint dotted trail that becomes the depression's own track when it develops. Clicking a storm or any dot of a finished track shows only that system (every other path, wave and
  low disappears, with a note in the card) until Escape, the cross or a click on the empty map.
  *Tests.* the node suite is 138 checks (it was 60 at milestone 1): the climatology maps are exact at their nodes and bilinear between, a disturbance develops at the map's rate times the environment, only where a depression could live and is declared one only while the growth law could keep it, local seeds are born at the spawn map's rate, the activity factor has mean one and the spread asked for, the motion is the real drift plus the anomaly from the page's own mean and a post-tropical cyclone follows its age profile, the transition rates (a regression-shaped hazard whose exits compete), the wind kept through the transition, the cap on wind loss, a weak storm over land finished in half a day, remnant lows, finite wind south of 4N (found by the lab: a NaN at 3.2N), the calibrated values merged over the structure's, the same storms for any chunking of time with the maps, and a checkpoint restored with the same maps carrying on exactly. The browser suite adds four whole seasons through the live page (means inside wide bands: the first version's ACE of 68 fails them), 20 hurricanes placed at 41N (all that left a record became post-tropical, keeping their wind), the X-in-a-ring marker read from pixels, the maps present in the page, and the selection checks (clicking a storm draws only it, Escape or a click on open sea brings every system back; the first version of the click test aimed at the dock and then at the stat card, found by running it); 1677 checks in all
  *Caveats.* Landfall counts are right where the fit looked (Gulf 2.23 against 2.37, Florida 0.86 against 1.00) and off elsewhere: the East Coast 0.70 against 1.13 and Canada 0.08 against 0.23 are low and the Greater Antilles and Bahamas 1.84 against 1.23 and South America 0.42 against 0.03 are high, because a few more storms than in the data keep their westward track instead of recurving (35N is reached by 52 % of named storms, real 59 %) and the southern Caribbean's storms drift south of the real mean; Mexico 1.35 against 2.17 is low for the same reason. The intensity is 9 % high in ACE and in majors, and the seasons' tail is heavier than the data's (highest ACE 383 in 96 seasons, real 250 in 30), because hyperactive simulated years open every gate at once; 20 % of numbered depressions never reach 34 kt (real 11 %) and the ones formed north of 25N fizzle 29 % of the time (real 10 %), and category 5 comes out right only because the rapid-intensification rate was raised to match. A post-tropical cyclone is 20 % slower at its first row (19 kt against 23), its track is 40 % shorter in km than the data's, there are 48 post-tropical rows a season (58), 23 remnant-low rows (41), the transition happens 5-11 degrees too far east at the lower quantiles (76 / 64 / 52W at the 10 / 25 / 50th percentile against 82 / 75 / 57W), and the wind at the first post-tropical row is 40 kt at the median (45). Subtropical storms are 1.2 a year (1.7). The page's own pressure lows are 25 a month with a mean life of 99 hours (real, ERA5 2007-2021: 60 and 64 hours), so a precursor low is rarer and lives longer than in the data. The warming slider's effect is weaker than the literature's scaling and the moisture slider's much stronger. The simulated translation residual from the real mean is more persistent than the data's (24-hour autocorrelation 0.70 against 0.56). A hand-placed storm that became post-tropical before its first six-hourly fix left no record (7 of 20 at 41N; milestone 4 counts it as a numbered depression). The maps and the intensity law are a calibration of this simulator's weather: when the weather changes, they are re-fitted.
  *Re-fitting.* `npm run build`; with `PLAYWRIGHT_CHROMIUM_PATH` set, `node tools/storm_fit.mjs clim`, `wet`, `fit --ipf` (24 seasons a pass), then rounds of `node tools/storm_mc.mjs --diag --seeds a-b --pages 4` (72 seasons, about eight minutes) with `storm_fit.mjs motion` and `refine --sigma 0.8 --damp 0.8` (pool lab runs of the same engine with `tools/storm_mc.mjs --from`; the report scales counts to an average season by the seeds' own activity) until the regional totals stop moving, `maps`, copy to `data/generated/atlantic-tc-storm-maps.json`, `node tools/merge_data.mjs atlantic --storm-maps data.json`, `npm run build`, and check on seeds nothing was fitted on (`storm_mc.mjs --seeds 1701-1796`, `storm_validate.mjs`); the intensity law and the transition's intercepts are scanned with `storm_mc.mjs --sets` (identical weather, one parameter set per column) or `storm_opt.mjs` (CMA-ES)
- **First visible storms in the Atlantic simulator (step 1 of 7, milestone M2) — not calibrated yet.** The engine of the entry below is now
  inside `src/template.html` (Atlantic only; the other eight pages are byte-for-byte what they were) and the page draws what it does.
  *What you see.* Tropical waves as dashed north-south lines; lows as an orange L with their central pressure (off by default);
  tropical depressions / storms / hurricanes as circles coloured by category (TD blue, TS green, C1 yellow, C2 orange, C3 red, C4
  magenta, C5 purple), **subtropical systems as squares** in the same colours, extratropical / post-tropical cyclones as grey
  triangles; a six-hourly dot every 6 h along a coloured track, a white dot where a system became a depression, a faint dotted
  trail for the wave stage, a name label at the head (`EX Arthur` once post-tropical) or at the peak of a finished track. Hover a
  dot: name, category, wind in mph with kt in brackets, gusts, pressure and time (`Arthur | Major Hurricane (Cat 3) | 120 mph
  (105 kt) · gusts 145 mph | 946 hPa · now` is a real check, your reference card). Click a live storm or any dot of a finished
  track: the stat card (category, wind, pressure, Peak badge, ACE, shear, gusts, movement, SST, formed; Damage stays "—" until
  the damage step), Esc or × closes it. The top bar `Atlantic 2026 | DEP | NAMED | HURR | MAJOR | CAT 5 | ACE` counts from the
  six-hourly fixes. `Customization` gains Tropical waves / Lows / Storm names; `Experimentation → Advanced` gains `Storms form
  on their own` and `Storm activity (seeds)`. On a tablet and a phone the season bar moves under the clock as a compact grid
  (the first version ran over the open panel at 900 px and off the screen edge at 390 px; found by screenshot, now a test that
  fails on the old CSS).
  *How it is wired.* `advanceHours()` walks in sub-chunks that end on every absolute 3-hour boundary; at each boundary
  the page takes a keyframe (the three steering layers and sea-level pressure every 3 h; SST, humidity and shear once a day at 00Z
  and whenever a slider, ENSO or the seed changed) and the engine runs hour by hour on the latest one, so storms depend on the
  seed, the settings and the actions, never on how often the page redraws. **Finding:** that was not true of the weather
  before. SST, humidity, shear and ENSO draw their random numbers lazily inside `computeField()`, which the live page calls on
  a wall-clock throttle; with storms off, one seed advanced 120 days gives different fields at the same moment depending on
  the redraw cadence (two seeds, 243 cells on a 5° grid, against a daily redraw: a 160-h cadence, what 64× does, changes
  humidity by 15-17 points and shear by 9-10 kt on average per cell (cell maxima 68-72 points and 37-38 kt), SST by 0.4-0.5 °C
  (up to 2.7), Niño 3.4 by 0.3-0.7 °C; one call and one final redraw gives 0.4-1.1 °C in Niño 3.4; a daily and a 3-hourly
  redraw are identical because the draws are per day). With storms on, those draws are pinned to the midnight keyframe, which makes
  the environment and the storms a pure function of the seed: a browser check advances one seed three ways (a redraw every 6 h,
  1-hour steps, one call) and requires byte-identical storm state and identical SST / humidity / shear / ENSO. With storms off
  (`SSTSIM.storms(false)`, which `checkBasin` sets for all nine pages so the existing environment checks stay exactly what they
  were and fast) the old code path runs unchanged. The page's `stormEnv` reads the engine-owned keyframe copies; the low tracker
  gets the pressure minima of the sim's own sea-level-pressure field (mirror image of the highs detector: below 1008 hPa, 2 hPa
  deeper than the mean of the ring of nodes two steps (8°) away, 18-68°, refined with a parabola).
  *Numbers.* Storms on cost 56-59 ms per simulated day measured with `tick` (100 days in 5.6-5.9 s; storms off is 0.02 ms because
  `tick` does no field work, the page's own redraw costs 50-70 ms anyway), the storm layer redraws in 0.6-0.7 ms with 15
  systems and 611 fixes, and a 12-season Monte-Carlo (214 days each, four cores) takes 52 s. At 64× live play the fields at each
  midnight roughly double the frame cost; not optimised yet. Browser suite: 13 new checks (season bar before anything formed
  and after placing systems, a placed depression getting dep 1 and the name Arthur, the three marker shapes read off canvas
  pixels, hover, click card, Esc, the layout at 1280 / 900 / 390 px, the Wind shear slider reaching the storms at the next
  keyframe (6.9 kt at 0 and 31.9 kt at +25 for the same hour of the same seed), seeding on / off, the three-cadence determinism,
  a different seed giving different storms, the engine on by default in the Atlantic) on top of the 60 node checks; 1593 in total.
  *Caveat, and what comes next: nothing is calibrated.* Twelve uncalibrated seasons (seeds 1-12, Jun 1 to Dec 31, the engine's
  placeholder parameters in the real simulated environment): **18.0** depressions (real tracks 16.3), **9.5** named storms
  (real 14.4), **2.5** hurricanes (7.2), **1.0** majors (3.2), ACE **68** (122). Genesis is about right and intensification
  too weak (26 % of named storms become hurricanes, real 50 %), and the spread between seasons is far too wide: named storms
  per season were 11, 8, 4, 12, 2, 4, 1, 8, 15, 20, 26, 3 (SD 7.7, real 5.5) and ACE ran from 0.1 to 283 (SD 95, real
  65.5, range 32-250). The likely suspects are the humidity gate (its midpoint sits at the basin's typical 700 hPa humidity, so
  small seasonal differences swing the growth rate) and the environment seen along the tracks; milestone 3 measures the
  environment along real tracks from the ERA5 files already on disk, fits the gates to that, then checks the aggregates and
  the held-out facts of `data/generated/atlantic-tc-ref.json`. Lows thresholds are not yet checked against ERA5, the 2027+ name
  lists are from memory, and Place mode, the season summary, save / resume and the Continue card are the next milestones.

- **Storm engine, version 1 (`src/storms.js`) with 60 node-only checks — not in the pages yet.** One pure-JS module (no DOM, a classic
  script that sets `globalThis.HFStorms`, inlined by `tools/build.mjs` through a new fourth placeholder `/*__STORMS__*/` that a template
  without it simply ignores; `package.json` is `"type": "module"`, so an `export` would have broken the inlined `<script>`) holds the
  whole storm model, and `npm test` now starts with `tests/storms.mjs` (about a second, no build, no browser).
  *What it is.* Systems are `wv` (tropical wave / disturbance), `tc` (TD, TS, HU), `sc` (subtropical SD / SS), `ex` (extratropical /
  post-tropical) and `nl` (non-tropical or remnant low), reported with HURDAT2's own codes, and every best-track fix is rounded the way
  HURDAT2 holds it (wind to 5 kt, pressure to 1 hPa, position to 0.1°), so the season statistics use the same definitions as
  `data/generated/atlantic-tc-ref.json`. Motion is a BAM-style blend of the simulator's shallow / medium / deep steering layers (weak
  storms follow the shallow flow, majors the deep one) plus beta drift, a first-order lag and a smooth wobble; intensity is a logistic
  growth law bounded by the empirical DeMaria-Kaplan potential intensity of the *effective* SST (the formula is in m/s: 84 m/s = 163 kt at
  30 °C), reduced by shear (strong storms resist it), 700 hPa humidity and latitude, with stochastic rapid-intensification episodes, a
  cold wake under slow storms, exact Kaplan-DeMaria decay over land, and smooth internal variability. Waves (about 56-60 a year, only
  May to November) and the regional sources (Gulf, western Caribbean, off the Southeast coast, central subtropical Atlantic; about 34 a
  year) are *seeds* that obey the same growth law, so a seed develops only where the simulated SST / humidity / shear allow it: there is
  no separate genesis switch, and a hand-placed seed behaves the same way. Every random draw is a pure function of (seed, system id, hour,
  stream), so the same seed gives byte-identical storms however time is chunked and a checkpoint is plain JSON. Names are the WMO
  lists by year (2026 starts Arthur, Bertha like your reference image) with the supplemental list after 21; ACE, depression numbers,
  hurricane / major / cat-5 counters and the daily ACE series come from the six-hourly fixes; calendar-year rollover archives the season
  and a storm alive on Jan 1 stays under its formation year; a tracker links the pressure minima the host detects into lows; and
  `forecast()` runs the same physics on a copy through any environment, with exactly the noise a hand-placed system will get.
  *What the 60 checks pin* (synthetic environments, one control at a time): the Saffir-Simpson boundaries on 5-kt winds, mph rounding
  (105 kt = 120 mph) and gusts (120 mph gusts to 145 mph, your card), ACE, the best-track wind-pressure fit (96 kt = 962 hPa, 137 kt = 917),
  the name lists (21 unique each, A-W without Q U X Y Z); beta drift toward the north-west, 72 h of motion under a 10-kt easterly,
  recurvature where the trades turn to westerlies and none with easterlies at every latitude; mean 6-day peaks of **118 / 112 / 54 / 31 kt
  at 3 / 8 / 15 / 22 kt of shear**, **31 / 47 / 106 / 124 kt at 24 / 26.5 / 28 / 29.5 °C**, **31 / 43 / 112 kt at 25 / 50 / 65 % humidity**;
  rapid intensification in 7.8 % of 24-h windows against 2.6 % with the episodes switched off; a stalled hurricane's 2.1 °C cold wake
  against 1.0 °C for one that keeps moving; land decay to the formula (47 / 33 / 29 kt at 12 / 24 / 36 h from 100 kt) and an island
  crossing; extratropical transition over cold water in shear, subtropical to tropical conversion, remnant lows; names in the order storms
  reach storm strength; counters that equal what the fixes say; no ACE from extratropical fixes; nothing within 6° of the equator; identical
  storms for 1-hour, mixed 1-800-hour and single-call advances; a checkpoint that survives JSON and continues exactly; the preview equal
  to the placed storm to 1e-9°; placing a storm leaving every automatic one untouched; calendar rollover.
  *Mutation checks.* The suite was run against 24 deliberately broken copies of the engine (shear ignored, humidity ignored, flat
  potential intensity, no land decay, no beta drift, no depth-dependent steering, no cold wake, no rapid intensification, ACE threshold,
  gust factor, 1-kt instead of 5-kt fixes, two swapped names, non-deterministic noise, the placed storm getting other noise than its
  preview, placement shifting the automatic waves, no hold before genesis, no extratropical transition, no remnant low, no rollover,
  ACE from extratropical fixes, waves in winter, hurricanes counted at 55 kt, no recurvature): 23 are caught; the one that is not
  (the Category-1 threshold at 63 instead of 64 kt) is equivalent, because winds are rounded to 5 kt first. Three tests were
  too lax the first time round (rapid intensification, the genesis hold, ACE after transition) and were tightened until their mutant
  was caught.
  *Caveats.* Every parameter is an uncalibrated placeholder: the engine has only met synthetic environments and has not been compared with
  the best-track statistics yet (that is milestone 3, in the real simulator, with the targets from the entry below). In a uniformly
  favourable synthetic environment almost every wave develops (there is no weather variability to stop them), which is expected and
  not a finding. The 2027+ name lists (retired-name replacements) and the supplemental list are from memory, flagged in the source.

- **Storm system, step 1 of 7 — the approved plan and the real best-track reference it is calibrated against (no app change yet).**
  `docs/storms-plan.md` is the approved design for tropical waves, lows, tropical / subtropical / extratropical cyclones,
  manual + automatic spawning with a forecast preview, names, ACE, season stats and mid-season save/resume (Atlantic first;
  the order is core systems → AOIs/invests → cone → wind field 1 → wind field 2 → watches/warnings → city damage). The first
  piece is the data: `tools/make_tc_ref.py` reads the IBTrACS-derived Atlantic tables inside the PyPI wheel `huracanpy` 1.5.0
  (pinned by sha256 against PyPI's own digest, cached in git-ignored `data/raw/`) and writes `data/generated/atlantic-tc-ref.json`
  (37 KB, derived statistics only). NHC, NCEI, AOML and WMO are all refused by the sandbox's proxy, so raw HURDAT2 text and the
  official name tables are *not* available; this is a third-party mirror of NOAA public data, so it is checked, not trusted.
  *Checked against NHC.* With the definitions the engine will use (named storm = a six-hourly row with status TS/SS/HU;
  hurricane = HU row; major = HU row ≥ 96 kt; ACE = Σ(wind/100)² over TS/SS/HU rows; season = IBTrACS season) the 1991-2020 means
  are **14.4 named storms (NHC 14.4), 7.17 hurricanes (7.2), 3.2 majors (3.2), ACE 122.5 (NHC about 122)**, with an ACE spread
  of 32-250 (SD 65.5); 2005 comes out 28 named / 15 H / 7 MH / ACE 250 and 2020 30 / 13 / 6 / 180. The mean date of the first
  named storm is Jun 19 and of the third Aug 3 (NHC: about Jun 20 and Aug 3), the median ACE day is Sep 12 and the smoothed
  ACE peak Sep 8.
  *What the file holds* (everything the engine is later compared with, in the same definitions): per-year counts and ACE
  1980-2024; the daily cumulative-ACE and named-storm curves (mean, 10/25/50/75/90th percentiles, min, max) that will become
  the season graph's climatology bands; genesis by month (Aug 3.6, Sep 4.5, Oct 2.5 named storms a year) and where (median
  20.1N 63.2W; 17 % of named storms form in 10-20N 40-20W, 16 % in the Gulf box 20-30N 100-80W, 13 % in 10-20N 60-40W, 10 % off the
  Southeast coast) plus a 5° map of first depression positions; 24-h intensity change by starting class; rapid-intensification
  shares; 6-hourly translation velocity by latitude band for weak and hurricane-strength storms; lifetimes; the peak-intensity
  histogram; status mix; extratropical-transition and subtropical counts; the wind-pressure relation; ENSO composites.
  *Findings that already shape the engine.* A gain of ≥ 30 kt in 24 h (RI) happens in **5.7 %** of 24-h windows, 18.5 a season,
  and **66 %** of hurricanes, **90 %** of majors and **98 %** of Cat-4+ storms had at least one; 49.8 % of named storms reach
  hurricane strength, 22.2 % major, 3.2 % Cat 5, and 25 % last under two days. The wind-pressure relation is
  Δp = 0.0123·V^1.83 hPa (V in kt, Δp below 1013 hPa; rms 6.4 hPa; a latitude term only improves it to 5.9), e.g. 96 kt ≈ 962 hPa,
  137 kt ≈ 915 hPa. 44.7 % of named storms end up extratropical (6.4 a year) and 1.7 a year are subtropical storms. ENSO: the 12
  El Niño years (ASO Niño 3.4 > 0.5) average 9.5 named storms and ACE 69, the 13 La Niña years 15.9 and 134 (**ratio 1.94**), the
  17 neutral years 14.1 and 125 — the check the finished sim has to reproduce.
  *Caveats.* It is a processed IBTrACS table (no storm names, no wind radii), of unstated IBTrACS version, from a mirror that is not
  checksummed against NOAA; the NHC tallies above are the cross-check. The WMO name lists are not in it (see the plan).
- **Experimentation is now Basic / Advanced, with two new "average" sliders: Moisture and Wind shear (all 9 basins).**
  `Ocean layers → Experimentation` opens on a **Basic** tab that holds only `Set ENSO now`, `Keep ENSO at this value`,
  `Warming`, `Moisture (average humidity)` and `Wind shear (average)`. Everything else is under **Advanced**: year-to-year
  variability, `Day-to-day weather (humidity)`, `Day-to-day weather (shear, steering, highs)`, `Weather speed (jet,
  steering, highs)`, seasonal swing, currents and upwelling, El Niño / La Niña influence, the "Seed nudges swing,
  currents and El Niño" checkbox, and the steering arrows' `Storm strength` selector. The seed row (Seed, New seed,
  Reset) belongs to neither tab and shows under both; Reset puts Warming, Moisture, Wind shear and the Advanced
  sliders back (`Set ENSO now` stays where it is, as before). The tabs are a real tab list (roles, `aria-controls`,
  arrow keys / Home / End), and the panel opens on Basic.
  `Customization` is exactly as it was, apart from one thing you named: `Storm strength` is "advanced stuff", so the
  selector left Customization (the steering-arrows and highs tick-boxes stay) and is now always visible in Advanced,
  where before it appeared when the arrows were ticked. My reading of "the main menu" is this in-simulator panel; the
  start screen (`index.html`) has no settings.

  *The two sliders* are uniform shifts of the average, the way `Warming` is for sea temperature: `Moisture` moves
  the 700 hPa relative humidity by −20..+20 percentage points and `Wind shear` moves the 200–850 hPa shear by −20..+20
  kt (steps of 1, default 0, the read-outs say `+10 %` / `−5 kt`). The shift is added inside the combine loop,
  before the soft limits, to every cell, so weather, ENSO and the jet's ribbon ride on the new average (the ribbon
  is not "left behind" at the old one). Measured in the built pages, as the change of the basin-wide mean at three
  dates: Moisture +10 / +20 = +9.3…+9.8 / +18.9…+19.5 points over the nine basins (−8.7…−9.6 / −16.3…−18.7 for
  −10 / −20), Wind shear +10 / +20 = +9.7…+10.0 / +19.3…+20.0 kt (−8.8…−9.9 / −16.2…−19.4 for −10 / −20). They fall
  short of the label only where the field hits a limit (dry or already-saturated air, shear near zero). Each slider
  moves only its own field (checked: the other two fields are bit-for-bit what they were), both are monotone point by
  point, and back at 0 the field is exactly what it was.

  *What the sliders exposed: the fields were already leaving their physical range, at default settings.* With every
  slider at rest the committed build had shear below zero (the old soft floor settled at −2 kt) and relative humidity
  outside 0-100 %, in cells of the built pages, sampled every degree on six dates 60 days apart (seed 4242): shear
  < 0 in up to 20.5 % of a basin's cells (South Pacific, day 120; 11.4 % East Pacific, 9.3 % West Pacific, 7.5 %
  Atlantic), humidity < 0 in up to 6.7 % (South Pacific, day 240; 6.3 % North Indian Ocean) and > 100 in up to 3.1 %
  (South Pacific, day 120). The old limits were `2 − 4·tanh((2 − v)/4)` (floor −2) for both and `100 + 4·tanh` on the
  top for humidity. They are now bounded squeezes that are the identity over the whole realistic range: humidity
  `95 + 5·tanh((v − 95)/5)` above 95 and `3·exp((v − 3)/3)` below 3 (stays in (0, 100)), shear `2·exp((v − 2)/2)`
  below 2 kt (stays above 0), each with slope 1 where it starts, applied to every cell. Same sampling on the new
  build: 0 cells out of range on every date in every basin (the tests assert it at three dates, and at both ends of
  both sliders, for all nine basins). Side effect: where the old floor was active the lowest shear values move up by up to
  about 2 kt (at 0 kt the old limit gave 0.15, the new one 0.74), and negative shear and humidity beyond 100 % can no
  longer show in the read-outs.

  *Not done / worth knowing.* The two sliders are uniform, not latitude-aware (a +10 kt shear shift is +10 kt in the
  trades and at the jet alike), and they change the humidity and shear fields only: steering winds are a separate
  field and stay as they are (a physically linked "more shear = stronger upper flow" coupling is a bigger design
  question, not attempted). The ENSO sliders on the Basic tab are the older ones whose three lag terms sum to 1.7–2.8x a
  sustained event's real response (the caveat under "Later"); fixing that is a separate, bigger change.

- **Steering arrows and highs in the other eight basins (all nine now).** East Pacific, West Pacific, North Indian Ocean,
  Australian Region, South-West Indian Ocean, South Pacific, South Atlantic and Mediterranean have what the Atlantic got:
  `Steering arrows (colour = speed)`, `Highs (H) with sea-level pressure`, the `Storm strength` selector
  (Experimentation → Advanced), the readout's heading / speed / pressure lines, and the shared
  `Day-to-day weather (shear, steering, highs)` and `Weather speed (jet, steering, highs)` sliders (in these eight they were
  `Day-to-day weather (wind shear)` and `Jet stream speed` until now; same sliders, wider job). The client is the
  Atlantic's, lifted out of `src/template.html` block by block by script (every anchor matched exactly once), so the nine pages
  are identical apart from per-basin constants. The one thing that is new in the code is the box edge: `ST_LON0/1`, `ST_LAT0/1`
  keep the highs' search and the arrows inside the simulated area and fade the arrows over its outer 6 degrees like the field
  raster (in the Atlantic that edge is off the map; in the others you can pan to it), and `stNormLon` reads longitudes into the
  South Pacific's date-line frame (160..240). Same random stream as in the Atlantic, so adding steering changed nothing else a
  seed does (a check per basin: SST, humidity, shear and ENSO after 6 days are bit-for-bit what they are with the features off).

  *Data.* The Atlantic's pipeline (`tools/build_steer_all.sh`, all nine rows now): real ERA5 monthly layer winds and sea-level
  pressure 2007-2021 -> one joint EOF set (K = 8) with the ENSO response fitted over its three lags together and a seasonal
  amplitude for the EOF part -> the day-to-day calibration on the real daily fields 2017-2021 (pressure weather, the
  wind-pressure coupling, the ribbon, the residual flow) -> the mean ribbon and the variance closure measured on the built page.
  For the others the ribbon and the per-latitude statistics are measured on an analysis box that adds the whole jet band to the
  displayed rows (like the shear jet: most boxes do not contain the jet), the pressure-weather statistics wrap the date line
  for the South Pacific, and a length scale that never falls below 1/e inside the window is reported as the window's length
  (the East Pacific's tropical pressure anomaly is larger than its sector). With `--no-extend` the generalized scripts
  reproduce the Atlantic's committed weather and calibration files byte for byte (checked).

  | basin | nodes (4°) | joint EOF, K = 8 | sustained El Niño, deep u peak, kt per °C (old fit) | ribbon at the axis, deep / weak kt | largest mean ribbon removed (± SE) kt |
  |---|---|---|---|---|---|
  | Atlantic | 38 x 29 | 59% | 3.2 (6.7) | 25.6 / 8.8 | 15.7 (0.63) |
  | East Pacific | 29 x 21 | 65% | 6.0 (12.5) | 27.5 / 9.1 | 15.2 (0.63) |
  | West Pacific | 21 x 16 | 68% | 4.4 (9.5) | 35.6 / 10.7 | 25.8 (0.90) |
  | North Indian Ocean | 18 x 11 | 64% | 2.2 (4.8) | 21.9 / 2.9 | 14.7 (0.54) |
  | Australian Region | 22 x 13 | 70% | 2.0 (4.0) | 20.7 / 2.6 | 10.0 (0.45) |
  | South-West Indian Ocean | 20 x 12 | 75% | 1.9 (3.9) | 23.6 / 5.9 | 12.0 (0.54) |
  | South Pacific | 21 x 11 | 74% | 6.0 (12.4) | 18.1 / 2.8 | 8.8 (0.41) |
  | South Atlantic | 18 x 11 | 80% | 3.2 (6.7) | 25.7 / 7.9 | 14.1 (0.61) |
  | Mediterranean | 14 x 5 | 89% | 2.3 (4.6) | 27.8 / 8.0 | 15.9 (0.64) |

  *What the checks found* (each invisible until it was compared with the real data, basin by basin).
  (a) **A clock bug in my own jet check.** The check that compares the arrows along the simulated jet axis with the real
  composite read the season's start from wherever the previous check had left the simulation clock, but every sample
  restarts from the basin's own start date, so its window was shifted by up to a quarter of a year: the Atlantic had been
  sampled from mid-August to January instead of June to November (39.3 kt along the axis against the real 34.4; in the
  right months it is 35.7). In the new basins the same bug made the ribbon look 20-46% too strong, which sent me looking
  for a calibration error that was not there. The check now reads the start date from a fresh run (the highs check
  already did).
  (b) **A symmetric ribbon on an asymmetric jet.** Along the real daily axis the deep-layer wind is 16-22 kt weaker 10 degrees
  equatorward of the axis in every southern basin, but only 3.5 / 2.6 / -1.0 kt weaker 10 degrees poleward in the South
  Atlantic / Australian Region / South-West Indian Ocean (the westerlies keep growing towards the polar front; the
  Atlantic's drop is 20 / 22 either way). The simulated ribbon is a symmetric stripe, so there its poleward flank falls
  off 9 / 7 / 3 kt where the real one does not. The check tests each flank only where the real wind falls off.
  (c) **A mean-wind bias that was sampling noise.** With 30 seeds the Mediterranean (10 interior nodes) showed a 3.0 kt
  grid-mean bias and the South Pacific 1.1 kt; with 100 seeds, per season, every grid mean is within 1.8 standard errors
  of the real climatology in the South Pacific, South-West Indian Ocean, South Atlantic and Mediterranean, and the
  node-by-node rms is at the level of the sampling noise. The check now measures the noise from the spread of the seeds' means
  and judges the bias against it (a grid mean must be within 0.7 kt or 3.5 standard errors, and what is left node by
  node after removing the noise must be small), so a small grid is not failed for being small and a ribbon mean left in
  (mutation: 5.2 kt bias in the South-West Indian Ocean) still is.
  (d) **Sharp seasonal minima come out too variable.** The seasonal amplitude of the EOF part (`eofAmp`) is smoothed over
  neighbouring months (1-2-1) to tame 15-year variance estimates, which lifts a sharp minimum: the North Indian Ocean's
  year-to-year spread at 24-32N in August is 2.3 kt, July 3.3, September 3.7, and the slow part reproduces it at +27%
  (2.9 kt) where every other month is within -10..+8%. Because the residual flow cannot be negative (it is floored at
  0 where everything else already exceeds the target: 33-37% of the North Indian Ocean's deep nodes in July-September,
  39-46% of the Mediterranean's in July-August, 27% of the West Pacific's in August), the total stays a little high
  there: simulated/real standard deviation up to 1.30 (North Indian Ocean, August, 24-32N), 1.16 (East Pacific, August,
  30-40N), 1.14 (South Pacific). Not fixed: less smoothing would change the committed Atlantic data too and means
  re-running the slow part, the weather calibration and the means for every basin (hours, 13 GB each); listed under "Later".
  (e) **A missing `</div>` in my port.** The steering legend's markup was left open in all eight pages, which made the
  playback dock, the toast, the city tooltip and the attribution children of the legend card, and that card is hidden until the
  arrows are ticked: the dock would have been invisible in every basin but the Atlantic. The steering block passed in every basin
  with it that way; I saw it on a screenshot. A check now asserts that every floating card is a direct child of the page and
  the dock is visible with the arrows off (and fails on the unclosed markup).

  *What it reproduces, simulated vs the real ERA5 (2007-2021 monthly, 2017-2021 daily; thresholds in the tests were set
  from many seeds, not from one run; the Atlantic first, for reference).*

  | basin | deep winds, simulated / real standard deviation (month x band cells) | highs a day, Jan / Apr / Jul / Oct, simulated (real) | central pressure of the highs, 10th / 50th / 90th percentile, hPa: simulated (real) | along the jet axis, kt: simulated (real) |
  |---|---|---|---|---|
  | Atlantic | 0.96-1.08 (16) | N 4.9 (4.7) / 4.6 (4.8) / 3.8 (4.5) / 5.0 (4.8); S 2.1 (1.9) / 2.9 (2.6) / 3.8 (3.1) / 1.9 (1.9) | 1018.7 / 1023.5 / 1033.0 (1018.6 / 1023.4 / 1032.2) | 35.7 (34.4) |
  | East Pacific | 0.94-1.16 (16) | N 2.6 (2.6) / 1.7 (1.9) / 2.1 (2.5) / 2.3 (2.1) | 1018.6 / 1023.8 / 1033.5 (1018.5 / 1024.8 / 1032.7) | 27.4 (24.9) |
  | West Pacific | 0.95-1.11 (16) | N 1.6 (1.4) / 1.8 (1.6) / 0.5 (0.5) / 1.9 (1.9) | 1018.8 / 1024.0 / 1034.5 (1018.9 / 1024.6 / 1033.3) | 42.0 (42.7) |
  | North Indian Ocean | 0.97-1.30 (12) | N 0.3 (0.1) / 0.0 / 0.0 / 0.0 (0.0) | not tested (a high one day in ten) | 27.7 (31.9) |
  | Australian Region | 0.97-1.10 (12) | S 0.6 (0.6) / 1.0 (1.1) / 1.5 (1.4) / 1.2 (1.1) | 1018.9 / 1023.7 / 1032.9 (1019.0 / 1023.8 / 1030.5) | 27.7 (28.1) |
  | South-West Indian Ocean | 0.95-1.09 (12) | S 0.8 (0.9) / 1.1 (0.9) / 1.4 (1.3) / 0.9 (1.2) | 1021.5 / 1027.6 / 1035.9 (1020.8 / 1026.5 / 1033.0) | 29.3 (26.0) |
  | South Pacific | 0.92-1.14 (12) | S 0.3 (0.2) / 0.4 (0.2) / 0.5 (0.6) / 0.7 (0.5) | not tested (0.2-0.6 a day) | 23.6 (25.8) |
  | South Atlantic | 0.93-1.10 (12) | S 0.6 (0.5) / 0.7 (0.4) / 0.8 (1.0) / 0.6 (0.6) | 1019.2 / 1024.4 / 1030.5 (1019.2 / 1023.4 / 1030.7) | 33.5 (29.5) |
  | Mediterranean | 0.95-1.05 (4) | N 0.1 (0.1) / 0.1 (0.1) / 0.0 (0.0) / 0.1 (0.1) | not tested (a high one day in ten) | 33.7 (27.1) |

  Weak-storm (shallow) winds: 0.93-1.12 in every basin. The travelling pressure highs and lows are 93-111% of their
  real size in February / August (rms of P' over 30-60 degrees; over 16-28N in the North Indian Ocean, 36-44N in the
  Mediterranean). With the weather off, each month's year-to-year spread of the deep winds is 0.80-1.27 of the real
  one, and its seasonal cycle is kept (August over February, simulated vs real: East Pacific 32% / 46% vs 30% / 40% at
  20-30 / 30-40N; West Pacific 56% / 70% vs 62% / 70%; North Indian Ocean 38% / 38% vs 34% / 29% at 16-24 / 24-32N;
  southern basins, where August is winter: Australian Region 114% / 140% vs 114% / 151%, South-West Indian Ocean 110% / 119% vs
  115% / 148%, South Pacific 109% / 116% vs 117% / 113%, South Atlantic 176% / 149% vs 174% / 152%; Mediterranean 51% vs 49%;
  pooled EOFs would give 100%). Mean winds and pressure are the real climatology: grid-mean bias at most 0.47 / 0.57 /
  0.24 / 0.63 / 0.74 / 1.09 / 0.70 / 0.84 kt (u, deep; East Pacific ... Mediterranean, 30-90 seeds per season; the
  sampling error of those means is 0.4-1.2 kt, see (c)) and 0.2-0.6 hPa. Arrows circulate round the highs the way real ones do, 8 degrees out (weak / strong
  storms; real Atlantic 11.7 kt, 98% / 88%): East Pacific 14.2 / 13.3 kt, anticyclonic round 99% / 83% of 98 highs; West
  Pacific 10.2 / 6.3 kt, 96% / 69% of 67; Australian Region 13.6 / 10.4 kt, 100% / 90% of 48; South-West Indian Ocean 17.7 /
  16.0 kt, 100% / 93% of 57 (the other way round in the south). A held El Nino minus La Nina (+2 / -2, variability and
  weather off, 190 days), deep-layer westerlies and sea-level pressure, these are the fitted responses and not tuned:
  East Pacific +16.1 kt at 30N 156W, -8.2 at 6N 156W, +12.3 at 34N 148W, -5.6 hPa at 46N 172W; West Pacific +9.7 at 36N 172E,
  +4.2 at 4N 140E, +5.1 at 40N 154E, -3.8 hPa at 48N 176E; North Indian Ocean +4.1 at 20N 62E, -3.2 at the equator 86E, +3.2 at
  24N 62E, +1.8 hPa at 28N 86E; Australian Region +3.8 at 20S 106E, -2.4 at the equator 106E, +3.6 at 40S 146E, +2.1 hPa at
  12S 98E; South-West Indian Ocean +4.6 at 18S 62E, -2.8 at 4S 86E, +2.0 at 38S 56E, +2.0 hPa at 16S 94E; South Pacific +16.6 at
  24S 152W, -8.5 at the equator 156W, +10.9 at 28S 155W, -2.9 hPa at 32S 136W; South Atlantic -4.0 at 20S 30W, +4.0 at 4S 34W,
  +7.9 at 36S 34W, +1.3 hPa at 4S 30W; Mediterranean +6.3 at 44N 2W, -3.5 at 36N 30E, +4.1 at 41N 6E, -1.9 hPa at 48N 10W.
  Smoothness and reproducibility are as in the Atlantic (hourly heading change at most a few degrees, a seed gives
  bit-identical steering however the run is chunked). The pages grew by 0.08-0.39 MB each (East Pacific 1.67 -> 2.06 MB,
  Mediterranean 0.91 -> 0.99).

  *Tests.* `STEER_SPECS` has an entry for every basin (the Atlantic's plus eight new ones), and `checkSteering` runs from it in
  each basin's block, between the shear checks and the ENSO-hold ones: 62 checks in the Atlantic, East Pacific, West Pacific,
  Australian Region and South-West Indian Ocean, 60 in the South Atlantic, 58 in the South Pacific, 54 in the North Indian Ocean
  and the Mediterranean (the last four have too few highs for the drift, circulation, central-pressure and icon checks); 20-50 s
  a basin. The suite goes 1045 -> 1520 checks (all passing). A spec is the basin's real figures plus a few options for what the Atlantic
  does not need (the header comment of the block lists them: icons wanted in view, the latitude band of the pressure
  weather, the tolerances of the variance budget and of the mean-wind checks, no trade-wind half in the layers check, the jet
  composite's tolerance and its one-sided stripe). The real figures come from two read-only scripts that apply the page's own rules
  to the real daily fields, `tools/real_steer_highs.py` (highs a day by month, central pressures) and
  `tools/real_steer_axis.py` (the along-axis composite). Probe points are chosen to be open ocean, on screen and clear of the
  floating cards (a hover in the bottom-left corner hit the readout card, which grows under the pointer as it fills). Mutations
  the block was checked to fail on, in the South-West Indian Ocean: no mean ribbon removed (mean bias 5.2 kt), no ribbon at all, the
  ENSO lagged terms dropped, the ENSO sign flipped, the pressure-wind coupling 1.4x, the travelling pressure 1.3x, a
  1013 hPa threshold for highs, no prominence rule, a wrong medium-layer weight, the weather slider ignored, the readout heading
  reversed, no edge fade, the year-to-year EOF part doubled; in the South Pacific, the date-line longitude frame
  not normalised; the unclosed legend markup; and the ones that matter for the loosened tolerances: the mean ribbon left in is caught in the
  South Pacific, West Pacific and Mediterranean too (mean bias and node errors), the doubled EOF part in the North Indian Ocean and
  East Pacific, the 1.3x travelling pressure in the North Indian Ocean. The 1.4x pressure-wind coupling (deep layer only) is
  caught where that coupling carries much of the variance (East Pacific, South-West Indian Ocean) and not in the North Indian
  Ocean, West Pacific or Mediterranean, where it carries little (an error that small is also invisible on the page).

  *Caveats.* (1) SST, humidity and shear still use the older one-lag-at-a-time ENSO fits (a sustained event counts 1.7-2.8x),
  which a held El Nino makes visible; steering uses the joint fit, whose sustained-event response is half the old one's in
  every basin (table above). (2) Sharp seasonal minima come out up to 30% too variable (finding d). (3) The simulated jet axis
  composite is within -13..+14% of the real one in seven basins and +24% in the Mediterranean, whose box holds the axis a quarter
  of the time and whose axis already sits 1.15 degrees too far poleward (see "Later"); the ribbon is symmetric across the axis
  where the real southern jet is not (finding b); and, as in the Atlantic, the ribbon has its cyclone-season amplitude all year
  (the real winter jet is stronger; only the Atlantic's winter/summer ratio, 47 vs 31 kt, was measured). (4) Local mean-wind errors at
  the jet's edge: the West Pacific's node-by-node mean has 3.2 kt rms left after the sampling noise (the Atlantic 2.1 kt in total),
  worst node 8.6 kt (4.1 standard errors) at 44N in the months the jet passes (-4.9 kt in June, +4.4 in January and April): the
  mean ribbon removed is one map for all months, which is the suspect, not isolated. (5) Highs: the South-West Indian Ocean's
  and Australian Region's strongest highs are 2.4-2.9 hPa above the real 90th percentile (1035.9 vs 1033.0, 1032.9 vs 1030.5);
  the North Indian Ocean and the Mediterranean have a high about one day in ten in winter, so usually no H on the map at all;
  the South Pacific 0.2-0.6 a day. (6) Not validated against best-track storm motion (the sandbox cannot reach NHC/NCEI).
  (7) The 6-degree fade at the simulated area's edge is new on screen here (the Atlantic's edge is off the map), and only
  arrows fade; a basin's field raster and jet line already did.

- **Steering arrows and highs (Atlantic first), plus "Keep ENSO at this value" (all 9 basins).**
  `Customization → Steering arrows (colour = speed)` draws arrows on a lattice that follows the zoom
  (about 290 on a 1280x800 window, never closer than ~46 px): direction is where the flow pushes a storm,
  colour is its speed (indigo → blue → cyan → green → yellow → orange → red → white-hot, 0 to 70+ kt, with
  its own legend card). A `Storm strength` selector picks the layer: Weak (850-700 hPa), Medium (850-500) or
  Strong (850-200, the default), the standard BAM family. `Highs (H) with sea-level pressure` puts an H on
  every high with its central pressure. Both work over every view (Temperature, Anomaly, Humidity, Shear),
  with "Show sea temperature" off, and over land; the hover readout gains "Steering toward 106° (ESE) at 31 kt"
  and "Sea-level pressure 1009 hPa". The decisions you made: semi-permanent and migratory highs both, in one
  field; no separate high-strength slider (it was too much control); one shared `Day-to-day weather (shear,
  steering, highs)` slider and one `Weather speed (jet, steering, highs)` slider for all three. My defaults for
  the two questions you left open: the storm-strength selector exists (Weak/Medium/Strong, Strong selected),
  and lows / dry-air-from-highs are left for later.

  *The "Keep ENSO at this value" checkbox* sits next to `Set ENSO now`: ticked, Niño 3.4 stays exactly at the
  slider's value instead of drifting away (the gauge says "· held"); moving the slider while ticked moves the
  held value; unticking hands it back to the oscillator. The 3- and 6-month lagged terms are held too, so a held
  event reaches its full response once six months have passed (the history is not back-filled: the same delay
  a forced event has always had), and it survives restart and a new seed. Same code and same 9 checks in all
  nine basins. **Read this before relying on it for SST, humidity or shear:** those three fields still use the
  older one-lag-at-a-time ENSO fits whose three terms sum to 1.7-2.8x what a sustained event really does (the
  caveat already listed under "Later"); holding ENSO makes that visible, where a drifting oscillator never sat at
  one value long enough to. The steering field already uses the joint fit (sum-of-lags peak 3.19 kt per degC
  for the deep u against 6.71 for the old way).

  *How it is built: one field, field-first (chosen over "highs as objects that push the wind").* On a 4 degree
  grid (38x29 nodes over the Atlantic's box, interpolated bicubically). Real data comes from the same
  public ARCO-ERA5 archive (`tools/pull_era5_steer.py`: layer-mean winds, monthly 2007-2021 and daily
  2017-2021, plus 6-hourly sea-level pressure; vectors averaged first, pressure-weighted in p).
  (1) *Slow part* (`tools/make_steer.py`): real monthly climatology of the shallow and deep layer winds and
  the sea-level pressure, one JOINT EOF set (K = 8, 59% of the weighted variance; winds and pressure in one state
  vector so the patterns keep the real coupling between a high and the flow around it) and an ENSO response with
  the three lags fitted together. The medium layer is not stored: 0.68 x shallow + 0.32 x deep, R² 0.98-0.99.
  (2) *Jet ribbon*: a westerly stripe along the same simulated axis that draws the jet line and the shear
  ribbon, pointing along the axis' local direction (so arrows hug the jet and swing north-east ahead of
  troughs), with the real along-axis profile (excess over the far field: +25.6 kt deep at the axis, fading to 0
  at 14 degrees), minus the mean ribbon that simulated jet produces (measured by `tools/calibrate_steer_means.mjs`
  from the built page, largest mean 15.7 kt, standard error ≤ 0.63), so the climate mean stays the real one.
  (3) *Pressure weather*: a field of travelling highs and lows, a sum of 14 plane waves per latitude band
  (5 bands) with the measured size (wavelength 4.8-6.2 thousand km poleward of 20 degrees), eastward speed
  (19-20 m/s at 35-60N, slowed 2.5x with the jet) and rms by calendar month and node (1.1 hPa near the equator
  to 10 hPa at 60N); its geostrophic wind times the fitted coupling alpha(latitude) (0.73-0.77 poleward of 35
  degrees for the shallow layer, 0.68-0.75 deep, weak in the tropics; r² up to 0.76 shallow, 0.39 deep) drives
  the winds. (4) *Residual flow*: rotational (streamfunction) waves for what no surface pattern explains (upper
  troughs, tropical waves; in the real residual vorticity is 6-13x the divergence), with its own shallow-layer size.
  The highs are the maxima of the total pressure (climatology + EOF/ENSO + the weather), found on the node grid
  and refined with a parabola: at least 1017 hPa, 2.5 hPa above the surrounding ring, outside 15 degrees (no highs
  in the equatorial trough; over the Andes the reduced pressure is an extrapolation artefact). All the weather
  runs on the jet's own clock (dilated 2.5x, scaled by the speed slider), steering has its own random stream, and
  the day-to-day slider scales it. Hurricanes' own circulation is masked out of every statistic (8-degree discs
  round pressure minima under 1003 hPa; 0.8% of the Atlantic's grid-days) so what is calibrated is the environment the storm
  model will steer in.

  *Three things the real-data checks found and fixed* (each was invisible until it was compared with real data,
  month by month and band by band, not just on average).
  (a) **The simulation was far too variable in boreal summer.** August deep-layer winds were 35-62% more
  variable than real at 15-45N (std ratio 1.42 / 1.62 / 1.35 at 15-25 / 25-35 / 35-45N), May up to 17% high, February
  and November within ±14%. Two causes. The EOFs are fitted on all months together, so every month got the same
  year-to-year spread, but the real spread has a strong seasonal cycle (deep u at 25-35N: 3.4 kt in August,
  11.4 in February, 7.3 pooled): each month's EOF part is now rescaled node by node (`eofAmp`, 0.73 in August
  to 2.2 in February at 15-30N) so EOF + ENSO reproduce that month's real year-to-year variance. And the
  residual was sized from a removal that did not match what the simulation adds back, so the pieces added up to
  more than the real total; `calibrate_steer_means.mjs` now closes the budget on the built page: for every month
  and node, residual variance = (real year-to-year + real day-to-day variance) minus the variance of everything
  else the page adds, measured, floored at 0 (it is the floor in 6-7% of deep-layer nodes in July and
  August, 3% in September and none the rest of the year; the residual is 59-68% of the deep layer's total variance in every month). Result, checked over
  4 seasons x 4 latitude bands: simulated/real standard deviation 0.96-1.08 (deep), 0.95-1.08 (shallow); the
  pressure weather is 102% / 109% of its real size in February / August.
  (b) **Highs were up to 39% too few.** A ring spectrum (wavenumbers within ±25%) gave 2.8-4.3 northern
  highs a day against a real 4.2-5.0 by the same rule applied to the real fields (-25 to -39% from April to
  October, -8 to -19% in the other months). Prominence and central pressure
  were right, only the count was low; a broader, log-normal wavenumber spread (`ST_P_SPREAD` 0.45, mean wavelength
  kept) fixes it without shrinking the highs. Northern highs a day, simulated vs real, June to May: 3.9 / 3.9 /
  4.1 / 4.3 / 4.5 / 4.8 / 5.4 / 5.1 / 5.1 / 4.6 / 4.4 / 4.2 against 4.2 / 4.5 / 5.0 / 5.0 / 4.9 / 4.8 / 4.7 / 4.7 /
  4.5 / 4.5 / 4.8 / 4.9 (within -18% to +15%); southern: 3.9 / 3.7 / 3.2 / 2.7 / 2.6 / 1.7 / 1.7 / 2.1 / 1.9 / 2.1 /
  2.8 / 3.3 against 3.6 / 3.1 / 2.4 / 2.3 / 1.9 / 1.6 / 1.9 / 1.9 / 2.0 / 2.1 / 2.6 / 3.5 (-7% to +39%, worst October).
  Central pressure 10th/50th/90th percentile 1018.8 / 1023.9 / 1031.6 hPa against a real 1018.2-1019.0 /
  1022.3-1024.8 / 1029.6-1035.4. The count also moves with wavelength more steeply than expected (x0.8 wavelength
  gave about +30%, x0.65 about +80%), which is why it needed a fit rather than a guess.
  (c) **A diagnostic mistake worth remembering.** I first read the jet ribbon as 16% too strong (39.9 vs a real
  34.4 kt along the axis) and spent a while building a more principled calibration (the anomaly composite on
  the real axis, solved against the simulated jet). The comparison was wrong: a simulated run starts on June 1,
  so "days 152-334" is November to April, and the real composite was June to November. Like for like (June-November,
  25-58N, 80-20W) the shipped far-field-excess ribbon gives 33.6 kt vs the real 34.4, median 18 degrees off the axis
  vs 16, 89% within 45 degrees vs 80%, and the profile across the axis within 3 kt at every offset. The
  principled variant lowered the residual only a little (rms 11.1 to 9.6 kt in August at 25-35N) and fell short on this
  composite (29.4 kt), so it was dropped; the variance is fixed in (a) instead. Check the season of any simulated sample against the real one.

  *What it reproduces, Atlantic, simulated vs real ERA5 (2017-2021 daily, 2007-2021 monthly; thresholds in the
  tests were set from many seeds, not from one run).* Mean winds and pressure are the real climatology: bias
  over the grid ≤ 0.25 kt (u), 0.13 kt (v), 0.13 kt shallow, 0.28 hPa, node rms 2.1 / 1.2 / 1.3 kt and 0.8 hPa
  over four seasons of 30 seeds. Arrows circulate round the highs the way real ones do, 8 degrees out: northern
  highs 14.3 kt weak / 13.3 kt strong storms, anticyclonic round 98% / 84% of 201 highs (real 11.7 kt, 98% / 88%);
  southern 12.4 / 9.6 kt, 97% / 76% (the other way round). ENSO held at +2 vs -2 (variability and weather off,
  190 days): deep westerlies over the Gulf +5.0 kt, tropical Atlantic -1.8 kt, 45N 40W +5.8 kt, sea-level pressure at
  60N 20W -2.35 hPa. Along the jet axis, June-November: above. The trades are faster in the shallow layer (14.1 vs
  9.3 kt at 15N 50W), the jet in the deep layer (37.7 vs 24.1 kt at 45N 40W). Smoothness: from one hour to the next
  the heading changes by at most 4.6 degrees and the speed by 1.1 kt (1850 hourly steps at 6 points), highs drift a
  median 0.10 degrees an hour (95th percentile 0.4), and a seed gives bit-identical steering however the run is
  chunked.

  *Cost.* The arrows are drawn from pre-rendered sprites (one per colour, painted once with their dark halo) and
  blitted rotated: about a millisecond per redraw, redrawn at most every 90 ms; the node field takes ~2 ms. A
  full-coverage canvas costs a software-rendered headless browser 11% of its frame rate at 1440x860 and 21% at
  2000x1300 with arrows on; stroking every arrow's halo each frame (the first version) cost ~50 ms a frame.
  The Atlantic page grew from 2.9 to 3.1 MB (the seasonal EOF amplitude map and the shallow residual map).

  *Tests.* One block (`checkSteering`, driven by `STEER_SPECS`, so another basin is one spec entry) with 60 checks, ~45 s (the suite goes 723 -> 864): the controls and the legend
  (colour ends, captions, hidden until ticked); the arrows on their canvas's real pixels (colour at each arrow's
  centre is the legend's colour for its speed; the head's wings lie ahead of the centre on the wind's heading,
  median 3 degrees off; drawn in every view and with "Show sea temperature" off; lattice spacing; the arrows
  redraw as the clock runs and stand still when paused); the readout in every combination of the two boxes and
  three layers; mean preservation; the variance budget by season and band; the weather's size; ENSO signs; the
  highs (rule, counts, pressures, drift, circulation); the ribbon; both sliders; smoothness, chunking and restart
  reproducibility; isolation (SST, humidity, shear and ENSO after 6 days are bit-for-bit what they are with the
  features off); the layers; the icons. Plus `checkEnsoHold` (9 checks) in every basin. The new block was checked to fail on each of: a build without the smear (mean bias 3.2 kt, node rms 5.7 kt, 39.6 kt along the axis), a flipped geostrophic sign (highs circulate the wrong way: 25% anticyclonic), a flipped arrow heading, a flipped ENSO sign, the weather slider ignored, the jet clock replaced by the simulation clock, no seasonal EOF amplitude (August's spread 99% of February's, real 32%), a residual 1.5x too big (std ratio 1.16-1.43), no ribbon, no prominence rule in the highs, and a narrow pressure spectrum (2.8 northern highs a day in June). One thing it found about itself: the first version of the seasonal-spread check measured the budget with the residual already closed, so removing the seasonal EOF amplitude passed it; the slow part now has its own check (weather off).

  *Caveats.* (1) [Written for the Atlantic alone; the other eight basins have the same client now, see the entry
  above.] (2) Highs: northern counts run +9 to +15% in December-February,
  southern +15 to +39% in August-October. (3) The ribbon amplitude is the June-November one in every month: the real
  winter jet is stronger (along-axis deep wind at the axis 47 kt in DJF vs 31 in JJA, same sector), so winter jet-following is
  understated; and the real wind along the axis spreads wider than the simulated (10th-90th percentile 5-62 kt vs
  15-54). (4) The seasonal-amplitude fix is for steering only: the SST, humidity and shear EOFs are still pooled
  over the year and have the same seasonal-spread mismatch. (5) Not validated against best-track storm motion: the
  sandbox cannot reach NHC/NCEI, so that comes with the storm model (a few real storms' steering would be the first
  thing to check). (6) The 6-degree fade at the edge of the simulated area never shows in the Atlantic (the map's
  pan limits keep that edge 8 degrees away); it will in basins that can show their edge. (7) The 15-year grid reads 30.5 kt
  for the deep westerlies at 46N 60W in June-November where the 5-year daily file has 33.7: part is the 4 degree
  sampling smoothing the jet core, part the different years; not separated.

- **Rolled Wind Shear and the jet stream out to the other 8 basins.** East Pacific, West Pacific,
  North Indian Ocean, Australian Region, South-West Indian Ocean, South Pacific, South Atlantic and
  Mediterranean now have everything the Atlantic has: the Wind Shear view (real ERA5 climatology +
  EOF interannual variability + ENSO fit), the day-to-day texture, the jet-stream ribbon, the
  `Jet stream line` checkbox, and the `Day-to-day weather (wind shear)` and `Jet stream speed`
  sliders. The client code is not re-written per basin: every block is lifted out of
  `src/template.html` by a script that requires each anchor to match exactly once in the target, so
  the nine stay identical except for the per-basin constants and the comments that quoted Atlantic
  numbers. That was checked against a git three-way merge of the Atlantic's whole shear/jet diff
  into each template: identical outside the lines that differ by nature (start date, the
  basin-specific state, each basin's own humidity scale). Each basin's jet statistics come from its
  own cyclone season (the months its humidity uses; each basin's sim clock also starts at its own
  season start: EPAC May 15, WPAC Jun 1, NIO Apr 1, the four southern/Mediterranean basins Nov 1 /
  Sep 1), and its climatology/EOF/ENSO fit from its own box.

  *Phase 1 data, per basin (all from the global ERA5 caches already on disk, so every build is local
  compute).* K = 6 modes carry 56.8% (EPAC), 63.9% (WPAC), 73.9% (NIO), 67.1% (AUS), 67.0% (SWIO),
  77.6% (SPAC), 73.4% (SATL) and 87.3% (MED) of the monthly anomaly variance -- more than the
  Atlantic's 39.9% at the same K, because its box is far larger, so K = 6 stays. Climatology ranges
  [min, max] kt: EPAC [4.5, 97.1], WPAC [6.2, 134.7], NIO [4.0, 112.3], AUS [6.5, 99.4], SWIO
  [4.9, 96.8], SPAC [7.4, 99.3], SATL [6.6, 77.0], MED [10.1, 99.9] (Atlantic [4.0, 106.5]); 0
  invalid land cells everywhere (ERA5 has values over land). `key: 20 kt` is crossable in every
  basin, checked on each basin's own real daily shear in its own season: 15-29% of the box is
  below 20 kt (EPAC 21.6, WPAC 27.2, NIO 28.7, AUS 23.4, SWIO 23.0, SPAC 15.3, SATL 22.1, MED 15.9)
  and 20-39% of the half nearest the equator (MED's 9.8% is the lowest, still crossable). The colour
  scale is the same absolute-kt stops in every basin, so a colour means the same shear everywhere;
  it is stretched where the real monthly jet core outruns the Atlantic's 110 kt (WPAC to 140 kt,
  NIO to 120 kt, one deeper stop each), and the soft clamp sits 5 kt above each ceiling.

  *ENSO, checked against the places where the teleconnection is documented* -- and one lesson
  about checking at a single point. Fitted response per degC of Nino 3.4, East Pacific: central
  Pacific/Hawaii (15N 160W) -3.1 to -3.4 kt at every lag (El Nino weakens shear there, the
  documented more-central-Pacific-hurricanes pattern), Central America/Caribbean edge (14N 85W) +1.0
  kt at lag 0 and ~0 after; the East Pacific genesis region (12N 110W) is ~0 (-0.4 / +0.2 / +0.1), so
  ENSO reaches it through SST and humidity, not shear. West Pacific: South China Sea +2.4 kt (fewer
  far-west storms), and east of ~165E at 5-10N -2.7 to -6.1 kt (the south-eastward genesis shift). South Pacific: -4 to -9.7 kt at 5-10S
  east of the date line (genesis shifts toward Samoa/Tokelau) and +3 to +9 kt at 20-30S (stronger
  subtropical jet). Two of my first single-point checks came back "wrong" (WPAC 10N 150E +1.7,
  SPAC 15S 180E +0.9) until the maps showed both points sit on the zero line between a positive
  and a negative lobe of the pattern, not on the wrong side of it.

  *What had to be generalized, because the Atlantic's jet is the easy case.* (1) The search band is
  a signed latitude interval: 20-65N, or 65-20S for the four southern basins (`limitJetAxis` and
  `JET_AXIS_LO/HI` work in either sign). (2) Most boxes do not contain the jet. Tracing the axis
  over 20-65 latitude (65-20S in the south) and asking how often it lies inside each displayed box: Atlantic 100%, WPAC
  97%, AUS 84%, EPAC 76%, SWIO 73%, SPAC 72%, SATL 63%, NIO 55%, MED 25%. A jet just outside the box
  still throws its flank across the edge, so `tools/make_shear_jet.py` now traces the axis, and
  measures the ribbon cross-section and the smear, on an ANALYSIS box (the displayed longitudes, the
  displayed rows plus the whole band plus the ribbon's 12 degrees of reach) and cuts only the smear
  back to the displayed rows: the axis and the cross-section are properties of the jet, not of the
  box. `make_shear_synoptic.py` subtracts the same axis. With `--no-extend` both scripts reproduce
  the Atlantic's shipped `atlantic-shear-jet.json` / `atlantic-shear-synoptic.json` byte for byte,
  which is how the refactor itself was checked.
  `tools/build_shear_all.sh` holds every basin's box, season and band in one place, rebuilds all eight
  basins' shear data and merges it, and was checked to reproduce every committed file byte for byte.

  *Measured per basin* (8 axis modes, as in the Atlantic): the axis's variance carried by 8 modes is
  80.5% (EPAC), 88.9% (WPAC), 86.9% (NIO), 84.3% (AUS), 86.3% (SWIO), 83.1% (SPAC), 86.2% (SATL),
  91.2% (MED) (Atlantic 72.7%); its spread over time 11.1, 7.3, 7.7, 9.6, 10.6, 10.4, 9.3, 11.0 deg of
  latitude (Atlantic 10.9); its mean path 39.0-43.6N, 37.3-42.0N, 28.9-34.4N, 35.0-32.3S, 39.8-33.6S,
  38.5-32.3S, 38.8-35.2S, 30.0-33.4N. The ribbon peaks +44.6, +45.2, +38.7, +46.8, +46.1, +45.7, +47.5
  and +38.5 kt above the de-smeared background (Atlantic +39.5), with smears up to 19-23 kt. The
  eastward speed of axis anomalies, from the lagged cross-correlation of columns 10 and 20 degrees
  apart (the Atlantic's method, which reproduces its 15): 13, 14, 11, 15, 19, 16, 16, 21 deg/day, set
  per basin as `JET_DRIFT_REAL` (dilated by the same 2.5 as the Atlantic's). The simulated core
  (de-smeared background + ribbon peak) lands 4-8 kt under the real mean daily shear at the axis (EPAC
  71.4 vs 79.1, WPAC 91.7 vs 99.1, NIO 86.3 vs 90.7, AUS 81.5 vs 86.9, SWIO 77.8 vs 83.3, SPAC 74.9 vs
  82.2, SATL 76.5 vs 82.7, MED 85.0 vs 89.9; Atlantic 67.5 vs 74.9), the same gap the Atlantic already has.
  Texture (what is left after the jet comes out): median std 15.9, 15.6, 14.1, 14.9, 14.7, 16.1, 14.4,
  15.9 kt (Atlantic 14.5), lag-1 autocorrelation 0.67, 0.67, 0.75, 0.63, 0.55, 0.61, 0.57, 0.51 (0.62).

  *Does the simulated field reproduce the real climatology?* It should by construction (the ribbon
  averages to the smear that was taken out), and it was measured rather than assumed: 36 seeds x 6
  dates five days apart from each basin's start, every third coarse node, simulated minus real monthly
  climatology (kt). Over all nodes the mean bias is +0.2 (ATL), -0.1 (EPAC), +0.3 (WPAC), -0.5 (NIO),
  -0.9 (AUS), -0.7 (SWIO), -0.1 (SPAC), -0.2 (SATL), +3.3 (MED), rms 1.7-3.7. Within 8 degrees of the
  mean jet path: +2.0, +4.0, -0.5, -2.7, -0.4, +1.3, +2.0, +1.7, +4.9. With the ribbon removed the same
  nodes read -7 to -19 kt low (-10.0, -8.9, -17.3, -18.5, -18.4, -14.0, -13.6, -16.2, -7.1), which is
  the smear the ribbon puts back. The Mediterranean's +3.3 is the largest, and the cause is in the axis, not
  the field: the simulated mean axis sits within +/-1 degree of the real mean path in every basin
  (-0.8 to +0.4) except the Mediterranean, where it is 1.15 degrees too far poleward (0.0-2.4 by
  longitude). Its mean path (30.0-33.4N) is only ~10 degrees above the band's equatorward edge, the
  soft limit squeezes the southern excursions of a sum of Gaussian modes (it raises them toward the
  edge), and the real axis, which piles up against that edge (14% of day-columns), is not
  symmetric; the ribbon's slope 6 degrees off the axis is ~3.5 kt per degree, which is the +4.9 near
  the jet. The simulated spread is 79-89% of the real one in every basin (8 modes, plus the
  soft limit). Fixing the Mediterranean properly means computing the smear from the simulated
  axis distribution instead of the real one; it is 3 kt on a field that swings 80, so it does not
  block the rollout.

  *Changes to the Atlantic's code that every basin got.* (a) The jet line is clipped to the
  simulated area: it fades over the last 6 degrees of longitude (as before) and now the last 2 of
  latitude, because a basin beside the jet draws a line that leaves the box. (b) When the whole axis is off the map, the `Jet stream line` option says
  so ("· north/south of this area today") instead of leaving a map that looks as if the option is
  broken; it never triggers in the Atlantic. In 150 seeds at day 12 it triggers 4% of the time in
  NIO, 1% in SPAC, 2% in SATL, 5% in MED, never in the others. The same note covers the axis being
  inside the box but not on screen (zoomed in on the tropics, each basin's default view is a window
  onto the main development region and the jet is usually beyond its edge): "· north/south of what
  is on screen" -- which also makes it show in the Atlantic when the jet is past the top of the view.
  (c) The line's latitude fade is two small erase strips, drawn only when the axis comes within the
  fade distance of an edge, not one full-canvas gradient: the full-canvas version cost more than the
  line itself (20 -> 6 frames a second at 2000x1300 in software rendering) and the strips cost
  nothing measurable. (d) A real bug found by looking at the North Indian Ocean: its 8th jet mode
  has a daily autocorrelation of -0.002, and
  `Math.pow(-0.002, 1/2.5)` is NaN, and `Math.max(NaN, floor)` is NaN -- one mode made the whole
  axis NaN and the line and ribbon vanished. The persistence is now clamped at 0 before the power
  (the higher modes of the smaller basins sit at 0.02-0.15). The new tests fail on exactly this.

  *Tests: 445 -> 723.* `checkShear` runs 34 checks per basin (+1 where the whole axis can leave the box) at a
  fixed seed, with the sim paused, so none of it is luck: the view/legend/key labels, a real sample,
  the city tooltip, a forced El Nino vs La Nina at a point where the fitted response has the same sign
  at all three lags (EPAC 4N 150W, WPAC 16N 116E, NIO 4N 86E, AUS 20S 166E, SWIO 22S 56E, SPAC 10S 200E,
  SATL 4S 34W, MED 42N 6E), day-to-day texture and its slider, whether the ribbon is in the field, all
  the motion checks (no NaN anywhere, calm, meanders, no kinks, chunking-independent, the speed slider
  rescales time/freezes it, flows east, live axis = baked axis, parked at slider 0, inside its band at 3x),
  and the line on the real pixels of its own canvas in every view with the box off/on, following the axis,
  plus the off-map and off-screen notes. Thresholds come from 24-60 random seeds per basin, not from the one run: mean
  20-day axis range over ten columns min 3.3 in MED and 6.4-11.8 elsewhere (threshold 3), east-minus-west lagged-correlation
  asymmetry (means of 3 seeds) min 0.06 (0.03), median day-to-day change 0.97-1.86 (0.4-3.2), worst
  hourly second difference 0.065 (0.2), slider-0 / slider-1 day-to-day ratio 0.13-0.73 (0.85). The
  Atlantic's "shear on the axis minus 12 degrees off it" contrast does not separate cleanly in
  basins where the jet is on the edge of the box (NIO: 18.6 with the ribbon vs 34.5 without, because
  the climatology's own north-south gradient there is as large as the ribbon), so the per-basin block
  uses the field on one fixed row against how close the axis is, within each seed and pooled over 8
  seeds x 6 days: 0.62-0.88 with the ribbon, -0.22..+0.31 with it removed, in every basin (threshold
  0.5). That the tests can fail was checked on deliberately broken builds: the NaN bug gave 11
  failures, a build without the ribbon gave a correlation of 0.12, a ribbon latitude with the wrong
  sign in the Southern Hemisphere 0.07, a stuck jet clock 3 failures.

  *Caveats worth knowing.* (1) ENSO's three lag terms are summed, not weighted to total 1, in the
  existing SST/humidity architecture and so in shear too: each lag is fitted by its own simple
  regression, and Nino 3.4 is persistent, so a sustained event counts the same response about three
  times. At the equatorial central Pacific (EPAC 4N 150W) the fit is -11.4 kt/degC at one lag (the real
  El Nino-minus-La Nina difference over the 2007-2021 record is -39.7 kt for a 4.1 degC swing, about
  -9.7/degC, matching), but forced +/-2 degC for 190 days the sim gives a -107 kt difference. The sign is
  right everywhere; the amplitude is up to ~3x where the real response is large. It is pre-existing
  and shared by every field, so it was not changed here. (2) Season: the jet's statistics are each
  basin's cyclone season but the simulated year runs 12 months, so out of season the climatology
  carries the real seasonal cycle and the ribbon and smear do not follow it (the Atlantic's Dec-May
  has the same compromise). (3) NIO and MED sit beside the jet rather than under it: the axis is
  inside the NIO box 55% of the time and the MED box 25% of the time, so there the ribbon is often just
  its flank and the line often absent (hence the note). (4) Seen while screenshotting every basin, and
  present in the committed build before this change (checked against a build of the previous commit):
  thin horizontal gaps in the colour overlay near 16-17S in the Australian, South-West Indian and
  South Pacific views (the overlay canvas is transparent on those rows; SST has no NaNs there). Not
  from this work and not chased.

- **Made the jet stream move slower and flow smoothly, with a speed slider (Atlantic).** The
  feedback: "moves a bit too fast, and the movement is not smooth; I want it to flow and
  interpolate smoothly". Measured before changing anything, there were three separate causes.
  (1) *Pace.* The 8 wave modes had daily lag-1 autocorrelations of 0.85 / 0.58 / 0.48 / 0.63 /
  0.49 / 0.52 / 0.34 / 0.25, so apart from the leading one the whole shape re-randomised every day
  or two: median 3.9 deg/day, 90th percentile 12, i.e. the line moves ~2.7 deg a second at 1x.
  (2) *Direction changes.* The axis was linear between daily snapshots, so every midnight it set
  off in a new random direction: the hourly second difference of the path peaked at 1.0-1.1
  deg/h^2. (3) *Redraw rate.* The field was only recomputed every 6 simulated hours (about 3 a
  second at 1x), and the line was drawn from that, so it moved in steps of a median 1.3 deg, up to
  4 (30-90 px).

  Whether (1) was a tracing artefact was checked against the data, not assumed: a continuous-ridge
  tracer (a Viterbi path along longitude with a smoothness penalty, three penalty strengths) was
  run on the same 5 years. It does smooth the *shape* (neighbouring-column jumps at the 95th
  percentile fall from 14.7 to 4.4-6 deg; the top 8 modes carry 85-93% of the variance instead of
  73%), but the *timing* is the same: median 2.6 deg/day, 90th percentile 16-19, PC lag-1
  autocorrelations 0.74 / 0.59 / 0.58 / ... A full vector AR(1) predicts tomorrow's modes only
  slightly better than independent ones (R^2 0.49 vs 0.43). So the real max-shear axis genuinely
  is that restless -- several shear maxima take turns being the strongest -- and a faithful
  simulation of it thrashes. The calmer timing is therefore a *design choice* for a jet-stream
  display, stated as one: the spatial modes and amplitudes stay the real ones (per-column spread
  unchanged: sd 6-12 deg, always inside the 20-64N band), and only the evolution is slowed.

  What changed. The whole evolution is dilated 2.5x (`JET_DILATION`): the leading mode's real
  6-day e-folding becomes ~15 days (0.85 -> 0.94/day), every other mode is floored at that same
  0.94, and the samples between whole days are a Catmull-Rom cubic (the same 4-tap basis the
  monthly climatology uses), so position and velocity are both continuous. Measured on 6 seeds x 60
  days: median 1.60 deg/day (was 3.9), 95th percentile 4.9 (was 12), 0.45 deg per 6-hour redraw
  (was 1.3); the hourly second difference peaks at 0.020-0.049 on 40 seeds (was 1.0-1.1, 20-55x
  smoother). The line is now stroked on a canvas of its own from the live jet clock on every
  animation frame (76 points, effectively free), instead of being baked into the 50-70 ms field
  redraw; in a 5-second real-time run it went from 3 distinct positions a second to 11 (this
  headless software renderer is the slow part: sim hours arrive 16.7 times a second at 1x) and the
  largest one-frame jump from 4.8 to 2.1 deg. The shear raster beneath it now redraws every 3
  simulated hours up to 2x (6 above) instead of every 6, paced by how long the last redraw took
  (never more than ~40% of the main thread), so its ribbon steps half as far and trails the line by
  at most that.

  It also flows. The old model was standing patterns whose amplitudes changed in place. Real axis
  anomalies travel east: for two longitudes 10-40 deg apart the cross-correlation peaks 0.60, 0.92,
  1.23, 1.59, 2.04 and 2.90 days later at the eastern one (10, 14, 20, 26, 32, 40 deg) -- a steady
  14-17 deg/day, 15.0 by least squares. Each column now reads the mode amplitudes with a delay
  proportional to how far east it is (15 deg/day dilated to 6), so a change shows up downstream a
  few days later, as real troughs and ridges develop downstream. Delaying a stationary series
  leaves its distribution at every column exactly as it was, so the real per-column spread and the
  smear derived from it are untouched. In the simulation the lagged correlations peak at +2, +3,
  +5 days for 10, 20, 30 deg apart (design 1.7, 3.3, 5.0). A time-longitude diagram before and
  after shows it plainly: horizontal streaks that change every day or two, versus slanting
  features that drift east and evolve over weeks.

  The delay has a cost, found by measuring the curve rather than looking at it: neighbouring columns
  now read the mode amplitudes a third of a day apart, and the modes are only smooth in space when
  combined at the same time, so the curve came out ~35% rougher along longitude (median step between
  2-degree columns 0.83 -> 1.11 deg, worst case 7.5 -> 10.6; second difference along longitude, 95th
  percentile, 2.04 -> 2.64). One light [1 4 6 4 1]/16 pass along longitude, applied to the axis
  anomaly before the slider and the band limit, takes it out for 1.8% of the amplitude (mean
  per-column spread 8.54 -> 8.39 deg): final median step 0.96, 95th 3.3, worst 9.4, and curvature
  1.53 at the 95th percentile -- ~25% below the jet had before the delay existed, though slopes
  between columns are still 5-15% above it. (For scale, the real continuous-ridge axis has a 95th
  percentile step of 4.4 deg and the real max-shear axis 14.7.) Also checked: the jet spends 4-15%
  of the time north of 56N, where it leaves the top of the map (the real axis: 10-18%), in episodes
  that now last a mean 3-4.5 days (real: ~1.7), 90th percentile at most 10 -- longer than real
  because everything is slower, but short in absolute terms.

  The jet got its own clock and random stream. It used to draw from the shared stream and jump the
  AR(1) in closed form, so the same seed gave a different jet depending on how the run was chunked;
  now it steps a day at a time on its own stream, and a seed gives the same jet however `advance()`
  is called or how fast it's played. A new `Jet stream speed` slider (`P.jetSpeed`, Experimentation,
  0-3x, default 1x) multiplies the jet clock, so it rescales time itself instead of changing the
  process: 2x for 5 days is *exactly* 1x for 10, 0 freezes the jet where it is, and moving the
  slider never makes it jump. The old pace is roughly 2x on it.

  Not changed, deliberately: the local weather *texture* in the Wind Shear view still re-randomises
  at its real day-to-day rate (it is fit data, half-weight), so the field around the ribbon still
  "boils" more than the ribbon moves. If that now reads as the jerky part, slowing or smoothing it
  the same way is the next step.

  Two more of the existing statistical checks were re-measured on the new dynamics, since a slower
  jet gives fewer independent samples per window. "The jet axis shifts day to day" (std of 8 daily
  samples > 1) fell below 1 on a few percent of seeds (0.26 at worst), so it is now the range over
  20 days (9-29 deg on 40 seeds; threshold 4). "The jet is a real band" dipped to 18.4 kt on one
  seed in 60 against a threshold of 20 when averaged over 4 longitudes (a jet far north has
  climatologically high shear 12 deg either side), so it now averages 10 longitudes: 26.6-49.5 kt
  with the ribbon vs. -9.6..+10.6 with it removed, threshold 20 in the gap.

  Tests: 8 new checks, all exact functions of a fixed seed and the jet clock (the jet no longer
  depends on the shared random stream, so there is nothing left to luck): median daily change under
  3.2 and over 0.5 (1.0-2.2 on 40 seeds); no kinks (hourly second difference under 0.2; 0.02-0.05); the same jet however the run is
  chunked; speed 2x == 1x for twice as long; speed 0 frozen; downstream flow (east-leading
  correlation exceeds west-leading by 0.10-0.21 on 24 seeds; threshold 0.05; 0 for a standing
  pattern); the live axis the line is drawn from equals the one baked into the field (to 1e-3 deg);
  and the slider exists at 1x. The pixel checks for the line now read its own canvas and pause the
  sim while they run (the line is redrawn every frame, so a running sim moves it a few pixels
  between reading where it should be and reading the pixels). Atlantic only. Full suite: 445 checks
  (up from 437), zero regressions.

- **Added a "Jet stream line" option that works in every view, and bounded the jet axis
  (Atlantic).** The user asked for the jet's line to be viewable from any layer, not just Wind
  Shear. A checkbox in the Customization section (off by default) draws a line along the jet axis
  -- the same `jetAxisF` array the shear ribbon is centred on, so in the Wind Shear view it runs
  along the crest of the band, and in Temperature / SST Anomaly / Humidity it marks where the jet
  is that day. It is drawn on the top overlay canvas (`drawJetLine`, called from `drawGrid`), not
  into the field raster, so it doesn't depend on the selected view or on "Show sea temperature",
  and it crosses land (the jet is atmospheric). It is magenta with a dark casing rather than
  white: white would read as one more of the white 26.5 C / 20 kt threshold lines and country
  borders, and no colour scale in the app uses magenta at jet latitudes. Checked on rendered
  screenshots in all four views over the Blue Marble, NHC and Chart themes. The curve is a
  Catmull-Rom spline through the axis at every 2-degree column (the only places the axis is
  actually known; it's linear between them), so it passes through the real position at each
  column and rounds the corners instead of drawing the data grid as a polygon, and it fades out
  over the last 6 degrees of longitude at each end of the domain, like the raster does.

  Building it exposed a real flaw in the jet itself. The axis was never bounded: it is a sum of 8
  Gaussian wave modes with the real spread (sd 7.5-12 deg simulated vs 9.1-13.6 real), but the
  real axis was *traced* inside a 20-64N search band, so it can't leave that band and instead
  piles up against both edges (11-16% of real days within 4 deg of the floor at -40..0 lon, 4-7%
  within 2 deg of the ceiling). The Gaussian version has no such limit: over 480 simulated days
  (4 seeds) it reached as far as 0.7N and 85.4N, with 2.5% of days past 65N at -40 -- visible
  immediately as the line leaving the map, and worse, the ribbon (+39.5 kt at the axis) went with
  it, so on those days it sat over the equator and the Main Development Region. Nothing in the
  data supports that. The axis is now soft-limited into the same 20-64N band (`limitJetAxis`:
  tanh over the last 8 degrees, so no kink and no hard stop); afterwards the range is exactly
  20.0-64.0 and the spread is 7.4-11.4 deg. It stays a little narrower than the real one, which
  is the 8-mode truncation (73% of variance) plus the limit, not something extra. At slider 0 the
  jet is parked on its mean path (35-46N), which the limit never touches.

  Found while measuring the checks' margins over many random seeds (the page loads with a random
  seed, so any check that is statistical is a latent CI failure): "setting the slider to 0
  flattens day-to-day wind shear" compared the std of one point's 8-day series with vs. without
  the noise and came out backwards on ~8% of seeds (2 of 20, 3 of 40) -- on the previous commit
  too, so it was already there, not introduced by this change. At slider 0 the year-to-year modes
  still random-walk a little every day (sd 0.7-4.6 kt over 8 days vs 2.9-8.7 with the noise), so
  series spread is the wrong statistic. It now compares the mean absolute day-to-day change,
  pooled over 4 open-ocean points: without/with measured 0.13-0.43 over 60 distinct seeds
  (median 0.25), asserted below 0.7. The other jet checks were re-measured over 90 seeds: ribbon
  contrast 27-49 kt (threshold 20) and axis std 2.2-14.3 deg (threshold 1) are fine, but the
  contrast with the slider at 0 sat at 19.1 on one seed against a threshold of 20. A control
  (the same statistic on a copy of the build with the ribbon removed) shows why it's fragile:
  over 60 seeds with 4 longitudes it is 24-63 kt with the ribbon and -15..+24 without, so the
  two overlap -- at the mean path the background (climatology minus its own smear) is lower than
  12 degrees to either side, and the seeded anomalies move that around. Averaged over 10
  longitudes it is 25-57 vs. -14..+17, a clean gap, so that check now uses the 10 with its
  threshold (20) in the middle of the gap.

  Tests: 10 new checks (the axis never leaves 20-64N even at the slider's 3x maximum, which
  triples every excursion; the checkbox exists and starts off; nothing is drawn while it's off;
  the line is on the rendered pixels at the axis's own position in each of the 4 views, with
  "Show sea temperature" off, after the axis moves five days (drawn at the new position, gone
  from the old one), and gone again once unchecked). The pixel checks look for the line's own
  magenta on the top overlay, so they test what is actually drawn, not that a function was
  called. Atlantic only: the other 8 basins have no jet. Full suite: 437 checks (up from 427),
  zero regressions.

- **Replaced Wind Shear Phase 2's statistical noise with an explicit, continuous jet stream
  (Atlantic).** Supersedes the EOF-hybrid design described in the entry below. The user drew a
  red line over a screenshot of the previous version: a continuous ribbon of strong shear that
  meanders, dips are troughs, ENSO-influenced. Their follow-up was the physical picture: there
  is a real, always-flowing jet further north with constant strong shear that moves around -- not
  just patches that happen to be windy. A later reference image showed the same thing globally:
  coherent wavy bands over a calm background. That is structurally a different object from what
  was built (how much each point's shear varies), so it needed a different model.

  Checked against 5 years of real daily ERA5 200-850 hPa shear, Jun-Nov only, before building:
  trace the jet axis each day (the latitude of peak shear at each longitude, refined to
  sub-grid with a parabolic fit). The axis's own latitude is the coherent degree of freedom --
  its wave modes carry 73% of the axis's variance in 8 modes, with real daily persistence per
  mode (0.25-0.85), versus only 31% at k=6 (47% at k=15) for the raw shear *values*, which is
  why the first version rendered as patches: it was modeling a blurry echo of the jet's motion.
  Mean path is 35-46N; the axis wanders ~4.8 deg domain-mean (daily lag-1 autocorrelation
  0.91), dominated by wavenumbers 1 and 2 (real amplitudes 5.4 and 4.2 deg) -- the ridges and
  troughs. Real mean daily shear at the axis is ~75 kt against a climatology of ~35 kt there,
  which is the whole reason a monthly mean can't show it: averaging over days when the jet was
  elsewhere blurs a sharp core into a broad hump.

  ENSO, checked honestly: the axis's own latitude correlates only +0.12 / +0.17 / +0.01 with
  Nino 3.4 at lags 0 / 3 / 6 months -- too weak to build an "El Nino shifts the jet" effect on,
  so none was invented. ENSO reaches the jet through the channel already verified in Phase 1:
  the ribbon rides on top of the climatology + interannual + ENSO background, so El Nino's
  higher shear lifts the jet with it.

  Rendering is a ribbon drawn around the day's axis using the real axis-following cross-section
  (+39.5 kt at the axis, tapering to zero by ~10 deg). One subtlety that mattered: the monthly
  climatology already contains a blurred copy of the jet, so "climatology + a moving ribbon"
  counts the jet twice -- the simulated field would run hotter than the real climatology all
  through the jet's range, and the ribbon would have less contrast than the real data. So the
  client subtracts the jet's own average smear (max 16.5 kt, mean 6.9 kt over the band) from
  the climatology and the ribbon profile is re-derived against that de-smeared background (a
  contraction; converges in 3 passes). By construction the field's long-run average equals the
  real climatology; any single day shows a sharp ribbon over a quieter background. Trade-off,
  stated plainly: the simulated core comes out ~67 kt against ~75 kt real (measured as the
  column maximum), the price of preserving the long-run mean.

  Two things found by actually rendering it rather than trusting the numbers. First, the local
  weather texture, fit on the raw anomaly, double-counted the variance the jet already explains
  and, at full strength (~14 kt), put the ribbon only ~2.7 sigma above the clutter, so it read as
  one more blob. The texture is now fit on what the jet does *not* explain, and drawn at half
  weight (`SHEAR_TEXTURE_GAIN = 0.5`, a legibility choice rather than a fit, so the ribbon sits
  ~5 sigma above it; the slider at 2x gives the full fitted amplitude back). Second, an earlier
  attempt at spatially smoothing the noise by re-applying a kernel to its own output was
  unstable (std grew ~5x in 3 rounds) -- kept as a note in `smoothedShearInnovation()`'s comment.

  Its own `Day-to-day weather (wind shear)` slider scales how far the jet strays from its mean
  path; at 0 the jet is still there, just parked (always flowing, as the real one is).
  `window.SSTSIM.jetLat(lon)` exposes the current axis latitude for tests. Four new checks,
  thresholds set well inside what 10 random seeds measured (ribbon contrast 33-43 kt vs. a
  threshold of 20; axis std over 8 days 3.8-10.3 deg vs. 1; frozen exactly at slider 0). Atlantic
  only. Full suite: 427 checks (up from 423), zero regressions.

- **Added Wind Shear Phase 2: real day-to-day ("synoptic") noise on top of Phase 1's climatology
  + ENSO base.** The user asked for Phase 2 directly, alongside separate feedback (with a real
  GFS 300 hPa jet-stream chart attached for comparison) that the Phase 1 field didn't read as a
  prominent, definable jet -- both pointed at the same root cause: a monthly-climatology-based
  field structurally can't show a transient jet streak, the exact limitation that motivated
  Humidity's own Phase 2 before this one.

  Checked directly whether shear's real daily structure should copy Humidity's own synoptic
  design (pure per-cell AR(1) -- its real spectrum came back flat) rather than assume it would:
  it doesn't. 5 years of real daily ERA5 200-850 hPa shear, restricted to the Atlantic's own
  Jun-Nov season (not the full year -- winter jet variability is 1.5-2x stronger and would
  otherwise dominate the fit), shows a genuine EOF elbow -- mode 1 alone explains 14.3% of
  domain-wide daily variance, roughly 3-4x any other single mode, cumulative top 6 = 31.3%, top
  15 = 47.3% (diminishing fast past that: top 20 only adds 5.7% more). So this is a hybrid, not a
  copy of either existing pattern: a 15-mode EOF component for the coherent, elongated,
  jet-latitude-shift-like part, plus a per-cell AR(1) residual (same technique as Humidity's own)
  fit on the leftover variance after removing the EOF reconstruction, so the two layers' variance
  isn't double-counted. k=15 over the interannual layers' own k=6 default because the extra modes
  specifically help most where the real jet lives: at a North Atlantic storm-track point, k=15
  explains 31% of local variance vs k=6's 9%, while even k=15 only reaches 27% at the tropical
  MDR (where genesis actually happens) -- confirming the EOF modes track the real jet's own
  latitude, not the tropics, and that the residual layer still carries most of the real day-to-day
  variability at genesis-relevant latitudes (residual std there: 8.5-19.7 kt, smoothed).

  A first version, built and rendered before shipping (not just eyeballed from the numbers), hit a
  real bug worth recording: drawing each coarse (2°) cell's own daily residual shock fully
  independently -- correct by the real per-cell variance accounting, and the same simplification
  Humidity's own synoptic layer already uses -- rendered as pure static rather than a weather-like
  field. Real shear anomalies correlate +0.69 to +0.94 at 2-5° (checked directly, not assumed);
  throwing that away entirely meant upsample()'s own bicubic smoothing had nothing coherent to
  interpolate between, and its own overshoot clamp ended up active almost everywhere instead of
  rarely, since nearly every adjacent coarse pair looked like a "sharp jump" to it. Fixed at the
  source: each day's random shock is spatially smoothed before use with a separable 5-tap kernel
  (weights [1,3,6,3,1], L2-normalized), chosen because it gives an *exactly* unit-variance output
  for i.i.d. input with no empirical re-calibration needed, while reaching a correlation length
  (near-zero by ~16-20°, verified directly) matching the real measured one. (A simpler first
  attempt -- iterating a smaller exact-variance kernel on its own output -- was tried and
  rejected: confirmed empirically to be unstable, not just imprecise, with std growing to ~5x
  after 3 rounds, since the kernel's own DC gain exceeds 1 and the exact-variance argument only
  holds for a single pass on true i.i.d. input.) Re-rendered after the fix: smooth, organic,
  realistically evolving day to day, visually comparable to Humidity's own already-shipped
  synoptic view, with Phase 1's own broad climatological gradient still visible underneath.

  Its own dedicated `Day-to-day weather (wind shear)` slider (`P.shearSynoptic`), not a reuse of
  Humidity's -- the two fields' day-to-day noise is mechanistically distinct (confirmed by the
  very different real structure each one's own build script found), the same reasoning that
  already justified giving Humidity's own synoptic layer a dedicated slider instead of reusing
  `variability`/`enso`. Atlantic only, matching Phase 1's own scope; day-to-day noise for the
  other 8 basins' eventual shear rollout is a separate, later step. Full suite: 423 checks (up
  from 420), zero regressions, confirmed clean on two separate full runs.

- **Fixed the bottom-left hover readout to reflect whichever view is selected, not just SST.**
  The user flagged this directly: switching to Anomaly/Humidity/Wind Shear changed the legend
  and city tooltips but the readout card under the mouse kept reporting SST regardless -- the
  same class of per-view bug `drawLakes()` and `updateCityTip()` had already been fixed for,
  just never applied here. `updateReadout()` is now fully generic over `VIEWS[view]` (unit, key,
  keyLabel), branches on the field array per view (sst/humid/shear/diff), and reuses the
  existing `'Above '/'Below '+keyLabel` convention for every non-SST view while leaving SST's
  own "vs. normal" delta format untouched. Switching views now also refreshes the readout
  immediately on click, not just on the next mouse move.

  Two real side-fixes came out of building this, not just test convenience: `stats()` (the
  debug hook used to find a basin's warmest real point) only ever checked `outOfBasin[k]`, never
  `land[k]`, so it could return a land cell with a physically meaningless interpolated "SST" --
  confirmed concretely, Atlantic's own warmest point was landing right at the Red Sea coast. And
  a new `isLand` debug hook is now exposed on `window.SSTSIM` across all 9 basins (it already
  existed internally; it just wasn't reachable from outside).

  Verifying this safely needed its own small piece of infrastructure: a reliable way to find a
  guaranteed-real, non-land hover point for automated testing, basin-agnostic, with no hardcoded
  coordinates. Two naive approaches both failed for real geographic reasons before landing on a
  third: `stats()`'s own point can sit exactly on a basin's domain edge (confirmed at Atlantic's
  `lon1=40`), where `maxBounds` clamping means a programmatic pan doesn't land where the pixel
  math expects; and a basin's own map-center point isn't reliably open ocean either (Australian
  Region's center is the Kimberley coast, Mediterranean's is southern Italy -- both genuinely
  land, which the readout correctly reported, just not usable as a test point). The working
  approach scans a grid within the *current* viewport (`map.getBounds()`, no panning at all) for
  the first point that's simultaneously non-land and has a finite sample.

  Full suite: 420 checks (up from 392), zero regressions, confirmed clean on two separate full
  runs after a one-off unrelated South Pacific humidity-sample timing flake on an earlier run
  didn't reproduce.

- **Added a real, ENSO-modulated Wind Shear field -- Atlantic only, Phase 1.** The user asked to
  brainstorm wind shear realism tied to ENSO and the jet stream; after confirming scope (no
  separate jet-stream visual -- ENSO only needs to drive the shear *field's values* realistically,
  the same way Gulf Stream physics already drive SST with no rendered "current" layer of its
  own; and climatology+ENSO first, day-to-day synoptic noise as an explicit later follow-up,
  mirroring exactly how Humidity itself was staged), this mirrors Humidity's own architecture
  end to end: real ERA5 data, monthly climatology + EOF interannual variability + an ENSO
  regression, a new "Wind Shear" view.

  200-850 hPa deep-layer vertical wind shear is the standard NHC/SHIPS definition -- confirmed
  both `u_component_of_wind` and `v_component_of_wind` exist in the same ARCO-ERA5 archive
  Humidity already reads from, at exact native 200 hPa and 850 hPa levels (no interpolation
  needed), same chunking cost as the existing RH pull. Averaging order was a genuinely open
  question, resolved against real data rather than assumed: averaging u/v across every 6-hourly
  reading in a month *first*, then taking the magnitude of the vector difference between levels
  *once*, gives MDR peak-season values of 16-26 kt matching real published climatology; the
  alternative (deriving instantaneous shear magnitude per reading, then averaging those) ran
  systematically 5-17 kt higher everywhere sampled (Jensen's-inequality bias on a vector norm)
  and made the climatologically "low shear" hurricane season look falsely hostile -- the first
  method was used.

  `key: 20` (kt, the real NHC/SHIPS "low shear" operational threshold) was checked against the
  real 15-year (2007-2021) climatology before being hardcoded, the same discipline that caught
  Humidity's own originally-unreachable 70% threshold: across the genesis-relevant MDR/
  Caribbean/Gulf region in peak season, 44% of real (cell, month) values fall below 20 kt and
  56% above -- a real, meaningful, genuinely-crossable split, not stuck on one side. Full basin
  range (including deep-winter North Atlantic storm-track values) is 4-106.5 kt. Color polarity
  (`SHEAR_STOPS`) runs the *opposite* direction from `HUMID_STOPS`: low shear is favorable here,
  not high.

  The ENSO sign was checked at the data level (El Nino years show measurably higher MDR shear
  than La Nina years, matching the real, well-documented teleconnection -- El Nino strengthens
  upper-tropospheric westerlies over the tropical Atlantic, the shear-side analogue of this
  codebase's own already-verified "El Nino wets the Gulf, dries the MDR" humidity finding) *and*
  confirmed end to end in the live simulator: a new automated test forces a strong El Nino and a
  strong La Nina from the same seed, advances each ~190 simulated days (enough for `forceEnso`'s
  own documented 3-6 month lag terms to fully phase in), and checks that forced El Nino produces
  higher MDR shear -- a genuinely new kind of regression check this codebase didn't have before
  (Humidity's own ENSO sign was only ever confirmed visually during development).

  Phase 1 only: climatology + EOF + ENSO, no day-to-day synoptic shear layer yet (explicit
  follow-up, once this base is confirmed good -- the same order Humidity's own synoptic layer
  was added well after its climatology+ENSO base shipped), and needed zero new sliders as a
  result (reuses the existing `variability`/`enso` sliders exactly as Humidity's own combine
  pass does, for the same reason: one real ENSO event drives both fields' own interannual
  variability). Atlantic only for now, a deliberate test basin before any wider rollout. Full
  suite: 392 checks, zero regressions.

- **Rolled out the full humidity system -- climatology, ENSO fit, and the day-to-day synoptic
  noise layer -- from Atlantic-only to all 8 remaining basins** (East Pacific, West Pacific,
  North Indian Ocean, Australian Region, South-West Indian Ocean, South Pacific, South Atlantic,
  Mediterranean), after the user confirmed the Atlantic version "works PERFECTALLY" and asked
  for it everywhere. Deliberately not a copy-paste of Atlantic's own numbers: each basin got its
  own real per-basin data pull and calibration, since each has a different real cyclone season
  (hemisphere-dependent) and a different real achievable humidity range.

  Real season months used per basin (Southern Hemisphere basins cross the year boundary, so
  these are explicit month lists, not a contiguous range; North Indian Ocean is uniquely bimodal,
  skipping the monsoon-suppressed Jul-Sep): East Pacific May-Nov, West Pacific Jun-Dec, North
  Indian Ocean Apr-Jun + Oct-Dec, Australian/South-West Indian Ocean/South Pacific/South Atlantic
  Nov-Apr, Mediterranean Sep-Jan. Each basin's own "favorable for development" `key` threshold
  was computed the same way the Atlantic recalibration (below) established -- that basin's own
  real peak-season p75 RH, not an assumed constant -- confirming genuine cross-basin variation
  (West Pacific p75=68%, Mediterranean p75=49%, six others in between) that validates doing this
  per basin instead of reusing Atlantic's 58% everywhere. Each basin's `HUMID_STOPS` color-stop
  spacing was rescaled from Atlantic's own relative fractions to its own `key`, same principle as
  the original recalibration (concentrate color resolution below the threshold, where the basin
  actually spends its time) applied individually.

  Data-pull efficiency: the ARCO-ERA5 archive's chunking is time-only (touching any timestep pulls
  the whole global/all-levels chunk regardless of spatial or basin box), so pulling all 12 months
  of daily data *once* and caching it generically, then slicing to each basin's own box and season
  from the local cache afterward, cost the same single ~152s network pull as one basin would have
  -- not 8 separate large pulls. `tools/make_humidity_synoptic.py` gained a `months` CLI argument
  (comma-separated calendar months) so the same script drives every basin's own season against
  that one shared cache.

  Client-side, propagated via the same literal-substring-replacement-with-exact-match-assertion
  script pattern used for the earlier threshold generalization (18 edits per basin, each asserted
  to match exactly once before writing) -- safer for 8 repeats than 144 manual edits. Re-verified
  every anchor point against the other 8 basins' own current file content before writing the
  script rather than assuming byte-identity with Atlantic, which caught a real structural
  difference early: all 8 non-Atlantic basins already carry an extra `gapIdx` state variable (a
  gap-wind-burst index shared across their jets) that Atlantic's own hand-tuned Gulf Stream/Loop
  Current system doesn't have, so the script's patterns were written against the other 8's own
  real content, not Atlantic's. `tests/run.mjs` gained a shared `checkHumidity()` helper (view
  toggle, legend caption, each basin's own threshold wording, a real finite sample, and genuine
  day-to-day variability) called once per non-Atlantic basin; Atlantic keeps its own existing,
  more detailed humidity checks. Full suite: 386 checks, zero regressions.

- **Fixed the synoptic humidity noise snapping once a day instead of evolving continuously.**
  The previous entry's per-cell AR(1) state only got a fresh value inside the `anomDirty` block,
  which only runs once per *simulated day* -- so the field held one static value all day, then
  jumped to a new one at the boundary, a real visible stepping artifact caught by actually
  watching it run at high speed rather than assuming the per-cell math being correct meant the
  animation was too. Fixed the same way `climF`'s own monthly climatology already avoids this:
  keep two daily snapshots (today's day-boundary value and tomorrow's) and blend them by the
  fraction of the way through the current day, every render, not just when the state changes.
  Plain linear, not climF's own cubic spline across 4 months -- there's no real smooth curve to
  approximate for day-to-day noise, and two snapshots instead of four avoids a real correctness
  trap a first version of this (window-of-4) ran into: when the sim skips 2-3 days between
  renders at high speed, which it routinely does above ~16x, naively regenerating a sliding
  window from the *current* generator state can silently reuse an already-advanced value for a
  slot meant to represent an earlier day. The two-snapshot version sidesteps this instead of
  patching around it: by construction, the day asked for next is always either exactly where the
  per-cell generator already sits or strictly ahead of it, never behind, so the same closed-form
  jump used before stays correct with no window-overlap bookkeeping at all. Confirmed by sampling
  every simulated hour across a full day: smooth, gradually-changing steps (max/mean hour-to-hour
  ratio 2.5x) instead of one dominant jump, while the real day-to-day variability itself (a point
  swinging ~20-30 points over a handful of days) is unchanged. Full suite: 338 checks, zero
  regressions.

  Separately, checked with real data whether this field's own dryness could make genesis look
  impossible even when everything else is favorable: across 2017-2021 real June-November days,
  the Gulf of Mexico and Cabo Verde area clear the 58% "favorable" line about a third of the
  time, the Caribbean about 29%, and the Main Development Region itself (genuinely the driest of
  the four, consistent with known climatology) about 17% -- real, not rare-to-the-point-of-
  impossible, and there's no genesis/formation model built yet for this threshold to gate, so
  nothing downstream depends on it today. Worth keeping in mind whenever that system gets built,
  though: a hard "must clear 58%" gate would make the MDR specifically form storms the least
  often of the four, which happens to track reality (real waves routinely fail there on moisture
  alone) rather than fight it -- so the right design is probably humidity as a continuous
  probability modifier, the way real genesis-potential indices already use it, not a hard cutoff.


- **Added real day-to-day ("synoptic") weather variability to the Humidity view** -- the
  follow-up flagged in the previous recalibration entry below. A monthly climatology (even
  recalibrated to a realistic threshold) can only drift slowly with season/ENSO/interannual
  state; it can never show a transient moist pulse or dry outbreak, so a point could sit on the
  "unfavorable" side of the line for an entire simulated season even though real weather would
  have crossed it repeatedly. Checked 5 real years (2017-2021) of actual daily ERA5 data before
  building anything: an EOF approach (the same technique already used for interannual
  variability) was tried first and abandoned, because the real singular-value spectrum came back
  essentially flat (top 15 modes explain only ~22% of variance) -- unlike interannual variability
  (dominated by ENSO, a genuinely basin-wide coherent pattern), real day-to-day RH anomalies here
  decorrelate in space by only ~16-20° (~1800-2200 km, matching the real wavelength of African
  easterly waves), short relative to this basin's own size, so the field looks like many
  quasi-independent weather systems rather than a few dominant basin-wide shapes.

  Instead, every coarse grid cell gets its own independent AR(1) process at that cell's own real,
  directly-measured amplitude (std ~14-18 % RH at the Gulf/MDR/Caribbean, confirmed against the
  raw data, not assumed) and persistence (~1.7-2.1 day e-folding, matching real synoptic memory) --
  the existing bicubic `upsample()` (same closure already used for every other field) supplies
  the spatial smoothing between cells. Client-side, this needed one genuine optimization: since
  every cell evolves independently (no few-mode pattern to lean on), naively stepping all ~4300
  cells on every simulated day would cost real time on a large fast-forward jump -- fixed by using
  the exact closed-form N-step AR(1) identity (phi^nStep, the same identity `PHI_DAY`/`PHI_DAY_H`
  already use in reverse to turn a monthly phi into a daily one) to advance any number of skipped
  days in one shot, same amortized-until-needed shape the existing `anomDirty` flag already gives
  the interannual modes' own expansion step.

  New "Day-to-day weather" slider (0-3x, default 1x, Atlantic-only like the rest of humidity) --
  humidity's own slider with no SST equivalent, since real SST doesn't swing day to day the way
  real mid-level humidity does. Confirmed working end-to-end: at the default setting, the Gulf of
  Mexico swung from 37.6% to 76.6% relative humidity across just 12 simulated days, crossing the
  58% "favorable for development" line repeatedly -- real hurricane seasons have favorable windows
  that open and close, not a single static state. Setting the slider to 0 cleanly falls back to
  the smooth climatology-only behavior. Full suite: 338 checks, zero regressions.

- **Recalibrated the Humidity view's color scale and "favorable" threshold against real data, after
- **Recalibrated the Humidity view's color scale and "favorable" threshold against real data, after
  the user noticed the Gulf/MDR looked dry almost no matter what -- moderate El Niño, peak season,
  it didn't matter.** Checked all 15 real ERA5 years (2007-2021) rather than guess: peak-season
  (Aug/Sep) monthly-mean 700 hPa RH at the Gulf/MDR/Caribbean *never exceeds ~68%* in the entire
  record, typically landing 43-60%. The old `key: 70` ("genesis-favorable") threshold and
  `HUMID_STOPS`' own spacing were picked from genesis-potential-index literature describing
  *instantaneous/synoptic* conditions; this field is a monthly *climatological mean* (same
  architecture as SST), which structurally can't show a transient moist pulse -- so the threshold
  was, in effect, unreachable. Not a bug in the data, the EOF fit, or the ENSO regression (whose
  signs are physically correct: El Niño wets the Gulf, dries the MDR, matching known
  teleconnections) -- just a threshold calibrated for a different kind of quantity than the one
  being shown.

  Lowered `key` to 58% (near the real basin-wide p75 for peak season -- honestly reachable, not a
  value this field can only approach in the extreme tail) and redesigned `HUMID_STOPS` to
  concentrate color resolution in the 0-58% band where the Gulf/MDR/Caribbean actually spends its
  time, instead of spreading it evenly across 0-100% when the top third is rarely reached there.
  Relabeled the key as "favorable for development" rather than an absolute genesis cutoff, since
  that's what a climatological-mean threshold honestly represents. Because the hurricane-threshold
  generalization work (above) had already made every consumer of this -- the checkbox label, the
  contour-line math, the tooltip's above/below line, the legend's tick-bolding -- read from
  `VIEWS.humid` generically, this fix was a one-place change in `template.html` (plus matching
  test updates), not a multi-file one. Full suite: 335 checks, zero regressions.

  Confirmed visually: forcing a moderate/strong El Niño and fast-forwarding to September now shows
  a real contour line through the Gulf/Caribbean with genuine color differentiation (parts of the
  Gulf and the SAL corridor crossing into "favorable" teal, the MDR and central Caribbean staying
  below it) instead of a near-uniform dry-brown wash across the whole basin regardless of ENSO
  phase. A deeper follow-up is scoped but not started: the real *day-to-day* (synoptic-timescale)
  variability in 700 hPa RH is much larger than the modest interannual spread this climatology-
  based field can represent (real tropical waves, SAL outbreaks) -- a future pass could layer a
  faster-decorrelating noise process on top of this same backbone, calibrated against real
  6-hourly ERA5 data, so the field can genuinely flash moist or dry like actual weather rather
  than just drifting slowly with the seasons/ENSO/EOF state.


- **Generalized the hurricane-threshold line and contour-line overlay beyond SST, across all 9
  basins.** Both features -- the "26.5 °C line (hurricane/typhoon/cyclone threshold)" checkbox
  and "Isotherms every 2 °C" -- were hardcoded to the raw SST field and gated to `view === 'sst'`
  in every basin template: switching to the SST Anomaly view (all 9 basins) or Humidity (Atlantic
  only) left the checkboxes checked but silently inert, still showing SST-specific wording for a
  view that wasn't SST. Every `VIEWS[*]` entry already carried a `key` property (the legend's own
  tick-bolding already consumed it generically); this added `step`/`unit`/`keyLabel` alongside it,
  so the checkbox labels, the contour-drawing math, and the city tooltip's "Above/Below X
  threshold" line all now read from whichever view is active instead of a hardcoded `26.5`/`2`.
  The SST view's own rendering is bit-for-bit unchanged (0.5 is an exact power of two, so `v/2`
  and the old `v*0.5` agree exactly, and `key`/`step` literally equal `26.5`/`2` for that view) --
  this is a pure generalization, not a visual change to existing behavior. In the Anomaly view
  (all 9 basins) the key line now reads "0 °C line (normal)"; in Atlantic's Humidity view it reads
  "70% line (genesis-favorable humidity threshold)", and the city tooltip gained a parallel
  above/below line for humidity next to the existing SST one, extending the same threshold concept
  to a second field rather than leaving it SST-only.

  All 9 basin templates carry this logic copy-pasted (not shared via include), identical except
  for the threshold wording itself (hurricane / typhoon / cyclone, preserved exactly per basin).
  Verified byte-identical across every file via direct grep before touching anything -- zero
  structural deviations found. Implemented by hand in Atlantic first and visually verified (3
  views, both checkboxes, a city hover) before propagating; the other 8 basins were updated via a
  small script doing literal-substring replacement with an exact-one-match assertion per edit, so
  any unexpected deviation would have thrown instead of silently corrupting a file -- it didn't.
  `tests/run.mjs` gained checks (inside the shared `checkBasin()`, so they run for all 9 basins
  automatically) that switching to the Anomaly view drops the SST-specific wording and that
  toggling the key-line checkbox visibly changes the rendered overlay pixels in a non-SST view,
  not just the label text -- proving the drawing code itself generalized. Full suite: 335 checks,
  zero failures.

- **Added a real humidity system: 700 hPa relative humidity, Atlantic basin, as a third option in
  the Temperature/SST Anomaly view toggle.** The app's first non-SST field. Mid-level RH is the
  standard moisture ingredient real tropical-cyclogenesis genesis-potential indices use (dry
  mid-level air chokes a developing storm) -- the user explicitly asked for this field over
  precipitable water, accepting the higher data-fetch cost, since it's the more scientifically
  central one for a hurricane-focused app.

  Data source: NOAA's own servers are blocked by this project's build environment's network
  policy (same reason ERSST itself is pulled from a GitHub mirror, not NOAA directly) -- found
  and verified a public, unauthenticated ERA5 reanalysis archive instead (`gs://gcp-public-data-
  arco-era5` on Google Cloud Storage), confirmed reachable and working by actually opening it and
  pulling real data, not just reading its metadata. `tools/climate_lib.py`'s own `load_era5_rh700()`
  derives RH from specific humidity + temperature at the exact 700 hPa level (Bolton 1980/Tetens),
  per-timestep before any averaging (RH is nonlinear, so deriving-then-averaging is the correct
  order), regridded onto ERSST's own exact lat/lon grid (not a generic one -- ERA5's native 1.5°
  grid doesn't match ERSST's 2°, and matching them exactly is what lets every other function in
  `climate_lib.py`, and the client's own single `upsample()` closure, stay completely unchanged).

  First attempt sampled only one day a month, reasoning the cloud archive's own chunking (every
  pressure level + the whole globe bundled into each time-chunk touched) made a full multi-year
  pull impractical. Measured against the live store, the real cost was dramatically lower than
  that conservative estimate -- but the single-day proxy's own noise cost was real: it left the
  EOF decomposition's singular-value spectrum essentially flat (no elbow, several modes' own
  measured persistence coming back negative). Switched to true monthly means once the real cost
  was known, exactly fixing both -- caught by actually checking the EOF spectrum before shipping,
  not assumed. A second real failure mode, also caught by testing rather than assuming: pulling
  all 15 years of raw hourly-resolution data into memory at once OOM-killed the build in this
  container; fixed by reducing year-by-year instead (one year's own raw data stays bounded, the
  small post-reduction monthly means are all that's kept across years).

  15-year baseline (2007-2021, not SST's own 30) -- a deliberate tradeoff, not an official climate
  normal, bounded by ERSST's own time axis (which Niño 3.4 depends on) ending in 2021. `K=6` EOF
  modes (fewer than SST's 14, matched to the smaller sample count). A dense verification pass
  before any client-side work: confirmed ERA5 has real values everywhere including land (so the
  land-diffusion-fill machinery built for SST's own ocean-only data finds nothing to do and
  harmlessly no-ops); confirmed the real, dominant seasonal signal at 700 hPa/15°N is the
  ITCZ/West African Monsoon's own seasonal migration, not the Saharan Air Layer this plan
  originally expected to be the headline feature -- a real, legitimate tropical feature either
  way, just a different one than first assumed, exactly the kind of thing this project's "check
  real data before claiming a feature" discipline exists to catch. (Mode 2 of the EOF decomposition
  does show a real, SAL-corridor-localized pattern of interannual variability -- suggestive, not
  conclusively identified as SAL specifically; reported honestly rather than either overclaimed
  in the UI or dismissed.)

  Client-side: humidity gets its own independent AR(1) interannual-variability state (its own EOF
  modes, its own persistence, evolved in the same daily `stepDay()` tick as SST's), but shares the
  same simulated Niño 3.4 index SST's own ENSO response already uses -- one real physical ENSO
  event drives both fields, with each one's own real regression fit. Deliberately only
  `variability`/`enso` drive it, not `warming`/`seasonal`/`features` (meaningless, SST-specific, or
  mechanism-mismatched for a %RH field respectively -- see the humidity combine loop's own
  comment in `computeField()`). A new, additive combine pass, not interleaved into SST's own dense
  hand-tuned loop. New dry-to-moist color stops (brown/tan to green/teal), deliberately a
  different palette family from both SST's own cold-blue-to-hot-red scale and the anomaly view's
  diverging one. Two existing call sites needed a real fix for a third view to work at all, found
  by grepping every reference to the view state rather than guessing: `render()`'s own color-field
  selection (otherwise Humidity would have painted the *SST anomaly* field using the humidity
  scale) and `drawLakes()`'s view branch (otherwise every lake would have rendered as uniformly
  "driest," since its only two branches were `'sst'` and an `else` built for the anomaly view
  specifically).

  Atlantic only, this pass -- matching how every one of this project's other 9 basins got built:
  one basin, verified end to end, before any wider rollout. The other 8 are an explicit future
  pass, and should be mechanically easier to repeat (the `climate_lib.py` changes are two
  backward-compatible optional parameters plus one new function, not a fork).
- **Flipped minZoom to Leaflet's own `getBoundsZoom(bounds, inside=true)` mode on all nine basins,
  so the most-zoomed-out view can never show anything beyond a basin's own real domain, on any
  screen size or aspect ratio.** The hairline edge-interpolation fix below was real, but a user
  correctly pointed out it wasn't what they were actually seeing -- including on South Pacific,
  which that fix had already made spotless by the `sample()`-level audit used to verify it. The
  actual visible issue was the *other* half of the dynamic-minZoom work: `inside=false` (the mode
  in use since that fix landed) finds the most-zoomed-out level at which the whole *basin* still
  fits on screen, which only constrains one axis -- unless the screen's own aspect ratio happens to
  match the basin's own box shape, the other axis overshoots past the domain into bare basemap. AUS
  and SWIO had their own domains widened east earlier to chase this down basin-by-basin, which
  helped but didn't fully close it on every aspect ratio, and every other basin still had the same
  exposure. `inside=true` asks the opposite question -- the most-zoomed-out level at which the
  *view* stays entirely inside the basin -- which bounds the overshoot to zero on every axis at
  once, by construction, with no per-basin tuning. The tradeoff, accepted deliberately per explicit
  instruction: minZoom may no longer fit an entire basin's own box on screen simultaneously when its
  shape doesn't match the viewer's own screen -- the user can still pan to whatever corner is
  cropped out of the default view, just not see the whole thing at once at the lowest zoom step.
  Verified geometrically (not just by sampling): compared the actual rendered viewport bounds
  against each basin's own real domain across five aspect ratios from a 390px phone to a 3440px
  ultrawide, on all nine basins -- zero overflow anywhere beyond Leaflet's own built-in sub-pixel
  anti-jitter tolerance (it deliberately skips re-centering for a <=1px correction, baked into
  `_limitCenter` itself) -- and confirmed visually with screenshots at a 3.14:1 aspect ratio, wider
  than any real monitor, showing full-bleed SST with no basemap margin on any edge.
- **Fixed a real, if hairline, "water but no SST" bug at the extreme south/east edge of every
  basin's own grid, found while running down a user's "dead zone" report.** The specific spot the
  user flagged (open South Atlantic near Brazil, a flat satellite tile with a real 24.9C reading
  at the cursor) checked out as real data and a live-tile-provider rendering quirk, not a bug --
  confirmed directly via `sample()` at that exact coordinate and neighbors, and the user agreed no
  fix was needed there. But auditing every basin's own reachable area for the *general* class of
  bug (any point with real water and no real SST) turned up something real: `sampleField()`'s own
  bound check (`fx > NX - 1.001`) was tuned to stop the bilinear lookup from reading one cell past
  the fine grid's own last column/row -- it did that, but it also rejected the literal last column/
  row itself as a side effect (`fx === NX - 1`, the real domain edge, is not `> NX - 1.001`, so it
  passed the check, then still wasn't a valid two-point lookup), turning the outermost sliver of
  every basin's own south/east edge into a dead strip -- real water, zero SST, rendered fully
  transparent. Too thin (under 0.001 grid cells, a few tens of meters in real terms) for anyone to
  have noticed by panning, but a real gap all the same, and the same bound check (duplicated in the
  main render loop) meant it wasn't just a `sample()`-API quirk -- the rendered map itself had the
  same hairline gap. Fixed by clamping the lookup's own index to the second-to-last column/row
  instead of excluding the last one outright, on both the climatology grid (`make_climate.py` was
  never the problem -- `apply_fill()` already fills every invalid cell) and this upsampled render
  grid, across all nine basins. Verified with a dense grid-sampling audit across each basin's own
  real maxBounds: South Atlantic, Mediterranean, South Pacific, and South-West Indian Ocean (the
  four basins with no basin-boundary masking of their own) now show zero gaps, down from 49 each;
  West Pacific and the Australian Region dropped partway (their own edges partly, not fully,
  coincide with the bug); Atlantic, East Pacific, and North Indian Ocean were unaffected either way,
  since their own data domains already extend past `maxBounds` with padding to spare. The remaining
  gaps on every basin are the already-documented, deliberate different-ocean exclusions (the Pacific
  side of Panama, the Gulf of Mexico/Caribbean, the Indonesian straits, the water south of Somalia/
  the Maldives) -- real water, correctly left blank because a *different* basin models it with its
  own basin-appropriate climatology, the same "two basins can cover the same real water" precedent
  used everywhere else in this app. Filling those in from this basin's own data would reintroduce
  the exact mislabeled-ocean bug already fixed once for the Gulf of Mexico and the Gulf of Panama,
  so they stay excluded on purpose.
- **Widened AUS and SWIO's own domains east to close out the remaining letterbox the minZoom fix
  couldn't solve on its own.** The dynamic-minZoom fix stops the dead-zone from growing with
  screen size, but it can't make a basin's own box perfectly match every viewer's own aspect
  ratio -- a basin whose real shape is notably taller/narrower than a typical wide screen (16:9)
  still shows a real, if bounded, strip of bare basemap on the sides at the zoomed-out floor. AUS
  (70x48, aspect 1.46:1) and SWIO (60x44, aspect 1.36:1) were the two most visibly affected,
  reported directly by a user after the minZoom fix landed. Fixed by widening real SST coverage
  itself east on both -- AUS from 160E to 176E (into the South Pacific's own real territory: Coral
  Sea, Tasman Sea, New Caledonia, Vanuatu's own west edge, and nearly all of New Zealand), SWIO
  from 90E to 108E (into AUS's own real territory, and since SWIO has no coastline-following curve
  at all, a little of southern Sumatra/Java's own coast too) -- both landing close to a 16:9
  aspect ratio. Both extensions are deliberate basin-to-basin overlap, the same "two basins can
  legitimately cover the same real water" choice already made for the Atlantic's own reach into
  the Mediterranean and South Atlantic. Checked the new water against the raw climatology before
  shipping, same as every basin's own ocean-feature check: AUS's own East Australian Current
  extension into the Tasman Sea and SWIO's own Java upwelling both came back as smooth, already-
  resolved gradients, neither needing a synthetic correction. Regenerated both basins' full
  climatology/geo/imagery pipelines, extended AUS's own north masking curve two more anchor
  points to the new edge, added real cities in both new areas (Honiara, Port Vila, Nouméa, and
  most of New Zealand for AUS; the Cocos Islands, Christmas Island, and southern Sumatra/Java for
  SWIO), and updated both basins' own maxBounds/test suite to match.
- **Fixed the actual root cause of the zoom/dead-zone bug: `minZoom` is now computed dynamically
  from the viewer's own real screen size, on all nine basins, not a hardcoded guess.** The previous
  fix (matching `maxBounds` to the real domain) stopped a user from *panning* into a dead zone, but
  a user reported still being able to *zoom out* into one on Mediterranean -- on their own wide
  monitor, zooming all the way out showed all of Europe from Ireland to the Caspian Sea, almost
  entirely bare basemap with a small patch of real SST in the middle. Root cause: every basin's own
  `minZoom` was a fixed number tuned by testing against one assumed viewport width (1280px) --
  harmless on a basin with headroom to spare, but South Atlantic and Mediterranean both had
  `minZoom` deliberately pushed low on purpose (to show the whole basin by default), leaving no
  margin before a wider real screen busted straight through `maxBounds`. Confirmed directly: at the
  old hardcoded `minZoom`, a 2000px-wide browser window showed up to 30 degrees of pure overflow
  beyond Mediterranean's own real domain. The fix uses Leaflet's own `getBoundsZoom()`, called both
  at load and on every window resize, to find the zoom level where `maxBounds` just fills whatever
  screen the map is actually running on -- bumped up by one `zoomSnap` step past Leaflet's own
  floor-rounded result (which guarantees the bounds are never cropped at the cost of a little
  residual slack) to close that gap too. Verified across viewport widths from 360px (phone) to
  3440px (ultrawide) on all nine basins: overflow now stays near zero regardless of absolute screen
  size, dropping to just the ordinary letterbox margin any "fit to bounds" map tool shows when a
  region's own aspect ratio doesn't exactly match the viewer's screen shape (bounded by that
  mismatch alone, not by how wide the screen is) -- a fundamentally different, much smaller effect
  than the open-ended bug reported. Full 190+ check suite still green.
- **Fixed a real "pan into a dead zone" bug on South Atlantic and Mediterranean, and expanded
  Mediterranean's own domain to cover the full Black Sea and western Spain/Portugal's Algarve
  coast.** Both basins' own `maxBounds` had been set to the geo/imagery pipeline's *padded*
  context box (domain +/- a couple degrees, meant only to give land-polygon/Blue Marble clipping
  some slack past the data edge) instead of the real SST domain -- letting a user pan and zoom all
  the way into a corner with zero real SST in view, nothing but bare basemap. Every other live
  basin already matched its own `maxBounds` to the real domain exactly (AUS, SWIO, South Pacific)
  or inset slightly inside it (NIO), so this was specifically a mistake made shipping the last two
  basins, not a systemic issue -- confirmed by an empirical audit (sampling a small grid of points
  across the viewport at every basin's own maxBounds corner at maxZoom) across all nine basins
  before touching anything, which also doubled as a direct test of the actual complaint ("make
  sure zoom is constrained to the SST"). Fixed by setting both basins' `maxBounds` to their exact
  real domain, the same convention already proven correct elsewhere; added a regression check to
  each basin's own test block in `tests/run.mjs` (zoom to maxZoom at a real corner, confirm the
  view isn't entirely non-SST) so this can't silently reappear.
  - Mediterranean's own domain grew from (30N-46N, 6W-36E) to (30N-48N, 10W-42E) to cover two real
    water bodies it was leaving out: the Black Sea in full (previously cut off a few degrees short
    of its own real southern extent, Bosphorus to the north now sitting well inside the domain
    instead of right at the edge) and western Spain/Portugal's own Algarve coast on the open-
    Atlantic side of Gibraltar. Both checked directly against the raw climatology before shipping
    (same discipline as every basin's own ocean-feature check): the Black Sea is genuinely,
    smoothly ~4.5C cooler than the Aegean in the annual mean (~7-8C in winter), real and already
    resolved at this grid's own resolution, no synthetic correction needed; the Gulf of Cadiz/
    Algarve's own near-coast vs. offshore check came back flat (no concentrated upwelling core at
    this latitude/resolution), also needing nothing. Climatology/geo/imagery pipelines all
    regenerated for the new domain (padBox unchanged at 2); city list grew to include the Black
    Sea coast (Odesa, Sevastopol, Varna, Constanța, Sochi, Batumi, and others) and western Spain/
    Algarve (Cadiz, Huelva, Faro, Lagos); `minZoom` recalibrated (5.0 -> 5.1) for the new, wider
    (52 deg vs. 42 deg) domain shape.
- **South Pacific, South Atlantic, and Mediterranean basins added in one batch** -- the last three
  of the nine basins this app set out to cover, each still its own menu card and its own
  `dist/<basin>-sst-simulator.html`, not combined.
  - **South Pacific** is the first basin in this app that genuinely *crosses* the antimeridian,
    rather than just touching it the way WPAC's own east edge or EPAC's own west edge do (both
    sit exactly at 180). RSMC Nadi's own real area-of-responsibility runs 160E to 120W, which
    means real grid columns on both sides of the date line. Built a "virtual longitude" convention
    to handle it: the eastern side is expressed internally as real-longitude+360 (120W becomes
    240), so every piece of pixel/pan math that needs a single continuous increasing range --
    Leaflet's own `maxBounds`/`fitBounds`, the client-side grid-sampling math, city marker
    placement -- can just use plain arithmetic instead of wrapping logic. `tools/climate_lib.py`'s
    `extract_box`, `tools/make_climate.py`'s `fine_nx`, and `tools/make_geo.mjs`'s `clipToBox`/
    `loadLakes`/`rasterizeMask`/`build` all gained antimeridian-aware branches (a new
    `normalizeForWrap` helper in `make_geo.mjs` shifts land-polygon coordinates that would
    otherwise straddle the real ±180 seam onto the same virtual range before rasterizing). The
    client template (`src/template-spac.html`) gained a `normLon()` helper so `sample()`/`isLand()`
    take plain real longitude on either side of the date line and normalize internally -- only
    direct Leaflet calls (`map.setView`/`fitBounds`) need the virtual convention explicitly.
    Found and fixed a real `turf.bboxClip` sliver-ring bug along the way: the new two-box
    antimeridian clip produced a 10-point degenerate ring (23° wide, 0.05° tall) that slipped past
    the existing `ring.length > 8` sliver-detection cap, rasterizing as a fake land stripe across
    open ocean. Raised the cap to 30 and verified zero regression on every other basin via a clean
    A/B test (confirming a second, unrelated discrepancy was pre-existing dependency/environment
    drift, not caused by this change, before trusting the fix).
  - **South Atlantic** and **Mediterranean** are both basins with no WMO-recognized RSMC at all --
    the first (South Atlantic, real activity here is rare enough that one confirmed case,
    Hurricane Catarina in 2004, is the only one) and second (Mediterranean medicanes get tracked
    informally, not by a single designated warning center) basins in this app where that's true.
    South Atlantic's own box is just the real ocean between Brazil and southern Africa, with no
    natural authority to cite for its edges. Mediterranean's own box edges, by contrast, are all
    real named geographic boundaries of the sea itself (the Strait of Gibraltar, the Levantine
    coast, the Adriatic's own north end stopping short of the separate Black Sea, the Libyan
    coast) even without an RSMC to draw them. Both get the established "no masking, no soft fade"
    treatment already proven on SWIO/AUS.
  - **Mediterranean gets its own season shape**, the first departure from every other basin's own
    Northern- or Southern-Hemisphere-summer pattern: medicanes peak Sep-Nov and taper off through
    January, so the season highlight and the simulation's own start date both reflect Sep-Jan
    instead.
  - Ocean-feature candidates checked directly against the raw climatology for each new basin, same
    discipline as every basin before them: South Pacific's East Australian Current extension and
    SPCZ band, South Atlantic's Brazil Current, and Mediterranean's Gulf of Lion (Mistral-wind) and
    northern Adriatic (Bora-wind) winter cooling all turned out to be broad, already-resolved
    gradients rather than a sharp near-coast front the coarse grid was diluting -- no synthetic
    correction added for any of them. Only South Atlantic's Benguela Current needed nothing for a
    different reason: already a strong, resolved signal at 2 deg, nothing to add.
  - Mediterranean's own lake list includes the Dead Sea, a real exception to the generic
    latitude+area lake-temperature formula (hypersaline, 430m below sea level, true desert
    climate) -- given a named override (`LK_SPECIAL`) based on its own well-documented real
    seasonal range rather than letting the generic freshwater-lake formula understate it. Lake
    Tuz, also unusual (a shallow salt lake that partly dries up every summer), was deliberately
    left on the generic formula instead of a fabricated override, since the tm/amp/peak shape has
    no way to represent "goes dry" honestly.
  - South Atlantic's own default view mirrors the "show the whole real basin" choice SWIO/AUS made
    for their own less-visually-striking domains: rather than a close-up on the one real feature
    (Benguela), the default view shows both coastlines at once (Brazil and Africa, open ocean
    between), the honest whole picture for a basin with no cyclone activity to speak of.
    Mediterranean's own default view does the same for the opposite reason: the basin is compact
    and distinctive enough as a whole shape that there's no need to crop it down to one part.
  - All three wired into `tools/build.mjs`, `index.html`'s main menu, `tests/run.mjs` (city-marker
    and basin-sample checks, including South Pacific's own antimeridian-specific checks), and the
    GitHub Pages deploy workflow, alongside the existing six. All nine basins are now live.
- **Found and fixed a real "fading SST" bug, reported directly on SWIO, that turned out to affect
  every basin's own flat (unmasked) box edges**: a generic render-time overlay-alpha taper
  (`FADE = 24` cells = 6 deg) baked into the shared template since the original Atlantic build,
  completely separate from the actual SST *values* (which were always real and correct right to
  the edge -- `sample()` never returned NaN there, which is why the earlier padBox investigation
  missed it). The taper fades the overlay's own opacity purely by distance-from-array-edge,
  regardless of whether that edge is a confident real boundary or a "data gets less certain here"
  one, so real open-ocean color washed out toward the base map near any basin's own flat edge --
  worst on a small basin, where 6 deg is a big share of the total box. Confirmed visually on SWIO's
  own west edge (a visible gray patch over real, correctly-colored Mozambique Channel water) and,
  once the mechanism was understood, on AUS's own west edge too (same symptom, same root cause).
  Fixed by shrinking `FADE` to 2 cells (0.5 deg, just enough to avoid a single hard-pixel seam) in
  every basin whose own box edges are real boundaries rather than fade-appropriate "uncertain past
  here" ones: SWIO and AUS (both built with no masking on most edges), and NIO -- the original
  basin the "small basins don't get the soft fade" rule was stated for, where the rule had only
  ever been applied to geo padding, not this separate render-time mechanism, so the very bug the
  rule was meant to prevent was still there on its own west/east/north edges. WPAC/EPAC/Atlantic
  keep the original 6 deg default, since their own domains are large enough that it was never the
  complaint, and changing it there wasn't asked for. Verified with before/after screenshots on
  SWIO's own west and south edges (solid color now, no wash-out) and the full 181-check suite.
- **South-West Indian Ocean basin added** -- the sixth live basin, and the first with no masking
  curve anywhere in the grid at all. All four box edges turned out to be genuinely clean straight
  lines rather than needing a coastline-following cutoff: west (30E) and east (90E) are RSMC La
  Reunion's own published area-of-responsibility boundaries (east matches AUS's own west edge
  exactly, the same clean handoff already established there; west runs mostly through mainland
  Africa, which the land mask alone already handles), north (the equator) is IMD's own handoff
  line -- already resolved on NIO's own side by its own south curve near Somalia, so nothing was
  left for this basin's edge to hug -- and south (44S) runs well past where real cyclones actually
  form into real, correctly-cooling Southern Ocean water, the same call as AUS's own southern
  extension.
  - **Two real candidate features, checked against the raw climatology, two different honest
    outcomes:**
    - The **Agulhas Current** -- one of the strongest western boundary currents on Earth -- got a
      synthetic warm band, the same shape of fix as WPAC's own Kuroshio. Checked directly: the
      coast already runs a real 2-4.6C warmer than the open ocean at the same latitude, strongest
      in austral winter (Aug) not summer, the same real thermal-contrast-sharpest-in-winter pattern
      as the Gulf Stream/Kuroshio -- but a near-coast vs. a few degrees further offshore check at
      the same latitude/month came back nearly identical, meaning the concentrated core right at
      the shelf edge isn't distinguished from the smoother regional gradient. Fixed the same way as
      Kuroshio: traced the current's own real path (from the Mozambique Channel's exit off northern
      KwaZulu-Natal down to where it runs off the grid's own 30E edge, short of the real
      retroflection near the Agulhas Bank) and added a modest warm band along it, timed to the
      winter maximum already visible in the raw data.
    - The **Mozambique Channel** needed nothing. Checked directly: the channel runs only modestly
      warmer than the open ocean at the same latitude, and its own seasonal swing is comparable to
      (if anything slightly narrower than) the surrounding water -- nothing like the Persian
      Gulf/Gulf of California pattern of a diluted extreme, since it's a deep channel (average
      depth well over 1000m), structurally nothing like the shallow shelf seas that family covers.
    - A third candidate, the **Seychelles-Chagos thermocline ridge**, was ruled out before it
      became a feature: no distinguishable cold band shows up in the raw climatology's own mean
      state at 8S, since it's a real but anomaly/IOD-driven subsurface phenomenon, not a
      mean-climatology SST signal -- already covered by the existing generic ENSO/EOF anomaly
      system with no special-casing needed, the same honest call as AUS's own ENSO-cyclone
      relationship.
  - Real published monthly figures for Lake Victoria, Lake Tanganyika and Lake Malawi -- the same
    East African Rift lakes NIO's own domain reaches into on its own western edge -- reused rather
    than re-derived, since the lakes themselves haven't changed basin. The rest of this basin's own
    17-lake list (Albert, Moeru, Bangweulu, Kivu, Edward, Kyoga, Rukwa, Kariba, Cahora Bassa,
    Eyasi, Natron, Manyara) gets the generic latitude+area fallback.
  - `padBox` corrected from 3 (the "normal" treatment) to 2 (the tight, no-multi-degree-context
    treatment NIO's own build established) after a direct reminder that the "small basins don't
    get the soft-context padding that eats map space" rule applies generally, not just to the
    basin it was first stated for -- this basin's own 60x44 domain is the same order of size as
    NIO's own 70x40, so it should have gotten the same tight treatment the first time. Regenerated
    geo/imagery with the tighter box (28E-92E, 46S-2N instead of 27E-93E, 47S-3N); the only visible
    change is Lake Turkana dropping out of the lake list, since its own centroid sits just outside
    the tighter padded box -- the real SST domain itself (30E-90E, 44S-0) and every city/feature
    coordinate were already within it, so nothing else moved.
  - 34 real cities across Kenya/Tanzania's coast, Comoros, Mozambique, South Africa's Indian Ocean
    coast (stopping at Durban, right at the grid's own real 30E edge -- East London and Port
    Elizabeth sit just past it, on the Cape/Atlantic side of the handoff), Madagascar, and the
    Mascarenes/Seychelles -- Madagascar itself went from the reference screenshot's own single city
    to eight real coastal cities plus its inland capital, a direct response to the explicit
    "we could add more to Madagascar city wise" feedback.
  - Cyclone terminology throughout, and a season shaded Nov-Apr (Southern Hemisphere summer) --
    the same single continuous window as AUS, not NIO's bimodal split.
- **Australian Region basin added** -- the fifth live basin, and the first one where the two
  candidate under-resolved features were checked against the raw climatology and *neither* needed
  a synthetic correction, a genuinely different outcome from every prior basin's own hot/cold
  pocket (Gulf of California, Red Sea/Persian Gulf, Kuroshio/Vietnam) -- the honest result of the
  same verification discipline, not a shortcut:
  - The **Leeuwin Current** (the poleward-flowing warm current off Western Australia, unusual for
    running against the eastern-boundary-current norm every other basin's own coastal current
    follows) already shows up correctly in the raw 2 deg climatology -- a real warm anomaly at the
    right latitude/season, not washed out the way the Persian Gulf's own narrow shelf was.
  - The **Gulf of Carpentaria** (a shallow, semi-enclosed sea south of the Arafura Sea, structurally
    similar to the Persian Gulf/Gulf of California family that needed correction) shows a real
    seasonal swing at 2 deg resolution without dilution -- wide enough, unlike the Persian Gulf's
    much narrower shelf, that the coarse grid doesn't need help resolving it.
  - So, unlike every other basin's own template, this one ships with no synthetic ocean-feature
    code at all -- the raw climatology carries the whole basin as-is.
  - Domain: 90E-160E, 44S-4N. West and east are BOM's own standard handoffs to the neighboring
    South-West Indian Ocean (RSMC La Reunion) and South Pacific (RSMC Nadi) basins -- both hard
    straight-line edges in open water, unlike every other basin's own coastline-following boundary,
    since there's no coastline there to follow. South runs well past where real cyclones actually
    form into real, correctly-cooling subtropical water off WA/Victoria/Tasmania (the same call as
    EPAC's own Peru/Chile extension or WPAC's Sea of Okhotsk) -- deliberately stopping well short of
    New Zealand rather than reaching for it, a direct response to the reference screenshot's own
    city density including NZ. North is the real cutoff, a coastline-following curve mirroring
    WPAC's own south curve in both direction and spirit -- hugs Indonesia's islands (Sumatra, Java,
    the Nusa Tenggara chain, Sulawesi, the Maluku islands) but dips a few degrees further north into
    real basin water between them (Makassar Strait, the Banda Sea, the Arafura/Coral Seas toward
    New Guinea).
  - 56 real cities: the WA coast (Broome down to Esperance, tracing the Leeuwin Current's own
    path), the NT Top End, Queensland's Gulf-of-Carpentaria and Coral Sea coasts, the full NSW/
    Victoria/Tasmania coast (the domain reaches that far south for real, correctly-cooling water,
    same call as the domain extension itself), South Australia's Bight, southern Indonesia's Lesser
    Sunda islands, East Timor, and Papua New Guinea's Coral Sea side -- plus a handful of genuinely
    inland cities (Alice Springs, Katherine, Canberra, Toowoomba, Kalgoorlie) using the established
    `sLat`/`sLon` nearest-real-water convention.
  - Lakes: Danau Toba (Sumatra, shared with WPAC/NIO's own domains) plus 21 Australian salt/
    ephemeral lakes (Eyre, Torrens, Gairdner, Frome, and others) that hold standing water only
    rarely -- none got a `LK_SPECIAL` override, since the generic latitude-based estimate is the
    honest treatment for water that mostly isn't there, not a fabricated seasonal curve.
  - Cyclone terminology throughout, and a season shading matching BOM's own real single continuous
    Nov-Apr window (Southern Hemisphere summer) -- unlike NIO's bimodal season, this basin's
    season doesn't have a monsoon-driven mid-season gap.
- **North Indian Ocean basin added** -- the fourth live basin, and the first one deliberately built
  *tight*: the real cyclone-relevant basin (Arabian Sea + Bay of Bengal + Red Sea + Persian Gulf)
  is compact enough that the multi-degree soft-context padding the bigger basins have room for
  would just eat a large share of the visible map for no benefit, so `padBox` here is 2 rather
  than 3-6. Domain: 30E-100E, 8S-32N -- west clears the Red Sea's own two northern gulfs (Suez,
  Aqaba) with margin, east matches WPAC's own west edge exactly (a clean basin-to-basin handoff,
  no gap or overlap), north just clears the Persian Gulf's own northern tip near Kuwait, south is
  a coastline-following curve (Somalia, the Maldives, Sri Lanka) with real "wiggle room" in the
  open water between them, the same technique as WPAC's own south cutoff -- never a flat line at
  the equator.
  - **Two real hot/cold pockets, both checked against the raw climatology before adding anything
    synthetic** (same discipline as every prior basin's own features):
    - The **Persian Gulf** is one of the hottest bodies of seawater on Earth (~50m average depth,
      nearly landlocked behind the Strait of Hormuz) -- raw August climatology already reached
      32.9 C, itself real but still diluted by the coarse 2 deg grid the same way Gulf of
      California's own narrow gulf was, given real published figures for the shallow southern
      Gulf run into the mid-30s some years. Got the same shelf/edgeFade treatment as Gulf of
      California (swings harder both ways -- colder in winter too, not just hotter in summer),
      *plus* a new extension: the shelf zone also amplifies the interannual anomaly/ENSO signal,
      not just the seasonal cycle, a real, physically-motivated consequence of having so little
      thermal inertia -- this is the mechanism that actually delivers "especially hot in El Niño
      years," not a hand-tuned ENSO multiplier. Caught and fixed a second, more fundamental issue
      while verifying: the shelf boost alone was fully cancelled out by the existing
      latitude-based `seaCeil` physical ceiling (a real, basin-independent safety limit tuned for
      open-ocean physics) -- since the Gulf is a documented real *exception* to what its own
      latitude would predict, it also needed its own local ceiling raised, not just a bigger
      seasonal swing pushing against an unraised one. With both pieces in place, pure-climatology
      testing (variability/ENSO zeroed out) shows a realistic 17 C winter low and 34.8 C
      Aug/Sep peak, clearly hotter than the neighboring Gulf of Oman (32 C) at the same moment --
      matching the real, well-documented seasonal character, not just a generically "hot" gulf.
    - The **Somali upwelling ("the Great Whirl")** -- one of the strongest, fastest-developing
      coastal upwelling systems on Earth, driven by the SW monsoon's Findlater Jet reversing the
      Somali Current every June. Checked directly: the raw climatology's coldest July water sits
      in a real, offshore-shifted pool around 50-54E/6-12N (not hugging the coast -- matches how
      the real Great Whirl's cold wake is actually advected offshore), confirming the feature is
      real but under-resolved. Modeled as an open-ocean dome (like EPAC's Costa Rica Dome) rather
      than a coastal band (like WPAC's Vietnam upwelling), since that's the real shape here --
      pure climatology testing shows the dome pulling the core down to ~22.5 C in August against
      a ~27 C open-water baseline, a real ~4-5 C cold pool exactly during the SW monsoon and nowhere
      near it (near zero by pre-monsoon April), matching the season the real Great Whirl is known for.
  - Domain reaches into East Africa's Rift Valley lake region (Uganda/Kenya/Tanzania) on its own
    western/southern edge, which turned out to already have real hand-sourced monthly figures in
    `template.html`'s own `LK_SPECIAL` table (Victoria, Tanganyika, Malawi) -- present since the
    original Atlantic build, presumably for a future basin exactly like this one, now finally used.
  - 69 real cities across the Red Sea, Gulf of Aden/Horn of Africa, the Arabian Peninsula's Gulf
    of Oman/Persian Gulf coast, Iran, Pakistan, both coasts of India, Sri Lanka, the Maldives,
    Bangladesh and Myanmar -- deliberately not chasing the reference screenshot's own city density
    into Central Asia/the Caucasus, since that reach is real for a *city list* (moisture/remnant
    effects) but those cities sit far outside this basin's own tight domain box entirely (e.g.
    Tashkent's 41.3N is north of even the padded box) -- a small number of genuinely far-inland
    Indian cities (New Delhi, Ahmedabad, Bangalore, Hyderabad, Nagpur) still use the established
    `sLat`/`sLon` nearest-real-water convention, same as every other basin's own inland cities.
  - Cyclone terminology throughout (not "hurricane" or "typhoon" -- the region's own real name for
    the storm type), and a season shading that reflects the real bimodal character of this basin
    uniquely among the four live ones: Apr-Jun and Oct-Dec shaded, Jul-Sep left unshaded, since the
    SW monsoon itself sharply suppresses cyclone formation during those months -- a real, well
    documented seasonal gap the other basins' own single continuous season doesn't have.
- **A real land-polygon bloat bug found and fixed in `make_geo.mjs`, affecting EPAC and WPAC too**
  (shipped separately, ahead of this basin): `turf.bboxClip` on the whole world's landmasses (one
  merged MultiPolygon, one part per continent/island) reports parts that don't intersect the clip
  box at all as *present but with zero-point rings*, not absent -- the same failure shape already
  fixed for lakes, just never caught in the land path because an empty-ring polygon happens to
  bbox-cull to nothing before ever being drawn, invisible in the rendered map but not in the
  shipped JSON: 77-90% of every basin's encoded land polygons built by this pipeline were empty.
  Fixed at the source in `dropSliverPolygons`, with a defensive filter in `encodePolygons` too.
  Verified byte-identical mask/b0/b1/real-land-content for both EPAC and WPAC against what was
  already shipped -- pure cleanup, zero visual or functional change. Regenerating EPAC's geo data
  along the way also activated its lakes for the first time (its own `DATA.lakes` had been empty
  this whole time, the same gap WPAC's own build had already closed for itself).
- **West Pacific basin added** -- the third live basin, and the first one built directly against
  the international date line on its *east* edge (100E-180) instead of its west, which turned up
  two real, basin-independent bugs in code every basin shares:
  - `climate_lib.py`'s `extract_box` re-indexes ERSST's native 0-358 longitude to -180..180, and
    that re-index only keeps the *-180* label for the antimeridian column, never +180 -- so a box
    ending exactly at 180 came up one column short. Fixed generically (any basin's box ending at
    180 now gets that column via its -180 label, appended in place), verified against Atlantic
    and EPAC's own already-shipped climatology (byte-identical output, confirming zero regression
    on the code path they actually use).
  - `make_imagery.py`'s plain `Image.crop()` doesn't wrap at the antimeridian either -- a box
    padded even slightly past 180 came back with a black smear on the cropped edge instead of the
    real imagery wrapping around from the world map's other side. Fixed by detecting the
    wrap case and compositing the two real halves together instead of one out-of-bounds crop.
  - Domain: 100E-180 (JTWC's own western responsibility boundary on the west; the date line
    itself on the east, same kind of edge as EPAC's own west edge -- nothing meaningful exists
    past it for this basin), 6S-56N (reaching into the Sea of Okhotsk past Sakhalin on the real
    reference screenshot's own northern extent). Unlike the Atlantic's Mediterranean or EPAC's
    Gulf of Mexico, this basin's own marginal seas (Yellow Sea, Bohai, East/South China Seas, Sea
    of Japan) are all genuinely *in* the basin, so none of them are masked -- the only cutoff is
    a south curve that hugs the equator near Sumatra/Java/New Guinea's own coastlines (where
    there's a real different-ocean conflict: the Indian Ocean, the Australian region) and dips
    a few degrees further south in the open water between them (Molucca Sea, east of New Guinea)
    -- "wiggle room," a curve, not a flat line at 0, same coastline-following technique as every
    other basin's own cutoff.
  - Ocean features: verified against the real climatology *before* adding anything synthetic
    (same discipline as the Gulf of California fix) -- the raw 2 deg data already shows a real,
    resolvable Kuroshio/Oyashio thermal gradient (28.5C at 30N down to 21.2C at 42N in August,
    checked directly), and already shows the real winter deep-freeze/summer-hot swing for the
    Yellow Sea and Bohai without needing a Gulf-of-California-style correction (unlike Gulf of
    California, these are wide enough at 2 deg resolution that diffusion-fill isn't washing the
    swing out). What the raw data *doesn't* resolve: a near-coast vs. a few degrees offshore check
    at the same latitude/month came back identical, meaning the Kuroshio's own concentrated warm
    core isn't distinguished from the smoother regional gradient around it -- so that got a
    modest synthetic band along the current's real path instead, timed to the Gulf Stream's own
    well-documented winter-maximum thermal-contrast pattern. Vietnam's coast showed a real,
    already-present summer dip (SW-monsoon upwelling) the open Philippine Sea at the same
    latitude doesn't show -- sharpened, not invented, the same way EPAC's own California/Humboldt
    Currents sharpen a real-but-coarse-grid-smoothed signal.
  - Lakes are real now, for the first time in either basin: `DATA.lakes` had been an empty array
    in Atlantic and EPAC's own data this whole time, meaning `template.html`'s existing lake
    system (real hand-sourced monthly climatology for the Great Lakes and five famous tropical
    lakes, a physically-motivated lat+area fallback for any other named lake) was fully built but
    never actually fed geometry. `make_geo.mjs` now pulls real lake polygons from Natural Earth's
    own lakes layer (fetched once into `data/raw/ne_10m_lakes.geojson` -- not bundled as an npm
    package the way `world-atlas`/`apexmaps-geo` are, but the same source family they both already
    come from), filtered to named lakes above a real 300 km² area floor so it's the basin's
    significant lakes, not every farm pond Natural Earth happens to carry. WPAC picks up 33 of
    them this way (Lake Baikal down through mid-sized Chinese/Mongolian/Russian lakes, Sumatra's
    Danau Toba, the Philippines' Laguna de Bay). Two got real hand-sourced monthly figures added
    to `LK_SPECIAL` instead of the generic fallback: Lake Biwa (Japan's largest lake, real
    published monthly-mean/August-peak/February-low figures) and Lake Baikal itself (real
    published annual-mean/August-peak figures; its winter low already falls out of the existing
    freeze clamp, since five-plus months of real ice cover puts it at the same ~0 C floor).
    A first bug caught before shipping: `turf.bboxClip` on a lake entirely outside the clip box
    doesn't return a clean empty result -- it returns a non-empty-looking `MultiPolygon` full of
    *empty* rings (`[[],[]]`), which slipped past a `.coordinates.length` check and let lakes from
    clear across the globe (Ladoga, Rukwa, an Iraqi marsh) leak into an early WPAC build. Fixed
    with a cheap real-bbox overlap pre-check before ever calling `bboxClip`, plus a proper
    non-empty-ring guard as defense in depth.
  - `make_geo.mjs`'s state/province `b1` layer, previously hardcoded to Mexico+US for every
    basin, is now a per-basin list (`B1_COUNTRIES`) -- WPAC gets China, Japan, Korea, Russia and
    Indonesia's own admin-1 boundaries, all already bundled in `apexmaps-geo`, a real detail
    upgrade over EPAC's own mx/us-only gap (noted in an earlier round as a known, accepted limit;
    turns out most of what WPAC needed was already sitting in the same package).
  - 99 real cities across Russia's Far East, Japan (multiple coastlines), Korea, China, Taiwan,
    Vietnam, the Philippines, northern Borneo/Sulawesi and Guam/Saipan, matching the density of
    the Atlantic (107) and EPAC (85) lists; a handful of near-coast-but-not-on-it cities (Seoul,
    Tokyo-area Kyoto, Beijing-area Tianjin, Taipei, Hanoi, Ho Chi Minh City, Pyongyang) use the
    same `sLat`/`sLon` nearest-real-water convention the Atlantic/EPAC inland cities established.
  - "Hurricane" became "typhoon" everywhere in this basin's own copy (the threshold line, the
    tooltip, the season label) -- same 26.5 C physical threshold, same underlying simulation,
    just the region's real name for the storm type. Typhoon season is shaded Jun-Dec rather than
    Atlantic/EPAC's own May/Jun-Nov: this basin genuinely doesn't have as sharp an off-season
    (real activity runs into December most years), so the shading reflects that instead of
    reusing a narrower window that isn't actually true here.
- City tooltip now has a real visual divider (a plain `<hr>`, styled to match the card's existing
  border color) between the live climate reading and the (still-placeholder) storm-impact section
  below it, instead of relying on a blank line's whitespace alone to separate them. Applied to
  all three basins' templates for consistency.
- Storm-impact stats section is now always visible in the city tooltip, labels and all -- only
  the values are placeholders. First pass had it hidden entirely behind `if (impact)`, so a user
  saw nothing different at all; corrected direction was to build the UI's shape now (so it's
  visibly ready) and leave only the numbers for later, not hide the whole section. `updateCityTip`
  in both templates now always pushes the "Storm impact" heading and all five stat lines, each
  showing an em dash (`—`) wherever `stormImpactAt()` returns `null` (still today, always, until
  a real storm model exists -- see below). Tooltip's own reserved bottom margin grew (`H - 100` ->
  `H - 185` in both templates) to fit the now-permanently-taller content without clipping off
  screen. Verified with a real headless-browser screenshot of a hovered city tooltip showing the
  dash placeholders, plus the full test suite (56/56).
- Storm-impact stats on city markers (sustained winds, gusts, 72h rainfall, deaths, injuries,
  damage % and cost) are scaffolded but not live. This app has no storm model at all yet --
  only SST -- so there's no real genesis/track/wind field to compute any of those from, and
  making them up would break the rule the original city markers were built on (real data only,
  never a fabricated casualty/damage number). `stormImpactAt(lat, lon)` in both templates is the
  seam: it returns `null` today. When an actual storm model exists, that function's body is the
  only thing that needs to change -- return the real numbers for whichever city a storm is
  affecting, `null` everywhere else, and the UI already knows what to do with both cases. Per
  explicit direction: no real storms run until every basin's own ocean simulation is finished and
  built out, with an explicit go-ahead before starting on the storm model itself.
- Theme-swatch icon border fixed for real this time. First pass fixed the swatch *gradient*
  (see below) but left the icon's `border` on a translucent white (`rgba(255,255,255,.22)`),
  which blends with whatever gradient color sits directly under each edge -- so the border itself
  still read as shifting color (green-tinted along the top of the Satellite button, blue-tinted
  along the bottom), even though the gradient itself was already fixed. Switched the border to
  the opaque `--ice` color (`#efefef`) in both templates so it's one consistent frame color
  regardless of what's under it. Verified with a zoomed headless-browser screenshot of the
  Satellite button showing a uniform border on all four sides.
- Fixed a real glitch in the Satellite theme button: its swatch preview was a hand-built 3-stop
  gradient (green -> tan -> blue) meant to read as a land/beach/water transition, but at the
  icon's actual wide-and-short aspect ratio the tan middle band showed up as thin broken-looking
  lines near the top and bottom edges rather than a clean diagonal split. Gave the theme a real
  `land` color instead and let it fall back to the same plain 2-stop diagonal every other theme's
  swatch already uses, instead of a bespoke gradient no other button has.
- City markers, much denser: two reference screenshots set the target density (nearly every US
  state, all of Mexico, the whole Caribbean). Atlantic went from 63 to 107 (the rest of the
  Midwest/Great Lakes, more of Canada, the Mississippi-basin South, more Texas, the smaller
  Caribbean island nations, more of Venezuela/Colombia/Brazil); EPAC went from 53 to 85 (more of
  the US Southwest, a full spread of Mexican state capitals, more of Central/South America's
  Pacific side). Every new inland one got a real nearest-water sample point (same pattern as the
  first inland-cities round) and all 192 markers combined validated clean against sample() on
  the first pass this time -- the sliver-ring and mask-smoothing fixes from the last two rounds
  meant there were no new land/mask surprises left to trip over.
- City markers can be inland now, not just coastal -- Philadelphia, D.C., Atlanta, Nashville and
  five more on the Atlantic build; Mexico City, Phoenix, Guatemala City and six more on EPAC.
  An inland city isn't on the water, so it has no real SST of its own to show -- the marker sits
  at the city's real location (`lat`/`lon`), but samples an explicit nearest-water point
  (`sLat`/`sLon`) instead, and the tooltip says "Nearest coastal water" first so it's never read
  as the city's own reading. Same "don't fabricate data a feature has no simulation behind" rule
  the original city markers were built on, just applied to a case where the naive answer (sample
  the city's own coordinate) would have silently returned whatever the land-diffused SST field
  happens to compute there -- a number with no real meaning, not an error, so it would've looked
  fine until someone checked it against reality.
- UI/UX cleanup round, both basins:
  - Blue Marble is no longer a selectable map theme -- it's still there as the automatic offline
    fallback when Satellite tiles can't load (embedded, network-independent, unchanged), just
    without a button of its own now. The Satellite button stays shown as pressed while that
    fallback is active, rather than the theme row showing nothing selected, since from the
    user's side they're still "on Satellite," just rendered a different way. Losing one button
    also let the theme grid go from an awkward 3-and-2 layout to a clean 2x2 for the remaining
    four, with a short hover/press transition added so switching feels less like a hard snap.
  - City markers were showing nearly every coastal town in reach of each basin's grid (22 apiece)
    and read as clutter more than a feature; cut down to about a dozen genuinely recognizable
    cities per basin, still keeping one near each hand-tuned feature the markers were added to
    illustrate (e.g. Lima for the Humboldt Current, Salina Cruz/Corinto/Puntarenas for the three
    Tehuantepec/Papagayo/Costa-Rica-Dome features).
  - The "Ocean layers" panel is now two independently-collapsible sections, Customization and
    Experimentation, the latter starting closed by default (it's the "mess with the physics"
    half, not what most people reach for first). The view toggle's second option is relabeled
    "SST Anomaly" (was "Vs. normal"). "Set ENSO now" is a continuous slider instead of three
    preset buttons (La Nina/Neutral/El Nino), calling the same forceEnso() jump-to-state
    function underneath, just continuously instead of at three fixed points.
- New standing rule: the simulation never hard-caps a value, only soft/asymptotic-limits it --
  real extremes should be rare, not literally impossible. Applied retroactively in this round:
  the ENSO strength gauge's fill-width used to be `Math.min(50, a / 3 * 50)`, which visually
  pinned the gauge at its max the instant the Nino 3.4 index reached 3, even though the
  underlying oscillator was already soft (tanh-based, asymptotic toward 3.4) -- so a genuinely
  record-setting El Nino looked identical to a merely strong one. Switched the gauge to the same
  tanh shape (`50 * Math.tanh(a / 3)`) so it keeps filling, just more slowly, past that point.
  Also converted the last two hard `Math.min`/`Math.max` clamps in `computeField`'s combine step
  (the final temperature ceiling/floor) and the lake-climatology anomaly/ceiling clamps to the
  same soft tanh pattern already used elsewhere in the same function. Verified with a numeric
  stress test (every experiment slider pushed to its max, ENSO forced to 3.4, hundreds of
  simulated days advanced): no NaNs, output stayed in a physically sane range -- the softened
  limits compress extreme combinations instead of either flatlining (the old hard clamp) or
  blowing up (no clamp at all).
- Root-caused and fixed the three black horizontal lines: a fake landmass, roughly 110° of
  longitude wide and 0.02° of latitude tall, sitting at exactly 16.5°S in the Eastern Pacific
  mask -- rasterizing to a solid stripe of "land" clean across the open ocean there, which the
  renderer punches out of the SST layer as a hole and strokes a coastline halo around, reading
  as a thin black line (three of them, one per hole edge plus the stroke). It reproduced only
  after widening the EPAC grid, because the new box happened to trigger a real bug in
  `tools/make_geo.mjs`: `turf.bboxClip`, run against the single feature that merges *every*
  landmass on Earth into one multi-thousand-part MultiPolygon, occasionally emits a spurious
  degenerate ring as a clipping artifact -- a handful of points spanning a huge distance in one
  axis while being a hundredth of a degree wide in the other, nothing like real coastline.
  Swapping the point-in-polygon test from a hand-rolled ray cast to turf's own
  `booleanPointInPolygon` reproduced the exact same bad row byte-for-byte, which ruled out the
  rasterizer and pointed at the clipped geometry itself; diffing the clipped rings directly
  turned up the sliver. Fixed by filtering it out post-clip (few points, one dimension under
  0.1° while the other is over 3°) rather than trying to stop turf from producing it. Confirmed
  via a full land-mask row/column spike scan on both basins (EPAC now clean end to end; Atlantic
  never had one) and a fresh screenshot of the exact spot -- smooth gradient, no lines.
- Extended real SST to everywhere both maps can actually be panned to, not just wherever the
  data happened to reach, and fixed two "wrong ocean" mistakes the same audit turned up:
  - EPAC's grid only covered lat -26..44 while `maxBounds` already allowed panning a few degrees
    past that on every side (a deliberate buffer so panning doesn't feel like hitting a wall
    right at the data edge) -- so that buffer showed "outside the simulated area" instead of
    real water. Regenerated the climatology at -32..50, -180..-68 (matching the geography/
    imagery box that already covered it) so the buffer is real data too.
  - Extending east that far runs the rectangular grid past Mexico/Central America's Pacific
    coast into the Gulf of Mexico, the Caribbean and the open Atlantic -- confirmed by panning
    there: a full, real-looking SST gradient over Florida/Cuba/the Gulf Stream, a different
    ocean entirely. Added an east-side mask tracing the real Pacific coastline (with margin for
    the Gulf of California, Gulf of Panama and Gulf of Guayaquil, all real modeled features)
    the same way the Atlantic build already masks its Mediterranean cutoff. The Atlantic build
    turned out to have the mirror-image mistake already in it (its own grid reaches far enough
    west to cross the Panama/Colombia isthmus into the Pacific) -- same fix, a west-side mask
    keyed off the real Caribbean coast instead.
  - Both new mask curves were built from a handful of coastal city coordinates as anchor points;
    the first pass used too few of them and let the interpolated cutoff jump several degrees
    between adjacent points, which rendered as a visible staircase of blocky steps along the
    coast instead of a smooth line (most visible off Nicaragua/Costa Rica). Fixed by adding
    enough intermediate points to keep every step gentle (roughly 1-1.5° of cutoff movement per
    degree of latitude), the same lesson as the diffusion-fill and Catmull-Rom clamp fixes
    earlier: a hard edge shows up as a visible artifact even when the classification on each
    side of it is correct.
- City markers, both basins: reversed course on "curate them down" -- the actual ask was more
  cities, not fewer. EPAC now runs Vancouver to northern Chile plus Hawaii (44 total); Atlantic
  runs Halifax to the Caribbean/northern South America plus the Mediterranean, now that it's
  real water instead of a masked hole (54 total). Every marker was checked against the app's own
  `sample()` after all the masking changes above, since a marker placed just past a mask
  boundary reads as "no data" -- one Costa Rica city sat close enough to the Panama-corridor
  mask's least-precise stretch (right at the Panama Canal, where the Pacific and Caribbean
  coasts are only tens of km apart and no single longitude cutoff can cleanly separate them) to
  get caught by it; swapped for a nearby island city that isn't.
- Fixed a real data bug the Gulf of California extension surfaced: a visible
  hard seam cutting across the gulf, with a patch of water not warming the
  way its surroundings did. Root cause was in the *data*, not rendering --
  `tools/climate_lib.py`'s land-fill used to fill an invalid (land) coarse
  cell with a copy of the single nearest valid cell's value; for a gulf much
  narrower than the 2° ERSST grid, most of its coarse cells are themselves
  invalid, so whole neighborhoods got the *same* borrowed value with a hard,
  multi-degree step right where that copied patch met the next one. Replaced
  it with a diffusion fill (each invalid cell relaxes toward its neighbors'
  average, standard image-inpainting) so there's no single borrowed source
  and nothing to seam. Also clamped the bicubic upsampler (`template.html`
  and `template-eastpacific.html` both) to the local min/max of its own
  input points, since Catmull-Rom can independently overshoot near a sharp
  coarse-grid step -- a second, smaller source of the same kind of artifact.
  Regenerated both basins' climatology with the fix; verified by scanning
  for cell-to-cell jumps in the fixed field (down from ~2.8°C to ~1.7°C,
  and the remaining jump is a real coastal gradient, not a repeated-value
  artifact) and visually (the gulf now shows one continuous gradient from
  its mouth to its head, matching how an enclosed, shallow sea actually
  behaves). Also smoothed the Gulf of California shelf-effect's own box
  edges (feathered fade instead of an on/off lat/lon rectangle) while
  re-verifying it -- a second, smaller hard edge in the same area.
- **Eastern Pacific** is live: same architecture as Atlantic (real ERSST v5
  climatology + EOF interannual anomalies + ENSO regression, real Natural
  Earth/apexmaps-geo geography, an embedded Blue Marble crop), plus its own
  hand-tuned features — Costa Rica Dome, California Current upwelling along
  Baja/mainland Mexico, Tehuantepec/Papagayo/Panama gap-wind cooling plumes
  (with a shared stochastic burst index so the three don't move in lockstep),
  the East Pacific Warm Pool hugging southern Mexico/Central America, and
  Gulf of California's exaggerated shallow-water seasonal swing (hotter in
  summer *and* colder in winter than the open ocean, like the Red Sea/Persian
  Gulf, not just a one-sided winter dip), the California Current extended
  north past Cape Mendocino/Cape Blanco into Oregon, and a new Humboldt
  (Peru) Current feature — one of the strongest coastal upwelling systems on
  Earth, keeping Lima's coastal water down around 18–20°C in the austral
  winter/spring the way it really does, instead of the high-20s its latitude
  alone would suggest. The grid now runs 26°S–44°N, coast–180° (the
  international date line): Hawaii, the Oregon/Washington coast, and the
  Peru/Ecuador coast are all inside it, and real climatology/EOF/ENSO SST
  (plus the two currents above) runs across the *whole* grid, no sub-region
  masking anywhere. An earlier attempt masked part of a widened grid as
  "outside the simulated area" past the NHC's official 140°W Eastern Pacific
  boundary — correct on paper, but it put a hard, confusing seam in open
  water the map clearly showed, worse than just simulating real SST out to
  the edge of the grid, the same way every basin's own domain edge already
  works. The lesson held on the second, much larger extension too.
- `tools/make_imagery.py` crops/lifts-blacks/encodes the embedded Blue Marble
  imagery per basin from the same cloud-free 2048×1024 source Atlantic uses.
  (A higher-res 8192×4096 alternative was tried for sharper close-up
  quality, but it turned out to have clouds baked in — not cloud-free like
  the original — so it was reverted; if a genuinely cloud-free high-res
  source turns up, it's worth revisiting.)
- UI re-theme: replaced the blue-tinted, translucent/blurred panel look
  (across the main menu and both simulators) with a flat, fully opaque
  neutral dark theme — no backdrop blur at all now (not just less of it),
  solid panel colors, tighter shadows, no decorative gradients outside the
  map's own SST legend and the map-theme preview swatches (flat hard-edge
  color splits, not blends), and no astronomical season label on the clock.
- City markers: both basins now show small pins at real coastal cities
  (curated list per basin, hardcoded lat/lon — EPAC's now reaches Coos Bay,
  OR and Guayaquil/Lima now that the grid covers that coastline). Hovering
  one shows a tooltip with the sim's own live reading there -- current SST,
  departure from the 1991–2020 normal, and hurricane-threshold status --
  rather than fabricated stats the app has no simulation backing for (no
  damage/casualty numbers: this app doesn't model storm impacts yet, so it
  doesn't pretend to). Custom canvas-drawn markers and a tooltip styled off
  the app's own `.card` component, not copied from any reference UI.
  Toggleable from the panel.
- A real, parameterized data pipeline now exists and produced that build:
  `tools/fetch.py` (ERSST v5 + Blue Marble source, idempotent), `tools/
  climate_lib.py` + `tools/make_climate.py` (climatology/EOF/ENSO regression
  for any basin's domain box), `tools/make_geo.mjs` (land/border/mask from
  world-atlas + apexmaps-geo TopoJSON, clipped and delta-encoded to match the
  app's own format). Independently re-deriving the Atlantic climatology from
  this pipeline reproduced the shipped `data/generated/data.json` almost
  exactly, which is what validated the pipeline before EPAC was built on it.
- Main menu (`index.html`) has all 9 basins as separate cards (no combining):
  Atlantic, Eastern Pacific, Western Pacific, Northern Indian Ocean, Australian
  Region, South Pacific, South-West Indian Ocean, South Atlantic, Mediterranean.
  All nine are live (Simulation mode); Forecaster mode is still "Coming soon."
- Blue Marble imagery rebuilt to be always-on and network-independent (embedded
  crop instead of a 4-source live tile chain); Satellite theme simplified to one
  provider with an automatic fallback to Blue Marble.
- Map panning is bounded (`maxZoom`/`minZoom`/`maxBounds` tuned together) to
  where the border-line data actually has coverage — panning used to be able to
  reach Alaska/Yukon, where state/country outlines are simply missing from the
  source data, and looked broken.
- The Atlantic build's SST is masked to the actual North Atlantic basin: south
  of the equator (South Atlantic) and the Mediterranean/Black Sea now read as
  "outside the simulated area" instead of silently showing Atlantic data in
  water that belongs to a different future basin.
- Repo reconstructed as real source (`src/template.html` + build script) instead
  of hand-editing a single built HTML file.

## Next up, in order
All nine basins are now live; see **Later, not scoped yet** below for what's next
(Forecaster mode is the big one).

Each basin gets its own `dist/<basin>-sst-simulator.html`, loaded on demand from
the main menu — no global grid, keeps every basin's build lightweight
independently. `tools/build.mjs` builds every shipped basin's dist file in one
`npm run build`.

**Per-basin checklist, learned from the Atlantic build's bugs (and confirmed
again building EPAC):**
- After generating a basin's land mask (`tools/make_geo.mjs`), scan every row and column for a
  land-cell-count spike against its neighbors before trusting it. `turf.bboxClip`, run against
  the single feature that merges every landmass on Earth into one huge MultiPolygon, can emit a
  spurious sliver ring as a clipping artifact -- a handful of points spanning a huge distance in
  one axis while being a hundredth of a degree wide in the other. Rasterized, that reads as a
  fake landmass stretching clean across open ocean at one exact latitude or longitude, which the
  renderer then punches a hole for and strokes a coastline halo around -- a solid black line
  across the map. `make_geo.mjs`'s `clipToBox` now filters these out post-clip (a ring is a
  sliver if it has very few points and one dimension is under 0.1° while the other is over 3°),
  but a *new* basin's box could still trigger a shape the filter doesn't catch; the row/column
  spike scan is the fast way to check before shipping, not eyeballing a screenshot.
- A basin's rectangular domain box reaching past its own coastline into a genuinely different
  ocean (not just past its official basin boundary into more of the *same* ocean, which is fine
  -- see the note above) needs its own mask, the same technique as the Mediterranean cutoff:
  trace the real coastline with a handful of anchor points and mask everything on the wrong
  side. Build the anchor list densely enough that the interpolated cutoff moves gently (not
  more than a couple degrees of longitude per degree of latitude) between consecutive points --
  too sparse a list creates a visible staircase of blocky steps along the coast, a smaller
  version of the same "hard edge is a visible artifact" lesson as the diffusion-fill and
  Catmull-Rom clamp fixes. A narrow isthmus with both oceans close together (Panama chief among
  them) can put the two coasts close enough in longitude that no single cutoff cleanly separates
  them at that exact latitude; biasing the cutoff toward excluding a little real water there is
  the safe direction, not including a little of the wrong ocean.
- Don't assume border-line (state/country outline) data coverage matches the
  SST domain — verify it and set `maxBounds`/`minZoom` to match. Recalibrate
  `minZoom` per basin (it depends on the domain's own lon/lat span, not a
  constant): pick it so `maxBounds`' pixel width at that zoom covers a wide
  viewport (~2800px was the target for both Atlantic and EPAC), then confirm
  in a real browser across common widths.
- Check whether the domain box actually needs sub-region SST masking
  (Atlantic's Mediterranean/South Atlantic exclusion) before adding it — a
  basin's box can legitimately extend past its official boundary purely for
  visual context (EPAC's does, to show Hawaii), and masking that extra area
  is *not* automatically the right call: only add masking where the excluded
  region is otherwise indistinguishable from the basin proper (a sea like the
  Mediterranean that reads as open ocean), not where it's a real, separate,
  visibly-open body of water a user can pan into and see cut off.
- A basin whose domain is small enough not to need Atlantic's two-tier
  `landHi`/`hiBox` (10m-inside/50m-outside) coastline system can skip it
  entirely and just use the 10m data throughout, the way EPAC does — simpler
  code, one fewer thing to keep in sync between the geometry pipeline and the
  template.
- Validate the hand-tuned features numerically before shipping, not just
  visually: a small headless harness that stubs out the DOM/Leaflet/Image
  globals can `eval()` the built template's own script and call
  `window.SSTSIM.sample()`/`.advance()` across a full year to check every
  feature's seasonal cycle and magnitude against real oceanographic values.
- Don't fabricate data a feature has no simulation behind (e.g. the city
  markers show real live SST, not made-up damage/casualty numbers) — extend
  the sim before extending the UI that reports on it.
- `apexmaps-geo`'s admin-1 (state/province) data only covers specific
  countries (US + Mexico is what's wired up here) — a domain box that grows
  to cover other countries (EPAC's now reaches Ecuador, Peru, Canada) will
  still show their national borders fine (`b0`, from world-atlas, is
  global), just not state/province-level detail inside them. Not a bug, just
  a known gap; wiring up more of `apexmaps-geo`'s covered countries for `b1`
  is a reasonable follow-up if that detail turns out to matter.
- A domain box that reaches the antimeridian (±180°) needs the geography/
  imagery clipping's padding clamped there instead of padding past it (which
  wraps to the wrong side of the world) — `tools/make_geo.mjs`'s `padBox`
  handling does this now (`Math.max(-180, lon0 - padBox)`), but a basin
  whose domain crosses 180° entirely (rather than just touching it, like
  EPAC's western edge does) would need real antimeridian-aware clipping, not
  just a clamp -- not needed yet, but worth knowing before it's assumed away.
- ERSST v5's grid is 2° and offset such that only *even* degree latitudes
  (and the longitudes `tools/climate_lib.py`'s `extract_box` already expects)
  line up with real grid points — an odd-degree domain edge (lat0=-25, say)
  fails `extract_box`'s own size assertion rather than silently misaligning;
  pick even-degree domain edges.

## Later, not scoped yet
- Storms, steps 3-7 of `docs/storms-plan.md` (the areas of interest and invests of step 2 landed with milestone 11, for every basin at once): the cone, wind field 1, wind field 2 (eyewall replacement cycles, size), watches and
  warnings, city damage and statistics (the cards already show `-` for what they will hold). Step 1, the core system, runs on all nine pages (milestone 10) and each of the later steps is meant to be one shared
  part of the engine and the page layer like the outlook, not a per-basin job.
- Storms, the known misses of milestones 3 and 8 to take first (numbers in their entries): East Coast, Mexico and Canada landfalls low and Greater Antilles / Bahamas and
  South America high, a sixth of the numbered depressions never reaching storm strength (real 12 %), the heavy top of the season distribution (the highest of 240
  simulated seasons has ACE 440, the real record 250), category 5 storms 0.25 a season (0.47), post-tropical systems about 20 % too slow and too few, subtropical storms 1.1 a year
  (real 1.7), the page's pressure lows fewer and longer-lived than ERA5's, the moisture slider's effect far stronger than the warming slider's, rapid intensification that starts
  earlier in a storm's life than the real record's (and has no ocean heat content behind it: a warm eddy or the Loop Current cannot make a storm stronger than the sea-surface
  temperature says), and the clock at 32x and 64x, which still runs at about a third of its nominal speed (the up-sampling of the fine map fields, which the display needs, and the steering waves are what is left of the cost).
- Save / resume is one slot in one browser; several slots, a file to export and import, and the autosave switch and GIF export of the original plan are not built.
- Forecaster mode (hurricane hunters, model guidance, cones/AOIs) — deliberately
  not started; Simulation mode across basins comes first.
- Radar/satellite storm imagery (synthetic, generated from the sim's own storm
  state — not a real tile provider).
- ENSO's three lag terms are summed rather than weighted to total 1 (SST, humidity and shear alike;
  see the caveats in the Wind Shear rollout entry above): fitting the three lags jointly, or
  normalizing the weights, would remove an up-to-3x overstatement of a sustained event's response
  where the real response is large (the equatorial central Pacific). Deliberately not changed
  while rolling shear out, because it alters SST and humidity in all 9 basins. It is more visible now
  that "Keep ENSO at this value" can hold an event: the steering field already uses the joint fit
  (`climate_lib.enso_regression_lagsum`, which halves the sustained response), so the same call in
  `make_climate.py` / `make_humidity.py` / `make_shear.py` is the fix.
- The seasonal-amplitude fix `make_steer.py` applies to its EOF part (`eofAmp`) belongs on the SST, humidity
  and shear EOFs too: they are fitted over all months together and have the same mismatch (the real
  year-to-year spread of a month's mean varies a lot with the season).
- Steering: a winter jet (in every basin the ribbon is its cyclone-season amplitude all year; in the Atlantic the
  real DJF along-axis wind is 47 kt against 31 in JJA), the real spread of the wind along the axis (wider than
  simulated), lows as objects next to the highs, and dry air under a high feeding the humidity field. The real test of all of it, the motion of real
  best-track storms (IBTrACS through the `huracanpy` wheel: the sandbox cannot reach NHC/NCEI), was made with the storm engine in milestone 3: the page's
  steering is not the flow a storm feels, so a storm there follows the real mean drift of its kind at its place and time of year plus the anomaly of the
  page's steering from its own mean (see that entry for the numbers).
- Steering: sharp seasonal minima of the year-to-year spread come out up to 30% too variable (the 1-2-1 smoothing of `eofAmp`
  over months lifts them; the residual flow cannot go negative to compensate): less smoothing, then the slow part, the weather
  calibration and the means re-run for every basin including the Atlantic (hours of compute, 13 GB each, and the committed Atlantic
  data change). And the southern basins' jet is asymmetric across the traced axis (the real westerlies keep growing poleward) where
  the ribbon is a symmetric stripe: a profile for each side.
- Wind Shear's jet axis in the Mediterranean sits 1.15 degrees too far poleward on average
  (+3 kt field bias, the largest of the nine): compute the smear from the simulated axis
  distribution instead of the real one, which would make "the time mean equals the real
  climatology" hold exactly for the model rather than approximately.
- Thin horizontal gaps in the colour overlay near 16-17S in the Australian, South-West Indian and
  South Pacific views, present before the shear work (found while screenshotting every basin;
  SST has no NaN rows there, the overlay canvas itself is transparent on those rows).

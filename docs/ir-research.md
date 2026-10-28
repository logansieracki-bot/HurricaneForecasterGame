# Infrared research: what a real tropical cyclone looks like in the infrared

Working notes for the satellite floater (`src/storm-nest.js`, `Nest.irTb`): real GOES infrared imagery of Hurricane/Typhoon **Nolo (EP15-2026, Typhoon 28)** through its whole life, then other storms by category.
Everything below was measured on the real data, not read off a picture; the sources that are text (advisories, blogs) are named and marked as read through a web search.

## How this was done (and what could not be done)

- **Data:** GOES-18 (GOES-West) ABI **band 13, 10.3 µm "clean window"**, full disk every 10 minutes, the level-2 `CMIPF` product (brightness temperature in kelvin, 2 km at the sub-point), from the public Google Cloud bucket `gs://gcp-public-data-goes-18/ABI-L2-CMIPF/<year>/<day of year>/<hour>/` (read with `gsutil`; later GOES-16/19 buckets for Atlantic storms).
  It is the same quantity the game draws (`Nest.irTb`), so a picture of a real storm and a picture of the model are on the same scale, drawn with the same palette (`IR_STOPS`, read from `src/storm-nest.js` by the tools).
- **Tools** (`tools/ir_research/`, Python with numpy, h5py, pillow; they run from a venv, `pip install numpy h5py pillow`):
  `goes_ir.py` (fetch a frame, geostationary projection to a square km grid, north up, the palette, statistics), `series.py` (a series round a path of anchor positions), `track.py` (follows an eye forward and backward from a known position),
  `sheets.py` (contact sheets from the kept crops), `radial.py` (azimuthal mean profiles), `texture.py` (cold-top roughness), `stage_table.py` (real cold areas and radial profiles per stage), `model_ir_stats.mjs` (the same numbers from the game's nest), `library.sh` (the other storms of part 2).
  Statistics are taken in a window round the storm (stated each time); an "eye temperature" is the warmest 3x3-mean pixel of a warm spot within 120 km of the track that is at least 8 C warmer than the mean of the ring 12-45 km round it.
- **Limits:** (1) this session's network policy allows only a few hosts (GitHub, package registries and the Google Cloud public buckets): no NHC pages, no Wikipedia, no Himawari, no images from the web. The text sources below were read through a web search (summaries of the pages, with their dates and some numbers inconsistent between them: where they disagree it is said).
  (2) GOES-18 sees Nolo until about 8 October, when it nears the western limb of the disk (from about 25 N 165 E the parallax and the pixel size grow, and beyond about 150 E there is nothing); the western Pacific, the Indian Ocean and the southern hemisphere cannot be seen from the GOES satellites, so the storms of those basins are covered by text only (CIMSS blog posts) until Himawari can be reached.
  (3) A 2-km band-13 pixel is not the 2-km model's cell: a real eye of 10 km radius is five pixels.

## Nolo, stage by stage

Sources for the story (read through a web search; the NHC/CPHC advisory archive `nhc.noaa.gov/archive/2026/ep15/` and the CIMSS blog post 72370 are the primary ones): Tropical Depression Fifteen-E formed on **13 September** from Invest EP97 south-west of the tip of Baja California ("centre exposed on the north-west side of the convection because of westerly shear", T1.5, 30 kt),
was declared dissipated on 15 September (final advisory about 15.5 N 125.8 W), its remnants redeveloped about 22 September some 400 miles south-south-east of Hilo, advisories restarted, it was named **Nolo** by the Central Pacific Hurricane Center (the 19th named storm of the east/central Pacific season on one page, the 14th on another), a hurricane on 24 September ("ragged eye on satellite, primitive eyewall on microwave", 60 kt),
closest to the Big Island on 26 September as a category 2, **rapid intensification of about 24 hours from a strong category 1 to the category 4/5 boundary on 26-27 September** (CIMSS: the eye "from somewhat irregular to a perfect circle", gravity waves on the north-east side; NHC discussion 31: "symmetric central dense overcast with very cold cloud tops around a roughly 30 nmi eye", 135 kt),
peak 135 kt / 929 mb on 28 September (a Wikipedia summary calls it an annular hurricane; D-MINT briefly gave category 5), then weakening by south-westerly shear, dry mid-level air and cooler water ("remaining deep convection displaced well away from the fully exposed centre", tropical storm on 30 September, 35-45 kt),
re-strengthening from 1 October (60 kt on 2 October with an eye becoming apparent, a hurricane again 2-3 October), category 3 / 115 mph on 3-4 October ("distinct, circular, warming eye near 15 C", then "eye filled with cloud, warmed less, about 7 C" and 95-102 kt), crossing the Date Line on 4 October (Typhoon 28), 70 kt near Wake Island on 7 October (JMA), 40 mph near 31 N 145.6 E on 10 October (one tracker); the end of its life (a tropical depression / remnant low 11-14 October on one page) is not confirmed and cannot be seen from GOES-18.

| stage (UTC dates) | real infrared | numbers |
|---|---|---|
| **TD Fifteen-E, 13-15 Sep** | a faint exposed swirl of low cloud and thin cirrus on the **west** side and a **single huge convective burst 150-300 km to the east**, not on the centre; the burst is one coherent mass with a smooth top: a red body (-55 to -65 C) with grey-white cores (-70 to -80 C) and a few pink overshoots (-80 to -86 C), a green/cyan skirt, a very sharp edge facing the centre; it lasts 6-12 hours and comes back about every 12 hours (13 Sep 12-21Z, 14 Sep 03-15Z, 14 Sep 21Z-15 Sep 12Z, each time a new mass 100-300 km east or north-east of the swirl); between bursts only 20-40 km cells near the centre | window 800 x 800 km: colder than -60 C up to **91,000 km2** (one burst), colder than -70 C up to **39,000 km2**, colder than -80 C only 100-600 km2; coldest -86 C; in the gaps -60 C area falls to 18,000 km2 |
| **remnant low, 16-20 Sep** | almost nothing: a swirl of **thin cirrus fibres and low cloud**, isolated cells of 15-50 km (some with a grey core and a pink overshoot), larger bursts of 100-300 km only now and then 150-300 km from the swirl (17 Sep 12Z two 80-100 km cells with pink tops, 17 Sep 18Z a 300 km mass over the centre); on 19-20 Sep nothing deep within 200 km for 12 hours | -60 C area 0 to a few thousand km2 for most of 19-20 Sep |
| **regeneration, 21-22 Sep** | one **giant burst** (21 Sep 06Z: a 300-500 km mass, a pink core of about 100 x 70 km, grey-white interior, a red ring, orange/green/cyan fringe with **radial cirrus streaks like spokes** flaring out to the west), then green-yellow-red masses and curved bands wrapping a swirl | window 800 km: tops to -86 C |
| **tropical storm, 23-24 Sep** (35-60 kt) | a **very large sprawling canopy of coalesced cells (400-600 km)**: red body with many 20-60 km grey-white cores (-75 to -80 C) and pink flecks, **curved bands with a sharp clear inner edge and a cloud-free moat inside them**, the centre at the edge of the overcast or under it (24 Sep 06-12Z: centre on the east edge, bursts to the west) | -60 C area 100-150k km2 |
| **rapid intensification, 25-27 Sep** | a **cloud-filled eye** first (25 Sep 00Z: a white-grey blob, -10 to 0 C, in a red/orange ring), then a small ragged hole with cyan/blue (-20 to -35 C) and white rims (26 Sep), a ring of broad spiral red/black bands with big grey-white blobs (-75 to -80 C) in the outer bands, the eye only warm and round from 27 Sep 12Z | eye warm spot: 25 Sep -9 to +14 C, 26 Sep -17 to +12 C, 27 Sep 00-09Z -2 to +7 C, **27 Sep 12Z +6, 18Z +14, 21Z +15** |
| **peak, 28 Sep** (135 kt) | a **nearly perfect circular CDO**: a tiny eye (10-15 km radius) of **+15 to +21 C** (a grey spot with a thin orange/yellow/green rim), a **very broad ring colder than -70 C from 45 to about 95 km out**, red (-60 to -65 C) out to 140 km, green/yellow/cyan fringe to 200 km, white/grey cirrus spirals beyond, few outer bands, dry grey surroundings; grey-white overshooting blobs of -78 to -80 C in the ring; on 28 Sep 21Z - 29 Sep 00Z the eye fills (-5, -19 C) | eye +15 to +21 C (28 Sep 00-18Z); mean Tb by radius at 28 Sep 06Z: **5 km +18, 15 km +10, 25 km -18, 35 km -55, 45 km -70, 55-85 km -72 to -73, 115 km -68, 155 km -55, 195 km -41, 245 km -29**; -70 C area 17-42k km2 and -60 C area 60-85k km2 in 500 x 500 km; coldest -87 C |
| **shear stripping, 29 Sep - 1 Oct** | the eye clouds over (29 Sep 00Z), a huge cold blob sits south-west of the core, by 29 Sep 06Z the convection is a ragged band displaced to the north-east, **the low-level swirl is exposed as a spiral of thin cirrus and grey low cloud with no deep convection near it for 12-24 hours (30 Sep 06-18Z)**, a long plume of cirrus streams north-east; 1 Oct new convection (green/yellow -35 to -55 C masses, blue/cyan holes) on one side | -60 C area drops from 85k to 8-15k km2 in 6 hours (29 Sep 06Z), then 0 for 30 Sep; coldest -72 C then -47..-55 C |
| **re-formation, 1-4 Oct** | an exposed swirl with an east-side burst (2 Oct), then a small compact core that wraps round and gets an eye (3 Oct 12Z), a **compact CDO of 100 km** with a tiny eye by 4 Oct 12Z | eye +18 C already on 3 Oct 21Z (ring +7: only a spot) |
| **typhoon, 4-6 Oct** (100-115 kt) | a textbook symmetric typhoon: eye radius 12-15 km, grey, a thin bright rim; ring dark red/black at 20-110 km, orange/yellow/green outer bands; gradual smoothing | eye **+11 to +16 C** all the time (ring -35 to -49 C, contrast 50-61 C); -60 C area 30-86k km2, -70 C only 0-6k km2 (the ring is -60 to -70 C, not -75 to -80 C as at the peak); mean Tb by radius 5 Oct 12Z: 5 km +11, 15 km -11, 25 km -32, 45 km -56, 65-85 km -66, 125 km -61, 165 km -46, 245 km -20 |
| **weakening and the start of a transition, 6-8 Oct** | the eye clouds over (6 Oct 12Z: eye +7, 6 Oct 21Z -5), **the cloud shield is pushed to one side**: 7 Oct 00Z a big grey-white mass (-75 to -83 C, pink) south-east of the centre and a **sharp, straight dry edge** on the north-west side, 7 Oct 12Z a cloud band along a baroclinic edge with the centre at its north side and a dry slot, 7 Oct 18Z - 8 Oct a long elongated band tilted south-west to north-east (the frontal look); the centre is on the cold-cloud edge | -70 C area 24-60k km2 around 6 Oct 21Z - 7 Oct 06Z (a late burst on the cold side: tops to -83 C), then 0 |

Images (contact sheets, 2 km per pixel, the 100/200 km rings and the palette key drawn on them): `img/nolo_overview_*.jpg` (every 12 hours, 4400 km frames at 11 km per pixel: the whole life), `img/nolo_td_*.jpg` (TD, every 3 hours), `img/nolo_rem_*.jpg` and `img/nolo_ts_0923-0924.jpg` (the remnant and the tropical storm, every 6 hours),
`img/nolo_eye_*.jpg` (the eye from 25 to 29 September, 6 hours, 500 km frames), `img/nolo_shear_0929-1001.jpg`, `img/nolo_typhoon_*.jpg`.

## Part 2: the library of other storms, by category

All images below are GOES band 13 on the game's palette (same colour bar as the floater): 5600 km frames (+-2800 km) at 11 km per pixel for the "overview" sheets (rings at 500 and 1000 km), 500-2400 km frames at 2-5 km per pixel for the close-ups, a 100 km scale bar.
Storm classes are the intensity classes of the best tracks as I remember them (not re-checked against the HURDAT/NHC reports in this session, the network policy did not allow it): the infrared numbers are measured, the categories are approximate.

| storm (satellite) | dates (UTC) | what it adds | sheets (`img/`) |
|---|---|---|---|
| **Ian 2022** (GOES-16) | 24-30 Sep | a tropical storm that becomes a category 4 in the NW Caribbean (rapid intensification 26-28 Sep, an eyewall replacement 27-28 Sep), then crosses Florida: eye warm spots, cloud-filled eyes, a 108k km2 cold canopy | `ian_overview_0924-0927`, `ian_overview_0927-0930` |
| **Dorian 2019** (GOES-16) | 1-9 Sep | a category 5 that stalls over the Bahamas (eye +9 to +18 C for three days), then recurves and goes extratropical off Nova Scotia | `dorian_overview_0901-0905`, `dorian_overview_0905-0909`, `dorian_et_0905-0906` ... `dorian_et_0908-0909` (the transition, every 3 hours, centred on the cold core) |
| **Fiona 2022** (GOES-16) | 21-24 Sep | an intense hurricane (category 3-4, cloud-filled or white eye) that goes extratropical near Nova Scotia: the cleanest transition | `fiona_et_0921-0922` ... `fiona_et_0924` |
| **Lee 2023** (GOES-16) | 5-17 Sep | a very large, long-lived major hurricane: the huge pinwheel of cirrus outflow, bands, then a slow transition into a comma near the Gulf of Maine | `lee_overview_0905-0910`, `lee_overview_0910-0914`, `lee_overview_0914-0917` |
| **Beryl 2024** (GOES-16) | 29 Jun-3 Jul | a **tiny** fast-moving storm in the deep tropics: a small symmetric CDO and almost no bands | `beryl_overview_0629-0703` |
| **Otis 2023** (GOES-18) | 22-25 Oct | a tiny storm and an explosive intensification of about 24 hours: from a ragged tropical storm to a symmetric major hurricane | `otis_overview_1022-1023`, `otis_overview_1024-1025` |
| **Milton 2024** (GOES-16) | 5-10 Oct | a compact category 5 in the Gulf, an eyewall replacement, then shear and a trough pushing the cloud shield to one side before landfall | `milton_overview_1005-1007`, `milton_overview_1008-1010` |
| **Alberto 2018** (GOES-16) | 25-29 May | an early-season subtropical/hybrid storm: all convection **east** of the centre, centre on the western edge, tops only -40 to -60 C | `alberto_overview_0525-0529` |
| **Hilary 2023** (GOES-18) | 17-21 Aug | a major hurricane that decays along the Baja/California coast into a streaming post-tropical band | `hilary_overview_0817-0821` |
| **Isaias, 2026** (GOES-19), formed as Tropical Depression Nine on 7 Oct (Gulf of Mexico, 21 N 92 W) | 6-8 Oct | the **birth of a tropical depression**: many scattered 30-100 km clusters merging into one smooth CDO with a pink core; a day-to-day pulsing of the cold area | `isaias_td_1006-1007`, `isaias_td_1007`, `isaias_td_1008` |

Not in the library (cannot be seen from the GOES satellites, or no network path in this session): western Pacific typhoons, the Indian Ocean and the southern hemisphere. For those the model has to rely on the text sources (CIMSS blog, JMA/JTWC) and the physical reasoning that the structures above do not depend on the basin.

## What each category looks like (the measured picture)

**Same box as the model.** The model's nest is 512 km; the real numbers below are medians of the frames of a stage in the central 500 x 500 km box round the track centre (`tools/ir_research/stage_table.py`). Areas in thousands of km2; the mean brightness temperature (C) by distance from the centre in 10 km rings.

| real stage | frames | area colder than -40 / -60 / -70 C | mean Tb at 5 / 15 / 25 / 35 / 45 / 65 / 85 / 115 / 155 / 195 / 245 km |
|---|---|---|---|
| Nolo remnant low 16-20 Sep | 16 | 20 / 4 / 0 | 11 7 5 7 6 2 2 4 4 6 4 |
| Nolo TD 13-15 Sep (centred on the swirl; the burst is 150-300 km east) | 17 | 53 / 25 / 6 | 10 10 10 9 7 5 1 -4 -8 -9 -11 |
| Nolo TS 23-24 Sep | 7 | 139 / 65 / 32 | -55 -64 -64 -56 -50 -42 -44 -45 -42 -42 -36 |
| Nolo category 1-4, rapid intensification 25-27 Sep | 24 | 151 / 57 / 15 | -7 -30 -43 -54 -58 -62 -63 -59 -54 -44 -33 |
| Nolo peak 28 Sep (135 kt) | 8 | 136 / 70 / 25 | 12 -12 -34 -59 -69 -72 -71 -66 -56 -43 -28 |
| Nolo typhoon 4-6 Oct (100-115 kt) | 24 | 128 / 45 / 1 | 8 -12 -29 -40 -52 -62 -62 -56 -47 -37 -22 |
| Dorian category 4-5, 1-3 Sep | 24 | 164 / 70 / 6 | 5 -26 -54 -65 -67 -67 -65 -60 -52 -41 -28 |
| Ian category 3-5, 27-28 Sep | 16 | 193 / 108 / 37 | -26 -42 -60 -66 -69 -72 -70 -67 -60 -53 -45 |

How to read it: a **real hurricane's cirrus shield is a broad, slowly cooling bowl** (still -22 to -45 C 245 km from the centre); the -70 C area depends strongly on the storm (Dorian 6k, Nolo typhoon 1k, Nolo peak 25k, Ian 37k km2), so "cold tops" are not a function of intensity alone.

### 1. Invests and remnant lows
Almost empty: a swirl of thin cirrus fibres and low cloud, isolated 15-50 km cells (some with a grey core and a pink overshoot), median -60 C area 4k km2 in the central 500 km, many frames with none; a 100-300 km mass appears now and then, 150-300 km from the swirl, and fades in a few hours. The low-level centre is visible as a spiral of low cloud for days.

### 2. Tropical depressions and weak tropical storms: the "bursts"
- **A burst is one coherent mesoscale mass**: 100-300 km across (500-600 km when it reaches full size), a smooth red body (-55 to -65 C), a few grey/white cores of 20-60 km (-70 to -80 C) and rare pink overshoots (-80 to -86 C), a green-cyan skirt, **radial cirrus streaks like spokes** flaring out from it, and a **sharp, straight edge on the side facing the swirl**.
- **It is displaced from the centre**: 150-300 km east/downshear of an exposed low-level swirl (Nolo TD, Alberto); the swirl itself has thin cirrus or nothing deep over it (mean Tb at the centre +10 C for the Nolo TD, with the cold area beyond 100 km).
- **It pulses**: the TD of 13-15 Sep had three bursts in 36 hours (starts 13 Sep 12Z, 14 Sep 03Z, 14 Sep 21Z; each 9-15 hours). Between bursts only 20-40 km cells close to the centre and the -60 C area falls from 91k to 18k km2 (800 km box).
- **Diurnal modulation (suggestive, few days of data)**: median -60 C area in the 500 km box by local solar time, Nolo 13-24 Sep: 04-08 h 46k km2, 16-20 h 28k, 00-04 h 20k, 12-16 h 10k, 08-12 h 6k, 20-24 h 4k; Isaias 6-8 Oct: 00-08 h 100-108k, 08-12 h 83k, 12-20 h 33-41k, 20-24 h 65k. Both peak in the **late night to early morning** and have their minimum in the **afternoon to evening**, by a factor of 2-3 (the known diurnal pulse of the tropical cyclone's cold cloud). The model has no diurnal cycle at all.
- **A tropical storm** (35-60 kt, Nolo 23-24 Sep): a **very large, sprawling canopy (400-600 km) of coalesced cells**: a red body with many 20-60 km grey-white cores and pink flecks, **curved bands with a sharp clear inner edge and a cloud-free moat inside**, the centre at the edge of the overcast or under it; -60 C area 65k and -70 C area 32k km2 in the central 500 km, mean Tb at 245 km still -36 C. **Not** a field of small cells: the cells are inside one mass.
- **A depression being born** (Isaias, 6-8 Oct): scattered 30-100 km clusters first (many with pink/grey cores), then a merger into one smooth blob over the centre with a pink core (the centre colder than its ring), spiral bands within 12 hours; the -60 C area pulses 18k-181k km2 (1000 km box) with the day.
- **A subtropical/hybrid storm** (Alberto 2018): all the deep convection 150-300 km east, the centre exposed at its western edge, tops only -40 to -60 C.

### 3. Hurricanes: eyes and rapid intensification
- **Eye temperature is not the sea temperature.** The warmest 3x3-mean pixel of the eye (km-scale mean) is **+11 to +21 C** in the strongest hurricanes while the sea was 26-28 C: Nolo 28 Sep (135 kt) +15 to +21, typhoon 4-6 Oct (100-115 kt) +11 to +16, Dorian category 4-5 +9 to +18 (median +16), Ian **-19 to +2 (cloud-filled) in most frames** during its intensification and eyewall replacement (26 Sep 18Z -19, 27 Sep 00Z -17, 27 Sep 06Z +2, 27 Sep 12Z -14, 28 Sep 00Z +2, 28 Sep 12Z -14), against +18 on 27 Sep 18Z and +15 on 28 Sep 18Z. (Ian's +17 to +21 on 25-26 Sep 12Z are a hole in thin cloud, the ring only -4 to -11 C: not an eye yet.)
- **Before the hurricane stage the eye is cloud-filled or cool**: Nolo 25 Sep -9 to +14, 26 Sep -17 to +12, 27 Sep 00-09Z -2 to +7; the warm round eye appears only at 27 Sep 12Z-21Z (+6, +14, +15), a day into the rapid intensification.
- **The eye's edge is a ramp, not a step.** Mean Tb by radius at the Nolo peak: 5 km +18, 15 km +10, 25 km -18, 35 km -55, 45 km -70 (the eyewall tilts outwards, so the cold top lies 20 km outside the eye edge).
- **Cold tops smooth with intensity**: peak and typhoon eyewalls are smooth, a hot tower is a rare grey/white bump on a red ring.
- **Compact storms** (Otis, Beryl): a CDO only 100-200 km across, with an eye of a few pixels; their intensification is 12-24 hours (the model must allow a storm to grow from a ragged cloud-filled eye to a clear one within a day).
- **Big storms** (Lee): the wind field and the cirrus grow with time, spiral arcs of anticyclonic outflow cirrus reach 1000 km and more (a long tail curving to the south-east on 12-14 Sep), and rings of bands with moats; the inner core is a small fraction of the picture.
- **Shear (Nolo 29 Sep - 1 Oct, Milton before landfall)**: the -60 C area falls from 85k to 8-15k km2 in 6 hours, the eye clouds over, the shield is displaced downshear with a sharp dry edge on the other side, then an exposed swirl of thin cirrus with no deep convection for 12-24 hours; Milton kept a compact core with its shield displaced to one side.

### 4. Texture of the cold tops
Measured as the standard deviation of Tb minus its 5x5-pixel (10 km) mean, over the pixels where that mean is colder than -50 C, and as the median gradient per 2 km pixel (`tools/ir_research/texture.py`):

| | high-pass std (C) | gradient (C per 2 km) |
|---|---|---|
| Nolo TD 13-15 Sep | 0.9-1.1 | 0.6-0.9 |
| Nolo TS 23-24 Sep | 1.2 (1.0-1.4) | 1.05 |
| Nolo hurricane 25-28 Sep | 0.6 (0.4-1.1) | 0.6 |
| Nolo typhoon 4-6 Oct | 0.45 (0.3-0.6) | 0.5 |
| Ian 27-28 Sep | 0.65 (0.5-0.9) | 0.6 |
| **the model's four test storms** (nest, 28-110 kt) | **2.5-3.0** | **2.1-2.7** |

The model's cold tops are **3-5 times too rough**: real cold tops are smooth, with the roughness rising only in weak systems (cells) and falling with intensity.

### 5. The extratropical transition, in the real data
Window 2400 x 2400 km (5 km pixels) round the cold core; areas in thousands of km2 (the shield is the part colder than -20 C, the convection the part colder than -60 C):

| time (UTC) | position | Tb min | < -20 C | < -40 C | < -60 C | < -70 C |
|---|---|---|---|---|---|---|
| **Fiona** 21 Sep 00Z | 23.7 N 70.0 W | -85 | 1082 | 507 | 203 | 87 |
| 22 Sep 00Z | 25.7 N 71.9 W | -80 | 1103 | 625 | 170 | 41 |
| 22 Sep 12Z | 28.4 N 71.1 W | -80 | 789 | 481 | 90 | 14 |
| 23 Sep 00Z | 29.7 N 68.5 W | -76 | 1203 | 594 | 88 | 12 |
| 23 Sep 12Z | 34.6 N 64.2 W | -71 | 1355 | 781 | 48 | 0 |
| 23 Sep 21Z | 39.8 N 59.5 W | -67 | 1646 | 651 | 20 | 0 |
| 24 Sep 03Z | 45.4 N 59.3 W | -60 | 1638 | 426 | 0 | 0 |
| 24 Sep 12Z | 55.2 N 64.2 W | -53 | 1614 | 145 | 0 | 0 |
| **Dorian** 5 Sep 12Z | 30.9 N 79.0 W | -74 | 870 | 283 | 54 | 11 |
| 6 Sep 00Z | 33.6 N 78.5 W | -68 | 891 | 182 | 3 | 0 |
| 6 Sep 06Z | 33.8 N 76.5 W | -64 | 759 | 114 | 1 | 0 |
| 6 Sep 18Z | 36.4 N 74.2 W | -71 | 1066 | 497 | 27 | 0 |
| 7 Sep 00Z | 37.4 N 71.7 W | -77 | 1211 | 421 | 22 | 2 |
| 7 Sep 12Z | 41.3 N 66.7 W | -69 | 1527 | 475 | 8 | 0 |
| 7 Sep 21Z | 45.5 N 63.2 W | -65 | 1923 | 710 | 1 | 0 |
| 8 Sep 06Z | 53.6 N 58.5 W | -51 | 1577 | 434 | 0 | 0 |
| 8 Sep 12Z | 56.2 N 49.5 W | -48 | 1429 | 12 | 0 | 0 |

- **The cold convection decays and the cloud shield grows**: the -60 C area goes 200k -> 90k -> 50k -> 0 km2 over about 3 days (Fiona) or 54k -> 3k in 12 hours then a partial return (Dorian, 27k on 6 Sep 18Z, while it passed over the warm Gulf Stream and the trough's lift arrived); the -20 C area goes 0.8-1.1M -> 1.6-1.9M km2 (about doubles, **cloud shield 2-2.5 times larger**), the -40 C area stays at 0.4-0.8M and only falls once the storm is north of 50 N; the coldest tops go -85 -> -75 -> -67 -> -53 C.
- **Look of it (Fiona, Dorian, Lee sheets)**: (1) at 25-30 N the eye is still there but the shield is already pulled into a **comma with its head to the north-north-east** and a clear dry arc to the south-west; the cold core and ring stay -70 to -80 C; ripples (gravity waves) and parallel streaks on the shield. (2) At 33-40 N **the eye sits on the south-west tip of the shield**, the ring is open on that side and the dry air wraps in; tops -50 to -65 C only in a **blob on the north-east**; the eye is lost within 12-24 hours (a swirl of low cloud, then nothing). (3) At 40-55 N a **frontal comma**: head to the north/north-west, long tail spiralling south and east, **a clear dry slot** just south-west of the centre, the centre at the head-tail junction, tops -30 to -50 C (green and blue, not red) in fine **parallel streaks**, with the narrow cyan-to-green bands of the fronts and one or two cold spots (Dorian 6 Sep 18Z - 7 Sep 00Z: -77 C, a final burst). (4) At the end Lee (16-17 Sep) shows a comma with an **almost empty centre** and the cold cloud only on the north and east sides (-30 to -45 C).
- **Nolo's own end** (6-8 Oct, 25-30 N at 160-175 E, seen by GOES-18 to the western edge): the same: the eye clouds over, the shield goes to one side with a sharp straight dry edge on the north-west, then a long tilted band with a dry slot.
- **A landfall decay (Hilary, 19-21 Aug)**: a major hurricane weakens to a post-tropical band of cloud along the coast.

## What this says about the model: measured differences

Model numbers from `tools/ir_research/model_ir_stats.mjs`: a fresh nest spun up 4 hours on a forced storm (the engine-like wind profile of the given maximum wind and radius of maximum wind, sea 28.8 C, no shear) and read through `Nest.irTb`; **two seeds (7 and 11)** per case, the range of the two is given, the 512 km box.
The cases (maximum wind kt / radius of maximum wind km): invest 18/60, TD 28/50, TS 45/40, category 1 75/28, major 110/18. (The run-to-run spread is large: the same TD has its deep convection at the centre in one seed and a clear centre in the other.)

| | area colder than -40 / -60 / -70 C (k km2) | Tb at 5 / 15 / 25 / 35 / 45 / 65 / 85 / 115 / 155 / 195 / 245 km (range over the two seeds) | warmest pixel within 24 km |
|---|---|---|---|
| model invest 18 kt | 60-79 / 8-24 / 1-3 | -65..15, -63..12, -62..4, -59..-8, -55..-21, -50..-33, -47..-41, -36..-35, -31..-20, -17..-13, -1..9 | -53..22 |
| model TD 28 kt | 80-100 / 15-34 / 2-7 | -68..3, -68..-1, -69..-11, -67..-24, -65..-34, -59..-40, -53..-47, -42..-39, -38..-27, -26..-20, -14..1 | -60..12 |
| model TS 45 kt | 107-122 / 28-48 / 7-24 | -77..-29, -78..-35, -78..-40, -77..-48, -75..-52, -71..-54, -67..-58, -55, -46..-42, -34..-29, -13..-3 | -72..-14 |
| model category 1 75 kt | 77-79 / 18 / 1-2 | 29, -10..7, -65..-60, -68, -65..-64, -59..-58, -54..-53, -47..-43, -35..-32, -25..-20, -4..3 | **29** (sea) |
| model major 110 kt | 51-58 / 22-24 / 6-10 | -2..13, -74..-67, -78..-74, -74..-69, -70..-68, -65..-63, -57..-55, -45..-42, -23..-19, -6..0, 11..17 | 19..22 |
| **real**, see the table above | 53-193 / 4-108 / 0-37 | | +9..+21 (hurricane) |

Texture of the model's cold tops (the earlier four-storm dump `modeldump/`, std of Tb minus its 10 km mean): **2.5-3.0 C**, gradient 2.1-2.7 C per 2 km pixel.

1. **Weak systems are the wrong shape.** In both seeds the model's invest and TD have a **cold ring or core round the centre** (the mean at 85 km is -47 to -53 C, and in one seed the centre itself is -65 to -69 C); the real TD's centre is clear (+10 C out to 65 km, mean at 85 km +1 C) and the deep cloud is one burst 150-300 km to one side. The model's -40 C area for the TD (80-100k km2) is 1.5-2 times the real TD's (53k) and the invest's (60-79k) is 3-4 times the real remnant's (20k). The model has no episodes (no burst every 12 hours with clear intervals), no diurnal cycle, and the swirl is never "naked".
2. **Tropical storms and hurricanes are too small in the cold shield.** The model's -60 C area is 28-48k km2 (TS), 18k (category 1), 22-24k (major) against real 65k, 57k and 70-108k: **1.4-4 times too small**, and -70 C is 7-24k, 1-2k and 6-10k against real 32k, 15k and 25-37k (up to 10 times); the -40 C area of the major hurricane is 51-58k against 128-193k. The cirrus shield **ends at about 150 km**: Tb at 155 km is -19 to -23 C (major) against -47 to -60 C real, at 195 km -6 to 0 against -37 to -53 C, at 245 km +11 to +17 against -22 to -45 C: the model's shield is 100 km too small in radius, and the nest edge (256 km) is warm where the real picture is still deep cloud.
3. **The eye and the inner ramp.** The model's warmest pixel in the eye is the sea temperature (29 C) for the category 1 storm in both seeds, 19-22 C for the major one (when it is not cloud-filled); the real eye is at most +21 C (Nolo peak), +11 to +16 C typically at category 3-4, and often cloud-filled (-20 to +10) while intensifying. The model's coldest ring (-74 to -78 C) sits right at the eyewall (15-35 km for an 18 km radius of maximum wind); in the real storm the coldest tops (below -70 C) lie **45-95 km from the centre for an eye of 10-15 km radius**, reached by a ramp from the eye (+18 at 5 km, -18 at 25 km, -55 at 35 km, -70 at 45 km at the Nolo peak): the eyewall tilts outwards with height and the 10.3 um pixel sees its sloping side.
4. **Texture**: 3-5 times too rough (std 2.5-3 C against 0.45-1.25 C).
5. **No transition shield**: at an extratropical stage the model has no growing -20 C shield, no comma with a dry slot and a lost eye, no change of the cold-cloud type (cells -> streaks), and the tops stay as cold as in the tropics.
6. **No shear stripping to an exposed swirl** with a 12-24 hour gap in deep convection and a re-formation burst.

## Proposed model changes (to be built after the user confirms), with numbers to build the tests on

1. **Burst model for invests, depressions and weak storms** (below about 50 kt, plus any storm under strong shear or dry air): the cold cloud is made by an explicit lifecycle of a few **coherent masses** (growth 3-6 h, mature 6-12 h, decay 3-6 h) of 100-300 km (up to 500-600 km at maturity), **centred 150-300 km downshear** of the swirl, a smooth red body with a few 20-60 km grey cores and pink dots, a green-cyan skirt and spokes of cirrus, a sharp edge facing the centre; the swirl itself gets thin cirrus and low cloud; a new mass every 12-24 hours with a **diurnal modulation** (peak 04-08 local solar time, minimum 12-20 h, factor 2-3).
   Targets in the central 512 km box: TD median -60 C area ~25k km2 (range 3-90k), -40 C ~50k, mean Tb at the centre ring above +5 C; remnant low: -60 C area ~4k.
2. **Eye**: a warm spot of at most **+21 C** (sea 28 C: the eye Tb about the sea minus 7 to minus 15 C), +11 to +16 C typically at category 3-4, **cloud-filled (-20 to +10 C)** during rapid intensification and eyewall replacement (about half the frames of a category 2-3), and a **smooth ramp** eye -> eyewall: 5 km +18, 15 km +10, 25 km -18, 35 km -55, 45 km -70 for a 15-20 km eye.
3. **Cold-top size**: bring the -60 C area to 45-70k (hurricane) and -70 C to 15-35k km2 (major hurricane) in the 512 km box (now 18-24k and 1-10k), with a mean Tb at 155 km of -45 to -60 C, at 195 km of -35 to -50 C and at 245 km of -22 to -45 C (now -19 to -23, -6 to 0 and +11 to +17 for the major hurricane): the cirrus shield must reach the edge of the nest and past it (extend the cirrus canopy, or paint the outer 100 km analytically).
4. **Texture**: smooth the cold tops (the 10 km high-pass std 0.5-0.7 C in hurricanes, 1.0-1.3 C in weak storms), and put the hot-tower variability in a few 20-40 km bumps rather than cell-scale mottling.
5. **Extratropical transition** (driven by the engine's existing `eta`): shield growth (-20 C area x2), cold-core convection decay (-60 C area to zero over 2-3 days, coldest tops -85 -> -50 C), the comma (head north-north-east, tail south-east), a dry slot south-west of the centre, the eye lost in 12-24 hours, fine parallel streaks instead of cells, a final burst possible over the Gulf Stream.
6. **Shear stripping**: a sudden (6 h) loss of the -60 C area (85k -> 10k km2), the eye clouded over, an exposed swirl for 12-24 hours, then a re-formation burst on one side.
7. **Compact and large storms**: the CDO and shield radius should follow the engine's size (Otis/Beryl 100-200 km, Lee 500+ km with outflow arcs).

## What I could not do

- **No images from the web.** The network policy of this session reaches only GitHub, the package registries and the Google Cloud public buckets: no NHC, CIMSS, NOAA/NESDIS, Wikipedia, Himawari, EUMETSAT or Meteosat. I could not look at "videos" from the web; what is here is the real GOES brightness-temperature data itself, drawn on the game's palette, and measured.
- **Only GOES storms.** GOES-16/18/19 cover the Atlantic and the eastern/central Pacific. Western Pacific typhoons, the Indian Ocean and the southern hemisphere would need Himawari (NOAA's open-data Himawari-9 bucket on AWS, as far as I remember `noaa-himawari9`), Meteosat or GK-2A: hosts the policy does not allow here. If you allow such a host, a small-eye category 5 typhoon, a recurving extratropical storm and a few north/south Indian Ocean storms could be added with the same tools (the Himawari projection and file layout need a small new reader).
- **Approximate classes.** The category of every non-Nolo storm above is from memory, and the Nolo advisories and discussions were read through a web search summary only (not the advisory pages), so the Nolo wind speeds are approximate; the infrared numbers are measured.
- **Eye finder limits.** The eye numbers are the warmest 3x3 mean of a warm spot in a cold canopy; the tracker lost the centre for Nolo after 29 Sep (to 3 Oct), for Fiona and for the first Dorian run: those parts of the series are not used.

Reproducing: `tools/ir_research/` (`goes_ir.py`, `series.py`, `track.py`, `sheets.py`, `radial.py`, `texture.py`, `stage_table.py`, `model_ir_stats.mjs`, `library.sh`): Python 3 with `numpy h5py pillow` and `gsutil`; each full-disk frame is about 20 MB and takes about 4 s to fetch.

## Part 3: the model's picture after the revamp (milestone 20)

What the notes above asked for was done in `src/storm-nest.js` (the picture and the convection that feeds it), all seven proposals, and measured the same way as the real storms (`tools/ir_research/model_lab.mjs` runs a forced storm through the nest and prints the cold areas, the radial mean Tb, the eye, the texture; `scenarios.json` holds the eight storms; `modelsheet.py` draws them on the same palette and rings as the real sheets).

| piece | what it does now (names are the `PAR` keys) |
|---|---|
| **1. bursts** | a weak storm (a disturbance, a depression, a weak tropical storm: vortex winds under 20 to 32 m/s, `bWk`) rains in a few coherent masses (`burstBirth`, `burstStep`): a field 70 to 200 km in radius (`bR`) that the swirl carries and shears, feeding the convection in place of the background ascent (`bAmp`; the scattered showers are `bQ` = 22 % of the usual outside them), one about every half day (`bT`, a gap of at least `bGap`), growing 2 to 4 hours, mature 2 to 5 and decaying 2 to 5, **born mostly in the local night** (`bDiu`: the factor `HFNest.diurnal(local hour)` is 1.4 at 01:30, 0.6 at 13:30; the page passes the UTC hour, `forcing.utc`), **downshear of a bare swirl**: 30 km out in calm air, 150 to 300 km in 14 kt of shear and never closer than 1.1 radii in a sheared storm (`bD`); the vortex's own convergence gives up half of itself to them (`bVk`); the air decides (the birth rate and the supply follow the moisture and the sea); a hurricane and a post-tropical system make none |
| **2. the eye** | `irEye`: a warm floor below the sea (`eyeD`: sea minus 14 C, minus 10 C in a strong storm: +15 to +19 C under a sea of 28.8), a cloud that fills it (`eyeFill`: a state with a memory of hours and a random walk, raised by a rapid intensification, an eyewall replacement (`forcing.erc`), shear, a new eye, and by stripping), cool and white (+4 to -18 C) when filled, and a **smooth ramp** to the eyewall top over 0.5 to 2.1 radii of maximum wind (`eyeW`); no eye window in a transition or a stripped storm |
| **3. the canopy** | the cirrus' outflow, life and sinking follow the storm's strength and size (`canopyNumbers`: `ciOutK`, `ciLife`, `ciSink`, `ciLo`, `ciSz`), the blurred rain is a source of cirrus too (`ciSrc`: an anvil is wider than its cell), the eye is kept clear of it, and a strong storm is found with its canopy already spread (`initCanopy`: the plateau of the real majors); the tops are capped near -86 C (`capZ`) |
| **4. smooth tops** | the deep cloud is averaged over 4 cells with only the cold pixels counting (`irSmooth`: `irBlur`, `irSm`), what texture is left is 0.5 C (1.3 C in a weak storm: `irTx`) |
| **5. a transition** | no eye (the window shuts between a transition of 0.05 and 0.35), no bursts, the vortex's eye clearing gives way to it, the dry slot is clear of convection of every kind, and the shield is made of **fine streaks along the flow aloft** (`irStreak`, 1.5 C) |
| **6. shear stripping** | the strip state (`strip`: shear in kt, raised by up to 15 % where the air is dry (under 60 % humidity), over 22 to 36 kt, 2.5 h to strip, 6 h to recover) takes the eyewall's supply and the vortex's stratiform deck to 3 %, clouds the eye over (the fill), shortens the cirrus' life, stops the efficiency from making up for it and holds the next burst for 12 hours after the stripping begins (`bHold`): the swirl is bare |
| **7. size** | the canopy's speed (size^0.8), life (size^0.7), reach (`ciLo` x size) and the initial plateau (size) follow the engine's storm size (`sz`, from 0.4 to 1.8 of 150 km) |

### Before and after, in the model's 512 km box (the real storms from part 2)

Median over the frames of each lab storm (`tools/ir_research/scenarios.json`, one seed; a weak storm's median includes its quiet hours); area colder than -40 / -60 / -70 C in thousands of km2, then the mean Tb at 5 / 15 / 25 / 35 / 45 / 65 / 85 / 115 / 155 / 195 / 245 km.

| | A40 / A60 / A70 | mean Tb by radius | robust texture |
|---|---|---|---|
| **real major, Nolo peak** | 136 / 70 / 25 | 12 -12 -34 -59 -69 -72 -71 -66 -56 -43 -28 | 0.31 |
| model major 125 kt, before | 79 / 29 / 8 | 2 -73 -74 -71 -67 -66 -59 -53 -38 -21 11 | (2 to 3 in std) |
| **model major 125 kt, after** | **134 / 72 / 15** | **14 2 -44 -69 -71 -70 -67 -66 -57 -43 -20** | 0.25 |
| **real rapid intensification, Nolo 25-27 Sep** | 151 / 57 / 15 | -7 -30 -43 -54 -58 -62 -63 -59 -54 -44 -33 | 0.56 |
| model RI 65 to 130 kt, before | 83 / 26 / 6 | 25 -40 -73 -69 -65 -63 -59 -52 -39 -25 8 | |
| **model RI, after** | **135 / 66 / 7** | **4 -7 -27 -53 -66 -66 -66 -63 -55 -43 -17** | 0.25 |
| **real TD, Nolo 13-15 Sep** (swirl-centred) | 53 / 25 / 6 | 10 10 10 9 7 5 1 -4 -8 -9 -11 | 0.42-0.66 |
| model TD 28 kt, before | 102 / 17 / 2 | -46 -47 -47 -48 -47 -43 -36 -35 -39 -28 -15 | |
| **model TD, after** (over the 48 h the area colder than -40 C is 26 to 69, -60 C 1 to 26 and -70 C 0 to 9: a burst is partly outside the 512 km box) | **51 / 14 / 2** | **-25 -30 -30 -32 -34 -28 -18 -20 -9 -5 3** | 0.34 |
| **real TS, Nolo 23-24 Sep** | 139 / 65 / 32 | -55 -64 -64 -56 -50 -42 -44 -45 -42 -42 -36 | 0.75 |
| model TS 45 kt, before | 135 / 35 / 6 | -66 -68 -68 -68 -65 -61 -58 -54 -51 -40 -18 | |
| **model TS, after** | **102 / 19 / 1** (up to 135 / 58 / 12 in a burst) | **-64 -64 -63 -62 -62 -58 -55 -47 -43 -29 -1** | 0.31 |

The eye of the model's major hurricane is +14 to +17 C (the real strong storms: +11 to +21), +4 to -18 C while it fills (real: -17 to +14 while intensifying), the ramp is 17, 11, -18, -51, -68, -70 C by 10 km ring (real peak: 18, 10, -18, -55, -70, -72); the coldest top is -75 to -78 C (real: -72 to -86 C). The robust texture of the hurricanes is 0.25 (real 0.27 to 0.56), of the weak storms 0.31 to 0.34 (real 0.42 to 0.75). A stripped hurricane (`model_strip.jpg`) loses its eye (clouded over), then its eyewall, then its canopy: the area colder than -60 C goes 45k -> 38k -> 24k -> 7k -> 0 km2 in three-hour steps (the shear rising from 2.5 to 16 m/s) and stays at nothing for the next 15 hours, the area colder than -40 C from 106k to 0-21k, as Nolo's did on 29 Sep - 1 Oct; the transition (`model_et.jpg`: 28 N to 50 N over 72 hours) goes from a symmetric hurricane to a comma with a clear dry slot, no eye after 36 hours, tops -44 to -58 C in fine streaks and no area colder than -60 C from the 24th hour.

Pictures of the model (the same palette, 2 km pixels, the 100 and 200 km rings; `model_large.jpg` at 4 km): `img/model_td.jpg` (48 hours of a sheared depression: a burst 100 to 250 km downshear of a bare swirl, a new one every 6 to 24 hours), `model_ts.jpg`, `model_ri.jpg` (the eye filled for a day, clear from the 30th hour), `model_major.jpg`, `model_strip.jpg`, `model_et.jpg`, `model_compact.jpg`, `model_large.jpg`.

### What is still different (honestly)

- **A tropical storm's coldest cloud**: the model's TS has -60 C areas of 19k km2 on median (65k real) and almost no -70 C (1k against 32k); its bursts at their peak (58k and 12k) are in the range, but a real TS had one almost continuous mass. The eyewall-rain ordering check (a hurricane's eyewall rains more than a tropical storm's) holds the burst's supply back.
- **The tropopause at 25 to 30 N**: the poleward warming of the tops starts at 18 N, so a hurricane recurving at 28 N has -63 to -68 C tops (A60 4 to 17k km2 in the lab's transition) where Fiona and Dorian still had -70 to -85 C (50 to 200k km2); the transition's later stages (35 to 50 N) are right (-46 to -55 C).
- **Compact storms** (Otis, Beryl): the canopy shrinks with the size, but there are no real numbers in the library for them (only the sheets): the compact lab storm has a -60 C area of 5k km2 and a cirrus fringe to 250 km that the real ones may not have.
- **No real western Pacific, Indian Ocean or southern-hemisphere sheets** to check the structure against (see part 2: GOES only).
- The bursts' timing is statistical (a diurnal factor on the birth, not a model of the pulse); the diurnal result in part 2 came from two storms over a few days.

## Part 4: the picture the player gets (milestone 21)

Parts 1 to 3 were measured in a lab: a forced storm run through the nest, in an air I chose for it, and the picture compared with Nolo's. The player's screenshots of the live page (a Hanna, a depression, a Leah, a Cat 2 that went blank in hostile air, an Eristina and a Douglas, a Fausto "worse than the things before") showed that the page's picture was not the lab's: the cores were too warm and too smooth (purple rare, where a real depression's bursts have pink flecks), the picture was full of dots, lace, cotton balls, bars with squared ends and cut-offs ("how you implement them isn't realistic or accurate"), a weak storm in very warm, moist air did not make the one big continuous mass of convection that two real images show, the infrared eye was larger than the radar's, eyes formed at category 1, and a category 2 in hostile air lost all its cloud. This part looks at the picture **as the page makes it**, measures it the way the real storms were measured, and says what was wrong and why the lab had missed it.

### How the page was looked at

- `tools/ir_research/page_lab.mjs` runs the **built page** in headless Chromium (Playwright): a storm placed and held at a stage, or the page's own season run until a storm of the wanted wind appears and followed through its life, the floater opened in the satellite view as a player would, and at chosen hours the nest's brightness-temperature field (`SSTSIM.floaterTb()`, a new call: the field the canvas is made from), what the nest was told of the air (the page's shear, the humidity, the sea, the scale, the strip state, the bursts) and, with `--shots`, a screenshot. `pagesheet.py` and `gamesheet.py` draw those fields on the real sheets' palette and rings, any of them beside any other.
- `tools/ir_research/irstats.mjs` is the one set of **picture numbers**, measured the same way on a real frame, a lab frame, the page's frame and in the tests (the central 500 km): the areas colder than -20 / -40 / -60 / -65 / -70 / -75 / -80 / -85 C, the coldest top, the cells colder than -80 C (the overshooting tops: how many, how big), the **speckle index** (the share of the cloud-edge pixels, from -45 to -10 C, that differ from the mean of their eight neighbours by over 5 C: the dots), the clouds smaller than 100 km2 (count and share), the temperature step across the -20 C rim, the robust spread of the cold tops by temperature class, the roughness of the thin cirrus, and the share of the area colder than -40 C that the largest connected piece holds (one continuous mass or scattered cells).
- `tools/ir_research/targets.json` holds those numbers for the **real storms**, per stage (the median and the 10th and 90th percentile over the frames of a stage; `export_crops.py` writes the cached GOES crops as raw fields and `targets.mjs` measures them): hurricanes at their peak (60 frames), rapid intensification (19), a depression's bursts (38), the one big mass of a sprawling tropical storm (13), remnant lows (20), the typhoon (35), a storm in shear (9) and transitions (40). The tests read it, so a number is a range of the real record and not one of mine.
- `tools/ir_research/lab_stats.mjs` and `lab_par.mjs` give the same numbers for the lab (`model_lab.mjs` now sets the air round the storm every hour, as the page does).

### What was wrong (found with those numbers, not by looking)

| what the player saw | what made it | the number |
|---|---|---|
| **a depression "stripped" within a day, a hurricane that loses its eye and its cold cloud, a Cat 2 gone blank in hostile air** | the nest's stripping was tuned on a storm-centred shear (22 to 36 kt tears a storm apart) and was **fed the page's**, a 2-degree point value of a daily mean, about **four times** what a storm feels (`shearK` 4 in the Atlantic); the humidity runs low too (the engine's own gate for a moist air starts near 50 %). Everyday weather in the page was a stripping shear. The browser checks had needed a test hook (`floaterEnv`) to give a hurricane a healthy air: that was the symptom, and it was not followed up. | the page's shear at the storms below was 36 to 73 kt where a storm feels 9 to 18, and the weak storms were never in the regime the lab had tuned |
| **cores too warm, purple rare** | a cell's top came from its rain rate alone (46 mm/h for red, 107 for black, about 200 for pink: rates a 2-km model rarely makes), the soft cap stopped at -86 C, and the smoothing of the cold tops (a box over 4 cells, only the cold pixels counting) averaged away what overshoot there was; nothing tied a top to the updraft | no area colder than -60 C in a depression (the real big mass: 54 thousand km2), under 1 thousand km2 colder than -70 C in a hurricane (the real: 11) |
| **dots, lace, cotton balls** | a noise on the **thin cirrus' opacity at the scale of a cell** (the temperature jumps by several degrees round the -20 C colour step, where grey turns cyan), scattered low cloud that reached 5.5 km (white) instead of 1 to 3 km (grey), convective background cells of one to three pixels, and nothing that kept an object of a few pixels from standing alone | speckle up to 12 % (the real storms 0.1 to 1.3 %), up to 69 clouds under 100 km2 (6 to 32), a rim of up to 2.8 C a km (0.9 to 1.9), thin cirrus up to 2.3 C rough (0.6 to 1.2) |
| **bars with squared ends** | in the old picture the cirrus was carried at 0.8 of the (four times too large) shear with no diffusion, so every cell left a straight plume; in the new one, **found by looking at the first frame in the page lab and dumping the nest's own fields**: the view switch resamples the nest from the radar's box to the larger one (`rescale`), and the new outer ring was filled with the old edge's values, so a cell of rain at the old edge became a bar of rain and of cirrus 100 km long and the noise and the water rows of one value (`game_first_frame.jpg`) | three bars at each side of the first frame of a depression; the nest's first step already had them |
| **a weak storm is bursts, never the one big mass** | the weak-storm regime had only the burst population (a few blobs of 100 to 300 km that live 6 to 14 hours) | there was no regime for the mass |
| **eyes at category 1, the infrared eye larger than the radar's** | the eye window opened from 43 to 70 kt of the nest's wind (the radar's rule), and the picture's eye was a smooth ramp over two radii of maximum wind where the radar's is a hole with a ragged edge | the infrared eye larger than the radar's |
| **the cloud cut at the picture's edge** | a 512 km box for a satellite picture | |

*Why the lab missed it:* it fed the nest the numbers it was made for. Nothing compared the page's picture with the real one, and the browser checks that opened a floater in the page's own air had to be given a different air to pass. The picture of the page is now measured against `targets.json` in the tests (`tests/nest_ir.mjs` for the model, one check per page for the floater) and `page_lab.mjs` is how a change is looked at before it is pushed.

### What changed (the names are the `PAR` keys of `src/storm-nest.js`)

| piece | what it does now |
|---|---|
| **1. the air in storm-centred units** | `forcingOf` gives the nest the page's shear over `shearK` (the page's own kept as `shearPage`), the humidity on a real mid-level scale (`rhReal`: 0.4 plus 0.38 times its place between the engine's humidity gate shifted down 20 points and that width plus 25, from 0.2 to 0.9; the page's own % as `rhPage`) and the sea on the scale the nest's thresholds were made for (`sstC`: the engine's gate of a good sea is 2 degrees colder than a real 26.5 to 28 C). The radar takes the same air, so in the page's typical shear it is a little more symmetric than it was (a lopsided radar storm now needs a real storm-centred shear) |
| **2. one continuous mass** | a weak storm (a system whose winds are over 10.5 to 13.5 m/s, `mVn`; a wave has none) in very warm (26.8 to 28.2 C on the lifted scale, `mFav`), moist (0.48 to 0.66) and quiet (storm-centred shear 8 to 17 kt) air relaxes (`mTau`: 6 h up, 3 h down) to one big mass of convection (`massFav`, `massShape`, `massStep`, `ma`): a flat-topped ellipse (`exp(-q^4)`: a short, sharp rim) of radius 0.45 times the storm's size plus 35 km, 80 to 300 km (`mass`), 0.85 to 1.1 radii to one side of the swirl, downshear when there is shear (`mOff`), fed 2.2 times the background ascent (`mAmp`) with a cloud 1.8 km deeper than its rain (`mDepth`) and the lumps of the cell noise (`mNz`); as the vortex strengthens (21 to 28 m/s) it moves in and **wraps** round the core, and a hurricane (24 to 33 m/s) has none: its convection is the eyewall and the bands. In poor air the bursts of milestone 20 are what a weak storm has |
| **3. cold cores and overshooting tops** | the top of a cell follows its updraft as well as its rain (the mass's cloud is deeper than its rain) and the soft cap is lower (`capZ`: rain alone stops near -78 C), the pink is the **hot towers** (`towerStep`, `irTowers`, `tw`): a population of cores of 12 to 30 km that live 1 to 3 hours, drift with the flow, are born where the blurred rain is heavy and more often where convection is disorganized (a mass, bursts, a rapid intensification, an eyewall replacement), add 0.4 to 1.1 km to the cloud top (never more than 1.0 km above the tropopause) with a texture of their own, and a quarter of them hold an overshoot of 5 km radius that adds 1.1 km more; the picture's own random numbers (`rng3`), so the radar does not depend on the picture |
| **4. no dots, no lace** | the thin cirrus' opacity has a texture of clusters only (`ciTex` [0, 0.2]) and **fibres along the upper flow** (`irFib`: a noise the cirrus' own flow carries, 2.2 C, half-length 12 km, an hour or two of life), the scattered low cloud is a low cloud's top, grey (`lc`: 0.8 to 3.2 km), the cold tops have lumps of 15 to 20 km and little grain (`irTx` [3.4, 1.5], on the tops colder than -35 C), and the picture is averaged over the 3 x 3 cells round each pixel of the cloud's fringe (-6 to -50 C, only the cloud's own cells counting) as the sensor's spread would (`irSensor`, `irPsf` 0.6 at 2-km cells, less at larger ones) |
| **5. slow, partial stripping** | the strip state (`strip`) follows the storm-centred shear (14 to 28 kt, up to 15 % more in dry air) that a strong storm feels 1.8 times weaker (`strip[2]`), takes **8 hours** to build and to relax (`stripTau`), and removes only part of a strong storm's convection (`stripLoss`: 97 % of a weak storm's, 37 % of a strong one's: a hurricane in hostile air keeps an eye and a ragged core for a day); a strong storm makes its own weather (`pull`: it makes up for 0.7 of a poor sea and dry air at 40 m/s) |
| **6. the eye** | it starts to form at the engine's 82 kt and is complete at 105 (`eyeOn`: nothing at category 1, a ragged hint at category 2, a clear eye from category 3), has the radar's radius and ragged edge with a thin ring (`eyeEdge`) and its cirrus is cleared |
| **7. a larger area** | the satellite view shows at least 768 km of 3-km cells (`irMinScale` 1.5; `scaleOf` takes a least scale, `flRescale` switches mid-hour and keeps the hour's clock), and the **new ring of a larger box is left clean** (`fillRing`: no rain, bursts, mass or turbulence, the air's water, fresh noise, the canopy a strong storm has, a weak storm none) |

### Before and after, in the page

The same storms in the page's own air (`tools/ir_research/page_lab.mjs`, the page of the old commit against this one; medians over the frames, 3-km cells; the frames run from 24 to 36 hours), and the real storms' medians from `targets.json`:

| case | picture | wind of the frames (kt) | cold area -40 / -60 / -70 C (thousand km2) | coldest top (C) | speckle | small objects | rim (C/km) | cirrus roughness (C) |
|---|---|---|---|---|---|---|---|---|
| an Atlantic depression that becomes a tropical storm (25 to 43 kt) | before | 25, 28, 32, 33, 36, 43 | 2 / 0 / 0.0 | -49 | 9.1 % | 22 | 2.8 | 1.72 |
|  | after | 25, 28, 31, 33, 36, 43 | 51 / 17 / 2.7 | -69 | 0.9 % | 3 | 1.2 | 0.67 |
| an Atlantic weak tropical storm (27 to 35 kt) | before | 31, 35, 31, 30, 29, 27 | 12 / 0 / 0.0 | -53 | 2.7 % | 16 | 2.2 | 0.81 |
|  | after | 31, 35, 31, 30, 28, 27 | 15 / 0 / 0.0 | -56 | 0.6 % | 2 | 1.3 | 0.78 |
| a depression held at 30 kt in the page's dry, sheared air at 14 N 45 W | before | 27, 27, 25 | 0 / 0 / 0.0 | -4 | 0.0 % | 0 | - | - |
|  | after | 27, 27, 25 | 4 / 0 / 0.0 | -49 | 1.4 % | 0 | 1.5 | 1.02 |
| an East Pacific hurricane that weakens (74 to 55 kt) | before | 74, 74, 69, 67, 64, 55 | 66 / 7 / 0.0 | -67 | 8.0 % | 69 | 2.7 | 2.06 |
|  | after | 72, 71, 66, 64, 63, 52 | 115 / 22 / 1.2 | -72 | 0.4 % | 3 | 0.9 | 0.82 |
| an Atlantic hurricane (83 to 75 kt) | before | 83, 83, 82, 79, 78 | 123 / 35 / 0.8 | -72 | 12.2 % | 51 | 2.8 | 2.33 |
|  | after | 84, 82, 78, 76, 75 | 175 / 61 / 0.3 | -71 | 0.5 % | 3 | 0.8 | 0.75 |
| a Cat 2 held 36 hours in 28 kt of storm-centred shear, dry air, a 24.5 C sea | before | 77, 77, 75, 78, 77, 70, 69 | 0 / 0 / 0.0 | -38 | 6.8 % | 11 | 1.7 | 1.56 |
|  | after | 77, 81, 80, 83, 83, 75, 72 | 150 / 60 / 13.9 | -75 | 0.1 % | 1 | 0.7 | 0.55 |

| the real storms (median, 10th to 90th percentile) | cold area -40 / -60 / -70 C (thousand km2) | coldest top (C) | speckle | small objects | rim (C/km) | cirrus roughness (C) |
|---|---|---|---|---|---|---|
| hurricanes at their peak | 154 / 63 / 11 (38 to 212, 2 to 120, 0 to 42) | -77 (-84 to -65) | 0.4 % (0.1 to 1.3) | 17 (6 to 32) | 1.4 (0.9 to 1.9) | 0.93 (0.63 to 1.21) |
| a depression's bursts | 85 / 43 (34 to 185, 11 to 108) | | 3.3 % (0.8 to 6.3) | 19 (6 to 34) | 1.5 (1.1 to 2.3) | 1.45 (0.99 to 2.0) |
| the one big mass | 108 / 54 (39 to 151, 9 to 99) | | 1.0 % (0.3 to 2.5) | 30 (24 to 53) | 1.5 (1.1 to 1.8) | 0.98 (0.70 to 1.11) |

The pictures (the same palette and rings as the real sheets; 3-km cells, the rings at 100 and 200 km):

- `img/game_before_after_1.jpg`: a depression that becomes a tropical storm, and an East Pacific hurricane, before and after.
- `img/game_before_after_2.jpg`: a Cat 2 held 36 hours in hostile air (before, a bare swirl: all the cloud gone; after, a shield that is still there: the strip state is 0.2 to 0.4 and rising slowly while the engine weakens a real storm), a weak tropical storm, and an Atlantic hurricane.
- `img/game_td_life.jpg`: the depression of the first row over 30 hours in the page's own air: one big mass with lumpy cells, a sharp rim and pink overshoots, taking in and wrapping round the swirl as it goes from 25 to 43 kt.
- `img/game_first_frame.jpg`: the first frame after the view switch before and after the new ring was left clean.

### What is still different (honestly)

- **The first hours after the floater opens** have round, bright cirrus patches round the small cells of the surroundings (the nest has had two hours of life where a real weak system has had days of cirrus: its canopy is a smooth haze). They fade in about three to six hours. Taking the anvils away from isolated cells (a gate on how organized the convection round a cell is) did remove them, but it left the cells themselves bare, with edges as sharp as a pixel: the speckle of a tropical storm went from 1.8 % to 4.3 %, which is the dots of the player's complaint, so the patches stay.
- **Fewer small clouds than the real storms** at the satellite's 3-km cells (0 to 3 under 100 km2 in the 500 km, the real 6 to 32; 15 to 26 at 2-km cells in the tests), the rims softer (0.7 to 1.3 C a km, the real 0.9 to 1.9) and the thin cirrus' roughness at the low end of the real range: the price of no dots.
- **A compact hurricane at 3-km cells**: its eyewall is seven cells across and the nest's wind is a quarter below the engine's (82 kt for 110): the eye and the cold area follow the engine's wind, not the nest's, which is why the eye is keyed to it.
- **The held storms are a test construct**: a Cat 2 held at its wind for 36 hours in 28 kt of shear and dry air over 24.5 C water keeps a healthy-looking shield (the strip state 0.2 to 0.4), where a real storm in that air weakens, and the strip state rises with the weakening.
- The pink flecks come only from the hot towers, a statistical population (a depression's mass makes them in every picture, a steady major hurricane none), not a convective model of overshooting tops; the transition's picture was only re-checked in the lab.
- Still no real western Pacific, Indian Ocean or southern-hemisphere sheets to measure against (GOES only).

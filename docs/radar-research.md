# Radar research: what a radar makes of a hurricane's rain, and what the game's radar picture does about it

Working notes for the radar floater (`src/storm-nest.js`, `Nest.radarOp`, called by `display` and `displayBlend` for the radar picture), milestone 29. The lab that measured it is `tools/ir_research/radar_lab.mjs`
(a forced storm run through the nest, the picture read the way a forecaster reads a radar) with `radarsheet.py` for the contact sheets.

## The problem, in numbers

The player's pictures of the floater showed the whole 512 km square in green (20 dBZ and more) with yellow spirals and a small ring of orange and red: "a blob of hurricane". The lab, on a favourable life (a tropical depression to a 120 kt hurricane in 72 hours, 20 N, 29 C water, 3 m/s of shear), measured the same:

- **Echo of 20 dBZ or more covered 100 % of the cells out to 100 km** and 57 to 87 % between 150 and 250 km, at every stage from 53 kt on.
- **The eye was filled until the storm was a major hurricane**: the share of the inner 0.7 radii of maximum wind that was clear was 0.0 at 53 to 75 kt, 0.01 at 95 kt, 0.4 at 115 kt. The model's one eye (`eyeS`) is the cloud tops' eye (it needs 40 to 47 m/s and a complete ring, as the infrared picture wants), and it cleared the rain with 0.4 of its strength.
- **The eyewall was a perfect ring**: all 16 sectors of it had a mean of 30 dBZ or more (the reference's have 19 to 56 %), the weakest sector 33 to 42 dBZ.
- **There was far too much rain**: the area of 45 dBZ or more within 60 km was 1800 to 3700 km2, and the azimuthal mean rain was three to ten times what satellite and airborne-radar composites give (a tropical storm's inner 30 km 54 mm/h, a hurricane's 120).

The cause is not a bug but a unit: the nest's rain is the water its boundary layer condenses, in units that give the *cloud tops* of the infrared view their right height (`topZ` is fitted to real GOES), with a supply that is nearly uniform under a broad Ekman pumping. A radar does not see that. It sees the part that falls out of the cloud low down.

## The reference, read the way a radar is read

A machine-generated radar loop of a hurricane coming ashore on the Florida Big Bend, which the player calls the best radar picture they have seen. Nine frames were taken from the video (`ffmpeg`), the pixels classified by colour (no echo, green, yellow, orange, red:
about under 20, 20 to 35, 35 to 45, 45 to 50 and 50 dBZ and over on the National Weather Service steps), the eye found as the largest enclosed echo-free hole (reliable in four frames), and the shares taken by radius **in radii of that eye**, so that the picture's own scale does not matter.
Mean of the three best frames (share of the cells at that radius; the first band is the eye itself):

| radius (eye radii) | no echo | green | yellow | orange | red |
| --- | --- | --- | --- | --- | --- |
| 0 to 1 | 0.87 | 0.13 | 0 | 0 | 0 |
| 1 to 1.6 | 0.08 | 0.78 | 0.12 | 0.01 | 0 |
| 1.6 to 2.5 | 0.04 | 0.52 | 0.24 | 0.18 | 0.02 |
| 2.5 to 4 | 0.11 | 0.57 | 0.18 | 0.12 | 0.02 |
| 4 to 6 | 0.20 | 0.52 | 0.21 | 0.07 | 0 |
| 6 to 9 | 0.41 | 0.35 | 0.20 | 0.05 | 0 |
| 9 to 14 | 0.62 | 0.25 | 0.11 | 0.02 | 0 |

What it shows, besides the table: an eye that is clear to the pixel with a ragged edge; an eyewall that is **a partial ring**: the sixteen sectors of the ring between 0.7 and 2 radii of maximum wind (the eye's radius over 0.75 as the radius of maximum wind) have a strongest sector of 34 to 44 dBZ and a weakest of 15 to 25 (the mean of the classes' dBZ), and only 19 to 56 % of the sectors reach 30 dBZ; a moat of weaker echo
round the eyewall in some frames; spiral bands with sharp edges and echo-free gaps between them; most of the echo green (25 to 35 dBZ), the yellow in bands, orange only in short arcs near the eye, red rare.
The first frames of the video, before the eye, are a blob with red and orange: the stage the player means with "the eye clears around 60 mph": the eye in the loop appears as the storm leaves that stage.

Plausibility bounds from the literature (ranges as I remember them from TRMM-based composites of tropical-cyclone rain such as Lonfat et al. 2004 and from airborne-radar composites such as Marks 1985 and Rogers et al. 2013; **not re-read in this session**, used only to say that a mean is not absurd, never fitted):
azimuthal mean rain of a few mm/h at 100 km and about one at 200 km, an eyewall maximum of the order of 10 to 30 mm/h in a major hurricane (a mean over the ring, zeros included), a tropical storm's maximum a quarter of that.
The video's own class shares imply a mean of 10 to 25 mm/h in the eyewall and 4 to 10 mm/h at 4 to 9 eye radii: wetter than the composites in its outer bands, as a landfalling storm in moist air can be.

## Why a radar's picture is not the nest's rain

1. **The share of the condensation that reaches the ground** is small for weak, shallow convection (it evaporates, moistens its own column) and larger for deep convection; the nest's rain rate is the condensation. The picture takes a smooth curve of the rain, `rdEff`, from 0.2 for light rain to 0.4 for the heaviest cells (half way at 90 mm/h of the nest, steepness 1.7), times a factor for the storm's strength: a weak storm's convection is shallower, so its share is `rdEffV` = 0.25 of that below 22 m/s of wind, rising to all of it at 50 m/s.
   This is why a tropical storm's core, which the nest keeps heavy (its mean rain 50 to 100 mm/h) because its cold tops must be right, is a few mm/h on the radar.
2. **The echo is intermittent**, not a blanket: cells and bands come in a log-normal spread (`rdSig`: 1.1 in the core, 1.55 beyond six radii of maximum wind) made from the same noise fields (cells, 32 km clusters, 64 km clusters; `rdNz` their weights) that shape the supply, which are carried by the swirl and so wind into bands. A weak vortex's supply is log-normal already, so it keeps 0.3 of the spread (`rdSigW`): the same fields would be counted twice (found by looking at a depression: a heavy blob in the middle).
   Rain too light to reach a radar is left out (`rdCut`: nothing under 1.2 mm/h of the nest, all of it above 3.5): the echo has edges and the gaps between bands are empty, not faintly cyan.
3. **An echo saturates**: no drop spectrum reflects much over 55 dBZ (`rdCap`: 400 mm/h, a soft limit), where the nest's heaviest cells had been drawn in magenta and white (72 dBZ).
4. **The eye is clear of rain long before the cloud tops are**: the eyewall leans outward over a calm centre whose air sinks and dries the falling rain, while the canopy of cirrus over it stays for hours. The picture's eye (`eyeRd`, a second eye state of the nest, in `convect` next to `eyeS`) follows the wind over 20 to 27 m/s, **clear at about 60 mph** (the player's number), needs 4 m/s more in hostile air (shear, dry air, cool water, as `eyeU` does for the cloud tops), needs only a part of an eyewall (a floor of 0.35 and the full eye from 55 % of the ring's sectors raining: `rdEyeRing`), forms in an hour and fills in three quarters of an hour (`rdEyeTau`), is filled by an extratropical transition, grows from 0.42 to 0.52 radii of maximum wind with the wind (`rdEyeR`), has a ragged edge (`rdEyeRag`) and clears in patches before it is whole (the share of its cells that are clear is `eyeRd`: a logistic quantile of the same noise).
   The cloud tops' eye (`eyeS`) is untouched: category 2 begins it, category 3 has it, and the satellite picture still shows a cloud-filled centre for as long as the nest says.
5. **The eyewall has a weak side**: a wave number 1 that the environment asks of the eyewall's convection, toward downshear and left of the shear and toward ahead and right of the motion (Corbosiero and Molinari 2002 and 2003; Reasor et al. 2013; Frank 1977), and that wanders: an Ornstein-Uhlenbeck vector of the nest (`asX`, `asY`, spread 0.5, correlation time 4 hours, from a stream of random numbers of its own so that no other number of the nest changes) round what the shear (0.07 per m/s up to 10) and the motion (0.05 per m/s up to 8) ask for, taken down by 0.3 in the strongest winds, from just outside the eye to 2.5 radii of maximum wind and out to nothing at 5.
   It multiplies the rain before the curve, so a modest lean becomes a weak side: the strongest of the ring's sectors is 11 to 21 dBZ above the weakest.
6. The picture smooths the cell-to-cell noise first (two passes of a 3 x 3 mean, `rdBlur`), because a curve steeper than a straight line turns the noise of the supply into speckle (the rms difference of neighbouring echo cells is 2.1 dBZ, 2.6 without it).

What is **not** modelled: a moat as a separate process (it appears where the nest's rain has a minimum), the eye's eyewall slope with height, attenuation, the radar's beam (the site products still apply their own beam to this picture), the bright band, terrain.
The nest's rain, the cirrus and the infrared picture, the winds and every step are bitwise what they were (checked against a run from before: the fields differ by 0): the radar's picture is a view, made at the page's frame, in about 4 ms.

## Where the numbers come from and what they were checked against

The numbers are not derived from first principles: the forms are the physical ones above, the constants were fitted by a random search (`rdEff`, `rdSig`, `rdCut`, the asymmetry's spread, the eye's size and edge) to the class shares of the table by eye radius, the ring's weakest and strongest sector, and the plausibility bounds, over four snapshots of the favourable life (36, 48, 60 and 72 hours), then looked at and corrected on pictures
of the whole life, a depression, tropical storms, a sheared hurricane, a transition and a scaled storm (the weak ones are why `rdEffV`, `rdSigW` and `rdCap` exist). Many sets of numbers scored about the same: the table cannot fix more than that.
Afterwards, on the same life (strong stages), against the table:

| radius (eye radii) | echo of 20 dBZ or more, picture (video) | 35 dBZ or more | 45 dBZ or more |
| --- | --- | --- | --- |
| 1 to 1.6 | 0.92 (0.92) | 0.39 (0.13) | 0.05 (0.01) |
| 1.6 to 2.5 | 0.97 (0.96) | 0.50 (0.44) | 0.10 (0.20) |
| 2.5 to 4 | 0.77 (0.89) | 0.11 (0.32) | 0.00 (0.14) |
| 4 to 6 | 0.67 (0.80) | 0.14 (0.28) | 0.01 (0.07) |
| 6 to 9 | 0.57 (0.59) | 0.14 (0.25) | 0.02 (0.05) |
| 9 to 14 | 0.30 (0.38) | 0.06 (0.13) | 0.01 (0.02) |

The coverage follows the video's, the strong echo of the bands (yellow and orange outside the eyewall) is about half of it, and the eyewall has half of its orange: the picture is on the light side of the reference in its bands, on purpose (the player's complaint was too much rain, and the means above are already at the composites' upper end).
The ring's weakest and strongest sectors are 19 to 36 dBZ (the video's 15 to 25 and 34 to 44), 55 % of its sectors reach 30 dBZ (the video's 19 to 56 %).
A 95 kt storm's picture, mean of three seeds after 8 hours: echo of 20 dBZ or more over 94, 79, 56, 41 and 12 % of the cells at 15-30, 30-50, 50-100, 100-150 and 150-250 km (the old picture: 100, 100, 100, 96 and 45 %).
The radar's eye is 0.43 of itself at 46 kt (53 mph), 0.82 at 50 kt (58 mph) and 1.00 at 54 kt (62 mph), when the cloud tops' eye is still 0.00.

## What is open

- The radar's eye and the infrared's are two states of the nest now; the second infrared push (eye, convection and shear in the model itself) should make the radar's follow from the same physics, and put the weak side of the eyewall into the rain itself, so that the infrared shows it too (today it is only in the radar's picture).
- The constants are fitted on a storm forced by a hand-made wind profile in a calm, moist environment; the engine's storms come with their own size, motion and weather and the picture has been looked at on the page, not fitted there.
- One reference loop is one reference. The class shares of a landfalling storm in moist air are not those of every hurricane; what the table is not asked to do is to give a hurricane in dry air the same picture.
- Not changed: the colour scale (the National Weather Service steps from 5 dBZ, so a weak echo shows as cyan and blue where the video's scale starts at green), the radar sites' beam model, the Doppler product (it has no velocity where the picture has no echo, as a radar has none).

## Reproduce

```
node tools/ir_research/radar_lab.mjs '{"label":"fav","seed":7,"hours":72,"every":6,"spin":3,"base":{"v":30,"rmax":60,"r34":110,"shear":3,"sst":29,"rh":0.72,"lat":20,"lon":-80,"spd":4,"head":0.5},"prog":[{"h":0,"v":30,"rmax":60},{"h":12,"v":45,"rmax":50},{"h":24,"v":60,"rmax":40,"r34":130},{"h":36,"v":75,"rmax":30,"r34":140},{"h":48,"v":95,"rmax":24,"r34":150},{"h":60,"v":115,"rmax":19,"r34":160},{"h":72,"v":120,"rmax":18,"r34":160}]}' /tmp/radar
python3 tools/ir_research/radarsheet.py /tmp/radar fav 18,24,36,48,60,72 /tmp/radar_sheet.png 200
```
The lab prints, hour by hour: the eye's clear share, the radii of the first 25 dBZ and of the ring's maximum, the ring's weakest and strongest sector and how much of it reaches 30 dBZ, the areas of 40 and 45 dBZ within 60 km, the coverage by distance and the shares by class (`radar_lab.mjs` header); a case's `par` sets any `PAR` key (set `rdEff` to `[1, 1, 1, 1]`, `rdCut` to `[0, 0.001]` and `rdEffV` to `[1, 22, 50]` and `rdSig` to `[0, 0, 2, 6]` for the picture that is the model's rain).

## Part 2: the inflow side (milestone 31)

The player's second round on the radar, after milestone 29 had taken the blanket away: a Category 4 and a Category 1 of the game ("both way too weak") were a small core in bare sea, where the reference loop has, **facing the strong part of the eyewall, a broad area of moderate to strong, steady convection and moisture** that grows with the storm: "weaker and smaller as the storm is weaker and not much defined before the core is developed", but with "stronger, more organized and larger inflow" a stronger and larger one.

### The reference, by azimuth

The same four frames of the reference loop (the frames are the loop's and not kept), now read by azimuth from the strongest sector of the eyewall ring (counter-clockwise positive, the same 16 sectors between 0.9 and 2.4 eye radii) as well as by radius. Mean of the four frames; share of the cells with echo of 35 dBZ or more (yellow and above), and in brackets the share with echo at all (about 20 dBZ):

| azimuth from the strongest sector | 2.5 to 4 eye radii | 4 to 6 | 6 to 9 |
| --- | --- | --- | --- |
| -180 | 0.00 | 0.00 | 0.01 |
| -135 | 0.02 | 0.03 | 0.17 |
| -90 | 0.27 | 0.36 | 0.49 |
| **-45** | **0.78** | **0.64** | **0.72** |
| **0** | **0.55** | **0.65** | **0.49** |
| +45 | 0.27 | 0.25 | 0.04 |
| +90 | 0.17 | 0.06 | 0.01 |
| +135 | 0.08 | 0.00 | 0.00 |

(The echo itself, 20 dBZ or more, covers 0.9 to 1.0 of the cells from -90 to +0 at every radius to 9 eye radii and 0 to 0.4 on the far side.) So the strong echo outside the eyewall is **one broad shield, centred about 45 degrees clockwise of the strongest eyewall sector, 100 to 150 degrees wide, over 4 to 9 eye radii**, and almost nothing on the other side: the part of the picture that the azimuthal means of milestone 29 had averaged away. The game's own picture of milestone 29, read the same way by `tools/ir_research/radar_azi.py` (four categories of 75, 90, 105 and 130 kt, three ages of the nest each, below): 0.23, 0.04, 0.02 and 0.03 of the cells at 35 dBZ or more at 2.5 to 4, 4 to 6, 6 to 9 and 9 to 14 eye radii against the reference's 0.32, 0.28, 0.25 and 0.13, and **no azimuth to it**: 0.02 of the cells of the sector 45 degrees clockwise of the lean and 0.01 of the opposite one (the reference's 0.5 to 0.7 and about 0).

### The physics, and what the nest cannot do

The strongest eyewall quadrant of a hurricane in shear and motion is where the environment's inflow converges (downshear and left of the shear, ahead and right of the motion: Corbosiero and Molinari 2002 and 2003, Frank 1977, as I remember them, not re-read here), and the **principal rainband** feeds into it from upstream: it spirals cyclonically inward and joins the eyewall at its downwind end, so that it lies *clockwise* of the strongest sector in the northern hemisphere (Willoughby, Marks and Feinberg 1984, Houze 2010, as I remember them). Its convective and stratiform rain is the moist boundary-layer inflow rising along the band; it is the inflow's strength, size and organisation that make it strong, large and continuous: a larger wind field has more inflow to give, a stronger vortex draws it harder, hostile air (shear, dry air, cool water) and a broken ring take it away, and a depression has none to speak of.

The nest is a one-layer reduced model: its boundary layer's convergence makes the rain under the vortex (the eyewall and an `inS` ring of inflow convection), but it does not resolve the band complex, the moist inflow it feeds on or the stratiform area behind it. The radar picture takes this as an **observation operator's own term** (as the eye and the weak side of milestone 29 were): the nest's rain, the satellite's picture and every step stay as they were.

### What the operator does now (`Nest.radarOp`; the `PAR` keys are `rdIn` and `rdArm`)

- **Where.** The lean of the eyewall (`asX`, `asY`: what the shear and the motion ask for, wandering with a time of 4 hours) names the strongest sector; the shield is centred 0.785 rad (45 degrees) clockwise of it (in the northern hemisphere's frame that the nest works in; the page mirrors the southern hemisphere), turning clockwise by 0.2 rad per e-fold of radius, with a Gaussian width of 1.25 rad for a storm with no inflow to 0.95 for one with all of it (a weak storm's is not defined).
- **How strong and how large (the inflow `Ish`).** `Ish` = the storm's strength (0.05 below 16 m/s of wind, all of it from 46 m/s) times its size to the power 0.6 (the radius of 34 kt wind over 150 km, from 0.55 to 1.4) times the air and the ring (the hostility 0 to 1 takes half of it, the share of the eyewall's annulus that is raining takes 0.4 of it) times 0 in a transition. The rain of the shield at its peak is 26 mm/h times `Ish` to the power 0.7, thinning as the 0.3 power of radius, over the radii from 2.4 to 5 eye radii outward to **0.35 and 1.0 of the 34 kt radius** (plus 0.2 times `Ish` of it): the larger the wind field, the farther it reaches.
- **Arms.** Nine arms of a log spiral (`tan` of the pitch 0.47) winding clockwise outward, the gaps between them a little under half of an arm's rain (the arms' depth 0.55, sharpness 1.3, taken away in a weak storm: `rdArm`), bent by the 32 km clusters of the swirl-carried noise and moving outward by 0.2 rad an hour; the rain is log-normal (0.5) from the same noise fields as the nest's cells and clusters, so the swirl carries and winds them. The number of arms and their sharpness are a choice of look that the shares bound and do not decide: five, seven, eight and nine arms with the gaps 0.5 to 0.65 deep and a sharpness of 1.2 to 2.0 change the class shares by 0.07 at most and the shield sector's share of 35 dBZ between 0.51 and 0.69; nine arms at 0.55 and 1.3 are the pictures whose streaks (30 km apart along the radius at 90 km, 2.6 eye radii at 8 eye radii) lie between the streakiest reference frame (bands about 1.7 eye radii apart, by eye) and the blurriest (none).
- **What it is added to.** The radar rain of the nest (its own eyewall, bands and weak side) before the saturation at 55 dBZ; nothing under 1.5 mm/h is seen and everything over 3, so that the shield has an edge and not a halo of cyan.

### Numbers

The same lab as milestone 29 (`tools/ir_research/radar_lab.mjs`: a forced storm of 75, 90, 105 and 130 kt at 22 N in warm moist air, 3 m/s of shear, 5 m/s of motion, the picture after 3, 10 and 17 hours of the nest's life), read the way the reference was read by `tools/ir_research/radar_azi.py` (in the eye's own radii and from the lean's azimuth), mean of the twelve pictures:

| radius (eye radii) | 1 to 1.6 | 1.6 to 2.5 | 2.5 to 4 | 4 to 6 | 6 to 9 | 9 to 14 |
| --- | --- | --- | --- | --- | --- | --- |
| echo of 20 dBZ or more, milestone 29 | 0.89 | 0.91 | 0.68 | 0.45 | 0.28 | 0.19 |
| **echo of 20 dBZ or more, now** | 0.89 | 0.91 | 0.74 | 0.67 | 0.61 | 0.38 |
| the reference | 0.92 | 0.96 | 0.89 | 0.80 | 0.59 | 0.38 |
| 35 dBZ or more, milestone 29 | 0.35 | 0.56 | 0.23 | 0.04 | 0.02 | 0.03 |
| **35 dBZ or more, now** | 0.35 | 0.56 | 0.34 | 0.29 | 0.24 | 0.10 |
| the reference | 0.13 | 0.44 | 0.32 | 0.28 | 0.25 | 0.13 |
| 45 dBZ or more, now (unchanged) | 0.05 | 0.25 | 0.07 | 0.00 | 0.00 | 0.01 |
| the reference | 0.01 | 0.20 | 0.14 | 0.07 | 0.05 | 0.02 |

By azimuth, at 4 to 9 eye radii: the sector centred 45 degrees clockwise of the lean has **0.64 of its cells at 35 dBZ or more** (0.40 to 0.84 over the four categories and three ages; the reference 0.5 to 0.7) and echo over 0.99, the opposite sector 0.01 (0.00 to 0.05; the reference about 0) and echo over 0.23 (0 to 0.4); before the change 0.02 and 0.01. A Category 1 has 0.43 to 0.72 of its shield sector at 35 dBZ or more, a Category 4 0.63 to 0.84 (the picture of milestone 29: 0.00 to 0.07 for both).

The scaling, from `tests/nest_radar.mjs` (a 105 kt storm of 8 hours, two or three seeds; the area of 35 dBZ or more beyond 40 km): 12, 16 and 24 thousand km2 for 50, 75 and 105 kt; 8, 24 and 61.5 thousand km2 for a wind field (the radius of 34 kt wind) of 70, 150 and 260 km; 10 thousand km2 in 16 m/s of shear and dry air against 24 in the favourable air; what the shield adds to the nest's own echo is 19 thousand km2 for a hurricane, 0.9 for a depression and 0.00 in an extratropical transition. The lean turned by 180 degrees turns the centre of the shield by 180 (within 70). The picture costs about 11 ms on this machine (a median of 10.8 ms with the shield off and 11.6 with it on, the arms' number making no difference), so the shield costs under a millisecond.


### What is not done, said plainly

- The shield is a parameterised term, not the product of a model of the inflow: its strength and size are from the storm's wind, size, air and ring, and its place from the lean. The infrared picture does not have it (the radar's and the cloud tops' pictures are two views of the nest's rain, and the shield is in the radar's only).
- One reference loop is one reference: a Category 4 in moist air coming ashore, with the shear and the motion of a landfall. The azimuth of 45 degrees clockwise, the width and the reach are its; other storms have other bands (a double band, none, a band on both sides), and the wandering lean decides where ours sits.
- The nest's own rain at 2.5 to 4 eye radii grows with the nest's age (the Category 4 of the lab has 0.13 of its cells at 35 dBZ or more there after 3 hours, 0.17 after 10 and 0.70 after 17 without the shield, 0.24, 0.30 and 0.75 with it, the reference 0.32), and the shield adds to it only where it lies.
- The arms are a pattern with noise in it; real bands are made by the dynamics and move differently (inward and outward, stationary and propagating).
- A radar's attenuation, the beam and the colour scale (the page's scale begins at cyan and blue where the loop's begins at green) are as they were.

## Part 3: the large convection area as waves, and slow (milestone 32)

*What was seen:* the shield of part 2 looked drawn: a sector with a clean outer arc, nine equal stripes in it, corners where the stripes met the arc round the eyewall, and a strong-echo area that swelled and shrank within minutes of the model's time.

*What it was, measured (a 105 kt storm in steady air, the picture every ten minutes for six hours, the shield alone):* the area of 40 dBZ or more beyond 2.5 eye radii changed by a median of 19 to 22 percent in half an hour, and by 37 to 48 percent at the 90th percentile (the areas of 20 and 30 dBZ by 3 to 10 percent): the strong echo sits near the shield's typical level, so any swing of its strength moves a large area across the threshold. The swings came from the cluster and mesoscale noise (0.65 and 0.35 of the shield's variability, carried round by the swirl, which shears them in less than an hour), from the eyewall's ring completeness, the wind, the size and the air read at every step (a stronger shield also grew in radius while it narrowed in angle), and the stripes' phase. The outer edge was an arc (the farthest 20 dBZ echo in the shield's sectors differed by 4 to 5.5 percent of its mean), and the inner ends of the stripes stood on one arc round the eyewall.

*What changed (`Nest.shieldField`, `bandModes`, `bandTab`):* the shield's bands are **waves**: fourteen log spirals of its own pitch each (the tangent of the mean pitch 0.47, spread by 0.35), three to twelve bands round the storm, that move outward (0.07 e-folds of the radius an hour) and round (0.04 rad an hour), wax and wane over about twelve hours, evaluated on a grid of the angle and the log radius at the instant of the picture (a pure function of the time: the paused and the playing picture agree). Two slower sets of waves push the sector's edge (0.5 rad) and the outer edge (0.22 of its radius), and the pattern moves the inner end of each band (1 eye radius), so the area has no clean wedge or arc. Its strength, size, hostility, ring and transition are followed over five hours (`shV`, `shSz`, `shUnf`, `shRing`, `shEta`, `rdShS`) and its direction over two days; the cluster noise is a fifth of what it was.

*Numbers:* the area of 35 dBZ or more beyond 40 km changes by a median of 3 percent and at most 7 in half an hour over two hours of a 105 kt storm; the outer edge differs by 13 to 17 percent of its mean (3 times as much); the same cells under a pattern three hours older correlate 0.79 to 0.86 (0.99 after ten minutes); after the air turns hostile the area is 0.91 of what it was an hour later and 0.37 after fourteen hours; the power of the waves winding clockwise outward is 4.4 to 5.1 times that of the others.

*Open:* the waves are a pattern with the right sense and speed, not the dynamics of the bands; one reference storm still decides the azimuth and the reach (part 2); the angular warp of the sector's edge has no check of its own, only the picture.


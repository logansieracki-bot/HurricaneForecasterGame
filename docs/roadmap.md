# Roadmap

## Just landed
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
  simulated), lows as objects next to the highs, and dry air under a high feeding the humidity field. And the real test of all of it:
  steering of real best-track storms, once the storm model exists (the sandbox cannot reach NHC/NCEI).
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

# Roadmap

## Just landed
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
  Atlantic and Eastern Pacific (Simulation mode) are live; the rest are "Coming
  soon."
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
1. **Western Pacific** — Kuroshio + Kuroshio Extension, the West Pacific Warm
   Pool, monsoon trough effects. ENSO's Atlantic/EPAC regression does not
   transfer — West Pacific responds differently and needs its own fit.
2. **Northern Indian Ocean** — Somali Current / Findlater Jet monsoon
   upwelling, Bay of Bengal's low-salinity warm cap, bimodal (pre-/post-monsoon)
   cyclone season instead of one summer peak.
3. **Australian Region** and **South-West Indian Ocean** — separate basins
   (menu no longer combines them). Both Southern Hemisphere (Nov–Apr season):
   Leeuwin Current for the Australian side, Agulhas Current for the SW Indian
   side.
4. **South Pacific**, **South Atlantic**, **Mediterranean** — lower cyclone
   activity (South Atlantic almost none) or a different storm type entirely
   (Mediterranean "medicanes"); realism bar and priority TBD once the first
   three are done.

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
- Winds/shear fields (ENSO currently only touches SST).

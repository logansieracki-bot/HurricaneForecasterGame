# Roadmap

## Just landed
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
    18-lake list (Albert, Moeru, Bangweulu, Kivu, Edward, Kyoga, Rukwa, Kariba, Cahora Bassa,
    Turkana, Eyasi, Natron, Manyara) gets the generic latitude+area fallback.
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
  Atlantic, Eastern Pacific, Western Pacific, Northern Indian Ocean, Australian
  Region and South-West Indian Ocean (Simulation mode) are live; the rest are "Coming soon."
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
1. **South Pacific**, **South Atlantic**, **Mediterranean** — the three
   remaining basins, coded one at a time. Lower cyclone activity (South
   Atlantic almost none) or a different storm type entirely (Mediterranean
   "medicanes"); realism bar and priority TBD once the next one is picked.

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

# Roadmap

## Just landed
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

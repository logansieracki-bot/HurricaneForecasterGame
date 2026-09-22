# Roadmap

## Just landed
- **Eastern Pacific** is live: same architecture as Atlantic (real ERSST v5
  climatology + EOF interannual anomalies + ENSO regression, real Natural
  Earth/apexmaps-geo geography, an embedded Blue Marble crop), plus its own
  hand-tuned features — Costa Rica Dome, California Current upwelling along
  Baja/mainland Mexico, Tehuantepec/Papagayo/Panama gap-wind cooling plumes
  (with a shared stochastic burst index so the three don't move in lockstep),
  the East Pacific Warm Pool hugging southern Mexico/Central America, and
  Gulf of California's exaggerated shallow-water seasonal swing. The domain
  (equator–36°N, coast–140°W) matches the NHC/CPHC basin boundary exactly, so
  unlike Atlantic it needs no sub-region SST masking at all.
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
  (Atlantic's Mediterranean/South Atlantic exclusion) or whether, like EPAC,
  the box edges already match the basin's real boundary and no masking is
  needed at all — don't add masking code a basin doesn't need.
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

## Later, not scoped yet
- Forecaster mode (hurricane hunters, model guidance, cones/AOIs) — deliberately
  not started; Simulation mode across basins comes first.
- Radar/satellite storm imagery (synthetic, generated from the sim's own storm
  state — not a real tile provider).
- Winds/shear fields (ENSO currently only touches SST).

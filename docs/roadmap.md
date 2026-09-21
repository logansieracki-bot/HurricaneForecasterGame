# Roadmap

## Just landed
- Main menu (`index.html`) has all 9 basins as separate cards (no combining):
  Atlantic, Eastern Pacific, Western Pacific, Northern Indian Ocean, Australian
  Region, South Pacific, South-West Indian Ocean, South Atlantic, Mediterranean.
  Only Atlantic + Simulation are live; everything else is "Coming soon."
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
1. **Eastern Pacific** — same architecture as Atlantic (real climatology + EOF
   interannual anomalies + ENSO regression), plus its own hand-tuned features:
   Costa Rica Dome, California Current upwelling off Baja, Tehuantepec/Papagayo
   gap-wind cooling, the warm pool hugging Central America. Held to the same bar
   as Atlantic — not a climatology-only placeholder.
2. **Western Pacific** — Kuroshio + Kuroshio Extension, the West Pacific Warm
   Pool, monsoon trough effects. ENSO's Atlantic regression does not transfer —
   West Pacific responds close to oppositely and needs its own fit.
3. **Northern Indian Ocean** — Somali Current / Findlater Jet monsoon
   upwelling, Bay of Bengal's low-salinity warm cap, bimodal (pre-/post-monsoon)
   cyclone season instead of one summer peak.
4. **Australian Region** and **South-West Indian Ocean** — separate basins
   (menu no longer combines them). Both Southern Hemisphere (Nov–Apr season):
   Leeuwin Current for the Australian side, Agulhas Current for the SW Indian
   side.
5. **South Pacific**, **South Atlantic**, **Mediterranean** — lower cyclone
   activity (South Atlantic almost none) or a different storm type entirely
   (Mediterranean "medicanes"); realism bar and priority TBD once the first
   four are done.

Each basin gets its own `dist/<basin>-sst-simulator.html`, loaded on demand from
the main menu — no global grid, keeps every basin's build lightweight
independently.

**Per-basin checklist, learned from the Atlantic build's bugs:** don't assume
border-line (state/country outline) data coverage matches the SST domain —
verify it and set `maxBounds`/`minZoom` to match, the way the Atlantic fix did.
And mask SST to that basin's actual extent (the way the Atlantic build now
excludes the Mediterranean and South Atlantic) so adjacent future basins don't
silently overlap.

## Prerequisite before basin 2 can really start
Rebuild the data pipeline (`tools/fetch.*`, `tools/make_climate.py`,
`tools/make_geo.py`) that turns raw ERSST v5 / Natural Earth / Blue Marble
source data into `data/generated/data.json`. Right now that file is a checked-in
extraction with no way to regenerate it or produce an equivalent one for a new
basin's domain box.

## Later, not scoped yet
- Forecaster mode (hurricane hunters, model guidance, cones/AOIs) — deliberately
  not started; Simulation mode across basins comes first.
- Radar/satellite storm imagery (synthetic, generated from the sim's own storm
  state — not a real tile provider).
- Winds/shear fields (ENSO currently only touches SST).

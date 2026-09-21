# Roadmap

## Just landed
- Main menu (`index.html`): basin select + mode select. Atlantic + Simulation
  are live; every other basin and Forecaster mode show as "Coming soon."
- Blue Marble imagery rebuilt to be always-on and network-independent (embedded
  crop instead of a 4-source live tile chain); Satellite theme simplified to one
  provider with an automatic fallback to Blue Marble.
- Repo reconstructed as real source (`src/template.html` + build script) instead
  of hand-editing a single built HTML file.

## Next up, in order
1. **East Pacific** — same architecture as Atlantic (real climatology + EOF
   interannual anomalies + ENSO regression), plus its own hand-tuned features:
   Costa Rica Dome, California Current upwelling off Baja, Tehuantepec/Papagayo
   gap-wind cooling, the warm pool hugging Central America. Held to the same bar
   as Atlantic — not a climatology-only placeholder.
2. **West Pacific** — Kuroshio + Kuroshio Extension, the West Pacific Warm Pool,
   monsoon trough effects. ENSO's Atlantic regression does not transfer — West
   Pacific responds close to oppositely and needs its own fit.
3. **North Indian Ocean** — Somali Current / Findlater Jet monsoon upwelling,
   Bay of Bengal's low-salinity warm cap, bimodal (pre-/post-monsoon) cyclone
   season instead of one summer peak.
4. **Australia / Madagascar (SW Indian + Australian basins)** — Southern
   Hemisphere seasonal cycle (Nov–Apr season), Agulhas Current, Leeuwin Current.

Each basin gets its own `dist/<basin>-sst-simulator.html`, loaded on demand from
the main menu — no global grid, keeps every basin's build lightweight
independently.

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

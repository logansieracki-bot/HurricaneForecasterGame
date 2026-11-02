# Notes for Claude

This file is for Claude only. Nothing in it goes on the site, in the README, in the roadmap or in the What's New log (the user said so about the version rule: keep it out of everything a visitor can read).

## Version numbers (the user's rule)

A version is three counters and a letter, shown as `0.10A`. The user writes the places out as `0.0.1.A` (the current one then was major 0, minor 0, fixes 1, letter A):

| Place | Meaning | It goes up when an update |
| --- | --- | --- |
| ones (`0.`) | major updates and releases | is a major step (a new discipline, a rebuilt game) |
| tenths (`.1`) | minor additions | adds something: a feature, a screen, a layer, a setting |
| hundredths (`.00`) | bug fixes | only fixes things |

- An update bumps the highest place it touches and zeroes the places to its right: `0.01A` with an addition becomes `0.10A`; `0.10A` with only fixes becomes `0.11A`; `0.11A` with a major step becomes `1.00A`. An update that adds and fixes bumps the tenths.
- The letter: **A** is alpha (very limited testing, what the game is now, usually not released), **B** is beta (testing done, not fully done, could be released), **R** is release. The user decides when the letter changes; never move A to B or R on my own.
- If the tenths or the hundredths would pass 9, do not carry: ask the user how to write it.
- The version is in `src/menu.html`: `VERSION` in the script, and the default text of `#ver` and `#ver2` in the markup (keep the three equal; the script overwrites the markup). The stage word in the footer (Early alpha, Beta, none) comes from the letter.

## Every update that changes what a visitor sees

1. Bump `VERSION` as above.
2. Add an entry at the top of `UPDATES` in `src/menu.html`: the version, the date, and one line for each thing, in the manner of a commit message, in my own words (never the user's words, never quotes). Icons: `add` is a green plus (something new), `del` a red X (something taken away), `chg` a blue dash (changed or fixed). The entry of the running version is shown once, the first time the site is opened after the update (the version last seen is in the browser's localStorage under `hf-seen-version`), and from "What's new" in the footer. The rule above is never mentioned in an entry.
3. The tests read the version from `src/menu.html`, so they need no edit for a bump; `npm test` must pass.
4. Then the usual: README and `docs/roadmap.md` for what changed, build, push, watch CI.

## Design decisions of the user to keep

- The menu's backdrop (a surface analysis of a hurricane coming ashore, `analysis()` in `src/menu.html`) is a design, not a forecast: **no key, legend, caption, title or timestamp for it**, and no forecast track or cone. Only the numbers on some isobars, the L and the H, the coast and the wind barbs.
- Anything that can be copied or saved (season summary images, the data, the wikitext) carries "HYPOTHETICAL from Isobar Hurricane Simulator".
- No pull request unless the user asks for one.

## Working here

- `npm run build` makes `index.html` and `dist/`; `npm test` runs the node tests and the browser suite (about 30 minutes in CI, shards locally: `ONLY='Atlantic,Mediterranean' SKIP=save,menu node tests/run.mjs`, `ONLY=none SKIP=save node tests/run.mjs` for the menu, `ONLY=none SKIP=menu node tests/run.mjs` for the save checks).
- Develop on `main`, push `main` and `main:claude/hurricane-sim-brainstorm-tjo421` (CI runs on a push to `main` and deploys to GitHub Pages when it is green); watch the run and fix a red one.

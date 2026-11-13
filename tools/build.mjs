#!/usr/bin/env node
// Assembles dist/<basin>-sst-simulator.html from src/template.html +
// vendor/leaflet + data/generated/data.json + src/storms.js. No bundler: the template
// is plain HTML/CSS/JS with placeholders substituted verbatim (the storm ones from src/storm-*.js, src/storm-ui.*) (a template that has
// no `/*__STORMS__*/` or `/*__STORM_HOOKS__*/` placeholder simply does not get the storm engine / its page hooks yet).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const LABELS = { atlantic: 'Atlantic', eastpacific: 'Eastern Pacific', westpacific: 'Western Pacific', nio: 'North Indian Ocean', aus: 'Australian Region', swio: 'South-West Indian Ocean', spac: 'South Pacific', satl: 'South Atlantic', med: 'Mediterranean' };
function stormHtml() {                                                                         // src/storm-ui.html: named sections, `<!--[name]-->` heading each; a template takes one at its `<!--__STORM_HTML:name-->`
  const text = readFileSync(join(ROOT, 'src/storm-ui.html'), 'utf8'), out = {};
  for (const m of text.matchAll(/<!--\[(\w+)\]-->\n([\s\S]*?)(?=<!--\[\w+\]-->\n|$)/g)) out[m[1]] = m[2].replace(/\n+$/, '');
  return out;
}
function build({ basin = 'atlantic', templatePath = join(ROOT, 'src/template.html'), dataPath = join(ROOT, 'data/generated/data.json'), outPath }) {
  const template = readFileSync(templatePath, 'utf8');
  const css = readFileSync(join(ROOT, 'vendor/leaflet/leaflet.css'), 'utf8');
  const js = readFileSync(join(ROOT, 'vendor/leaflet/leaflet.js'), 'utf8');
  let data = readFileSync(dataPath, 'utf8');
  const mapPath = join(ROOT, 'data/generated', basin + '-summap.json');                                // the Blue Marble of the season summary's map (tools/make_summary_map.mjs), a picture of its own beside the page's: smap, smapBox, smapSize
  if (existsSync(mapPath)) data = JSON.stringify(Object.assign(JSON.parse(data), JSON.parse(readFileSync(mapPath, 'utf8'))));
  const storms = readFileSync(join(ROOT, 'src/storms.js'), 'utf8');
  if (storms.includes('</script>')) throw new Error('src/storms.js must not contain a closing script tag: it is inlined into a <script>');
  const cities = readFileSync(join(ROOT, 'src/storm-cities.js'), 'utf8').trimEnd();                    // what each city holds (people, income, terrain, coast): the engine's impacts read it; it goes in front of the engine
  if (cities.includes('</script>')) throw new Error('src/storm-cities.js must not contain a closing script tag: it is inlined into a <script>');
  const nest = readFileSync(join(ROOT, 'src/storm-nest.js'), 'utf8').trimEnd();                       // the 2-km storm-scale model behind the radar floater: it goes after the engine (it reads HFStorms when it is asked for a system's forcing)
  if (nest.includes('</script>')) throw new Error('src/storm-nest.js must not contain a closing script tag: it is inlined into a <script>');
  const floater = readFileSync(join(ROOT, 'src/storm-floater.js'), 'utf8').trimEnd();                // the radar floater's page half: it goes in front of the hooks (its variables are set before anything can call it)
  if (floater.includes('</script>')) throw new Error('src/storm-floater.js must not contain a closing script tag: it is inlined into a <script>');
  const summary = readFileSync(join(ROOT, 'src/storm-summary.js'), 'utf8').trimEnd();                // the season summary card (the Summary button of the season bar): it goes straight after the hooks, whose names it reads
  if (summary.includes('</script>')) throw new Error('src/storm-summary.js must not contain a closing script tag: it is inlined into a <script>');
  const hooks = floater + '\n' + readFileSync(join(ROOT, 'src/storm-hooks.js'), 'utf8').trimEnd() + '\n' + summary;               // everything that connects the engine to a page (the same file in every basin's page); a template without the placeholder gets none
  if (hooks.includes('</script>')) throw new Error('src/storm-hooks.js must not contain a closing script tag: it is inlined into a <script>');
  const late = readFileSync(join(ROOT, 'src/storm-late.js'), 'utf8').trimEnd();                      // the storm controls' wiring, the save / resume block and the storm half of window.SSTSIM
  if (late.includes('</script>')) throw new Error('src/storm-late.js must not contain a closing script tag: it is inlined into a <script>');

  const label = LABELS[basin] || basin, parts = stormHtml(), stormCss = readFileSync(join(ROOT, 'src/storm-ui.css'), 'utf8').trimEnd();
  const fill = (txt) => txt.replace(/\{\{BASIN_LABEL\}\}/g, () => label);
  let out = template
    .replace('/*__LEAFLET_CSS__*/', () => css)
    .replace('/*__DATA__*/', () => data)
    .replace('/*__LEAFLET_JS__*/', () => js)
    .replace('/*__STORMS__*/', () => cities + '\n' + storms + '\n' + nest)
    .replace('/*__STORM_HOOKS__*/', () => fill(hooks))
    .replace('/*__STORM_LATE__*/', () => fill(late))
    .replace('/*__STORM_CSS__*/', () => stormCss);
  out = out.replace(/<!--__STORM_HTML:(\w+)-->\n?/g, (all, name) => { if (!(name in parts)) throw new Error('src/storm-ui.html has no section ' + name); return fill(parts[name]) + '\n'; });

  const dest = outPath || join(process.env.HF_DIST || join(ROOT, 'dist'), `${basin}-sst-simulator.html`);      // HF_DIST: build somewhere else (a lab build beside a test run that is using dist/)
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`Built ${dest} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
}

build({});
build({ basin: 'eastpacific', templatePath: join(ROOT, 'src/template-eastpacific.html'), dataPath: join(ROOT, 'data/generated/eastpacific-data.json') });
build({ basin: 'westpacific', templatePath: join(ROOT, 'src/template-wpac.html'), dataPath: join(ROOT, 'data/generated/westpacific-data.json') });
build({ basin: 'nio', templatePath: join(ROOT, 'src/template-nio.html'), dataPath: join(ROOT, 'data/generated/nio-data.json') });
build({ basin: 'aus', templatePath: join(ROOT, 'src/template-aus.html'), dataPath: join(ROOT, 'data/generated/aus-data.json') });
build({ basin: 'swio', templatePath: join(ROOT, 'src/template-swio.html'), dataPath: join(ROOT, 'data/generated/swio-data.json') });
build({ basin: 'spac', templatePath: join(ROOT, 'src/template-spac.html'), dataPath: join(ROOT, 'data/generated/spac-data.json') });
build({ basin: 'satl', templatePath: join(ROOT, 'src/template-satl.html'), dataPath: join(ROOT, 'data/generated/satl-data.json') });
build({ basin: 'med', templatePath: join(ROOT, 'src/template-med.html'), dataPath: join(ROOT, 'data/generated/med-data.json') });

// The main menu: index.html (at the root, where the deployed site and the simulators' Menu button expect it) is made from src/menu.html and the picture of its world map
// (data/generated/menu-art.json, from tools/make_menu_art.mjs): the picture goes in as one data object where the template says /*__MENU_ART__*/.
{
  const art = readFileSync(join(ROOT, 'data/generated/menu-art.json'), 'utf8').trim();
  const seasonPath = join(ROOT, 'data/generated/menu-season.json');                                  // the Tropical card's season (tools/make_menu_season.mjs): without it the card has no picture
  const season = existsSync(seasonPath) ? readFileSync(seasonPath, 'utf8').trim() : 'null';
  const expectPath = join(ROOT, 'data/generated/menu-expect.json');                                  // what a season of each basin holds under the settings (tools/make_menu_expect.mjs): without it the basin screen has no Expected section
  const expect = existsSync(expectPath) ? readFileSync(expectPath, 'utf8').trim() : 'null';
  const coastPath = join(ROOT, 'data/generated/menu-coast.json');                                    // the coast under the backdrop's analysis (tools/make_menu_coast.mjs): without it the analysis has no coast
  const coast = existsSync(coastPath) ? readFileSync(coastPath, 'utf8').trim() : 'null';
  const html = readFileSync(join(ROOT, 'src/menu.html'), 'utf8').replace('/*__MENU_ART__*/', () => 'const ART = ' + art + ';').replace('/*__MENU_SEASON__*/', () => 'const SEASON = ' + season + ';').replace('/*__MENU_EXPECT__*/', () => 'const EXPECT = ' + expect + ';').replace('/*__MENU_COAST__*/', () => 'const COAST = ' + coast + ';');
  writeFileSync(join(ROOT, 'index.html'), html);
  console.log(`Built ${join(ROOT, 'index.html')} (${(html.length / 1024).toFixed(0)} KB)`);
}

// The Severe page, the radar and the editor (Draw mode): dist/severe.html (a preview the menu does not link) is made from src/severe.html and src/severe-app.css, the scripts of the page (each in a <script> of its own with
// an id, so that the page can hand the sources of the radar operator to its scanning workers), the baked vector map (data/generated/severe-geo.bin, tools/make_severe_geo.mjs), the storm pack
// (data/severe/packs/*.hfp, tools/severe_research/make_pack.mjs) and the colour tables (data/severe/*.pal), all inlined: one file that needs nothing from the network.
{
  const text = (p) => readFileSync(join(ROOT, p), 'utf8').trimEnd(), b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
  const libs = [['src-geo', 'severe-geo.js'], ['src-palette', 'severe-palette.js'], ['src-radar', 'severe-radar.js'], ['src-pack', 'severe-pack.js'], ['src-worker', 'severe-worker.js'], ['src-gl', 'severe-gl.js'], ['src-map', 'severe-map.js'],
    ['src-core', 'severe-core.js'], ['src-sounding', 'severe-sounding.js'], ['src-analysis', 'severe-analysis.js'], ['src-draw', 'severe-draw.js'], ['src-days', 'severe-days.js'], ['src-guide', 'severe-guide.js'], ['src-paint', 'severe-editor-paint.js'], ['src-refl', 'severe-refl.js'], ['src-lab', 'severe-lab.js'], ['src-labworker', 'severe-lab-worker.js']];
  const scripts = libs.map(([id, f]) => {
    const s = text('src/' + f); if (s.includes('</script>')) throw new Error('src/' + f + ' must not contain a closing script tag: it is inlined into a <script>');
    return `<script id="${id}">\n${s}\n</script>`;
  });
  const data = { geo: b64('data/generated/severe-geo.bin'), pack: b64('data/severe/packs/wk82-1km-5min.hfp'), pal: { br: text('data/severe/Apocs_BR_Expert.pal'), bv: text('data/severe/User_BV_mph.pal'), sw: text('data/severe/Isobar_SW_placeholder.pal') } };
  const app = text('src/severe-app.js'); if (app.includes('</script>')) throw new Error('src/severe-app.js must not contain a closing script tag: it is inlined into a <script>');
  const editor = text('src/severe-editor.js'); if (editor.includes('</script>')) throw new Error('src/severe-editor.js must not contain a closing script tag: it is inlined into a <script>');
  scripts.push(`<script id="src-data">\nconst SEVERE_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n</script>`, `<script id="src-app">\n${app}\n</script>`, `<script id="src-editor">\n${editor}\n</script>`);
  const html = text('src/severe.html').replace('/*__SEVERE_CSS__*/', () => text('src/severe-app.css')).replace('<!--__SEVERE_SCRIPTS__-->', () => scripts.join('\n')) + '\n';
  const dest = join(process.env.HF_DIST || join(ROOT, 'dist'), 'severe.html');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  console.log(`Built ${dest} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}

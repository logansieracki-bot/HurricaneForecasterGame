#!/usr/bin/env node
// Assembles dist/<basin>-sst-simulator.html from src/template.html +
// vendor/leaflet + data/generated/data.json + src/storms.js. No bundler: the template
// is plain HTML/CSS/JS with placeholders substituted verbatim (the storm ones from src/storm-*.js, src/storm-ui.*) (a template that has
// no `/*__STORMS__*/` or `/*__STORM_HOOKS__*/` placeholder simply does not get the storm engine / its page hooks yet).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  const data = readFileSync(dataPath, 'utf8');
  const storms = readFileSync(join(ROOT, 'src/storms.js'), 'utf8');
  if (storms.includes('</script>')) throw new Error('src/storms.js must not contain a closing script tag: it is inlined into a <script>');
  const cities = readFileSync(join(ROOT, 'src/storm-cities.js'), 'utf8').trimEnd();                    // what each city holds (people, income, terrain, coast): the engine's impacts read it; it goes in front of the engine
  if (cities.includes('</script>')) throw new Error('src/storm-cities.js must not contain a closing script tag: it is inlined into a <script>');
  const hooks = readFileSync(join(ROOT, 'src/storm-hooks.js'), 'utf8').trimEnd();                   // everything that connects the engine to a page (the same file in every basin's page); a template without the placeholder gets none
  if (hooks.includes('</script>')) throw new Error('src/storm-hooks.js must not contain a closing script tag: it is inlined into a <script>');
  const late = readFileSync(join(ROOT, 'src/storm-late.js'), 'utf8').trimEnd();                      // the storm controls' wiring, the save / resume block and the storm half of window.SSTSIM
  if (late.includes('</script>')) throw new Error('src/storm-late.js must not contain a closing script tag: it is inlined into a <script>');

  const label = LABELS[basin] || basin, parts = stormHtml(), stormCss = readFileSync(join(ROOT, 'src/storm-ui.css'), 'utf8').trimEnd();
  const fill = (txt) => txt.replace(/\{\{BASIN_LABEL\}\}/g, () => label);
  let out = template
    .replace('/*__LEAFLET_CSS__*/', () => css)
    .replace('/*__DATA__*/', () => data)
    .replace('/*__LEAFLET_JS__*/', () => js)
    .replace('/*__STORMS__*/', () => cities + '\n' + storms)
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

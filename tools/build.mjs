#!/usr/bin/env node
// Assembles dist/<basin>-sst-simulator.html from src/template.html +
// vendor/leaflet + data/generated/data.json. No bundler: the template is
// plain HTML/CSS/JS with three placeholders substituted verbatim.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function build({ basin = 'atlantic', templatePath = join(ROOT, 'src/template.html'), dataPath = join(ROOT, 'data/generated/data.json'), outPath }) {
  const template = readFileSync(templatePath, 'utf8');
  const css = readFileSync(join(ROOT, 'vendor/leaflet/leaflet.css'), 'utf8');
  const js = readFileSync(join(ROOT, 'vendor/leaflet/leaflet.js'), 'utf8');
  const data = readFileSync(dataPath, 'utf8');

  const out = template
    .replace('/*__LEAFLET_CSS__*/', () => css)
    .replace('/*__DATA__*/', () => data)
    .replace('/*__LEAFLET_JS__*/', () => js);

  const dest = outPath || join(ROOT, `dist/${basin}-sst-simulator.html`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`Built ${dest} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
}

build({});
build({ basin: 'eastpacific', templatePath: join(ROOT, 'src/template-eastpacific.html'), dataPath: join(ROOT, 'data/generated/eastpacific-data.json') });
build({ basin: 'westpacific', templatePath: join(ROOT, 'src/template-wpac.html'), dataPath: join(ROOT, 'data/generated/westpacific-data.json') });

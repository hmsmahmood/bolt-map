const { copyFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

const source = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'node_modules',
  'maplibre-gl',
  'dist',
  'maplibre-gl-worker.mjs',
);
const targetDirectory = resolve(__dirname, '..', 'src', 'assets');
const target = resolve(targetDirectory, 'maplibre-gl-worker.mjs');

mkdirSync(targetDirectory, { recursive: true });
copyFileSync(source, target);

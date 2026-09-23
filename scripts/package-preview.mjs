import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBlueprint } from '@wp-playground/blueprints';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(path.join(dist, '.preview-'));
try {
  const bundle = path.join(staging, 'bundle');
  mkdirSync(bundle);
  cpSync(path.join(dist, 'canvas.zip'), path.join(bundle, 'canvas.zip'));
  const blueprint = {
    $schema: 'https://playground.wordpress.net/blueprint-schema.json',
    meta: { title: 'Canvas Demo', author: 'Automattic', description: 'Try the latest Canvas build in the WordPress editor.' },
    preferredVersions: { php: '8.3', wp: 'latest' },
    landingPage: '/wp-admin/canvas-preview.php',
    login: true,
    steps: [
      { step: 'installTheme', themeData: { resource: 'wordpress.org/themes', slug: 'twentytwentyfive' }, options: { activate: true } },
      { step: 'installPlugin', pluginData: { resource: 'bundled', path: '/canvas.zip' }, options: { activate: true } },
      { step: 'writeFile', path: '/tmp/canvas-preview.html', data: readFileSync(path.join(root, 'scripts/preview-content.html'), 'utf8') },
      { step: 'runPHP', code: readFileSync(path.join(root, 'scripts/setup-preview.php'), 'utf8') },
    ],
  };
  const validation = validateBlueprint(blueprint);
  if (!validation.valid) throw new Error(JSON.stringify(validation.errors));
  writeFileSync(path.join(bundle, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
  const archive = path.join(staging, 'canvas-preview.zip');
  const result = spawnSync('zip', ['-qr', archive, '.'], { cwd: bundle, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not create the Canvas Playground preview.');
  const destination = path.join(dist, 'canvas-preview.zip');
  renameSync(archive, destination);
  console.log(`Packaged Canvas Playground preview: ${destination}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

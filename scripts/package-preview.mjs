import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBlueprint } from '@wp-playground/blueprints';

const root = fileURLToPath(new URL('../', import.meta.url));
const regularPatterns = process.argv.includes('--regular-patterns');
const demo = regularPatterns
  ? { slug: 'regular-patterns', title: 'Regular Patterns', description: 'Explore regular WordPress blocks in the Site Editor.', content: 'regular-patterns-content.html' }
  : { slug: 'canvas', title: 'Canvas', description: 'Try the latest Canvas build in the WordPress editor.', content: 'preview-content.html' };
const content = readFileSync(path.join(root, 'scripts', demo.content), 'utf8');
if (!content.trim()) throw new Error('The demo content must not be empty.');
if (regularPatterns && (/<!--\s*wp:(?!core\/)[\w-]+\//.test(content) || content.includes('{{CANVAS_PLUGIN_URL}}'))) {
  throw new Error('The regular patterns demo must use core blocks without Canvas plugin assets.');
}
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(path.join(dist, '.preview-'));
try {
  const bundle = path.join(staging, 'bundle');
  mkdirSync(bundle);
  if (!regularPatterns) cpSync(path.join(dist, 'canvas.zip'), path.join(bundle, 'canvas.zip'));
  const blueprint = {
    $schema: 'https://playground.wordpress.net/blueprint-schema.json',
    meta: { title: `${demo.title} Demo`, author: 'Automattic', description: demo.description },
    preferredVersions: { php: '8.3', wp: 'latest' },
    landingPage: `/wp-admin/${demo.slug}-preview.php`,
    login: true,
    steps: [
      { step: 'installTheme', themeData: { resource: 'wordpress.org/themes', slug: 'twentytwentyfive' }, options: { activate: true } },
      ...(!regularPatterns ? [{ step: 'installPlugin', pluginData: { resource: 'bundled', path: '/canvas.zip' }, options: { activate: true } }] : []),
      { step: 'writeFile', path: '/tmp/canvas-preview.html', data: content },
      { step: 'writeFile', path: '/tmp/preview-config.json', data: JSON.stringify({ title: demo.title, slug: demo.slug }) },
      { step: 'runPHP', code: readFileSync(path.join(root, 'scripts/setup-preview.php'), 'utf8') },
    ],
  };
  const validation = validateBlueprint(blueprint);
  if (!validation.valid) throw new Error(JSON.stringify(validation.errors));
  writeFileSync(path.join(bundle, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
  const archive = path.join(staging, `${demo.slug}-preview.zip`);
  const result = spawnSync('zip', ['-qr', archive, '.'], { cwd: bundle, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not create the Playground preview.');
  const destination = path.join(dist, `${demo.slug}-preview.zip`);
  renameSync(archive, destination);
  console.log(`Packaged ${demo.title} Playground preview: ${destination}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

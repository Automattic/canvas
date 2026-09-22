import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginMounts } from './plugin-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wordpress = path.join(root, '.playground/wordpress');
const blueprint = path.join(root, '.playground/demo-blueprint.json');
const port = Number(process.env.PORT || 9403);
writeFileSync(blueprint, JSON.stringify({ steps: [{ step: 'runPHP', code: readFileSync(path.join(root, 'scripts/create-demo.php'), 'utf8') }] }));
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/@wp-playground/cli/cli.js'), 'run-blueprint',
  `--site-url=http://127.0.0.1:${port}`, `--blueprint=${blueprint}`,
  `--mount-before-install=${wordpress}:/wordpress`,
  ...pluginMounts(root),
  '--wordpress-install-mode=do-not-attempt-installing',
], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const demo = JSON.parse(readFileSync(path.join(wordpress, 'canvas-demo.json'), 'utf8'));
console.log(`${demo.created ? 'Created draft' : 'Existing draft'}: http://127.0.0.1:${port}/wp-admin/post.php?post=${demo.id}&action=edit`);

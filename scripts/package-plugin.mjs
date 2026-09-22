import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin } from './build-plugin.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(path.join(dist, '.plugin-'));
try {
  const version = buildPlugin(path.join(staging, 'canvas'));
  const archive = path.join(staging, 'canvas.zip');
  const result = spawnSync('zip', ['-qr', archive, 'canvas'], { cwd: staging, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not create the Canvas plugin ZIP.');
  const destination = path.join(dist, 'canvas.zip');
  renameSync(archive, destination);
  console.log(`Packaged Canvas ${version}: ${destination}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

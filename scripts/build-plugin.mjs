import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginEntries } from './plugin-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

// Both release formats use the same allowlist and an isolated production build.
// No local WordPress data, credentials, or development-only plugins are copied.
export function buildPlugin(destination) {
  const bootstrap = readFileSync(path.join(root, 'canvas.php'), 'utf8');
  const version = bootstrap.match(/^ \* Version: (.+)$/m)?.[1];
  const block = JSON.parse(readFileSync(path.join(root, 'src/block.json'), 'utf8'));
  const readme = readFileSync(path.join(root, 'readme.txt'), 'utf8');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!version || [block.version, pkg.version, readme.match(/^Stable tag: (.+)$/m)?.[1], bootstrap.match(/^const VERSION = '([^']+)';$/m)?.[1]].some(value => value !== version)) {
    throw new Error('Plugin, block, package, and readme versions must match before packaging.');
  }
  for (const field of ['Requires at least', 'Requires PHP']) {
    const header = bootstrap.match(new RegExp(`^ \\* ${field}: (.+)$`, 'm'))?.[1];
    if (!header || readme.match(new RegExp(`^${field}: (.+)$`, 'm'))?.[1] !== header) {
      throw new Error(`${field} must match in the plugin header and readme.`);
    }
  }
  mkdirSync(destination, { recursive: true });
  for (const entry of pluginEntries) {
    cpSync(path.join(root, entry), path.join(destination, entry), {
      recursive: true,
      filter: source => !['.DS_Store', 'Thumbs.db'].includes(path.basename(source)),
    });
  }
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/@wordpress/scripts/bin/wp-scripts.js'),
    'build', '--webpack-src-dir=src', `--output-path=${path.join(destination, 'build')}`,
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Canvas production build failed.');
  return version;
}

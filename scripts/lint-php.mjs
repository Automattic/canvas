import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function lintFile(file) {
  const result = spawnSync('php', ['-l', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function lint(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) lint(file);
    else if (file.endsWith('.php')) lintFile(file);
  }
}
lintFile(path.join(root, 'canvas.php'));
for (const directory of ['includes', 'patterns']) lint(path.join(root, directory));
lint(path.join(root, 'scripts'));

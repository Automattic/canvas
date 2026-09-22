import { adapterArchive } from './mcp-dependency.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginMounts } from './plugin-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const wordpress = path.join(root, '.playground/wordpress');
const port = Number(process.env.PORT || 9403);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

// Check before building or starting a second watcher against the same assets.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', (error) => reject(error.code === 'EADDRINUSE'
    ? new Error(`Port ${port} is already in use. If this Playground is running, open http://127.0.0.1:${port}/wp-admin/ or use npm run watch:blocks. Stop the existing server before restarting it.`)
    : error));
  probe.listen(port, () => probe.close(resolve));
});

mkdirSync(wordpress, { recursive: true });

const scripts = path.join(root, 'node_modules/@wordpress/scripts/bin/wp-scripts.js');
const buildArgs = ['--webpack-src-dir=src', '--output-path=build'];
const build = spawnSync(process.execPath, [scripts, 'build', ...buildArgs], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const adapterFile = fileURLToPath(await adapterArchive(new URL('../', import.meta.url)));
const watcher = spawn(process.execPath, [scripts, 'start', ...buildArgs], { cwd: root, stdio: 'inherit' });
const blueprint = JSON.parse(readFileSync(path.join(root, 'blueprint.json'), 'utf8'));
for (const step of blueprint.steps) if (step.step === 'installPlugin' && step.pluginData?.url?.includes('/mcp-adapter/')) step.pluginData = { resource: 'vfs', path: '/canvas-dependencies/' + path.basename(adapterFile) };
blueprint.steps.push({ step: 'mkdir', path: '/wordpress/wp-content/mu-plugins' },
  { step: 'writeFile', path: '/wordpress/wp-content/mu-plugins/canvas-local-api.php', data: readFileSync(path.join(root, 'scripts/playground-api-auth.php'), 'utf8') });
const devBlueprint = path.join(root, '.playground/dev-blueprint.json');
writeFileSync(devBlueprint, JSON.stringify(blueprint));
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/@wp-playground/cli/cli.js'),
  'server',
  `--port=${port}`,
  '--login',
  `--blueprint=${devBlueprint}`,
  `--mount-before-install=${wordpress}:/wordpress`,
  `--mount-before-install=${path.dirname(adapterFile)}:/canvas-dependencies`,
  ...pluginMounts(root),
  `--wordpress-install-mode=${existsSync(path.join(wordpress, 'wp-load.php'))
    ? 'install-from-existing-files-if-needed'
    : 'download-and-install'}`,
], { cwd: root, stdio: 'inherit' });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  watcher.kill('SIGTERM');
  server.kill('SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of [watcher, server]) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code ?? 0));
}

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginMounts } from './plugin-paths.mjs';
const root = new URL('../', import.meta.url);
const local = path => fileURLToPath(new URL(path, root));
const directory = process.env.CANVAS_ABILITIES_DIRECTORY
  ? path.resolve(process.env.CANVAS_ABILITIES_DIRECTORY)
  : local('.playground/abilities-test');
const wordpress = path.join(directory, 'wordpress');
if (!existsSync(local('build/block.json'))) throw new Error('Run npm run build before the abilities integration test.');
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const available = probe.address().port;
    probe.close(() => resolve(available));
  });
});
mkdirSync(wordpress, { recursive: true });
const reportPath = path.join(wordpress, 'canvas-abilities-test.json');
rmSync(reportPath, { force: true });
const blueprint = path.join(directory, 'blueprint.json');
writeFileSync(blueprint, JSON.stringify({
  $schema: 'https://playground.wordpress.net/blueprint-schema.json',
  preferredVersions: { wp: '7.1.3', php: '8.3' },
  features: { networking: false },
  steps: [
    { step: 'activatePlugin', pluginPath: '/wordpress/wp-content/plugins/playground-plugin/canvas.php' },
    { step: 'runPHP', code: readFileSync(local('scripts/test-abilities.php'), 'utf8') },
  ],
}));
const result = spawnSync(process.execPath, [local('node_modules/@wp-playground/cli/cli.js'),'run-blueprint',`--blueprint=${blueprint}`,
  '--wp=7.1.3', '--php=8.3', `--site-url=http://127.0.0.1:${port}`, `--mount-before-install=${wordpress}:/wordpress`,
  ...pluginMounts(local('.')),
  `--wordpress-install-mode=${existsSync(path.join(wordpress, 'wp-load.php')) ? 'install-from-existing-files-if-needed' : 'download-and-install'}`,
], { cwd: local('.'), stdio: 'inherit', timeout: 180000, killSignal: 'SIGKILL' });
if (result.error) console.error(`Abilities integration runtime failed: ${result.error.message}`);
if(result.status !== 0) process.exit(result.status || 1);
if (!existsSync(reportPath)) throw new Error('The abilities integration test did not produce a fresh report.');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
console.log(JSON.stringify(report,null,2));
if (report.error || !Number.isInteger(report.passed) || report.passed < 1 || !Array.isArray(report.checks) || report.checks.length !== report.passed) process.exitCode = 1;

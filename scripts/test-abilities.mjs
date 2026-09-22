import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pluginMounts } from './plugin-paths.mjs';
const root = new URL('../', import.meta.url);
const local = path => fileURLToPath(new URL(path, root));
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', () => reject(new Error('Stop npm run dev before running integration tests against this persistent site.')));
  probe.listen(9403, () => probe.close(resolve));
});
const blueprint = local('.playground/abilities-test-blueprint.json');
writeFileSync(blueprint, JSON.stringify({steps:[{step:'runPHP',code:readFileSync(local('scripts/test-abilities.php'),'utf8')}]}));
const result = spawnSync(process.execPath, [local('node_modules/@wp-playground/cli/cli.js'),'run-blueprint',`--blueprint=${blueprint}`,
  '--site-url=http://127.0.0.1:9403',`--mount-before-install=${local('.playground/wordpress')}:/wordpress`,
  ...pluginMounts(local('.')),'--wordpress-install-mode=do-not-attempt-installing'], {stdio:'inherit'});
if(result.status !== 0) process.exit(result.status || 1);
const report = JSON.parse(readFileSync(local('.playground/wordpress/canvas-abilities-test.json')));
console.log(JSON.stringify(report,null,2));
if(report.error) process.exitCode=1;

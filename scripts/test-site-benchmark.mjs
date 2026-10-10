import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginMounts } from './plugin-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const profileIndex = process.argv.indexOf('--profile');
const profile = profileIndex < 0 ? 'service' : process.argv[profileIndex + 1];
if (!['service', 'editorial', 'portfolio'].includes(profile)) {
	throw new Error('--profile must be service, editorial, or portfolio.');
}
const packaged = process.argv.includes('--packaged');
const siteName = profile === 'service' ? 'site-benchmark' : `site-benchmark-${profile}`;
const directory = path.join(root, '.playground', `${siteName}${packaged ? '-packaged' : ''}`);
const wordpress = path.join(directory, 'wordpress');
const port = Number(process.env.PORT || 9404);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('PORT must be an integer between 1 and 65535.');
}
await new Promise((resolve, reject) => {
	const probe = createServer();
	probe.once('error', reject);
	probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
if (packaged && !existsSync(path.join(root, 'dist/canvas.zip'))) {
	throw new Error('Run npm run package:plugin before the packaged site benchmark.');
}
if (!packaged && !existsSync(path.join(root, 'build/block.json'))) {
	throw new Error('Run npm run build before the site benchmark.');
}
mkdirSync(wordpress, { recursive: true });
const blueprint = path.join(directory, 'blueprint.json');
writeFileSync(blueprint, JSON.stringify({
	$schema: 'https://playground.wordpress.net/blueprint-schema.json',
	preferredVersions: { php: '8.3', wp: '7.1.3' },
	landingPage: '/wp-admin/site-editor.php',
	login: true,
	steps: [
		packaged
			? { step: 'installPlugin', pluginData: { resource: 'vfs', path: '/canvas-dist/canvas.zip' }, options: { activate: true } }
			: { step: 'activatePlugin', pluginPath: '/wordpress/wp-content/plugins/playground-plugin/canvas.php' },
		{ step: 'runPHP', code: `<?php define('CANVAS_BENCHMARK_PROFILE', '${profile}'); ?>` + readFileSync(path.join(root, 'scripts/site-benchmark.php'), 'utf8') },
	],
}));
const serve = process.argv.includes('--serve');
const result = spawnSync(process.execPath, [
	path.join(root, 'node_modules/@wp-playground/cli/cli.js'), serve ? 'server' : 'run-blueprint',
	'--wp=7.1.3', '--php=8.3',
	...(serve ? [`--port=${port}`, '--login'] : [`--site-url=http://127.0.0.1:${port}`]),
	`--blueprint=${blueprint}`, `--mount-before-install=${wordpress}:/wordpress`,
	...(packaged ? [`--mount=${path.join(root, 'dist')}:/canvas-dist`] : pluginMounts(root)),
	`--wordpress-install-mode=${existsSync(path.join(wordpress, 'wp-load.php')) ? 'install-from-existing-files-if-needed' : 'download-and-install'}`,
], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const report = JSON.parse(readFileSync(path.join(wordpress, 'canvas-site-benchmark.json'), 'utf8'));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;

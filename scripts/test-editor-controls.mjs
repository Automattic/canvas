import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { pluginMounts } from './plugin-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = {
	layout: ['./core-layout-editor-controls.mjs', 'testLayoutEditorControls'],
	media: ['./test-core-media-editor.mjs', 'testMediaEditorControls'],
	'image-logo': ['./test-image-logo.mjs', 'testImageLogoEditor'],
};
const selection = process.env.CANVAS_EDITOR_SUITE || 'all';
const browserName = process.env.CANVAS_EDITOR_BROWSER || 'chromium';
assert.ok(selection === 'all' || suites[selection], 'Unknown editor suite.');
assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'Unknown browser.');
const directory = path.resolve(process.env.CANVAS_EDITOR_DIRECTORY || path.join(root, `.playground/editor-controls-${selection}-${browserName}`));
const wordpress = path.join(directory, 'wordpress');
mkdirSync(wordpress, { recursive: true });
const port = await new Promise((resolve, reject) => {
	const probe = createServer();
	probe.once('error', reject);
	probe.listen(0, '127.0.0.1', () => {
		const value = probe.address().port;
		probe.close(() => resolve(value));
	});
});
const blueprint = path.join(directory, 'blueprint.json');
writeFileSync(blueprint, JSON.stringify({
	preferredVersions: { php: '8.3', wp: '7.1.3' },
	features: { networking: false },
	steps: [
		{ step: 'activatePlugin', pluginPath: '/wordpress/wp-content/plugins/playground-plugin/canvas.php' },
		{ step: 'runPHP', code: `<?php file_put_contents('/wordpress/canvas-audit-video.mp4', base64_decode('${readFileSync(path.join(root, 'scripts/fixtures/core-video.mp4')).toString('base64')}'));` },
		{ step: 'runPHP', code: readFileSync(path.join(root, 'scripts/test-core-blocks-seed.php'), 'utf8') },
	],
}));
const server = spawn(process.execPath, [
	path.join(root, 'node_modules/@wp-playground/cli/cli.js'), 'server',
	`--port=${port}`, '--wp=7.1.3', '--php=8.3', `--blueprint=${blueprint}`,
	`--mount-before-install=${wordpress}:/wordpress`, ...pluginMounts(root),
	`--wordpress-install-mode=${existsSync(path.join(wordpress, 'wp-load.php')) ? 'install-from-existing-files-if-needed' : 'download-and-install'}`,
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
let exited = false;
const stopped = new Promise(resolve => server.once('exit', () => { exited = true; resolve(); }));
for (const output of [server.stdout, server.stderr]) output.on('data', data => { log = (log + data).slice(-6000); });
server.once('error', error => { log += error.message; exited = true; });
let browser;
const report = { wordpress: '7.1.3', browser: browserName, suites: {}, failures: [] };
try {
	const deadline = Date.now() + 120000;
	while (!log.includes('Ready!')) {
		if (exited || Date.now() > deadline) throw new Error(`Editor audit Playground failed to start: ${log}`);
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	const origin = `http://127.0.0.1:${port}`;
	const seed = JSON.parse(readFileSync(path.join(wordpress, 'canvas-core-audit.json'), 'utf8'));
	browser = await { chromium, firefox, webkit }[browserName].launch({ headless: true });
	for (const [name, [module, method]] of Object.entries(suites)) {
		if (selection !== 'all' && selection !== name) continue;
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
		const page = await context.newPage();
		page.setDefaultTimeout(10000);
		page.setDefaultNavigationTimeout(30000);
		try {
			await page.goto(origin + '/wp-login.php');
			await page.getByLabel('Username or Email Address').fill('admin');
			await page.getByLabel('Password', { exact: true }).fill('password');
			await page.getByRole('button', { name: 'Log In', exact: true }).click();
			await page.waitForURL(/wp-admin/);
			await page.goto(`${origin}/wp-admin/post.php?post=${seed.id}&action=edit`);
			await page.waitForFunction(() => window.wp?.blocks?.getBlockType('tabor/canvas'));
			const welcome = page.locator('.components-modal__screen-overlay').getByRole('button', { name: 'Close', exact: true });
			if (await welcome.count()) await welcome.first().click();
			const helper = await import(module);
			const result = await helper[method](page, { seed, origin, directory });
			report.suites[name] = result;
			const checks = Array.isArray(result) ? result : result.results;
			assert.ok(Array.isArray(checks) && checks.length > 0, `${name} must return actual checks.`);
			report.failures.push(...checks.filter(check => !check.passed).map(check => ({ suite: name, ...check })));
		} catch (error) {
			report.failures.push({ suite: name, error: error.stack });
			await page.screenshot({ path: path.join(directory, `${name}-failure.png`), fullPage: true }).catch(() => {});
		} finally {
			writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
			await context.close();
		}
		console.log(`Editor suite ${name}: ${report.failures.filter(value => value.suite === name).length} failures.`);
	}
	console.log(JSON.stringify(report, null, 2));
	assert.deepEqual(report.failures, [], 'Editor controls must work and preserve saved content.');
} finally {
	await browser?.close();
	if (!exited) {
		server.kill('SIGTERM');
		await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000))]);
		if (!exited) { server.kill('SIGKILL'); await stopped; }
	}
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { pluginMounts } from './plugin-paths.mjs';
import { testNativeOverlay, testRotatedMeasurement } from './test-native-overlay.mjs';
import { canvasRows } from '../src/canvas-geometry.mjs';
import { testNativeFitText } from './test-native-fit-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.CANVAS_FLOW_DIRECTORY
	? path.resolve(process.env.CANVAS_FLOW_DIRECTORY)
	: path.join(root, '.playground/native-flow');
const wordpress = path.join(directory, 'wordpress');
const port = await new Promise((resolve, reject) => {
	const probe = createServer();
	probe.once('error', reject);
	probe.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
		const available = probe.address().port;
		probe.close(() => resolve(available));
	});
});
mkdirSync(wordpress, { recursive: true });
const blueprint = path.join(directory, 'blueprint.json');
writeFileSync(blueprint, JSON.stringify({
	$schema: 'https://playground.wordpress.net/blueprint-schema.json',
	preferredVersions: { php: '8.3', wp: '7.1.3' },
	features: { networking: false },
	steps: [
		{ step: 'activatePlugin', pluginPath: '/wordpress/wp-content/plugins/playground-plugin/canvas.php' },
		{ step: 'runPHP', code: "<?php putenv('CANVAS_NATIVE_FLOW_SEED=1'); ?>" + readFileSync(path.join(root, 'scripts/test-native-flow.php'), 'utf8') },
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
const checks = [];
try {
	const origin = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 90000;
	while (true) {
		if (exited || Date.now() > deadline) throw new Error(`Native flow Playground failed to start: ${log}`);
		const ready = await fetch(origin + '/wp-json/', { signal: AbortSignal.timeout(1000) }).then(response => response.ok).catch(() => false);
		if (ready && log.includes('Ready!') && existsSync(path.join(wordpress, 'canvas-native-flow.json'))) break;
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	const manifest = JSON.parse(readFileSync(path.join(wordpress, 'canvas-native-flow.json'), 'utf8'));
	assert.equal(manifest.passed, true, manifest.error || 'Native flow PHP assertions failed.');
	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext();
	const page = await context.newPage();
	const fractionalRows = canvasRows(32, 32, 1600, 4.902, 7.353);
	await page.setContent(`<div id="fractional-rows" style="display:grid;grid-template-rows:${fractionalRows.rowTemplate}"></div>`);
	const renderedHeight = await page.locator('#fractional-rows').evaluate(element => element.getBoundingClientRect().height);
	assert.ok(Math.abs(renderedHeight - fractionalRows.height) <= 0.125001, 'Long fractional grid tracks must not accumulate browser rounding error.');
	checks.push({ name: 'fractional-row-precision', renderedHeight, expectedHeight: fractionalRows.height });
	for (const width of [1440, 768, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		for (const route of manifest.routes) {
			assert.equal(new URL(route.url).origin, origin);
			const response = await page.goto(route.url, { waitUntil: 'networkidle' });
			assert.equal(response.status(), 200, `${route.name}: frontend response`);
			await page.evaluate(async () => { await document.fonts.ready; });
			const state = await page.evaluate(() => ({
				overflow: document.documentElement.scrollWidth > innerWidth + 1,
				canvas: document.querySelectorAll('.wp-block-tabor-canvas').length,
				queryCards: document.querySelectorAll('.wp-block-post-template .wp-block-tabor-canvas').length,
				paragraphs: document.querySelectorAll('.wp-block-post-content p').length,
				outside: [...document.querySelectorAll('.wp-block-post-content p,.wp-block-post-content h1,.wp-block-post-content h2,.wp-block-post-content figure')].filter(element => !element.closest('.wp-block-tabor-canvas')).length,
			}));
			assert.equal(state.overflow, false, `${route.name} at ${width}px: horizontal overflow`);
			assert.ok(state.canvas > 0, `${route.name}: Canvas output missing`);
			assert.equal(state.outside, 0, `${route.name}: content outside Canvas`);
			if (route.name.toLowerCase().includes('query')) assert.ok(state.queryCards > 0, 'Native query context must render repeated Canvas cards.');
			checks.push({ name: route.name, width, ...state });
		}
		if (manifest.stress_url) {
			await page.goto(manifest.stress_url, { waitUntil: 'networkidle' });
			await page.evaluate(async () => {
				await document.fonts.ready;
				const body = document.querySelector('.wp-block-post-content');
				const paragraph = [...body.querySelectorAll('p')].at(-1);
				paragraph.textContent += ' A longer passage preserves the reading rhythm as native article content grows.'.repeat(48);
				for (let index = 0; index < 3; index++) paragraph.parentElement.append(paragraph.cloneNode(true));
			});
			await page.waitForFunction(() => {
				const body = document.querySelector('.wp-block-post-content');
				const bottom = Math.max(...[...body.querySelectorAll('p')].map(element => element.getBoundingClientRect().bottom));
				const canvas = body.closest('.wp-block-tabor-canvas');
				const following = [...document.querySelectorAll('.wp-block-tabor-canvas')].filter(element => !element.contains(body) && !body.contains(element) && (body.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
				return canvas.getBoundingClientRect().bottom >= bottom - 2 && following.every(element => element.getBoundingClientRect().top >= bottom - 2);
			}, undefined, { timeout: 10000 });
			checks.push({ name: 'intrinsic-article-growth', width });
		}
	}
	for (const route of manifest.navigation_routes || []) {
		assert.equal(new URL(route.url).origin, origin);
		checks.push(await testNativeOverlay(page, route));
	}
	assert.equal(manifest.navigation_routes?.length, 2, 'Native direct and nested navigation fixtures must be present.');
	checks.push(await testRotatedMeasurement(page));
	assert.equal(new URL(manifest.fit_text_url).origin, origin);
	checks.push(...await testNativeFitText(page, manifest.fit_text_url));
	await page.goto(origin + '/wp-login.php');
	await page.getByLabel('Username or Email Address').fill('admin');
	await page.getByLabel('Password', { exact: true }).fill('password');
	await page.getByRole('button', { name: 'Log In', exact: true }).click();
	await page.waitForURL(/wp-admin/);
	for (const destination of [...(manifest.editors || []), ...manifest.routes.filter(route => route.editor_url).map(route => ({ name: route.name, url: route.editor_url }))]) {
		await page.goto(destination.url, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0);
		const invalid = await page.evaluate(() => {
			const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks || [])]);
			return flatten(wp.data.select('core/block-editor').getBlocks()).filter(block => block.isValid === false).map(block => block.name);
		});
		assert.deepEqual(invalid, [], `${destination.name}: native Gutenberg validity`);
		if (destination.name === 'Native Canvas Fit Text') {
			await page.waitForFunction(() => [document, ...[...document.querySelectorAll('iframe')].map(frame => frame.contentDocument)].some(document => document?.querySelector('.canvas-native-fit-0')));
			let heading;
			for (const frame of page.frames()) {
				const candidate = frame.locator('.canvas-native-fit-0');
				if (await candidate.count()) { heading = candidate.first(); break; }
			}
			assert.ok(heading, 'Native Fit Text must render in the real editor.');
			await heading.waitFor({ state: 'visible' });
			await page.waitForTimeout(500);
			const fit = await heading.evaluate(element => {
				const range = document.createRange();
				range.selectNodeContents(element);
				const css = getComputedStyle(element);
				return { fontSize: parseFloat(css.fontSize), textHeight: range.getBoundingClientRect().height, overflowWrap: css.overflowWrap };
			});
			assert.equal(fit.overflowWrap, 'normal');
			assert.ok(fit.fontSize > 8 && fit.textHeight < fit.fontSize * 2, JSON.stringify(fit));
			checks.push({ name: 'native-fit-text-real-editor', ...fit });
		}
		checks.push({ name: destination.name, editorValid: true });
	}
	const globalStyles = await page.evaluate(async () => {
		try {
		const themes = await wp.apiFetch({ path: '/wp/v2/themes?status=active&context=edit' });
		const endpoint = themes[0]._links['wp:user-global-styles'][0].href;
		const record = await wp.apiFetch({ url: `${endpoint}?context=edit` });
		if (Array.isArray(record.styles)) record.styles = {};
		await wp.apiFetch({ path: `/wp/v2/global-styles/${record.id}`, method: 'POST', data: { styles: { ...record.styles, typography: { ...record.styles.typography, fontFamily: 'Georgia, serif', fontSize: '24px', lineHeight: '1.8' } } } });
		return { id: record.id, styles: record.styles };
		} catch (error) { throw new Error(error.message || JSON.stringify(error)); }
	});
	try {
		const typographyUrl = new URL(manifest.stress_url);
		typographyUrl.searchParams.set('canvas_flow_styles', Date.now());
		await page.goto(typographyUrl.href, { waitUntil: 'networkidle' });
		const typography = await page.evaluate(() => {
			const paragraph = document.querySelector('.wp-block-post-content p');
			return { family: getComputedStyle(paragraph).fontFamily, size: getComputedStyle(paragraph).fontSize, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
		});
		assert.match(typography.family, /Georgia/i, 'Native global font changes must reach Canvas article content.');
		assert.ok(parseFloat(typography.size) >= 16 && parseFloat(typography.size) <= 24, 'Native 24px typography must retain WordPress responsive fluid scaling.');
		assert.equal(typography.overflow, false, 'Native global font changes introduced horizontal overflow.');
		checks.push({ name: 'native-global-typography', ...typography });
	} finally {
		// Load the editor again to use its authenticated native REST middleware.
		await page.goto(manifest.routes.find(route => route.editor_url).editor_url, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.wp?.apiFetch);
		const restored = await page.evaluate(record => wp.apiFetch({ path: `/wp/v2/global-styles/${record.id}`, method: 'POST', data: { styles: record.styles } }), globalStyles);
		assert.deepEqual(Array.isArray(restored.styles) ? {} : restored.styles, globalStyles.styles, 'Native global styles must be restored after the test.');
	}
	writeFileSync(path.join(directory, 'browser-report.json'), JSON.stringify({ passed: true, checks }, null, 2));
	console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
	await browser?.close();
	if (!exited) server.kill('SIGTERM');
	await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000))]);
	if (!exited) { server.kill('SIGKILL'); await stopped; }
}

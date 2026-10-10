import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { pluginMounts } from './plugin-paths.mjs';
import { ALLOWED_BLOCKS } from '../src/placement.mjs';
import { contentFixtures, testClassicEditor } from './core-content-fixtures.mjs';
import { contextFixtures, runContextInteraction, testNativeSearch } from './core-context-fixtures.mjs';

// This inventory intentionally distinguishes serialization from rendered coverage.
// Empty defaults and context-only children are not evidence of working frontend UI.
const root = fileURLToPath(new URL('../', import.meta.url));
const browserName = process.env.CANVAS_CORE_BROWSER || 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'CANVAS_CORE_BROWSER must be chromium, firefox, or webkit.');
const viewports = process.env.CANVAS_CORE_WIDTHS ? process.env.CANVAS_CORE_WIDTHS.split(',').map(Number) : [1440, 768, 390, 320];
assert.ok(viewports.length > 0 && viewports.every(width => [1440, 768, 390, 320].includes(width)), 'CANVAS_CORE_WIDTHS may contain only supported audit viewport widths.');
const directory = process.env.CANVAS_CORE_DIRECTORY ? path.resolve(process.env.CANVAS_CORE_DIRECTORY) : path.join(root, `.playground/core-blocks${browserName === 'chromium' ? '' : `-${browserName}`}`);
const wordpress = path.join(directory, 'wordpress');
mkdirSync(wordpress, { recursive: true });
const port = await new Promise((resolve, reject) => {
	const probe = createServer();
	probe.once('error', reject);
	probe.listen(0, '127.0.0.1', () => {
		const available = probe.address().port;
		probe.close(() => resolve(available));
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
try {
	const origin = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 120000;
	while (!log.includes('Ready!')) {
		if (exited || Date.now() > deadline) throw new Error(`Core audit Playground failed to start: ${log}`);
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	const seed = JSON.parse(readFileSync(path.join(wordpress, 'canvas-core-audit.json'), 'utf8'));
	const { id } = seed;
	const extraFixtures = [...contentFixtures({ origin, seed }), ...contextFixtures({ origin, seed })];
	browser = await { chromium, firefox, webkit }[browserName].launch({ headless: true });
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(30000);
	await page.goto(origin + '/wp-login.php');
	await page.getByLabel('Username or Email Address').fill('admin');
	await page.getByLabel('Password', { exact: true }).fill('password');
	await page.getByRole('button', { name: 'Log In', exact: true }).click();
	await page.waitForURL(/wp-admin/);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`${origin}/wp-admin/post.php?post=${id}&action=edit`);
	await page.waitForFunction(() => window.wp?.blocks?.getBlockType('tabor/canvas'));
	const report = await page.evaluate(async ({ allowed, id, extraFixtures, supportedBlocks }) => {
		const { createBlock, serialize, parse, getBlockTypes } = wp.blocks;
		const native = await wp.apiFetch({ path: '/wp/v2/block-types?context=edit' });
		const registered = new Map(getBlockTypes().map(type => [type.name, type]));
		const boundaries = {
			'core/block': 'Synced-pattern references need separate ownership and recursion safeguards; not admitted by the Canvas authoring contract.',
			'core/legacy-widget': 'Legacy PHP widget configuration belongs to the native Widgets editor, not Canvas authoring.',
			'core/missing': 'Recovery placeholder for unavailable block types, not authored content.',
			'core/more': 'Post excerpt parser delimiter, not a visual Canvas item.',
			'core/nextpage': 'Post pagination parser delimiter, not a visual Canvas item.',
			'core/page-list-item': 'Internal Page List editor representation; frontend coverage belongs to native Page List output.',
			'core/pattern': 'Pattern expansion directive, not a persisted visual Canvas item.',
			'core/post-comments': 'Deprecated legacy comments block; native Comments and descendants are tested instead.',
			'core/shortcode': 'Arbitrary registered shortcode execution is outside the safe Canvas authoring contract.',
			'core/text-columns': 'Deprecated legacy text columns; native Columns and Column are tested instead.',
		};
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		const rows = native.filter(type => type.name.startsWith('core/')).map(type => {
			const editor = registered.get(type.name);
			const contextual = [...(type.parent || []), ...(type.ancestor || [])];
			const row = {
				name: type.name,
				parent: type.parent || [], ancestor: type.ancestor || [], usesContext: type.uses_context || [],
				inserter: editor?.supports?.inserter !== false,
				canvasRoot: allowed.includes(type.name),
				contractSupported: supportedBlocks.includes(type.name),
				placement: contextual.length ? 'contextual-child' : allowed.includes(type.name) ? 'direct' : 'not-directly-supported',
				editorRegistered: Boolean(editor), serialization: 'not-tested', frontend: supportedBlocks.includes(type.name) ? 'needs-fixture' : 'outside-contract',
				remainingChecks: ['editor manipulation', 'keyboard and accessibility', 'context and data variations'],
				...(!supportedBlocks.includes(type.name) ? { boundary: boundaries[type.name] || 'Not admitted by the Canvas authoring contract.' } : {}),
			};
			if (['core/freeform', 'core/missing'].includes(type.name)) {
				row.serialization = 'not-applicable';
				row.note = 'Legacy HTML and missing-block recovery cannot be tested with an empty createBlock default.';
			} else if (editor) {
				try {
					const content = serialize(createBlock(type.name));
					const parsed = parse(content);
					row.serialization = parsed.length === 1 && parsed[0].name === type.name && flatten(parsed).every(block => block.isValid !== false) ? 'pass' : 'fail';
				} catch (error) { row.serialization = 'fail'; row.error = error.message; }
			}
			return row;
		}).sort((a, b) => a.name.localeCompare(b.name));
		const paragraph = () => createBlock('core/paragraph', { content: 'Readable native content with a longer sentence that wraps naturally on a small screen.' });
		const imageUrl = location.origin + '/wp-admin/images/wordpress-logo.png';
		const image = () => createBlock('core/image', { url: imageUrl, alt: 'Native image fixture' });
		const longParagraph = () => createBlock('core/paragraph', { content: 'Expanded native content should move the following section down. '.repeat(50) });
		const fixtures = [
			['core/paragraph', { content: 'Readable paragraph with <strong>bold</strong> and <em>emphasis</em>.' }],
			['core/heading', { content: 'A readable heading', level: 2 }],
			['core/buttons', {}, [createBlock('core/button', { text: 'Read more', url: '#audit' })]],
			['core/group', { className: 'core-audit-native-group' }, [paragraph(), createBlock('core/group', {}, [paragraph()]), createBlock('core/list', {}, [createBlock('core/list-item', { content: 'Native nested list' })])]],
			['core/list', {}, [createBlock('core/list-item', { content: 'First list item' }), createBlock('core/list-item', { content: 'Second list item' })]],
			['core/quote', { citation: 'An author' }, [paragraph()]],
			['core/details', { summary: 'More information' }, [longParagraph()]],
			['core/accordion', {}, [createBlock('core/accordion-item', {}, [createBlock('core/accordion-heading', { title: 'Expand accordion' }), createBlock('core/accordion-panel', {}, [longParagraph()])])]],
			['core/tabs', {}, [createBlock('core/tab-list', { tabs: [{ label: 'Short panel' }, { label: 'Long panel' }] }), createBlock('core/tab-panels', {}, [createBlock('core/tab-panel', { label: 'Short panel' }, [paragraph()]), createBlock('core/tab-panel', { label: 'Long panel' }, [longParagraph()])])]],
			['core/columns', {}, [createBlock('core/column', {}, [paragraph()]), createBlock('core/column', {}, [paragraph()])]],
			['core/gallery', { columns: 2 }, [image(), image()]],
			['core/image', { url: imageUrl, alt: 'Native image fixture' }],
			['core/cover', { url: imageUrl, dimRatio: 60, minHeight: 240 }, [paragraph()]],
			['core/media-text', { mediaUrl: imageUrl, mediaType: 'image', mediaAlt: 'Media text fixture' }, [paragraph()]],
			['core/table', { head: [{ cells: [{ content: 'Name', tag: 'th' }, { content: 'Value', tag: 'th' }] }], body: [{ cells: [{ content: 'Native table', tag: 'td' }, { content: 'Readable value', tag: 'td' }] }] }],
			['core/pullquote', { value: 'A readable native pull quote.', citation: 'An author' }],
			['core/site-tagline', {}],
			['core/loginout', {}],
			['core/calendar', {}],
			['core/page-list', {}],
			['core/social-links', {}, [createBlock('core/social-link', { service: 'wordpress', url: 'https://wordpress.org' })]],
			['core/code', { content: 'const readable = true;' }],
			['core/preformatted', { content: 'Preformatted native content' }],
			['core/verse', { content: 'A line of verse<br>A second line' }],
			['core/separator', {}],
			['core/spacer', { height: '48px' }],
			['core/search', { label: 'Search', buttonText: 'Search' }],
			['core/site-title', {}],
			['core/post-title', {}],
			['core/post-date', {}],
			['core/post-author-name', {}],
		].filter(([name]) => allowed.includes(name) && registered.has(name));
		const fixtureDetails = fixtures.map(([name]) => ({ name }));
		const nativeBlock = (name, attributes, children) => {
			if (name === 'core/html') {
				const { content, ...saved } = attributes;
				return createBlock(name, saved, children, [content]);
			}
			return createBlock(name, attributes, children);
		};
		const fromSpec = ([name, attributes = {}, children = []]) => nativeBlock(name, attributes, children.map(fromSpec));
		for (const fixture of extraFixtures) {
			if (!registered.has(fixture.block?.[0])) fixture.blocker = 'WordPress does not register this block in the post editor; its native editing surface is required.';
			if (fixture.blocker) {
				for (const name of fixture.covers || [fixture.block?.[0]]) {
					const row = rows.find(value => value.name === name);
					if (row) { row.frontend = 'blocked'; row.blocker = fixture.blocker; }
				}
				continue;
			}
			const [name, attributes = {}, children = []] = fixture.block;
			fixtures.push([name, attributes, children.map(fromSpec)]);
			fixtureDetails.push(fixture);
		}
		const canvases = fixtures.map(([name, attributes, children], index) => {
			const block = nativeBlock(name, { ...attributes, canvas: { desktop: { column: 1, columnSpan: 24, row: 1, rowSpan: 2 } } }, children);
			const canvas = createBlock('tabor/canvas', { align: 'full', desktopRows: 2, className: `core-audit-${index}` }, [block]);
			const parsed = parse(serialize(canvas));
			const names = [...new Set(flatten([block]).map(value => value.name))].filter(value => value.startsWith('core/'));
			fixtureDetails[index].covers = fixtureDetails[index].covers || names;
			for (const covered of fixtureDetails[index].covers) {
				const row = rows.find(value => value.name === covered);
				if (!row) continue;
				row.canvasSerialization = flatten(parsed).every(value => value.isValid !== false) ? 'pass' : 'fail';
				(row.testedWithin ||= []).push(fixtureDetails[index].name);
			}
			return canvas;
		});
		for (const [index, canvas] of canvases.entries()) {
			const coveredRows = rows.filter(value => fixtureDetails[index].covers.includes(value.name));
			try {
				const result = await wp.apiFetch({ path: `/wp-abilities/v1/abilities/canvas/validate-sections/run?${new URLSearchParams({ 'input[markup]': serialize(canvas) })}` });
				const normalized = result.valid === true ? parse(result.markup) : [];
				const normalizedValid = normalized.length === 1 && flatten(normalized).every(block => block.isValid !== false);
				if (normalizedValid) canvases[index] = normalized[0];
				for (const row of coveredRows) {
					if (row.aiValidation === 'fail') continue;
					row.aiValidation = result.valid === true && normalizedValid ? 'pass' : 'fail';
					if (row.aiValidation === 'fail') row.aiValidationResult = result;
				}
			} catch (error) { for (const row of coveredRows) { row.aiValidation = 'fail'; row.aiValidationResult = { code: error.code, message: error.message }; } }
		}
		await wp.apiFetch({ path: `/wp/v2/pages/${id}`, method: 'POST', data: { content: serialize([...canvases, createBlock('core/search', { label: 'Search', buttonText: 'Search', className: 'core-audit-control-search' })]) } });
		const normalIndexes = fixtureDetails.map((fixture, index) => !fixture.url ? index : null).filter(index => index !== null);
		for (let offset = 0; offset < normalIndexes.length; offset += 12) {
			const indexes = normalIndexes.slice(offset, offset + 12);
			const slug = `canvas-core-batch-${offset / 12}`;
			const existing = await wp.apiFetch({ path: `/wp/v2/pages?slug=${slug}&context=edit` });
			const batch = await wp.apiFetch({ path: `/wp/v2/pages${existing[0]?.id ? `/${existing[0].id}` : ''}`, method: 'POST', data: {
				title: `Canvas block audit batch ${offset / 12 + 1}`, slug, status: 'publish',
				content: serialize([...indexes.map(index => canvases[index]), createBlock('core/search', { label: 'Search', buttonText: 'Search', className: 'core-audit-control-search' })]),
			} });
			for (const index of indexes) fixtureDetails[index].pageUrl = `${location.origin}/?page_id=${batch.id}`;
		}
		return { wordpress: '7.1.3', rows, fixtures: fixtures.map(([name], index) => ({ ...fixtureDetails[index], blockName: name, selector: `.core-audit-${index}` })) };
	}, { allowed: [...ALLOWED_BLOCKS, 'core/group'], id, extraFixtures, supportedBlocks: seed.supportedBlocks });
	report.browser = browserName;
	report.requestedViewports = viewports;
	writeFileSync(path.join(directory, 'report-in-progress.json'), JSON.stringify(report, null, 2));
	console.log(`Core inventory: ${report.rows.length} registered types, ${report.fixtures.length} fixtures.`);
	for (const width of viewports) {
		await page.setViewportSize({ width, height: 1000 });
		const ordinaryUrl = report.fixtures.find(fixture => fixture.blockName === 'core/search').pageUrl;
		await page.goto(ordinaryUrl, { waitUntil: 'networkidle' });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(300);
		for (const fixture of [...report.fixtures].sort((a, b) => (a.url || a.pageUrl).localeCompare(b.url || b.pageUrl))) {
			const target = new URL(fixture.url || fixture.pageUrl);
			if (fixture.url) {
				target.searchParams.set('canvas_audit_page', id);
				target.searchParams.set('canvas_audit_fixture', fixture.selector.slice(1));
			}
			if (page.url() !== target.href) {
				await page.goto(target.href, { waitUntil: 'networkidle' });
				await page.evaluate(() => document.fonts.ready);
				await page.waitForTimeout(300);
			}
			await page.locator(fixture.selector).scrollIntoViewIfNeeded();
			await page.locator(fixture.selector).locator('img').evaluateAll(async images => {
				await Promise.race([Promise.all(images.map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 5000))]);
			});
			const state = await page.locator(fixture.selector).evaluate(element => {
				const rect = element.getBoundingClientRect();
				const items = [...element.querySelectorAll('.canvas__item')].filter(item => item.closest('.wp-block-tabor-canvas') === element);
				const images = [...element.querySelectorAll('img')].map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth }));
				return { width: rect.width, height: rect.height, overflow: element.scrollWidth > element.clientWidth + 2, visible: rect.width > 0 && rect.height > 0, items: items.length, renderedChildren: items.reduce((count, item) => count + item.children.length, 0), images };
			});
			const selectors = {
				'core/paragraph': 'p', 'core/heading': 'h1,h2,h3,h4,h5,h6', 'core/list-item': 'li',
				'core/button': '.wp-block-button__link', 'core/social-link': '.wp-social-link',
				...(fixture.expected?.selectors || {}),
			};
			if (fixture.expected?.selector) selectors[fixture.blockName] = fixture.expected.selector;
			for (const name of fixture.covers) {
				const row = report.rows.find(value => value.name === name);
				if (!row) continue;
				const selector = selectors[name] || `.wp-block-${name.slice(5)}`;
				const rendered = await page.locator(fixture.selector).locator(selector).count();
				const expectedText = fixture.expected?.text;
				const ownText = fixture.expected?.texts?.[name];
				const textPresent = (!expectedText || (await page.locator(fixture.selector).textContent()).includes(expectedText)) && (!ownText || (await page.locator(fixture.selector).locator(selector).allTextContents()).join(' ').includes(ownText));
				(row.viewports ||= []).push({ fixture: fixture.name, viewport: width, ...state, selector, rendered, textPresent });
				row.frontend = row.viewports.every(value => value.visible && !value.overflow && value.items > 0 && value.renderedChildren > 0 && value.images.every(image => image.loaded) && value.rendered > 0 && value.textPresent) ? 'smoke-pass' : 'fail';
			}
			if (width === 1440 && ['core/columns', 'core/media-text', 'core/gallery', 'core/table'].includes(fixture.blockName)) {
				const canvas = page.locator(fixture.selector);
				const original = await canvas.getAttribute('style');
				await canvas.evaluate(element => { element.style.width = '390px'; element.style.maxWidth = '100%'; });
				await page.waitForTimeout(300);
				const narrow = await canvas.evaluate(element => ({ width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth + 2 }));
				(report.narrowDesktop ||= []).push({ name: fixture.blockName, ...narrow });
				await canvas.evaluate((element, style) => { if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style); }, original);
				await page.waitForTimeout(100);
			}
			if (width === 1440) for (const check of fixture.checks || []) {
				if (check.type === 'classic-edit') continue;
				const result = { fixture: fixture.name, type: check.type, passed: false };
				try {
					const element = page.locator(fixture.selector).locator(check.selector).first();
					if (check.type === 'media') {
						await element.evaluate(async media => {
							media.muted = true;
							await Promise.race([media.play(), new Promise((resolve, reject) => setTimeout(() => reject(new Error('Media playback did not start within 5 seconds.')), 5000))]);
						});
						await page.waitForTimeout(250);
						Object.assign(result, await element.evaluate(media => ({ duration: media.duration, currentTime: media.currentTime, src: media.currentSrc, videoWidth: media.videoWidth, error: media.error?.message })));
						await element.evaluate(media => media.pause());
						result.passed = result.duration >= check.minDuration && result.currentTime > 0 && result.src === check.src && (!check.minVideoWidth || result.videoWidth >= check.minVideoWidth) && !result.error;
					} else if (check.type === 'download') {
						const href = await element.getAttribute('href');
						const response = await page.request.get(href);
						result.passed = href === check.href && response.ok() && (await response.body()).length > 0;
					} else if (check.type === 'embed') {
						const handle = await element.elementHandle();
						const frame = await handle.contentFrame();
						result.passed = await element.getAttribute('src') === check.src && Boolean(frame) && (await frame.locator('body').textContent()).includes(check.text);
					} else if (check.type === 'math') {
						result.passed = (await element.textContent()).replace(/\s/g, '') === check.text;
					} else if (check.type === 'icon') {
						result.passed = await element.locator('path').count() >= check.minPaths;
					} else if (check.type === 'playlist') {
						const tracks = element.locator('.wp-block-playlist-track__button');
						result.tracks = await tracks.count();
						await element.evaluate(element => {
							element.__canvasAuditPlayback = null;
							element.addEventListener('waveformplayer:timeupdate', event => { const { currentTime, duration, url } = event.detail; element.__canvasAuditPlayback = { currentTime, duration, url }; }, { capture: true });
						});
						await tracks.nth(1).click();
						await page.waitForFunction(selector => document.querySelector(selector)?.__canvasAuditPlayback?.currentTime > 0, `${fixture.selector} ${check.selector}`, { timeout: 5000 });
						result.playback = await element.evaluate(element => element.__canvasAuditPlayback);
						result.selected = await tracks.nth(1).getAttribute('aria-current');
						result.passed = result.tracks === check.tracks && result.playback.duration > 0 && result.selected === 'true' && (!check.src || result.playback.url === check.src);
					} else throw new Error(`Unknown fixture check: ${check.type}`);
				} catch (error) { result.error = error.message; }
				(report.behaviorChecks ||= []).push(result);
			}
			writeFileSync(path.join(directory, 'report-in-progress.json'), JSON.stringify(report, null, 2));
			await page.locator(fixture.selector).screenshot({ path: path.join(directory, `${fixture.selector.slice(1)}-${width}.png`), timeout: 5000 });
			if (width === 1440 && typeof fixture.interaction === 'object') {
				(report.behaviorChecks ||= []).push(...await runContextInteraction(page, fixture, target.href));
			}
		}
		writeFileSync(path.join(directory, 'report-in-progress.json'), JSON.stringify(report, null, 2));
		console.log(`Core frontend fixtures completed at ${width}px.`);
		if (page.url() !== ordinaryUrl) await page.goto(ordinaryUrl, { waitUntil: 'networkidle' });
		const search = report.fixtures.find(fixture => fixture.name === 'core/search');
		const searchComparison = await page.evaluate(selector => {
			const measure = element => {
				const range = document.createRange();
				range.selectNodeContents(element);
				const rects = [...range.getClientRects()];
				return { lines: new Set(rects.map(rect => Math.round(rect.top))).size, width: element.getBoundingClientRect().width, overflowWrap: getComputedStyle(element).overflowWrap };
			};
			return { canvas: measure(document.querySelector(`${selector} button`)), native: measure(document.querySelector('.core-audit-control-search button')) };
		}, search.selector);
		(report.searchComparison ||= []).push({ width, ...searchComparison });
		if (width === 1440) (report.behaviorChecks ||= []).push(await testNativeSearch(page, search.selector, origin));
		await page.screenshot({ path: path.join(directory, `core-blocks-${width}.png`), fullPage: true });
		for (const [name, trigger, content] of [
			['core/details', 'summary', 'details'],
			['core/accordion', 'button', '.wp-block-accordion'],
			['core/tabs', 'button', '.wp-block-tabs'],
		]) {
			const fixture = report.fixtures.find(value => value.name === name);
			if (!fixture) continue;
			if (page.url() !== fixture.pageUrl) await page.goto(fixture.pageUrl, { waitUntil: 'networkidle' });
			const before = await page.locator(fixture.selector).evaluate(element => element.getBoundingClientRect().height);
			const control = page.locator(`${fixture.selector} ${trigger}`).nth(name === 'core/tabs' ? 1 : 0);
			if (!await control.count()) {
				(report.interactiveExpansion ||= []).push({ name, width, before, error: 'Native interactive control missing from rendered output.' });
				continue;
			}
			await control.click();
			await page.waitForTimeout(500);
			const opened = await page.locator(fixture.selector).evaluate((element, selector) => {
				const rect = element.getBoundingClientRect();
				const details = element.querySelector(selector).getBoundingClientRect();
				const following = element.nextElementSibling?.getBoundingClientRect();
				return { height: rect.height, containsContent: rect.bottom >= details.bottom - 2, followingClear: !following || following.top >= details.bottom - 2 };
			}, content);
			(report.interactiveExpansion ||= []).push({ name, width, before, ...opened });
			const close = page.locator(`${fixture.selector} ${trigger}`).first();
			await close.focus();
			await page.keyboard.press('Enter');
			await page.waitForTimeout(300);
			const closed = await page.locator(fixture.selector).evaluate(element => element.getBoundingClientRect().height);
			(report.interactiveCollapse ||= []).push({ name, width, before, closed, restored: Math.abs(closed - before) < 2 });
		}
	}
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`${origin}/wp-admin/post.php?post=${id}&action=edit`);
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.some(block => block.name === 'tabor/canvas'));
	report.savedEditorInvalid = await page.evaluate(() => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		return flatten(wp.data.select('core/block-editor').getBlocks()).filter(block => block.isValid === false).map(block => block.name);
	});
	const columnsFixture = report.fixtures.find(fixture => fixture.blockName === 'core/columns');
	let columnText;
	for (const frame of page.frames()) {
		const candidate = frame.locator(`${columnsFixture.selector} .wp-block-column p[contenteditable="true"]`).first();
		if (await candidate.count()) { columnText = candidate; break; }
	}
	assert.ok(columnText, 'Native Columns paragraph must be rendered as editable text in the real editor.');
	const welcome = page.locator('.components-modal__screen-overlay').getByRole('button', { name: 'Close', exact: true });
	await welcome.first().waitFor({ state: 'visible', timeout: 2000 }).catch(error => {
		if (error.name !== 'TimeoutError') throw error;
	});
	if (await welcome.first().isVisible()) await welcome.first().click();
	await columnText.dblclick();
	await columnText.press('ControlOrMeta+A');
	await columnText.pressSequentially('Edited native column content survives save and reload.');
	await page.waitForFunction(() => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		return flatten(wp.data.select('core/block-editor').getBlocks()).some(block => String(block.attributes.content).includes('Edited native column content survives save and reload.'));
	});
	await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
	await page.reload();
	await page.waitForFunction(() => {
		const blocks = window.wp?.data?.select('core/block-editor')?.getBlocks() || [];
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		return flatten(blocks).some(block => String(block.attributes.content).includes('Edited native column content survives save and reload.'));
	});
	report.nativeRichTextEdit = 'pass';
	for (const fixture of report.fixtures) for (const check of fixture.checks || []) {
		if (check.type === 'classic-edit') report.classicEditor = await testClassicEditor(page, fixture.selector, check.text);
	}
	report.savedEditorInvalidAfterEdit = await page.evaluate(() => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		return flatten(wp.data.select('core/block-editor').getBlocks()).filter(block => block.isValid === false).map(block => block.name);
	});
	await page.evaluate(() => {
		const { createBlock } = wp.blocks;
		const group = createBlock('core/group', { allowedBlocks: ['core/paragraph'], className: 'core-audit-restricted-group' }, [createBlock('core/paragraph', { content: 'Restricted native group' })]);
		wp.data.dispatch('core/block-editor').insertBlocks(createBlock('tabor/canvas', {}, [group]));
	});
	await page.waitForFunction(() => {
		const store = wp.data.select('core/block-editor');
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		const restricted = flatten(store.getBlocks()).find(block => block.attributes.className === 'core-audit-restricted-group');
		return restricted && store.getBlockListSettings(restricted.clientId)?.allowedBlocks;
	});
	report.nativeGroup = await page.evaluate(() => {
		const store = wp.data.select('core/block-editor');
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		const blocks = flatten(store.getBlocks());
		const restricted = blocks.find(block => block.attributes.className === 'core-audit-restricted-group');
		const ordinary = blocks.find(block => block.attributes.className === 'core-audit-native-group');
		return {
			restrictedAllowed: store.getBlockListSettings(restricted.clientId)?.allowedBlocks,
			nestedGroupAllowed: store.canInsertBlockType('core/group', ordinary.clientId),
			listAllowed: store.canInsertBlockType('core/list', ordinary.clientId),
		};
	});
	report.summary = {
		registered: report.rows.length,
		direct: report.rows.filter(row => row.canvasRoot).length,
		contextual: report.rows.filter(row => row.placement === 'contextual-child').length,
		unsupportedRoots: report.rows.filter(row => row.placement === 'not-directly-supported' && row.inserter).map(row => row.name),
		serializationFailures: report.rows.filter(row => row.serialization === 'fail' || row.canvasSerialization === 'fail').map(row => row.name),
		frontendSmoke: report.rows.filter(row => row.frontend === 'smoke-pass').length,
		frontendFailures: report.rows.filter(row => row.frontend === 'fail').map(row => row.name),
		aiValidationFailures: report.rows.filter(row => row.aiValidation === 'fail').map(row => row.name),
		behaviorFailures: (report.behaviorChecks || []).filter(check => !check.passed),
		narrowDesktopFailures: (report.narrowDesktop || []).filter(check => check.overflow || check.width <= 0 || check.width > 391),
		coverageGaps: report.rows.filter(row => row.contractSupported && row.frontend === 'needs-fixture').map(row => row.name),
		blockers: report.rows.filter(row => row.frontend === 'blocked').map(row => ({ name: row.name, reason: row.blocker })),
	};
	writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
	writeFileSync(path.join(directory, 'report.md'), [
		'# Core Block Compatibility Audit',
		'',
		`WordPress 7.1.3; ${browserName}. Frontend fixtures checked at ${viewports.join(', ')} pixels. A smoke pass verifies block-specific output, context text, image loading, and horizontal fit. Separate behavior checks exercise local audio/video playback, downloads, local embeds, native controls, and editing. This is not a complete accessibility or external-service certification.`,
		'',
		'Contextual children must remain inside their native parents. A direct placement entry does not override those WordPress rules. Blocks marked needs-fixture have not received a rendered frontend check in this suite.',
		'',
		'| Block | Placement | Default Serialization | Frontend | AI Validation | Required Parent or Ancestor |',
		'| --- | --- | --- | --- | --- | --- |',
		...report.rows.map(row => `| ${row.name} | ${row.placement} | ${row.serialization} | ${row.frontend} | ${row.aiValidation || 'needs-fixture'} | ${[...row.parent, ...row.ancestor].join(', ') || 'None'} |`),
		'',
		'## Explicit Boundaries',
		'',
		...report.rows.filter(row => row.boundary || row.blocker).map(row => `- ${row.name}: ${row.boundary || row.blocker}`),
		'',
		'Details, Accordion, and Tabs additionally receive pointer expansion and keyboard collapse checks, including surrounding content flow. Native Group restrictions and nested insertion permissions are checked in the real editor. Search labels are compared with a native non-Canvas control.',
		'',
	].join('\n'));
	console.log(JSON.stringify(report.summary, null, 2));
	assert.deepEqual(report.savedEditorInvalid, [], 'Saved Canvas fixture blocks must remain valid.');
	assert.deepEqual(report.savedEditorInvalidAfterEdit, [], 'All saved Canvas fixtures must remain valid after editing and reopening.');
	assert.deepEqual(report.summary.serializationFailures, [], 'Registered core defaults and Canvas fixtures must round-trip native serialization.');
	assert.deepEqual(report.summary.aiValidationFailures, [], 'Native serialized Canvas fixtures must pass AI authoring validation.');
	assert.deepEqual(report.nativeGroup.restrictedAllowed, ['core/paragraph'], 'Canvas must preserve authored native Group restrictions.');
	assert.equal(report.nativeGroup.nestedGroupAllowed, true, 'Native Group must allow nested Group.');
	assert.equal(report.nativeGroup.listAllowed, true, 'Native Group must allow native List.');
	assert.deepEqual(report.summary.frontendFailures, [], 'Rendered core fixtures must fit Canvas at every tested width.');
	assert.deepEqual(report.summary.behaviorFailures, [], 'Native fixture behaviors must remain functional inside Canvas.');
	assert.deepEqual(report.summary.narrowDesktopFailures, [], 'Native layout composites must fit a narrow Canvas at desktop viewport width.');
	assert.deepEqual(report.summary.coverageGaps, [], 'Every supported registered core block needs a meaningful frontend fixture or an explicit named blocker.');
	for (const state of report.interactiveExpansion || []) {
		assert.ok(state.height > state.before && state.containsContent && state.followingClear, `${state.name} expansion at ${state.width}px must grow Canvas and preserve following flow: ${JSON.stringify(state)}`);
	}
	for (const state of report.interactiveCollapse || []) assert.ok(state.restored, `${state.name} keyboard collapse must restore Canvas height: ${JSON.stringify(state)}`);
	for (const state of report.searchComparison) assert.equal(state.canvas.lines, 1, `Search button label must remain readable at ${state.width}px: ${JSON.stringify(state)}`);
} finally {
	await browser?.close();
	if (!exited) server.kill('SIGTERM');
	await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000))]);
	if (!exited) { server.kill('SIGKILL'); await stopped; }
}

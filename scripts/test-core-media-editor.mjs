import { contentFixtures, testClassicEditor } from './core-content-fixtures.mjs';

export async function testMediaEditorControls(page, { seed, origin }) {
	const specs = contentFixtures({ seed, origin }).filter(fixture => fixture.block[0] !== 'core/widget-group');
	const image = ['core/image', { id: seed.media.image.id, url: seed.media.image.url, alt: 'Editor fixture image' }, []];
	const paragraph = ['core/paragraph', { content: 'Native editor content.' }, []];
	specs.push(
		{ block: ['core/gallery', { columns: 2 }, [image, image]] },
		{ block: ['core/cover', { id: seed.media.image.id, url: seed.media.image.url, dimRatio: 50, minHeight: 240 }, [paragraph]] },
		{ block: ['core/media-text', { mediaId: seed.media.image.id, mediaUrl: seed.media.image.url, mediaType: 'image', mediaAlt: 'Native media text' }, [paragraph]] }
	);
	const id = await page.evaluate(async fixtures => {
		const { createBlock, serialize, getBlockType } = wp.blocks;
		const build = ([name, attributes = {}, children = []]) => {
			if (name === 'core/html') {
				const { content, ...saved } = attributes;
				return createBlock(name, saved, children.map(build), [content]);
			}
			return createBlock(name, attributes, children.map(build));
		};
		const blocks = fixtures.filter(fixture => getBlockType(fixture.block[0])).map(fixture => createBlock('tabor/canvas', { className: `media-control-${fixture.block[0].split('/')[1]}` }, [build(fixture.block)]));
		const post = await wp.apiFetch({ path: '/wp/v2/pages', method: 'POST', data: { title: 'Isolated media editor controls', status: 'draft', content: serialize(blocks) } });
		return post.id;
	}, specs);
	await page.goto(`${origin}/wp-admin/post.php?post=${id}&action=edit`);
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks().length);
	await page.waitForTimeout(500);
	const welcome = page.locator('.components-modal__screen-overlay').getByRole('button', { name: 'Close', exact: true });
	if (await welcome.count()) await welcome.first().click();
	const results = [];
	const inventory = [];
	const select = async type => {
		const clientId = await page.evaluate(name => {
			const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
			const block = flatten(wp.data.select('core/block-editor').getBlocks()).find(item => item.name === name);
			if (!block) throw new Error(`Native editor block unavailable: ${name}`);
			wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
			return block.clientId;
		}, type);
		const settings = page.getByRole('button', { name: 'Settings', exact: true });
		if (await settings.getAttribute('aria-pressed') !== 'true') await settings.click();
		await page.waitForTimeout(150);
		return clientId;
	};
	const attrs = clientId => page.evaluate(value => wp.data.select('core/block-editor').getBlockAttributes(value), clientId);
	const persisted = [];
	const cases = [
		['core/audio', 'Autoplay', 'autoplay', 'toggle'],
		['core/audio', 'Loop', 'loop', 'toggle'],
		['core/audio', 'Preload', 'preload', 'select', 'none'],
		['core/video', 'Autoplay', 'autoplay', 'toggle'],
		['core/video', 'Loop', 'loop', 'toggle'],
		['core/video', 'Muted', 'muted', 'toggle'],
		['core/video', 'Playback controls', 'controls', 'toggle'],
		['core/video', 'Play inline', 'playsInline', 'toggle'],
		['core/video', 'Preload', 'preload', 'select', 'none'],
		['core/file', 'Show download button', 'showDownloadButton', 'toggle'],
		['core/gallery', 'Columns', 'columns', 'number', '1'],
		['core/gallery', 'Crop images to fit', 'imageCrop', 'toggle'],
		['core/cover', 'Fixed background', 'hasParallax', 'toggle'],
		['core/cover', 'Repeated background', 'isRepeated', 'toggle'],
		['core/media-text', 'Stack on mobile', 'isStackedOnMobile', 'toggle'],
		['core/media-text', 'Crop image to fill', 'imageFill', 'toggle'],
		['core/embed', 'Resize for smaller devices', 'allowResponsive', 'toggle'],
		['core/playlist', 'Show tracklist', 'showTracklist', 'toggle'],
		['core/playlist', 'Show images', 'showImages', 'toggle'],
		['core/playlist', 'Show artists', 'showArtists', 'toggle'],
		['core/playlist', 'Show track numbers', 'showNumbers', 'toggle'],
		['core/playlist', 'Show track length', 'showTrackLength', 'toggle'],
	];
	// Keep the default smoke bounded; the remaining declarations are an explicit
	// inventory, not claims that every media setting has been exercised.
	const smoke = cases.filter(([type, label]) => [
		'core/audio:Loop', 'core/video:Muted', 'core/file:Show download button',
	].includes(`${type}:${label}`));
	inventory.push({ untestedControls: cases.filter(entry => !smoke.includes(entry)).map(([type, label]) => ({
		type, label,
		...(type === 'core/gallery' && label === 'Columns' ? { reason: 'The expected Columns control was not visible in the native editor panel; its UI path remains unverified.' } : {}),
	})) });
	for (const [type, label, key, action, value] of smoke) {
		const result = { type, control: label, action, passed: false };
		try {
			const clientId = await select(type);
			const before = await attrs(clientId);
			const control = page.getByLabel(label, { exact: true }).first();
			await control.waitFor({ state: 'visible', timeout: 3000 });
			if (action === 'toggle') await control.click();
			else if (action === 'select') await control.selectOption(value);
			else { await control.fill(value); await control.press('Tab'); }
			const expected = action === 'toggle' ? !before[key] : action === 'number' ? Number(value) : value;
			await page.waitForFunction(({ id, attribute, expectedValue }) => wp.data.select('core/block-editor').getBlockAttributes(id)?.[attribute] === expectedValue, { id: clientId, attribute: key, expectedValue: expected }, { timeout: 3000 });
			persisted.push({ type, key, value: expected });
			result.passed = true;
			result.before = before[key];
			result.after = expected;
		} catch (error) { result.error = error.message; result.editorText = (await page.locator('body').innerText()).slice(-2500); }
		results.push(result);
	}
	for (const type of [...new Set(smoke.map(([type]) => type))]) {
		try {
			await select(type);
			const controls = await page.locator('.interface-interface-skeleton__sidebar').evaluateAll(nodes => nodes.flatMap(node => [...node.querySelectorAll('button,input,select,textarea')].filter(control => control.getClientRects().length).map(control => ({ tag: control.tagName, type: control.type || '', label: control.getAttribute('aria-label') || [...(control.labels || [])].map(label => label.textContent.trim()).join(' ') || control.textContent.trim() }))));
			inventory.push({ type, visibleControls: controls, untested: ['Media replacement and upload dialogs', 'Advanced and styling panels', 'Keyboard navigation and undo/redo for every setting'] });
		} catch (error) { inventory.push({ type, error: error.message }); }
	}
	await page.evaluate(async () => {
		await wp.data.dispatch('core/editor').savePost();
		if (wp.data.select('core/editor').didPostSaveRequestFail()) throw new Error('Media control draft failed to save.');
	});
	await page.reload();
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks().length);
	for (const expected of persisted) {
		const actual = await page.evaluate(({ type, key }) => {
			const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
			return flatten(wp.data.select('core/block-editor').getBlocks()).find(block => block.name === type)?.attributes[key];
		}, expected);
		results.push({ type: expected.type, control: expected.key, action: 'save and reopen', passed: actual === expected.value, expected: expected.value, actual });
	}
	try {
		const result = await testClassicEditor(page, '.media-control-freeform', 'Classic content edited and reopened.');
		results.push({ type: 'core/freeform', action: 'Classic modal edit, save and reopen', passed: true, ...result });
	} catch (error) { results.push({ type: 'core/freeform', action: 'Classic modal edit, save and reopen', passed: false, error: error.message }); }
	return { id, results, inventory };
}

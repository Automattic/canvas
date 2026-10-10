import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Runs on a disposable draft in the isolated compatibility Playground.
export async function testImageLogoEditor(page, { seed, origin, directory }) {
	const results = [];
	let replacedLogoId;
	const draft = await page.evaluate(async ({ media }) => {
		const { createBlock, serialize } = wp.blocks;
		const image = createBlock('core/image', { id: media.id, url: media.url, alt: 'Canvas image editing fixture', canvas: { desktop: { column: 1, columnSpan: 8, row: 1, rowSpan: 4 } } });
		const logo = createBlock('core/site-logo', { width: 80, isLink: true, canvas: { desktop: { column: 1, columnSpan: 8, row: 1, rowSpan: 4 } } });
		return wp.apiFetch({ path: '/wp/v2/pages', method: 'POST', data: { title: 'Canvas image and logo editor audit', status: 'draft', content: serialize([createBlock('tabor/canvas', { align: 'full', desktopRows: 5 }, [image]), createBlock('tabor/canvas', { align: 'full', desktopRows: 5 }, [logo]), createBlock('core/site-logo', { width: 120, className: 'canvas-logo-native-control' })]) } });
	}, { media: seed.media.image });
	const editorUrl = `${origin}/wp-admin/post.php?post=${draft.id}&action=edit`;
	await page.goto(editorUrl);
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.some(block => block.name === 'tabor/canvas'));
	const dismiss = page.locator('.components-modal__screen-overlay').getByRole('button', { name: 'Close', exact: true });
	if (await dismiss.count()) { await dismiss.first().click(); await page.locator('.components-modal__screen-overlay').waitFor({ state: 'hidden' }); }
	const ids = await page.evaluate(() => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		const blocks = flatten(wp.data.select('core/block-editor').getBlocks());
		return Object.fromEntries(['core/image', 'core/site-logo'].map(name => [name, blocks.find(block => block.name === name).clientId]));
	});
	let frame;
	for (const candidate of page.frames()) if (await candidate.locator(`[data-block="${ids['core/image']}"]`).count()) { frame = candidate; break; }
	assert.ok(frame, 'The editor must expose the image fixture.');
	const attributes = id => page.evaluate(value => wp.data.select('core/block-editor').getBlockAttributes(value), id);
	const check = async (type, callback) => {
		const result = { fixture: 'Image and Site Logo editor', type, passed: false };
		try { await callback(result); result.passed = true; }
		catch (error) {
			result.error = error.message;
			const close = page.locator('.media-modal').getByRole('button', { name: 'Close dialog', exact: true });
			if (await close.isVisible()) await close.click();
		}
		results.push(result);
	};
	const image = frame.locator(`[data-block="${ids['core/image']}"]`);
	const logo = frame.locator(`[data-block="${ids['core/site-logo']}"]`);
	const clickPixels = async locator => {
		await locator.scrollIntoViewIfNeeded();
		const box = await locator.boundingBox();
		assert.ok(box);
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	};
	const output = path.join(directory || path.resolve('.playground/core-blocks'), 'image-logo');
	mkdirSync(output, { recursive: true });
	await check('actual-freeform-mode-controls', async result => {
		const parents = await page.evaluate(() => wp.data.select('core/block-editor').getBlocks().filter(block => block.name === 'tabor/canvas').map(block => block.clientId));
		for (const id of parents) {
			await page.evaluate(id => {
				wp.data.dispatch('core/block-editor').selectBlock(id);
				wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block');
			}, id);
			await page.getByRole('radio', { name: 'Freeform', exact: true }).click();
			await page.waitForFunction(id => wp.data.select('core/block-editor').getBlockAttributes(id).cells === false, id);
		}
		result.canvases = parents.length;
		result.cells = false;
	});
	await check('image-pointer-selection-and-frame-resize', async result => {
		await clickPixels(image.locator('img'));
		await page.waitForFunction(id => wp.data.select('core/block-editor').getSelectedBlockClientId() === id, ids['core/image']);
		const before = await attributes(ids['core/image']);
		const handle = frame.locator('[data-canvas-resize="se"]').filter({ visible: true }).first();
		const box = await handle.boundingBox();
		assert.ok(box, 'Image resize handle must be visible.');
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 25, { steps: 8 });
		await page.mouse.up();
		await page.waitForTimeout(200);
		const after = await attributes(ids['core/image']);
		assert.notDeepEqual(after.canvas.desktop, before.canvas.desktop, 'Canvas resize must update the authored image frame.');
		assert.equal(after.id, before.id, 'Resizing must preserve the media identity.');
		result.before = before.canvas.desktop;
		result.after = after.canvas.desktop;
		await page.screenshot({ path: path.join(output, 'image-selected.png') });
	});
	await check('image-keyboard-reposition-and-exit', async result => {
		await image.focus();
		await page.keyboard.press('Enter');
		assert.equal(await image.getAttribute('data-canvas-editing'), 'true', 'Enter must enable Canvas image repositioning.');
		const before = await attributes(ids['core/image']);
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(200);
		const after = await attributes(ids['core/image']);
		assert.notDeepEqual(after.canvas.imagePosition, before.canvas.imagePosition, 'Repositioning must change the saved image focal point.');
		await page.keyboard.press('Escape');
		assert.notEqual(await image.getAttribute('data-canvas-editing'), 'true', 'Escape must return to layout mode.');
		result.imagePosition = after.canvas.imagePosition;
	});
	await check('image-native-replacement-upload', async result => {
		const before = await attributes(ids['core/image']);
		const response = await page.request.get(before.url);
		await page.getByRole('button', { name: 'Replace', exact: true }).click();
		const chooser = page.waitForEvent('filechooser');
		await page.getByRole('menuitem', { name: 'Upload', exact: true }).click();
		await (await chooser).setFiles({ name: `canvas-native-replacement-${Date.now()}.png`, mimeType: 'image/png', buffer: await response.body() });
		await page.waitForFunction(({ id, previous }) => {
			const current = wp.data.select('core/block-editor').getBlockAttributes(id);
			return current.id && current.id !== previous && !current.url.startsWith('blob:');
		}, { id: ids['core/image'], previous: before.id });
		const after = await attributes(ids['core/image']);
		assert.deepEqual(after.canvas.desktop, before.canvas.desktop, 'Native replacement must retain the Freeform frame.');
		assert.equal(after.canvas.imagePosition, undefined, 'A new image must reset the old media focal point.');
		result.beforeId = before.id;
		result.afterId = after.id;
		await page.screenshot({ path: path.join(output, 'image-replacement.png') });
	});
	await check('logo-selection-and-native-width-control', async result => {
		await clickPixels(logo.locator('img'));
		await page.waitForFunction(id => wp.data.select('core/block-editor').getSelectedBlockClientId() === id, ids['core/site-logo']);
		await logo.focus();
		await page.keyboard.press('Enter');
		await page.evaluate(() => wp.data.dispatch('core/edit-post')?.openGeneralSidebar('edit-post/block'));
		const width = page.getByRole('spinbutton', { name: 'Image width', exact: true });
		await width.fill('120', { timeout: 5000 });
		await width.press('Tab');
		await page.waitForFunction(id => wp.data.select('core/block-editor').getBlockAttributes(id).width === 120, ids['core/site-logo']);
		result.width = (await attributes(ids['core/site-logo'])).width;
		const homeLink = page.getByRole('checkbox', { name: 'Link image to home', exact: true });
		await homeLink.uncheck();
		assert.equal((await attributes(ids['core/site-logo'])).isLink, false);
		await homeLink.check();
		assert.equal((await attributes(ids['core/site-logo'])).isLink, true);
		result.homeLinkToggle = 'off-and-on';
		await page.screenshot({ path: path.join(output, 'logo-selected.png') });
	});
	await check('logo-native-media-library-replacement', async result => {
		const replacement = await attributes(ids['core/image']);
		const before = await attributes(ids['core/site-logo']);
		await page.getByRole('button', { name: 'Replace', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Open Media Library', exact: true }).click();
		const modal = page.locator('.media-modal');
		await modal.waitFor({ state: 'visible' });
		await modal.getByText('Media Library', { exact: true }).click();
		await modal.locator(`.attachment[data-id="${replacement.id}"]`).click();
		await modal.getByRole('button', { name: 'Select', exact: true }).click();
		await modal.waitFor({ state: 'hidden' });
		await page.waitForFunction(id => wp.data.select('core').getEditedEntityRecord('root', 'site')?.site_logo === id, replacement.id);
		assert.deepEqual((await attributes(ids['core/site-logo'])).canvas, before.canvas, 'Logo replacement must preserve its Canvas placement.');
		assert.equal((await attributes(ids['core/site-logo'])).width, before.width, 'Logo replacement must preserve its authored native width.');
		replacedLogoId = replacement.id;
		result.logoId = replacement.id;
		await page.screenshot({ path: path.join(output, 'logo-media-library.png') });
	});
	const authored = await page.evaluate(ids => Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, wp.data.select('core/block-editor').getBlockAttributes(id)])), ids);
	await check('image-logo-save-and-reload', async result => {
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		await page.waitForFunction(() => !wp.data.select('core/editor').isSavingPost());
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		const confirm = page.locator('.editor-entities-saved-states__save-button');
		await confirm.waitFor({ state: 'visible' });
		await page.screenshot({ path: path.join(output, 'save-confirmation.png') });
		await confirm.click();
		await confirm.waitFor({ state: 'hidden' });
		await page.waitForFunction(() => !wp.data.select('core/editor').isSavingPost());
		if (replacedLogoId) await page.waitForFunction(async id => (await wp.apiFetch({ path: '/wp/v2/settings' })).site_logo === id, replacedLogoId);
		await page.reload();
		await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.some(block => block.name === 'tabor/canvas'));
		const saved = await page.evaluate(() => {
			const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
			const blocks = flatten(wp.data.select('core/block-editor').getBlocks());
			return { invalid: blocks.filter(block => block.isValid === false).map(block => block.name), attributes: Object.fromEntries(['core/image', 'core/site-logo'].map(name => [name, blocks.find(block => block.name === name).attributes])) };
		});
		assert.deepEqual(saved.invalid, []);
		assert.deepEqual(saved.attributes['core/image'].canvas, authored['core/image'].canvas);
		assert.equal(saved.attributes['core/image'].id, authored['core/image'].id);
		assert.equal(saved.attributes['core/site-logo'].width, authored['core/site-logo'].width);
		assert.equal(saved.attributes['core/image'].href || '', authored['core/image'].href || '');
		result.saved = saved.attributes;
		result.siteLogo = await page.evaluate(async () => (await wp.apiFetch({ path: '/wp/v2/settings' })).site_logo);
		if (replacedLogoId) assert.equal(result.siteLogo, replacedLogoId, 'Global logo selection must persist after a fresh editor load.');
	});
	await check('image-logo-frontend-after-edit', async result => {
		await page.goto(`${origin}/?page_id=${draft.id}&preview=true`, { waitUntil: 'networkidle' });
		const dimensions = await page.evaluate(() => [...document.querySelectorAll('.canvas__item img')].map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.getBoundingClientRect().width, src: image.src, objectPosition: getComputedStyle(image).objectPosition, logo: Boolean(image.closest('.wp-block-site-logo')) })));
		result.images = dimensions;
		result.nativeLogoSource = await page.locator('.canvas-logo-native-control img').getAttribute('src');
		assert.equal(dimensions.length, 2);
		assert.ok(dimensions.every(image => image.loaded && image.width > 0));
		assert.ok(Math.abs(dimensions.find(image => image.logo).width - authored['core/site-logo'].width) < 2);
		if (replacedLogoId) assert.equal(dimensions.find(image => image.logo).src, authored['core/image'].url, 'The saved global logo must render the newly selected media.');
		const focal = authored['core/image'].canvas.imagePosition;
		if (focal) {
			const actual = dimensions.find(image => !image.logo).objectPosition.split(' ').map(parseFloat);
			assert.ok(Math.abs(actual[0] - focal.x * 100) < 0.01 && Math.abs(actual[1] - focal.y * 100) < 0.01, 'Saved focal point must match the rendered image crop.');
		}
		else assert.equal(dimensions.find(image => !image.logo).objectPosition, '50% 50%', 'Replacement media must render with its reset focal point.');
		assert.equal(await page.locator('[data-canvas-name="core/site-logo"] a').getAttribute('href'), `${origin}/`, 'The linked site logo must target the site home URL.');
		if (authored['core/image'].href) {
			const link = page.locator('[data-canvas-name="core/image"] a');
			assert.equal(await link.getAttribute('href'), authored['core/image'].href);
			await Promise.all([page.waitForURL(authored['core/image'].href), link.click()]);
			result.imageLinkDestination = page.url();
		}
	});
	return { draftId: draft.id, results, untested: ['Native image link editing'] };
}

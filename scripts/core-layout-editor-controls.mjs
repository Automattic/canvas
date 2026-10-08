import assert from 'node:assert/strict';
import path from 'node:path';

export async function testLayoutEditorControls(page, { origin, directory }) {
	const fixtures = await page.evaluate(async () => {
		const { createBlock, serialize } = wp.blocks;
		const paragraph = text => createBlock('core/paragraph', { content: text });
		const cases = [
			['Group', createBlock('core/group', { layout: { type: 'constrained' } }, [paragraph('Group editable content')])],
			['Row', createBlock('core/group', { layout: { type: 'flex', flexWrap: 'nowrap' } }, [paragraph('First row item'), paragraph('Second row item')])],
			['Stack', createBlock('core/group', { layout: { type: 'flex', orientation: 'vertical' } }, [paragraph('First stack item'), paragraph('Second stack item')])],
			['Columns', createBlock('core/columns', {}, [createBlock('core/column', {}, [paragraph('First column text')]), createBlock('core/column', {}, [paragraph('Second column text')])])],
			['List', createBlock('core/list', {}, [createBlock('core/list-item', { content: 'First editable list item' }), createBlock('core/list-item', { content: 'Second editable list item' })])],
			['Quote', createBlock('core/quote', { citation: 'Original citation' }, [paragraph('Native quote content')])],
			['Buttons', createBlock('core/buttons', {}, [createBlock('core/button', { text: 'Original button', url: '#original' })])],
			['Table', createBlock('core/table', { body: [{ cells: [{ content: 'First cell', tag: 'td' }, { content: 'Second cell', tag: 'td' }] }] })],
			['Details', createBlock('core/details', { summary: 'Original summary' }, [paragraph('Details content')])],
			['Accordion', createBlock('core/accordion', {}, [createBlock('core/accordion-item', {}, [createBlock('core/accordion-heading', { title: 'Original accordion heading' }), createBlock('core/accordion-panel', {}, [paragraph('Accordion content')])])])],
			['Tabs', createBlock('core/tabs', {}, [createBlock('core/tab-list', { tabs: [{ label: 'First tab' }, { label: 'Second tab' }] }), createBlock('core/tab-panels', {}, [createBlock('core/tab-panel', { label: 'First tab' }, [paragraph('First panel')]), createBlock('core/tab-panel', { label: 'Second tab' }, [paragraph('Second panel')])])])],
		].filter(([label]) => ['Row', 'Columns', 'List', 'Table', 'Details'].includes(label));
		const blocks = cases.map(([label, block], index) => createBlock('tabor/canvas', { className: `layout-editor-${index}` }, [block]));
		const post = await wp.apiFetch({ path: '/wp/v2/pages', method: 'POST', data: { title: 'Isolated native layout controls audit', status: 'publish', content: serialize(blocks) } });
		return { id: post.id, cases: cases.map(([label, block], index) => ({ label, name: block.name, selector: `.layout-editor-${index}` })) };
	});
	await page.goto(`${origin}/wp-admin/post.php?post=${fixtures.id}&action=edit`);
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0);
	const guide = page.getByRole('dialog').filter({ hasText: 'Welcome to the editor' });
	if (await guide.count()) await guide.getByRole('button', { name: /close/i }).click();
	const results = [];
	const inventory = [];
	for (const fixture of fixtures.cases) {
		const clientId = await page.evaluate(selector => {
			const canvas = wp.data.select('core/block-editor').getBlocks().find(block => block.attributes.className === selector.slice(1));
			wp.data.dispatch('core/block-editor').selectBlock(canvas.innerBlocks[0].clientId);
			return canvas.innerBlocks[0].clientId;
		}, fixture.selector);
		await page.waitForTimeout(200);
		const sidebar = page.locator('.interface-interface-skeleton__sidebar');
		inventory.push({ label: fixture.label, controls: await sidebar.evaluateAll(elements => elements.flatMap(element => [...element.querySelectorAll('button,input,select,textarea')].map(control => ({ role: control.tagName.toLowerCase(), type: control.getAttribute('type'), label: control.getAttribute('aria-label') || control.labels?.[0]?.textContent || control.textContent, value: control.value })))) });
		const result = { block: fixture.name, variant: fixture.label, passed: false };
		try {
			if (fixture.label === 'Row') {
				result.action = 'Center row items';
				await sidebar.getByLabel('Justify items center', { exact: true }).click();
			} else if (fixture.label === 'Columns') {
				result.action = 'Set three columns and disable mobile stacking';
				await sidebar.getByRole('spinbutton', { name: 'Columns', exact: true }).fill('3');
				await sidebar.getByRole('spinbutton', { name: 'Columns', exact: true }).press('Tab');
				await sidebar.getByRole('checkbox', { name: 'Stack on mobile', exact: true }).uncheck();
			} else if (fixture.label === 'List') {
				result.action = 'Add a native list item';
				await sidebar.getByRole('button', { name: 'Add list item', exact: true }).click();
			} else if (fixture.label === 'Table') {
				result.action = 'Enable fixed-width table cells';
				await sidebar.getByRole('checkbox', { name: 'Fixed width table cells', exact: true }).check();
			} else {
				result.action = 'Open Details by default';
				await sidebar.getByRole('checkbox', { name: 'Open by default', exact: true }).check();
			}
			await page.waitForTimeout(150);
			const state = await page.evaluate(id => wp.data.select('core/block-editor').getBlock(id), clientId);
			result.passed = fixture.label === 'Row' ? state.attributes.layout?.justifyContent === 'center'
				: fixture.label === 'Columns' ? state.innerBlocks.length === 3 && state.attributes.isStackedOnMobile === false
					: fixture.label === 'List' ? state.innerBlocks.length === 3
						: fixture.label === 'Table' ? state.attributes.hasFixedLayout === true : state.attributes.showContent === true;
			result.selector = fixture.selector;
		} catch (error) { result.error = error.message; }
		results.push(result);
	}
	await page.evaluate(async () => { await wp.data.dispatch('core/editor').savePost(); });
	await page.reload();
	await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0);
	const saved = await page.evaluate(() => wp.data.select('core/block-editor').getBlocks());
	for (const result of results) {
		const block = saved.find(block => block.attributes.className === result.selector?.slice(1))?.innerBlocks[0];
		const matches = result.variant === 'Row' ? block?.attributes.layout?.justifyContent === 'center'
			: result.variant === 'Columns' ? block?.innerBlocks.length === 3 && block?.attributes.isStackedOnMobile === false
				: result.variant === 'List' ? block?.innerBlocks.length === 3
					: result.variant === 'Table' ? block?.attributes.hasFixedLayout === true : block?.attributes.showContent === true;
		result.savedAndReopened = Boolean(matches && block.isValid !== false);
		result.passed = result.passed && result.savedAndReopened;
	}
	await page.screenshot({ path: path.join(directory, 'native-layout-controls.png'), fullPage: true });
	assert.equal(results.length, 5);
	return { pageId: fixtures.id, results, inventory, untested: ['Other native inspector controls and style permutations were not exhaustively exercised.'] };
}

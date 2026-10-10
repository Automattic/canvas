// These fixtures require real, local attachments from the isolated audit seed.
// Missing media is an error, never a reason to silently claim rendered coverage.
// Regenerate the silent 2-second video fixture with:
// ffmpeg -f lavfi -i color=c=green:s=64x48:r=10 -t 2 -an -c:v libx264
//   -pix_fmt yuv420p -movflags +faststart -map_metadata -1 scripts/fixtures/core-video.mp4
export function contentFixtures({ origin, seed }) {
	const media = Object.fromEntries(['audio', 'video', 'file'].map(kind => {
		const value = seed.media?.[kind];
		if (!value?.id || !value.url) throw new Error(`Core audit seed is missing ${kind} attachment.`);
		return [kind, { id: Number(value.id), url: new URL(value.url, origin).href }];
	}));
	if (!seed.embedUrl || !seed.embedFrameUrl) throw new Error('Core audit seed is missing its local embed provider.');
	const embedUrl = new URL(seed.embedUrl, origin).href;
	const embedFrameUrl = new URL(seed.embedFrameUrl, origin).href;
	return [
		{
			name: 'Safe native Custom HTML with multiple roots',
			block: ['core/html', { content: '<section class="canvas-audit-html"><h3>Safe native HTML</h3><p>Readable custom markup.</p></section><p class="canvas-audit-html-tail">Second native HTML root.</p>' }, []],
			covers: ['core/html'],
			expected: { selector: '.canvas-audit-html', text: 'Second native HTML root.', selectors: { 'core/html': '.canvas-audit-html' } },
			limitations: ['Only markup accepted unchanged by the existing WordPress post HTML sanitizer is accepted through Canvas abilities.'],
		},
		{
			name: 'Safe Classic content nested inside Canvas',
			block: ['core/freeform', { content: '<p class="canvas-audit-classic">Safe classic content with <strong>native formatting</strong>.</p>' }, []],
			covers: ['core/freeform'],
			expected: { selector: '.canvas-audit-classic', text: 'Safe classic content', selectors: { 'core/freeform': '.canvas-audit-classic' } },
			checks: [{ type: 'classic-edit', text: 'Classic content edited and reopened.' }],
		},
		{
			name: 'Native Widget Group with safe native children',
			block: ['core/widget-group', { title: 'Native widget group' }, [
				['core/paragraph', { content: 'A native widget group paragraph.' }, []],
			]],
			covers: ['core/widget-group'],
			expected: { selector: '.wp-widget-group__inner-blocks', text: 'A native widget group paragraph.', selectors: { 'core/widget-group': '.wp-widget-group__inner-blocks' } },
			limitations: ['Use only in native editor contexts where WordPress registers Widget Group; the audit must not force its registration in the post editor.'],
		},
		{
			name: 'Native audio with local playable media',
			block: ['core/audio', { id: media.audio.id, src: media.audio.url, preload: 'metadata', caption: 'Local audio fixture' }, []],
			covers: ['core/audio'],
			expected: { selector: '.wp-block-audio audio', text: 'Local audio fixture' },
			checks: [{ type: 'media', selector: 'audio', src: media.audio.url, minDuration: 1 }],
		},
		{
			name: 'Native video with local playable media',
			block: ['core/video', { id: media.video.id, src: media.video.url, controls: true, preload: 'metadata', playsInline: true, caption: 'Local video fixture' }, []],
			covers: ['core/video'],
			expected: { selector: '.wp-block-video video', text: 'Local video fixture' },
			checks: [{ type: 'media', selector: 'video', src: media.video.url, minDuration: 1, minVideoWidth: 1 }],
		},
		{
			name: 'Native file download',
			block: ['core/file', { id: media.file.id, href: media.file.url, textLinkHref: media.file.url, fileName: 'Canvas audit document', showDownloadButton: true, downloadButtonText: 'Download audit document', displayPreview: false }, []],
			covers: ['core/file'],
			expected: { selector: '.wp-block-file a[download]', text: 'Download audit document' },
			checks: [{ type: 'download', selector: 'a[download]', href: media.file.url }],
		},
		{
			name: 'Native embed through a deterministic local provider',
			block: ['core/embed', { url: embedUrl, type: 'rich', providerNameSlug: 'canvas-audit', caption: 'Local embedded document', allowResponsive: true }, []],
			covers: ['core/embed'],
			expected: { selector: '.wp-block-embed iframe', text: 'Local embedded document' },
			checks: [{ type: 'embed', selector: 'iframe', src: embedFrameUrl, text: 'Canvas local embedded document' }],
			limitations: ['External oEmbed provider availability, consent, and network failures are not certified by this local provider fixture.'],
		},
		{
			name: 'Native mathematical expression',
			block: ['core/math', { latex: 'x+1', mathML: '<mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow>' }, []],
			covers: ['core/math'],
			expected: { selector: '.wp-block-math math', text: 'x+1', selectors: { 'core/math': '.wp-block-math math' } },
			checks: [{ type: 'math', selector: 'math', text: 'x+1' }],
		},
		{
			name: 'Native registered Core icon',
			block: ['core/icon', { icon: 'core/star-filled' }, []],
			covers: ['core/icon'],
			expected: { selector: '.wp-block-icon svg', selectors: { 'core/icon': '.wp-block-icon svg' } },
			checks: [{ type: 'icon', selector: 'svg', minPaths: 1 }],
		},
		{
			name: 'Native playlist with selectable local tracks',
			block: ['core/playlist', { showImages: false, showTracklist: true, showTrackLength: true, caption: 'Local audit playlist' }, [
				['core/playlist-track', { id: media.audio.id, src: media.audio.url, title: 'First local track', artist: 'Canvas audit', album: 'Local fixtures', length: '0:02' }, []],
				['core/playlist-track', { id: media.audio.id, src: `${media.audio.url}${media.audio.url.includes('?') ? '&' : '?'}canvas-audit-track=2`, title: 'Second local track', artist: 'Canvas audit', album: 'Local fixtures', length: '0:02' }, []],
			]],
			covers: ['core/playlist', 'core/playlist-track'],
			expected: { selector: '.wp-block-playlist', text: 'Second local track', selectors: { 'core/playlist': '.wp-block-playlist', 'core/playlist-track': '.wp-block-playlist-track__button' } },
			checks: [{ type: 'playlist', selector: '.wp-block-playlist', tracks: 2 }],
		},
	];
}

// Exercise Core's real Classic modal and TinyMCE, not a replacement attribute write.
export async function testClassicEditor(page, fixtureSelector, text) {
	const welcome = page.locator('.components-modal__screen-overlay').getByRole('button', { name: 'Close', exact: true });
	if (await welcome.count()) await welcome.first().click();
	const clientId = await page.evaluate(selector => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		const blocks = flatten(wp.data.select('core/block-editor').getBlocks());
		const fixtureClass = selector.replace(/^\./, '');
		const fixture = blocks.find(block => block.attributes.className?.split(' ').includes(fixtureClass));
		const classic = flatten(fixture ? fixture.innerBlocks : blocks).find(block => block.name === 'core/freeform');
		if (!classic) throw new Error('Classic fixture is missing from the native editor.');
		wp.data.dispatch('core/block-editor').selectBlock(classic.clientId);
		return classic.clientId;
	}, fixtureSelector);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Classic Editor', exact: true });
	await dialog.waitFor();
	const body = page.frameLocator(`iframe[id="editor-${clientId}_ifr"]`).locator('body');
	await body.waitFor();
	// TinyMCE can mount its iframe before loading the initial content. Wait for
	// initialization, then use real keyboard input and verify its own save value.
	await page.waitForFunction(id => window.tinymce?.get(`editor-${id}`)?.initialized === true, clientId);
	await body.click();
	await body.press('ControlOrMeta+A');
	await body.pressSequentially(text);
	await page.waitForFunction(({ id, content }) => window.wp.oldEditor.getContent(`editor-${id}`).includes(content), { id: clientId, content: text });
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await dialog.waitFor({ state: 'hidden' });
	await page.waitForFunction(({ id, content }) => wp.data.select('core/block-editor').getBlockAttributes(id)?.content?.includes(content), { id: clientId, content: text });
	await page.evaluate(async () => {
		await wp.data.dispatch('core/editor').savePost();
		if (wp.data.select('core/editor').didPostSaveRequestFail()) throw new Error('Classic fixture save failed.');
	});
	await page.reload();
	await page.waitForFunction(content => {
		const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks)]);
		return flatten(window.wp?.data?.select('core/block-editor')?.getBlocks?.() || []).some(block => block.name === 'core/freeform' && block.attributes.content?.includes(content) && block.isValid !== false);
	}, text);
	return { editedThrough: 'Core Classic modal and TinyMCE', savedAndReopened: true, text };
}

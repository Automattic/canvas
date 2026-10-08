// Real data and native parent trees, never empty dynamic-block defaults.
export function contextFixtures({ origin, seed }) {
	const local = value => new URL(new URL(value, origin).pathname + new URL(value, origin).search, origin).href;
	const route = (value, parameters = {}) => {
		const url = new URL(local(value));
		for (const [key, item] of Object.entries(parameters)) url.searchParams.set(key, item);
		return url.href;
	};
	const paragraph = content => ['core/paragraph', { content }];
	const canvas = children => ['tabor/canvas', { desktopRows: 2 }, children];
	const query = (queryId, children, overrides = {}) => ['core/query', {
		queryId,
		query: { postType: 'post', perPage: 1, order: 'asc', orderBy: 'date', inherit: false, search: 'Canvas Context Story 3', ...overrides },
	}, children];
	const postTree = (queryId, children) => query(queryId, [['core/post-template', {}, [canvas(children)]]]);
	const postSelectors = {
		'core/post-title': '.wp-block-post-title a',
		'core/post-date': '.wp-block-post-date time',
		'core/post-featured-image': '.wp-block-post-featured-image img',
		'core/post-excerpt': '.wp-block-post-excerpt__excerpt',
		'core/post-content': '.wp-block-post-content p',
		'core/post-terms': '.wp-block-post-terms a',
		'core/post-author': '.wp-block-post-author__name',
		'core/post-author-name': '.wp-block-post-author-name',
		'core/post-author-biography': '.wp-block-post-author-biography',
		'core/post-time-to-read': '.wp-block-post-time-to-read',
		'core/post-comments-count': '.wp-block-post-comments-count',
		'core/post-comments-link': '.wp-block-post-comments-link a',
		'core/read-more': '.wp-block-read-more',
		'core/avatar': '.wp-block-avatar img',
		'core/footnotes': '.wp-block-footnotes li',
	};
	const commentsSelectors = {
		'core/comments': '.wp-block-comments',
		'core/comments-title': '.wp-block-comments-title',
		'core/comment-template': '.wp-block-comment-template li',
		'core/comment-author-name': '.wp-block-comment-author-name',
		'core/comment-date': '.wp-block-comment-date time',
		'core/comment-content': '.wp-block-comment-content p',
		'core/comment-reply-link': '.wp-block-comment-reply-link a',
		'core/comment-edit-link': '.wp-block-comment-edit-link a',
		'core/comments-pagination': '.wp-block-comments-pagination',
		'core/comments-pagination-previous': '.wp-block-comments-pagination-previous',
		'core/comments-pagination-numbers': '.wp-block-comments-pagination-numbers a',
		'core/comments-pagination-next': '.wp-block-comments-pagination-next',
		'core/post-comments-form': '.comment-respond textarea',
	};
	return [
		{
			name: 'Post metadata and content in a real Query post context',
			block: postTree(801, [
				['core/post-title', { isLink: true }], ['core/post-date', {}],
				['core/post-featured-image', { height: '180px', isLink: true }],
				['core/post-excerpt', {}], ['core/post-content', {}],
				['core/post-terms', { term: 'category' }], ['core/post-author', { showBio: true }],
				['core/post-author-name', { isLink: true }], ['core/post-author-biography', {}],
				['core/post-time-to-read', {}], ['core/post-comments-count', {}],
				['core/post-comments-link', {}], ['core/read-more', { content: 'Read the fixture story' }],
				['core/avatar', { size: 48 }], ['core/footnotes', {}],
			]),
			covers: ['core/query', 'core/post-template', ...Object.keys(postSelectors)],
			expected: { selector: '.wp-block-post-template', text: 'Native flowing post body fixture.', selectors: postSelectors, texts: {
				'core/post-title': 'Canvas Context Story 3', 'core/post-date': '2024',
				'core/post-excerpt': 'Native excerpt fixture 3.', 'core/post-content': 'Native flowing post body fixture.',
				'core/post-terms': 'Canvas Audit Category', 'core/post-author': 'Canvas Author',
				'core/post-author-name': 'Canvas Author', 'core/post-author-biography': 'Native author biography fixture.',
				'core/post-time-to-read': 'minute', 'core/post-comments-link': 'comments',
				'core/read-more': 'Read the fixture story', 'core/footnotes': 'Native footnote fixture 3.',
			} },
		},
		{
			name: 'Query pagination on a middle results page',
			block: query(802, [
				['core/post-template', {}, [canvas([['core/post-title', { isLink: true }]])]],
				['core/query-total', {}],
				['core/query-pagination', {}, [['core/query-pagination-previous', { label: 'Previous stories' }], ['core/query-pagination-numbers', {}], ['core/query-pagination-next', { label: 'Next stories' }]]],
			], { search: 'Canvas Context Story' }),
			url: route(`${origin}/?page_id=${seed.id}`, { 'query-802-page': 2 }),
			covers: ['core/query-pagination', 'core/query-pagination-previous', 'core/query-pagination-numbers', 'core/query-pagination-next', 'core/query-total'],
			expected: { selector: '.wp-block-query-pagination', selectors: { 'core/query-total': '.wp-block-query-total', 'core/query-pagination-previous': '.wp-block-query-pagination-previous', 'core/query-pagination-numbers': '.wp-block-query-pagination-numbers a', 'core/query-pagination-next': '.wp-block-query-pagination-next' } },
			interaction: { type: 'pagination', selector: '.wp-block-query-pagination-next', parameter: 'query-802-page', value: '3', expectedText: 'Canvas Context Story 3', expectedSelector: '.wp-block-post-title' },
		},
		{
			name: 'Query no-results with an intentionally empty native query',
			block: query(803, [['core/post-template', {}, [['core/post-title', {}]]], ['core/query-no-results', {}, [paragraph('Native no-results fixture.')]]], { search: 'canvas-no-matching-story-9e8fd712' }),
			covers: ['core/query-no-results'],
			expected: { selector: '.wp-block-query-no-results', text: 'Native no-results fixture.' },
		},
		{
			name: 'Native comments with comment context and middle-page navigation',
			block: postTree(804, [['core/comments', {}, [
				['core/comments-title', {}],
				['core/comment-template', {}, [canvas([
					['core/comment-author-name', {}], ['core/comment-date', {}], ['core/comment-content', {}],
					['core/comment-reply-link', {}], ['core/comment-edit-link', {}], ['core/avatar', { size: 32 }],
				])]],
				['core/comments-pagination', {}, [['core/comments-pagination-previous', {}], ['core/comments-pagination-numbers', {}], ['core/comments-pagination-next', {}]]],
				['core/post-comments-form', {}],
			]]]),
			url: route(seed.postUrl, { cpage: 2 }),
			covers: Object.keys(commentsSelectors),
			expected: { selector: '.wp-block-comments', text: 'Native approved comment fixture 2.', selectors: commentsSelectors, texts: {
				'core/comment-author-name': 'Canvas Reader 2', 'core/comment-date': '2024',
				'core/comment-content': 'Native approved comment fixture 2.',
				'core/comment-reply-link': 'Reply', 'core/comment-edit-link': 'Edit',
			} },
			interaction: { type: 'comment-reply', selector: '.wp-block-comment-reply-link a', target: '#comment', postId: seed.postId, submit: true, pagination: { selector: '.wp-block-comments-pagination-next', parameter: 'cpage', value: '3', expectedText: 'Native approved comment fixture 3.', expectedSelector: '.wp-block-comment-content' } },
		},
		{
			name: 'Native taxonomy term context',
			block: ['core/terms-query', { termQuery: { taxonomy: 'category', perPage: 10, include: [seed.categoryId], hideEmpty: true, order: 'asc', orderBy: 'name', inherit: false } }, [
				['core/term-template', {}, [canvas([['core/term-name', { isLink: true }], ['core/term-description', {}], ['core/term-count', {}]])]],
			]],
			covers: ['core/terms-query', 'core/term-template', 'core/term-name', 'core/term-description', 'core/term-count'],
			expected: { selector: '.wp-block-term-template', text: 'Native taxonomy description fixture.', selectors: { 'core/terms-query': '.wp-block-terms-query', 'core/term-template': '.wp-block-term-template li', 'core/term-name': '.wp-block-term-name', 'core/term-description': '.wp-block-term-description', 'core/term-count': '.wp-block-term-count' }, texts: { 'core/term-name': 'Canvas Audit Category', 'core/term-description': 'Native taxonomy description fixture.', 'core/term-count': '5' } },
		},
		{
			name: 'Archive title with the actual queried taxonomy', block: ['core/query-title', { type: 'archive', showPrefix: false }],
			url: local(seed.categoryUrl), covers: ['core/query-title'], expected: { selector: '.wp-block-query-title', text: 'Canvas Audit Category' },
		},
		{
			name: 'Post navigation to a real adjacent story', block: ['core/post-navigation-link', { type: 'next', showTitle: true }],
			url: local(seed.postUrl), covers: ['core/post-navigation-link'], expected: { selector: '.wp-block-post-navigation-link a', text: 'Canvas Context Story 4' },
		},
		{
			name: 'Native breadcrumbs on a real single post', block: ['core/breadcrumbs', {}],
			url: local(seed.postUrl), covers: ['core/breadcrumbs'], expected: { selector: '.wp-block-breadcrumbs', text: 'Canvas Context Story 3' },
		},
		{
			name: 'A saved shared template part', block: ['core/template-part', { slug: seed.templatePart, theme: seed.theme }],
			covers: ['core/template-part'], expected: { selector: '.wp-block-template-part p', text: 'Native shared template part fixture.' },
		},
		{
			name: 'Site logo with a real local attachment', block: ['core/site-logo', { width: 80 }],
			covers: ['core/site-logo'], expected: { selector: '.wp-block-site-logo img' },
		},
		{
			name: 'Native nested navigation and home link',
			block: ['core/navigation', { overlayMenu: 'always' }, [
				['core/home-link', { label: 'Home fixture' }],
				['core/navigation-link', { label: 'Story fixture', url: local(seed.postUrl), kind: 'custom' }],
				['core/navigation-submenu', { label: 'More fixture', url: '#' }, [['core/navigation-link', { label: 'Nested fixture', url: local(seed.postUrl), kind: 'custom' }]]],
				['core/page-list', {}],
			]],
			covers: ['core/navigation', 'core/navigation-link', 'core/navigation-submenu', 'core/home-link', 'core/page-list'],
			expected: { selector: '.wp-block-navigation', selectors: { 'core/home-link': '.wp-block-home-link a', 'core/navigation-link': '.wp-block-navigation-link a', 'core/navigation-submenu': '.wp-block-navigation-submenu', 'core/page-list': '.wp-block-page-list' } },
			interaction: { type: 'navigation', open: '.wp-block-navigation__responsive-container-open', close: '.wp-block-navigation__responsive-container-close' },
		},
		{
			name: 'Navigation overlay close inside a real custom overlay',
			block: ['core/navigation', { overlayMenu: 'always', overlay: `${seed.theme}//canvas-audit-overlay` }, [['core/navigation-link', { label: 'Overlay story', url: local(seed.postUrl), kind: 'custom' }]]],
			covers: ['core/navigation-overlay-close'], expected: { selector: 'button.wp-block-navigation-overlay-close' },
			interaction: { type: 'navigation', open: '.wp-block-navigation__responsive-container-open', close: 'button.wp-block-navigation-overlay-close' },
		},
		{ name: 'Archives with published stories', block: ['core/archives', { showPostCounts: true }], covers: ['core/archives'], expected: { selector: '.wp-block-archives a', text: 'January 2024' } },
		{ name: 'Categories with assigned stories', block: ['core/categories', { showPostCounts: true }], covers: ['core/categories'], expected: { selector: '.wp-block-categories a', text: 'Canvas Audit Category' } },
		{ name: 'Tags with assigned stories', block: ['core/tag-cloud', { taxonomy: 'post_tag', showTagCounts: true }], covers: ['core/tag-cloud'], expected: { selector: '.wp-block-tag-cloud a', text: 'Canvas Audit Tag' } },
		{ name: 'Latest posts with excerpts', block: ['core/latest-posts', { postsToShow: 3, displayPostContent: true, displayPostDate: true }], covers: ['core/latest-posts'], expected: { selector: '.wp-block-latest-posts li', text: 'Canvas Context Story' } },
		{ name: 'Latest approved comments', block: ['core/latest-comments', { commentsToShow: 3, displayAvatar: true, displayExcerpt: true }], covers: ['core/latest-comments'], expected: { selector: '.wp-block-latest-comments article', text: 'Native approved comment fixture' } },
		{ name: 'RSS from a deterministic local feed', block: ['core/rss', { feedURL: local(seed.rssUrl), itemsToShow: 2, displayExcerpt: true }], covers: ['core/rss'], expected: { selector: '.wp-block-rss li', text: 'Native RSS fixture story' } },
	];
}

export async function runContextInteraction(page, fixture, targetUrl) {
	const results = [];
	const scope = () => page.locator(fixture.selector);
	const run = async (type, callback) => {
		const result = { fixture: fixture.name, type, passed: false };
		try { await callback(result); result.passed = true; }
		catch (error) { result.error = error.message; }
		finally {
			if (page.url() !== targetUrl) await page.goto(targetUrl, { waitUntil: 'networkidle' });
		}
		results.push(result);
	};
	const require = (condition, message) => { if (!condition) throw new Error(message); };
	const paginate = async (action, result) => {
		await scope().locator(action.selector).first().click({ timeout: 5000 });
		await page.waitForLoadState('networkidle');
		const destination = new URL(page.url());
		const actualPage = destination.searchParams.get(action.parameter) || (action.parameter === 'cpage' ? destination.pathname.match(/\/comment-page-(\d+)\/?$/)?.[1] : null);
		require(actualPage === action.value, `Native pagination did not navigate to the requested page: ${destination.href}`);
		result.destination = destination.href;
		// Core's native comment URLs may omit the test-only template selector.
		const target = new URL(targetUrl);
		let restoreFixture = false;
		for (const key of ['canvas_audit_page', 'canvas_audit_fixture']) {
			if (target.searchParams.has(key) && !destination.searchParams.has(key)) {
				destination.searchParams.set(key, target.searchParams.get(key));
				restoreFixture = true;
			}
		}
		if (restoreFixture) {
			await page.goto(destination.href, { waitUntil: 'networkidle' });
		}
		await scope().locator(action.expectedSelector).filter({ hasText: action.expectedText }).first().waitFor({ state: 'visible', timeout: 5000 });
		result.content = action.expectedText;
	};
	const action = fixture.interaction;
	if (action.type === 'navigation') {
		await run('navigation-open-close', async () => {
			await scope().locator(action.open).first().click({ timeout: 5000 });
			const close = page.locator(action.close).filter({ visible: true }).first();
			await close.waitFor({ state: 'visible', timeout: 5000 });
			await close.click({ timeout: 5000 });
			await close.waitFor({ state: 'hidden', timeout: 5000 });
		});
	} else if (action.type === 'pagination') {
		await run('query-pagination-results', result => paginate(action, result));
	} else if (action.type === 'comment-reply') {
		await run('comment-reply-target', async () => {
			await scope().locator(action.selector).first().click({ timeout: 5000 });
			await page.locator(action.target).waitFor({ state: 'visible', timeout: 5000 });
			const parent = await page.locator('input[name="comment_parent"]').inputValue();
			require(Number(parent) > 0, 'Reply did not set the native parent comment.');
			const cancel = page.locator('#cancel-comment-reply-link');
			await cancel.click({ timeout: 5000 });
			require(await page.locator('input[name="comment_parent"]').inputValue() === '0', 'Cancel reply did not reset the native parent.');
		});
		if (action.pagination) await run('comments-pagination-results', result => paginate(action.pagination, result));
		if (action.submit) await run('comment-form-submission', async result => {
			const text = `Native approved comment fixture submitted by the isolated Canvas audit ${Date.now()}.`;
			const form = scope().locator('form.comment-form');
			require(Number(await form.locator('input[name="comment_post_ID"]').inputValue()) === action.postId, 'Comment form targets the wrong post.');
			await form.locator('textarea[name="comment"]').fill(text);
			await Promise.all([
				page.waitForURL(url => url.hash.startsWith('#comment-'), { timeout: 10000 }),
				form.locator('[type="submit"]').click({ timeout: 5000 }),
			]);
			await page.waitForLoadState('networkidle');
			require((await page.locator('body').innerText()).includes(text), 'Submitted comment was not rendered at its native redirect destination.');
			result.comment = text;
			result.destination = page.url();
		});
	}
	return results;
}

export async function testNativeSearch(page, fixtureSelector, origin) {
	const target = page.url();
	const result = { fixture: 'core/search', type: 'search-submission-results', passed: false };
	try {
		const form = page.locator(fixtureSelector).locator('form');
		await form.locator('input[type="search"]').fill('Canvas Context Story 3');
		await Promise.all([
			page.waitForURL(url => url.searchParams.get('s') === 'Canvas Context Story 3', { timeout: 10000 }),
			form.locator('button[type="submit"]').click({ timeout: 5000 }),
		]);
		await page.waitForLoadState('networkidle');
		if (new URL(page.url()).origin !== origin) throw new Error('Search left the isolated test site.');
		await page.locator('.wp-block-post-title').filter({ hasText: 'Canvas Context Story 3' }).first().waitFor({ state: 'visible', timeout: 5000 });
		result.passed = true;
		result.destination = page.url();
	} catch (error) { result.error = error.message; }
	finally { await page.goto(target, { waitUntil: 'networkidle' }); }
	return result;
}

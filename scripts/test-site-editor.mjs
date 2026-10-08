import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const manifestPath = process.argv[2] || '.playground/site-benchmark/wordpress/canvas-site-benchmark.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const origin = new URL(manifest.routes[0].url).origin;
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser = await chromium.launch({ headless: true });
const checks = [];
const fixtures = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', dialog => dialog.accept());

async function openEditor(url) {
  assert.equal(new URL(url).origin, origin);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0);
  const frame = page.frameLocator('iframe[name="editor-canvas"]');
  await frame.locator('[data-canvas-item]').first().waitFor({ state: 'visible' });
  const welcome = page.getByRole('button', { name: /Get started|Start tour/ });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  const overlay = page.locator('.components-modal__screen-overlay');
  if (await overlay.isVisible()) {
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'hidden' });
  }
  return frame;
}

async function flattenBlocks() {
  return page.evaluate(() => {
    const flatten = blocks => blocks.flatMap(block => [block, ...flatten(block.innerBlocks || [])]);
    return flatten(wp.data.select('core/block-editor').getBlocks()).map(block => ({ clientId: block.clientId, name: block.name, attributes: block.attributes, isValid: block.isValid }));
  });
}

async function blockAttributes(id) {
  return page.evaluate(id => wp.data.select('core/block-editor').getBlockAttributes(id), id);
}

async function undo() {
  await page.evaluate(() => wp.data.dispatch('core/editor').undo());
}

async function exercise(name, url, nativeNames) {
  let original;
  let entity;
  try {
    let frame = await openEditor(url);
    entity = await page.evaluate(() => ({ type: wp.data.select('core/editor').getCurrentPostType(), id: wp.data.select('core/editor').getCurrentPostId() }));
    original = await page.evaluate(({ type, id }) => wp.data.select('core').getEntityRecord('postType', type, id)?.content?.raw, entity);
    assert.equal(typeof original, 'string', `${name}: saved content must be available for restoration`);
    const blocks = await flattenBlocks();
    assert.equal(blocks.some(block => block.isValid === false), false);
    const canvas = blocks.find(block => block.name === 'tabor/canvas');
    assert.ok(canvas, `${name}: missing Canvas`);
    for (const nativeName of nativeNames) {
      const native = blocks.find(block => block.name === nativeName);
      assert.ok(native, `${name}: missing ${nativeName}`);
      const item = frame.locator(`[data-canvas-item="${native.clientId}"]`);
      await item.click();
      await page.waitForFunction(id => wp.data.select('core/block-editor').getSelectedBlockClientId() === id, native.clientId);
      const before = await blockAttributes(native.clientId);
      await item.press('ArrowDown');
      await page.waitForFunction(({ id, before }) => JSON.stringify(wp.data.select('core/block-editor').getBlockAttributes(id)) !== JSON.stringify(before), { id: native.clientId, before });
      await undo();
      await page.waitForFunction(({ id, before }) => JSON.stringify(wp.data.select('core/block-editor').getBlockAttributes(id)) === JSON.stringify(before), { id: native.clientId, before });
      await item.press('Enter');
      await item.waitFor();
      await page.waitForFunction(id => document.querySelector('iframe[name="editor-canvas"]').contentDocument.querySelector(`[data-canvas-item="${id}"]`)?.getAttribute('aria-description')?.startsWith('Editing mode'), native.clientId);
      await item.press('Escape');
      await page.waitForFunction(id => !document.querySelector('iframe[name="editor-canvas"]').contentDocument.querySelector(`[data-canvas-item="${id}"]`)?.getAttribute('aria-description')?.startsWith('Editing mode'), native.clientId);
      if (nativeName === 'core/site-title' || nativeName === 'core/navigation') {
        await item.click();
        await page.waitForFunction(id => document.querySelector('iframe[name="editor-canvas"]').contentDocument.querySelector(`[data-canvas-item="${id}"]`)?.getAttribute('aria-description')?.startsWith('Editing mode'), native.clientId);
        await item.press('Escape');
        checks.push(`${name}: ${nativeName} selected-block click enters native editing`);
      }
      checks.push(`${name}: ${nativeName} selection, keyboard move, undo, native edit entry, exit`);
    }
    const before = await blockAttributes(canvas.clientId);
    const rows = (before.desktopRows || 18) + 1;
    await page.evaluate(({ id, rows }) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { desktopRows: rows }), { id: canvas.clientId, rows });
    await undo();
    assert.equal((await blockAttributes(canvas.clientId)).desktopRows, before.desktopRows);
    await page.evaluate(({ id, rows }) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { desktopRows: rows }), { id: canvas.clientId, rows });
    await page.evaluate(async () => { await wp.data.dispatch('core/editor').savePost(); });
    assert.equal(await page.evaluate(() => wp.data.select('core/editor').didPostSaveRequestSucceed()), true, `${name}: save failed`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => wp.data?.select('core/block-editor')?.getBlocks()?.length > 0);
    const savedCanvas = (await flattenBlocks()).find(block => block.name === 'tabor/canvas');
    assert.equal(savedCanvas.attributes.desktopRows, rows, `${name}: saved rows did not survive reload`);
    checks.push(`${name}: Canvas rows undo and save/reload`);
  } finally {
    if (original !== undefined && entity) {
      await page.evaluate(async ({ entity, original }) => {
        await wp.data.dispatch('core').saveEntityRecord('postType', entity.type, { id: entity.id, content: original });
      }, { entity, original });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => wp.data?.select('core/editor')?.getCurrentPostId());
      const restored = await page.evaluate(({ type, id }) => wp.data.select('core').getEntityRecord('postType', type, id)?.content?.raw, entity);
      assert.equal(restored, original, `${name}: original content was not restored`);
      checks.push(`${name}: original saved content restored`);
    }
  }
}

try {
  await page.goto(`${origin}/wp-login.php`);
  await page.locator('#user_login').fill('admin');
  await page.locator('#user_pass').fill('password');
  await Promise.all([page.waitForURL(/wp-admin/), page.locator('#wp-submit').click()]);
  const header = manifest.editors.find(editor => editor.name === 'part-header');
  const front = manifest.editors.find(editor => editor.name === 'template-front-page');
  assert.ok(header && front);
  await exercise('shared header', header.url, ['core/site-title', 'core/navigation']);
  await exercise('front-page template', front.url, ['core/post-title']);
  const markup = '<!-- wp:tabor/canvas {"desktopRows":8} --><!-- wp:paragraph {"canvas":{"desktop":{"column":1,"row":1,"columnSpan":8,"rowSpan":3}}} --><p>Canvas editor smoke fixture.</p><!-- /wp:paragraph --><!-- /wp:tabor/canvas -->';
  for (const type of ['page', 'post']) {
    const record = await page.evaluate(async ({ type, markup }) => wp.apiFetch({ path: `/wp/v2/${type === 'page' ? 'pages' : 'posts'}`, method: 'POST', data: { title: 'Canvas isolated editor smoke fixture', status: 'draft', content: markup } }), { type, markup });
    fixtures.push({ type, id: record.id });
    await exercise(`${type} content`, `${origin}/wp-admin/post.php?post=${record.id}&action=edit`, ['core/paragraph']);
  }
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  for (const fixture of fixtures) {
    await page.evaluate(async ({ type, id }) => wp.apiFetch({ path: `/wp/v2/${type === 'page' ? 'pages' : 'posts'}/${id}`, method: 'DELETE' }), fixture);
  }
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.CANVAS_FLOW_URL || 'http://localhost:9410';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
page.on('dialog', dialog => dialog.accept());
let id;
try {
  await page.goto(`${origin}/wp-login.php`);
  await page.locator('#user_login').fill(process.env.CANVAS_FLOW_USER || 'admin');
  await page.locator('#user_pass').fill(process.env.CANVAS_FLOW_PASSWORD || 'afterimage-local');
  await Promise.all([page.waitForURL(/wp-admin/), page.locator('#wp-submit').click()]);
  await page.goto(`${origin}/wp-admin/post-new.php`);
  await page.waitForFunction(() => window.wp?.blocks?.createBlock && window.wp?.apiFetch);
  id = await page.evaluate(async () => {
    const placement = row => ({ desktop: { column: 2, columnSpan: 8, row, rowSpan: 2 } });
    const children = [1, 4].map(row => wp.blocks.createBlock('core/paragraph', { content: `Nested editor paragraph ${row}.`, canvas: placement(row) }));
    const nested = wp.blocks.createBlock('tabor/canvas', { desktopRows: 8, canvas: placement(2) }, children);
    const outer = wp.blocks.createBlock('tabor/canvas', { desktopRows: 12 }, [nested]);
    const post = await wp.apiFetch({ path: '/wp/v2/pages', method: 'POST', data: { title: 'Isolated nested keyboard smoke', status: 'draft', content: wp.blocks.serialize([outer]) } });
    return post.id;
  });
  await page.goto(`${origin}/wp-admin/post.php?post=${id}&action=edit`);
  await page.waitForFunction(() => wp.data.select('core/block-editor').getBlocks()[0]?.innerBlocks[0]?.innerBlocks.length === 2);
  await page.frameLocator('iframe[name="editor-canvas"]').locator('[data-canvas-item]').first().waitFor();
  const welcome = page.getByRole('button', { name: /Get started|Start tour/ });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  if (await page.locator('.components-modal__screen-overlay').isVisible()) await page.keyboard.press('Escape');
  const original = await page.evaluate(() => {
    const root = wp.data.select('core/block-editor').getBlocks()[0];
    const inner = root.innerBlocks[0];
    wp.data.dispatch('core/block-editor').multiSelect(inner.innerBlocks[0].clientId, inner.innerBlocks[1].clientId);
    return { root: root.attributes, inner: inner.attributes, ids: inner.innerBlocks.map(b => b.clientId), children: inner.innerBlocks.map(b => b.attributes.canvas) };
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('iframe[name="editor-canvas"]').contentDocument.body.focus());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const changed = await page.evaluate(ids => ids.map(id => wp.data.select('core/block-editor').getBlockAttributes(id).canvas), original.ids);
  assert.notDeepEqual(changed, original.children, 'Inner range arrow was swallowed by outer Canvas');
  const parents = await page.evaluate(() => { const root = wp.data.select('core/block-editor').getBlocks()[0]; return { root: root.attributes, inner: root.innerBlocks[0].attributes }; });
  assert.deepEqual(parents.root, original.root, 'Nested keyboard movement altered the outer Canvas');
  assert.deepEqual(parents.inner.canvas, original.inner.canvas, 'Nested keyboard movement altered the inner Canvas placement');
  await page.evaluate(() => wp.data.dispatch('core/editor').undo());
  await page.waitForTimeout(300);
  const undone = await page.evaluate(ids => ids.map(id => wp.data.select('core/block-editor').getBlockAttributes(id).canvas), original.ids);
  assert.deepEqual(undone, original.children);
  await page.evaluate(ids => {
    wp.data.dispatch('core/block-editor').multiSelect(ids[0], ids[1]);
    document.querySelector('iframe[name="editor-canvas"]').contentDocument.body.focus();
  }, original.ids);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);
  const shifted = await page.evaluate(ids => ids.map(id => wp.data.select('core/block-editor').getBlockAttributes(id).canvas), original.ids);
  assert.deepEqual(shifted, original.children, 'Cell-mode native Shift range selection should not move Canvas frames');
  console.log('Nested Canvas native range arrow movement, Shift range selection, and Undo passed; parent frames unchanged.');
} finally {
  try {
    if (id) await page.evaluate(async id => wp.apiFetch({ path: `/wp/v2/pages/${id}?force=true`, method: 'DELETE' }), id);
  } finally {
    await browser.close();
  }
}

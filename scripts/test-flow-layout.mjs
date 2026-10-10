import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against an isolated seeded site with nested Query cards and Post Content.
const base = process.env.CANVAS_FLOW_URL || 'http://localhost:9410';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const routes = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    for (const route of routes.length ? routes : ['/', '/journal/', '/the-shape-of-silence/']) {
      const url = new URL(route, base);
      assert.equal(url.origin, new URL(base).origin, 'Layout checks require the isolated local site');
      const response = await page.goto(url.href);
      assert.equal(response.status(), 200, route);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2000);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        samples.push(await page.evaluate(() => ({
          height: document.body.scrollHeight,
          width: document.body.scrollWidth,
          nested: [...document.querySelectorAll('.canvas__grid .wp-block-tabor-canvas > .canvas__grid')].map(grid => ({
            height: grid.offsetHeight, scrollHeight: grid.scrollHeight,
            inheritedHeight: getComputedStyle(grid).getPropertyValue('--canvas-free-height').trim(),
          })),
        })));
        await page.waitForTimeout(2000);
      }
      assert.ok(Math.max(...samples.map(s => s.height)) - Math.min(...samples.map(s => s.height)) <= 2,
        `${route} at ${width}: layout grew after settling: ${samples.map(s => s.height)}`);
      for (const sample of samples) {
        assert.ok(sample.width <= width + 1, `${route} at ${width}: horizontal overflow`);
        for (const grid of sample.nested) {
          assert.equal(grid.inheritedHeight, '', 'An enclosing precise frame leaked into a nested grid');
          assert.ok(grid.scrollHeight <= grid.height + 2, 'Nested content overflowed its measured grid');
        }
      }
      console.log(`${width} ${route}: stable ${samples[0].height}px, ${samples[0].nested.length} nested grids`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}

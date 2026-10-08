import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [manifestPath, outputPath = '.playground/site-review'] = args.filter(
  (value) => value !== '--editors-only',
);
if (!manifestPath)
  throw new Error(
    'Usage: node scripts/review-site.mjs <route-manifest.json> [output-directory]',
  );
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const routes = manifest.routes;
if (!Array.isArray(routes) || !routes.length)
  throw new Error(
    'Manifest must include routes with name, url, and optional editor_url.',
  );
const output = path.resolve(outputPath);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  generated_at: new Date().toISOString(),
  pages: [],
  editors: [],
};
const widths = [1440, 1024, 768, 390, 320];
const localURL = (value) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(value);
try {
  const context = await browser.newContext();
  for (const route of args.includes('--editors-only') ? [] : routes) {
    if (!localURL(route.url)) {
      throw new Error(
        'Browser review is restricted to the isolated local benchmark.',
      );
    }
    const name = String(route.name).replace(/[^a-z0-9_-]/gi, '-');
    for (const width of widths) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(route.url, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.race([
          Promise.all(
            [...document.images].map((image) => {
              image.loading = 'eager';
              return image.decode().catch(() => {});
            }),
          ),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      const diagnostics = await page.evaluate(() => {
        const visible = (element) => element.getBoundingClientRect().width > 0;
        const canvases = [
          ...document.querySelectorAll('.wp-block-tabor-canvas'),
        ];
        return {
          horizontal_overflow:
            document.documentElement.scrollWidth > innerWidth + 1,
          missing_images: [...document.images]
            .filter(
              (image) => visible(image) && image.src && !image.naturalWidth,
            )
            .map((image) => image.src),
          canvas_count: canvases.length,
          empty_canvases: canvases.filter(
            (element) =>
              visible(element) && element.getBoundingClientRect().height < 1,
          ).length,
          heading_count: document.querySelectorAll('h1').length,
          text_length: document.body.innerText.trim().length,
        };
      });
      const screenshot = path.join(output, `${name}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.pages.push({
        name: route.name,
        url: route.url,
        width,
        status: response?.status(),
        expected_canvas_count: route.expected_canvas_count ?? 1,
        errors,
        ...diagnostics,
        screenshot,
      });
      await page.close();
    }
  }
  const editors = [
    ...routes
      .filter((route) => route.editor_url)
      .map((route) => ({ name: route.name, url: route.editor_url })),
    ...(manifest.editors || []),
  ];
  for (const route of editors) {
    if (!localURL(route.url))
      throw new Error('Editor must be in the local benchmark.');
    const name = String(route.name).replace(/[^a-z0-9_-]/gi, '-');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    try {
      await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      if (new URL(page.url()).pathname.endsWith('/wp-login.php')) {
        await page.locator('#user_login').fill('admin');
        await page.locator('#user_pass').fill('password');
        await page.locator('#wp-submit').click();
        await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      }
      await page.waitForFunction(
        () =>
          window.wp?.data?.select('core/block-editor')?.getBlocks()?.length > 0,
        null,
        { timeout: 60000 },
      );
      const welcome = page.getByRole('button', { name: 'Close', exact: true });
      if (await welcome.isVisible()) await welcome.click();
      const blocks = await page.evaluate(() => {
        const flatten = (blocks) =>
          blocks.flatMap((block) => [
            block,
            ...flatten(block.innerBlocks || []),
          ]);
        const all = flatten(
          window.wp.data.select('core/block-editor').getBlocks(),
        );
        return {
          block_count: all.length,
          canvas_count: all.filter((block) => block.name === 'tabor/canvas')
            .length,
          invalid_blocks: all
            .filter((block) => block.isValid === false)
            .map((block) => ({ name: block.name, clientId: block.clientId })),
        };
      });
      let renderedCanvases = 0;
      if (
        blocks.canvas_count ||
        new URL(route.url).pathname.endsWith('/site-editor.php')
      ) {
        const canvas = page
          .frameLocator('iframe[name="editor-canvas"]')
          .locator('.wp-block-tabor-canvas')
          .first();
        await canvas.waitFor({ state: 'visible', timeout: 30000 });
        const bounds = await canvas.boundingBox();
        if (!bounds?.width || !bounds?.height)
          throw new Error('Editor Canvas has no visible dimensions.');
        renderedCanvases = await page
          .frameLocator('iframe[name="editor-canvas"]')
          .locator('.wp-block-tabor-canvas')
          .count();
      }
      const screenshot = path.join(output, `${name}-editor.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.editors.push({
        name: route.name,
        url: route.url,
        errors,
        ...blocks,
        rendered_canvas_count: renderedCanvases,
        screenshot,
      });
    } catch (error) {
      report.editors.push({
        name: route.name,
        url: route.url,
        errors: [...errors, error.message],
        invalid_blocks: [],
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
const failures = report.pages.filter(
  (page) =>
    page.errors.length ||
    page.horizontal_overflow ||
    page.missing_images.length ||
    page.empty_canvases ||
    page.canvas_count < page.expected_canvas_count ||
    page.text_length === 0 ||
    page.status >= 500,
);
const invalidEditors = report.editors.filter(
  (editor) => editor.errors.length || editor.invalid_blocks.length,
);
console.log(
  JSON.stringify(
    {
      pages: report.pages.length,
      editors: report.editors.length,
      failures,
      invalidEditors,
      report: path.join(output, 'report.json'),
    },
    null,
    2,
  ),
);
if (failures.length || invalidEditors.length) process.exitCode = 1;

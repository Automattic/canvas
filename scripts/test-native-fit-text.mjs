import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The fixture is rendered by WordPress, including Core's real Fit Text runtime.
export async function testNativeFitText(page, url) {
  const checks = [];
  const boxSource = readFileSync(new URL('../src/measurement-box.mjs', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/text-fit.mjs', import.meta.url), 'utf8').replace("'./measurement-box.mjs'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(boxSource).toString('base64')}`));
  for (const form of ['frontend-child', 'editor-self']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    if (form === 'frontend-child') {
      const measurements = await page.evaluate(async source => {
        const { measureWidthFit } = await import(`data:text/javascript;base64,${btoa(source)}`);
        const item = document.createElement('h2');
        item.className = 'has-fit-text';
        item.textContent = 'AFTERIMAGE';
        // Deliberately retain emergency wrapping to test the measurement code
        // independently from the live Canvas stylesheet correction.
        item.style.cssText = 'font:800px/1 sans-serif;overflow-wrap:anywhere;width:320px';
        document.body.append(item);
        try {
          return [320, 768, 1440].map(width => ({ width, ...measureWidthFit(item, width) }));
        } finally { item.remove(); }
      }, source);
      for (const result of measurements) {
        assert.ok(result.size > 10 && result.size < result.width / 3, JSON.stringify(result));
        assert.ok(result.height < result.width, JSON.stringify(result));
      }
      checks.push({ name: 'native-width-fit-measurement', measurements });
    }
    if (form === 'editor-self') {
      // Preserve Core's initialized elements/observers while matching the editor
      // structure, where the heading itself owns the Canvas placement.
      await page.evaluate(() => {
        for (const heading of document.querySelectorAll('[class*="canvas-native-fit-"]')) {
          const wrapper = heading.closest('.canvas__item');
          for (const attribute of wrapper.attributes) {
            if (attribute.name === 'class') heading.classList.add(...wrapper.classList);
            else if (attribute.name === 'style') heading.style.cssText += ';' + attribute.value;
            else heading.setAttribute(attribute.name, attribute.value);
          }
          wrapper.replaceWith(heading);
        }
      });
    }
    for (const width of [1440, 390, 768, 320, 1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(500);
      const read = () => page.evaluate(() => [...document.querySelectorAll('[class*="canvas-native-fit-"]')].map(heading => {
        const range = document.createRange();
        range.selectNodeContents(heading);
        const bounds = range.getBoundingClientRect();
        const box = heading.getBoundingClientRect();
        return { text: heading.textContent, fontSize: parseFloat(getComputedStyle(heading).fontSize), width: box.width, height: box.height, textWidth: bounds.width, textHeight: bounds.height, overflowWrap: getComputedStyle(heading).overflowWrap };
      }));
      const first = await read();
      await page.waitForTimeout(250);
      const settled = await read();
      assert.equal(settled.length, 3, 'All native Fit Text fixtures must render.');
      for (const [index, item] of settled.entries()) {
        const label = `${form} ${width}px ${item.text}: ${JSON.stringify(item)}`;
        assert.ok(item.fontSize > 8 && item.fontSize < 1000, label);
        assert.ok(item.textWidth <= item.width + 1, label);
        assert.ok(item.height < 1200 && item.textHeight < 1200, label);
        assert.ok(Math.abs(item.height - first[index].height) <= 1, `Fit must settle: ${label}`);
        assert.equal(item.overflowWrap, 'normal', label);
      }
      assert.ok(settled[0].textHeight < settled[0].fontSize * 2, 'AFTERIMAGE must not wrap into a vertical stack.');
      checks.push({ name: 'native-fit-text', form, width, headings: settled });
    }
  }
  return checks;
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function testNativeOverlay(page, route) {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(route.url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  const nav = page.locator('.canvas-flow-navigation');
  const open = nav.locator('.wp-block-navigation__responsive-container-open');
  await open.click();
  const menu = nav.locator('.wp-block-navigation__responsive-container.is-menu-open');
  await menu.waitFor({ state: 'visible' });
  await page.waitForFunction(() => Math.abs(document.querySelector('.canvas-flow-navigation .is-menu-open')?.getBoundingClientRect().y || 0) <= 1);
  const geometry = await menu.evaluate(menu => {
    const box = menu.getBoundingClientRect();
    const link = menu.querySelector('a');
    const target = link.getBoundingClientRect();
    const hit = document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2);
    return { x: box.x, y: box.y, width: box.width, height: box.height, hit: hit === link || link.contains(hit), position: getComputedStyle(menu).position };
  });
  assert.equal(geometry.position, 'fixed');
  assert.ok(Math.abs(geometry.x) <= 1 && Math.abs(geometry.y) <= 1, JSON.stringify(geometry));
  assert.ok(geometry.width >= 389 && geometry.height >= 843, JSON.stringify(geometry));
  assert.equal(geometry.hit, true, 'Native menu link must paint above later Canvas sections');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await open.evaluate(button => document.activeElement === button), true, 'Native modal should restore trigger focus');
  return { name: route.name, overlay: true, nested: route.nested, ...geometry };
}

export async function testRotatedMeasurement(page) {
  const source = readFileSync(new URL('../src/measurement-box.mjs', import.meta.url), 'utf8');
  const measured = await page.evaluate(async source => {
    const module = await import(`data:text/javascript;base64,${btoa(source)}`);
    const parent = document.createElement('div');
    parent.style.rotate = '20deg';
    const box = document.createElement('div');
    box.style.cssText = 'width:400px;height:48px;rotate:45deg;box-sizing:border-box';
    parent.append(box); document.body.append(parent);
    const result = { visual: box.getBoundingClientRect().height, intrinsic: module.intrinsicBoxSize(box) };
    parent.remove(); return result;
  }, source);
  assert.ok(measured.visual > 100);
  assert.deepEqual(measured.intrinsic, { width: 400, height: 48 });
  return { name: 'untransformed-intrinsic-box', ...measured };
}

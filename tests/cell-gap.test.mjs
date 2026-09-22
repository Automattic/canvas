import test from 'node:test';
import assert from 'node:assert/strict';
import { gapAxes, resolveGap, inheritedGap, withGap, withGlobalGap, pageGapTargets } from '../src/cell-gap.mjs';

test('gap cascade preserves zero, tokens, custom units and partial axis overrides', () => {
  assert.deepEqual(resolveGap('2rem', { top: 'var:preset|spacing|40' }, { left: 0 }), { top: 'var:preset|spacing|40', left: 0 });
  assert.deepEqual(resolveGap('2rem', { top: '', left: null }), { top: '2rem', left: '2rem' });
  assert.deepEqual(gapAxes(undefined), {});
  const base = { spacing: { blockGap: '1rem' }, blocks: { 'tabor/canvas': { spacing: { blockGap: { left: '2rem' } } } } };
  base.blocks['tabor/canvas'].variations = { airy: { spacing: { blockGap: { top: '4vw' } } } };
  const user = { spacing: { blockGap: '3rem' }, blocks: { 'tabor/canvas': { spacing: { blockGap: { left: '5px' } } } } };
  assert.deepEqual(inheritedGap(base, user, 'is-style-airy'), { top: '4vw', left: '5px' });
});

test('reset and global edits preserve other spacing, block and style properties', () => {
  const style = { color: { text: 'red' }, spacing: { padding: '2px', blockGap: '3px' } };
  assert.deepEqual(withGap(style, undefined), { color: { text: 'red' }, spacing: { padding: '2px' } });
  assert.equal(style.spacing.blockGap, '3px');
  assert.deepEqual(withGap({ spacing: { blockGap: '3px' } }, undefined), {});
  const styles = { color: { text: 'blue' }, blocks: { 'core/group': { color: { text: 'green' } }, 'tabor/canvas': style } };
  const next = withGlobalGap(styles, { top: '0px', left: 'var:preset|spacing|40' });
  assert.equal(next.blocks['core/group'], styles.blocks['core/group']);
  assert.equal(next.blocks['tabor/canvas'].spacing.padding, '2px');
  assert.equal(next.blocks['tabor/canvas'].color, style.color);
  assert.equal(styles.blocks['tabor/canvas'].spacing.blockGap, '3px');
});

test('page action replaces overrides, finds nested canvases and excludes other entities and restricted blocks', () => {
  const canvas = (clientId, gap) => ({ clientId, name: 'tabor/canvas', attributes: { style: withGap({}, gap) } });
  const blocks = [canvas('source', '2rem'), canvas('same', { top: '2rem', left: '2rem' }), canvas('custom', '5px'),
    { name: 'core/group', innerBlocks: [canvas('nested'), canvas('locked')] },
    ...['core/block', 'core/template-part', 'core/post-content'].map(name => ({ name, innerBlocks: [canvas(name)] }))];
  const result = pageGapTargets(blocks, 'source', '2rem', id => id !== 'locked');
  assert.deepEqual(result.targets.map(b => b.clientId), ['custom', 'nested']);
  assert.equal(result.skipped, 1);
});

test('frontend and editor resolve identical defaults and partial overrides', async () => {
  const { spawnSync } = await import('node:child_process');
  const styles = { spacing: { blockGap: '1rem' }, blocks: { 'tabor/canvas': { spacing: { blockGap: { top: 'var:preset|spacing|40', left: '3vw' } } } } };
  styles.blocks['tabor/canvas'].variations = { airy: { spacing: { blockGap: { top: '4rem' } } } };
  const attributes = [{}, { style: { spacing: { blockGap: '0px' } } }, { className: 'is-style-airy', style: { spacing: { blockGap: { left: '2px' } } } }];
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const result = spawnSync('php', ['-r', String.raw`
    define('ABSPATH', '/'); function add_action() {} function add_filter() {}
    function wp_get_global_styles() { return json_decode($GLOBALS['argv'][2], true); }
    require $argv[1];
    echo json_encode(array_map('PlaygroundPlugin\\Canvas\\canvas_gap', json_decode($argv[3], true)));
  `, file, JSON.stringify(styles), JSON.stringify(attributes)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), attributes.map(attrs => resolveGap(inheritedGap(styles, {}, attrs.className), attrs.style?.spacing?.blockGap)));
});

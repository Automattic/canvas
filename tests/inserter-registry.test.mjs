import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasInserterPlugin } from '../src/inserter-registry.mjs';
import { ALLOWED_BLOCKS, BLOCK_NAME } from '../src/placement.mjs';

const item = (name, extra = {}) => ({ id: name, name, ...extra });
function fixture() {
  const marker = Symbol('Core selector metadata');
  const settings = { allowedBlockTypes: true, __experimentalSetIsInserterOpened() {} };
  const listSettings = { allowedBlocks: ['core/heading', 'core/group'], templateLock: false };
  let items = Object.freeze([
    item('core/group'), item('core/heading', { id: 'core/heading/h1' }),
    item('core/paragraph'), item('core/buttons', { isDisabled: true }),
    item('core/image'), item('core/video'), item('core/heading'),
    item('core/heading', { id: 'core/heading/h2', isSearchOnly: true }),
    item('core/block', { id: 'pattern/example' }),
  ]);
  const calls = [];
  const selectors = {
    [marker]: { privateSelectors: true },
    getBlockName: (id) => id === 'canvas' ? BLOCK_NAME : 'core/group',
    getInserterItems: (...args) => { calls.push(args); return items; },
    getBlockListSettings: () => listSettings,
    getSettings: () => settings,
    canInsertBlockType: () => false,
  };
  const otherSelectors = {};
  const registry = { select: (store) => (store?.name || store) === 'core/block-editor' ? selectors : otherSelectors };
  const plugin = canvasInserterPlugin(registry);
  const scoped = plugin.select('core/block-editor');
  return { plugin, scoped, selectors, marker, otherSelectors, calls, settings, listSettings, setItems: (next) => { items = next; } };
}

test('native Inserter retains eligible variations in intentional block order', () => {
  const { scoped, selectors, calls } = fixture();
  const options = { filtering: true };
  const result = scoped.getInserterItems('canvas', options);
  assert.deepEqual(result.map(({ id }) => id), ['core/heading/h1', 'core/heading', 'core/heading/h2', 'core/paragraph', 'core/image', 'core/buttons', 'core/video']);
  assert.equal(result.find(({ id }) => id === 'core/heading/h2').isSearchOnly, true);
  assert.equal(result.find(({ id }) => id === 'core/buttons').isDisabled, true);
  assert.deepEqual(calls[0], ['canvas', options]);
  assert.equal(selectors.getInserterItems('canvas').length, 9);
  assert.strictEqual(result, scoped.getInserterItems('canvas', options));
});

test('eligibility updates remove unavailable choices without manufacturing replacements', () => {
  const { scoped, setItems } = fixture();
  const before = scoped.getInserterItems('canvas');
  const heading = item('core/heading');
  setItems([heading, item('core/heading', { id: 'core/heading/h3' })]);
  assert.deepEqual(scoped.getInserterItems('canvas').map(({ id }) => id), ['core/heading', 'core/heading/h3']);
  assert.notStrictEqual(scoped.getInserterItems('canvas'), before);
  setItems([]);
  assert.deepEqual(scoped.getInserterItems('canvas'), []);
});

test('native container variations retain their attributes, children, and eligibility', () => {
  const { scoped, setItems } = fixture();
  const columns = item('core/columns', {
    id: 'core/columns/two-columns-equal',
    initialAttributes: { verticalAlignment: 'center' },
    innerBlocks: [['core/column', { width: '50%' }], ['core/column', { width: '50%' }]],
  });
  const embed = item('core/embed', {
    id: 'core/embed/youtube',
    initialAttributes: { providerNameSlug: 'youtube', responsive: true },
    isDisabled: true,
  });
  setItems([embed, columns]);
  assert.deepEqual(scoped.getInserterItems('canvas'), [columns, embed]);
  assert.strictEqual(scoped.getInserterItems('canvas')[0], columns);
  assert.strictEqual(scoped.getInserterItems('canvas')[1], embed);
  setItems([columns]);
  assert.deepEqual(scoped.getInserterItems('canvas'), [columns]);
});

for (const [name, content] of [
  ['core/heading', 'This is a heading'],
  ['core/paragraph', 'A thoughtful composition keeps its character across different screens. This longer paragraph should stay alongside the heading while there is enough room, then widen only as much as it needs.'],
]) test(`${name} text is present at native block creation without changing core entries or supplied content`, () => {
  const { scoped, selectors, setItems } = fixture();
  assert.equal(scoped.getInserterItems('canvas').find((item) => item.id === name).initialAttributes.content, content);
  assert.equal(selectors.getInserterItems('canvas').find((item) => item.id === name).initialAttributes, undefined);
  setItems([item(name, { initialAttributes: { content: 'Provided heading', level: 3 } })]);
  assert.deepEqual(scoped.getInserterItems('canvas')[0].initialAttributes, { content: 'Provided heading', level: 3 });
});

test('other destinations and all unrelated selectors retain their original results', () => {
  const { plugin, scoped, selectors, marker, otherSelectors } = fixture();
  assert.strictEqual(scoped.getInserterItems('group'), selectors.getInserterItems('group'));
  assert.strictEqual(scoped.getInserterItems(), selectors.getInserterItems());
  assert.strictEqual(scoped.canInsertBlockType, selectors.canInsertBlockType);
  assert.ok(marker in scoped);
  assert.strictEqual(scoped[marker], selectors[marker]);
  assert.strictEqual(plugin.select({ name: 'core/block-editor' }), scoped);
  assert.strictEqual(plugin.select('core/blocks'), otherSelectors);
});

test('Browse all is omitted only from the local settings without changing editor settings', () => {
  const { scoped, settings } = fixture();
  assert.equal('__experimentalSetIsInserterOpened' in scoped.getSettings(), false);
  assert.equal(scoped.getSettings().allowedBlockTypes, true);
  assert.equal(typeof settings.__experimentalSetIsInserterOpened, 'function');
  assert.strictEqual(scoped.getSettings(), scoped.getSettings());
});

test('local priorities preserve insertion permissions and do not alter other block lists', () => {
  const { scoped, listSettings } = fixture();
  const local = scoped.getBlockListSettings('canvas');
  assert.deepEqual(local.prioritizedInserterBlocks, ALLOWED_BLOCKS);
  assert.strictEqual(local.allowedBlocks, listSettings.allowedBlocks);
  assert.equal(local.templateLock, false);
  assert.equal('prioritizedInserterBlocks' in listSettings, false);
  assert.strictEqual(scoped.getBlockListSettings('group'), listSettings);
  assert.strictEqual(local, scoped.getBlockListSettings('canvas'));
});

test('site blocks preserve native insertion eligibility and initial attributes', () => {
  const { scoped, setItems } = fixture();
  const navigation = item('core/navigation', { isDisabled: true, initialAttributes: { ref: 42 } });
  const title = item('core/post-title', { initialAttributes: { level: 1 } });
  const query = item('core/query');
  setItems([navigation, title, query]);
  assert.deepEqual(scoped.getInserterItems('canvas'), [navigation, title, query]);
  assert.strictEqual(scoped.getInserterItems('canvas')[0], navigation);
  assert.equal(scoped.getInserterItems('canvas').some(({ name }) => name === 'core/site-logo'), false);
  setItems([title]);
  assert.deepEqual(scoped.getInserterItems('canvas'), [title]);
});

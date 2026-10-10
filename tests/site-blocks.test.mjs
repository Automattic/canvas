import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ALLOWED_BLOCKS, FLOW_BLOCKS } from '../src/placement.mjs';
import { withInsertionDefaults } from '../src/insertion-defaults.mjs';
import { contentFill } from '../src/content-fill.mjs';

const siteBlocks = [
  'core/site-logo', 'core/site-title', 'core/navigation',
  'core/post-title', 'core/post-featured-image', 'core/post-excerpt',
];

const nativeContentBlocks = [
  'accordion', 'archives', 'audio', 'breadcrumbs', 'calendar', 'categories',
  'code', 'columns', 'cover', 'details', 'embed', 'file', 'footnotes', 'freeform', 'gallery', 'html', 'icon',
  'latest-comments', 'latest-posts', 'list', 'loginout', 'math', 'media-text',
  'navigation-overlay-close', 'page-list', 'playlist', 'post-comments-count',
  'post-comments-link', 'post-navigation-link', 'post-template',
  'post-time-to-read', 'preformatted', 'pullquote', 'query-no-results',
  'query-total', 'quote', 'read-more', 'rss', 'separator', 'site-tagline',
  'social-links', 'spacer', 'table', 'tabs', 'tag-cloud', 'term-count',
  'term-name', 'term-template', 'terms-query', 'verse', 'widget-group',
].map(name => `core/${name}`);

test('native content and containers use intrinsic layout without fabricated content', () => {
  assert.equal(new Set(ALLOWED_BLOCKS).size, ALLOWED_BLOCKS.length);
  for (const name of nativeContentBlocks) {
    assert.ok(ALLOWED_BLOCKS.includes(name), name);
    assert.ok(FLOW_BLOCKS.includes(name), name);
    const block = { name, attributes: { className: 'authored' }, innerBlocks: [] };
    assert.equal(withInsertionDefaults(block, 'desktop', {}), block, name);
    assert.equal(contentFill(name, { canvas: { fill: true } }), false, name);
  }
});

test('parent-bound and internal Core blocks are not independent Canvas items', () => {
  for (const name of [
    'accordion-item', 'accordion-heading', 'accordion-panel', 'column',
    'list-item', 'playlist-track', 'social-link', 'tab-list', 'tab-panel',
    'tab-panels', 'button', 'page-list-item', 'missing', 'pattern', 'text-columns',
  ]) {
    assert.equal(ALLOWED_BLOCKS.includes(`core/${name}`), false, name);
  }
});

test('editor and server register the same bounded set of Canvas children', () => {
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = String.raw`
define('ABSPATH', '/');
function add_action() {} function add_filter() {}
require $argv[1];
$registered=[];
foreach (PlaygroundPlugin\Canvas\ALLOWED_BLOCKS as $name) {
  $args=PlaygroundPlugin\Canvas\register_child_attribute(['attributes'=>['native'=>['type'=>'string']]], $name);
  $registered[$name]=$args['attributes'];
}
echo json_encode($registered);
`;
  const result = spawnSync('php', ['-r', code, file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const registered = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(registered).sort(), [...ALLOWED_BLOCKS].sort());
  for (const name of [...siteBlocks, ...nativeContentBlocks]) {
    assert.deepEqual(registered[name], { native: { type: 'string' }, canvas: { type: 'object' } });
  }
  assert.equal(ALLOWED_BLOCKS.includes('core/post-content'), true);
  assert.equal(ALLOWED_BLOCKS.includes('core/query'), true);
});

test('dynamic blocks retain native attributes and never receive static content or media defaults', () => {
  for (const name of siteBlocks) {
    const block = {
      name, clientId: name,
      attributes: { ref: 12, level: 1, isLink: true, canvas: { desktop: { column: 2, row: 3 } } },
      innerBlocks: [{ name: 'core/navigation-link', attributes: { label: 'News', url: '/news/' } }],
    };
    assert.equal(withInsertionDefaults(block, 'desktop', {}), block);
    assert.equal(contentFill(name, { canvas: { fill: true } }), false);
  }
});

test('Canvas renders native dynamic blocks with their original context and references', () => {
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = String.raw`
define('ABSPATH', '/');
function add_action() {} function add_filter() {}
function apply_filters($name, $value) { return $value; }
function esc_attr($value) { return htmlspecialchars((string)$value, ENT_QUOTES); }
function wp_json_encode($value) { return json_encode($value); }
function wp_get_global_styles() { return []; }
function get_block_wrapper_attributes() { return 'class="wp-block-tabor-canvas"'; }
require $argv[1];
class NativeBlock {
  public $parsed_block=[];
  public $name, $attributes, $context, $inner_blocks=[];
  function __construct($name) {
    $this->name=$name;
    $this->attributes=['ref'=>42,'canvas'=>['desktop'=>['column'=>2,'row'=>3]]];
    $this->context=['postId'=>17,'postType'=>'post'];
  }
  function render() {
    $GLOBALS['renders'][]=[$this->name,$this->context,$this->attributes];
    return '<div class="native-block">'.esc_attr($this->name).'</div>';
  }
}
$root=new NativeBlock('tabor/canvas');
foreach (json_decode($argv[2]) as $name) $root->inner_blocks[]=new NativeBlock($name);
$before=serialize($root);
$html=PlaygroundPlugin\Canvas\render_canvas([], '', $root);
echo json_encode(['html'=>$html,'renders'=>$GLOBALS['renders'],'restored'=>$before===serialize($root)]);
`;
  const result = spawnSync('php', ['-r', code, file, JSON.stringify(siteBlocks)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { html, renders, restored } = JSON.parse(result.stdout);
  assert.equal(restored, true);
  assert.equal(renders.length, siteBlocks.length);
  for (const [index, name] of siteBlocks.entries()) {
    assert.ok(html.includes(`data-canvas-name="${name}"`));
    assert.deepEqual(renders[index], [name, { postId: 17, postType: 'post' }, { ref: 42, canvas: { desktop: { column: 2, row: 3 } } }]);
  }
});

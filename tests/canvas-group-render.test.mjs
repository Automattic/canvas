import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('native rendering retains wrappers through nested context refresh and restores the render tree', () => {
  const file = new URL('../includes/canvas.php', import.meta.url).pathname;
  const code = String.raw`
define('ABSPATH', '/');
function add_action() {} function add_filter() {}
function esc_attr($value) { return htmlspecialchars((string)$value, ENT_QUOTES); }
function wp_json_encode($value) { return json_encode($value); }
function wp_get_global_styles() { return []; }
function get_block_wrapper_attributes() { return 'class="wp-block-tabor-canvas"'; }
require $argv[1];
class RenderBlock {
  public $name, $attributes, $inner_content, $inner_blocks, $parsed_block;
  function __construct($parsed) {
    $this->parsed_block=$parsed; $this->name=$parsed['blockName']; $this->attributes=$parsed['attrs'];
    $this->inner_content=$parsed['innerContent'];
    $this->inner_blocks=array_map(fn($child)=>new RenderBlock($child), $parsed['innerBlocks']);
  }
  function render() {
    // WP_Block refreshes descendants from parsed_block when inherited context changes.
    $this->inner_blocks=array_map(fn($child)=>new RenderBlock($child), $this->parsed_block['innerBlocks']);
    $GLOBALS['renders'][$this->attributes['testId']]=($GLOBALS['renders'][$this->attributes['testId']]??0)+1;
    $html=''; $index=0;
    foreach($this->inner_content as $chunk) $html.=null===$chunk ? $this->inner_blocks[$index++]->render() : $chunk;
    return $html;
  }
}
function block($id,$name,$children=[],$canvas=false) {
  return ['blockName'=>$name,'attrs'=>['testId'=>$id,'canvas'=>$canvas?['group'=>1]:[]],
    'innerBlocks'=>$children,'innerContent'=>array_merge(['<div class="native-'.$id.'" style="padding:12px">'],array_fill(0,count($children),null),[$id.'</div>'])];
}
$leaf=block('text','core/paragraph');
$inner=block('inner','core/group',[$leaf],true);
$native=block('stack','core/group',[block('button','core/buttons')]);
$outer=block('outer','core/group',[$inner,$native],true);
$canvas=new RenderBlock(block('canvas','tabor/canvas',[$outer]));
$before=serialize($canvas);
$html=PlaygroundPlugin\Canvas\render_canvas([], '', $canvas);
echo json_encode(['html'=>$html,'restored'=>$before===serialize($canvas),'renders'=>$GLOBALS['renders']]);
`;
  const result=spawnSync('php',['-r',code,file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const {html,restored,renders}=JSON.parse(result.stdout);
  assert.equal((html.match(/data-canvas-name=/g)||[]).length,4);
  assert.equal((html.match(/data-canvas-group=""/g)||[]).length,2);
  assert.match(html,/data-canvas-name="core\/paragraph"/);
  assert.match(html,/class="native-inner" style="padding:12px"/);
  assert.equal((html.match(/data-canvas-name="core\/buttons"/g)||[]).length,0);
  assert.deepEqual(renders,{outer:1,inner:1,text:1,stack:1,button:1});
  assert.equal(restored,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source = new URL('../includes/abilities.php',import.meta.url).pathname;
function php(code){const r=spawnSync('php',['-r',`define('ABSPATH','/'); function add_action(){} function add_filter(){} class WP_Error {function __construct(public $code,public $message,public $data){}} require dirname($argv[1]).'/canvas.php'; require $argv[1]; ${code}`,source],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
test('malformed and mismatched Gutenberg comments are rejected before permissive WordPress parsing',()=>{
 const results=php(`echo json_encode(array_map('PlaygroundPlugin\\\\Abilities\\\\balanced_markup', [
 '<!-- wp:tabor/canvas --><!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph --><!-- /wp:tabor/canvas -->',
 '<!-- wp:tabor/canvas /-->', '<!-- wp:tabor/canvas -->', '<!-- wp:paragraph --><!-- /wp:heading -->',
 '<!-- wp:tabor/canvas {bad} /-->', '<!-- /wp:tabor/canvas -->', '<!-- wp:tabor/canvas {"align":"wide"} /-->' ]));`);
 assert.deepEqual(results,[true,true,false,false,false,false,true]);
});
test('placement validation accepts wide anchors and rejects grid overflow and invalid frames',()=>{
 const results=php(`echo json_encode(array_map(function($layout){return true===PlaygroundPlugin\\Abilities\\validate_layout($layout);},[
 ['desktop'=>['column'=>1,'columnSpan'=>24,'gridColumns'=>24,'anchors'=>['left'=>'wide','right'=>'wide']]],
 ['mobile'=>['column'=>1,'columnSpan'=>9,'gridColumns'=>8]],
 ['mobile'=>['column'=>1,'columnSpan'=>12]], ['mobile'=>['column'=>1,'columnSpan'=>13]],
 ['desktop'=>['anchors'=>['top'=>'wide']]], ['desktop'=>['row'=>499,'rowSpan'=>3]],
 ['desktop'=>['frameRatio'=>-1]], ['desktop'=>['free'=>['x'=>0.9,'y'=>0,'width'=>0.5,'ratio'=>1]]],
 ['desktop'=>['column'=>1.5]], ['desktop'=>['anchors'=>['bottom'=>'after:2']]],
 ['desktop'=>['free'=>['x'=>-0.5,'y'=>0,'width'=>2,'ratio'=>1]]],
 ['desktop'=>['free'=>['x'=>-2049,'y'=>0,'width'=>1,'ratio'=>1]]],
 ['desktop'=>['free'=>['x'=>2048,'y'=>0,'width'=>1,'ratio'=>1]]],
 ['desktop'=>['free'=>['x'=>0,'y'=>0,'width'=>2049,'ratio'=>1]]]
]));`);
 assert.deepEqual(results,[true,false,true,false,false,false,false,true,false,false,true,false,false,false]);
});

test('authoring validates only the new nested schema and independent finite layer values', () => {
 const results=php(`echo json_encode(array_map(function($layout){return true===PlaygroundPlugin\\Abilities\\validate_layout($layout);},[
 ['fitArea'=>true,'layers'=>['desktop'=>1.5,'mobile'=>-0.5]], ['fitArea'=>false],
 ['fitArea'=>'true'], ['layers'=>['phone'=>1]], ['layers'=>['desktop'=>'2']], ['layers'=>['mobile'=>INF]],
 ['desktop'=>['anchors'=>['left'=>-3,'right'=>'wide-end']]],
 ['desktop'=>['anchors'=>['left'=>'after:2']]], ['desktop'=>['anchors'=>['bottom'=>'center']]],
 ['desktop'=>['anchors'=>['middle'=>1]]], ['desktop'=>['anchors'=>'wide']],
 ['desktop'=>['layer'=>1]], ['desktop'=>['edgeLeft'=>'wide']], ['textFit'=>true]
]));`);
 assert.deepEqual(results,[true,true,false,false,false,false,true,false,false,false,false,false,false,false]);
});

test('precise frames reject every removed vertical pinning mode', () => {
 const results = php(`$frame = ['x'=>0.1,'y'=>3,'width'=>0.8,'ratio'=>2];
 echo json_encode(array_map(function($anchor) use ($frame) {
   return true === PlaygroundPlugin\\Abilities\\validate_layout(['desktop'=>['free'=>array_merge($frame,['anchorY'=>$anchor])]]);
 }, ['top','center','bottom','middle','',null,0,true,[]]));`);
 assert.deepEqual(results, [false,false,false,false,false,false,false,false,false]);
});

test('directional pinning metadata is unsupported', () => {
 const results = php(`echo json_encode(array_map(function($anchor) {
   return true === PlaygroundPlugin\\Abilities\\validate_layout(['desktop'=>['anchorOffsets'=>['right'=>$anchor]]]);
 }, [0,3,2.375,2048,-1,2049,NAN,'',true]));`);
 assert.deepEqual(results, [false,false,false,false,false,false,false,false,false]);
});


test('all Canvas settings reject malformed values and accept supported boundaries', () => {
 const results = php(`echo json_encode(array_map(function($layout){return true===PlaygroundPlugin\\Abilities\\validate_layout($layout);},[
 ['fit'=>'banana'], ['shape'=>[]], ['aspectRatio'=>-2], ['aspectRatio'=>'2'], ['aspectRatio'=>INF],
 ['group'=>'yes'], ['group'=>true], ['order'=>[]], ['order'=>-1], ['order'=>0.5],
 ['offset'=>['desktop'=>['x'=>'bad']]], ['offset'=>['phone'=>[]]], ['offset'=>['desktop'=>['z'=>1]]], ['offset'=>'bad'],
 ['imagePosition'=>['x'=>100]], ['imagePosition'=>['x'=>NAN]], ['imagePosition'=>['z'=>0]], ['imagePosition'=>null],
 ['verticalAlign'=>'stretch'], ['shape'=>null],
 ['desktop'=>['free'=>true]], ['desktop'=>['free'=>['x'=>0,'y'=>0,'width'=>1,'ratio'=>1,'extra'=>1]]],
 ['fit'=>'contain','shape'=>'circle','verticalAlign'=>'bottom','aspectRatio'=>0.01,'group'=>1,'order'=>0],
 ['imagePosition'=>['x'=>0,'y'=>1],'offset'=>['desktop'=>['x'=>-0.5,'y'=>1.25],'mobile'=>['x'=>0]]],
 ['imagePosition'=>[],'offset'=>[]], []
 ]));`);
 assert.deepEqual(results, [...Array(22).fill(false), true, true, true, true]);
});

test('authoring rejects numeric as well as named vertical boundary overrides',()=>{
 const results=php(`echo json_encode(array_map(function($anchors){return true===PlaygroundPlugin\\Abilities\\validate_layout(['desktop'=>['anchors'=>$anchors]]);},[
 ['top'=>0],['top'=>-3],['bottom'=>12],['bottom'=>0],['top'=>0,'bottom'=>12],['top'=>'canvas'],['bottom'=>'padding'],['left'=>0,'right'=>'wide']
 ]));`);
 assert.deepEqual(results,[false,false,false,false,false,false,false,true]);
});

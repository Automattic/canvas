import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { alignmentAttributes, mobileAlignmentUpdates } from '../src/alignment.mjs';
import { compactCanvas } from '../src/serialization.mjs';

test('mobile alignment edits preserve desktop styles and do not create a placement', () => {
  const base = { style: { typography: { textAlign: 'right', fontSize: '24px' } } };
  const updates = mobileAlignmentUpdates(base, base, {style:{typography:{textAlign:'center',fontSize:'24px'}}});
  assert.equal(updates.style.typography.textAlign, 'right');
  assert.deepEqual(compactCanvas(updates.canvas), {mobileTextAlign:'center'});
  const saved = {...base, canvas:updates.canvas};
  const shown = {...saved, style:{typography:{textAlign:'center',fontSize:'24px'}}};
  const resized = mobileAlignmentUpdates(saved, shown, {style:{typography:{textAlign:'center',fontSize:'32px'}}});
  assert.equal(resized.style.typography.textAlign, 'right');
  assert.equal(resized.style.typography.fontSize, '32px');
  assert.equal(resized.canvas, undefined);
  const reset = mobileAlignmentUpdates(saved, shown, {style:{typography:{textAlign:undefined}}});
  assert.deepEqual(compactCanvas(reset.canvas), {});
});

test('PHP and JavaScript preserve and render mobile alignment consistently', () => {
  const cases = ['left','center','right','justify',undefined].map(mobileTextAlign => ({canvas:{mobileTextAlign}}));
  const result = spawnSync('php',['-r',String.raw`define('ABSPATH','/'); function add_action(){} function add_filter(){} require $argv[1]; echo json_encode(array_map(function($a){ return [PlaygroundPlugin\Canvas\compact_canvas($a['canvas']), PlaygroundPlugin\Canvas\alignment_attributes('core/heading',$a)]; },json_decode(stream_get_contents(STDIN),true)));`, new URL('../includes/canvas.php',import.meta.url).pathname], {input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), cases.map(a => [compactCanvas(a.canvas),alignmentAttributes('core/heading',a)]));
  assert.equal(alignmentAttributes('core/heading',{canvas:{mobileTextAlign:'invalid'}})['data-canvas-mobile-text-align'],undefined);
});

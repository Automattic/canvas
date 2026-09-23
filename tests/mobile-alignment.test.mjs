import test from 'node:test';
import assert from 'node:assert/strict';
import { responsiveAlignmentAttributes, responsiveAlignmentUpdates } from '../src/alignment.mjs';

for (const mode of ['tablet', 'mobile']) {
  const viewport = `@${mode}`;
  const other = mode === 'tablet' ? '@mobile' : '@tablet';
  test(`${mode} toolbar writes native styles and preserves desktop, other viewport, and typography`, () => {
    const attributes = {canvas:{desktop:{column:1}},style:{typography:{textAlign:'right',fontSize:'24px'},[viewport]:{color:{text:'red'},typography:{lineHeight:'1.2'}},[other]:{typography:{textAlign:'left'}}}};
    const before = structuredClone(attributes);
    const shown = responsiveAlignmentAttributes(attributes, mode);
    const update = responsiveAlignmentUpdates(attributes, shown, {style:{...shown.style,typography:{...shown.style.typography,textAlign:'center'}}},mode);
    assert.equal(update.style.typography.textAlign, 'right');
    assert.deepEqual(update.style[viewport],{color:{text:'red'},typography:{lineHeight:'1.2',textAlign:'center'}});
    assert.deepEqual(update.style[other],attributes.style[other]);
    assert.equal(update.canvas,undefined);
    assert.deepEqual(attributes,before);
    const saved = {...attributes,...update};
    const projected = responsiveAlignmentAttributes(saved,mode);
    assert.equal(projected.style.typography.textAlign,'center');
    const resized = responsiveAlignmentUpdates(saved,projected,{style:{...projected.style,typography:{...projected.style.typography,fontSize:'32px'}}},mode);
    assert.equal(resized.style.typography.textAlign,'right');
    assert.equal(resized.style.typography.fontSize,'32px');
    assert.equal(resized.style[viewport].typography.textAlign,'center');
    const reset = responsiveAlignmentUpdates(saved,projected,{style:{...projected.style,typography:{...projected.style.typography,textAlign:undefined}}},mode);
    assert.equal(reset.style[viewport].typography.textAlign,undefined);
    assert.equal(reset.style.typography.textAlign,'right');
  });
  test(`${mode} native Responsive styles edits pass through without overwriting base styles`, () => {
    const attributes = {style:{typography:{textAlign:'right'},[viewport]:{typography:{textAlign:'center'}}}};
    const shown = responsiveAlignmentAttributes(attributes,mode);
    const update = responsiveAlignmentUpdates(attributes,shown,{style:{...shown.style,[viewport]:{typography:{textAlign:'left'}}}},mode);
    assert.equal(update.style.typography.textAlign,'right');
    assert.equal(update.style[viewport].typography.textAlign,'left');
  });
}
test('desktop and unrelated attribute updates retain native behavior', () => {
  const attributes = {style:{typography:{textAlign:'right'}}};
  assert.equal(responsiveAlignmentAttributes(attributes,'desktop'),attributes);
  const update = {style:{typography:{textAlign:'center'}}};
  assert.equal(responsiveAlignmentUpdates(attributes,attributes,update,'desktop'),update);
  const content = {content:'Changed text'};
  assert.equal(responsiveAlignmentUpdates(attributes,attributes,content,'mobile'),content);
});

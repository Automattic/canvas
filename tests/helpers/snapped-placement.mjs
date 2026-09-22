import assert from 'node:assert/strict';

// A committed horizontal edge can belong to a cell, a wide boundary, or the
// canvas center. Test actual coordinates independently of the snap algorithm.
export function assertHorizontalSnap(p) {
  const g = p._canvas, r = p._rect, base = p._base;
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
  for (const [key, side, coordinate] of [['left', 'start', r.left], ['right', 'end', r.left + r.width]]) {
    const start = side === 'start';
    const target = { canvas: start ? 0 : g.width, padding: start ? g.padding.left : g.width - g.padding.right,
      wide: start ? g.wideStart : g.wideEnd, 'wide-start': g.wideStart, 'wide-end': g.wideEnd, center: g.center ?? g.width / 2 }[base.anchors[key]];
    if (target !== undefined) close(coordinate, target);
    else assert.ok(g.columns.some(track => Math.abs(track[side] - coordinate) < 1e-7), `${coordinate} is not a column ${side}`);
  }
}

export function assertNearestRowCenter(p) {
 const g=p._canvas,r=p._rect;
 const span=p.rowSpan;
 const error=Math.abs(r.top+r.height/2-g.height/2);
 const candidates=g.rows.slice(0,g.rows.length-span+1).map((row,i)=>({top:row.start,error:Math.abs((row.start+g.rows[i+span-1].end)/2-g.height/2)}));
 for(const candidate of candidates) {
  assert.ok(error <= candidate.error + 1e-7, 'Center must use the nearest valid row');
  if(Math.abs(error-candidate.error)<1e-7)assert.ok(r.top<=candidate.top+1e-7,'Earlier row wins a tie');
 }
 assert.ok(g.rows.some(row=>Math.abs(row.start-r.top)<1e-7));
 assert.ok(g.rows.some(row=>Math.abs(row.end-r.top-r.height)<1e-7));
}

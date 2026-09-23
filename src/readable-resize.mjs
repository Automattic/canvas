// Keep both the live preview and its eventual cell frame large enough for
// content. Searching along the gesture preserves opposite anchors, rotation,
// and center resizing without inventing another resize geometry path.
export function constrainReadableResize( resize, snap, measure ) {
	const fits = ( placement ) => {
		const rect = placement._rect;
		const grid = placement._canvas;
		const pitch = grid.rowHeight + grid.gap;
		const height =
			Math.ceil( ( measure( rect.width ) + grid.gap ) / pitch - 1e-7 ) *
				pitch -
			grid.gap;
		return rect.height >= height - 0.01;
	};
	const valid = ( placement ) =>
		fits( placement ) && fits( snap( placement ) );
	const requested = resize( 1 );
	if ( valid( requested ) ) {
		return requested;
	}
	let low = 0;
	let high = 1;
	let result = resize( 0 );
	for ( let pass = 0; pass < 12; pass++ ) {
		const middle = ( low + high ) / 2;
		const candidate = resize( middle );
		if ( valid( candidate ) ) {
			low = middle;
			result = candidate;
		} else {
			high = middle;
		}
	}
	return result;
}

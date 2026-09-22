const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );

// Store horizontal proportions and vertical row units, never viewport pixels.
export function normalizeFreeFrame( frame ) {
	if (
		! frame ||
		! [ 'x', 'y', 'width', 'ratio' ].every( ( key ) =>
			Number.isFinite( frame[ key ] )
		) ||
		frame.width <= 0 ||
		frame.ratio <= 0
	) {
		return undefined;
	}
	const width = clamp( frame.width, 0.000001, 1 );
	return {
		x: clamp( frame.x, 0, 1 - width ),
		y: clamp( frame.y, -500, 500 ),
		width,
		ratio: clamp( frame.ratio, 0.000001, 1000000 ),
	};
}

// Precise vertical positions use row units, independent of section height.
export function freeFrameFromRect( rect, geometry ) {
	return {
		x: rect.left / geometry.width,
		y:
			( rect.top - geometry.padding.top ) /
			( geometry.rowHeight + geometry.gap ),
		width: rect.width / geometry.width,
		ratio: rect.width / Math.max( 0.001, rect.height ),
	};
}
// Project a corner drag onto the ratio's diagonal instead of switching the
// controlling axis midway through a gesture. Side handles keep the opposite
// edge's midpoint fixed; corners keep the opposite corner fixed.
export function resizeAspectRect(
	rect,
	kind,
	dx,
	dy,
	ratio,
	bounds,
	rotation = 0,
	fromCenter = false
) {
	const horizontal = /[ew]/.test( kind );
	const vertical = /[ns]/.test( kind );
	let ax;
	if ( fromCenter ) {
		ax = 0.5;
	} else if ( kind.includes( 'w' ) ) {
		ax = 1;
	} else if ( kind.includes( 'e' ) ) {
		ax = 0;
	} else {
		ax = 0.5;
	}
	let ay;
	if ( fromCenter ) {
		ay = 0.5;
	} else if ( kind.includes( 'n' ) ) {
		ay = 1;
	} else if ( kind.includes( 's' ) ) {
		ay = 0;
	} else {
		ay = 0.5;
	}
	const wx = dx * ( kind.includes( 'w' ) ? -1 : 1 ) * ( fromCenter ? 2 : 1 );
	const hy = dy * ( kind.includes( 'n' ) ? -1 : 1 ) * ( fromCenter ? 2 : 1 );
	let delta;
	if ( horizontal && vertical ) {
		delta = ( wx + hy / ratio ) / ( 1 + 1 / ratio ** 2 );
	} else if ( horizontal ) {
		delta = wx;
	} else {
		delta = hy * ratio;
	}
	const radians = ( rotation * Math.PI ) / 180;
	const cos = Math.cos( radians ),
		sin = Math.sin( radians );
	const atWidth = ( width ) => {
		const height = width / ratio;
		const localX = ( 0.5 - ax ) * ( width - rect.width );
		const localY = ( 0.5 - ay ) * ( height - rect.height );
		return {
			left:
				rect.left +
				rect.width / 2 +
				localX * cos -
				localY * sin -
				width / 2,
			top:
				rect.top +
				rect.height / 2 +
				localX * sin +
				localY * cos -
				height / 2,
			width,
			height,
		};
	};
	// Every boundary is linear in width, including rotated anchors.
	const zero = atWidth( 0 ),
		unit = atWidth( 1 );
	let max = Infinity;
	for ( const [ origin, slope, limit ] of [
		[ -zero.left, zero.left - unit.left, 0 ],
		[ -zero.top, zero.top - unit.top, 0 ],
		[ zero.left, unit.left + 1 - zero.left, bounds.width ],
		[ zero.top, unit.top + 1 / ratio - zero.top, bounds.height ],
	] ) {
		if ( slope > 1e-9 ) {
			max = Math.min( max, ( limit - origin ) / slope );
		}
	}
	const minimum = Math.min( Math.max( 24, 24 * ratio ), max );
	return atWidth( clamp( rect.width + delta, minimum, max ) );
}

// Unlocked handles change only their own axes. Work from the original box so
// each pointer update is continuous and the opposite edge/corner stays fixed.
export function resizeRect(
	rect,
	kind,
	dx,
	dy,
	bounds,
	minimum,
	rotation = 0
) {
	const west = kind.includes( 'w' ),
		east = kind.includes( 'e' );
	const north = kind.includes( 'n' ),
		south = kind.includes( 's' );
	let width =
		west || east
			? Math.max( minimum.width, rect.width + ( west ? -dx : dx ) )
			: rect.width;
	let height =
		north || south
			? Math.max( minimum.height, rect.height + ( north ? -dy : dy ) )
			: rect.height;
	if ( ! rotation ) {
		width = Math.min(
			width,
			west ? rect.left + rect.width : bounds.width - rect.left
		);
		height = Math.min(
			height,
			north ? rect.top + rect.height : bounds.height - rect.top
		);
	}
	let horizontalDirection;
	if ( east ) {
		horizontalDirection = 0.5;
	} else if ( west ) {
		horizontalDirection = -0.5;
	} else {
		horizontalDirection = 0;
	}
	const localX = horizontalDirection * ( width - rect.width );
	let verticalDirection;
	if ( south ) {
		verticalDirection = 0.5;
	} else if ( north ) {
		verticalDirection = -0.5;
	} else {
		verticalDirection = 0;
	}
	const localY = verticalDirection * ( height - rect.height );
	const radians = ( rotation * Math.PI ) / 180;
	const next = {
		left:
			rect.left +
			rect.width / 2 +
			localX * Math.cos( radians ) -
			localY * Math.sin( radians ) -
			width / 2,
		top:
			rect.top +
			rect.height / 2 +
			localX * Math.sin( radians ) +
			localY * Math.cos( radians ) -
			height / 2,
		width,
		height,
	};
	// Keep a rotated resize within the canvas without moving its fixed anchor.
	let progress = 1;
	for ( const [ before, after, limit ] of [
		[ -rect.left, -next.left, 0 ],
		[ -rect.top, -next.top, 0 ],
		[ rect.left + rect.width, next.left + next.width, bounds.width ],
		[ rect.top + rect.height, next.top + next.height, bounds.height ],
	] ) {
		if ( after > limit && after > before ) {
			progress = Math.min(
				progress,
				Math.max( 0, ( limit - before ) / ( after - before ) )
			);
		}
	}
	return Object.fromEntries(
		Object.keys( next ).map( ( key ) => [
			key,
			rect[ key ] + ( next[ key ] - rect[ key ] ) * progress,
		] )
	);
}
export function freeFrameStyles( placement ) {
	if ( ! placement?.free || ! placement._rect || ! placement._canvas ) {
		return {};
	}
	const { _rect: rect, _canvas: canvas, _grid: grid } = placement;
	return {
		'--canvas-free-width': `${ rect.width }px`,
		'--canvas-free-height': `${ rect.height }px`,
		'--canvas-free-left': `${ rect.left - canvas.lines[ grid.left - 1 ] }px`,
		'--canvas-free-top': `${ rect.top - canvas.rows[ ( grid.top - 1 ) / 2 ].start }px`,
	};
}

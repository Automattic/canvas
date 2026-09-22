export function imagePosition( value ) {
	return Object.fromEntries(
		[ 'x', 'y' ].map( ( axis ) => [
			axis,
			Number.isFinite( value?.[ axis ] )
				? Math.max( 0, Math.min( 1, value[ axis ] ) )
				: 0.5,
		] )
	);
}

export function coverImage( width, height, naturalWidth, naturalHeight ) {
	if (
		! [ width, height, naturalWidth, naturalHeight ].every(
			( value ) => Number.isFinite( value ) && value > 0
		)
	) {
		return null;
	}
	const scale = Math.max( width / naturalWidth, height / naturalHeight );
	return {
		width: naturalWidth * scale,
		height: naturalHeight * scale,
		overflowX: Math.max( 0, naturalWidth * scale - width ),
		overflowY: Math.max( 0, naturalHeight * scale - height ),
	};
}

// Move the pixels with the pointer, projecting screen movement into the image's
// local axes. An axis with no overflow keeps its saved responsive preference.
export function moveImagePosition(
	start,
	cover,
	dx,
	dy,
	rotation = 0,
	scale = 1
) {
	const point = imagePosition( start );
	const angle = ( rotation * Math.PI ) / 180;
	const x = ( dx * Math.cos( angle ) + dy * Math.sin( angle ) ) / scale;
	const y = ( -dx * Math.sin( angle ) + dy * Math.cos( angle ) ) / scale;
	return imagePosition( {
		x: cover.overflowX > 0.01 ? point.x - x / cover.overflowX : point.x,
		y: cover.overflowY > 0.01 ? point.y - y / cover.overflowY : point.y,
	} );
}

export function imageWasReplaced( previous, updates ) {
	if ( 'id' in updates && updates.id !== previous.id ) {
		return true;
	}
	return (
		! previous.id &&
		! updates.id &&
		'url' in updates &&
		updates.url !== previous.url &&
		( ! ( 'sizeSlug' in updates ) ||
			updates.sizeSlug === previous.sizeSlug )
	);
}

// CSS scales all corner radii together when adjacent radii overlap. Keeping
// that rule here makes the faded preview's cutout match native rounded images.
export function roundedImagePath( width, height, corners ) {
	const radii = corners.map( ( value ) => {
		const parts = String( value || '0' ).split( /\s+/ );
		const length = ( part, side ) =>
			Math.max(
				0,
				( parseFloat( part ) || 0 ) *
					( part.endsWith( '%' ) ? side / 100 : 1 )
			);
		return [
			length( parts[ 0 ], width ),
			length( parts[ 1 ] || parts[ 0 ], height ),
		];
	} );
	const [ tl, tr, br, bl ] = radii;
	const factor = Math.min(
		1,
		width / ( tl[ 0 ] + tr[ 0 ] ),
		width / ( bl[ 0 ] + br[ 0 ] ),
		height / ( tl[ 1 ] + bl[ 1 ] ),
		height / ( tr[ 1 ] + br[ 1 ] )
	);
	radii.forEach( ( pair ) => {
		pair[ 0 ] *= factor;
		pair[ 1 ] *= factor;
	} );
	const arc = ( r, x, y ) =>
		r[ 0 ] && r[ 1 ]
			? `A${ r[ 0 ] } ${ r[ 1 ] } 0 0 1 ${ x } ${ y }`
			: `L${ x } ${ y }`;
	return `M${ tl[ 0 ] } 0 H${ width - tr[ 0 ] } ${ arc( tr, width, tr[ 1 ] ) } V${ height - br[ 1 ] } ${ arc( br, width - br[ 0 ], height ) } H${ bl[ 0 ] } ${ arc( bl, 0, height - bl[ 1 ] ) } V${ tl[ 1 ] } ${ arc( tl, tl[ 0 ], 0 ) } Z`;
}

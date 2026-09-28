export function rotatedBounds( rect, degrees = 0 ) {
	const angle = ( degrees * Math.PI ) / 180;
	const width =
		Math.abs( rect.width * Math.cos( angle ) ) +
		Math.abs( rect.height * Math.sin( angle ) );
	const height =
		Math.abs( rect.width * Math.sin( angle ) ) +
		Math.abs( rect.height * Math.cos( angle ) );
	return {
		left: rect.left + ( rect.width - width ) / 2,
		top: rect.top + ( rect.height - height ) / 2,
		width,
		height,
	};
}
export function enclosingRect( rects, inset = {} ) {
	if ( ! rects.length ) {
		return { left: 0, top: 0, width: 48, height: 48 };
	}
	const left =
		Math.min( ...rects.map( ( r ) => r.left ) ) - ( inset.left || 0 );
	const top = Math.min( ...rects.map( ( r ) => r.top ) ) - ( inset.top || 0 );
	return {
		left,
		top,
		width:
			Math.max( ...rects.map( ( r ) => r.left + r.width ) ) +
			( inset.right || 0 ) -
			left,
		height:
			Math.max( ...rects.map( ( r ) => r.top + r.height ) ) +
			( inset.bottom || 0 ) -
			top,
	};
}

export function selectionBounds( placements ) {
	return enclosingRect(
		placements.map( ( { _rect: rect, rotation } ) =>
			rotatedBounds( rect, rotation )
		)
	);
}

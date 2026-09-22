// Keep saved angles small, finite, and consistent across the +/-180 boundary.
export function normalizeRotation( value ) {
	const angle = Number( value );
	return Number.isFinite( angle )
		? ( ( ( Math.round( angle ) % 360 ) + 540 ) % 360 ) - 180
		: 0;
}

export function rotationAtPointer(
	start,
	origin,
	current,
	center,
	snap = false
) {
	if ( Math.hypot( current.x - center.x, current.y - center.y ) < 1 ) {
		return normalizeRotation( start );
	}
	const angle = ( point ) =>
		Math.atan2( point.y - center.y, point.x - center.x );
	const degrees =
		normalizeRotation( start ) +
		( ( angle( current ) - angle( origin ) ) * 180 ) / Math.PI;
	return normalizeRotation(
		snap ? Math.round( degrees / 15 ) * 15 : degrees
	);
}

export function rotationModifier( event ) {
	const platform =
		event.target?.ownerDocument?.defaultView?.navigator?.platform || '';
	return /Mac|iPhone|iPad/.test( platform ) ? event.metaKey : event.ctrlKey;
}

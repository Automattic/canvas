export const SCREEN_HEIGHTS = { small: 33, medium: 66, large: 100 };

export function fillScreenRowHeight( height, count, gap, padding, minimum ) {
	return Math.max(
		minimum,
		( height - padding.top - padding.bottom - gap * ( count - 1 ) ) / count
	);
}

export function fillScreenSize( attributes ) {
	if ( ! attributes.fillScreen ) {
		return undefined;
	}
	return Object.hasOwn( SCREEN_HEIGHTS, attributes.fillScreenHeight )
		? attributes.fillScreenHeight
		: 'large';
}

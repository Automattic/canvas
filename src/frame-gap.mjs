// Gap consumes space inside an assigned area. The area's grid coordinates and
// section extent stay unchanged; horizontal boundaries retain their alignment.
export function insetFrame( placement, spacing = {}, image = false ) {
	const rect = placement._rect;
	const source = placement._base || placement;
	const aligned = ( side ) =>
		[ 'left', 'right' ].includes( side ) &&
		typeof source.anchors?.[ side ] === 'string';
	const fixedX = aligned( 'left' ) && aligned( 'right' );
	let width = fixedX
		? rect.width
		: Math.max( 1, rect.width - ( spacing.x || 0 ) );
	let height = Math.max( 1, rect.height - ( spacing.y || 0 ) );
	if ( image && ! fixedX ) {
		const scale = Math.min( width / rect.width, height / rect.height );
		width = rect.width * scale;
		height = rect.height * scale;
	}
	const offset = ( start, end ) => {
		if ( aligned( start ) ) {
			return 0;
		}
		return aligned( end ) ? 1 : 0.5;
	};
	return {
		left: rect.left + ( rect.width - width ) * offset( 'left', 'right' ),
		top: rect.top + ( rect.height - height ) / 2,
		width,
		height,
	};
}

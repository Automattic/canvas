import shapes from '../includes/image-shapes.json' with { type: 'json' };
export const IMAGE_SHAPES = shapes;
export const imageShape = ( value ) =>
	shapes.find( ( shape ) => shape.value === value )?.value || 'none';
export const imageFit = ( saved = {} ) =>
	imageShape( saved?.shape ) !== 'none' || saved?.fit !== 'contain'
		? 'cover'
		: 'contain';
export const shapePath = ( value ) =>
	shapes.find( ( shape ) => shape.value === imageShape( value ) ).path;
export const preferredShapeRatio = ( value ) => {
	const entry = shapes.find(
		( shape ) => shape.value === imageShape( value )
	);
	const proportions = entry.proportions;
	return proportions ? proportions[ 0 ] / proportions[ 1 ] : undefined;
};
export const imageShapeStretch = ( saved = {} ) =>
	imageShape( saved.shape ) !== 'none' &&
	( typeof saved.shapeStretch === 'boolean'
		? saved.shapeStretch
		: ! shapes.find(
				( shape ) => shape.value === imageShape( saved.shape )
			).lockAspectRatio );
export const lockedShapeRatio = ( value, shapeStretch ) =>
	imageShapeStretch( {
		shape: value,
		shapeStretch,
	} )
		? undefined
		: preferredShapeRatio( value );

// Shape locks take precedence without overwriting the saved manual preference.
export function imageAspectRatio( saved = {} ) {
	const ratio = lockedShapeRatio( saved?.shape, saved?.shapeStretch );
	if ( ratio ) {
		return ratio;
	}
	return imageFit( saved ) === 'cover' &&
		Number.isFinite( saved?.aspectRatio ) &&
		saved.aspectRatio > 0
		? saved.aspectRatio
		: undefined;
}

// A manual lock constrains the frame visible when this resize begins. It
// never restores a ratio captured at a different viewport or before snapping.
export function imageResizeRatio( layout, placement, temporaryLock = false ) {
	const ratio = lockedShapeRatio( layout?.shape, layout?.shapeStretch );
	if ( ratio ) {
		return ratio;
	}
	return ( layout?.aspectRatio || temporaryLock ) &&
		placement?._rect?.height > 0
		? placement._rect.width / placement._rect.height
		: undefined;
}

// One silhouette feeds the rendered image, inspector icon and crop overlay.
export function shapeMask( value, shapeStretch ) {
	const shape = imageShape( value );
	if ( shape === 'none' ) {
		return undefined;
	}
	const entry = shapes.find( ( entryValue ) => entryValue.value === shape );
	const proportions = imageShapeStretch( {
		shape,
		shapeStretch,
	} )
		? undefined
		: entry.proportions;
	const [ x, y ] = proportions || [ 1, 1 ];
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ 100 * x } ${ 100 * y }" preserveAspectRatio="${ proportions ? 'xMidYMid meet' : 'none' }"><path d="${ shapePath( shape ) }" transform="scale(${ x } ${ y })"/></svg>`;
	return `url("data:image/svg+xml,${ encodeURIComponent( svg ) }")`;
}

// Locked shapes fit inside the snapped frame; flexible shapes fill it.
// Padding keeps image cropping and the silhouette on the same viewport.
export function shapeInsets( width, height, shape, shapeStretch ) {
	const ratio = lockedShapeRatio( shape, shapeStretch );
	return ratio
		? {
				x: Math.max( 0, ( width - height * ratio ) / 2 ),
				y: Math.max( 0, ( height - width / ratio ) / 2 ),
			}
		: {
				x: 0,
				y: 0,
			};
}
export function paintImageShapes( grid, set ) {
	const items = [
		...grid.querySelectorAll( '.canvas__image[data-canvas-shape]' ),
	];
	// Old padding can become larger than the frame after it shrinks, forcing
	// the image's measured box to overflow. Measure the available frame first.
	for ( const item of items ) {
		set( item, '--canvas-shape-inset-x', '0px' );
		set( item, '--canvas-shape-inset-y', '0px' );
	}
	const insets = items.map( ( item ) => {
		const img = item.querySelector( 'img' );
		if ( ! img ) {
			return null;
		}
		const css = grid.ownerDocument.defaultView.getComputedStyle( img );
		const number = ( key ) => parseFloat( css[ key ] ) || 0;
		return shapeInsets(
			number( 'width' ) -
				number( 'borderLeftWidth' ) -
				number( 'borderRightWidth' ),
			number( 'height' ) -
				number( 'borderTopWidth' ) -
				number( 'borderBottomWidth' ),
			item.dataset.canvasShape,
			item.dataset.canvasShapeStretch === undefined
				? undefined
				: item.dataset.canvasShapeStretch === 'true'
		);
	} );
	items.forEach( ( item, index ) => {
		if ( ! insets[ index ] ) {
			return;
		}
		const { x, y } = insets[ index ];
		set( item, '--canvas-shape-inset-x', `${ x }px` );
		set( item, '--canvas-shape-inset-y', `${ y }px` );
	} );
}

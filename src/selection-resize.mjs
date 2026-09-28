import { freeFrameFromRect, resizeAspectRect } from './aspect-ratio.mjs';
import {
	mapCanvasPlacement,
	resolveCanvasBottom,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { MAX_ROWS, rowPitch } from './placement.mjs';

export function selectionBounds( placements ) {
	const rectangles = placements.map( ( { _rect: rect, rotation = 0 } ) => {
		const angle = ( rotation * Math.PI ) / 180;
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
	} );
	const left = Math.min( ...rectangles.map( ( rect ) => rect.left ) );
	const top = Math.min( ...rectangles.map( ( rect ) => rect.top ) );
	return {
		left,
		top,
		width:
			Math.max(
				...rectangles.map( ( rect ) => rect.left + rect.width )
			) - left,
		height:
			Math.max(
				...rectangles.map( ( rect ) => rect.top + rect.height )
			) - top,
	};
}

// Scale the composition uniformly, including rotated frames and their spacing.
// Individual frames stay precise so snapping cannot distort the composition.
export function resizeSelection(
	layouts,
	ids,
	mode,
	kind,
	dx,
	dy,
	{
		fromCenter = false,
		snap = false,
		screenScale = 1,
		holdBottom = true,
	} = {}
) {
	const starts = ids.map( ( id ) => layouts[ id ][ mode ] );
	const canvas = starts[ 0 ]._canvas;
	const pointer = { dx, dy };
	if ( snap ) {
		const pitch = canvas.columns[ 1 ].start - canvas.columns[ 0 ].start;
		dx = Math.round( dx / pitch ) * pitch;
		dy = Math.round( dy / rowPitch( canvas ) ) * rowPitch( canvas );
	}
	if ( ! dx && ! dy ) {
		return Object.fromEntries(
			ids.map( ( id, index ) => [ id, starts[ index ] ] )
		);
	}
	const bounds = selectionBounds( starts );
	const maximumHeight =
		canvas.padding.top + MAX_ROWS * rowPitch( canvas ) - canvas.gap;
	const resize = ( height, x = dx, y = dy ) =>
		resizeAspectRect(
			bounds,
			kind,
			x,
			y,
			bounds.width / bounds.height,
			{ width: canvas.width, height },
			0,
			fromCenter
		);
	let next = resize( maximumHeight );
	const intended = snap
		? resize( maximumHeight, pointer.dx, pointer.dy )
		: next;
	if (
		holdBottom &&
		bounds.top + bounds.height <= canvas.height + 0.01 &&
		next.top + next.height > canvas.height &&
		resolveCanvasBottom(
			intended.top + intended.height,
			canvas.height,
			screenScale
		) <= canvas.height
	) {
		// Use the raw pointer distance so cell snapping cannot bypass the buffer.
		next = resize( canvas.height );
	}
	const smallestScale = Math.min(
		1,
		Math.max(
			...starts.map(
				( { _rect: rect } ) => 24 / Math.min( rect.width, rect.height )
			)
		)
	);
	if ( next.width / bounds.width < smallestScale ) {
		const progress =
			( smallestScale - 1 ) / ( next.width / bounds.width - 1 );
		next = Object.fromEntries(
			Object.keys( bounds ).map( ( key ) => [
				key,
				bounds[ key ] + ( next[ key ] - bounds[ key ] ) * progress,
			] )
		);
	}
	const scale = next.width / bounds.width;
	return Object.fromEntries(
		ids.map( ( id, index ) => {
			const start = starts[ index ];
			const rect = start._rect;
			return [
				id,
				mapCanvasPlacement(
					{
						...savedCanvasPlacement( start ),
						// The selection transform owns all four edges. Old anchors or
						// full-height behavior must not override its scaled frame.
						anchors: {},
						fillHeight: undefined,
						free: freeFrameFromRect(
							{
								left:
									next.left +
									( rect.left - bounds.left ) * scale,
								top:
									next.top +
									( rect.top - bounds.top ) * scale,
								width: rect.width * scale,
								height: rect.height * scale,
							},
							canvas
						),
					},
					mode,
					canvas
				),
			];
		} )
	);
}

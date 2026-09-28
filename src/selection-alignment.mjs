import {
	gridAlignedPlacement,
	gridPlacement,
	centeredGridSpan,
} from './grid-placement.mjs';
import { translateGroupPlacement } from './canvas-groups.mjs';
import { centerInSection, centerSelection } from './selection-movement.mjs';
import { selectionBounds } from './selection-resize.mjs';

export function positionSelection(
	layouts,
	ids,
	mode,
	axis = 'both',
	options = {}
) {
	if ( ids.length === 1 ) {
		return centerSelection( layouts, ids, mode, axis, options );
	}
	if (
		options.cells !== false &&
		ids.every( ( id ) => ! layouts[ id ].group )
	) {
		return positionGridSelection( layouts, ids, mode, axis, options );
	}
	const frames = ids.map( ( id ) => layouts[ id ][ mode ] );
	const bounds = selectionBounds( frames );
	const composite = { ...frames[ 0 ], rotation: 0, _rect: bounds };
	const centered = centerInSection( composite, mode, axis, {
		...options,
		preserveSize: true,
	} );
	const dx = centered._rect.left - bounds.left;
	const dy = centered._rect.top - bounds.top;
	return {
		placements: Object.fromEntries(
			ids.map( ( id ) => [
				id,
				translateGroupPlacement( layouts[ id ][ mode ], mode, dx, dy ),
			] )
		),
		rows: frames[ 0 ]._canvas.coreRows,
	};
}

export function alignSelection(
	layouts,
	ids,
	mode,
	alignment,
	{ cells = true, minimums = {} } = {}
) {
	if ( cells && ids.every( ( id ) => ! layouts[ id ].group ) ) {
		return alignGridSelection( layouts, ids, mode, alignment, minimums );
	}
	const bounds = selectionBounds(
		ids.map( ( id ) => layouts[ id ][ mode ] )
	);
	return Object.fromEntries(
		ids.map( ( id ) => {
			const current = layouts[ id ][ mode ];
			const rect = selectionBounds( [ current ] );
			let dx = 0;
			let dy = 0;
			switch ( alignment ) {
				case 'left':
					dx = bounds.left - rect.left;
					break;
				case 'horizontal':
					dx =
						bounds.left +
						bounds.width / 2 -
						rect.left -
						rect.width / 2;
					break;
				case 'right':
					dx = bounds.left + bounds.width - rect.left - rect.width;
					break;
				case 'top':
					dy = bounds.top - rect.top;
					break;
				case 'vertical':
					dy =
						bounds.top +
						bounds.height / 2 -
						rect.top -
						rect.height / 2;
					break;
				case 'bottom':
					dy = bounds.top + bounds.height - rect.top - rect.height;
					break;
			}
			return [ id, translateGroupPlacement( current, mode, dx, dy ) ];
		} )
	);
}

function positionGridSelection( layouts, ids, mode, axis, options ) {
	const frames = ids.map( ( id ) =>
		gridAlignedPlacement(
			layouts[ id ][ mode ],
			mode,
			options.minimums?.[ id ]
		)
	);
	const bounds = selectionBounds(
		frames.map( ( frame ) => ( { ...frame, rotation: 0 } ) )
	);
	const composite = {
		...frames[ 0 ],
		frameRatio: undefined,
		rotation: 0,
		_rect: bounds,
		free: {},
	};
	// Center the enclosing frame first. Apply its change to the composition so
	// odd spans can become symmetric without collapsing the selected blocks.
	const result = centerSelection(
		{ selection: { [ mode ]: composite } },
		[ 'selection' ],
		mode,
		axis,
		options
	);
	const target = gridAlignedPlacement( result.placements.selection, mode );
	const next = target._rect;
	return {
		rows: result.rows,
		placements: Object.fromEntries(
			ids.map( ( id, i ) => {
				const frame = frames[ i ];
				const rect = { ...frame._rect };
				for ( const [ direction, position, size ] of [
					[ 'horizontal', 'left', 'width' ],
					[ 'vertical', 'top', 'height' ],
				] ) {
					if ( axis !== 'both' && axis !== direction ) {
						continue;
					}
					const scale = next[ size ] / bounds[ size ];
					rect[ position ] =
						next[ position ] +
						( rect[ position ] - bounds[ position ] ) * scale;
					rect[ size ] *= scale;
				}
				return [
					id,
					gridAlignedPlacement(
						{ ...frame, _canvas: target._canvas, _rect: rect },
						mode,
						options.minimums?.[ id ]
					),
				];
			} )
		),
	};
}

function alignGridSelection( layouts, ids, mode, alignment, minimums ) {
	const frames = ids.map( ( id ) =>
		gridAlignedPlacement( layouts[ id ][ mode ], mode, minimums[ id ] )
	);
	const horizontal = [ 'left', 'horizontal', 'right' ].includes( alignment );
	const position = horizontal ? 'column' : 'row';
	const size = horizontal ? 'columnSpan' : 'rowSpan';
	const first = Math.min(
		...frames.map( ( frame ) => frame[ position ] - 1 )
	);
	const last = Math.max(
		...frames.map( ( frame ) => frame[ position ] - 1 + frame[ size ] )
	);
	const tracks = horizontal
		? frames[ 0 ]._canvas.columns
		: frames[ 0 ]._canvas.rows;
	const center = ( tracks[ first ].start + tracks[ last - 1 ].end ) / 2;
	return Object.fromEntries(
		ids.map( ( id, i ) => {
			const frame = frames[ i ];
			let start = first;
			let end = start + frame[ size ];
			if ( [ 'right', 'bottom' ].includes( alignment ) ) {
				end = last;
				start = end - frame[ size ];
			} else if ( [ 'horizontal', 'vertical' ].includes( alignment ) ) {
				const symmetric = centeredGridSpan(
					tracks,
					center,
					frame._rect[ horizontal ? 'width' : 'height' ],
					minimums[ id ]?.[ size ] ?? 1
				);
				// The enclosing span is always a common symmetric fallback, even
				// with asymmetric, clipped padding cells.
				start = symmetric?.start ?? first;
				end = symmetric?.end ?? last;
			}
			return [
				id,
				gridPlacement(
					frame,
					mode,
					horizontal
						? { left: start, right: end }
						: { top: start, bottom: end },
					minimums[ id ]
				),
			];
		} )
	);
}

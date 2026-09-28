import { minimumSpans } from './placement.mjs';
import { gridAlignedPlacement, gridPlacement } from './grid-placement.mjs';
import {
	exactPlacement,
	isCanvasGroup,
	translateGroupPlacement,
} from './canvas-groups.mjs';
import { savedCanvasPlacement } from './canvas-geometry.mjs';

export function distributeHorizontally( blocks, layouts, mode ) {
	return distributeSpacing( blocks, layouts, mode, 'horizontal' );
}

export function distributeVertically( blocks, layouts, mode ) {
	return distributeSpacing( blocks, layouts, mode, 'vertical' );
}

function distributeSpacing( blocks, layouts, mode, axis ) {
	const horizontal = axis === 'horizontal';
	const position = horizontal ? 'left' : 'top';
	const size = horizontal ? 'width' : 'height';
	if (
		blocks.length < 2 ||
		blocks.some(
			( block ) =>
				isCanvasGroup( block ) ||
				! layouts[ block.clientId ]?.[ mode ]?._rect
		)
	) {
		return null;
	}
	const ordered = [ ...blocks ].sort(
		( a, b ) =>
			layouts[ a.clientId ][ mode ]._rect[ position ] -
			layouts[ b.clientId ][ mode ]._rect[ position ]
	);
	const frames = ordered.map(
		( block ) => layouts[ block.clientId ][ mode ]
	);
	const start = frames[ 0 ]._rect[ position ];
	const end = Math.max(
		...frames.map( ( { _rect: rect } ) => rect[ position ] + rect[ size ] )
	);
	const totalSize = frames.reduce(
		( sum, frame ) => sum + frame._rect[ size ],
		0
	);
	const available = end - start;
	// Distribution changes spacing only, even when exact gaps fall between
	// cells. Negative gaps retain overlap instead of shrinking authored frames.
	const gap = ( available - totalSize ) / ( frames.length - 1 );
	const updates = {};
	let cursor = start;
	for ( const [ index, block ] of ordered.entries() ) {
		const current = frames[ index ];
		// Deeply nested frames may not admit equal gaps in their current order.
		if (
			index < frames.length - 1 &&
			current._rect[ size ] + gap < -0.0001
		) {
			return null;
		}
		const delta = cursor - current._rect[ position ];
		updates[ block.clientId ] =
			Math.abs( delta ) < 0.0001
				? current
				: translateGroupPlacement(
						current,
						mode,
						horizontal ? delta : 0,
						horizontal ? 0 : delta
					);
		cursor += current._rect[ size ] + gap;
	}
	return updates;
}

export function equalizeWidths( blocks, layouts, mode, { cells = true } = {} ) {
	if (
		blocks.length < 2 ||
		blocks.some(
			( block ) =>
				isCanvasGroup( block ) ||
				! layouts[ block.clientId ]?.[ mode ]?._rect
		)
	) {
		return null;
	}
	const ordered = [ ...blocks ].sort(
		( a, b ) =>
			layouts[ a.clientId ][ mode ]._rect.left -
			layouts[ b.clientId ][ mode ]._rect.left
	);
	const tracks =
		layouts[ ordered[ 0 ].clientId ][ mode ]._canvas.contentColumns;
	const span = Math.floor( tracks.length / ordered.length );
	if (
		ordered.some(
			( block ) => span < minimumSpans( block.name ).columnSpan
		)
	) {
		return null;
	}
	const inset = Math.floor( ( tracks.length - span * ordered.length ) / 2 );
	return Object.fromEntries(
		ordered.map( ( block, index ) => {
			const minimum = minimumSpans( block.name );
			const current = layouts[ block.clientId ][ mode ];
			if ( cells ) {
				const snapped = gridAlignedPlacement( current, mode, minimum );
				const left =
					current._canvas.columnOffset + inset + index * span;
				return [
					block.clientId,
					gridPlacement(
						snapped,
						mode,
						{ left, right: left + span },
						minimum
					),
				];
			}
			const gap = current._canvas.columnGap ?? current._canvas.gap;
			const width =
				( tracks.at( -1 ).end -
					tracks[ 0 ].start -
					gap * ( ordered.length - 1 ) ) /
				ordered.length;
			const rect = {
				...current._rect,
				left: tracks[ 0 ].start + index * ( width + gap ),
				width,
			};
			return [
				block.clientId,
				exactPlacement( rect, mode, current._canvas, {
					...savedCanvasPlacement( current ),
					anchors: {},
					...( current.frameRatio
						? { frameRatio: width / rect.height }
						: {} ),
				} ),
			];
		} )
	);
}

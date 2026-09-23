import { MAX_ROWS } from './placement.mjs';
import { freeFrameFromRect } from './aspect-ratio.mjs';
import { savedCanvasPlacement } from './canvas-geometry.mjs';

export function automaticCanvasRows( occupied, minimum = 1 ) {
	return Math.min( MAX_ROWS, Math.max( minimum, occupied ) );
}

// Readability is the only automatic exception to proportional placement. Keep
// the authored frame unless native text needs more room; preserve intentional
// overlaps and move only content that a newly grown frame would cover.
// Automatic placements may widen and grow. Explicit placements marked
// `explicitReadable` keep their authored column, width, and top, and only grow
// downward when their content no longer fits (for example, at a narrower
// width within the same viewport).
const adjustable = ( item ) => item.automatic || item.explicitReadable;

export function readablePlacements(
	items,
	mode,
	geometry,
	placements,
	measure
) {
	const start = geometry.contentColumns[ 0 ].start;
	const end = geometry.contentColumns.at( -1 ).end;
	const overlaps = ( a, b ) =>
		a.left < b.left + b.width - 0.01 &&
		a.left + a.width > b.left + 0.01 &&
		a.top < b.top + b.height - 0.01 &&
		a.top + a.height > b.top + 0.01;
	const boxes = items
		.map( ( item, index ) => {
			const original = placements[ index ]._rect;
			const rect = { ...original };
			// Fitted text derives its size from the authored frame, so an explicit
			// frame is never grown for it.
			const readable =
				adjustable( item ) &&
				item.kind !== 'image' &&
				! item.areaFit &&
				! ( item.explicitReadable && item.widthFit );
			if ( readable && item.automatic ) {
				rect.width = Math.max(
					rect.width,
					Math.min( end - start, item.minWidth )
				);
				const centered =
					Math.abs( item.sourceLeft + item.sourceRight - 1 ) < 0.001;
				const right = item.sourceRight >= 1;
				if ( rect.width > original.width ) {
					rect.left = Math.max(
						start,
						Math.min(
							end - rect.width,
							original.left -
								( rect.width - original.width ) *
									( centered ? 0.5 : Number( right ) )
						)
					);
				}
			}
			if ( readable ) {
				rect.height = Math.max(
					original.height,
					measure( item, rect.width )
				);
			}
			return { item, index, original, rect };
		} )
		.sort(
			( a, b ) =>
				a.original.top - b.original.top ||
				a.original.left - b.original.left ||
				a.index - b.index
		);
	for ( let i = 0; i < boxes.length; i++ ) {
		const box = boxes[ i ];
		if ( ! adjustable( box.item ) ) {
			continue;
		}
		for ( let pass = 0; pass < boxes.length; pass++ ) {
			let moved = false;
			for ( let j = 0; j < boxes.length; j++ ) {
				const other = boxes[ j ];
				if (
					i === j ||
					( j > i && adjustable( other.item ) ) ||
					overlaps( box.original, other.original ) ||
					! overlaps( box.rect, other.rect )
				) {
					continue;
				}
				box.rect.top =
					other.rect.top +
					other.rect.height +
					Math.max(
						geometry.gap,
						box.original.top -
							other.original.top -
							other.original.height
					);
				moved = true;
			}
			if ( ! moved ) {
				break;
			}
		}
	}
	return Object.fromEntries(
		boxes
			.filter(
				( { item, original, rect } ) =>
					adjustable( item ) &&
					Object.keys( rect ).some(
						( key ) =>
							Math.abs( rect[ key ] - original[ key ] ) > 0.01
					)
			)
			.map( ( { index, rect } ) => [
				index,
				{
					...savedCanvasPlacement( placements[ index ] ),
					free: {
						...freeFrameFromRect( rect, geometry ),
					},
				},
			] )
	);
}

import { ATTRIBUTE, COLUMNS, rowPitch } from './placement.mjs';
import { isCanvasGroup, layoutLeaves, paintLayers } from './canvas-groups.mjs';
import { compactCanvasBlock } from './serialization.mjs';

// Preserve automatic breakpoint layout and paint order independently of DOM order.
export function arrangeBlocks( blocks, layouts, mode ) {
	const leaves = layoutLeaves( blocks ).map( ( block ) => block.clientId );
	const ranks = Object.fromEntries(
		Object.keys( COLUMNS ).map( ( viewport ) => [
			viewport,
			paintLayers( blocks, layouts, viewport ),
		] )
	);
	let changed = false;
	const visit = ( siblings ) => {
		const ordered = [ ...siblings ].sort( ( a, b ) => {
			const first = layouts[ a.clientId ][ mode ]._rect;
			const second = layouts[ b.clientId ][ mode ]._rect;
			return first.top - second.top || first.left - second.left;
		} );
		// A heading may sit slightly below the content it introduces. Promote it
		// within the same column and one grid row, without crossing other headings
		// or unrelated content. Keep this separate from the spatial comparator.
		for ( let index = 1; index < ordered.length; index++ ) {
			const heading = ordered[ index ];
			if ( heading.name !== 'core/heading' ) {
				continue;
			}
			const placement = layouts[ heading.clientId ][ mode ];
			const rect = placement._rect;
			const proximity = rowPitch( placement._canvas );
			let destination = index;
			while ( destination > 0 ) {
				const previous = ordered[ destination - 1 ];
				const preceding = layouts[ previous.clientId ][ mode ]._rect;
				if (
					previous.name === 'core/heading' ||
					isCanvasGroup( previous ) ||
					rect.top - preceding.top > proximity ||
					preceding.left + preceding.width <= rect.left ||
					rect.left + rect.width <= preceding.left
				) {
					break;
				}
				destination--;
			}
			if ( destination !== index ) {
				ordered.splice( index, 1 );
				ordered.splice( destination, 0, heading );
			}
		}
		changed ||= ordered.some(
			( block, index ) => block !== siblings[ index ]
		);
		return ordered.map( ( block ) => ( {
			...block,
			attributes: {
				...block.attributes,
				[ ATTRIBUTE ]: {
					...block.attributes[ ATTRIBUTE ],
					...( isCanvasGroup( block )
						? {}
						: { order: leaves.indexOf( block.clientId ) } ),
					layers: Object.fromEntries(
						Object.keys( COLUMNS ).map( ( viewport ) => [
							viewport,
							ranks[ viewport ][ block.clientId ],
						] )
					),
				},
			},
			innerBlocks: isCanvasGroup( block )
				? visit( block.innerBlocks )
				: block.innerBlocks,
		} ) );
	};
	const result = visit( blocks );
	return changed ? result.map( compactCanvasBlock ) : blocks;
}

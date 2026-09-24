import { minimumSpans } from './placement.mjs';
import { exactPlacement, isCanvasGroup } from './canvas-groups.mjs';
import { savedCanvasPlacement } from './canvas-geometry.mjs';

export function distributeHorizontally( blocks, layouts, mode ) {
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
	const updates = {};
	for ( const [ index, block ] of ordered.entries() ) {
		const start = Math.round( ( index * tracks.length ) / ordered.length );
		const end = Math.round(
			( ( index + 1 ) * tracks.length ) / ordered.length
		);
		if ( end - start < minimumSpans( block.name ).columnSpan ) {
			return null;
		}
		const current = layouts[ block.clientId ][ mode ];
		const rect = {
			...current._rect,
			left: tracks[ start ].start,
			width: tracks[ end - 1 ].end - tracks[ start ].start,
		};
		updates[ block.clientId ] = exactPlacement(
			rect,
			mode,
			current._canvas,
			{
				...savedCanvasPlacement( current ),
				...( current.frameRatio
					? { frameRatio: rect.width / rect.height }
					: {} ),
			}
		);
	}
	return updates;
}

import { BLOCK_NAME } from './placement.mjs';
import { isCanvasGroup } from './canvas-groups.mjs';

// Nested Canvas editors own their capture-phase events independently.
export const ownsCanvasTarget = ( canvas, target ) =>
	target.closest?.( '.wp-block-tabor-canvas' ) === canvas;

// Native content descendants are not movable frames; Canvas groups are.
export function ownsCanvasBlock( store, canvasId, blockId ) {
	const parents = store.getBlockParents( blockId );
	const nearest = parents
		.filter( ( id ) => store.getBlockName( id ) === BLOCK_NAME )
		.at( -1 );
	return (
		nearest === canvasId &&
		parents
			.slice( parents.indexOf( nearest ) + 1 )
			.every( ( id ) => isCanvasGroup( store.getBlock( id ) ) )
	);
}

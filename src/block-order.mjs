import { ATTRIBUTE } from './placement.mjs';
import { canvasBlocks, layoutLeaves } from './canvas-groups.mjs';

export function reorderBlocks( siblings, ids, direction ) {
	if (
		! direction ||
		! ids.length ||
		ids.some(
			( id ) => ! siblings.some( ( block ) => block.clientId === id )
		)
	) {
		return siblings;
	}
	const selected = siblings.filter( ( block ) =>
		ids.includes( block.clientId )
	);
	const remaining = siblings.filter(
		( block ) => ! ids.includes( block.clientId )
	);
	const ordered =
		direction > 0
			? [ ...remaining, ...selected ]
			: [ ...selected, ...remaining ];
	return ordered.every( ( block, index ) => block === siblings[ index ] )
		? siblings
		: ordered;
}

// A native reorder changes painting and reading order, never automatic placement.
// Only capture the old layout order when an existing tree is reordered; loading,
// inserting, deleting and explicit layout-order edits need no initialization.
export function preserveReorderedLayout( previous, current ) {
	const before = canvasBlocks( previous );
	const after = canvasBlocks( current );
	if (
		before.length !== after.length ||
		before.every(
			( block, index ) => block.clientId === after[ index ].clientId
		) ||
		before.some(
			( block ) =>
				! after.some( ( next ) => next.clientId === block.clientId )
		)
	) {
		return {};
	}
	const leaves = layoutLeaves( previous );
	if (
		leaves.every( ( block ) =>
			Number.isFinite( block.attributes[ ATTRIBUTE ]?.order )
		)
	) {
		return {};
	}
	const currentBlocks = new Map(
		after.map( ( block ) => [ block.clientId, block ] )
	);
	return Object.fromEntries(
		leaves.map( ( block, index ) => [
			block.clientId,
			{
				[ ATTRIBUTE ]: {
					...currentBlocks.get( block.clientId ).attributes[
						ATTRIBUTE
					],
					order: index,
				},
			},
		] )
	);
}

import { ALLOWED_BLOCKS } from './placement.mjs';
import { isContainer } from './grouping.mjs';

// Use the same permissions for the hover preview and the committed drop.
export function canDropBlocks( payload, clientId, store ) {
	if (
		! payload?.blocks.length ||
		store.getBlockEditingMode( clientId ) === 'disabled'
	) {
		return false;
	}
	const { blocks, move } = payload;
	if (
		blocks.some(
			( block ) =>
				! ALLOWED_BLOCKS.includes( block.name ) &&
				! (
					move &&
					isContainer( block ) &&
					store.getBlockRootClientId( block.clientId ) === clientId
				)
		)
	) {
		return false;
	}
	if ( ! move ) {
		return blocks.every( ( block ) =>
			store.canInsertBlockType( block.name, clientId )
		);
	}
	const ids = blocks.map( ( block ) => block.clientId );
	if (
		ids.includes( clientId ) ||
		store
			.getBlockParents( clientId )
			.some( ( id ) => ids.includes( id ) ) ||
		! store.canMoveBlocks( ids )
	) {
		return false;
	}
	const incoming = ids.filter(
		( id ) => store.getBlockRootClientId( id ) !== clientId
	);
	// Core also checks removal permissions when moving between parents. Without
	// this check, Core can reject the move after Canvas has accepted the drop,
	// leaving placement attributes on a block still outside the canvas.
	return (
		! incoming.length ||
		( store.canRemoveBlocks( incoming ) &&
			store.canInsertBlocks( incoming, clientId ) )
	);
}

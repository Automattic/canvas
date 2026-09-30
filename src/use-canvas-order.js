import { useLayoutEffect } from '@wordpress/element';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { preserveReorderedLayout } from './block-order.mjs';

export function useCanvasOrder( clientId, registry ) {
	useLayoutEffect( () => {
		const store = registry.select( blockEditorStore );
		let previous = store.getBlocks( clientId );
		return registry.subscribe( () => {
			const current = store.getBlocks( clientId );
			if ( current === previous ) {
				return;
			}
			const updates = preserveReorderedLayout( previous, current );
			previous = current;
			const ids = Object.keys( updates );
			if ( ids.length ) {
				const actions = registry.dispatch( blockEditorStore );
				// Fold placement-order metadata into the native reorder's undo step.
				actions.__unstableMarkNextChangeAsNotPersistent();
				actions.updateBlockAttributes( ids, updates, true );
			}
		}, blockEditorStore );
	}, [ clientId, registry ] );
}

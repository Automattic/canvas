import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { MenuItem } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	canvasBlocks,
	isCanvasGroup,
	resolveCanvasLayouts,
} from './canvas-groups.mjs';
import { Menu } from './core-menu';
import { arrangeBlocks } from './arrange-blocks.mjs';

export function ArrangeBlocksMenu( {
	clientId,
	registry,
	gridRef,
	mode,
	onClose,
	contextMenu = false,
} ) {
	const enabled = useSelect( () => {
		const store = registry.select( blockEditorStore );
		const blocks = store.getBlocks( clientId );
		const all = canvasBlocks( blocks );
		return (
			all.length > 1 &&
			[
				clientId,
				...all
					.filter( isCanvasGroup )
					.map( ( block ) => block.clientId ),
			].every(
				( id ) =>
					! store.getTemplateLock( id ) &&
					store.getBlockEditingMode( id ) === 'default'
			) &&
			all.every(
				( block ) =>
					! block.attributes.lock?.move &&
					store.getBlockEditingMode( block.clientId ) === 'default'
			) &&
			store.canMoveBlocks( all.map( ( block ) => block.clientId ) )
		);
	}, [ clientId, registry ] );
	const Item = contextMenu ? Menu.Item : MenuItem;
	const label = __( 'Arrange blocks', 'canvas' );
	return (
		<Item
			disabled={ ! enabled }
			onClick={ () => {
				const blocks = registry
					.select( blockEditorStore )
					.getBlocks( clientId );
				const layouts = resolveCanvasLayouts(
					blocks,
					gridRef.current?.canvasGeometry || {}
				);
				if (
					! enabled ||
					canvasBlocks( blocks ).some(
						( block ) =>
							! layouts[ block.clientId ]?.[ mode ]?._rect
					)
				) {
					return;
				}
				const arranged = arrangeBlocks( blocks, layouts, mode );
				if ( arranged !== blocks ) {
					registry
						.dispatch( blockEditorStore )
						.replaceInnerBlocks( clientId, arranged, false );
				}
				onClose();
			} }
		>
			{ contextMenu ? <Menu.ItemLabel>{ label }</Menu.ItemLabel> : label }
		</Item>
	);
}

import { compactCanvasBlock } from './serialization.mjs';
import { useLayoutEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { addFilter, removeFilter } from '@wordpress/hooks';
import { __, _x, sprintf } from '@wordpress/i18n';
import { ALLOWED_BLOCKS, ATTRIBUTE, minimumSpans } from './placement.mjs';
import {
	canContain,
	isContainer,
	rectanglePlacement,
	releasedLayout,
	replaceSelection,
	withoutGrid,
} from './grouping.mjs';
import {
	isCanvasGroup,
	layoutLeaves,
	resolveCanvasLayouts,
	releaseGroupSiblings,
	groupingConflict,
	groupingLayers,
} from './canvas-groups.mjs';
import { Menu } from './core-menu';
export function useContainerSettings( clientId, registry ) {
	const containerSelected = useSelect( () => {
		const store = registry.select( blockEditorStore );
		const id = store.getSelectedBlockClientId();
		if ( ! store.getBlockParents( id ).includes( clientId ) ) {
			return false;
		}
		if ( store.getBlockName( id ) === 'core/group' ) {
			if ( isCanvasGroup( store.getBlock( id ) ) ) {
				return 'canvas';
			}
			return 'native';
		}
		return 'item';
	}, [ clientId, registry ] );
	useLayoutEffect( () => {
		if ( ! containerSelected ) {
			return;
		}
		// Core portals these controls outside the canvas. Keep this temporary and
		// local to selection, just like the existing grid toolbar curation.
		document.body.dataset.canvasContainerSelection = containerSelected;
		const names =
			containerSelected === 'canvas'
				? [ __( 'Group' ), __( 'Grid' ), __( 'Stack' ), __( 'Row' ) ]
				: [ __( 'Group' ), __( 'Grid' ) ];
		const labels = names.map( ( name ) =>
			// translators: %s: Core block variation name.
			sprintf( __( 'Transform to %s' ), name )
		);
		const hidden = new Set();
		const hideUngroup = () => {
			for ( const node of hidden ) {
				node.removeAttribute( 'data-canvas-native-ungroup' );
			}
			hidden.clear();
			for ( const node of document.querySelectorAll(
				'.block-editor-block-inspector button[aria-label]'
			) ) {
				if ( labels.includes( node.getAttribute( 'aria-label' ) ) ) {
					node.setAttribute( 'data-canvas-native-ungroup', '' );
					hidden.add( node );
				}
			}
			document
				.querySelectorAll(
					'.block-editor-block-settings-menu__popover [role="menuitem"]'
				)
				.forEach( ( node ) => {
					if (
						! [
							__( 'Group' ),
							__( 'Ungroup' ),
							_x(
								'Ungroup',
								'Ungrouping blocks from within a grouping block back into individual blocks within the Editor'
							),
						].includes( node.textContent.trim() )
					) {
						return;
					}
					node.setAttribute( 'data-canvas-native-ungroup', '' );
					hidden.add( node );
				} );
		};
		const observer = new window.MutationObserver( hideUngroup );
		observer.observe( document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [ 'aria-label' ],
		} );
		hideUngroup();
		return () => {
			observer.disconnect();
			delete document.body.dataset.canvasContainerSelection;
			hidden.forEach( ( node ) =>
				node.removeAttribute( 'data-canvas-native-ungroup' )
			);
		};
	}, [ containerSelected ] );
	useLayoutEffect( () => {
		const namespace = `tabor/canvas-container-${ clientId }`;
		const filter = ( value, path, id ) => {
			const store = registry.select( blockEditorStore );
			if (
				! store.getBlockParents( id ).includes( clientId ) ||
				store.getBlockName( id ) !== 'core/group'
			) {
				return value;
			}
			if (
				[
					'dimensions.minHeight',
					'dimensions.minWidth',
					'position.sticky',
				].includes( path )
			) {
				return false;
			}
			if (
				isCanvasGroup( store.getBlock( id ) ) &&
				[ 'spacing.margin', 'spacing.blockGap' ].includes( path )
			) {
				return false;
			}
			return value;
		};
		addFilter( 'blockEditor.useSetting.before', namespace, filter );
		return () => removeFilter( 'blockEditor.useSetting.before', namespace );
	}, [ clientId, registry ] );
}
export function ContainerActions( {
	menu,
	canvasId,
	registry,
	gridRef,
	mode,
	onClose,
	onComplete,
} ) {
	const status = useSelect( () => {
		const store = registry.select( blockEditorStore );
		const ids = menu.ids || [ menu.id ];
		const parent = store.getBlockRootClientId( ids[ 0 ] );
		const siblings = store.getBlocks( parent );
		const selected = siblings.filter( ( block ) =>
			ids.includes( block.clientId )
		);
		const inCanvas =
			parent === canvasId ||
			store.getBlockParents( parent ).includes( canvasId );
		const canvasParent =
			parent === canvasId || isCanvasGroup( store.getBlock( parent ) );
		const editable =
			inCanvas &&
			selected.length === ids.length &&
			! store.getTemplateLock( parent ) &&
			store.getBlockEditingMode( parent ) === 'default' &&
			selected.every(
				( block ) =>
					canContain( block ) &&
					store.getBlockEditingMode( block.clientId ) === 'default' &&
					! block.attributes.lock?.move &&
					! block.attributes.lock?.remove
			) &&
			store.canRemoveBlocks( ids ) &&
			store.canMoveBlocks( ids );
		const ungroup =
			editable &&
			selected.length === 1 &&
			isContainer( selected[ 0 ] ) &&
			! selected[ 0 ].attributes.templateLock &&
			selected[ 0 ].innerBlocks.length > 0 &&
			selected[ 0 ].innerBlocks.every(
				( block ) =>
					canContain( block ) &&
					! block.attributes.lock?.move &&
					! block.attributes.lock?.remove
			) &&
			store.canRemoveBlocks(
				selected[ 0 ].innerBlocks.map( ( block ) => block.clientId )
			) &&
			store.canMoveBlocks(
				selected[ 0 ].innerBlocks.map( ( block ) => block.clientId )
			);
		const layouts = resolveCanvasLayouts(
			store.getBlocks( canvasId ),
			gridRef.current?.canvasGeometry || {}
		);
		const conflict = groupingConflict( siblings, ids, layouts );
		return {
			ids,
			parent,
			siblings,
			selected,
			editable,
			ungroup,
			eligible: canvasParent && selected.every( canContain ),
			canGroup: canvasParent && ! conflict,
			conflict,
			layouts,
			layers: groupingLayers( siblings, ids, layouts ),
		};
	}, [ menu, registry, canvasId, gridRef ] );
	const commit = ( replacement, siblings = status.siblings ) => {
		menu.skipRestoreFocus = true;
		onClose();
		registry
			.dispatch( blockEditorStore )
			.replaceInnerBlocks(
				status.parent,
				replaceSelection( siblings, status.ids, replacement ).map(
					compactCanvasBlock
				),
				false
			);
		onComplete( replacement[ 0 ]?.clientId, status.parent );
	};
	const wrap = () => {
		if (
			! status.editable ||
			! status.canGroup ||
			status.selected.length < 2
		) {
			return;
		}
		// Stable source order retains automatic layouts for noncontiguous selections.
		const roots = registry.select( blockEditorStore ).getBlocks( canvasId );
		const leaves = layoutLeaves( roots );
		const ordered = ( block ) =>
			isCanvasGroup( block )
				? {
						...block,
						innerBlocks: block.innerBlocks.map( ordered ),
					}
				: {
						...block,
						attributes: {
							...block.attributes,
							[ ATTRIBUTE ]: {
								...block.attributes[ ATTRIBUTE ],
								order: leaves.indexOf( block ),
							},
						},
					};
		const orderedRoots = roots.map( ordered );
		const find = ( blocks ) =>
			blocks.flatMap( ( block ) => [
				block,
				...( isCanvasGroup( block ) ? find( block.innerBlocks ) : [] ),
			] );
		const siblings =
			status.parent === canvasId
				? orderedRoots
				: find( orderedRoots ).find(
						( block ) => block.clientId === status.parent
					).innerBlocks;
		const children = siblings.filter( ( block ) =>
			status.ids.includes( block.clientId )
		);
		const group = createBlock(
			'core/group',
			{
				layout: {
					type: 'default',
				},
				style: {
					spacing: {
						padding: '0px',
						margin: '0px',
						blockGap: '0px',
					},
				},
				allowedBlocks: [ ...ALLOWED_BLOCKS, 'core/group' ],
				[ ATTRIBUTE ]: {
					group: 1,
					layers: status.layers,
				},
			},
			children
		);
		const replace = ( blocks ) =>
			blocks.map( ( block ) => {
				if ( block.clientId === status.parent ) {
					return {
						...block,
						innerBlocks: replaceSelection(
							block.innerBlocks,
							status.ids,
							[ group ]
						),
					};
				} else if ( isCanvasGroup( block ) ) {
					return {
						...block,
						innerBlocks: replace( block.innerBlocks ),
					};
				}
				return block;
			} );
		menu.skipRestoreFocus = true;
		onClose();
		registry
			.dispatch( blockEditorStore )
			.replaceInnerBlocks(
				canvasId,
				status.parent === canvasId
					? replaceSelection( orderedRoots, status.ids, [
							group,
						] ).map( compactCanvasBlock )
					: replace( orderedRoots ).map( compactCanvasBlock ),
				false
			);
		onComplete( group.clientId, status.parent );
	};
	const ungroup = () => {
		if ( ! status.ungroup ) {
			return;
		}
		const group = status.selected[ 0 ];
		if ( isCanvasGroup( group ) ) {
			menu.skipRestoreFocus = true;
			onClose();
			registry
				.dispatch( blockEditorStore )
				.replaceInnerBlocks(
					status.parent,
					releaseGroupSiblings(
						status.siblings,
						group.clientId,
						status.layouts
					).map( compactCanvasBlock ),
					false
				);
			onComplete( group.innerBlocks[ 0 ]?.clientId, status.parent );
			return;
		}
		let children = group.innerBlocks.map( withoutGrid );
		if ( status.parent === canvasId ) {
			const grid = gridRef.current;
			const bounds = grid.getBoundingClientRect();
			const scale = grid.offsetWidth / bounds.width;
			const geometry = grid.canvasGeometry[ mode ];
			const elements = children.map( ( child ) =>
				grid.ownerDocument.getElementById( `block-${ child.clientId }` )
			);
			if ( elements.some( ( element ) => ! element ) ) {
				return;
			}
			children = children.map( ( child, index ) => {
				const rect = elements[ index ].getBoundingClientRect();
				const placement = rectanglePlacement(
					{
						left: ( rect.left - bounds.left ) * scale,
						top: ( rect.top - bounds.top ) * scale,
						width: rect.width * scale,
						height: rect.height * scale,
					},
					mode,
					geometry,
					( group.attributes[ ATTRIBUTE ]?.layers?.[ mode ] ?? 1 ) +
						index,
					minimumSpans( child.name )
				);
				return {
					...child,
					attributes: {
						...child.attributes,
						[ ATTRIBUTE ]: releasedLayout( placement, mode ),
					},
				};
			} );
		}
		commit( children );
	};
	const showGroup =
		status.eligible &&
		status.selected.length > 1 &&
		status.selected.length === status.ids.length;
	const showUngroup =
		status.selected.length === 1 && isContainer( status.selected[ 0 ] );
	if ( ! showGroup && ! showUngroup ) {
		return null;
	}
	return (
		<>
			<Menu.Group>
				{ showGroup && (
					<Menu.Item
						disabled={ ! status.editable || ! status.canGroup }
						onClick={ wrap }
					>
						<Menu.ItemLabel>Group</Menu.ItemLabel>
						{ status.conflict && (
							<Menu.ItemHelpText>
								{ status.conflict }
							</Menu.ItemHelpText>
						) }
					</Menu.Item>
				) }
				{ showUngroup && (
					<Menu.Item
						disabled={ ! status.ungroup }
						onClick={ ungroup }
					>
						<Menu.ItemLabel>Ungroup</Menu.ItemLabel>
					</Menu.Item>
				) }
			</Menu.Group>
		</>
	);
}

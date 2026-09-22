import { isCanvasGroup } from './canvas-groups.mjs';
import { rotationModifier } from './rotation.mjs';
import { centerResizeModifier } from './resize-modifiers.mjs';
import {
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { gestureDocuments } from './gesture-pointer.mjs';
import { canRepositionImage } from './image-reposition';

// The placeholder background is a canvas surface; only its native controls
// should bypass selection and gestures (including clicks on button icons).
function isPlaceholderControl( target ) {
	const placeholder = target.closest?.(
		'.block-editor-media-placeholder, .components-placeholder'
	);
	const control = target.closest?.(
		'button, a[href], input, textarea, select, label, [role="button"], [contenteditable="true"]'
	);
	return !! placeholder && !! control && placeholder.contains( control );
}
export function useCanvasInteractions( {
	gridRef,
	clientId,
	selectedId,
	mode,
	gesture,
	registry,
	selectBlock,
	moveWithKey,
	rotateWithKey,
	announce,
	canInsert,
} ) {
	const [ editingId, setEditingId ] = useState( null );
	const [ contextMenu, setContextMenu ] = useState( null );
	const scope = useRef( clientId );
	const touchMenu = useRef( null );
	const openTouchMenu = useCallback(
		( event ) => touchMenu.current?.( event ),
		[]
	);
	const touchSurface = useRef( null );
	const handleTouchSurface = useCallback(
		( event ) => touchSurface.current?.( event ),
		[]
	);
	const closeContextMenu = useCallback( () => setContextMenu( null ), [] );
	const [ canvasSelection, setCanvasSelection ] = useState( [] );
	const selection = useRef( [] );
	const nativeSelection = useSelect( () => {
		const store = registry.select( blockEditorStore );
		return store
			.getSelectedBlockClientIds()
			.filter( ( id ) =>
				store.getBlockParents( id ).includes( clientId )
			);
	}, [ registry, clientId ] );
	const selectedIds =
		canvasSelection.length &&
		nativeSelection.length &&
		nativeSelection.every( ( id ) => canvasSelection.includes( id ) )
			? canvasSelection
			: nativeSelection;
	useLayoutEffect( () => {
		const store = registry.select( blockEditorStore );
		const parent = selectedId && store.getBlockRootClientId( selectedId );
		scope.current = isCanvasGroup( store.getBlock( parent ) )
			? parent
			: clientId;
		const groups = [
			...gridRef.current.querySelectorAll( '[data-canvas-group]' ),
		];
		const parents = selectedId ? store.getBlockParents( selectedId ) : [];
		groups.forEach( ( node ) =>
			node.toggleAttribute(
				'data-canvas-entered',
				parents.includes( node.dataset.canvasItem )
			)
		);
		return () =>
			groups.forEach( ( node ) =>
				node.removeAttribute( 'data-canvas-entered' )
			);
	}, [ selectedId, registry, clientId, gridRef ] );
	const touchMovable = useSelect( () => {
		const store = registry.select( blockEditorStore );
		return (
			!! selectedId &&
			store.canMoveBlocks( [ selectedId ] ) &&
			store.getBlockEditingMode( selectedId ) === 'default'
		);
	}, [ registry, selectedId ] );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		const item =
			selectedIds.length === 1 && ! editingId && touchMovable
				? grid.querySelector( `[data-canvas-item="${ selectedId }"]` )
				: null;
		item?.setAttribute( 'data-canvas-touch-selected', 'true' );
		return () => item?.removeAttribute( 'data-canvas-touch-selected' );
	}, [ gridRef, selectedId, selectedIds.length, editingId, touchMovable ] );
	useLayoutEffect( () => {
		const canvas = gridRef.current.closest( '[data-block]' );
		const documents = gestureDocuments( canvas.ownerDocument );
		canvas.dataset.canvasInput =
			canvas.ownerDocument.defaultView.matchMedia( '(pointer: coarse)' )
				.matches
				? 'touch'
				: 'mouse';
		const input = ( e ) => {
			// A trackpad reports mouse input, even on an iPad. Ignore compatibility
			// mouse events; only actual Pointer Events change the control treatment.
			if ( e.type === 'pointermove' && e.pointerType === 'touch' ) {
				return;
			}
			if ( e.pointerType ) {
				canvas.dataset.canvasInput = e.pointerType;
			}
		};
		for ( const doc of documents ) {
			doc.addEventListener( 'pointerdown', input, true );
			doc.addEventListener( 'pointermove', input, true );
		}
		return () => {
			for ( const doc of documents ) {
				doc.removeEventListener( 'pointerdown', input, true );
				doc.removeEventListener( 'pointermove', input, true );
			}
			delete canvas.dataset.canvasInput;
		};
	}, [ gridRef ] );
	useLayoutEffect( () => {
		selection.current = selectedIds;
		const doc = gridRef.current.ownerDocument;
		const nodes =
			selectedIds.length > 1
				? selectedIds
						.map( ( id ) => doc.getElementById( `block-${ id }` ) )
						.filter( Boolean )
				: [];
		nodes.forEach( ( node ) =>
			node.setAttribute( 'data-canvas-multi-selected', 'true' )
		);
		if ( nodes.length > 1 ) {
			// Hide the bordered wrapper too; an empty toolbar leaves a 2px dot.
			document.body.classList.add( 'has-canvas-multi-selection' );
		}
		return () => {
			document.body.classList.remove( 'has-canvas-multi-selection' );
			nodes.forEach( ( node ) =>
				node.removeAttribute( 'data-canvas-multi-selected' )
			);
		};
	}, [ selectedIds, gridRef ] );
	const setSelection = ( ids ) => {
		selection.current = ids;
		setCanvasSelection( ids );
	};
	const editing = useRef( null );
	const insertionFocus = useRef( null );
	const exitEditing = useCallback( () => {
		editing.current = null;
		setEditingId( null );
	}, [] );
	const editInsertedBlock = useCallback(
		( block ) => {
			if ( ! block?.clientId ) {
				return;
			}
			const view = gridRef.current.ownerDocument.defaultView;
			view.cancelAnimationFrame( insertionFocus.current );
			// Core's picker/menu first restores focus to its disclosure. Hand focus to
			// the new block after that cleanup so writing flow cannot reselect Canvas.
			insertionFocus.current = view.requestAnimationFrame( () => {
				const store = registry.select( blockEditorStore );
				if (
					store.getBlockRootClientId( block.clientId ) !== clientId
				) {
					return;
				}
				const id = [
					'core/heading',
					'core/paragraph',
					'core/buttons',
				].includes( block.name )
					? block.clientId
					: null;
				editing.current = id;
				setEditingId( id );
				const selected =
					block.name === 'core/buttons'
						? store.getBlockOrder( block.clientId )[ 0 ] ||
							block.clientId
						: block.clientId;
				selectBlock( selected, 0 );
				const item = gridRef.current.querySelector(
					`[data-canvas-item="${ block.clientId }"]`
				);
				const editable = item?.matches( '[contenteditable="true"]' )
					? item
					: item?.querySelector( '[contenteditable="true"]' );
				( editable || item )?.focus();
			} );
		},
		[ gridRef, registry, clientId, selectBlock ]
	);
	useLayoutEffect( () => {
		const view = gridRef.current.ownerDocument.defaultView;
		return () => view.cancelAnimationFrame( insertionFocus.current );
	}, [ gridRef ] );
	const latest = useRef( {
		gesture,
		moveWithKey,
		rotateWithKey,
		selectedId,
		mode,
		canInsert,
	} );
	useLayoutEffect( () => {
		latest.current = {
			gesture,
			moveWithKey,
			rotateWithKey,
			selectedId,
			mode,
			canInsert,
		};
	}, [ gesture, moveWithKey, rotateWithKey, selectedId, mode, canInsert ] );
	useLayoutEffect( () => {
		setContextMenu( ( menu ) =>
			menu && ( menu.mode !== mode || ( ! menu.id && ! canInsert ) )
				? null
				: menu
		);
	}, [ selectedId, mode, canInsert ] );
	useLayoutEffect( () => {
		if ( editing.current && editing.current !== selectedId ) {
			exitEditing();
		}
	}, [ selectedId, exitEditing ] );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		const doc = grid.ownerDocument;
		const store = registry.select( blockEditorStore );
		let editOnClick = null;
		let enteredOnClick = false;
		const stop = ( event ) => {
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		const itemAt = ( target ) => {
			let item = target.closest?.( '[data-canvas-item]' );
			while ( item && grid.contains( item ) ) {
				if (
					store.getBlockRootClientId( item.dataset.canvasItem ) ===
					scope.current
				) {
					return item;
				}
				item = item.parentElement.closest( '[data-canvas-item]' );
			}
			return null;
		};
		const targetId = ( item, target ) => {
			const outer = item.dataset.canvasItem;
			if (
				editing.current !== outer ||
				store.getBlockName( outer ) !== 'core/group'
			) {
				return outer;
			}
			let id = target.closest?.( '[data-block]' )?.dataset.block || outer;
			if ( store.getBlockName( id ) === 'core/button' ) {
				id = store.getBlockRootClientId( id );
			}
			return id;
		};
		const selectItem = ( item ) => {
			const id = item.dataset.canvasItem;
			exitEditing();
			setSelection( [ id ] );
			selectBlock( id, null );
			item.focus( {
				preventScroll: true,
			} );
			doc.defaultView.getSelection()?.removeAllRanges();
		};
		const openContextMenu = ( event, item, keyboard = false ) => {
			stop( event );
			editOnClick = null;
			const id = targetId( item, event.target );
			const native = store.getMultiSelectedBlockClientIds();
			const current = native.includes( id ) ? native : selection.current;
			const ids = current.includes( id ) ? current : [ id ];
			setSelection( ids );
			if ( ! current.includes( id ) ) {
				if ( id === item.dataset.canvasItem ) {
					selectItem( item );
				} else {
					selectBlock( id, null );
				}
			}
			const anchor = doc.getElementById( `block-${ id }` ) || item;
			const bounds = item.getBoundingClientRect();
			const rect = new doc.defaultView.DOMRect(
				keyboard ? bounds.left : event.clientX,
				keyboard ? bounds.bottom : event.clientY,
				0,
				0
			);
			setContextMenu( {
				id,
				ids,
				mode: latest.current.mode,
				keyboard,
				anchor: {
					ownerDocument: doc,
					contextElement: anchor,
					getBoundingClientRect: () => rect,
				},
			} );
		};
		const context = ( event ) => {
			const item = itemAt( event.target );
			if (
				item &&
				editing.current === item.dataset.canvasItem &&
				grid.closest( '[data-block]' ).dataset.canvasInput === 'touch'
			) {
				return;
			}
			if ( item ) {
				openContextMenu( event, item );
			} else if ( latest.current.canInsert ) {
				stop( event );
				editOnClick = null;
				exitEditing();
				selectBlock( clientId, null );
				const canvas = grid.closest( '[data-block]' );
				canvas.focus( {
					preventScroll: true,
				} );
				const bounds = grid.getBoundingClientRect();
				const scale = grid.offsetWidth / bounds.width || 1;
				const rect = new doc.defaultView.DOMRect(
					event.clientX,
					event.clientY,
					0,
					0
				);
				setContextMenu( {
					id: null,
					mode: latest.current.mode,
					point: {
						x: ( event.clientX - bounds.left ) * scale,
						y: ( event.clientY - bounds.top ) * scale,
					},
					anchor: {
						ownerDocument: doc,
						contextElement: canvas,
						getBoundingClientRect: () => rect,
					},
				} );
			}
		};
		touchMenu.current = ( event ) => {
			const item = grid.querySelector(
				`[data-canvas-item="${ latest.current.selectedId }"]`
			);
			if ( item ) {
				openContextMenu( event, item );
			}
		};
		const enter = ( item, target, editTarget = false ) => {
			const id = item.dataset.canvasItem;
			if ( store.getBlockEditingMode( id ) === 'disabled' ) {
				return;
			}
			if ( store.getBlockName( id ) === 'core/image' ) {
				if ( ! canRepositionImage( item, store ) ) {
					return;
				}
				editing.current = id;
				setEditingId( id );
				selectBlock( id, null );
				item.focus( {
					preventScroll: true,
				} );
				return;
			}
			if ( isCanvasGroup( store.getBlock( id ) ) ) {
				scope.current = id;
				exitEditing();
				let targetItem = target.closest?.( '[data-canvas-item]' );
				while (
					targetItem &&
					targetItem !== item &&
					store.getBlockRootClientId(
						targetItem.dataset.canvasItem
					) !== id
				) {
					targetItem =
						targetItem.parentElement.closest(
							'[data-canvas-item]'
						);
				}
				const child =
					targetItem && targetItem !== item
						? targetItem.dataset.canvasItem
						: store.getBlockOrder( id )[ 0 ];
				if ( child ) {
					const node = doc.getElementById( 'block-' + child );
					setSelection( [ child ] );
					// The Group was already selected. A pointer aimed at its text or a
					// button should start editing that content without another selection.
					// Nested Groups and keyboard entry still enter one level at a time.
					if (
						editTarget &&
						node &&
						[
							'core/heading',
							'core/paragraph',
							'core/buttons',
						].includes( store.getBlockName( child ) )
					) {
						enter( node, target );
					} else {
						selectBlock( child, null );
						node?.focus( {
							preventScroll: true,
						} );
					}
				}
				return;
			}
			editing.current = id;
			setEditingId( id );
			const editable =
				target.closest?.(
					'[contenteditable="true"], input, textarea'
				) ??
				( item.matches( '[contenteditable="true"]' )
					? item
					: item.querySelector(
							'[contenteditable="true"], input, textarea'
						) );
			const content =
				editable && item.contains( editable ) ? editable : target;
			const block = content.closest?.( '[data-block]' );
			selectBlock( block?.dataset.block || id, null );
			content.focus?.( {
				preventScroll: true,
			} );
			if ( editable?.isContentEditable ) {
				const selectionValue = doc.defaultView.getSelection();
				const rangeValue = doc.createRange();
				rangeValue.selectNodeContents( editable );
				rangeValue.collapse( false );
				selectionValue.removeAllRanges();
				selectionValue.addRange( rangeValue );
			}
		};
		const down = ( event, touchItem ) => {
			enteredOnClick = false;
			if ( event.pointerType === 'touch' ) {
				const item = touchItem || itemAt( event.target );
				if ( item && editing.current === item.dataset.canvasItem ) {
					return;
				}
				if (
					event.target.closest( 'input, textarea, select' ) ||
					isPlaceholderControl( event.target )
				) {
					return;
				}
				// Selection happens on release, so swiping an unselected block can
				// scroll. Its touch-action must already allow panning at pointerdown.
				event.stopImmediatePropagation();
				if ( ! event.isPrimary ) {
					return;
				}
				editOnClick = null;
				const id = item?.dataset.canvasItem;
				const selected =
					!! id &&
					latest.current.selectedId === id &&
					selection.current.length <= 1;
				const editable =
					id &&
					( [
						'core/heading',
						'core/paragraph',
						'core/buttons',
						'core/group',
					].includes( store.getBlockName( id ) ) ||
						canRepositionImage( item, store ) );
				let openMenu;
				if ( item ) {
					openMenu = () => openContextMenu( event, item );
				} else if ( latest.current.canInsert ) {
					openMenu = () => context( event );
				} else {
					openMenu = undefined;
				}
				latest.current.gesture( event, 'move', {
					id: id || null,
					target: item || grid,
					surface: true,
					canMove:
						selected &&
						store.canMoveBlocks( [ id ] ) &&
						store.getBlockEditingMode( id ) === 'default',
					onTap: () => {
						if ( item ) {
							if ( selected && editable ) {
								enter( item, event.target, true );
							} else {
								selectItem( item );
							}
						} else {
							exitEditing();
							setSelection( [] );
							selectBlock( clientId, null );
						}
					},
					onHold: openMenu,
				} );
				return;
			}
			// Core otherwise collapses a List View range on right pointerdown, before
			// contextmenu can read it. Our menu owns selection for this interaction.
			if ( event.button === 2 && itemAt( event.target ) ) {
				stop( event );
				return;
			}
			if ( event.button !== 0 || ! event.isPrimary ) {
				return;
			}
			editOnClick = null;
			if ( isPlaceholderControl( event.target ) ) {
				return;
			}
			const item = itemAt( event.target );
			if ( ! item ) {
				setSelection( [] );
				return;
			}
			const target = targetId( item, event.target );
			if (
				event.shiftKey &&
				! rotationModifier( event ) &&
				! event.target.closest( 'input, textarea' )
			) {
				stop( event );
				exitEditing();
				const parent = store.getBlockRootClientId( target );
				const current = selection.current.filter(
					( id ) => store.getBlockRootClientId( id ) === parent
				);
				const ids = current.includes( target )
					? current.filter( ( id ) => id !== target )
					: [ ...current, target ];
				setSelection( ids );
				selectBlock( ids.at( -1 ) || clientId, null );
				return;
			}
			if (
				editing.current === item.dataset.canvasItem &&
				selection.current.length <= 1
			) {
				setSelection( [ target ] );
				return;
			}
			if (
				selection.current.length > 1 &&
				selection.current.includes( target )
			) {
				stop( event );
				exitEditing();
				setSelection( [ ...selection.current ] );
				item.focus( {
					preventScroll: true,
				} );
				if ( ! event.altKey && ! rotationModifier( event ) ) {
					latest.current.gesture( event, 'move', {
						id: target,
						ids: [ ...selection.current ],
						target: item,
						surface: true,
					} );
				}
				return;
			}
			stop( event );
			const id = item.dataset.canvasItem;
			// Remember selection before this press so the first click only selects.
			if (
				latest.current.selectedId === id &&
				[
					'core/heading',
					'core/paragraph',
					'core/buttons',
					'core/group',
				].includes( store.getBlockName( id ) )
			) {
				editOnClick = id;
			}
			selectItem( item );
			if ( rotationModifier( event ) ) {
				editOnClick = null;
			}
			if (
				event.detail > 1 ||
				event.altKey ||
				( event.shiftKey && ! rotationModifier( event ) ) ||
				! store.canMoveBlocks( [ id ] ) ||
				store.getBlockEditingMode( id ) !== 'default'
			) {
				return;
			}
			latest.current.gesture(
				event,
				rotationModifier( event ) ? 'rotate' : 'move',
				{
					id,
					target: item,
					surface: true,
					onActivate: () => {
						editOnClick = null;
					},
				}
			);
		};
		touchSurface.current = ( event ) => {
			const item = grid.querySelector(
				`[data-canvas-item="${ latest.current.selectedId }"]`
			);
			if ( item ) {
				down( event, item );
			}
		};
		const click = ( event ) => {
			// Browsers send dblclick after the second click. Do not enter another
			// Group level again, but leave native text selection available in editing.
			if ( event.type === 'dblclick' && enteredOnClick ) {
				if ( ! editing.current ) {
					stop( event );
				}
				return;
			}
			const item = itemAt( event.target );
			const shouldEdit = item && editOnClick === item.dataset.canvasItem;
			editOnClick = null;
			if (
				! item ||
				editing.current === item.dataset.canvasItem ||
				isPlaceholderControl( event.target )
			) {
				return;
			}
			stop( event );
			if ( event.shiftKey || selection.current.length > 1 ) {
				return;
			}
			if ( event.type === 'dblclick' || shouldEdit ) {
				enteredOnClick = true;
				enter( item, event.target, true );
			}
		};
		const key = ( event ) => {
			const item = itemAt( event.target );
			if ( ! item || event.defaultPrevented ) {
				return;
			}
			if (
				event.target !== item &&
				event.target.closest(
					'button, input, textarea, select, a[href], [role=button]'
				)
			) {
				return;
			}
			if (
				event.key === 'ContextMenu' ||
				( event.shiftKey && event.key === 'F10' )
			) {
				openContextMenu( event, item, true );
				return;
			}
			if ( event.key === 'Escape' && editing.current ) {
				stop( event );
				selectItem( item );
				announce(
					'Movement mode. Arrow keys move. Tab reaches layout handles.'
				);
				return;
			}
			if ( event.key === 'Escape' && scope.current !== clientId ) {
				stop( event );
				const parent = doc.getElementById( 'block-' + scope.current );
				scope.current = store.getBlockRootClientId( scope.current );
				if ( parent ) {
					selectItem( parent );
				}
				announce( 'Group selected.' );
				return;
			}
			if (
				editing.current === item.dataset.canvasItem &&
				selection.current.length <= 1
			) {
				return;
			}
			if (
				[ 'Delete', 'Backspace' ].includes( event.key ) &&
				! event.metaKey &&
				! event.ctrlKey &&
				! event.altKey &&
				! event.isComposing
			) {
				const id = item.dataset.canvasItem;
				const ids = selection.current.includes( id )
					? selection.current
					: [ id ];
				stop( event );
				if (
					! ids.every(
						( selected ) =>
							store.canRemoveBlock( selected ) &&
							store.getBlockEditingMode( selected ) === 'default'
					)
				) {
					return;
				}
				const siblings = store.getBlockOrder( scope.current );
				const index = siblings.indexOf( id );
				const next =
					siblings
						.slice( index + 1 )
						.find( ( sibling ) => ! ids.includes( sibling ) ) ||
					siblings
						.slice( 0, index )
						.reverse()
						.find( ( sibling ) => ! ids.includes( sibling ) );
				registry
					.dispatch( blockEditorStore )
					.removeBlocks( ids, false );
				setSelection( next ? [ next ] : [] );
				selectBlock( next || scope.current, null );
				doc.getElementById( `block-${ next || scope.current }` )?.focus(
					{
						preventScroll: true,
					}
				);
				announce(
					ids.length === 1
						? 'Block deleted.'
						: `${ ids.length } blocks deleted.`
				);
				return;
			}
			if ( selection.current.length > 1 ) {
				if ( event.key === 'Escape' ) {
					stop( event );
					selectItem( item );
				} else if ( event.key.startsWith( 'Arrow' ) ) {
					latest.current.moveWithKey(
						event,
						selection.current,
						item.dataset.canvasItem
					);
				}
				return;
			}
			if (
				event.key === 'Enter' &&
				store.getBlockName( item.dataset.canvasItem ) ===
					'core/image' &&
				item.querySelector( '.block-editor-media-placeholder' )
			) {
				stop( event );
				item.querySelector(
					'.block-editor-media-placeholder button'
				)?.focus( {
					preventScroll: true,
				} );
				return;
			}
			if ( event.key === 'Enter' ) {
				stop( event );
				enter( item, item );
				announce(
					isCanvasGroup( store.getBlock( item.dataset.canvasItem ) )
						? 'Group entered. Arrow keys move the selected child. Escape selects the group.'
						: 'Editing mode. Escape returns to moving.'
				);
			} else if (
				rotationModifier( event ) &&
				( event.key.startsWith( 'Arrow' ) || event.key === 'Home' )
			) {
				latest.current.rotateWithKey( event );
			} else if ( event.key.startsWith( 'Arrow' ) ) {
				latest.current.moveWithKey( event );
			} else if (
				event.key.length === 1 &&
				! event.metaKey &&
				! event.ctrlKey &&
				! event.altKey
			) {
				stop( event );
			}
		};
		const beforeInput = ( event ) => {
			if ( isPlaceholderControl( event.target ) ) {
				return;
			}
			const item = itemAt( event.target );
			if ( item && editing.current !== item.dataset.canvasItem ) {
				stop( event );
			}
		};
		// Native block dragging never reparents content through the canvas, including
		// in edit mode. List View is outside this element and keeps core's behavior.
		const dragStart = ( event ) => {
			if ( itemAt( event.target ) ) {
				stop( event );
			}
		};
		const focus = ( event ) => {
			const item = itemAt( event.target );
			if (
				item &&
				selection.current.length > 1 &&
				selection.current.includes( item.dataset.canvasItem )
			) {
				event.stopImmediatePropagation();
				return;
			}
			if (
				item &&
				editing.current &&
				editing.current !== item.dataset.canvasItem
			) {
				selectItem( item );
			}
		};
		const documents = gestureDocuments( doc );
		const updateCursor = ( event ) => {
			grid.toggleAttribute(
				'data-canvas-rotate-modifier',
				!! rotationModifier( event )
			);
			grid.toggleAttribute(
				'data-canvas-center-resize-modifier',
				centerResizeModifier( event )
			);
		};
		const clearCursor = () => {
			grid.removeAttribute( 'data-canvas-rotate-modifier' );
			grid.removeAttribute( 'data-canvas-center-resize-modifier' );
		};
		for ( const document of documents ) {
			for ( const name of [ 'keydown', 'keyup', 'pointermove' ] ) {
				document.addEventListener( name, updateCursor, true );
			}
			document.defaultView.addEventListener( 'blur', clearCursor );
		}
		// Core's writing flow consumes native range-selection arrows above the
		// grid. Handle only Canvas movement keys before that ancestor listener.
		const multiKey = ( event ) => {
			if (
				selection.current.length <= 1 ||
				! event.key.startsWith( 'Arrow' ) ||
				event.shiftKey ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey
			) {
				return;
			}
			if ( grid.contains( event.target ) ) {
				key( event );
			} else if (
				event.target === doc.body &&
				doc.body.hasAttribute( 'data-has-multi-selection' )
			) {
				// Core focuses the iframe body, not an individual block, for a native
				// range. Only claim it when the entire range belongs to this Canvas.
				const native = store.getSelectedBlockClientIds();
				if (
					native.length > 1 &&
					native.every( ( id ) => selection.current.includes( id ) )
				) {
					latest.current.moveWithKey(
						event,
						selection.current,
						latest.current.selectedId || selection.current[ 0 ]
					);
				}
			}
			if ( event.defaultPrevented ) {
				event.stopImmediatePropagation();
			}
		};
		doc.defaultView.addEventListener( 'keydown', multiKey, true );
		const handlers = {
			pointerdown: down,
			click,
			dblclick: click,
			contextmenu: context,
			keydown: key,
			beforeinput: beforeInput,
			dragstart: dragStart,
			focusin: focus,
		};
		for ( const [ name, handler ] of Object.entries( handlers ) ) {
			grid.addEventListener( name, handler, true );
		}
		return () => {
			clearCursor();
			doc.defaultView.removeEventListener( 'keydown', multiKey, true );
			for ( const document of documents ) {
				for ( const name of [ 'keydown', 'keyup', 'pointermove' ] ) {
					document.removeEventListener( name, updateCursor, true );
				}
				document.defaultView.removeEventListener( 'blur', clearCursor );
			}
			touchMenu.current = null;
			touchSurface.current = null;
			for ( const [ name, handler ] of Object.entries( handlers ) ) {
				grid.removeEventListener( name, handler, true );
			}
		};
	}, [ gridRef, clientId, registry, selectBlock, exitEditing, announce ] );
	const afterGrouping = ( id, parent ) => {
		setSelection( id ? [ id ] : [] );
		if (
			parent === clientId ||
			isCanvasGroup(
				registry.select( blockEditorStore ).getBlock( parent )
			)
		) {
			exitEditing();
		}
		selectBlock( id || parent, null );
		const doc = gridRef.current.ownerDocument;
		let attempts = 0;
		const focus = () => {
			const node = doc.getElementById( `block-${ id }` );
			if ( ! node && attempts++ < 8 ) {
				doc.defaultView.requestAnimationFrame( focus );
				return;
			}
			if ( node ) {
				if (
					parent !== clientId &&
					! isCanvasGroup(
						registry.select( blockEditorStore ).getBlock( parent )
					)
				) {
					const store = registry.select( blockEditorStore );
					let outer = parent;
					while (
						outer &&
						store.getBlockRootClientId( outer ) !== clientId
					) {
						outer = store.getBlockRootClientId( outer );
					}
					editing.current = outer;
					setEditingId( outer );
				}
				selectBlock( id, null );
				node.focus( {
					preventScroll: true,
				} );
			}
		};
		doc.defaultView.requestAnimationFrame( () =>
			doc.defaultView.requestAnimationFrame( focus )
		);
	};
	return {
		editingId,
		exitEditing,
		editInsertedBlock,
		contextMenu,
		closeContextMenu,
		openTouchMenu,
		handleTouchSurface,
		selectedIds,
		afterGrouping,
	};
}

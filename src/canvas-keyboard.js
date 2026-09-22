import { useCallback, useLayoutEffect, useRef } from '@wordpress/element';
import { speak } from '@wordpress/a11y';

export function focusCanvasControl( node ) {
	if ( ! node?.isConnected ) {
		return;
	}
	node.focus( { preventScroll: true } );
	const rect = node.getBoundingClientRect();
	const view = node.ownerDocument.defaultView;
	if (
		rect.top < 0 ||
		rect.left < 0 ||
		rect.bottom > view.innerHeight ||
		rect.right > view.innerWidth
	) {
		node.scrollIntoView( {
			block: 'nearest',
			inline: 'nearest',
			behavior: 'instant',
		} );
	}
}

export function useLayoutAnnouncement() {
	const timer = useRef( null );
	useLayoutEffect( () => () => clearTimeout( timer.current ), [] );
	return useCallback( ( message ) => {
		clearTimeout( timer.current );
		timer.current = setTimeout( () => speak( message, 'polite' ), 200 );
	}, [] );
}

// Bridge only the canvas's own controls before Core's writing flow handles Tab.
export function useCanvasKeyboard( { gridRef, selectedId, editingId, mode } ) {
	const latest = useRef( { selectedId, editingId, mode } );
	const focused = useRef( null );
	useLayoutEffect( () => {
		latest.current = { selectedId, editingId, mode };
		const previous = focused.current;
		if (
			! previous ||
			( previous.node.isConnected &&
				previous.id === selectedId &&
				previous.mode === mode )
		) {
			return;
		}
		const doc = gridRef.current.ownerDocument;
		if (
			doc.activeElement === previous.node ||
			doc.activeElement === doc.body
		) {
			focusCanvasControl(
				doc.getElementById( `block-${ selectedId || previous.id }` ) ||
					gridRef.current.closest( '[data-block]' )
			);
		}
		focused.current = null;
	} );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		const canvas = grid.closest( '[data-block]' );
		const controls = () =>
			[ 'resize', 'radius', 'rotate', 'height' ]
				.map( ( kind ) =>
					canvas.querySelector( `[data-canvas-keyboard="${ kind }"]` )
				)
				.filter( Boolean );
		const owner = () =>
			grid.querySelector(
				`[data-canvas-item="${ latest.current.selectedId }"]`
			) || canvas;
		const focus = ( event ) => {
			if ( event.target.matches( '[data-canvas-keyboard]' ) ) {
				focused.current = {
					node: event.target,
					id: latest.current.selectedId,
					mode: latest.current.mode,
				};
			} else {
				focused.current = null;
			}
		};
		const key = ( event ) => {
			// Core can remount the block on Undo/Redo and leave iframe focus on body.
			// Preserve native history, then recover the corresponding surviving handle.
			if (
				! event.defaultPrevented &&
				( event.metaKey || event.ctrlKey ) &&
				! event.altKey &&
				event.key.toLowerCase() === 'z' &&
				event.target.matches( '[data-canvas-keyboard]' )
			) {
				const doc = canvas.ownerDocument;
				const kind = event.target.dataset.canvasKeyboard;
				const canvasIndex = [
					...doc.querySelectorAll( '.wp-block-tabor-canvas' ),
				].indexOf( canvas );
				const itemIndex = [ ...grid.children ].indexOf( owner() );
				// Undo reparses post content, including new client IDs. Let Core finish
				// restoring selection before locating the same canvas/item by order.
				doc.defaultView.setTimeout( () => {
					const frame = doc.defaultView.frameElement;
					const nextCanvas = doc.querySelectorAll(
						'.wp-block-tabor-canvas'
					)[ canvasIndex ];
					const nextOwner =
						itemIndex < 0
							? nextCanvas
							: nextCanvas?.querySelector( '.canvas__grid' )
									?.children[ itemIndex ];
					if (
						! nextOwner ||
						nextOwner.hasAttribute( 'data-canvas-editing' ) ||
						( frame && frame.ownerDocument.activeElement !== frame )
					) {
						return;
					}
					if (
						doc.activeElement !== doc.body &&
						doc.activeElement !== nextOwner
					) {
						return;
					}
					focusCanvasControl(
						nextCanvas.querySelector(
							`[data-canvas-keyboard="${ kind }"]`
						) || nextOwner
					);
				}, 100 );
				return;
			}
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey
			) {
				return;
			}
			const { target } = event;
			const handles = controls();
			const index = handles.indexOf( target );
			if ( event.key === 'Escape' && index >= 0 ) {
				event.preventDefault();
				event.stopPropagation();
				focusCanvasControl( owner() );
				return;
			}
			if ( event.key !== 'Tab' ) {
				return;
			}
			let next;
			if ( index >= 0 ) {
				next = event.shiftKey
					? handles[ index - 1 ] || owner()
					: handles[ index + 1 ];
			} else if (
				! latest.current.editingId &&
				target === owner() &&
				! event.shiftKey
			) {
				next = handles[ 0 ];
			}
			if ( ! next ) {
				return;
			}
			// Core leaves the canvas; never wrap the sequence.
			event.preventDefault();
			event.stopPropagation();
			focusCanvasControl( next );
		};
		canvas.addEventListener( 'keydown', key, true );
		canvas.addEventListener( 'focusin', focus, true );
		return () => {
			canvas.removeEventListener( 'keydown', key, true );
			canvas.removeEventListener( 'focusin', focus, true );
		};
	}, [ gridRef ] );
}

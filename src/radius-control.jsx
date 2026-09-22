import {
	useCallback,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
} from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { GridHandle } from './canvas-overlays';
import { focusCanvasControl } from './canvas-keyboard';
import {
	gestureDocuments,
	gesturePoint,
	observeGesturePointer,
} from './gesture-pointer.mjs';
import { holdGestureScroll } from './gesture-scroll.mjs';
import {
	radiusAtDelta,
	radiusDragDelta,
	radiusHandlePosition,
	radiusKeyDelta,
	radiusQuantity,
	radiusUpdates,
} from './radius.mjs';
import { previewRadius, readRadiusTargets } from './radius-targets.mjs';
import { CanvasContext } from './editor-context';
const ARROWS = [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ];
const labels = ( values ) => [ ...new Set( values ) ].join( ' / ' );
export function RadiusHandle( {
	gridRef,
	selectedId,
	box,
	mode,
	registry,
	commitUpdates,
	announce,
} ) {
	const { radiusSettings } = useContext( CanvasContext );
	const block = useSelect(
		( select ) => select( blockEditorStore ).getBlock( selectedId ),
		[ selectedId ]
	);
	const [ data, setData ] = useState( null );
	const [ preview, setPreview ] = useState( null );
	const session = useRef( null );
	const read = useCallback( () => {
		const grid = gridRef.current;
		if ( ! grid ) {
			return {
				targets: [],
				rtl: false,
				scale: 1,
				touch: false,
			};
		}
		const view = grid.ownerDocument.defaultView;
		const rtl = view.getComputedStyle( grid ).direction === 'rtl';
		const bounds = grid.ownerDocument
			.getElementById( `block-${ selectedId }` )
			?.getBoundingClientRect();
		const store = registry.select( blockEditorStore );
		const targets = readRadiusTargets(
			store.getBlock( selectedId ),
			grid,
			store,
			rtl,
			radiusSettings
		);
		let inspectorInset;
		if ( bounds ) {
			if ( rtl ) {
				inspectorInset = bounds.left;
			} else {
				inspectorInset = view.innerWidth - bounds.right;
			}
		} else {
			inspectorInset = Infinity;
		}
		return {
			targets,
			rtl,
			scale: grid.getBoundingClientRect().width / grid.offsetWidth || 1,
			availableEnd: inspectorInset,
			touch:
				grid.closest( '[data-canvas-input]' )?.dataset.canvasInput ===
				'touch',
		};
	}, [ gridRef, selectedId, registry, radiusSettings ] );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		const view = grid.ownerDocument.defaultView;
		const update = () => {
			if ( ! session.current ) {
				setData( read() );
			}
		};
		update();
		const resize = new view.ResizeObserver( update );
		resize.observe( grid );
		const item = grid.ownerDocument.getElementById(
			`block-${ selectedId }`
		);
		if ( item ) {
			resize.observe( item );
		}
		// Core can apply native styles after this overlay's layout effect. Follow
		// those DOM updates too, including fills that don't change block geometry.
		const styles = new view.MutationObserver( update );
		if ( item ) {
			styles.observe( item, {
				attributes: true,
				attributeFilter: [ 'style', 'class', 'dir' ],
				childList: true,
				subtree: true,
			} );
		}
		const input = new view.MutationObserver( update );
		input.observe( grid.closest( '.wp-block-tabor-canvas' ), {
			attributes: true,
			attributeFilter: [ 'data-canvas-input', 'dir' ],
		} );
		grid.addEventListener( 'canvas-layout-change', update );
		const settingsChanged = () => {
			session.current?.finish( false );
			update();
		};
		grid.addEventListener(
			'canvas-radius-settings-change',
			settingsChanged
		);
		view.addEventListener( 'resize', update );
		return () => {
			resize.disconnect();
			styles.disconnect();
			input.disconnect();
			grid.removeEventListener( 'canvas-layout-change', update );
			grid.removeEventListener(
				'canvas-radius-settings-change',
				settingsChanged
			);
			view.removeEventListener( 'resize', update );
		};
	}, [
		block,
		selectedId,
		mode,
		box.width,
		box.height,
		box.rotate,
		gridRef,
		read,
	] );
	useLayoutEffect(
		() => () => session.current?.finish( false ),
		[ block, selectedId, mode ]
	);
	const begin = ( kind, current ) => {
		session.current?.finish( false );
		const grid = gridRef.current;
		const dom = previewRadius( current.targets );
		const documents = gestureDocuments( grid.ownerDocument );
		const selectionEnabled = registry
			.select( blockEditorStore )
			.isSelectionEnabled();
		const stop = ( event ) => {
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		const blurWindow = () => active.finish( true );
		const otherPointer = ( event ) => {
			if ( kind === 'pointer' && event.pointerId !== active.pointerId ) {
				stop( event );
			}
		};
		const cancelKey = ( event ) => {
			if ( event.key !== 'Escape' ) {
				return;
			}
			stop( event );
			active.finish( false );
			focusCanvasControl(
				grid.ownerDocument.getElementById( `block-${ selectedId }` )
			);
		};
		let scroll;
		let activated = false;
		let finished = false;
		const active = {
			kind,
			current,
			values: null,
			pointer: null,
			update( values ) {
				if (
					values.every(
						( value, index ) =>
							value ===
							radiusAtDelta( current.targets[ index ].model, 0 )
					)
				) {
					active.values = null;
					dom.restore();
					setPreview( null );
					return;
				}
				if ( ! activated ) {
					activated = true;
					grid.setAttribute( 'data-canvas-radius-adjusting', '' );
					scroll = holdGestureScroll( grid );
					registry
						.dispatch( blockEditorStore )
						.toggleSelection( false );
					documents.forEach( ( doc ) => {
						doc.body.classList.add( 'is-canvas-gesturing' );
						doc.addEventListener( 'selectstart', stop, true );
						doc.addEventListener( 'dragstart', stop, true );
					} );
				}
				active.values = values;
				dom.update( values );
				setPreview( values );
			},
			finish( commit ) {
				if ( finished ) {
					return;
				}
				finished = true;
				active.pointer?.release();
				documents
					.at( -1 )
					.defaultView.removeEventListener( 'blur', blurWindow );
				documents.forEach( ( doc ) => {
					doc.removeEventListener( 'keydown', cancelKey, true );
					doc.removeEventListener(
						'pointerdown',
						otherPointer,
						true
					);
					doc.removeEventListener( 'selectstart', stop, true );
					doc.removeEventListener( 'dragstart', stop, true );
					if ( activated ) {
						doc.body.classList.remove( 'is-canvas-gesturing' );
					}
				} );
				grid.removeAttribute( 'data-canvas-radius-adjusting' );
				dom.restore();
				scroll?.release();
				if ( activated ) {
					registry
						.dispatch( blockEditorStore )
						.toggleSelection( selectionEnabled );
				}
				session.current = null;
				setPreview( null );
				if ( commit && active.values ) {
					const updates = radiusUpdates(
						current.targets,
						active.values,
						( id ) =>
							registry
								.select( blockEditorStore )
								.getBlockAttributes( id )
					);
					if ( Object.keys( updates ).length ) {
						commitUpdates( updates );
						announce( `Radius: ${ labels( active.values ) }.` );
					}
				}
				setData( read() );
			},
		};
		session.current = active;
		setData( current );
		if ( kind === 'keyboard' ) {
			documents
				.at( -1 )
				.defaultView.addEventListener( 'blur', blurWindow );
		}
		documents.forEach( ( doc ) => {
			doc.addEventListener( 'keydown', cancelKey, true );
			doc.addEventListener( 'pointerdown', otherPointer, true );
		} );
		return active;
	};
	const pointerDown = ( event ) => {
		if (
			event.button !== 0 ||
			( event.pointerType === 'touch' && ! event.isPrimary )
		) {
			return;
		}
		event.preventDefault();
		const current = read();
		if ( ! current.targets.length ) {
			return;
		}
		const grid = gridRef.current;
		const origin = gesturePoint( event, grid.ownerDocument );
		const active = begin( 'pointer', current );
		active.pointerId = event.pointerId;
		const move = ( next ) => {
			const point = gesturePoint( next, grid.ownerDocument );
			const dx = ( point.x - origin.x ) / current.scale;
			const dy = ( point.y - origin.y ) / current.scale;
			const delta = radiusDragDelta(
				dx,
				dy,
				parseFloat( box.rotate ) || 0,
				current.rtl
			);
			if ( ! active.values && Math.abs( delta ) * current.scale < 3 ) {
				return;
			}
			next.preventDefault();
			next.stopPropagation();
			active.update(
				current.targets.map( ( { model } ) =>
					radiusAtDelta( model, delta )
				)
			);
		};
		active.pointer = observeGesturePointer( event, grid, {
			move,
			end: ( next ) => {
				if ( next ) {
					move( next );
				}
				active.finish( true );
			},
			cancel: () => active.finish( false ),
		} );
		active.pointer.capture();
	};
	const keyDown = ( event ) => {
		if (
			! ARROWS.includes( event.key ) ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			session.current?.kind === 'pointer'
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const current = session.current?.current || read();
		if ( ! current.targets.length ) {
			return;
		}
		const active = session.current || begin( 'keyboard', current );
		active.update(
			current.targets.map( ( { model }, index ) => {
				const value = active.values
					? radiusQuantity( active.values[ index ] ).value
					: model.value;
				return radiusAtDelta(
					{
						...model,
						value,
					},
					radiusKeyDelta( event.key, current.rtl ) *
						model.step *
						( event.shiftKey ? 10 : 1 ) *
						model.factor
				);
			} )
		);
	};
	const keyUp = ( event ) => {
		if (
			ARROWS.includes( event.key ) &&
			session.current?.kind === 'keyboard'
		) {
			event.preventDefault();
			event.stopPropagation();
			session.current.finish( true );
		}
	};
	const blur = () => {
		if ( session.current?.kind === 'keyboard' ) {
			session.current.finish( true );
		}
	};
	if ( ! data?.targets.length ) {
		return null;
	}
	const first = data.targets[ 0 ].model;
	const pixels =
		( preview ? radiusQuantity( preview[ 0 ] ).value : first.value ) *
		first.factor;
	const position = radiusHandlePosition(
		box.width,
		box.height,
		pixels,
		data.rtl,
		data.touch,
		data.scale,
		data.availableEnd
	);
	const label = `Radius: ${ labels(
		preview || data.targets.map( ( { model } ) => String( model.label ) )
	) }`;
	return (
		<>
			<GridHandle
				type="button"
				className="canvas__radius"
				data-canvas-keyboard="radius"
				style={ {
					...position,
					'--canvas-radius-scale': data.scale,
				} }
				aria-label={ label }
				aria-description="Drag inward to round all corners, or toward the edge to make them square. Arrow keys adjust radius; Shift uses larger steps. Escape cancels and returns to the block."
				onPointerDown={ pointerDown }
				onKeyDown={ keyDown }
				onKeyUp={ keyUp }
				onBlur={ blur }
			/>
			{ preview && (
				<span
					className="canvas__radius-label"
					style={ {
						left: position.left,
						top: position.top,
						'--canvas-radius-scale': data.scale,
					} }
					aria-hidden="true"
				>
					{ label }
				</span>
			) }
		</>
	);
}

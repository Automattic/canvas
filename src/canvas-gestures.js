import { canMoveSelection, moveSelection } from './selection-movement.mjs';
import { preserveRowsOnResize, resizeCanvasRows } from './row-resize.mjs';
import { minimumSpans } from './placement.mjs';
import { imageResizeRatio } from './image-shapes.mjs';
import { useCallback, useEffect, useRef } from '@wordpress/element';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { rowPitch } from './geometry.mjs';
import {
	dragResizePlacement,
	dragMovePlacement,
	snapCanvasPlacement,
	transformCanvasPlacement,
} from './canvas-geometry.mjs';
import { gridMetrics } from './canvas-metrics.mjs';
import { holdGestureScroll } from './gesture-scroll.mjs';
import {
	gestureDocuments,
	gesturePoint,
	observeGesturePointer,
} from './gesture-pointer.mjs';
import { rotationAtPointer } from './rotation.mjs';
import { centerResizeModifier } from './resize-modifiers.mjs';
import { observeTouchSession } from './touch-session.mjs';
import { translateGroupPlacement } from './canvas-groups.mjs';
export function useCanvasGestures( {
	gridRef,
	mode,
	layouts,
	selectedId,
	minimum,
	commit,
	commitSelection,
	rowCount,
	minimumRows,
	commitRows,
	setPreview,
	registry,
	announce,
} ) {
	const cancelRef = useRef( null );
	const touchRef = useRef( null );
	useEffect(
		() => () => {
			cancelRef.current?.();
			touchRef.current?.destroy();
		},
		[ mode ]
	);
	useEffect( () => {
		if (
			cancelRef.current &&
			cancelRef.current.kind !== 'canvas' &&
			cancelRef.current.clientId !== selectedId
		) {
			cancelRef.current();
		}
	}, [ selectedId ] );
	return useCallback(
		(
			event,
			kind,
			{
				id = selectedId,
				ids = [ id ],
				target = event.currentTarget,
				surface = false,
				onActivate,
				canMove = true,
				onTap,
				onHold,
			} = {}
		) => {
			const touch = event.pointerType === 'touch';
			if (
				layouts[ id ]?.group &&
				! [ 'move', 'canvas' ].includes( kind )
			) {
				return;
			}
			const store = registry.select( blockEditorStore );
			const multiple = kind === 'move' && ids.length > 1;
			const canvasId =
				gridRef.current?.closest( '[data-block]' )?.dataset.block;
			if (
				multiple &&
				( touch ||
					! ids.includes( id ) ||
					! canMoveSelection( store, ids, canvasId ) ||
					ids.some( ( key ) => ! layouts[ key ]?.[ mode ]?._canvas ) )
			) {
				return;
			}
			if (
				id &&
				[
					id,
					...store
						.getBlockParents( id )
						.filter(
							( key ) =>
								key === canvasId ||
								store
									.getBlockParents( key )
									.includes( canvasId )
						),
				].some(
					( key ) =>
						store.getBlockAttributes( key )?.lock?.move ||
						store.getTemplateLock( key ) ||
						store.getBlockEditingMode( key ) !== 'default'
				)
			) {
				if ( ! surface ) {
					return;
				}
				canMove = false;
			}
			if ( ! touch && ! canMove ) {
				return;
			}
			if (
				event.button !== 0 ||
				! gridRef.current ||
				( touch && ( kind === 'rotate' || ! event.isPrimary ) )
			) {
				return;
			}
			// Surface gestures select the owning item before crossing the drag threshold.
			if ( ! surface ) {
				event.preventDefault();
				event.stopPropagation();
			}
			cancelRef.current?.();
			touchRef.current?.destroy();
			const grid = gridRef.current;
			const doc = target.ownerDocument;
			const keyDocuments = new Set( gestureDocuments( doc ) );
			const metrics = gridMetrics( grid );
			const start = kind === 'canvas' ? null : layouts[ id ]?.[ mode ];
			if (
				! metrics ||
				( canMove && kind !== 'canvas' && ! start?._canvas )
			) {
				return;
			}
			let scroll;
			let selectionEnabled;
			const fitArea = layouts[ id ]?.fitArea;
			const position = ( e ) => {
				scroll?.restore();
				const rect = grid.getBoundingClientRect();
				const scale = grid.offsetWidth / rect.width || 1;
				const point = gesturePoint( e, grid.ownerDocument );
				return {
					x: ( point.x - rect.left ) * scale,
					y: ( point.y - rect.top ) * scale,
				};
			};
			const origin = position( event );
			const itemBounds =
				kind === 'rotate'
					? grid
							.querySelector( `[data-canvas-item="${ id }"]` )
							?.getBoundingClientRect()
					: null;
			const center = itemBounds
				? position( {
						clientX: itemBounds.left + itemBounds.width / 2,
						clientY: itemBounds.top + itemBounds.height / 2,
					} )
				: null;
			let finalValue = start;
			let dropPlacements;
			let finalRows = rowCount;
			let rowOffset = 0;
			let moved = false;
			let finished = false;
			let pairStart, pairOrigin;
			let fromCenter = false;
			// Guidelines and the completed edit must use the same snapped destination.
			// Only a plain move retains the original span, not a pinch/twist.
			const dropPlacement = () =>
				! layouts[ id ]?.group && kind !== 'rotate' && finalValue?.free
					? snapCanvasPlacement(
							finalValue,
							mode,
							minimum,
							kind === 'move' && ! pairStart ? start : undefined,
							6 * ( metrics.scale || 1 ),
							fromCenter ? start._rect : undefined
						)
					: finalValue;
			const stopNative = ( e ) => {
				e.preventDefault();
				e.stopImmediatePropagation();
			};
			const activate = () => {
				if ( moved ) {
					return;
				}
				scroll = holdGestureScroll( grid );
				selectionEnabled = registry
					.select( blockEditorStore )
					.isSelectionEnabled();
				registry.dispatch( blockEditorStore ).toggleSelection( false );
				for ( const document of keyDocuments ) {
					document.body.classList.add( 'is-canvas-gesturing' );
					for ( const name of [
						'dragstart',
						'selectstart',
						'mousemove',
					] ) {
						document.addEventListener( name, stopNative, true );
					}
				}
				if ( kind === 'rotate' ) {
					grid.setAttribute( 'data-canvas-rotating', 'true' );
				}
				if ( surface ) {
					onActivate?.();
					pointer.capture();
					grid.setAttribute( 'data-canvas-dragging', 'true' );
					if ( ! touch ) {
						doc.addEventListener( 'click', stopNative, true );
					}
				}
				moved = true;
			};
			const move = ( e ) => {
				if ( e.pointerId !== event.pointerId ) {
					return;
				}
				const current = position( e );
				const dx = current.x - origin.x;
				const dy = current.y - origin.y;
				if (
					! touch &&
					! moved &&
					Math.hypot( dx, dy ) < ( surface ? 5 : 3 )
				) {
					return;
				}
				activate();
				e.preventDefault();
				e.stopPropagation();
				if ( kind === 'canvas' ) {
					const next = resizeCanvasRows(
						layouts,
						mode,
						rowCount,
						minimumRows,
						dy / rowPitch( metrics ),
						e.shiftKey
					);
					finalRows = next.rows;
					rowOffset = next.offset;
					setPreview( {
						rows: finalRows,
						placements: preserveRowsOnResize(
							layouts,
							mode,
							rowOffset,
							finalRows
						),
						height:
							metrics.height === undefined
								? undefined
								: metrics.height +
									next.heightDelta * rowPitch( metrics ),
					} );
				} else if ( multiple ) {
					const placements = moveSelection(
						layouts,
						ids,
						mode,
						id,
						dx,
						dy
					);
					dropPlacements = moveSelection(
						layouts,
						ids,
						mode,
						id,
						dx,
						dy,
						{
							snap: true,
							minimum: minimumSpans( store.getBlockName( id ) ),
							tolerance: 6 * ( metrics.scale || 1 ),
						}
					);
					setPreview( {
						id,
						placement: placements[ id ],
						placements,
						dropPlacement: dropPlacements[ id ],
						dropPlacements,
					} );
				} else if ( kind === 'rotate' && center ) {
					finalValue = {
						...start,
						rotation: rotationAtPointer(
							start.rotation,
							origin,
							current,
							center,
							e.shiftKey
						),
					};
					setPreview( {
						id,
						placement: finalValue,
						fitArea,
						rotating: true,
					} );
				} else {
					// Resize in the item's local axes after rotation; moving stays aligned
					// with the canvas so a drag to the right still moves right.
					const radians =
						kind === 'move'
							? 0
							: ( ( start.rotation || 0 ) * Math.PI ) / 180;
					const localX =
						dx * Math.cos( radians ) + dy * Math.sin( radians );
					const localY =
						dy * Math.cos( radians ) - dx * Math.sin( radians );
					fromCenter = kind !== 'move' && centerResizeModifier( e );
					if ( layouts[ id ]?.group ) {
						finalValue = translateGroupPlacement(
							start,
							mode,
							localX,
							localY
						);
					} else if ( kind !== 'move' ) {
						finalValue = dragResizePlacement(
							start,
							mode,
							kind,
							localX,
							localY,
							minimum,
							imageResizeRatio(
								layouts[ id ],
								start,
								e.shiftKey &&
									store.getBlockName( id ) === 'core/image'
							),
							fromCenter
						);
					} else {
						finalValue = dragMovePlacement(
							start,
							mode,
							localX,
							localY,
							minimum,
							metrics.scale || 1
						);
					}
					setPreview( {
						id,
						placement: finalValue,
						dropPlacement: dropPlacement(),
						fitArea,
						resizing: kind !== 'move',
					} );
				}
			};
			const cleanup = () => {
				if ( finished ) {
					return;
				}
				finished = true;
				pointer.release();
				for ( const document of keyDocuments ) {
					document.body.classList.remove( 'is-canvas-gesturing' );
					for ( const name of [
						'dragstart',
						'selectstart',
						'mousemove',
					] ) {
						document.removeEventListener( name, stopNative, true );
					}
				}
				// Swallow the compatibility click after a drag, without swallowing the
				// user's next click when the browser doesn't dispatch one.
				doc.defaultView.setTimeout(
					() => doc.removeEventListener( 'click', stopNative, true ),
					0
				);
				keyDocuments.forEach( ( document ) =>
					document.removeEventListener( 'keydown', key, true )
				);
				grid.removeAttribute( 'data-canvas-dragging' );
				grid.removeAttribute( 'data-canvas-rotating' );
				setPreview( null );
				cancelRef.current = null;
				scroll?.release();
				if ( selectionEnabled !== undefined ) {
					registry
						.dispatch( blockEditorStore )
						.toggleSelection( selectionEnabled );
				}
			};
			const cancel = () => cleanup();
			const end = ( e ) => {
				if ( finished || ( e && e.pointerId !== event.pointerId ) ) {
					return;
				}
				// The release can be farther along than the last delivered pointermove,
				// especially during quick trackpad drags or across the editor iframe.
				if ( e ) {
					move( e );
				}
				if ( e && ( ! surface || moved ) ) {
					e.preventDefault();
					e.stopPropagation();
				}
				cleanup();
				if ( ! moved ) {
					return;
				}
				if ( multiple ) {
					if ( canMoveSelection( store, ids, canvasId ) ) {
						commitSelection( dropPlacements );
						announce( `${ ids.length } blocks moved.` );
					}
					return;
				}
				finalValue = dropPlacement();
				if ( kind === 'canvas' ) {
					if ( finalRows !== rowCount ) {
						commitRows( finalRows, rowOffset );
						announce( `Canvas height ${ finalRows } rows.` );
					}
				} else if (
					JSON.stringify( finalValue ) !== JSON.stringify( start ) ||
					fitArea !== layouts[ id ].fitArea
				) {
					commit( id, finalValue, fitArea );
					let announcement;
					if ( pairStart ) {
						announcement = `Width ${ finalValue.columnSpan } columns, height ${ finalValue.rowSpan } rows. Rotation ${ finalValue.rotation || 0 } degrees.`;
					} else if ( kind === 'rotate' ) {
						announcement = `Rotation ${ finalValue.rotation } degrees.`;
					} else if ( kind === 'move' ) {
						announcement = `Column ${ finalValue.column }, row ${ finalValue.row }.`;
					} else {
						announcement = `Width ${ finalValue.columnSpan } columns, height ${ finalValue.rowSpan } rows.`;
					}
					announce( announcement );
				}
			};
			const key = ( e ) => {
				if ( e.key === 'Escape' ) {
					e.preventDefault();
					e.stopPropagation();
					cancel();
				}
			};
			cancelRef.current = cancel;
			cancel.clientId = multiple ? selectedId : id;
			cancel.kind = kind;
			const pointer = touch
				? observeTouchSession( event, grid, {
						canMove,
						move,
						end: () => end(),
						cancel,
						tap: ( e ) => {
							cleanup();
							onTap?.( e );
						},
						hold: onHold
							? ( e ) => {
									cleanup();
									onHold( e );
								}
							: undefined,
						canPair: ( e ) => {
							if (
								layouts[ id ]?.group ||
								! start?._canvas ||
								kind === 'canvas' ||
								kind === 'rotate'
							) {
								return false;
							}
							const item =
								e.target.closest?.( '[data-canvas-item]' );
							const handles =
								e.target.closest?.( '.canvas__selection' );
							return (
								item?.dataset.canvasItem === id ||
								( !! handles &&
									handles ===
										grid.parentElement.querySelector(
											'.canvas__selection'
										) )
							);
						},
						pair: ( events ) => {
							pairStart = finalValue;
							pairOrigin = events.map( position );
							activate();
						},
						transform: ( events ) => {
							finalValue = transformCanvasPlacement(
								pairStart,
								mode,
								pairOrigin,
								events.map( position ),
								minimum
							);
							setPreview( {
								id,
								placement: finalValue,
								dropPlacement: dropPlacement(),
								fitArea,
								transforming: true,
							} );
						},
					} )
				: observeGesturePointer( event, grid, {
						move,
						end,
						cancel,
					} );
			if ( touch ) {
				touchRef.current = pointer;
			}
			if ( ! surface ) {
				pointer.capture();
			}
			keyDocuments.forEach( ( document ) =>
				document.addEventListener( 'keydown', key, true )
			);
		},
		[
			gridRef,
			mode,
			layouts,
			selectedId,
			minimum,
			commit,
			commitSelection,
			rowCount,
			minimumRows,
			commitRows,
			setPreview,
			registry,
			announce,
		]
	);
}

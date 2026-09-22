import { imageShape, imageFit, shapePath, shapeMask } from './image-shapes.mjs';
import { useCallback, useLayoutEffect, useRef } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { ATTRIBUTE } from './placement.mjs';
import {
	coverImage,
	imagePosition,
	moveImagePosition,
	roundedImagePath,
} from './image-position.mjs';
import {
	gestureDocuments,
	gesturePoint,
	observeGesturePointer,
} from './gesture-pointer.mjs';
import { holdGestureScroll } from './gesture-scroll.mjs';

const ARROWS = {
	ArrowLeft: [ -1, 0 ],
	ArrowRight: [ 1, 0 ],
	ArrowUp: [ 0, -1 ],
	ArrowDown: [ 0, 1 ],
};
const same = ( a, b ) =>
	Math.abs( a.x - b.x ) < 1e-8 && Math.abs( a.y - b.y ) < 1e-8;
const stop = ( event ) => {
	event.preventDefault();
	event.stopImmediatePropagation();
};

function readImageFrame( item ) {
	const img = item?.querySelector( 'img' );
	const grid = item?.closest( '.canvas__grid' );
	if ( ! img?.complete || ! img.naturalWidth || ! grid ) {
		return null;
	}
	const view = img.ownerDocument.defaultView;
	const css = view.getComputedStyle( img );
	const number = ( key ) => parseFloat( css[ key ] ) || 0;
	const left = number( 'borderLeftWidth' ) + number( 'paddingLeft' );
	const right = number( 'borderRightWidth' ) + number( 'paddingRight' );
	const top = number( 'borderTopWidth' ) + number( 'paddingTop' );
	const bottom = number( 'borderBottomWidth' ) + number( 'paddingBottom' );
	const width =
		number( 'width' ) +
		( css.boxSizing === 'border-box' ? 0 : left + right );
	const height =
		number( 'height' ) +
		( css.boxSizing === 'border-box' ? 0 : top + bottom );
	const cover = coverImage(
		width - left - right,
		height - top - bottom,
		img.naturalWidth,
		img.naturalHeight
	);
	if ( ! cover || Math.max( cover.overflowX, cover.overflowY ) < 0.5 ) {
		return null;
	}
	const rect = img.getBoundingClientRect();
	const scale =
		grid.getBoundingClientRect().width /
			parseFloat( view.getComputedStyle( grid ).width ) || 1;
	return {
		img,
		width,
		height,
		left,
		top,
		contentWidth: width - left - right,
		contentHeight: height - top - bottom,
		cover,
		scale,
		shape: imageShape( item.dataset.canvasShape ),
		shapeStretch:
			item.dataset.canvasShapeStretch === undefined
				? undefined
				: item.dataset.canvasShapeStretch === 'true',
		rotation: parseFloat( view.getComputedStyle( item ).rotate ) || 0,
		centerX: rect.left + rect.width / 2,
		centerY: rect.top + rect.height / 2,
		corners: [
			'borderTopLeftRadius',
			'borderTopRightRadius',
			'borderBottomRightRadius',
			'borderBottomLeftRadius',
		].map( ( key ) => css[ key ] ),
	};
}

export function canRepositionImage( item, store ) {
	const id = item?.dataset.canvasItem;
	return (
		store.getBlockName( id ) === 'core/image' &&
		store.getBlockEditingMode( id ) === 'default' &&
		imageFit( store.getBlockAttributes( id )?.[ ATTRIBUTE ] ) === 'cover' &&
		!! readImageFrame( item )
	);
}

// Keep the overlay beside its image so both share the same stacking order.
// Its viewport-sized clip reveals overflow without extending scroll bounds.
function createImageOverlay( item, id ) {
	const doc = item.ownerDocument;
	const node = ( name, attributes = {} ) => {
		const element = doc.createElementNS(
			'http://www.w3.org/2000/svg',
			name
		);
		Object.entries( attributes ).forEach( ( [ key, value ] ) =>
			element.setAttribute( key, value )
		);
		return element;
	};
	const root = doc.createElement( 'div' );
	root.id = `canvas-image-reposition-${ id }`;
	root.className = 'canvas-image-reposition';
	root.setAttribute( 'aria-hidden', 'true' );
	const frame = doc.createElement( 'div' );
	frame.className = 'canvas-image-reposition__frame';
	const svg = node( 'svg', { overflow: 'visible' } );
	const defs = node( 'defs' );
	const maskId = `canvas-image-mask-${ id }`;
	const mask = node( 'mask', {
		id: maskId,
		maskUnits: 'userSpaceOnUse',
		maskContentUnits: 'userSpaceOnUse',
	} );
	const sourceRect = node( 'rect', { fill: 'white' } );
	const cutout = node( 'path', { fill: 'black' } );
	const ghost = node( 'image', {
		opacity: '.2',
		mask: `url(#${ maskId })`,
		preserveAspectRatio: 'none',
	} );
	mask.append( sourceRect, cutout );
	defs.append( mask );
	svg.append( defs, ghost );
	const thirds = doc.createElement( 'div' );
	thirds.className = 'canvas-image-reposition__thirds';
	const hint = doc.createElement( 'span' );
	hint.className = 'canvas-image-reposition__hint';
	hint.textContent = 'Drag to reposition';
	frame.append( svg, thirds, hint );
	root.append( frame );
	item.after( root );
	// CSSOM updates avoid waking the canvas's DOM observers on every drag frame.
	const style = doc.createElement( 'style' );
	style.textContent = `#${ root.id } {} #${ root.id } > div {} #${ root.id } .canvas-image-reposition__thirds {}`;
	doc.head.append( style );
	const [ rootStyle, frameStyle, thirdsStyle ] = [
		...style.sheet.cssRules,
	].map( ( rule ) => rule.style );
	return {
		remove() {
			root.remove();
			style.remove();
		},
		paint( data, point ) {
			const { width, height, cover, scale, corners } = data;
			const parent = root.offsetParent;
			const bounds = parent.getBoundingClientRect();
			Object.assign( rootStyle, {
				left: `${ -bounds.left / scale - parent.clientLeft + parent.scrollLeft }px`,
				top: `${ -bounds.top / scale - parent.clientTop + parent.scrollTop }px`,
				width: `${ doc.documentElement.clientWidth / scale }px`,
				height: `${ doc.documentElement.clientHeight / scale }px`,
				zIndex: doc.defaultView.getComputedStyle( item ).zIndex,
			} );
			Object.assign( frameStyle, {
				width: `${ width }px`,
				height: `${ height }px`,
				left: `${ data.centerX / scale }px`,
				top: `${ data.centerY / scale }px`,
				transform: `translate(-50%, -50%) rotate(${ data.rotation }deg)`,
			} );
			frameStyle.setProperty( '--canvas-image-scale', scale );
			svg.setAttribute( 'width', width );
			svg.setAttribute( 'height', height );
			const area = {
				x: data.left - cover.overflowX * point.x,
				y: data.top - cover.overflowY * point.y,
				width: cover.width,
				height: cover.height,
			};
			for ( const element of [ ghost, sourceRect, mask ] ) {
				Object.entries( area ).forEach( ( [ key, value ] ) =>
					element.setAttribute( key, value )
				);
			}
			const src = data.img.currentSrc || data.img.src;
			if ( ghost.getAttribute( 'href' ) !== src ) {
				ghost.setAttribute( 'href', src );
			}
			if ( data.shape !== 'none' ) {
				cutout.setAttribute( 'd', shapePath( data.shape ) );
				cutout.setAttribute(
					'transform',
					`translate(${ data.left } ${ data.top }) scale(${ data.contentWidth / 100 } ${ data.contentHeight / 100 })`
				);
			} else {
				cutout.setAttribute(
					'd',
					roundedImagePath( width, height, corners )
				);
				cutout.removeAttribute( 'transform' );
			}
			thirdsStyle.maskImage =
				shapeMask( data.shape, data.shapeStretch ) || 'none';
			thirdsStyle.maskSize = `${ data.contentWidth }px ${ data.contentHeight }px`;
			thirdsStyle.maskPosition = `${ data.left }px ${ data.top }px`;
			thirdsStyle.maskRepeat = 'no-repeat';
			[
				'borderTopLeftRadius',
				'borderTopRightRadius',
				'borderBottomRightRadius',
				'borderBottomLeftRadius',
			].forEach( ( key, index ) => {
				thirdsStyle[ key ] = corners[ index ];
			} );
			hint.hidden = width * scale < 160 || height * scale < 72;
		},
	};
}

export function useImageReposition( {
	gridRef,
	editingId,
	mode,
	registry,
	commitUpdates,
	announce,
	exitEditing,
} ) {
	const identity = useRef( null );
	const controller = useRef( null );
	const finish = useCallback( () => controller.current?.finish(), [] );
	const { isImage, enabled, media } = useSelect( () => {
		const store = registry.select( blockEditorStore );
		const attributes = editingId
			? store.getBlockAttributes( editingId )
			: null;
		const point = imagePosition( attributes?.[ ATTRIBUTE ]?.imagePosition );
		return {
			isImage:
				!! editingId &&
				store.getBlockName( editingId ) === 'core/image',
			enabled:
				!! attributes &&
				imageFit( attributes[ ATTRIBUTE ] ) === 'cover' &&
				store.getBlockEditingMode( editingId ) === 'default',
			media: `${ attributes?.id || '' }:${ attributes?.url || '' }`,
			...point,
		};
	}, [ editingId, registry ] );

	useLayoutEffect( () => {
		if ( ! isImage ) {
			identity.current = null;
			return;
		}
		const prior = identity.current;
		if (
			! enabled ||
			( prior?.id === editingId &&
				( prior.mode !== mode || prior.media !== media ) )
		) {
			exitEditing();
			return;
		}
		identity.current = { id: editingId, mode, media };
		const grid = gridRef.current;
		const doc = grid.ownerDocument;
		const view = doc.defaultView;
		const item = doc.getElementById( `block-${ editingId }` );
		let data = readImageFrame( item );
		if ( ! data ) {
			exitEditing();
			return;
		}
		const img = data.img;
		// A CSS rule previews position without triggering the canvas's attribute
		// observers and recalculating every responsive layout on each pointer move.
		const previewStyle = doc.createElement( 'style' );
		previewStyle.textContent = `#${ view.CSS.escape( item.id ) } img { object-position: 50% 50% !important; }`;
		doc.head.append( previewStyle );
		const previewRule = previewStyle.sheet.cssRules[ 0 ].style;
		const overlay = createImageOverlay( item, editingId );
		const documents = gestureDocuments( doc );
		const store = registry.select( blockEditorStore );
		const currentPoint = () =>
			imagePosition(
				store.getBlockAttributes( editingId )?.[ ATTRIBUTE ]
					?.imagePosition
			);
		let session = null;
		let animation;
		let disposed = false;
		const paint = ( point ) => {
			previewRule.setProperty(
				'object-position',
				`${ point.x * 100 }% ${ point.y * 100 }%`,
				'important'
			);
			overlay.paint( data, point );
		};
		const refresh = () => {
			if ( disposed ) {
				return;
			}
			const next = readImageFrame( item );
			if ( ! next || next.img !== img ) {
				exitEditing();
				return;
			}
			data = next;
			paint( session?.point || currentPoint() );
		};
		const schedule = () => {
			view.cancelAnimationFrame( animation );
			animation = view.requestAnimationFrame( refresh );
		};
		const begin = ( kind ) => {
			session?.finish( true );
			const start = currentPoint();
			const scroll = holdGestureScroll( grid );
			const selectionEnabled = store.isSelectionEnabled();
			registry.dispatch( blockEditorStore ).toggleSelection( false );
			let finished = false;
			const active = {
				kind,
				point: start,
				pointer: null,
				update( point ) {
					active.point = point;
					scroll.restore();
					paint( point );
				},
				finish( commit ) {
					if ( finished ) {
						return;
					}
					finished = true;
					active.pointer?.release();
					scroll.release();
					item.removeAttribute( 'data-canvas-reposition-dragging' );
					registry
						.dispatch( blockEditorStore )
						.toggleSelection( selectionEnabled );
					session = null;
					if (
						commit &&
						! same( start, active.point ) &&
						store.getBlockAttributes( editingId )
					) {
						commitUpdates( {
							[ editingId ]: {
								[ ATTRIBUTE ]: {
									...store.getBlockAttributes( editingId )[
										ATTRIBUTE
									],
									imagePosition: active.point,
								},
							},
						} );
						announce( 'Image position updated.' );
					}
					if ( ! disposed ) {
						paint( currentPoint() );
					}
				},
			};
			session = active;
			return active;
		};
		const inside = ( event ) => {
			if ( ! item.contains( event.target ) ) {
				return false;
			}
			const point = gesturePoint( event, doc );
			const angle = ( data.rotation * Math.PI ) / 180;
			const dx = ( point.x - data.centerX ) / data.scale,
				dy = ( point.y - data.centerY ) / data.scale;
			return (
				Math.abs( dx * Math.cos( angle ) + dy * Math.sin( angle ) ) <=
					data.width / 2 &&
				Math.abs( -dx * Math.sin( angle ) + dy * Math.cos( angle ) ) <=
					data.height / 2
			);
		};
		// The native toolbar is outside the canvas iframe. Keep this mode alive
		// while its controls are focused so Done can receive clicks and keys.
		const inToolbar = ( event ) =>
			!! event.target.closest?.(
				'.block-editor-block-toolbar:has([data-canvas-image-done])'
			);
		const down = ( event ) => {
			if ( session?.kind === 'pointer' ) {
				stop( event );
				return;
			}
			if ( inToolbar( event ) ) {
				session?.finish( true );
				return;
			}
			if ( ! inside( event ) ) {
				session?.finish( true );
				exitEditing();
				return;
			}
			if (
				event.button !== 0 ||
				( event.pointerType === 'touch' && ! event.isPrimary )
			) {
				return;
			}
			stop( event );
			item.focus( { preventScroll: true } );
			refresh();
			const origin = gesturePoint( event, doc );
			const start = currentPoint();
			const metrics = data;
			const active = begin( 'pointer' );
			item.setAttribute( 'data-canvas-reposition-dragging', 'true' );
			const move = ( next ) => {
				stop( next );
				const point = gesturePoint( next, doc );
				active.update(
					moveImagePosition(
						start,
						metrics.cover,
						point.x - origin.x,
						point.y - origin.y,
						metrics.rotation,
						metrics.scale
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
			if ( event.key === 'Escape' ) {
				stop( event );
				session?.finish( false );
				exitEditing();
				item.focus( { preventScroll: true } );
				announce( 'Movement mode.' );
				return;
			}
			if ( ! item.contains( event.target ) ) {
				return;
			}
			if ( event.key === 'Tab' ) {
				session?.finish( true );
				const done = documents
					.map( ( document ) =>
						document.querySelector( '[data-canvas-image-done]' )
					)
					.find( Boolean );
				if ( done ) {
					stop( event );
					done.focus( { preventScroll: true } );
				} else {
					exitEditing();
				}
				return;
			}
			if (
				( event.ctrlKey || event.metaKey ) &&
				event.key.toLowerCase() === 'z'
			) {
				session?.finish( false );
				return;
			}
			if (
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				( ! ARROWS[ event.key ] && event.key !== 'Home' )
			) {
				return;
			}
			stop( event );
			if ( session?.kind === 'pointer' ) {
				return;
			}
			const active = session || begin( 'keyboard' );
			const [ dx, dy ] = ARROWS[ event.key ] || [ 0, 0 ];
			const step = event.shiftKey ? 10 : 1;
			active.update(
				event.key === 'Home'
					? { x: 0.5, y: 0.5 }
					: moveImagePosition(
							active.point,
							data.cover,
							dx * step,
							dy * step,
							data.rotation
						)
			);
		};
		const keyUp = ( event ) => {
			if (
				( ARROWS[ event.key ] || event.key === 'Home' ) &&
				session?.kind === 'keyboard'
			) {
				stop( event );
				session.finish( true );
			}
		};
		const click = ( event ) => {
			if ( item.contains( event.target ) ) {
				stop( event );
			}
		};
		const focus = ( event ) => {
			if (
				event.target !== doc.body &&
				! item.contains( event.target ) &&
				! inToolbar( event )
			) {
				session?.finish( true );
				exitEditing();
			}
		};
		const blur = () => session?.finish( true );
		item.setAttribute( 'data-canvas-repositioning', 'true' );
		item.focus( { preventScroll: true } );
		const handlers = {
			pointerdown: down,
			keydown: keyDown,
			keyup: keyUp,
			click,
			dblclick: click,
			dragstart: click,
			contextmenu: click,
			focusin: focus,
		};
		for ( const document of documents ) {
			for ( const [ name, handler ] of Object.entries( handlers ) ) {
				document.addEventListener( name, handler, true );
			}
		}
		view.addEventListener( 'scroll', schedule, true );
		view.addEventListener( 'resize', schedule );
		documents.at( -1 ).defaultView.addEventListener( 'blur', blur );
		const resize = new view.ResizeObserver( schedule );
		resize.observe( img );
		resize.observe( grid );
		grid.addEventListener( 'canvas-layout-change', schedule );
		img.addEventListener( 'load', schedule );
		controller.current = {
			refresh,
			finish() {
				session?.finish( true );
				exitEditing();
				item.focus( { preventScroll: true } );
				announce( 'Image repositioning finished.' );
			},
		};
		refresh();
		announce(
			'Reposition image. Drag or use arrow keys. Shift uses larger steps. Home centers. Tab reaches Done. Escape finishes.'
		);
		return () => {
			disposed = true;
			session?.finish( false );
			controller.current = null;
			previewStyle.remove();
			overlay.remove();
			resize.disconnect();
			view.cancelAnimationFrame( animation );
			item.removeAttribute( 'data-canvas-repositioning' );
			for ( const document of documents ) {
				for ( const [ name, handler ] of Object.entries( handlers ) ) {
					document.removeEventListener( name, handler, true );
				}
			}
			view.removeEventListener( 'scroll', schedule, true );
			view.removeEventListener( 'resize', schedule );
			documents.at( -1 ).defaultView.removeEventListener( 'blur', blur );
			grid.removeEventListener( 'canvas-layout-change', schedule );
			img.removeEventListener( 'load', schedule );
		};
	}, [
		editingId,
		isImage,
		enabled,
		media,
		mode,
		gridRef,
		registry,
		commitUpdates,
		announce,
		exitEditing,
	] );
	// Synchronize native Undo/Redo and sidebar changes without rebuilding a drag.
	useLayoutEffect( () => {
		controller.current?.refresh();
	} );
	return finish;
}

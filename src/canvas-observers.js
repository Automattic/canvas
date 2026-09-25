import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { COLUMNS } from './geometry.mjs';

// Briefly preview the grid for native spacing changes.
// Track spacing settings, since measured gaps also change with viewport size.
export function useGridPreview( spacing, isSelected, gridRef ) {
	const previousSpacing = useRef( spacing );
	const timeout = useRef( null );
	const [ visible, setVisible ] = useState( false );
	const [ interacting, setInteracting ] = useState( false );
	useEffect( () => {
		if ( ! isSelected ) {
			setInteracting( false );
			return;
		}
		// Native spacing sliders and custom inputs live outside the canvas iframe.
		// Keep cells visible through pauses in a drag and keyboard adjustments.
		const isControl = ( node ) =>
			!! node?.closest?.(
				'.block-editor-block-inspector .spacing-sizes-control'
			);
		const editorDocument =
			gridRef.current?.ownerDocument.defaultView.frameElement
				?.ownerDocument || gridRef.current?.ownerDocument;
		if ( ! editorDocument ) {
			return;
		}
		let dragging = false;
		const update = () =>
			setInteracting(
				dragging || isControl( editorDocument.activeElement )
			);
		const focus = ( event ) =>
			setInteracting(
				dragging ||
					isControl(
						event.type === 'focusout'
							? event.relatedTarget
							: event.target
					)
			);
		const start = ( event ) => {
			dragging = isControl( event.target );
			update();
		};
		const end = () => {
			dragging = false;
			update();
		};
		const listeners = {
			focusin: focus,
			focusout: focus,
			pointerdown: start,
			pointerup: end,
			pointercancel: end,
		};
		for ( const [ name, handler ] of Object.entries( listeners ) ) {
			editorDocument.addEventListener( name, handler, true );
		}
		update();
		return () => {
			for ( const [ name, handler ] of Object.entries( listeners ) ) {
				editorDocument.removeEventListener( name, handler, true );
			}
		};
	}, [ isSelected, gridRef ] );
	useEffect( () => {
		const changed =
			previousSpacing.current !== undefined &&
			spacing !== undefined &&
			spacing !== previousSpacing.current;
		previousSpacing.current = spacing;
		if ( ! isSelected ) {
			clearTimeout( timeout.current );
			setVisible( false );
		} else if ( changed ) {
			clearTimeout( timeout.current );
			setVisible( true );
			timeout.current = setTimeout( () => setVisible( false ), 1600 );
		}
	}, [ spacing, isSelected ] );
	useEffect( () => () => clearTimeout( timeout.current ), [] );
	return isSelected && ( interacting || visible );
}

export function useCanvasViewport( gridRef ) {
	const [ mode, setMode ] = useState( 'desktop' );
	useLayoutEffect( () => {
		const view = gridRef.current?.ownerDocument.defaultView;
		if ( ! view ) {
			return;
		}
		const update = () => {
			const value = view
				.getComputedStyle( gridRef.current )
				.getPropertyValue( '--canvas-viewport' )
				.trim();
			setMode( Object.hasOwn( COLUMNS, value ) ? value : 'desktop' );
		};
		update();
		view.addEventListener( 'resize', update );
		return () => view.removeEventListener( 'resize', update );
	}, [ gridRef ] );
	return mode;
}

export function useSelectionBox(
	stageRef,
	gridRef,
	selectedId,
	preview,
	layouts,
	mode,
	attributes
) {
	const [ box, setBox ] = useState( null );
	useLayoutEffect( () => {
		const stage = stageRef.current;
		const grid = gridRef.current;
		const item = grid?.querySelector(
			`[data-canvas-item="${ selectedId }"]`
		);
		if ( ! stage || ! grid || ! item ) {
			setBox( null );
			return;
		}
		const view = grid.ownerDocument.defaultView;
		const update = () => {
			if ( item.classList.contains( 'is-block-hidden' ) ) {
				setBox( null );
				return;
			}
			const parent = stage.getBoundingClientRect();
			const child = item.getBoundingClientRect();
			const scale = stage.offsetWidth / parent.width || 1;
			// A rotated DOMRect is an axis-aligned bounding box. Keep its center,
			// but use the unrotated border box so handles stay on the actual corners.
			const css = view.getComputedStyle( item );
			const size = ( axis, sides ) =>
				parseFloat( css[ axis ] ) +
				( css.boxSizing === 'border-box'
					? 0
					: sides.reduce(
							( sum, side ) =>
								sum +
								parseFloat( css[ `padding${ side }` ] ) +
								parseFloat( css[ `border${ side }Width` ] ),
							0
						) );
			const width = size( 'width', [ 'Left', 'Right' ] );
			const height = size( 'height', [ 'Top', 'Bottom' ] );
			const next = {
				left:
					( child.left + child.width / 2 - parent.left ) * scale -
					width / 2,
				top:
					( child.top + child.height / 2 - parent.top ) * scale -
					height / 2,
				width,
				height,
				rotate: css.rotate,
			};
			setBox( ( old ) =>
				old &&
				Object.keys( next ).every(
					( key ) => old[ key ] === next[ key ]
				)
					? old
					: next
			);
		};
		update();
		const observer = new view.ResizeObserver( update );
		observer.observe( grid );
		observer.observe( item );
		view.addEventListener( 'resize', update );
		view.addEventListener( 'scroll', update, true );
		grid.addEventListener( 'canvas-layout-change', update );
		return () => {
			observer.disconnect();
			view.removeEventListener( 'resize', update );
			view.removeEventListener( 'scroll', update, true );
			grid.removeEventListener( 'canvas-layout-change', update );
		};
	}, [ stageRef, gridRef, selectedId, preview, layouts, mode, attributes ] );
	return box;
}

export function useItemToolbar(
	selectedId,
	selectedName,
	directSelected,
	selectedBlockName,
	hasCanvasParent,
	selectedImageHasSource,
	editingId
) {
	useLayoutEffect( () => {
		if ( ! selectedId ) {
			return;
		}
		// The toolbar lives outside the canvas. selectedId includes descendants
		// at any depth, and cleanup restores ordinary toolbars on selection change.
		document.body.classList.add( 'has-canvas-child-selected' );
		return () =>
			document.body.classList.remove( 'has-canvas-child-selected' );
	}, [ selectedId ] );
	useLayoutEffect( () => {
		const labels = [];
		// Direct children use InnerBlocks' native layout alignment policy. Nested
		// Canvas groups have their own Core layout context, so retain a fallback.
		if (
			! hasCanvasParent &&
			( directSelected || selectedName === 'core/buttons' )
		) {
			labels.push( __( 'Align' ), __( 'Align block' ) );
		}
		// Core shares Buttons layout controls with its inner Button blocks.
		// Canvas supplies controls with its own fill defaults for the grid item.
		if ( selectedName === 'core/buttons' ) {
			labels.push(
				__( 'Change items justification' ),
				__( 'Change vertical alignment' ),
				__( 'Align content vertically' )
			);
		}
		if ( directSelected && selectedName === 'core/image' ) {
			labels.push( __( 'Crop' ), __( 'Edit image' ) );
		}
		if ( selectedBlockName === 'core/image' && ! selectedImageHasSource ) {
			labels.push( __( 'Link' ) );
		}
		if ( [ 'core/image', 'core/video' ].includes( selectedBlockName ) ) {
			labels.push( __( 'Add caption' ), __( 'Remove caption' ) );
		}
		if ( selectedBlockName === 'core/video' ) {
			labels.push( __( 'Text tracks' ) );
		}
		if ( ! labels.length ) {
			return;
		}
		// Hide redundant block alignment, inherited Buttons, and image controls.
		// Images and videos at any depth omit caption controls. Duotone uses Core settings.
		const hidden = new Set();
		const update = () => {
			for ( const node of hidden ) {
				node.removeAttribute( 'data-canvas-hidden-control' );
			}
			hidden.clear();
			for ( const node of document.querySelectorAll(
				'.block-editor-block-toolbar button'
			) ) {
				if (
					labels.includes(
						node.getAttribute( 'aria-label' ) ||
							node.textContent.trim()
					) &&
					! node.closest( '[data-canvas-alignment-controls]' )
				) {
					node.setAttribute( 'data-canvas-hidden-control', '' );
					hidden.add( node );
				}
			}
		};
		const observer = new window.MutationObserver( update );
		observer.observe( document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: [ 'aria-label' ],
		} );
		update();
		return () => {
			observer.disconnect();
			for ( const node of hidden ) {
				node.removeAttribute( 'data-canvas-hidden-control' );
			}
		};
	}, [
		selectedName,
		directSelected,
		selectedBlockName,
		selectedImageHasSource,
		hasCanvasParent,
		editingId,
		selectedId,
	] );
}

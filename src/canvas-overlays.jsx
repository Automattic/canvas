import {
	alignedSiblingGuides,
	siblingGuideRectangles,
} from './sibling-guides.mjs';
import { useLayoutEffect, useRef, useState } from '@wordpress/element';
import { focusCanvasControl } from './canvas-keyboard';
import { gridMetrics } from './canvas-metrics.mjs';
import { nearestTouchHandle } from './touch-geometry.mjs';
import { canvasRows } from './canvas-geometry.mjs';

export const RESIZE_HANDLES = {
	n: 'top',
	ne: 'top right',
	e: 'right',
	se: 'bottom right',
	s: 'bottom',
	sw: 'bottom left',
	w: 'left',
	nw: 'top left',
};
export function resizeHandleAtTouch( event, fallback ) {
	if ( event.pointerType !== 'touch' ) {
		return fallback;
	}
	const selection = event.currentTarget.closest( '.canvas__selection' );
	const handles = [
		...selection.querySelectorAll( '[data-canvas-resize]' ),
	].map( ( node ) => {
		const rect = node.getBoundingClientRect();
		return {
			kind: node.dataset.canvasResize,
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		};
	} );
	return (
		nearestTouchHandle(
			{
				x: event.clientX,
				y: event.clientY,
			},
			handles
		) || fallback
	);
}

// Core's writing flow delegates native events before React's root listener.
// Handle layout controls at their DOM node so focusing a handle cannot select
// the enclosing canvas or turn arrow keys into text-navigation commands.
export function GridHandle( {
	onPointerDown,
	onKeyDown,
	onKeyUp,
	onBlur,
	...props
} ) {
	const ref = useRef( null );
	useLayoutEffect( () => {
		const node = ref.current;
		const stop = ( event ) => event.stopPropagation();
		const pointer = ( event ) => {
			event.stopPropagation();
			onPointerDown?.( event );
		};
		const key = ( event ) => onKeyDown?.( event );
		const keyUp = ( event ) => onKeyUp?.( event );
		const blur = ( event ) => onBlur?.( event );
		node.addEventListener( 'pointerdown', pointer );
		node.addEventListener( 'keydown', key );
		node.addEventListener( 'keyup', keyUp );
		node.addEventListener( 'blur', blur );
		node.addEventListener( 'focusin', stop );
		node.addEventListener( 'click', stop );
		return () => {
			node.removeEventListener( 'pointerdown', pointer );
			node.removeEventListener( 'keydown', key );
			node.removeEventListener( 'keyup', keyUp );
			node.removeEventListener( 'blur', blur );
			node.removeEventListener( 'focusin', stop );
			node.removeEventListener( 'click', stop );
		};
	}, [ onPointerDown, onKeyDown, onKeyUp, onBlur ] );
	useLayoutEffect( () => {
		if ( ref.current === ref.current.ownerDocument.activeElement ) {
			focusCanvasControl( ref.current );
		}
	} );
	return <button ref={ ref } { ...props } />;
}
export function GridGuidelines( { gridRef, active, showAlignment, preview } ) {
	const [ lines, setLines ] = useState( null );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		// Keep the last geometry mounted so fading out can reverse mid-transition.
		if ( ! active || ! grid ) {
			return;
		}
		const update = () => {
			const metrics = gridMetrics( grid );
			if ( ! metrics ) {
				return;
			}
			const bounds = grid.getBoundingClientRect();
			const scale = grid.offsetWidth / bounds.width || 1;
			// The item follows the pointer between cells. Highlight where releasing
			// it will land, so a guideline stays solid throughout that cell's snap range.
			const drop = preview?.dropPlacement?._rect;
			const item =
				! drop && preview?.id
					? grid
							.querySelector(
								'[data-canvas-item="' + preview.id + '"]'
							)
							?.getBoundingClientRect()
					: null;
			let rectangles;
			if ( preview?.dropPlacements ) {
				rectangles = Object.values( preview.dropPlacements ).map(
					( placement ) => placement._rect
				);
			} else if ( drop ) {
				rectangles = [ drop ];
			} else if ( item ) {
				rectangles = [
					{
						left: ( item.left - bounds.left ) * scale,
						top: ( item.top - bounds.top ) * scale,
						width: item.width * scale,
						height: item.height * scale,
					},
				];
			} else {
				rectangles = preview?.rectangles || [];
			}
			const css = grid.ownerDocument.defaultView.getComputedStyle( grid );
			// The layout observer retains committed rows during a height drag.
			// Extend the guides immediately using the preview's rows and cell pitch.
			const rowMetrics = preview?.rows
				? canvasRows(
						metrics.padding.top,
						metrics.padding.bottom,
						preview.rows,
						metrics.gap,
						metrics.rowHeight
					)
				: metrics;
			setLines( {
				...metrics,
				rows: rowMetrics.rows,
				before: rowMetrics.before,
				visibleRows: rowMetrics.coreRows,
				rectangles,
				width: parseFloat( css.width ),
				height: parseFloat( css.height ),
				wideLeft:
					parseFloat(
						css.getPropertyValue( '--canvas-layout-left' )
					) || 0,
				wideRight:
					parseFloat(
						css.getPropertyValue( '--canvas-layout-right' )
					) || 0,
			} );
		};
		update();
		const observer = new grid.ownerDocument.defaultView.ResizeObserver(
			update
		);
		observer.observe( grid );
		grid.addEventListener( 'canvas-layout-change', update );
		return () => {
			observer.disconnect();
			grid.removeEventListener( 'canvas-layout-change', update );
		};
	}, [ gridRef, active, preview ] );
	if ( ! lines ) {
		return null;
	}
	// Temporarily limit visible cells to wide width; keep the placement grid intact.
	const columns = lines.columns.filter(
		( column ) =>
			lines.hasWide === false ||
			( column.start >= lines.wideLeft - 0.001 &&
				column.end <= lines.width - lines.wideRight + 0.001 )
	);
	// Leave vertical padding clear so the cells show the content area's bounds.
	const cells = lines.rows
		.slice( lines.before, lines.before + lines.visibleRows )
		.flatMap( ( row, rowIndex ) =>
			columns.map( ( column, columnIndex ) => {
				if (
					column.end - column.start < 1 ||
					row.end - row.start < 1
				) {
					return null;
				}
				const width = Math.max( 0, column.end - column.start - 1 );
				const height = Math.max( 0, row.end - row.start - 1 );
				const radius = Math.min( 2, width / 2, height / 2 );
				// Ignore subpixel edge contact so a shared boundary never lights its neighbor.
				const covered =
					active &&
					preview &&
					lines.rectangles.some(
						( rect ) =>
							Math.min( column.end, rect.left + rect.width ) -
								Math.max( column.start, rect.left ) >
								0.5 &&
							Math.min( row.end, rect.top + rect.height ) -
								Math.max( row.start, rect.top ) >
								0.5
					);
				return (
					<rect
						key={ `${ rowIndex }-${ columnIndex }` }
						className={
							'canvas__grid-cell' +
							( covered ? ' is-covered' : '' )
						}
						x={ column.start + 0.5 }
						y={ row.start + 0.5 }
						width={ width }
						height={ height }
						rx={ radius }
					/>
				);
			} )
		);
	const guidelines = [
		{
			axis: 'x',
			position: lines.center ?? lines.width / 2,
			kind: 'center',
		},
		{
			axis: 'y',
			position: lines.height / 2,
			kind: 'center',
		},
		...( lines.hasWide === false
			? []
			: [
					{
						axis: 'x',
						position: lines.wideLeft,
						kind: 'wide',
					},
					{
						axis: 'x',
						position: lines.width - lines.wideRight,
						kind: 'wide',
					},
				] ),
	].filter( ( guideline, i, all ) => {
		const extent = guideline.axis === 'x' ? lines.width : lines.height;
		return (
			guideline.position >= 0 &&
			guideline.position <= extent &&
			! all
				.slice( 0, i )
				.some(
					( other ) =>
						other.axis === guideline.axis &&
						Math.abs( other.position - guideline.position ) < 1
				)
		);
	} );
	return (
		<>
			<div
				className={
					'canvas__guidelines' + ( active ? ' is-visible' : '' )
				}
				aria-hidden="true"
			>
				<svg className="canvas__grid-guidelines" focusable="false">
					<g className="canvas__grid-cells">{ cells }</g>
				</svg>
			</div>
			<div
				className={
					'canvas__guidelines canvas__guidelines--foreground' +
					( active && showAlignment ? ' is-visible' : '' )
				}
				aria-hidden="true"
			>
				<svg className="canvas__grid-guidelines" focusable="false">
					{ showAlignment &&
						preview &&
						! preview.rotating &&
						alignedSiblingGuides(
							siblingGuideRectangles( preview ),
							preview.siblings || []
						).map( ( { axis, position, from, to } ) => (
							<line
								key={ `sibling-${ axis }-${ position }` }
								className="canvas__guideline is-sibling is-aligned"
								x1={ axis === 'x' ? position : from }
								x2={ axis === 'x' ? position : to }
								y1={ axis === 'y' ? position : from }
								y2={ axis === 'y' ? position : to }
							/>
						) ) }
					{ showAlignment &&
						preview &&
						guidelines.map( ( { axis, position, kind } ) => {
							const meetsGuide = ( rect, tolerance ) => {
								const start =
									axis === 'x' ? rect.left : rect.top;
								const size =
									axis === 'x' ? rect.width : rect.height;
								return (
									kind === 'center' ? [ 0, 0.5, 1 ] : [ 0, 1 ]
								).some(
									( edge ) =>
										Math.abs(
											start + size * edge - position
										) < tolerance
								);
							};
							// Only the committed destination can light a guide. Pointer proximity
							// alone must never promise an alignment that snapping will discard.
							const highlighted = lines.rectangles.some(
								( rect ) => meetsGuide( rect, 0.1 )
							);
							return (
								<line
									key={ axis + '-' + position }
									className={
										'canvas__guideline is-' +
										kind +
										( highlighted ? ' is-aligned' : '' )
									}
									x1={ axis === 'x' ? position : 0 }
									x2={ axis === 'x' ? position : lines.width }
									y1={ axis === 'y' ? position : 0 }
									y2={
										axis === 'y' ? position : lines.height
									}
								/>
							);
						} ) }
				</svg>
			</div>
		</>
	);
}

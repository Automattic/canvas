import {
	alignedSiblingGuides,
	siblingGuideRectangles,
} from './sibling-guides.mjs';
import { useLayoutEffect, useRef, useState } from '@wordpress/element';
import { focusCanvasControl } from './canvas-keyboard';
import { gridMetrics } from './canvas-metrics.mjs';
import { nearestTouchHandle } from './touch-geometry.mjs';
import { canvasRows } from './canvas-geometry.mjs';
import { guideColors } from './guide-colors.mjs';

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
	const handlers = useRef( { onPointerDown, onKeyDown, onKeyUp, onBlur } );
	useLayoutEffect( () => {
		handlers.current = { onPointerDown, onKeyDown, onKeyUp, onBlur };
	}, [ onPointerDown, onKeyDown, onKeyUp, onBlur ] );
	useLayoutEffect( () => {
		const node = ref.current;
		const stop = ( event ) => event.stopPropagation();
		const pointer = ( event ) => {
			event.stopPropagation();
			handlers.current.onPointerDown?.( event );
		};
		const key = ( event ) => handlers.current.onKeyDown?.( event );
		const keyUp = ( event ) => handlers.current.onKeyUp?.( event );
		const blur = ( event ) => handlers.current.onBlur?.( event );
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
	}, [] );
	useLayoutEffect( () => {
		if ( ref.current === ref.current.ownerDocument.activeElement ) {
			focusCanvasControl( ref.current );
		}
	} );
	return <button ref={ ref } { ...props } />;
}
export function GridGuidelines( {
	gridRef,
	active,
	showAlignment,
	preview,
	cellsEnabled = true,
} ) {
	const [ lines, setLines ] = useState( null );
	const previewRef = useRef( preview );
	const updateRef = useRef( null );
	useLayoutEffect( () => {
		previewRef.current = preview;
		updateRef.current?.();
	}, [ preview ] );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		// Keep the last geometry mounted so fading out can reverse mid-transition.
		if ( ! active || ! grid ) {
			return;
		}
		let colors = guideColors( grid );
		const update = () => {
			const currentPreview = previewRef.current;
			const metrics = gridMetrics( grid );
			if ( ! metrics ) {
				return;
			}
			const bounds = grid.getBoundingClientRect();
			const scale = grid.offsetWidth / bounds.width || 1;
			// The item follows the pointer between cells. Highlight where releasing
			// it will land, so a guideline stays solid throughout that cell's snap range.
			const drop = currentPreview?.dropPlacement?._rect;
			const item =
				! drop && currentPreview?.id
					? grid
							.querySelector(
								'[data-canvas-item="' + currentPreview.id + '"]'
							)
							?.getBoundingClientRect()
					: null;
			let rectangles;
			if ( currentPreview?.dropPlacements ) {
				rectangles = Object.values( currentPreview.dropPlacements ).map(
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
				rectangles = currentPreview?.rectangles || [];
			}
			const css = grid.ownerDocument.defaultView.getComputedStyle( grid );
			// The layout observer retains committed rows during a height drag.
			// Extend the guides immediately using the preview's rows and cell pitch.
			const rowMetrics = currentPreview?.rows
				? canvasRows(
						metrics.padding.top,
						metrics.padding.bottom,
						currentPreview.rows,
						metrics.gap,
						metrics.rowHeight
					)
				: metrics;
			setLines( {
				...metrics,
				...colors,
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
		updateRef.current = update;
		update();
		const observer = new grid.ownerDocument.defaultView.ResizeObserver(
			update
		);
		observer.observe( grid );
		const colorObserver =
			new grid.ownerDocument.defaultView.MutationObserver( () => {
				colors = guideColors( grid );
				update();
			} );
		for ( let node = grid; node; node = node.parentElement ) {
			colorObserver.observe( node, {
				attributes: true,
				attributeFilter: [ 'class', 'style' ],
			} );
		}
		grid.addEventListener( 'canvas-layout-change', update );
		return () => {
			updateRef.current = null;
			observer.disconnect();
			colorObserver.disconnect();
			grid.removeEventListener( 'canvas-layout-change', update );
		};
	}, [ gridRef, active ] );
	if ( ! lines ) {
		return null;
	}
	// Leave vertical padding clear so the cells show the content area's bounds.
	const cells = lines.rows
		.slice( lines.before, lines.before + lines.visibleRows )
		.flatMap( ( row, rowIndex ) =>
			lines.columns.map( ( column, columnIndex ) => {
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
			position: cellsEnabled
				? ( lines.center ?? lines.width / 2 )
				: lines.width / 2,
			kind: 'center',
		},
		{
			axis: 'y',
			position: lines.height / 2,
			kind: 'center',
		},
		...( ! cellsEnabled || lines.hasWide === false
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
	// Share the destination alignment check between guide strokes and badges.
	const isHighlighted = ( { axis, position, kind } ) =>
		lines.rectangles.some( ( rect ) => {
			const start = axis === 'x' ? rect.left : rect.top;
			const size = axis === 'x' ? rect.width : rect.height;
			return ( kind === 'center' ? [ 0, 0.5, 1 ] : [ 0, 1 ] ).some(
				( edge ) => Math.abs( start + size * edge - position ) < 0.1
			);
		} );
	// Count complete cells outside the destination, including a multi-selection's
	// outer bounds. Partial cells are occupied, just as in the grid highlight.
	const spacing = [];
	if (
		cellsEnabled &&
		preview &&
		! preview.rotating &&
		lines.rectangles.length
	) {
		const left = Math.min(
			...lines.rectangles.map( ( rect ) => rect.left )
		);
		const right = Math.max(
			...lines.rectangles.map( ( rect ) => rect.left + rect.width )
		);
		const top = Math.min( ...lines.rectangles.map( ( rect ) => rect.top ) );
		const bottom = Math.max(
			...lines.rectangles.map( ( rect ) => rect.top + rect.height )
		);
		const rows = lines.rows.slice(
			lines.before,
			lines.before + lines.visibleRows
		);
		for ( const { axis, position, kind } of guidelines ) {
			if ( ! isHighlighted( { axis, position, kind } ) ) {
				continue;
			}
			const vertical = axis === 'x';
			const tracks = vertical ? rows : lines.columns;
			const start = vertical ? top : left;
			const end = vertical ? bottom : right;
			const extent = vertical ? lines.height : lines.width;
			for ( const before of [ true, false ] ) {
				const space = before ? start : extent - end;
				if ( space < 32 ) {
					continue;
				}
				const count = tracks.filter( ( track ) =>
					before ? track.end <= start + 0.5 : track.start >= end - 0.5
				).length;
				if ( count === 0 ) {
					continue;
				}
				const middle = before ? start / 2 : ( end + extent ) / 2;
				spacing.push(
					<span
						key={ `${ axis }-${ position }-${ before }` }
						className="canvas__spacing-count"
						style={ {
							left: vertical ? position : middle,
							top: vertical ? middle : position,
							'--canvas-spacing-background': lines.background,
							'--canvas-spacing-foreground': lines.foreground,
						} }
					>
						{ count }
					</span>
				);
			}
		}
	}
	return (
		<>
			<div
				className={
					'canvas__guidelines' +
					( active && cellsEnabled ? ' is-visible' : '' )
				}
				aria-hidden="true"
				style={ { color: lines.foreground } }
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
				style={ { color: lines.foreground } }
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
							const highlighted = isHighlighted( {
								axis,
								position,
								kind,
							} );
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
				{ showAlignment && spacing }
			</div>
		</>
	);
}

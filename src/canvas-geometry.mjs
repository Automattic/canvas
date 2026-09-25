import {
	COLUMNS,
	MAX_ROWS,
	ROW_HEIGHT,
	rowPitch,
	closestTrack,
	integer,
	projectPlacement,
	tracks,
} from './placement.mjs';
import { columnTracks } from './columns.mjs';
import {
	freeFrameFromRect,
	freeFrameBounds,
	resizeAspectRect,
	resizeRect,
} from './aspect-ratio.mjs';
import { transformTouchRect } from './touch-geometry.mjs';
const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );
const unique = ( values ) =>
	[ ...new Set( values.map( ( n ) => Number( n.toFixed( 5 ) ) ) ) ].sort(
		( a, b ) => a - b
	);
const lineAt = ( lines, value ) =>
	lines.reduce(
		( best, n, i ) =>
			Math.abs( n - value ) < Math.abs( lines[ best ] - value )
				? i
				: best,
		0
	) + 1;

// Ordinary placements keep their content-grid coordinates. Continue that same
// cell pitch out to both canvas edges, clipping only the outermost cells.
export function canvasColumns(
	width,
	padding,
	wideStart,
	wideEnd,
	gap,
	mode,
	count = COLUMNS[ mode ],
	gridPadding = padding
) {
	const contentColumns = columnTracks(
		Math.max( 1, width - gridPadding.left - gridPadding.right ),
		gap,
		count
	).map( ( { start, end } ) => ( {
		start: start + gridPadding.left,
		end: end + gridPadding.left,
	} ) );
	const first = contentColumns[ 0 ],
		last = contentColumns.at( -1 );
	const cell = first.end - first.start;
	const columnPitch =
		count > 1 ? contentColumns[ 1 ].start - first.start : cell + gap;
	const gutter = columnPitch - cell;
	const columnOffset = Math.ceil(
		Math.max( 0, first.start - gutter - 1e-7 ) / columnPitch
	);
	const after = Math.ceil(
		Math.max( 0, width - last.end - gutter - 1e-7 ) / columnPitch
	);
	const columns = [
		...Array.from(
			{
				length: columnOffset,
			},
			( _, i ) => ( {
				start: Math.max(
					0,
					first.start - ( columnOffset - i ) * columnPitch
				),
				end: Math.max(
					0,
					first.start - ( columnOffset - i ) * columnPitch + cell
				),
			} )
		),
		...contentColumns,
		...Array.from(
			{
				length: after,
			},
			( _, i ) => ( {
				start: Math.min(
					width,
					last.end + columnPitch - cell + i * columnPitch
				),
				end: Math.min( width, last.end + ( i + 1 ) * columnPitch ),
			} )
		),
	];
	const center = ( first.start + last.end ) / 2;
	const lines = unique( [
		0,
		width,
		center,
		padding.left,
		width - padding.right,
		wideStart,
		wideEnd,
		...columns.flatMap( ( { start, end } ) => [ start, end ] ),
	] );
	return {
		columns,
		contentColumns,
		columnOffset,
		columnPitch,
		columnGap: gap,
		center,
		gridColumns: count,
		wideStart,
		wideEnd,
		canvas: true,
		width,
		padding,
		lines,
		template: lines
			.slice( 1 )
			.map(
				( end, i ) =>
					`minmax(0, ${ ( end - lines[ i ] ).toFixed( 5 ) }fr)`
			)
			.join( ' ' ),
	};
}

// Content never changes the cell pitch. Outer tracks consume exactly the
// padding, including a clipped cell when an edge falls in a gap.
export function canvasRows( top, bottom, count, gap, rowHeight = ROW_HEIGHT ) {
	const pitch = rowHeight + gap;
	const before = Math.min( 500, Math.ceil( top / pitch ) );
	const after = Math.min( 500, Math.ceil( bottom / pitch ) );
	const core = tracks( Array( count ).fill( rowHeight ), gap ).map(
		( { start, end } ) => ( {
			start: top + start,
			end: top + end,
		} )
	);
	const contentEnd = core.at( -1 ).end;
	const rows = [
		...Array.from(
			{
				length: before,
			},
			( _, i ) => ( {
				start: Math.max( 0, top - ( before - i ) * pitch ),
				end: Math.max( 0, top - ( before - i ) * pitch + rowHeight ),
			} )
		),
		...core,
		...Array.from(
			{
				length: after,
			},
			( _, i ) => ( {
				start: contentEnd + Math.min( bottom, gap + i * pitch ),
				end: contentEnd + Math.min( bottom, ( i + 1 ) * pitch ),
			} )
		),
	];
	const template = rows
		.flatMap( ( row, i ) => [
			...( i
				? [ `${ Math.max( 0, row.start - rows[ i - 1 ].end ) }px` ]
				: [] ),
			`${ row.end - row.start }px`,
		] )
		.join( ' ' );
	return {
		rows,
		rowHeight,
		before,
		after,
		coreRows: count,
		height: contentEnd + bottom,
		contentEnd,
		rowTemplate: template,
	};
}
export function savedCanvasPlacement( value ) {
	const base = value._base || value;
	return {
		...Object.fromEntries(
			Object.entries( base ).filter(
				( [ key ] ) => ! key.startsWith( '_' )
			)
		),
		anchors: Object.fromEntries(
			[ 'left', 'right' ]
				.filter( ( key ) => base.anchors?.[ key ] !== undefined )
				.map( ( key ) => [ key, base.anchors[ key ] ] )
		),
	};
}
export function occupiedRows( value ) {
	// A filling image follows the section; it cannot set its minimum height.
	if ( ( value._base || value ).fillHeight ) {
		return 1;
	}
	// A resolved free frame is measured geometry, so its rows follow the frame.
	if ( value.free && value._rect && value._canvas ) {
		return Math.max(
			1,
			Math.ceil(
				( value._rect.top +
					value._rect.height -
					value._canvas.padding.top -
					( value._rect.top + value._rect.height <=
					value._canvas.height + 0.01
						? value._canvas.padding.bottom
						: 0 ) +
					value._canvas.gap -
					0.01 ) /
					rowPitch( value._canvas )
			)
		);
	}

	const base = savedCanvasPlacement( value );
	return integer( base.row + base.rowSpan - 1, 1, 1, MAX_ROWS );
}
function horizontalEdge( anchor, side, geometry ) {
	const { padding, width, columns } = geometry;
	if ( anchor === 'canvas' ) {
		return side === 'start' ? 0 : width;
	}
	if ( anchor === 'padding' ) {
		return side === 'start' ? padding.left : width - padding.right;
	}
	if ( anchor === 'wide' ) {
		return side === 'start' ? geometry.wideStart : geometry.wideEnd;
	}
	if ( anchor === 'wide-start' ) {
		return geometry.wideStart;
	}
	if ( anchor === 'wide-end' ) {
		return geometry.wideEnd;
	}
	if ( anchor === 'center' ) {
		return geometry.center ?? width / 2;
	}
	return columns[
		clamp(
			geometry.columnOffset + anchor - ( side === 'end' ? 1 : 0 ),
			0,
			columns.length - 1
		)
	][ side ];
}
function rowIndexAtBoundary( boundary, side, geometry, fallback ) {
	const { before, coreRows, rows } = geometry;
	if ( boundary === 'canvas' ) {
		return side === 'start' ? 0 : rows.length - 1;
	}
	if ( boundary === 'padding' ) {
		return side === 'start' ? before : before + coreRows - 1;
	}
	if ( typeof boundary === 'number' ) {
		return clamp(
			before + boundary - ( side === 'end' ? 1 : 0 ),
			0,
			rows.length - 1
		);
	}
	return clamp( before + fallback, 0, rows.length - 1 );
}
export function mapCanvasPlacement(
	value,
	mode,
	geometry,
	minimum = {
		columnSpan: 1,
		rowSpan: 1,
	},
	resolveHorizontal = true,
	resolveFillHeight = false
) {
	const base = projectPlacement(
		savedCanvasPlacement( value ),
		mode,
		mode,
		minimum,
		geometry.gridColumns
	);
	const free = base.free;
	// Rendering opts in. Gesture math remains unconstrained so either edge can
	// leave the canvas before the committed edit releases full height.
	const fillHeight = resolveFillHeight && base.fillHeight;
	const freeBounds = freeFrameBounds( geometry );
	const rect = free
		? {
				left: freeBounds.left + free.x * freeBounds.width,
				top: Math.max(
					0,
					geometry.padding.top + free.y * rowPitch( geometry )
				),
				width: free.width * freeBounds.width,
				height: ( free.width * freeBounds.width ) / free.ratio,
			}
		: null;
	if (
		rect &&
		resolveHorizontal &&
		[ 'left', 'right' ].some(
			( side ) => typeof base.anchors[ side ] === 'string'
		)
	) {
		const left = base.anchors.left;
		const right = base.anchors.right;
		if ( left !== undefined && right !== undefined ) {
			rect.left = horizontalEdge( left, 'start', geometry );
			rect.width = Math.max(
				1,
				horizontalEdge( right, 'end', geometry ) - rect.left
			);
		} else if ( left !== undefined ) {
			rect.left = horizontalEdge( left, 'start', geometry );
		} else {
			rect.left = horizontalEdge( right, 'end', geometry ) - rect.width;
		}
		rect.height = rect.width / free.ratio;
	}
	if ( rect && fillHeight ) {
		rect.top = 0;
		rect.height = geometry.height;
	}
	let needed;
	if ( fillHeight ) {
		needed = geometry.coreRows;
	} else if ( rect ) {
		needed = Math.max(
			1,
			Math.ceil(
				( rect.top +
					rect.height -
					( rect.top + rect.height <= geometry.height + 0.01
						? geometry.padding.bottom
						: 0 ) -
					geometry.padding.top +
					geometry.gap -
					0.01 ) /
					rowPitch( geometry )
			)
		);
	} else {
		needed = occupiedRows( { ...base, fillHeight: undefined } );
	}
	if ( needed > geometry.coreRows ) {
		geometry = {
			...geometry,
			...canvasRows(
				geometry.padding.top,
				geometry.padding.bottom,
				needed,
				geometry.gap,
				geometry.rowHeight
			),
		};
	}
	if ( rect ) {
		const column = closestTrack( rect.left, geometry.columns );
		const endColumn = Math.max(
			column,
			closestTrack( rect.left + rect.width, geometry.columns, 'end' )
		);
		const trackIndex = ( position, edge ) => {
			const exact = geometry.rows.findIndex(
				( track ) => Math.abs( track[ edge ] - position ) < 0.0001
			);
			return exact >= 0
				? exact
				: closestTrack( position, geometry.rows, edge ) - 1;
		};
		const top = trackIndex( rect.top, 'start' );
		const bottom = Math.max(
			top,
			trackIndex( rect.top + rect.height, 'end' )
		);
		const leftLine = Math.min(
			geometry.lines.length - 1,
			lineAt( geometry.lines, rect.left )
		);
		return {
			...base,
			column,
			columnSpan: endColumn - column + 1,
			columns: geometry.columns.length,
			row: top + 1,
			rowSpan: bottom - top + 1,
			_base: base,
			_canvas: geometry,
			_rect: rect,
			_grid: {
				left: leftLine,
				right: Math.max(
					leftLine + 1,
					lineAt( geometry.lines, rect.left + rect.width )
				),
				top: top * 2 + 1,
				bottom: bottom * 2 + 2,
			},
		};
	}
	const leftAnchor = base.anchors?.left ?? base.column - 1;
	const rightAnchor =
		base.anchors?.right ?? base.column + base.columnSpan - 1;
	let left = horizontalEdge( leftAnchor, 'start', geometry );
	let right = horizontalEdge( rightAnchor, 'end', geometry );
	// When a narrower canvas loses outer cells, bring the whole numeric span
	// inside together. Clamping its edges separately would collapse it to one
	// cell. Keep the authored anchors so widening restores its exact position.
	if (
		typeof leftAnchor === 'number' &&
		typeof rightAnchor === 'number' &&
		( leftAnchor + geometry.columnOffset < 0 ||
			rightAnchor + geometry.columnOffset > geometry.columns.length )
	) {
		const span = clamp(
			rightAnchor - leftAnchor,
			minimum.columnSpan,
			geometry.columns.length
		);
		const first = clamp(
			leftAnchor + geometry.columnOffset,
			0,
			geometry.columns.length - span
		);
		left = geometry.columns[ first ].start;
		right = geometry.columns[ first + span - 1 ].end;
	}
	let column = closestTrack( left, geometry.columns ) - 1;
	let endColumn = closestTrack( right, geometry.columns, 'end' ) - 1;
	if ( endColumn - column + 1 < minimum.columnSpan || right <= left ) {
		column = Math.min(
			column,
			Math.max( 0, geometry.columns.length - minimum.columnSpan )
		);
		endColumn = Math.min(
			geometry.columns.length - 1,
			column + minimum.columnSpan - 1
		);
		left = geometry.columns[ column ].start;
		right = geometry.columns[ endColumn ].end;
	}
	let top = rowIndexAtBoundary(
		base.row - 1,
		'start',
		geometry,
		base.row - 1
	);
	let bottom = rowIndexAtBoundary(
		base.row + base.rowSpan - 1,
		'end',
		geometry,
		base.row + base.rowSpan - 2
	);
	if ( fillHeight ) {
		top = 0;
		bottom = geometry.rows.length - 1;
	}
	if ( bottom - top + 1 < minimum.rowSpan ) {
		top = Math.min(
			top,
			Math.max( 0, geometry.rows.length - minimum.rowSpan )
		);
		bottom = Math.min(
			geometry.rows.length - 1,
			top + minimum.rowSpan - 1
		);
	}
	return {
		...base,
		column: column + 1,
		columnSpan: endColumn - column + 1,
		columns: geometry.columns.length,
		row: top + 1,
		rowSpan: bottom - top + 1,
		_base: base,
		_canvas: geometry,
		_rect: {
			left,
			top: geometry.rows[ top ].start,
			width: right - left,
			height: geometry.rows[ bottom ].end - geometry.rows[ top ].start,
		},
		_grid: {
			left: lineAt( geometry.lines, left ),
			right: lineAt( geometry.lines, right ),
			top: top * 2 + 1,
			bottom: bottom * 2 + 2,
		},
	};
}
// Capture padding cells as precise frames before adding rows can change their size.
export function mapCanvasRowsPlacement(
	base,
	mode,
	geometry,
	minimum,
	edges = {}
) {
	const top = base.row - 1;
	const bottom = base.row + base.rowSpan - 1;
	const first =
		geometry.rows[ rowIndexAtBoundary( top, 'start', geometry, top ) ];
	const last =
		geometry.rows[
			rowIndexAtBoundary( bottom, 'end', geometry, bottom - 1 )
		];
	if (
		! base.free &&
		( top < 0 ||
			bottom > geometry.coreRows ||
			( edges.top !== undefined && edges.top !== first.start ) ||
			( edges.bottom !== undefined && edges.bottom !== last.end ) )
	) {
		const horizontal = mapCanvasPlacement(
			{
				...base,
				row: 1,
				rowSpan: 1,
				anchors: {
					left: base.anchors?.left,
					right: base.anchors?.right,
				},
			},
			mode,
			geometry,
			minimum
		);
		const rect = {
			...horizontal._rect,
			top: edges.top ?? first.start,
			height: Math.max(
				0.001,
				( edges.bottom ?? last.end ) - ( edges.top ?? first.start )
			),
		};
		base = {
			...base,
			anchors: {
				...base.anchors,
				left: base.anchors?.left ?? base.column - 1,
				right: base.anchors?.right ?? base.column + base.columnSpan - 1,
			},
			free: freeFrameFromRect( rect, geometry ),
		};
	}
	return mapCanvasPlacement( base, mode, geometry, minimum );
}
// Numeric horizontal anchors are relative to the content grid, not the number
// of currently visible outer cells, so resizing the viewport cannot shift them.
function columnAnchor( index, side, g ) {
	return index - g.columnOffset + ( side === 'end' ? 1 : 0 );
}
function nearestGuideline( value, side, g, axis, tolerance ) {
	const start = side === 'start';
	const targets =
		axis === 'x'
			? [
					[ 'center', g.center ?? g.width / 2 ],
					...( g.hasWide === false
						? []
						: [
								[ 'wide', start ? g.wideStart : g.wideEnd ],
								[
									start ? 'wide-end' : 'wide-start',
									start ? g.wideEnd : g.wideStart,
								],
							] ),
					[
						'padding',
						start ? g.padding.left : g.width - g.padding.right,
					],
					[ 'canvas', start ? 0 : g.width ],
				]
			: [
					[ 'canvas', start ? 0 : g.height ],
					[ 'padding', start ? g.padding.top : g.contentEnd ],
				];
	// Alignment guides cannot pull an edge into a gutter. Canvas and padding
	// remain explicit outer anchors; all guide snaps must meet a real cell.
	return targets
		.filter(
			( [ kind, position ] ) =>
				Math.abs( position - value ) <= tolerance + 1e-7 &&
				( axis !== 'x' ||
					kind === 'canvas' ||
					kind === 'padding' ||
					g.columns.some(
						( cell ) => Math.abs( cell[ side ] - position ) < 0.0001
					) )
		)
		.sort(
			( a, b ) => Math.abs( a[ 1 ] - value ) - Math.abs( b[ 1 ] - value )
		)[ 0 ];
}
function centeredColumns( g, width, minimum ) {
	return centeredTracks( g.columns, g.center ?? g.width / 2, width, minimum );
}
function centeredTracks( axisTracks, center, size, minimum ) {
	let best;
	for ( let a = 0; a < axisTracks.length; a++ ) {
		for ( let b = a + minimum - 1; b < axisTracks.length; b++ ) {
			const left = axisTracks[ a ].start,
				right = axisTracks[ b ].end;
			if ( Math.abs( ( left + right ) / 2 - center ) > 0.0001 ) {
				continue;
			}
			const distance = Math.abs( right - left - size );
			// Outer pairs are visited first, so an equal-distance choice keeps the
			// larger span instead of clipping content to the smaller one.
			if ( ! best || distance < best.distance - 0.0001 ) {
				best = {
					left: a,
					right: b + 1,
					distance,
				};
			}
		}
	}
	return best;
}

// Center a fixed row span at the closest valid cell position. Earlier rows win ties.
function centeredRows( g, span, center = g.height / 2 ) {
	let best = 0,
		distance = Infinity;
	for ( let top = 0; top <= g.rows.length - span; top++ ) {
		const error = Math.abs(
			( g.rows[ top ].start + g.rows[ top + span - 1 ].end ) / 2 - center
		);
		if ( error < distance - 0.0001 ) {
			best = top;
			distance = error;
		}
	}
	return { top: best, bottom: best + span - 1 };
}

export function centerCanvasPlacement(
	value,
	mode,
	axis = 'both',
	minimum = { columnSpan: 1, rowSpan: 1 }
) {
	if ( value.free ) {
		value = snapCanvasPlacement( value, mode, minimum, undefined, 0 );
	}
	if ( axis !== 'horizontal' ) {
		const start =
			axis === 'both'
				? centerCanvasPlacement( value, mode, 'horizontal', minimum )
				: snapCanvasPlacement( value, mode, minimum, undefined, 0 );
		const g = start._canvas;
		const span = clamp( start.rowSpan, minimum.rowSpan, g.rows.length );
		const cells = centeredRows( g, span );
		const base = savedCanvasPlacement( start );
		delete base.free;
		base.row = clamp( cells.top - g.before + 1, 1, g.coreRows );
		base.rowSpan = Math.max(
			minimum.rowSpan,
			Math.min( cells.bottom - g.before + 1, g.coreRows ) - base.row + 1
		);
		return mapCanvasRowsPlacement( base, mode, g, minimum, {
			top: g.rows[ cells.top ].start,
			bottom: g.rows[ cells.bottom ].end,
		} );
	}

	const { _rect: rect, _canvas: g } = value;
	const base = savedCanvasPlacement( value );
	delete base.free;
	const columns =
		axis !== 'vertical' &&
		centeredColumns(
			g,
			rect.width,
			Math.min( minimum.columnSpan, g.columns.length )
		);
	if ( columns ) {
		base.anchors.left = columnAnchor( columns.left, 'start', g );
		base.anchors.right = columnAnchor( columns.right - 1, 'end', g );
		base.column = columns.left - g.columnOffset + 1;
		base.columnSpan = columns.right - columns.left;
	}
	const centered = mapCanvasRowsPlacement( base, mode, g, minimum );
	// A translated child or an existing precise frame can have an off-grid
	// untouched axis. Keep it in place while centering only the requested axis.
	const unchanged = [ 'top', 'height' ];
	if (
		unchanged.some(
			( key ) => Math.abs( centered._rect[ key ] - rect[ key ] ) > 0.0001
		)
	) {
		const next = {
			...centered._rect,
			...Object.fromEntries(
				unchanged.map( ( key ) => [ key, rect[ key ] ] )
			),
		};
		return mapCanvasPlacement(
			{
				...base,
				free: freeFrameFromRect( next, g ),
			},
			mode,
			g,
			minimum
		);
	}
	return centered;
}

// Commit the same cell or semantic guide destination shown in the preview.
export function snapCanvasPlacement(
	value,
	mode,
	minimum = {
		columnSpan: 1,
		rowSpan: 1,
	},
	span,
	tolerance = 6,
	resizeCenter
) {
	const rect = value._rect;
	// Smooth previews may grow by a row before an edge is released. Snap near
	// the original boundary before treating that overshoot as a taller section.
	const g =
		value._snapCanvas &&
		rect.top + rect.height <= value._snapCanvas.height + tolerance
			? value._snapCanvas
			: value._canvas;
	if ( value.free && ! value._snapCanvas && ! span ) {
		const cells = mapCanvasRowsPlacement(
			{ ...savedCanvasPlacement( value ), free: undefined },
			mode,
			g,
			minimum,
			g.rows.some(
				( track ) => Math.abs( track.start - rect.top ) < 0.0001
			) &&
				g.rows.some(
					( track ) =>
						Math.abs( track.end - rect.top - rect.height ) < 0.0001
				)
				? { top: rect.top, bottom: rect.top + rect.height }
				: {}
		);
		if (
			Object.keys( rect ).every(
				( key ) => Math.abs( rect[ key ] - cells._rect[ key ] ) < 0.0001
			)
		) {
			return cells;
		}
	}
	if ( ! value.free ) {
		const mapped = mapCanvasPlacement(
			savedCanvasPlacement( value ),
			mode,
			g,
			minimum
		);
		if (
			Object.keys( rect ).every(
				( key ) =>
					Math.abs( rect[ key ] - mapped._rect[ key ] ) < 0.0001
			)
		) {
			return mapped;
		}
	}
	const base = {
		...savedCanvasPlacement( value ),
	};
	delete base.free;
	// Moves retain their cell span except when exact centering needs the nearest
	// symmetric span. Resizing snaps each edge separately.
	const columns = span
		? clamp( span.columnSpan, minimum.columnSpan, g.columns.length )
		: minimum.columnSpan;
	const rows = span
		? clamp( span.rowSpan, minimum.rowSpan, g.rows.length )
		: minimum.rowSpan;
	const left = clamp(
		closestTrack( rect.left, g.columns ) - 1,
		0,
		g.columns.length - columns
	);
	const right = span
		? left + columns - 1
		: clamp(
				closestTrack( rect.left + rect.width, g.columns, 'end' ) - 1,
				left + columns - 1,
				g.columns.length - 1
			);
	let top = clamp(
		closestTrack( rect.top, g.rows ) - 1,
		0,
		g.rows.length - rows
	);
	let bottom = span
		? top + rows - 1
		: clamp(
				closestTrack( rect.top + rect.height, g.rows, 'end' ) - 1,
				top + rows - 1,
				g.rows.length - 1
			);
	base.anchors.left =
		rect.left <= 0 ? 'canvas' : columnAnchor( left, 'start', g );
	base.anchors.right =
		rect.left + rect.width >= g.width
			? 'canvas'
			: columnAnchor( right, 'end', g );
	let leftGuide =
		Math.abs( rect.left ) < 0.0001
			? [ 'canvas', 0 ]
			: nearestGuideline( rect.left, 'start', g, 'x', tolerance );
	let rightGuide =
		Math.abs( rect.left + rect.width - g.width ) < 0.0001
			? [ 'canvas', g.width ]
			: nearestGuideline(
					rect.left + rect.width,
					'end',
					g,
					'x',
					tolerance
				);
	// A move keeps its cell span. Competing guides must not turn it into a resize.
	if ( span && leftGuide && rightGuide ) {
		if (
			Math.abs( leftGuide[ 1 ] - rect.left ) <=
			Math.abs( rightGuide[ 1 ] - rect.left - rect.width )
		) {
			rightGuide = null;
		} else {
			leftGuide = null;
		}
	}
	const centered =
		Math.abs( rect.left + rect.width / 2 - ( g.center ?? g.width / 2 ) ) <=
		tolerance;
	if ( span && ( leftGuide || rightGuide || centered ) ) {
		// Settle the nearer horizontal edge while preserving the moved span.
		const a = clamp(
			closestTrack( leftGuide?.[ 1 ] ?? rect.left, g.columns ) - 1,
			0,
			g.columns.length - columns
		);
		const b = clamp(
			closestTrack(
				rightGuide?.[ 1 ] ?? rect.left + rect.width,
				g.columns,
				'end'
			) - 1,
			columns - 1,
			g.columns.length - 1
		);
		base.anchors.left = leftGuide
			? leftGuide[ 0 ]
			: columnAnchor( rightGuide ? b - columns + 1 : a, 'start', g );
		base.anchors.right = rightGuide
			? rightGuide[ 0 ]
			: columnAnchor( a + columns - 1, 'end', g );
	} else {
		if ( leftGuide ) {
			base.anchors.left = leftGuide[ 0 ];
		}
		if ( rightGuide ) {
			base.anchors.right = rightGuide[ 0 ];
		}
	}
	if ( span && centered ) {
		const cells = centeredColumns( g, rect.width, minimum.columnSpan );
		if ( cells ) {
			base.anchors.left =
				g.hasWide !== false &&
				Math.abs( g.columns[ cells.left ].start - g.wideStart ) < 0.0001
					? 'wide'
					: columnAnchor( cells.left, 'start', g );
			base.anchors.right =
				g.hasWide !== false &&
				Math.abs( g.columns[ cells.right - 1 ].end - g.wideEnd ) <
					0.0001
					? 'wide'
					: columnAnchor( cells.right - 1, 'end', g );
		}
	}
	if (
		span &&
		Math.abs( rect.left - span._rect.left ) < 0.0001 &&
		Math.abs( rect.width - span._rect.width ) < 0.0001
	) {
		base.anchors.left =
			savedCanvasPlacement( span ).anchors?.left ??
			columnAnchor( span.column - 1, 'start', g );
		base.anchors.right =
			savedCanvasPlacement( span ).anchors?.right ??
			columnAnchor( span.column + span.columnSpan - 2, 'end', g );
	}
	let topGuide = nearestGuideline( rect.top, 'start', g, 'y', tolerance );
	let bottomGuide = nearestGuideline(
		rect.top + rect.height,
		'end',
		g,
		'y',
		tolerance
	);
	if ( span && topGuide && bottomGuide ) {
		if (
			Math.abs( topGuide[ 1 ] - rect.top ) <=
			Math.abs( bottomGuide[ 1 ] - rect.top - rect.height )
		) {
			bottomGuide = null;
		} else {
			topGuide = null;
		}
	}
	if ( topGuide ) {
		top = clamp(
			rowIndexAtBoundary( topGuide[ 0 ], 'start', g, top ),
			0,
			g.rows.length - rows
		);
		if ( span ) {
			bottom = top + rows - 1;
		}
	}
	if ( bottomGuide ) {
		bottom = clamp(
			rowIndexAtBoundary( bottomGuide[ 0 ], 'end', g, bottom ),
			( span ? 0 : top ) + rows - 1,
			g.rows.length - 1
		);
		if ( span ) {
			top = bottom - rows + 1;
		}
	}
	if (
		! topGuide &&
		! bottomGuide &&
		Math.abs( rect.top + rect.height / 2 - g.height / 2 ) <= tolerance
	) {
		const symmetric = centeredTracks(
			g.rows,
			g.height / 2,
			rect.height,
			minimum.rowSpan
		);
		const cells = centeredRows( g, bottom - top + 1 );
		// Match horizontal centering without stretching across asymmetric padding
		// just to reach a distant symmetric pair of outer cells.
		const exact = symmetric && symmetric.distance <= rowPitch( g ) + 0.0001;
		top = exact ? symmetric.left : cells.top;
		bottom = exact ? symmetric.right - 1 : cells.bottom;
	}

	if ( resizeCenter ) {
		// Snap opposite edges together around the original center. Independent
		// edge rounding can otherwise shift a centered resize by half a cell.
		const x = centeredTracks(
			g.columns,
			resizeCenter.left + resizeCenter.width / 2,
			rect.width,
			minimum.columnSpan
		);
		const y = centeredTracks(
			g.rows,
			resizeCenter.top + resizeCenter.height / 2,
			rect.height,
			minimum.rowSpan
		);
		if ( x ) {
			base.anchors.left =
				nearestGuideline(
					g.columns[ x.left ].start,
					'start',
					g,
					'x',
					0.0001
				)?.[ 0 ] ?? columnAnchor( x.left, 'start', g );
			base.anchors.right =
				nearestGuideline(
					g.columns[ x.right - 1 ].end,
					'end',
					g,
					'x',
					0.0001
				)?.[ 0 ] ?? columnAnchor( x.right - 1, 'end', g );
		}
		if ( y ) {
			top = y.left;
			bottom = y.right - 1;
		}
	}
	base.row = clamp(
		top - g.before + 1,
		1,
		Math.max( 1, g.coreRows - minimum.rowSpan + 1 )
	);
	base.rowSpan = clamp(
		Math.min( bottom - g.before + 1, g.coreRows ) - base.row + 1,
		minimum.rowSpan,
		MAX_ROWS - base.row + 1
	);
	const previous = savedCanvasPlacement( value );
	if (
		[ 'left', 'right' ].some(
			( side ) => typeof previous.anchors[ side ] === 'string'
		)
	) {
		const horizontal = mapCanvasPlacement(
			{ ...previous, free: undefined },
			mode,
			g,
			minimum
		)._rect;
		if (
			Math.abs( horizontal.left - rect.left ) < 0.0001 &&
			Math.abs( horizontal.width - rect.width ) < 0.0001
		) {
			base.anchors.left = previous.anchors.left;
			base.anchors.right = previous.anchors.right;
		}
	}
	if ( value._snapHorizontal ) {
		base.anchors = { ...value._snapHorizontal };
	}
	return mapCanvasRowsPlacement( base, mode, g, minimum, {
		top: topGuide?.[ 1 ] ?? g.rows[ top ].start,
		bottom: bottomGuide?.[ 1 ] ?? g.rows[ bottom ].end,
	} );
}

// Both gestures and drops use these measured cells and semantic edge anchors.
// Saved anchors contain no viewport pixel measurements.
export function dragCanvasPlacement(
	start,
	mode,
	kind,
	dx,
	dy,
	minimum,
	tolerance = 6
) {
	// Keyboard edits and external drops commit through the same solver as pointer release.
	if ( start.free ) {
		start = snapCanvasPlacement( start, mode, minimum, undefined, 0 );
	}
	const moving = kind === 'move';
	let g = start._canvas;
	const targetBottom = start._rect.top + start._rect.height + dy;
	if (
		( moving || kind.includes( 's' ) ) &&
		targetBottom > g.height &&
		g.coreRows < MAX_ROWS
	) {
		g = {
			...g,
			...canvasRows(
				g.padding.top,
				g.padding.bottom,
				Math.min(
					MAX_ROWS,
					g.coreRows +
						Math.ceil(
							( targetBottom - g.height ) / rowPitch( g ) - 1e-7
						)
				),
				g.gap,
				g.rowHeight
			),
		};
		start = { ...start, _canvas: g };
	}
	const preview = moving
		? dragMovePlacement( start, mode, dx, dy, minimum )
		: dragResizePlacement(
				{ ...start, rotation: 0 },
				mode,
				kind,
				dx,
				dy,
				minimum
			);
	if ( dx || ( ! moving && /[ew]/.test( kind ) ) ) {
		delete preview._snapHorizontal;
	}
	const snapped = snapCanvasPlacement(
		preview,
		mode,
		minimum,
		moving ? start : undefined,
		tolerance
	);
	return {
		...snapped,
		rotation: start.rotation,
		_base: { ...snapped._base, rotation: start.rotation },
	};
}

function placementWithFreeFrame( start, mode, rect, minimum ) {
	const g = start._canvas;
	const base = {
		...savedCanvasPlacement( start ),
	};
	base.anchors =
		Math.abs( rect.left - start._rect.left ) < 0.0001 &&
		Math.abs( rect.width - start._rect.width ) < 0.0001
			? {
					left: base.anchors.left ?? base.column - 1,
					right:
						base.anchors.right ?? base.column + base.columnSpan - 1,
				}
			: {};
	// The fallback footprint excludes padding; the precise frame retains it.
	const limit =
		rect.top + rect.height <= g.height + 0.01 ? g.coreRows : MAX_ROWS;
	const minimumRows = minimum?.rowSpan || 1;
	base.row = clamp(
		Math.floor( ( rect.top - g.padding.top ) / rowPitch( g ) ) + 1,
		1,
		Math.max( 1, limit - minimumRows + 1 )
	);
	base.rowSpan = clamp(
		Math.ceil(
			( rect.top + rect.height - g.padding.top + g.gap ) / rowPitch( g ) -
				1e-7
		) -
			base.row +
			1,
		minimumRows,
		Math.max( minimumRows, limit - base.row + 1 )
	);
	const column = closestTrack( rect.left, g.columns );
	const endColumn = Math.max(
		column,
		closestTrack( rect.left + rect.width, g.columns, 'end' )
	);
	base.column = clamp( column - g.columnOffset, 1, g.gridColumns );
	base.columnSpan = endColumn - column + 1;
	base.free = freeFrameFromRect( rect, g );
	return {
		...mapCanvasPlacement( base, mode, g, minimum ),
		_snapCanvas: g,
		...( Math.abs( rect.left - start._rect.left ) < 0.0001 &&
		Math.abs( rect.width - start._rect.width ) < 0.0001
			? { _snapHorizontal: { ...base.anchors } }
			: {} ),
	};
}

// A one-time shape change aims for the same area and center, then uses the
// ordinary resize snap. This saves cells, never an aspect-ratio constraint.
export function fitCanvasPlacementToRatio(
	start,
	mode,
	ratio,
	minimum = {
		columnSpan: 1,
		rowSpan: 1,
	}
) {
	const g = start?._canvas,
		rect = start?._rect;
	if (
		! g ||
		! rect ||
		! Number.isFinite( ratio ) ||
		ratio <= 0 ||
		rect.width <= 0 ||
		rect.height <= 0
	) {
		return start;
	}
	const limit = g.padding.top + MAX_ROWS * rowPitch( g ) - g.gap;
	const width = Math.min(
		Math.sqrt( rect.width * rect.height * ratio ),
		g.width,
		limit * ratio
	);
	const height = width / ratio;
	const target = {
		left: clamp(
			rect.left + ( rect.width - width ) / 2,
			0,
			g.width - width
		),
		top: clamp(
			rect.top + ( rect.height - height ) / 2,
			0,
			limit - height
		),
		width,
		height,
	};
	const error = ( frame ) =>
		Math.abs( Math.log( frame.width / frame.height / ratio ) );
	const preview = placementWithFreeFrame( start, mode, target, minimum );
	const neighbors = ( neighborTracks, position, edge ) => {
		const nearest = closestTrack( position, neighborTracks, edge ) - 1;
		return [ nearest - 1, nearest, nearest + 1 ].filter(
			( index ) => index >= 0 && index < neighborTracks.length
		);
	};
	const columns = preview._canvas.columns,
		rows = preview._canvas.rows;
	const lefts = neighbors( columns, target.left, 'start' ),
		rights = neighbors( columns, target.left + width, 'end' );
	const tops = neighbors( rows, target.top, 'start' ),
		bottoms = neighbors( rows, target.top + height, 'end' );
	let best,
		score = error( rect ) ** 2;
	// Compare nearby cell spans as well as edges. Snapping both edges in place
	// can otherwise grow an odd-width box by two columns instead of one.
	for ( const left of lefts ) {
		for ( const right of rights ) {
			for ( const top of tops ) {
				for ( const bottom of bottoms ) {
					if (
						right - left + 1 < minimum.columnSpan ||
						bottom - top + 1 < minimum.rowSpan
					) {
						continue;
					}
					const candidate = {
						left: columns[ left ].start,
						top: rows[ top ].start,
						width: columns[ right ].end - columns[ left ].start,
						height: rows[ bottom ].end - rows[ top ].start,
					};
					if (
						candidate.width <= 0 ||
						candidate.height <= 0 ||
						candidate.top + candidate.height > limit ||
						error( candidate ) >= error( rect ) - 0.0001
					) {
						continue;
					}
					const areaError = Math.log(
						( candidate.width * candidate.height ) /
							( rect.width * rect.height )
					);
					const dx =
						( candidate.left +
							candidate.width / 2 -
							rect.left -
							rect.width / 2 ) /
						width;
					const dy =
						( candidate.top +
							candidate.height / 2 -
							rect.top -
							rect.height / 2 ) /
						height;
					const cost =
						areaError ** 2 +
						error( candidate ) ** 2 +
						0.1 * ( dx ** 2 + dy ** 2 );
					if ( cost < score ) {
						best = candidate;
						score = cost;
					}
				}
			}
		}
	}
	// A coarse grid may already be the closest usable fit. Preserve its anchors.
	return best
		? snapCanvasPlacement(
				{
					...preview,
					_rect: best,
				},
				mode,
				minimum,
				undefined,
				0
			)
		: start;
}
export function dragAspectRatioPlacement(
	start,
	mode,
	kind,
	dx,
	dy,
	ratio,
	minimum
) {
	return dragResizePlacement( start, mode, kind, dx, dy, minimum, ratio );
}
export function dragMovePlacement( start, mode, dx, dy, minimum, scale = 1 ) {
	const g = start._canvas,
		rect = start._rect;
	const height = g.padding.top + MAX_ROWS * rowPitch( g ) - g.gap;
	let top = clamp( rect.top + dy, 0, Math.max( 0, height - rect.height ) );
	// Require a deliberate pull past the bottom before allowing growth. Keep
	// the approach range smaller so nearby placements are still easy to reach.
	// Otherwise a tiny overshoot adds tracks and moves the target away from the
	// pointer before release. Use the same attached frame for preview and drop.
	const overshoot = top + rect.height - g.height;
	const approach = Math.max( 6 * scale, rowPitch( g ) / 2 );
	const growthThreshold = Math.max( 24 * scale, rowPitch( g ) * 0.75 );
	if (
		rect.height <= g.height &&
		overshoot >= -approach &&
		overshoot <= growthThreshold
	) {
		top = g.height - rect.height;
	}
	return placementWithFreeFrame(
		start,
		mode,
		{
			...rect,
			left: clamp(
				rect.left + dx,
				0,
				Math.max( 0, g.width - rect.width )
			),
			top,
		},
		minimum
	);
}
export function dragResizePlacement(
	start,
	mode,
	kind,
	dx,
	dy,
	minimum,
	ratio,
	fromCenter = false
) {
	const g = start._canvas;
	const bounds = {
		width: g.width,
		height:
			g.padding.top + MAX_ROWS * rowPitch( g ) - g.gap + g.padding.bottom,
	};
	const first = clamp(
		kind.includes( 'w' )
			? start.column + start.columnSpan - minimum.columnSpan - 1
			: start.column - 1,
		0,
		g.columns.length - minimum.columnSpan
	);
	// Padding-aligned boxes can be narrower than their logical span.
	// Never jump them to a new minimum before the pointer has moved that far.
	const size = {
		width: Math.min(
			start._rect.width,
			Math.max(
				1,
				g.columns[ first + minimum.columnSpan - 1 ].end -
					g.columns[ first ].start
			)
		),
		height: Math.min(
			start._rect.height,
			minimum.rowSpan * rowPitch( g ) - g.gap
		),
	};
	if ( fromCenter ) {
		ratio = start._rect.width / start._rect.height;
	}
	const rect = ratio
		? resizeAspectRect(
				start._rect,
				kind,
				dx,
				dy,
				ratio,
				bounds,
				start.rotation,
				fromCenter
			)
		: resizeRect( start._rect, kind, dx, dy, bounds, size, start.rotation );
	return placementWithFreeFrame( start, mode, rect, minimum );
}
export function transformCanvasPlacement(
	start,
	mode,
	origin,
	current,
	minimum
) {
	let g = start._canvas;
	const columnWidth =
		g.contentColumns[ Math.min( minimum.columnSpan, g.gridColumns ) - 1 ]
			.end - g.contentColumns[ 0 ].start;
	const { rect, rotation } = transformTouchRect(
		start._rect,
		start.rotation,
		origin,
		current,
		{
			width: g.width,
			height: g.padding.top + MAX_ROWS * rowPitch( g ) - g.gap,
		},
		{
			width: columnWidth,
			height: minimum.rowSpan * rowPitch( g ) - g.gap,
		}
	);
	// A centered twist keeps the exact original anchors. Do not turn a
	// rotation-only edit into a grid resize.
	if (
		Object.keys( rect ).every(
			( key ) => Math.abs( rect[ key ] - start._rect[ key ] ) < 0.01
		)
	) {
		return {
			...start,
			rotation,
		};
	}
	if ( rect.top + rect.height > g.height && g.coreRows < MAX_ROWS ) {
		const count = Math.min(
			MAX_ROWS,
			Math.max(
				g.coreRows,
				Math.ceil(
					( rect.top + rect.height - g.padding.top + g.gap ) /
						rowPitch( g )
				)
			)
		);
		g = {
			...g,
			...canvasRows(
				g.padding.top,
				g.padding.bottom,
				count,
				g.gap,
				g.rowHeight
			),
		};
	}
	return placementWithFreeFrame(
		{
			...start,
			rotation,
			_base: {
				...savedCanvasPlacement( start ),
				rotation,
			},
			_canvas: g,
		},
		mode,
		rect,
		minimum
	);
}
export function nudgeCanvasPlacement(
	value,
	mode,
	x,
	y,
	minimum = {
		columnSpan: 1,
		rowSpan: 1,
	}
) {
	if ( value.free ) {
		value = snapCanvasPlacement( value, mode, minimum );
	}
	const g = value._canvas;
	const a =
		g.columns[ clamp( value.column - 1 + x, 0, g.columns.length - 1 ) ];
	const b = g.rows[ clamp( value.row - 1 + y, 0, g.rows.length - 1 ) ];
	let dy;
	if ( y > 0 && value.row === g.rows.length ) {
		dy = rowPitch( g );
	} else if ( y ) {
		dy = b.start - value._rect.top;
	} else {
		dy = 0;
	}
	return dragCanvasPlacement(
		value,
		mode,
		'move',
		x ? a.start - value._rect.left : 0,
		dy,
		minimum,
		0
	);
}

// Resize in local block axes, using logical cell ends rather than pixel nudges.
export function resizeCanvasWithKey( value, mode, x, y, minimum, ratio ) {
	if ( value.free ) {
		value = snapCanvasPlacement( value, mode, minimum );
	}
	const g = value._canvas;
	if ( ! g ) {
		return value;
	}
	const endDelta = ( list, end, step, pitch ) => {
		if ( ! step ) {
			return 0;
		}
		// Padding can end in a zero-width track; skip duplicate boundaries.
		const next =
			step > 0
				? list.find( ( track ) => track.end > end + 0.001 )
				: list.findLast( ( track ) => track.end < end - 0.001 );
		if ( next ) {
			return next.end - end;
		} else if ( step > 0 ) {
			return pitch;
		}
		return 0;
	};
	const dx = endDelta(
		g.columns,
		value._rect.left + value._rect.width,
		x,
		Math.max( 0, g.width - value._rect.left - value._rect.width )
	);
	const dy = endDelta(
		g.rows,
		value._rect.top + value._rect.height,
		y,
		g.coreRows < MAX_ROWS ? rowPitch( g ) : 0
	);
	if ( ! dx && ! dy ) {
		return value;
	}
	if ( ! ratio ) {
		return dragCanvasPlacement( value, mode, 'se', dx, dy, minimum, 0 );
	}
	// Feed the ratio diagonal so a one-axis key retains its full movement.
	// Rotation is preserved, while keyboard sizing fixes the logical top-left.
	const start = {
		...value,
		rotation: 0,
	};
	const fitted = dragAspectRatioPlacement(
		start,
		mode,
		'se',
		x ? dx : dy * ratio,
		y ? dy : dx / ratio,
		ratio,
		minimum
	);
	const result = snapCanvasPlacement( fitted, mode, minimum );
	return {
		...result,
		rotation: value.rotation,
		_base: {
			...result._base,
			rotation: value.rotation,
		},
	};
}

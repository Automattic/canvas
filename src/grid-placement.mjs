import {
	mapCanvasRowsPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { closestTrack, minimumSpans } from './placement.mjs';

// Resolve actual cell edges, including clipped padding cells. Named guides can
// lie between cells, and deleting a precise padding frame loses its row edges.
export function gridAlignedPlacement(
	placement,
	mode,
	minimum = minimumSpans()
) {
	if ( ! placement._rect || ! placement._canvas ) {
		return placement;
	}
	const g = placement._canvas;
	const r = placement._rect;
	const interval = ( tracks, start, end, span ) => {
		span = Math.min( span, tracks.length );
		const exactStart = tracks.findIndex(
			( track ) => Math.abs( track.start - start ) < 0.0001
		);
		const exactEnd = tracks.findLastIndex(
			( track ) => Math.abs( track.end - end ) < 0.0001
		);
		const first = Math.min(
			exactStart < 0 ? closestTrack( start, tracks ) - 1 : exactStart,
			tracks.length - span
		);
		return [
			first,
			Math.max(
				first + span,
				exactEnd < 0 ? closestTrack( end, tracks, 'end' ) : exactEnd + 1
			),
		];
	};
	const [ left, right ] = interval(
		g.columns,
		r.left,
		r.left + r.width,
		minimum.columnSpan
	);
	const [ top, bottom ] = interval(
		g.rows,
		r.top,
		r.top + r.height,
		minimum.rowSpan
	);
	return gridPlacement(
		placement,
		mode,
		{ left, right, top, bottom },
		minimum
	);
}

export function gridPlacement(
	placement,
	mode,
	edges,
	minimum = minimumSpans()
) {
	const g = placement._canvas;
	const base = savedCanvasPlacement( placement );
	delete base.free;
	const left = edges.left ?? placement.column - 1;
	const right = edges.right ?? placement.column + placement.columnSpan - 1;
	const top = edges.top ?? placement.row - 1;
	const bottom = edges.bottom ?? placement.row + placement.rowSpan - 1;
	const width = g.columns[ right - 1 ].end - g.columns[ left ].start;
	const height = g.rows[ bottom - 1 ].end - g.rows[ top ].start;
	const anchor = ( side, index, coordinate ) => {
		const previous = base.anchors?.[ side ];
		const start = side === 'left';
		const targets = {
			canvas: start ? 0 : g.width,
			padding: start ? g.padding.left : g.width - g.padding.right,
			wide: start ? g.wideStart : g.wideEnd,
			'wide-start': g.wideStart,
			'wide-end': g.wideEnd,
			center: g.center ?? g.width / 2,
		};
		if (
			typeof previous === 'string' &&
			Math.abs( targets[ previous ] - coordinate ) < 0.0001
		) {
			return previous;
		}
		return coordinate === ( start ? 0 : g.width )
			? 'canvas'
			: index - g.columnOffset;
	};
	return mapCanvasRowsPlacement(
		{
			...base,
			column: Math.max( 1, left - g.columnOffset + 1 ),
			columnSpan: right - left,
			row: Math.max( 1, top - g.before + 1 ),
			rowSpan: Math.max(
				minimum.rowSpan,
				Math.min( bottom - g.before, g.coreRows ) -
					Math.max( 0, top - g.before )
			),
			anchors: {
				left: anchor( 'left', left, g.columns[ left ].start ),
				right: anchor( 'right', right, g.columns[ right - 1 ].end ),
			},
			...( base.frameRatio ? { frameRatio: width / height } : {} ),
			...( Math.abs( g.rows[ top ].start - placement._rect.top ) >
				0.0001 || Math.abs( height - placement._rect.height ) > 0.0001
				? { fillHeight: undefined }
				: {} ),
		},
		mode,
		g,
		minimum,
		{ top: g.rows[ top ].start, bottom: g.rows[ bottom - 1 ].end }
	);
}

// Pick a symmetric cell span without independently rounding opposite edges.
export function centeredGridSpan( tracks, center, size, minimum = 1 ) {
	let best;
	for ( let start = 0; start <= tracks.length - minimum; start++ ) {
		const end = closestTrack(
			center * 2 - tracks[ start ].start,
			tracks,
			'end'
		);
		if (
			end < start + minimum ||
			Math.abs(
				( tracks[ start ].start + tracks[ end - 1 ].end ) / 2 - center
			) > 0.0001
		) {
			continue;
		}
		const width = tracks[ end - 1 ].end - tracks[ start ].start;
		const error = Math.abs( width - size );
		if (
			! best ||
			error < best.error - 0.0001 ||
			( Math.abs( error - best.error ) < 0.0001 && width > best.width )
		) {
			best = { start, end, error, width };
		}
	}
	return best;
}

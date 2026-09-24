import { MAX_ROWS, rowHeightForWidth, rowPitch } from './placement.mjs';
import {
	canvasColumns,
	canvasRows,
	centerCanvasPlacement,
	mapCanvasPlacement,
	mapCanvasRowsPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';

// The frame's proportions belong to its authored viewport, independently of
// the optional gesture lock. Cell-only frames use the theme reference
// area, never desktop tracks temporarily measured at a phone's width.
export function imageFrameRatio( source, mode, geometry ) {
	if ( source.frameRatio ) {
		return source.frameRatio;
	}
	if ( source.free ) {
		return source.free.ratio;
	}
	if ( ! geometry?.referenceWidth ) {
		return undefined;
	}
	const rect = referenceFrame(
		source,
		mode,
		geometry,
		Math.min( MAX_ROWS, source.row + source.rowSpan - 1 )
	);
	return rect.width / rect.height;
}

// Callers choose the row extent: image fallback uses its occupied rows, while
// automatic content uses the full authored section for its reference frame.
function referenceFrame( source, mode, geometry, rows ) {
	return mapCanvasPlacement(
		source,
		mode,
		referenceCanvas( source, mode, geometry, rows )
	)._rect;
}

function referenceCanvas( source, mode, geometry, rows ) {
	const width =
		( geometry.referenceWidth * source.gridColumns ) /
		( geometry.referenceColumns || geometry.gridColumns );
	const { padding } = geometry;
	const referenceContent =
		geometry.referenceWidth - padding.left - padding.right;
	const scale =
		mode === 'desktop'
			? 1
			: ( width - padding.left - padding.right ) / referenceContent;
	const gap = ( geometry.referenceGap ?? geometry.gap ) * scale;
	const columnGap =
		( geometry.referenceColumnGap ?? geometry.columnGap ?? geometry.gap ) *
		scale;
	const reference = {
		...canvasColumns(
			width,
			padding,
			padding.left,
			width - padding.right,
			columnGap,
			mode,
			source.gridColumns
		),
		...canvasRows(
			padding.top,
			padding.bottom,
			rows,
			gap,
			rowHeightForWidth(
				width - padding.left - padding.right,
				geometry.proportional ? 'desktop' : mode
			)
		),
		gap,
	};
	return reference;
}

export function mapImagePlacement(
	value,
	mode,
	geometry,
	ratio,
	minimum,
	center = {}
) {
	let placement = mapCanvasPlacement(
		value,
		mode,
		geometry,
		minimum,
		true,
		true
	);
	if (
		placement.fillHeight ||
		! Number.isFinite( ratio ) ||
		ratio <= 0 ||
		placement.free
	) {
		return placement;
	}
	if ( center.x && ! geometry.proportional ) {
		placement = centerCanvasPlacement(
			placement,
			mode,
			'horizontal',
			minimum
		);
	}
	const base = { ...savedCanvasPlacement( placement ), frameRatio: ratio };
	let g = placement._canvas;

	const target = placement._rect.top + placement._rect.width / ratio;
	const rows = Math.min(
		MAX_ROWS,
		Math.max(
			g.coreRows,
			Math.round( ( target - g.padding.top + g.gap ) / rowPitch( g ) )
		)
	);
	if ( rows > g.coreRows ) {
		g = {
			...g,
			...canvasRows(
				g.padding.top,
				g.padding.bottom,
				rows,
				g.gap,
				g.rowHeight
			),
		};
	}
	const top = ( placement._grid.top - 1 ) / 2;
	let bottom = top;
	for ( let i = top; i < g.rows.length; i++ ) {
		if ( g.rows[ i ].end <= placement._rect.top ) {
			continue;
		}
		if (
			Math.abs( g.rows[ i ].end - target ) <
			Math.abs( g.rows[ bottom ].end - target )
		) {
			bottom = i;
		}
	}
	// Preserve the authored top while choosing the closest bottom row.
	if (
		g.coreRows !== placement._canvas.coreRows ||
		Math.abs(
			g.rows[ bottom ].end - placement._rect.top - placement._rect.height
		) > 0.001
	) {
		base.rowSpan = Math.max(
			1,
			Math.min( MAX_ROWS - base.row + 1, bottom - top + 1 )
		);
	}
	return mapCanvasRowsPlacement( base, mode, g, minimum, {
		top: placement._rect.top,
		bottom: g.rows[ bottom ].end,
	} );
}

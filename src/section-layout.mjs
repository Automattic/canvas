import {
	COLUMNS,
	MAX_ROWS,
	ROW_HEIGHT,
	integer,
	rowHeightForWidth,
} from './placement.mjs';
import { requiredRows, resolveLayouts } from './geometry.mjs';
import { canvasColumns, canvasRows } from './canvas-geometry.mjs';

// Start each measurement from authored rows, never the last rendered height.
// Responsive content may need more room, but empty authored rows still belong
// to the composition. A viewport's own height takes precedence over inheritance.
export function sectionRows( blocks, minimums ) {
	const layouts = resolveLayouts( blocks );
	const result = {};
	for ( const mode of Object.keys( COLUMNS ) ) {
		const inherited =
			mode === 'desktop'
				? 12
				: result[ mode === 'tablet' ? 'desktop' : 'tablet' ];
		const authored =
			mode === 'desktop'
				? layouts
				: Object.fromEntries(
						blocks
							.filter(
								( block ) => block.attributes?.canvas?.[ mode ]
							)
							.map( ( block ) => [
								block.clientId,
								layouts[ block.clientId ],
							] )
					);
		result[ mode ] = Math.min(
			MAX_ROWS,
			Math.max(
				minimums[ mode ] > 1 ? minimums[ mode ] : inherited,
				requiredRows( authored, mode )
			)
		);
	}
	return result;
}

// Retain the row structure while scaling its pitch with the artwork. Native
// padding remains the theme's responsibility. Derive the pitch from desktop,
// so editing a responsive image or row count cannot change its own grid scale.
export function responsiveRowMetrics( blocks, mode, geometry ) {
	const target = geometry[ mode ];
	const sourceMode = 'desktop';
	const source = geometry[ sourceMode ];
	const width =
		( source.referenceWidth * source.gridColumns ) /
		source.referenceColumns;
	const { padding } = source;
	const spacingGap = source.spacingGap ?? source.gap;
	const spacingColumnGap = source.spacingColumnGap ?? source.columnGap;
	// Fixed areas retain the default row rhythm independently of authored Gap.
	const referenceGap = 0;
	const referenceColumnGap = 0;
	const reference = {
		...source,
		gap: referenceGap,
		...canvasColumns(
			width,
			padding,
			padding.left,
			width - padding.right,
			referenceColumnGap,
			sourceMode,
			source.gridColumns
		),
		...canvasRows(
			padding.top,
			padding.bottom,
			source.coreRows,
			referenceGap,
			rowHeightForWidth(
				width - padding.left - padding.right,
				sourceMode
			) + ROW_HEIGHT
		),
	};
	const contentWidth = ( g ) =>
		g.contentColumns.at( -1 ).end - g.contentColumns[ 0 ].start;
	const scale = contentWidth( target ) / contentWidth( reference );
	const gap = reference.gap * scale;
	const rowHeight = reference.rowHeight * scale;
	return {
		...target,
		proportional: mode !== 'desktop',
		referenceGap,
		referenceColumnGap,
		spacingGap,
		spacingColumnGap,
		insetGap: { x: spacingColumnGap * scale, y: spacingGap * scale },
		referenceRowHeight: reference.rowHeight,
		...canvasColumns(
			target.width,
			target.padding,
			target.wideStart,
			target.wideEnd,
			referenceColumnGap * scale,
			mode,
			target.gridColumns,
			{
				...target.padding,
				left: target.contentColumns[ 0 ].start,
				right: target.width - target.contentColumns.at( -1 ).end,
			}
		),
		gap,
		...canvasRows(
			target.padding.top,
			target.padding.bottom,
			integer( target.coreRows, 12, 1, MAX_ROWS ),
			gap,
			rowHeight
		),
	};
}

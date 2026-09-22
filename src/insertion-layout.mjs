import {
	ATTRIBUTE,
	MAX_ROWS,
	minimumSpans,
	normalizePlacement,
	resolveLayouts,
	savePlacement,
} from './geometry.mjs';
import { occupiedRows, savedCanvasPlacement } from './canvas-geometry.mjs';
import { droppedLayouts } from './drop-layout.mjs';
import { withInsertionDefaults } from './insertion-defaults.mjs';

export function insertionLayout( existing, block, mode, metrics, point ) {
	if ( ! metrics ) {
		return null;
	}
	// Core has already inserted the block when its quick inserter calls back.
	const siblings = existing.filter(
		( item ) => item.clientId !== block.clientId
	);
	if ( point ) {
		return droppedLayouts( siblings, [ block ], mode, point, metrics )?.[
			block.clientId
		];
	}
	const incoming = withInsertionDefaults( block, mode, metrics );
	const layouts = resolveLayouts(
		[ ...siblings, incoming ],
		metrics.geometry
	);
	const layout = layouts[ block.clientId ];
	const row =
		Math.max(
			0,
			...siblings.map( ( item ) =>
				occupiedRows( layouts[ item.clientId ][ mode ] )
			)
		) + 1;
	const placement = savedCanvasPlacement( layout[ mode ] );
	if ( row + placement.rowSpan - 1 > MAX_ROWS ) {
		return null;
	}
	// Appending follows the current view's occupied rows, not its minimum height.
	// Row positions remain stable when the canvas grows or is reopened.
	const left =
		metrics.align === 'full' && metrics.hasWide ? 'wide' : 'padding';
	const next = normalizePlacement(
		{
			...placement,
			row,
			anchors: {
				...placement.anchors,
				left,
			},
		},
		mode,
		{},
		minimumSpans( block.name )
	);
	const saved = {
		...incoming.attributes[ ATTRIBUTE ],
		desktop:
			block.attributes[ ATTRIBUTE ]?.desktop ||
			savedCanvasPlacement( layout.desktop ),
	};
	return savePlacement(
		saved,
		layout,
		mode,
		next,
		minimumSpans( block.name )
	);
}

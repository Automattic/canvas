import {
	ATTRIBUTE,
	MAX_ROWS,
	rowPitch,
	savePlacement,
	minimumSpans,
	resolveLayouts,
} from './geometry.mjs';
import {
	dragCanvasPlacement,
	mapCanvasPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { withInsertionDefaults } from './insertion-defaults.mjs';

// Resolve content selection to the immediate child that owns grid coordinates.
export function owningGridItem(
	id,
	canvasId,
	getParent,
	isCanvasGroup = () => false
) {
	const seen = new Set();
	while ( id && id !== canvasId && ! seen.has( id ) ) {
		seen.add( id );
		const parent = getParent( id );
		if ( parent === canvasId || isCanvasGroup( parent ) ) {
			return id;
		}
		id = parent;
	}
	return null;
}

export function droppedLayouts( existing, incoming, mode, point, metrics ) {
	if ( ! incoming.length || ! metrics?.canvas ) {
		return null;
	}
	const authored = new Map(
		incoming.map( ( block ) => [
			block.clientId,
			block.attributes?.[ ATTRIBUTE ],
		] )
	);
	incoming = incoming.map( ( block ) =>
		existing.some( ( item ) => item.clientId === block.clientId )
			? block
			: withInsertionDefaults( block, mode, metrics )
	);
	const ids = new Set( incoming.map( ( block ) => block.clientId ) );
	const layouts = resolveLayouts(
		[
			...existing.filter( ( block ) => ! ids.has( block.clientId ) ),
			...incoming,
		],
		metrics.geometry
	);
	const height = incoming.reduce(
		( sum, block ) =>
			sum +
			savedCanvasPlacement( layouts[ block.clientId ][ mode ] ).rowSpan,
		0
	);
	if ( height > MAX_ROWS ) {
		return null;
	}
	// Keep a batch together when dropping near the content-row limit.
	point = {
		...point,
		y: Math.min(
			point.y,
			metrics.padding.top + ( MAX_ROWS - height ) * rowPitch( metrics )
		),
	};
	return Object.fromEntries(
		incoming.map( ( block ) => {
			const layout = layouts[ block.clientId ];
			const value = { ...savedCanvasPlacement( layout[ mode ] ) };
			if (
				! existing.some( ( item ) => item.clientId === block.clientId )
			) {
				value.row = 1;
			}
			const start = mapCanvasPlacement(
				value,
				mode,
				metrics,
				minimumSpans( block.name )
			);
			let placement = dragCanvasPlacement(
				start,
				mode,
				'move',
				point.x - start._rect.left,
				point.y - start._rect.top,
				minimumSpans( block.name ),
				6 * ( metrics.scale || 1 )
			);
			// Center snapping can adjust the span. Size a new image from its
			// destination cells, not the span it was initially created with.
			if (
				block.name === 'core/image' &&
				! authored.get( block.clientId )?.desktop
			) {
				const rowSpan = Math.max(
					1,
					Math.round(
						( placement._rect.width + metrics.gap ) /
							rowPitch( metrics )
					)
				);
				const base = savedCanvasPlacement( placement );
				placement = mapCanvasPlacement(
					{
						...base,
						rowSpan,
					},
					mode,
					placement._canvas
				);
			}
			point = {
				...point,
				y: placement._rect.top + placement._rect.height + metrics.gap,
			};
			const saved = {
				...block.attributes?.[ ATTRIBUTE ],
				desktop:
					authored.get( block.clientId )?.desktop ||
					savedCanvasPlacement( layout.desktop ),
			};
			return [
				block.clientId,
				savePlacement(
					saved,
					layout,
					mode,
					placement,
					minimumSpans( block.name )
				),
			];
		} )
	);
}

export function placementRectangle( placement, metrics ) {
	return mapCanvasPlacement( placement, metrics.mode, metrics )._rect;
}

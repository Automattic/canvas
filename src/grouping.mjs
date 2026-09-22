import { compactCanvas } from './serialization.mjs';
import { isCanvasGroup } from './canvas-groups.mjs';
import {
	ALLOWED_BLOCKS,
	ATTRIBUTE,
	MAX_ROWS,
	rowPitch,
	normalizePlacement,
	projectPlacement,
} from './placement.mjs';
import {
	canvasRows,
	mapCanvasPlacement,
	savedCanvasPlacement,
	snapCanvasPlacement,
} from './canvas-geometry.mjs';
export const isContainer = ( block ) =>
	isCanvasGroup( block ) ||
	( block?.name === 'core/group' &&
		block.attributes?.layout?.type === 'flex' );
export const canContain = ( block ) =>
	ALLOWED_BLOCKS.includes( block?.name ) || isContainer( block );
export function withoutGrid( block ) {
	const { [ ATTRIBUTE ]: ignored, ...attributes } = block.attributes;
	return {
		...block,
		attributes,
		innerBlocks: block.innerBlocks.map( withoutGrid ),
	};
}
export function replaceSelection( siblings, ids, replacement ) {
	const selected = new Set( ids );
	const first = siblings.findIndex( ( block ) =>
		selected.has( block.clientId )
	);
	return siblings.flatMap( ( block, index ) => {
		if ( index === first ) {
			return replacement;
		} else if ( selected.has( block.clientId ) ) {
			return [];
		}
		return [ block ];
	} );
}

// Store cell anchors only. DOM measurements are used at the time of an action.
export function rectanglePlacement( rect, mode, geometry, layer = 1, minimum ) {
	const needed = Math.min(
		MAX_ROWS,
		Math.max(
			geometry.coreRows,
			Math.ceil(
				( rect.top +
					rect.height -
					geometry.padding.top +
					geometry.gap ) /
					rowPitch( geometry )
			)
		)
	);
	const canvas = {
		...geometry,
		...canvasRows(
			geometry.padding.top,
			geometry.padding.bottom,
			needed,
			geometry.gap,
			geometry.rowHeight
		),
	};
	const base = mapCanvasPlacement(
		normalizePlacement(
			{
				gridColumns: canvas.gridColumns,
				layer,
			},
			mode
		),
		mode,
		canvas,
		minimum
	);
	const snapped = snapCanvasPlacement(
		{
			...base,
			_rect: rect,
		},
		mode,
		minimum
	);
	return {
		...savedCanvasPlacement( snapped ),
		column: snapped.column,
		columnSpan: snapped.columnSpan,
	};
}
export function releasedLayout( placement, mode ) {
	return compactCanvas( {
		layers: {
			[ mode ]: placement.layer,
		},
		desktop:
			mode === 'desktop'
				? placement
				: projectPlacement( placement, mode, 'desktop' ),
		...( mode === 'desktop'
			? {}
			: {
					[ mode ]: placement,
				} ),
	} );
}

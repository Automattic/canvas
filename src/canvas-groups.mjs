import { rotatedBounds, enclosingRect } from './rectangle-bounds.mjs';
import { compactCanvas } from './serialization.mjs';
import {
	ATTRIBUTE,
	COLUMNS,
	rowPitch,
	normalizePlacement,
} from './placement.mjs';
import {
	mapCanvasPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { resolveLayouts } from './geometry.mjs';
import { freeFrameFromRect } from './aspect-ratio.mjs';

export const isCanvasGroup = ( block ) =>
	block?.name === 'core/group' &&
	block.attributes?.[ ATTRIBUTE ]?.group === 1;
export const canvasBlocks = ( blocks ) =>
	blocks.flatMap( ( block ) => [
		block,
		...( isCanvasGroup( block ) ? canvasBlocks( block.innerBlocks ) : [] ),
	] );
// Source coordinates stay in the canvas's coordinate system. Only the rendered
// frames are local to their parent. This makes grouping lossless, including
// automatic breakpoints, and avoids repeatedly rounding nested coordinates.
export function layoutLeaves( blocks, nested = false ) {
	return blocks
		.flatMap( ( block ) =>
			isCanvasGroup( block )
				? layoutLeaves( block.innerBlocks, true )
				: [ nested ? { ...block, canvasNested: true } : block ]
		)
		.sort(
			( a, b ) =>
				( a.attributes?.[ ATTRIBUTE ]?.order ?? Infinity ) -
				( b.attributes?.[ ATTRIBUTE ]?.order ?? Infinity )
		);
}
// Grouping changes tree order, so retain each leaf's automatic-layout order.
// Nested leaves are copied by layoutLeaves; match stable IDs, not references.
export function preserveCanvasOrder( blocks ) {
	const order = new Map(
		layoutLeaves( blocks ).map( ( block, index ) => [
			block.clientId,
			index,
		] )
	);
	const visit = ( block ) =>
		isCanvasGroup( block )
			? { ...block, innerBlocks: block.innerBlocks.map( visit ) }
			: {
					...block,
					attributes: {
						...block.attributes,
						[ ATTRIBUTE ]: {
							...block.attributes[ ATTRIBUTE ],
							order: order.get( block.clientId ),
						},
					},
				};
	return blocks.map( visit );
}

function offsetAt( saved = {}, mode ) {
	const value =
		saved.offset?.[ mode ] ??
		( mode === 'mobile' ? saved.offset?.tablet : undefined ) ??
		saved.offset?.desktop;
	return {
		x: Number.isFinite( value?.x ) ? value.x : 0,
		y: Number.isFinite( value?.y ) ? value.y : 0,
	};
}
function addOffsets( saved = {}, addition = {} ) {
	const offset = Object.fromEntries(
		Object.keys( COLUMNS ).map( ( mode ) => {
			const a = offsetAt( saved, mode ),
				b = offsetAt( addition, mode );
			return [ mode, { x: a.x + b.x, y: a.y + b.y } ];
		} )
	);
	return compactCanvas( { ...saved, offset } );
}
export function exactPlacement( rect, mode, geometry, base = {} ) {
	const free = freeFrameFromRect( rect, geometry );
	const placement = mapCanvasPlacement( { ...base, free }, mode, geometry );
	// Derived group bounds can extend past the canvas (rotated children/padding).
	// Do not clamp those bounds or change the children's visible geometry.
	return {
		...placement,
		layer: base.layer ?? placement.layer,
		_rect: rect,
		_base: {
			...placement._base,
			layer: base.layer ?? placement.layer,
			free,
		},
		free,
	};
}
export function resolveCanvasLayouts(
	blocks,
	geometry,
	flat = resolveLayouts( layoutLeaves( blocks ), geometry )
) {
	const result = {};
	const ranks = paintLayers( blocks );
	const visit = ( block, parents, inherited ) => {
		const saved = block.attributes?.[ ATTRIBUTE ] || {};
		const group = isCanvasGroup( block );
		const translations = Object.fromEntries(
			Object.keys( COLUMNS ).map( ( mode ) => {
				const own = offsetAt( saved, mode ),
					parent = inherited[ mode ] || { x: 0, y: 0 };
				return [ mode, { x: own.x + parent.x, y: own.y + parent.y } ];
			} )
		);
		if ( group ) {
			block.innerBlocks.forEach( ( child ) =>
				visit( child, [ ...parents, block.clientId ], translations )
			);
		}
		const layout = group ? { fill: false } : { ...flat[ block.clientId ] };
		layout.group = group;
		layout.parents = parents;
		for ( const mode of Object.keys( COLUMNS ) ) {
			const g = geometry[ mode ];
			if ( ! g?.canvas ) {
				layout[ mode ] = {
					...( layout[ mode ] || normalizePlacement( {}, mode ) ),
					layer: ranks[ block.clientId ],
				};
				continue;
			}
			const offset = translations[ mode ];
			if ( group ) {
				const children = block.innerBlocks
					.map( ( child ) => result[ child.clientId ]?.[ mode ] )
					.filter( Boolean );
				const rect = enclosingRect(
					children.map( ( p ) =>
						rotatedBounds( p._rect, p.rotation )
					),
					g.groupInsets?.[ block.clientId ]
				);
				const layer = ranks[ block.clientId ];
				layout[ mode ] = exactPlacement( rect, mode, g, {
					layer,
					gridColumns: g.gridColumns,
				} );
			} else {
				const source = flat[ block.clientId ][ mode ];
				if ( source?._rect && ( offset.x || offset.y ) ) {
					layout[ mode ] = exactPlacement(
						{
							...source._rect,
							left: source._rect.left + offset.x * g.width,
							top: source._rect.top + offset.y * rowPitch( g ),
						},
						mode,
						g,
						savedCanvasPlacement( source )
					);
				}
			}
			layout[ mode ] = {
				...layout[ mode ],
				layer: ranks[ block.clientId ],
				_base: {
					...layout[ mode ]._base,
					layer: ranks[ block.clientId ],
				},
			};
			layout[ mode ]._offset = offset;
		}
		result[ block.clientId ] = layout;
	};
	blocks.forEach( ( block ) => visit( block, [], {} ) );
	return result;
}
export function saveGroupMove( saved, current, next, mode ) {
	const g = current._canvas,
		own = offsetAt( saved, mode );
	return compactCanvas( {
		...saved,
		offset: {
			...saved.offset,
			[ mode ]: {
				x: own.x + ( next._rect.left - current._rect.left ) / g.width,
				y:
					own.y +
					( next._rect.top - current._rect.top ) / rowPitch( g ),
			},
		},
	} );
}
export function translateGroupPlacement( placement, mode, x, y ) {
	const base = savedCanvasPlacement( placement );
	if ( Math.abs( x ) > 0.0001 ) {
		// Horizontal movement authors a new position. Old named boundaries must
		// not override that position when the precise frame is rendered again.
		const left = placement._rect.left + x;
		const right = left + placement._rect.width;
		base.anchors = {
			...( Math.abs( left ) < 0.0001 ? { left: 'canvas' } : {} ),
			...( Math.abs( right - placement._canvas.width ) < 0.0001
				? { right: 'canvas' }
				: {} ),
		};
	}
	return exactPlacement(
		{
			...placement._rect,
			left: placement._rect.left + x,
			top: placement._rect.top + y,
		},
		mode,
		placement._canvas,
		base
	);
}
export function nudgeGroupPlacement( placement, mode, x, y ) {
	const g = placement._canvas;
	return translateGroupPlacement(
		placement,
		mode,
		x * g.columnPitch,
		y * rowPitch( g )
	);
}
export function sourcePlacement( placement, mode, current ) {
	const offset = current._offset;
	if ( ! offset || ( ! offset.x && ! offset.y ) ) {
		return placement;
	}
	const g = placement._canvas;
	const base = savedCanvasPlacement( placement );
	if ( offset.x ) {
		// Named edges refer to displayed Canvas coordinates. Retaining them in
		// the source frame would apply the parent translation a second time.
		base.anchors = {};
	}
	return exactPlacement(
		{
			...placement._rect,
			left: placement._rect.left - offset.x * g.width,
			top: placement._rect.top - offset.y * rowPitch( g ),
		},
		mode,
		g,
		{
			...base,
			rotation: placement.rotation,
			layer: placement.layer,
		}
	);
}
export function releaseCanvasGroup( group ) {
	return group.innerBlocks.map( ( child ) => ( {
		...child,
		attributes: {
			...child.attributes,
			[ ATTRIBUTE ]: addOffsets(
				child.attributes[ ATTRIBUTE ],
				group.attributes[ ATTRIBUTE ]
			),
		},
	} ) );
}
// Replace the frontmost selected sibling with the group, retaining child order.
export function prepareCanvasGroup( siblings, ids ) {
	const last = siblings.findLastIndex( ( block ) =>
		ids.includes( block.clientId )
	);
	const selected = siblings.filter( ( block ) =>
		ids.includes( block.clientId )
	);
	return {
		siblings: siblings.flatMap( ( block, index ) => {
			if ( index === last ) {
				return selected;
			}
			return ids.includes( block.clientId ) ? [] : [ block ];
		} ),
	};
}

// Later siblings paint in front at every viewport. Groups form stacking contexts.
export function paintLayers( blocks ) {
	const layers = {};
	const visit = ( siblings ) => {
		siblings.forEach( ( block, index ) => {
			layers[ block.clientId ] = index + 1;
			if ( isCanvasGroup( block ) ) {
				visit( block.innerBlocks );
			}
		} );
	};
	visit( blocks );
	return layers;
}

export function releaseGroupSiblings( siblings, id ) {
	const group = siblings.find( ( block ) => block.clientId === id );
	const children = releaseCanvasGroup( group );
	return siblings.flatMap( ( block ) =>
		block === group ? children : [ block ]
	);
}

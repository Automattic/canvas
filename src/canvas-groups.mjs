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
import { isHiddenOnViewport } from './visibility.mjs';
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
export function layoutLeaves( blocks ) {
	return blocks
		.flatMap( ( block ) =>
			isCanvasGroup( block )
				? layoutLeaves( block.innerBlocks )
				: [ block ]
		)
		.sort(
			( a, b ) =>
				( a.attributes?.[ ATTRIBUTE ]?.order ?? Infinity ) -
				( b.attributes?.[ ATTRIBUTE ]?.order ?? Infinity )
		);
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
export function rotatedBounds( rect, degrees = 0 ) {
	const angle = ( degrees * Math.PI ) / 180;
	const width =
		Math.abs( rect.width * Math.cos( angle ) ) +
		Math.abs( rect.height * Math.sin( angle ) );
	const height =
		Math.abs( rect.width * Math.sin( angle ) ) +
		Math.abs( rect.height * Math.cos( angle ) );
	return {
		left: rect.left + ( rect.width - width ) / 2,
		top: rect.top + ( rect.height - height ) / 2,
		width,
		height,
	};
}
function enclosingRect( rects, inset = {} ) {
	if ( ! rects.length ) {
		return { left: 0, top: 0, width: 48, height: 48 };
	}
	const left =
		Math.min( ...rects.map( ( r ) => r.left ) ) - ( inset.left || 0 );
	const top = Math.min( ...rects.map( ( r ) => r.top ) ) - ( inset.top || 0 );
	return {
		left,
		top,
		width:
			Math.max( ...rects.map( ( r ) => r.left + r.width ) ) +
			( inset.right || 0 ) -
			left,
		height:
			Math.max( ...rects.map( ( r ) => r.top + r.height ) ) +
			( inset.bottom || 0 ) -
			top,
	};
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
		const layout = group
			? { fit: 'cover', fitArea: false }
			: { ...flat[ block.clientId ] };
		layout.group = group;
		layout.parents = parents;
		for ( const mode of Object.keys( COLUMNS ) ) {
			const g = geometry[ mode ];
			if ( ! g?.canvas ) {
				layout[ mode ] ||= normalizePlacement( {}, mode );
				continue;
			}
			const offset = translations[ mode ];
			if ( group ) {
				const children = block.innerBlocks
					.filter(
						( child ) =>
							! isHiddenOnViewport(
								child.attributes.metadata,
								mode
							)
					)
					.map( ( child ) => result[ child.clientId ]?.[ mode ] )
					.filter( Boolean );
				const rect = enclosingRect(
					children.map( ( p ) =>
						rotatedBounds( p._rect, p.rotation )
					),
					g.groupInsets?.[ block.clientId ]
				);
				const layer =
					saved.layers?.[ mode ] ??
					Math.max( 1, ...children.map( ( p ) => p.layer ) );
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
			if ( Number.isFinite( saved.layers?.[ mode ] ) ) {
				layout[ mode ] = {
					...layout[ mode ],
					layer: saved.layers[ mode ],
					_base: {
						...layout[ mode ]._base,
						layer: saved.layers[ mode ],
					},
				};
			}
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
	return exactPlacement(
		{
			...placement._rect,
			left: placement._rect.left + x,
			top: placement._rect.top + y,
		},
		mode,
		placement._canvas,
		savedCanvasPlacement( placement )
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
	return exactPlacement(
		{
			...placement._rect,
			left: placement._rect.left - offset.x * g.width,
			top: placement._rect.top - offset.y * rowPitch( g ),
		},
		mode,
		g,
		{
			...savedCanvasPlacement( placement ),
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
// A group becomes one stacking context. Detect conflicting requirements from
// outside siblings rather than silently changing which overlapping item wins.
export function groupingLayers( siblings, ids, layouts ) {
	const layers = {};
	for ( const mode of Object.keys( COLUMNS ) ) {
		const selected = siblings.filter( ( b ) => ids.includes( b.clientId ) );
		let lower = -Infinity,
			upper = Infinity;
		for ( const outside of siblings.filter(
			( b ) => ! ids.includes( b.clientId )
		) ) {
			if ( isHiddenOnViewport( outside.attributes.metadata, mode ) ) {
				continue;
			}
			const p = layouts[ outside.clientId ]?.[ mode ];
			if ( ! p?._rect ) {
				continue;
			}
			const a = rotatedBounds( p._rect, p.rotation );
			for ( const inside of selected ) {
				if ( isHiddenOnViewport( inside.attributes.metadata, mode ) ) {
					continue;
				}
				const q = layouts[ inside.clientId ]?.[ mode ];
				if ( ! q?._rect ) {
					continue;
				}
				const b = rotatedBounds( q._rect, q.rotation );
				if (
					a.left >= b.left + b.width ||
					b.left >= a.left + a.width ||
					a.top >= b.top + b.height ||
					b.top >= a.top + a.height
				) {
					continue;
				}
				const above =
					q.layer > p.layer ||
					( q.layer === p.layer &&
						siblings.indexOf( inside ) >
							siblings.indexOf( outside ) );
				if ( above ) {
					lower = Math.max( lower, p.layer );
				} else {
					upper = Math.min( upper, p.layer );
				}
			}
		}
		if ( lower >= upper ) {
			return null;
		}
		let layer = Math.max(
			1,
			...selected.map(
				( block ) => layouts[ block.clientId ]?.[ mode ]?.layer || 1
			)
		);
		if ( layer >= upper ) {
			layer = Number.isFinite( lower )
				? ( lower + upper ) / 2
				: upper - 0.5;
		}
		if ( layer <= lower ) {
			layer = Number.isFinite( upper )
				? ( lower + upper ) / 2
				: lower + 0.5;
		}
		layers[ mode ] = layer;
	}
	return layers;
}
export function groupingConflict( siblings, ids, layouts ) {
	return groupingLayers( siblings, ids, layouts )
		? null
		: 'These blocks overlap other layers. Select the intervening blocks to group them together.';
}

// Fractional source layers let a new group sit between existing layers. CSS
// z-index only accepts integers, so render a stable rank within each parent.
export function paintLayers( blocks, layouts, mode ) {
	const layers = {};
	const visit = ( siblings ) => {
		[ ...siblings ]
			.sort(
				( a, b ) =>
					layouts[ a.clientId ][ mode ].layer -
					layouts[ b.clientId ][ mode ].layer
			)
			.forEach( ( block, index ) => {
				layers[ block.clientId ] = index + 1;
			} );
		siblings
			.filter( isCanvasGroup )
			.forEach( ( block ) => visit( block.innerBlocks ) );
	};
	visit( blocks );
	return layers;
}

export function releaseGroupSiblings( siblings, id, layouts ) {
	const group = siblings.find( ( block ) => block.clientId === id );
	const children = releaseCanvasGroup( group );
	const result = siblings.flatMap( ( block ) =>
		block === group ? children : [ block ]
	);
	const layers = new Map(
		result.map( ( block ) => [
			block.clientId,
			{ ...block.attributes[ ATTRIBUTE ]?.layers },
		] )
	);
	for ( const mode of Object.keys( COLUMNS ) ) {
		const sort = ( blocks ) =>
			[ ...blocks ].sort(
				( a, b ) =>
					layouts[ a.clientId ][ mode ].layer -
					layouts[ b.clientId ][ mode ].layer
			);
		const order = sort( siblings ).flatMap( ( block ) =>
			block === group ? sort( children ) : [ block ]
		);
		order.forEach( ( block, index ) => {
			layers.get( block.clientId )[ mode ] = index + 1;
		} );
	}
	return result.map( ( block ) => ( {
		...block,
		attributes: {
			...block.attributes,
			[ ATTRIBUTE ]: compactCanvas( {
				...block.attributes[ ATTRIBUTE ],
				layers: layers.get( block.clientId ),
			} ),
		},
	} ) );
}

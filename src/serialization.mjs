import { ANCHOR_KEYS, ATTRIBUTE, COLUMNS, validAnchor } from './placement.mjs';
import { normalizeRotation } from './rotation.mjs';

const object = ( value ) =>
	value && typeof value === 'object' && ! Array.isArray( value );
const copy = ( value ) => JSON.parse( JSON.stringify( value ) );
const placementKeys = [
	'column',
	'row',
	'columnSpan',
	'rowSpan',
	'gridColumns',
	'free',
];
const settingsKeys = [
	'shape',
	'fit',
	'verticalAlign',
	'imagePosition',
	'aspectRatio',
	'group',
	'offset',
	'order',
];

// Persistence is deliberately separate from geometry normalization. In particular,
// do not materialize automatic viewports or save computed layers/defaults.
export function serializePlacement( value ) {
	const source = object( value?._base ) ? value._base : value;
	if ( ! object( source ) ) {
		return undefined;
	}
	const result = Object.fromEntries(
		placementKeys
			.filter( ( key ) => source[ key ] !== undefined )
			.map( ( key ) => [ key, copy( source[ key ] ) ] )
	);
	if ( object( result.free ) ) {
		result.free = Object.fromEntries(
			[ 'x', 'y', 'width', 'ratio' ]
				.filter( ( key ) => result.free[ key ] !== undefined )
				.map( ( key ) => [ key, result.free[ key ] ] )
		);
		for ( const key of [ 'x', 'y', 'width', 'ratio' ] ) {
			const number = result.free[ key ];
			if ( Number.isFinite( number ) ) {
				// Match PHP's rounding, including negative half steps and zero.
				const rounded =
					( Math.sign( number ) *
						Math.floor( Math.abs( number ) * 1e6 + 0.5 ) ) /
					1e6;
				// Do not turn a tiny positive dimension into an invalid zero.
				result.free[ key ] =
					rounded ||
					( [ 'width', 'ratio' ].includes( key ) && number > 0
						? number
						: 0 );
			}
		}
	}
	const rotation = normalizeRotation( source.rotation );
	if ( source.fillHeight === true ) {
		result.fillHeight = true;
	}
	if ( rotation ) {
		result.rotation = rotation;
	}
	if ( Number.isFinite( source.frameRatio ) && source.frameRatio > 0 ) {
		result.frameRatio = Number( source.frameRatio.toPrecision( 6 ) );
	}
	// Sparse placements can inherit an append row from preceding content. Only
	// compare explicit coordinates; normalization here would invent that context.
	const implicit = {
		left: source.column - 1,
		right: source.column + source.columnSpan - 1,
	};
	// Precise frames need explicit numeric counterparts to named boundaries.
	const horizontalFrame =
		source.free &&
		[ 'left', 'right' ].some(
			( key ) => typeof source.anchors?.[ key ] === 'string'
		);
	const anchors = Object.fromEntries(
		ANCHOR_KEYS.filter(
			( key ) =>
				validAnchor( source.anchors?.[ key ], key ) &&
				( source.anchors[ key ] !== implicit[ key ] ||
					( horizontalFrame && [ 'left', 'right' ].includes( key ) ) )
		).map( ( key ) => [ key, source.anchors[ key ] ] )
	);
	if ( Object.keys( anchors ).length ) {
		result.anchors = anchors;
	}
	return result;
}

export function compactCanvas( value = {} ) {
	if ( ! object( value ) ) {
		return {};
	}
	const result = Object.fromEntries(
		settingsKeys
			.filter( ( key ) => value[ key ] !== undefined )
			.map( ( key ) => [ key, copy( value[ key ] ) ] )
	);
	if ( typeof value.shapeStretch === 'boolean' ) {
		result.shapeStretch = value.shapeStretch;
	}
	for ( const [ key, fallback ] of Object.entries( {
		shape: 'none',
		fit: 'cover',
		verticalAlign: 'top',
	} ) ) {
		if ( result[ key ] === fallback ) {
			delete result[ key ];
		}
	}
	if ( value.fitArea === true ) {
		result.fitArea = true;
	}
	if ( typeof value.fill === 'boolean' ) {
		result.fill = value.fill;
	}
	const layers = Object.fromEntries(
		Object.keys( COLUMNS )
			.filter( ( mode ) => Number.isFinite( value.layers?.[ mode ] ) )
			.map( ( mode ) => [ mode, value.layers[ mode ] ] )
	);
	if ( Object.keys( layers ).length ) {
		result.layers = layers;
	}
	for ( const mode of Object.keys( COLUMNS ) ) {
		const placement = serializePlacement( value[ mode ] );
		if ( placement ) {
			result[ mode ] = placement;
		}
	}
	return result;
}

export const compactCanvasAttributes = ( attributes ) =>
	Object.hasOwn( attributes, ATTRIBUTE )
		? {
				...attributes,
				[ ATTRIBUTE ]:
					attributes[ ATTRIBUTE ] === undefined
						? undefined
						: compactCanvas( attributes[ ATTRIBUTE ] ),
			}
		: attributes;

export const compactCanvasBlock = ( block ) => ( {
	...block,
	attributes: compactCanvasAttributes( block.attributes ),
	innerBlocks: block.innerBlocks.map( compactCanvasBlock ),
} );

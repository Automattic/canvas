import { normalizeRotation } from './rotation.mjs';
import { normalizeFreeFrame } from './aspect-ratio.mjs';
export const ANCHOR_KEYS = [ 'left', 'right' ];
export const validAnchor = ( value, key ) =>
	( ANCHOR_KEYS.includes( key ) &&
		typeof value === 'number' &&
		Number.isFinite( value ) ) ||
	( [ 'left', 'right' ].includes( key ) &&
		[
			'padding',
			'canvas',
			'wide',
			'wide-start',
			'wide-end',
			'center',
		].includes( value ) );
export const BLOCK_NAME = 'tabor/canvas';
export const ATTRIBUTE = 'canvas';
export const ALLOWED_BLOCKS = [
	'core/image',
	'core/heading',
	'core/paragraph',
	'core/buttons',
];
export const COLUMNS = {
	desktop: 24,
	tablet: 12,
	mobile: 12,
};
export const columnsForAlignment = ( mode, align ) => {
	if ( mode === 'desktop' ) {
		if ( align === 'full' ) {
			return 24;
		}
		if ( align === 'wide' ) {
			return 18;
		}
		return 12;
	}
	return COLUMNS[ mode ];
};
export const MAX_ROWS = 500;
export const ROW_HEIGHT = 24;
// Fluid Engine scales desktop rows with the content width; smaller layouts
// use their own 24px rows. Keep the pitch shared by rendering and gestures.
export const rowHeightForWidth = ( width, mode ) =>
	mode === 'desktop' ? Math.max( 1, width * 0.0215 ) : ROW_HEIGHT;
export const rowPitch = ( { rowHeight = ROW_HEIGHT, gap } ) => rowHeight + gap;
export const DEFAULT_MINIMUM = {
	columnSpan: 1,
	rowSpan: 1,
};
const BUTTON_MINIMUM = {
	columnSpan: 4,
	rowSpan: 2,
};

// Keep button minimums in sync with the PHP placement fallback.
export const minimumSpans = ( name ) =>
	name === 'core/buttons' ? BUTTON_MINIMUM : DEFAULT_MINIMUM;
export const integer = ( value, fallback, min, max ) => {
	const number = Number( value );
	return Math.min(
		max,
		Math.max(
			min,
			Number.isFinite( number ) ? Math.round( number ) : fallback
		)
	);
};
export function normalizePlacement(
	value = {},
	mode = 'desktop',
	fallback = {},
	minimum = DEFAULT_MINIMUM
) {
	value = value && typeof value === 'object' ? value : {};
	const columns = integer( value.gridColumns, COLUMNS[ mode ], 1, 2048 );
	const columnSpan = integer(
		value.columnSpan ?? fallback.columnSpan,
		columns / ( mode === 'mobile' ? 1 : 2 ),
		minimum.columnSpan,
		columns
	);
	const rowSpan = integer(
		value.rowSpan ?? fallback.rowSpan,
		6,
		minimum.rowSpan,
		MAX_ROWS
	);
	return {
		column: integer(
			value.column ?? fallback.column,
			1,
			1,
			columns - columnSpan + 1
		),
		row: integer( value.row ?? fallback.row, 1, 1, MAX_ROWS - rowSpan + 1 ),
		columnSpan,
		rowSpan,
		...( value.fillHeight === true ? { fillHeight: true } : {} ),
		layer: Number.isFinite( value.layer ?? fallback.layer )
			? ( value.layer ?? fallback.layer )
			: 1,
		...( Number.isFinite( value.frameRatio ) && value.frameRatio > 0
			? {
					frameRatio: value.frameRatio,
				}
			: {} ),
		...( normalizeFreeFrame( value.free )
			? {
					free: normalizeFreeFrame( value.free ),
				}
			: {} ),
		gridColumns: columns,
		...( value.rotation !== undefined
			? { rotation: normalizeRotation( value.rotation ) }
			: {} ),
		anchors: Object.fromEntries(
			ANCHOR_KEYS.filter( ( key ) =>
				validAnchor( value.anchors?.[ key ], key )
			).map( ( key ) => [
				key,
				typeof value.anchors[ key ] === 'number'
					? integer( value.anchors[ key ], 0, -2048, 2048 )
					: value.anchors[ key ],
			] )
		),
	};
}
export const bottomRow = ( placement ) => placement.row + placement.rowSpan - 1;

// Always project from the authored density, never through an intermediate
// rounded width setting or responsive layout.
export function projectPlacement(
	value,
	sourceMode,
	mode,
	minimum = DEFAULT_MINIMUM,
	count = COLUMNS[ mode ]
) {
	value = normalizePlacement( value, sourceMode, {}, minimum );
	if ( value.gridColumns === count ) {
		return {
			...value,
		};
	}
	const scale = count / value.gridColumns;
	const left = integer( ( value.column - 1 ) * scale + 1, 1, 1, count );
	const right = integer(
		( value.column + value.columnSpan - 1 ) * scale,
		count,
		left,
		count
	);
	const anchors = {
		...value.anchors,
	};
	for ( const key of [ 'left', 'right' ] ) {
		if ( typeof anchors[ key ] === 'number' ) {
			anchors[ key ] = Math.round( anchors[ key ] * scale );
		}
	}
	return normalizePlacement(
		{
			...value,
			anchors,
			gridColumns: count,
			column: left,
			columnSpan: right - left + 1,
		},
		mode,
		{},
		minimum
	);
}
export function tracks( sizes, gap ) {
	let offset = 0;
	return sizes.map( ( size ) => {
		const track = {
			start: offset,
			end: offset + size,
		};
		offset += size + gap;
		return track;
	} );
}
export function closestTrack( value, list, edge = 'start' ) {
	let index = 0;
	let distance = Infinity;
	list.forEach( ( track, i ) => {
		if ( track.end - track.start < 0.01 ) {
			return;
		}
		const current = Math.abs( track[ edge ] - value );
		if ( current < distance ) {
			distance = current;
			index = i;
		}
	} );
	return index + 1;
}

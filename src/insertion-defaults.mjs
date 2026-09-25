import { compactCanvas } from './serialization.mjs';
import {
	ATTRIBUTE,
	COLUMNS,
	MAX_ROWS,
	minimumSpans,
	rowPitch,
} from './placement.mjs';
import { columnTracks } from './columns.mjs';
export const DEFAULT_HEADING_CONTENT = 'This is a heading';
export const DEFAULT_PARAGRAPH_CONTENT =
	'A thoughtful composition keeps its character across different screens. This longer paragraph should stay alongside the heading while there is enough room, then widen only as much as it needs.';

// Defaults belong to insertion, not layout resolution: reopening, duplicating,
// and moving authored blocks must retain their existing dimensions and text.
export function withInsertionDefaults( block, mode, metrics ) {
	const attributes = block.attributes || {};
	const saved = attributes[ ATTRIBUTE ] || {};
	if (
		! [
			'core/heading',
			'core/paragraph',
			'core/image',
			'core/video',
			'core/buttons',
		].includes( block.name )
	) {
		return block;
	}
	if ( saved.desktop ) {
		const normalized = compactCanvas( saved );
		return JSON.stringify( normalized ) === JSON.stringify( saved )
			? block
			: {
					...block,
					attributes: {
						...attributes,
						[ ATTRIBUTE ]: normalized,
					},
				};
	}
	const heading = block.name === 'core/heading';
	const paragraph = block.name === 'core/paragraph';
	const text = heading || paragraph;
	const frameRatio = block.name === 'core/video' ? 16 / 9 : 1;
	const buttons = block.name === 'core/buttons';
	const placementFor = ( viewport ) => {
		const geometry =
			metrics.geometry?.[ viewport ] ||
			( viewport === mode ? metrics : null );
		const gridColumns = geometry?.gridColumns ?? COLUMNS[ viewport ];
		const anchor =
			geometry?.align === 'full' && geometry.hasWide
				? {
						anchors: {
							left: 'wide',
						},
					}
				: {};
		if ( buttons ) {
			return {
				gridColumns,
				...minimumSpans( block.name ),
				...anchor,
			};
		}
		let defaultColumns = paragraph ? 10 : 8;
		if ( ! text && viewport === 'mobile' ) {
			defaultColumns = 6;
		}
		const columnSpan = Math.min( gridColumns, defaultColumns );
		// A mobile editor also measures its desktop tracks at phone width. Use the
		// theme's reference width for the new block's desktop fallback instead.
		const useReference =
			viewport === 'desktop' &&
			mode !== 'desktop' &&
			geometry?.referenceWidth;
		const columns = useReference
			? columnTracks(
					Math.max(
						1,
						geometry.referenceWidth -
							geometry.padding.left -
							geometry.padding.right
					),
					geometry.columnGap ?? geometry.gap,
					gridColumns
				)
			: geometry?.contentColumns;
		const width = columns
			? columns[ columnSpan - 1 ].end - columns[ 0 ].start
			: null;
		// Rows and columns have different physical sizes. Round a square's height
		// to the nearest whole row rather than assuming equal cell counts.
		let rowSpan;
		if ( text ) {
			rowSpan = paragraph ? 3 : 2;
		} else if ( width === null ) {
			rowSpan = columnSpan;
		} else {
			rowSpan = Math.max(
				1,
				Math.min(
					MAX_ROWS,
					Math.round(
						( width / frameRatio + geometry.gap ) /
							rowPitch(
								useReference
									? {
											...geometry,
											rowHeight:
												geometry.referenceRowHeight ??
												geometry.rowHeight,
										}
									: geometry
							)
					)
				)
			);
		}
		return {
			gridColumns,
			columnSpan,
			rowSpan,
			...anchor,
			...( ! text
				? {
						frameRatio,
					}
				: {} ),
		};
	};
	let contentAttributes;
	if ( text ) {
		let defaultContent;
		if ( String( attributes.content || '' ) ) {
			defaultContent = attributes.content;
		} else if ( heading ) {
			defaultContent = DEFAULT_HEADING_CONTENT;
		} else {
			defaultContent = DEFAULT_PARAGRAPH_CONTENT;
		}
		contentAttributes = {
			content: defaultContent,
		};
	} else if ( buttons ) {
		contentAttributes = {
			layout: attributes.layout || {
				type: 'flex',
			},
		};
	} else if ( block.name === 'core/video' ) {
		contentAttributes = {};
	} else {
		contentAttributes = {
			sizeSlug: attributes.sizeSlug || 'large',
		};
	}
	let sizingAttributes;
	if ( text ) {
		sizingAttributes = {
			fitArea: saved.fitArea ?? ( heading && ! attributes.fitText ),
		};
	} else if ( buttons ) {
		sizingAttributes = {
			fitArea: false,
		};
	} else {
		sizingAttributes = {};
	}
	return {
		...block,
		attributes: {
			...attributes,
			...contentAttributes,
			[ ATTRIBUTE ]: compactCanvas( {
				...saved,
				...sizingAttributes,
				desktop: placementFor( 'desktop' ),
				...( mode !== 'desktop' && ! saved[ mode ]
					? {
							[ mode ]: placementFor( mode ),
						}
					: {} ),
			} ),
		},
	};
}

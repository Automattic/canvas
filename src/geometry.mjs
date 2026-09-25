import { isFrameMedia } from './content-fill.mjs';
import {
	imageShape,
	imageFit,
	imageAspectRatio,
	imageShapeStretch,
	shapeMask,
} from './image-shapes.mjs';
import {
	mapCanvasPlacement,
	savedCanvasPlacement,
	occupiedRows,
	nudgeCanvasPlacement,
} from './canvas-geometry.mjs';
import { normalizeRotation } from './rotation.mjs';
import { imagePosition } from './image-position.mjs';
import { imageFrameRatio, mapImagePlacement } from './image-layout.mjs';
import { compactCanvas } from './serialization.mjs';
import { proportionalPlacement } from './proportional-layout.mjs';
import {
	ATTRIBUTE,
	COLUMNS,
	DEFAULT_MINIMUM,
	MAX_ROWS,
	bottomRow,
	projectPlacement,
	integer,
	minimumSpans,
	normalizePlacement,
} from './placement.mjs';

// Public layout API. Primitive placement math is independent of measured canvas
// geometry so both modules can share it without circular imports.
export * from './placement.mjs';
export function mapPlacement(
	value,
	mode,
	geometry,
	minimum = DEFAULT_MINIMUM
) {
	return geometry?.canvas
		? mapCanvasPlacement( value, mode, geometry, minimum, true, true )
		: normalizePlacement( value, mode, {}, minimum );
}

// Resolve inheritance without writing it back into the post. PHP mirrors this
// fallback for blocks pasted without metadata and for rendering without JS.
export function resolveLayouts( blocks, geometry = {} ) {
	const counts = Object.fromEntries(
		Object.keys( COLUMNS ).map( ( mode ) => [
			mode,
			geometry[ mode ]?.gridColumns ?? COLUMNS[ mode ],
		] )
	);
	const nextRow = {
		desktop: 1,
		tablet: 1,
		mobile: 1,
	};
	const layouts = Object.fromEntries(
		blocks.map( ( block, index ) => {
			let saved = block.attributes?.[ ATTRIBUTE ] || {};
			if ( block.name !== 'core/image' || block.canvasNested ) {
				saved = {
					...saved,
					...Object.fromEntries(
						Object.keys( COLUMNS )
							.filter( ( mode ) => saved[ mode ]?.fillHeight )
							.map( ( mode ) => [
								mode,
								{ ...saved[ mode ], fillHeight: undefined },
							] )
					),
				};
			}
			const minimum = minimumSpans( block.name );
			const source = normalizePlacement(
				saved.desktop ?? {
					gridColumns: counts.desktop,
				},
				'desktop',
				{
					row: nextRow.desktop,
					layer: index + 1,
				},
				minimum
			);
			const desktop = projectPlacement(
				source,
				'desktop',
				'desktop',
				minimum,
				counts.desktop
			);
			const tabletSource = saved.tablet
				? normalizePlacement(
						saved.tablet,
						'tablet',
						{
							row: nextRow.tablet,
							layer: index + 1,
						},
						minimum
					)
				: source;
			const tablet =
				! saved.tablet && geometry.tablet?.automatic?.[ index ]
					? {
							...geometry.tablet.automatic[ index ],
							rotation: desktop.rotation ?? 0,
						}
					: projectPlacement(
							tabletSource,
							saved.tablet ? 'tablet' : 'desktop',
							'tablet',
							minimum,
							counts.tablet
						);
			let mobile;
			if ( saved.mobile ) {
				mobile = projectPlacement(
					normalizePlacement(
						saved.mobile,
						'mobile',
						{
							row: nextRow.mobile,
							layer: index + 1,
						},
						minimum
					),
					'mobile',
					'mobile',
					minimum,
					counts.mobile
				);
			} else if ( geometry.mobile?.automatic?.[ index ] ) {
				mobile = {
					...geometry.mobile.automatic[ index ],
					rotation: tablet.rotation ?? 0,
				};
			} else {
				mobile = projectPlacement(
					tabletSource,
					saved.tablet ? 'tablet' : 'desktop',
					'mobile',
					minimum,
					counts.mobile
				);
			}
			for ( const [ mode, placement ] of Object.entries( {
				desktop,
				tablet,
				mobile,
			} ) ) {
				nextRow[ mode ] = Math.max(
					nextRow[ mode ],
					occupiedRows( placement ) + 1
				);
			}
			let fit;
			if ( block.name === 'core/image' ) {
				fit = imageFit( saved );
			} else if ( block.name === 'core/video' ) {
				fit = saved.fill === false ? 'contain' : 'cover';
			} else if ( saved.fit === 'contain' ) {
				fit = 'contain';
			} else {
				fit = 'cover';
			}
			return [
				block.clientId,
				{
					image: block.name === 'core/image',
					video: block.name === 'core/video',
					shape:
						block.name === 'core/image'
							? imageShape( saved.shape )
							: 'none',
					shapeStretch:
						block.name === 'core/image' &&
						imageShapeStretch( saved ),
					fit,
					fitArea: saved.fitArea === true,
					imagePosition: imagePosition( saved.imagePosition ),
					aspectRatio:
						block.name === 'core/image'
							? imageAspectRatio( saved )
							: undefined,
					...Object.fromEntries(
						Object.entries( {
							desktop,
							tablet,
							mobile,
						} ).map( ( [ mode, placement ] ) => {
							placement = {
								...placement,
								layer: saved.layers?.[ mode ] ?? index + 1,
							};
							if (
								! saved[ mode ] &&
								geometry[ mode ]?.proportional &&
								! geometry[ mode ].automatic?.[ index ]
							) {
								const fromTablet =
									mode === 'mobile' && saved.tablet;
								return [
									mode,
									proportionalPlacement(
										{
											...( fromTablet
												? tabletSource
												: source ),
											layer: placement.layer,
										},
										fromTablet ? 'tablet' : 'desktop',
										mode,
										geometry[ mode ],
										geometry[
											fromTablet ? 'tablet' : 'desktop'
										],
										minimum,
										isFrameMedia( block.name )
									),
								];
							}
							if (
								isFrameMedia( block.name ) &&
								geometry[ mode ]?.canvas &&
								! (
									mode !== 'desktop' &&
									! saved[ mode ] &&
									geometry[ mode ].automatic?.[ index ]
								)
							) {
								let sourceMode;
								if ( saved[ mode ] ) {
									sourceMode = mode;
								} else if (
									mode === 'mobile' &&
									saved.tablet
								) {
									sourceMode = 'tablet';
								} else {
									sourceMode = 'desktop';
								}
								const authored =
									sourceMode === 'desktop'
										? source
										: normalizePlacement(
												saved[ sourceMode ],
												sourceMode
											);
								const left =
									authored.anchors.left ??
									authored.column - 1;
								const right =
									authored.anchors.right ??
									authored.column + authored.columnSpan - 1;
								// Equal authored margins express centering even without a precise
								// frame. Preserve that intent before ratio fitting changes the size.
								const center = {
									x:
										typeof left === 'number' &&
										typeof right === 'number' &&
										left + right === authored.gridColumns,
								};
								if (
									sourceMode !== mode &&
									center.x &&
									! authored.free
								) {
									// Project a centered image's span as a whole. Independently rounded
									// sides can discard a mobile column; its precise centered frame can
									// retain the width even when the target has an odd number of cells.
									const columnSpan = Math.max(
										1,
										Math.round(
											( ( right - left ) *
												counts[ mode ] ) /
												authored.gridColumns
										)
									);
									const anchors = {
										...placement.anchors,
									};
									delete anchors.left;
									delete anchors.right;
									placement = {
										...placement,
										columnSpan,
										anchors,
									};
								}
								return [
									mode,
									mapImagePlacement(
										placement,
										mode,
										geometry[ mode ],
										imageFrameRatio(
											authored,
											sourceMode,
											geometry[ sourceMode ]
										),
										minimum,
										center
									),
								];
							}
							// Editing gestures start from the visible, content-grown container box.
							// Ignore stale measurements after an authored placement changes.
							const measured =
								block.name === 'core/group' &&
								geometry[ mode ]?.containers?.[
									block.clientId
								];
							return [
								mode,
								mapPlacement(
									measured &&
										measured.source ===
											JSON.stringify( saved )
										? measured.placement
										: placement,
									mode,
									geometry[ mode ],
									minimum
								),
							];
						} )
					),
				},
			];
		} )
	);
	return layouts;
}

// Persist only the edited viewport. Shared content/fit edits must use the raw
// attributes too, never the resolved layouts above.
export function savePlacement(
	saved = {},
	resolved,
	mode,
	placement,
	minimum = DEFAULT_MINIMUM,
	inferFillHeight = true
) {
	const next = savedCanvasPlacement(
		changeViewport( resolved, mode, placement, minimum )[ mode ]
	);
	if ( ( resolved.image || resolved.video ) && placement._rect?.height > 0 ) {
		const before = resolved[ mode ]._rect;
		const edited =
			before &&
			[ 'left', 'top', 'width', 'height' ].some(
				( key ) =>
					Math.abs( before[ key ] - placement._rect[ key ] ) > 0.001
			);
		if (
			resolved.image &&
			inferFillHeight &&
			edited &&
			! resolved.parents?.length
		) {
			const { top, height } = placement._rect;
			if (
				Math.abs( top ) < 0.001 &&
				Math.abs( top + height - placement._canvas.height ) < 0.001
			) {
				next.fillHeight = true;
			} else {
				delete next.fillHeight;
			}
		}
		const resized =
			! before ||
			Math.abs( before.width - placement._rect.width ) > 0.001 ||
			Math.abs( before.height - placement._rect.height ) > 0.001;
		if ( ! next.fillHeight || edited ) {
			next.frameRatio =
				resized ||
				( resolved[ mode ].fillHeight && ! next.fillHeight ) ||
				placement.frameRatio !== resolved[ mode ].frameRatio
					? placement._rect.width / placement._rect.height
					: ( resolved[ mode ].frameRatio ??
						placement._rect.width / placement._rect.height );
		}
	}
	return compactCanvas( {
		...saved,
		desktop: saved.desktop || savedCanvasPlacement( resolved.desktop ),
		[ mode ]: next,
	} );
}
export function minimumRows( attributes, mode ) {
	return integer(
		attributes[ mode + 'Rows' ],
		mode === 'desktop' ? 12 : 1,
		1,
		MAX_ROWS
	);
}
export function requiredRows( layouts, mode ) {
	return Math.max(
		1,
		...Object.values( layouts ).map( ( layout ) =>
			occupiedRows( layout[ mode ] )
		)
	);
}
export function changeViewport(
	layout,
	mode,
	placement,
	minimum = DEFAULT_MINIMUM
) {
	if ( placement._canvas ) {
		return {
			...layout,
			[ mode ]: {
				...placement,
				_base: {
					...placement._base,
					layer: placement.layer,
					...( placement.rotation !== undefined
						? {
								rotation: normalizeRotation(
									placement.rotation
								),
							}
						: {} ),
				},
			},
		};
	}
	return {
		...layout,
		[ mode ]: normalizePlacement( placement, mode, {}, minimum ),
	};
}
export function nudge( placement, mode, x, y, minimum = DEFAULT_MINIMUM ) {
	if ( placement._canvas ) {
		return nudgeCanvasPlacement( placement, mode, x, y, minimum );
	}
	return normalizePlacement(
		{
			...placement,
			column: placement.column + x,
			row: placement.row + y,
		},
		mode
	);
}
export function duplicateLayout( layout, saved = {} ) {
	const duplicate = {
		...saved,
	};
	for ( const mode of Object.keys( COLUMNS ) ) {
		if ( mode !== 'desktop' && ! saved[ mode ] ) {
			continue;
		}
		const placement = layout[ mode ];
		// Step inward at the far edges; full-width items can still move down.
		const x =
			placement.column + placement.columnSpan <=
			( placement.columns ?? COLUMNS[ mode ] )
				? 1
				: -1;
		const y = bottomRow( placement ) < MAX_ROWS ? 1 : -1;
		duplicate[ mode ] = savedCanvasPlacement(
			changeViewport( layout, mode, nudge( placement, mode, x, y ) )[
				mode
			]
		);
	}
	return compactCanvas( duplicate );
}
export function reorderLayer( layouts, id, mode, direction ) {
	const ids = Object.keys( layouts ).sort(
		( a, b ) => layouts[ a ][ mode ].layer - layouts[ b ][ mode ].layer
	);
	const index = ids.indexOf( id );
	const next = Math.max( 0, Math.min( ids.length - 1, index + direction ) );
	if ( index < 0 || index === next ) {
		return layouts;
	}
	ids.splice( index, 1 );
	ids.splice( next, 0, id );
	return Object.fromEntries(
		ids.map( ( key, i ) => [
			key,
			changeViewport( layouts[ key ], mode, {
				...layouts[ key ][ mode ],
				layer: i + 1,
			} ),
		] )
	);
}
export function layoutVariables( layout ) {
	const vars = {
		'--canvas-fit': layout.fit,
		'--canvas-image-mask': shapeMask( layout.shape, layout.shapeStretch ),
	};
	const position = imagePosition(
		layout.fit === 'contain' ? null : layout.imagePosition
	);
	vars[ '--canvas-image-position' ] =
		`${ position.x * 100 }% ${ position.y * 100 }%`;
	for ( const mode of Object.keys( COLUMNS ) ) {
		if ( layout[ mode ]._grid ) {
			for ( const [ key, value ] of Object.entries(
				layout[ mode ]._grid
			) ) {
				vars[ `--canvas-${ mode }-line-${ key }` ] = value;
			}
		}
		for ( const [ key, value ] of Object.entries(
			savedCanvasPlacement( layout[ mode ] )
		) ) {
			if ( [ 'free', 'anchors', 'fillHeight' ].includes( key ) ) {
				continue;
			}
			vars[ `--canvas-${ mode }-${ key }` ] = value;
		}
	}
	return vars;
}

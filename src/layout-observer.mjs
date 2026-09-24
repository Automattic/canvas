import { paintImageShapes } from './image-shapes.mjs';
import {
	isCanvasGroup,
	layoutLeaves,
	canvasBlocks,
	resolveCanvasLayouts,
	paintLayers,
} from './canvas-groups.mjs';
import {
	ATTRIBUTE,
	COLUMNS,
	columnsForAlignment,
	MAX_ROWS,
	rowHeightForWidth,
	mapPlacement,
	resolveLayouts,
} from './geometry.mjs';
import {
	canvasColumns,
	canvasRows,
	occupiedRows,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { freeFrameStyles } from './aspect-ratio.mjs';
import { resolveAutomaticContent } from './automatic-content.mjs';
import { automaticCanvasRows } from './automatic-layout.mjs';
import { measureCanvasSpacing } from './spacing.mjs';
import { responsiveRowMetrics, sectionRows } from './section-layout.mjs';

// The editor and frontend share one measurement and track resolver. Core owns
// padding; the canvas consumes that space without changing the canvas's size.
export function observeCanvasLayout( grid, onChange ) {
	if ( ! grid ) {
		return () => {};
	}
	const canvas = grid.closest( '.wp-block-tabor-canvas' );
	const parent =
		canvas.parentElement.closest( '.is-layout-constrained' ) ||
		canvas.parentElement;
	const doc = grid.ownerDocument;
	const view = doc.defaultView;
	let frame = 0;
	let disposed = false;
	let signature = '';
	const set = ( node, key, value ) => {
		if ( node.style.getPropertyValue( key ) !== String( value ) ) {
			node.style.setProperty( key, value );
		}
	};
	const watch = () => {
		styles.observe( doc.head, {
			childList: true,
			subtree: true,
			characterData: true,
		} );
		for ( const node of new Set( [
			doc.documentElement,
			doc.body,
			parent,
			canvas,
		] ) ) {
			styles.observe( node, {
				attributes: true,
				attributeFilter: [ 'class', 'style', 'data-canvas-spacing' ],
			} );
		}
		content.observe( grid, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: [
				'style',
				'data-canvas-layout',
				'data-canvas-auto',
				'data-canvas-text-fit',
				'data-canvas-desktop-minimum',
				'data-canvas-tablet-minimum',
				'data-canvas-mobile-minimum',
			],
		} );
	};
	const update = () => {
		frame = 0;
		// Our computed CSS variables must not reschedule our own observer.
		styles?.disconnect();
		content?.disconnect();
		const canvasCss = view.getComputedStyle( canvas );
		const padding = Object.fromEntries(
			[ 'top', 'right', 'bottom', 'left' ].map( ( side ) => [
				side,
				parseFloat(
					canvasCss.getPropertyValue( `padding-${ side }` )
				) || 0,
			] )
		);
		for ( const [ side, value ] of Object.entries( padding ) ) {
			set( canvas, `--canvas-pad-${ side }`, `${ value }px` );
		}
		canvas.setAttribute( 'data-canvas-canvas', 'true' );
		const bounds = grid.getBoundingClientRect();
		if ( ! bounds.width ) {
			if ( styles ) {
				watch();
			}
			return;
		}
		const probe = doc.createElement( 'div' );
		const wideSize = canvasCss
			.getPropertyValue( '--wp--style--global--wide-size' )
			.trim();
		probe.className = 'wp-block alignwide canvas-measure-wide';
		// An explicit width also fills a grid parent when auto margins disable stretch.
		probe.style.maxWidth = wideSize || 'none';
		// Core has already resolved global padding and per-block overrides here.
		canvas.append( probe );
		const wide = probe.getBoundingClientRect();
		probe.remove();
		const width = parseFloat( view.getComputedStyle( grid ).width );
		const scale = width / bounds.width;
		const start = Math.max(
			0,
			Math.min( width, ( wide.left - bounds.left ) * scale )
		);
		const end = Math.max(
			start,
			Math.min( width, ( wide.right - bounds.left ) * scale )
		);
		set( canvas, '--canvas-layout-left', `${ start }px` );
		set( canvas, '--canvas-layout-right', `${ width - end }px` );
		let align;
		if ( canvas.classList.contains( 'alignfull' ) ) {
			align = 'full';
		} else if ( canvas.classList.contains( 'alignwide' ) ) {
			align = 'wide';
		} else {
			align = undefined;
		}
		const desktopColumns = columnsForAlignment( 'desktop', align );
		const spacing = doc.createElement( 'div' );
		spacing.className = 'canvas-measure-spacing';
		canvas.append( spacing );
		const { gap, columnGap } = measureCanvasSpacing( canvas, spacing );
		spacing.style.width =
			canvasCss.getPropertyValue(
				align
					? '--wp--style--global--wide-size'
					: '--wp--style--global--content-size'
			) || '1340px';
		// Wide size limits the inner grid of a full-width canvas. Its reference
		// outer width includes native padding, as it does at smaller screen sizes.
		const referenceWidth =
			( parseFloat( view.getComputedStyle( spacing ).width ) || 1340 ) +
			( align === 'full' && wideSize ? padding.left + padding.right : 0 );
		spacing.remove();
		set( grid, '--canvas-gap', `${ gap }px` );
		set( grid, '--canvas-column-gap', `${ columnGap }px` );
		const geometry = {};
		const minimums = Object.fromEntries(
			Object.keys( COLUMNS ).map( ( viewport ) => [
				viewport,
				Number(
					grid.getAttribute( `data-canvas-${ viewport }-minimum` )
				) || ( viewport === 'desktop' ? 12 : 1 ),
			] )
		);
		for ( const viewport of Object.keys( COLUMNS ) ) {
			const count = minimums[ viewport ];
			// Keep the content grid and row sizing tied to the wide area. Extra
			// columns continue its pitch through the remaining canvas width.
			const gridPadding =
				viewport === 'desktop'
					? {
							...padding,
							left: Math.max( padding.left, start ),
							right: Math.max( padding.right, width - end ),
						}
					: padding;
			const columns = canvasColumns(
				width,
				padding,
				start,
				end,
				columnGap,
				viewport,
				columnsForAlignment( viewport, align ),
				gridPadding
			);
			const rowHeight = rowHeightForWidth(
				columns.contentColumns.at( -1 ).end -
					columns.contentColumns[ 0 ].start,
				viewport
			);
			const rowLayout = canvasRows(
				padding.top,
				padding.bottom,
				count,
				gap,
				rowHeight
			);
			set( grid, `--canvas-${ viewport }-tracks`, columns.template );
			set(
				grid,
				`--canvas-${ viewport }-row-tracks`,
				rowLayout.rowTemplate
			);
			geometry[ viewport ] = {
				...columns,
				...rowLayout,
				align,
				hasWide: !! wideSize,
				gap,
				referenceWidth,
				referenceColumns: desktopColumns,
				viewport,
				referenceRowHeight: rowHeightForWidth(
					referenceWidth - padding.left - padding.right,
					viewport
				),
			};
		}
		const nodes = [ ...grid.querySelectorAll( '.canvas__item' ) ].filter(
			( node ) => node.closest( '.canvas__grid' ) === grid
		);
		const elements = new Map();
		const children = new Map();
		nodes.forEach( ( node, index ) => {
			const parentItem = node.parentElement.closest( '.canvas__item' );
			const owner =
				parentItem && grid.contains( parentItem ) ? parentItem : null;
			if ( ! children.has( owner ) ) {
				children.set( owner, [] );
			}
			children.get( owner ).push( {
				node,
				index,
			} );
		} );
		const read = ( parentItem ) =>
			( children.get( parentItem ) || [] ).map( ( { node, index } ) => {
				let saved;
				try {
					saved = JSON.parse(
						node.getAttribute( 'data-canvas-layout' ) || '{}'
					);
				} catch {
					saved = {};
				}
				const id =
					node.getAttribute( 'data-canvas-item' ) || String( index );
				elements.set( id, node );
				const name = node.getAttribute( 'data-canvas-name' );
				return {
					clientId: id,
					name,
					attributes: {
						[ ATTRIBUTE ]: saved,
					},
					innerBlocks: saved.group === 1 ? read( node ) : [],
				};
			} );
		const blocks = read( null );
		const leaves = layoutLeaves( blocks );
		const items = leaves.map( ( block ) => elements.get( block.clientId ) );
		const authoredRows = sectionRows( leaves, minimums );
		for ( const viewport of Object.keys( COLUMNS ) ) {
			const g = geometry[ viewport ];
			geometry[ viewport ] = {
				...g,
				...canvasRows(
					padding.top,
					padding.bottom,
					authoredRows[ viewport ],
					g.gap,
					g.rowHeight
				),
			};
		}
		for ( const viewport of Object.keys( COLUMNS ) ) {
			geometry[ viewport ] = responsiveRowMetrics(
				leaves,
				viewport,
				geometry
			);
			set(
				grid,
				`--canvas-${ viewport }-row-tracks`,
				geometry[ viewport ].rowTemplate
			);
			set(
				grid,
				`--canvas-${ viewport }-tracks`,
				geometry[ viewport ].template
			);
		}
		const allBlocks = canvasBlocks( blocks );
		const framed = allBlocks.some(
			( block ) =>
				isCanvasGroup( block ) || block.attributes[ ATTRIBUTE ]?.offset
		);
		const insets = {};
		for ( const block of allBlocks.filter( isCanvasGroup ) ) {
			const item = elements.get( block.clientId );
			const surface = item.matches( '.wp-block-group' )
				? item
				: item.firstElementChild;
			const css = view.getComputedStyle( surface );
			insets[ block.clientId ] = Object.fromEntries(
				[ 'top', 'right', 'bottom', 'left' ].map( ( side ) => [
					side,
					( parseFloat( css.getPropertyValue( 'padding-' + side ) ) ||
						0 ) +
						( parseFloat(
							css.getPropertyValue( 'border-' + side + '-width' )
						) || 0 ),
				] )
			);
		}
		for ( const g of Object.values( geometry ) ) {
			g.groupInsets = insets;
		}
		// Read authored data, not our last measured CSS output. This also projects
		// each target directly from its original density, avoiding double rounding.
		const layouts = resolveLayouts(
			leaves.map( ( block, index ) => ( {
				...block,
				clientId: index,
			} ) ),
			geometry
		);
		const placements = Object.fromEntries(
			Object.keys( COLUMNS ).map( ( viewport ) => [
				viewport,
				items.map( ( _, index ) => layouts[ index ][ viewport ] ),
			] )
		);
		const mode = view
			.getComputedStyle( grid )
			.getPropertyValue( '--canvas-viewport' )
			.trim();
		const rowGap = geometry[ mode ]?.gap ?? gap;
		set( grid, '--canvas-gap', `${ rowGap }px` );
		// Every viewport resolves readable content, including containers, which
		// use their authored area as a minimum. Explicit placements (desktop is
		// always explicit) only grow downward and clear what they newly cover.
		if ( geometry[ mode ] ) {
			const sources = items.map( ( item, index ) =>
				mode === 'mobile' &&
				! item
					.getAttribute( 'data-canvas-auto' )
					?.split( ' ' )
					.includes( 'tablet' )
					? placements.tablet[ index ]
					: placements.desktop[ index ]
			);
			const authored = leaves.map(
				( block, index ) =>
					block.attributes[ ATTRIBUTE ]?.[
						sources[ index ]._canvas.viewport || 'desktop'
					]
			);
			let automatic = resolveAutomaticContent(
				items,
				mode,
				geometry[ mode ],
				placements[ mode ],
				sources,
				authored,
				{ explicitReadable: true }
			);
			const occupied = Math.max(
				1,
				...placements[ mode ].map( ( placement, index ) => {
					const value = automatic[ index ];
					return value
						? occupiedRows(
								mapPlacement( value, mode, geometry[ mode ] )
							)
						: occupiedRows( placement );
				} )
			);
			const rows = automaticCanvasRows( occupied, authoredRows[ mode ] );
			if ( rows !== geometry[ mode ].coreRows ) {
				geometry[ mode ] = {
					...geometry[ mode ],
					...canvasRows(
						padding.top,
						padding.bottom,
						rows,
						rowGap,
						geometry[ mode ].rowHeight
					),
				};
				placements[ mode ] = placements[ mode ].map( ( placement ) =>
					mapPlacement( placement._base, mode, geometry[ mode ] )
				);
				automatic = resolveAutomaticContent(
					items,
					mode,
					geometry[ mode ],
					placements[ mode ],
					sources,
					authored,
					{ explicitReadable: true }
				);
			}
			geometry[ mode ] = {
				...geometry[ mode ],
				...canvasRows(
					padding.top,
					padding.bottom,
					rows,
					rowGap,
					geometry[ mode ].rowHeight
				),
				automatic,
			};
			set(
				grid,
				`--canvas-${ mode }-row-tracks`,
				geometry[ mode ].rowTemplate
			);
			placements[ mode ] = placements[ mode ].map(
				( placement, index ) =>
					automatic[ index ]
						? mapPlacement(
								automatic[ index ],
								mode,
								geometry[ mode ]
							)
						: mapPlacement(
								placement._base,
								mode,
								geometry[ mode ]
							)
			);
		}
		for ( const [ viewport, values ] of Object.entries( placements ) ) {
			// Smooth locked frames may end between tracks or grow at a wider canvas.
			const rows = Math.max(
				geometry[ viewport ].coreRows,
				...values.map( occupiedRows )
			);
			if ( rows > geometry[ viewport ].coreRows ) {
				geometry[ viewport ] = {
					...geometry[ viewport ],
					...canvasRows(
						padding.top,
						padding.bottom,
						rows,
						geometry[ viewport ].gap,
						geometry[ viewport ].rowHeight
					),
				};
				set(
					grid,
					`--canvas-${ viewport }-row-tracks`,
					geometry[ viewport ].rowTemplate
				);
			}
			values.forEach( ( placement, index ) => {
				for ( const [ key, value ] of Object.entries(
					placement._grid
				) ) {
					set(
						items[ index ],
						`--canvas-${ viewport }-line-${ key }`,
						value
					);
				}
			} );
		}
		items.forEach( ( item, index ) => {
			const id = item.getAttribute( 'data-canvas-item' );
			if (
				id &&
				item.classList.contains( 'canvas__container' ) &&
				geometry[ mode ]
			) {
				geometry[ mode ].containers ||= {};
				geometry[ mode ].containers[ id ] = {
					source: item.getAttribute( 'data-canvas-layout' ) || '{}',
					placement: savedCanvasPlacement(
						placements[ mode ][ index ]
					),
				};
			}
			const precise = freeFrameStyles( placements[ mode ]?.[ index ] );
			for ( const key of [ 'width', 'height', 'left', 'top' ] ) {
				const property = `--canvas-free-${ key }`;
				if ( precise[ property ] ) {
					set( item, property, precise[ property ] );
				} else {
					item.style.removeProperty( property );
				}
			}
			if ( geometry[ mode ]?.automatic?.[ index ] ) {
				item.setAttribute( 'data-canvas-auto-active', mode );
			} else {
				item.removeAttribute( 'data-canvas-auto-active' );
			}
		} );
		if ( framed ) {
			const flat = Object.fromEntries(
				leaves.map( ( block, index ) => [
					block.clientId,
					{
						...layouts[ index ],
						...Object.fromEntries(
							Object.keys( COLUMNS ).map( ( viewport ) => [
								viewport,
								placements[ viewport ][ index ],
							] )
						),
					},
				] )
			);
			const resolved = resolveCanvasLayouts( blocks, geometry, flat );
			const layers = geometry[ mode ]
				? paintLayers( blocks, resolved, mode )
				: {};
			for ( const block of allBlocks ) {
				const item = elements.get( block.clientId ),
					layout = resolved[ block.clientId ];
				const p = layout?.[ mode ];
				if ( ! p?._rect ) {
					continue;
				}
				const parentId = layout.parents.at( -1 );
				const parentRect = parentId
					? resolved[ parentId ][ mode ]._rect
					: {
							left: 0,
							top: 0,
						};
				const parentElement = parentId && elements.get( parentId );
				const parentCss =
					parentElement && view.getComputedStyle( parentElement );
				const rect = p._rect;
				item.setAttribute( 'data-canvas-frame', '' );
				if ( isCanvasGroup( block ) ) {
					item.setAttribute( 'data-canvas-group', '' );
				}
				set(
					item,
					'--canvas-frame-left',
					rect.left -
						parentRect.left -
						( parseFloat( parentCss?.borderLeftWidth ) || 0 ) +
						'px'
				);
				set(
					item,
					'--canvas-frame-top',
					rect.top -
						parentRect.top -
						( parseFloat( parentCss?.borderTopWidth ) || 0 ) +
						'px'
				);
				set( item, '--canvas-frame-width', rect.width + 'px' );
				set( item, '--canvas-frame-height', rect.height + 'px' );
				set( item, '--canvas-frame-layer', layers[ block.clientId ] );
				set(
					item,
					'--canvas-frame-rotation',
					( p.rotation || 0 ) + 'deg'
				);
			}
			// Absolutely placed groups still contribute to the canvas height.
			if ( geometry[ mode ] ) {
				const rows = Math.min(
					MAX_ROWS,
					Math.max(
						geometry[ mode ].coreRows,
						...blocks.map( ( block ) =>
							occupiedRows( resolved[ block.clientId ][ mode ] )
						)
					)
				);
				geometry[ mode ] = {
					...geometry[ mode ],
					...canvasRows(
						padding.top,
						padding.bottom,
						rows,
						rowGap,
						geometry[ mode ].rowHeight
					),
				};
				set(
					grid,
					'--canvas-' + mode + '-row-tracks',
					geometry[ mode ].rowTemplate
				);
			}
		} else {
			nodes.forEach( ( item ) =>
				item.removeAttribute( 'data-canvas-frame' )
			);
			for ( const viewport of Object.keys( COLUMNS ) ) {
				items
					.map( ( item, index ) => ( {
						item,
						layer: layouts[ index ][ viewport ].layer,
					} ) )
					.sort( ( a, b ) => a.layer - b.layer )
					.forEach( ( { item }, index ) =>
						set( item, `--canvas-${ viewport }-layer`, index + 1 )
					);
			}
		}
		paintImageShapes( grid, set );
		grid.canvasGeometry = geometry;
		const next = JSON.stringify( geometry );
		if ( next !== signature ) {
			signature = next;
			onChange?.( geometry );
			grid.dispatchEvent(
				new view.CustomEvent( 'canvas-layout-change' )
			);
		}
		if ( styles ) {
			watch();
		}
	};
	const schedule = () => {
		if ( ! disposed && ! frame ) {
			frame = view.requestAnimationFrame( () => update() );
		}
	};
	const styles = new view.MutationObserver( schedule );
	const content = new view.MutationObserver( ( records ) => {
		if ( records.length ) {
			schedule();
		}
	} );
	const resize = new view.ResizeObserver( schedule );
	resize.observe( parent );
	resize.observe( canvas );
	resize.observe( grid );
	update();
	view.addEventListener( 'resize', schedule );
	grid.addEventListener( 'load', schedule, true );
	doc.fonts?.addEventListener( 'loadingdone', schedule );
	doc.fonts?.ready.then( schedule );
	return () => {
		disposed = true;
		resize.disconnect();
		styles.disconnect();
		content.disconnect();
		view.removeEventListener( 'resize', schedule );
		grid.removeEventListener( 'load', schedule, true );
		doc.fonts?.removeEventListener( 'loadingdone', schedule );
		view.cancelAnimationFrame( frame );
		canvas.removeAttribute( 'data-canvas-canvas' );
		for ( const key of [
			'layout-left',
			'layout-right',
			'pad-top',
			'pad-right',
			'pad-bottom',
			'pad-left',
		] ) {
			canvas.style.removeProperty( `--canvas-${ key }` );
		}
		delete grid.canvasGeometry;
	};
}

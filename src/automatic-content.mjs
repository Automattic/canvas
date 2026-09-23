import { normalizePlacement } from './placement.mjs';
import {
	fittingFontSize,
	measureText,
	textElement,
	MIN_TEXT_SIZE,
} from './text-fit.mjs';
import { savedCanvasPlacement } from './canvas-geometry.mjs';
import { readablePlacements } from './automatic-layout.mjs';

// Measure a detached copy at its natural content height. The live selection and
// core block markup remain untouched, including native button layout.
export function measureBox( element, width, buttons = false ) {
	const clone = element.cloneNode( true );
	for ( const node of [ clone, ...clone.querySelectorAll( '*' ) ] ) {
		node.removeAttribute( 'id' );
		node.removeAttribute( 'contenteditable' );
	}
	clone.removeAttribute( 'data-canvas-auto-active' );
	clone.removeAttribute( 'data-canvas-frame' );
	clone.setAttribute( 'aria-hidden', 'true' );
	clone.inert = true;
	clone.classList.add( 'canvas-measure-box' );
	clone.style.setProperty( '--canvas-measure-width', width );
	element.parentElement.append( clone );
	if ( buttons ) {
		clone.classList.add( 'canvas-measure-buttons' );
		// A button's readable minimum is its whole label plus native padding, not
		// its longest word. Preserve core's flex layout when measuring its height.
		if ( width === 'max-content' ) {
			clone.classList.add( 'canvas-measure-nowrap' );
		}
	}
	try {
		return {
			width: clone.getBoundingClientRect().width,
			height: Math.max( clone.offsetHeight, clone.scrollHeight, 48 ),
		};
	} finally {
		clone.remove();
	}
}
export function resolveAutomaticContent(
	items,
	mode,
	geometry,
	placements,
	sources,
	authoredSources = [],
	{ explicitReadable = false } = {}
) {
	const columns = geometry.contentColumns;
	const available = columns.at( -1 ).end - columns[ 0 ].start;
	const data = items.map( ( element, index ) => {
		const current = placements[ index ];
		const source = authoredSources[ index ]
			? normalizePlacement(
					authoredSources[ index ],
					sources[ index ]._canvas.viewport || 'desktop'
				)
			: savedCanvasPlacement( sources[ index ] );
		const text = textElement( element );
		const buttons =
			element.matches( '.wp-block-buttons' ) ||
			element.firstElementChild?.matches( '.wp-block-buttons' );
		const container = element.classList.contains( 'canvas__container' );
		let kind;
		if ( container ) {
			kind = 'container';
		} else if ( element.classList.contains( 'canvas__image' ) ) {
			kind = 'image';
		} else if ( text?.matches( 'h1,h2,h3,h4,h5,h6' ) ) {
			kind = 'heading';
		} else if ( text ) {
			kind = 'paragraph';
		} else if ( buttons ) {
			kind = 'buttons';
		} else {
			kind = 'other';
		}
		const automatic = element
			.getAttribute( 'data-canvas-auto' )
			?.split( ' ' )
			.includes( mode );
		const areaFit =
			element.getAttribute( 'data-canvas-text-fit' ) === 'true';
		const widthFit = text?.classList.contains( 'has-fit-text' );
		let minWidth = 0;
		if ( automatic && kind !== 'image' && ! areaFit ) {
			if ( container ) {
				minWidth = measureBox( element, 'min-content' ).width;
			} else if ( buttons ) {
				minWidth = measureBox( element, 'max-content', true ).width;
			} else {
				minWidth =
					measureText(
						element,
						'min-content',
						( measure, { fontSize } ) =>
							measure( widthFit ? MIN_TEXT_SIZE : fontSize )
								.width,
						true
					) ?? measureBox( element, 'min-content' ).width;
			}
		}
		return {
			element,
			index,
			kind,
			source,
			automatic,
			explicitReadable: explicitReadable && ! automatic,
			areaFit,
			widthFit,
			minWidth: Math.min( available, minWidth ),
			sourceLeft: ( current._rect.left - columns[ 0 ].start ) / available,
			sourceRight:
				( current._rect.left +
					current._rect.width -
					columns[ 0 ].start ) /
				available,
		};
	} );
	const measure = ( item, width ) => {
		if ( item.widthFit ) {
			return measureText(
				item.element,
				width,
				( measureAtSize ) =>
					measureAtSize(
						fittingFontSize( measureAtSize, width, Infinity )
					).height,
				true
			);
		}
		const height =
			item.kind === 'container'
				? null
				: measureText(
						item.element,
						width,
						( measureAtSize, { fontSize } ) =>
							measureAtSize( fontSize ).height,
						true
					);
		return (
			height ??
			measureBox( item.element, `${ width }px`, item.kind === 'buttons' )
				.height
		);
	};
	return readablePlacements( data, mode, geometry, placements, measure );
}

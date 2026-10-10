import { FLOW_BLOCKS, normalizePlacement } from './placement.mjs';
import { measureWidthFit, measureText, textElement } from './text-fit.mjs';
import { savedCanvasPlacement } from './canvas-geometry.mjs';
import { readablePlacements } from './automatic-layout.mjs';
import { intrinsicBoxSize } from './measurement-box.mjs';

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
		const bounds = intrinsicBoxSize( clone );
		return {
			width: bounds.width,
			height: Math.max(
				clone.offsetHeight,
				clone.scrollHeight,
				Math.ceil( bounds.height || 0 ),
				buttons ? 48 : 0
			),
		};
	} finally {
		clone.remove();
	}
}

// Use the same natural content measurement for layout and live resizing.
export function readableContentHeight( element, width, textMeasurements ) {
	if ( isHiddenContent( element ) ) {
		return 0;
	}
	const height = usesIntrinsicHeight( element )
		? null
		: measureText(
				element,
				width,
				( measureAtSize, { fontSize } ) =>
					measureAtSize( fontSize ).height,
				true,
				false,
				textMeasurements
			);
	return (
		height ??
		measureBox(
			element,
			`${ width }px`,
			element.matches( '.wp-block-buttons' ) ||
				element.firstElementChild?.matches( '.wp-block-buttons' )
		).height
	);
}

export function isHiddenContent( element ) {
	const view = element.ownerDocument?.defaultView;
	if ( ! view ) {
		return false;
	}
	return (
		view.getComputedStyle( element ).display === 'none' ||
		( element.childElementCount === 1 &&
			view.getComputedStyle( element.firstElementChild ).display ===
				'none' )
	);
}

export const usesIntrinsicHeight = ( element ) =>
	element.classList.contains( 'canvas__container' ) ||
	FLOW_BLOCKS.includes( element.getAttribute( 'data-canvas-name' ) ) ||
	( element.querySelectorAll?.( 'h1,h2,h3,h4,h5,h6,p' ).length || 0 ) > 1;

export function canResizeReadableContent( element ) {
	return (
		!! element &&
		! element.classList.contains( 'canvas__image' ) &&
		! element.classList.contains( 'canvas__video' ) &&
		element.getAttribute( 'data-canvas-text-fit' ) !== 'true' &&
		( usesIntrinsicHeight( element ) ||
			! textElement( element )?.classList.contains( 'has-fit-text' ) )
	);
}
export function resolveAutomaticContent(
	items,
	mode,
	geometry,
	placements,
	sources,
	authoredSources = [],
	{ explicitReadable = false, textMeasurements } = {}
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
		const text = usesIntrinsicHeight( element )
			? null
			: textElement( element );
		const buttons =
			element.matches( '.wp-block-buttons' ) ||
			element.firstElementChild?.matches( '.wp-block-buttons' );
		const container = usesIntrinsicHeight( element );
		let kind;
		if ( container ) {
			kind = 'container';
		} else if (
			element.classList.contains( 'canvas__image' ) ||
			element.classList.contains( 'canvas__video' )
		) {
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
		if (
			automatic &&
			kind !== 'image' &&
			! areaFit &&
			! widthFit &&
			! isHiddenContent( element )
		) {
			if ( container ) {
				minWidth = measureBox( element, 'min-content' ).width;
			} else if ( buttons ) {
				minWidth = measureBox( element, 'max-content', true ).width;
			} else {
				minWidth =
					measureText(
						element,
						'min-content',
						( measure, { fontSize } ) => measure( fontSize ).width,
						true,
						false,
						textMeasurements
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
			return measureWidthFit( item.element, width, textMeasurements )
				.height;
		}
		return readableContentHeight( item.element, width, textMeasurements );
	};
	return readablePlacements( data, mode, geometry, placements, measure );
}

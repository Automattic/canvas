import { textElement } from './text-fit.mjs';

// Natural text keeps its readable theme size on small screens. When a
// full-width composition grows beyond its reference size, its text and button
// labels grow with the same scale as its frames. Fitted text already owns this.
export function scaleCanvasContent( items, geometry, set, placements = [] ) {
	const scale =
		geometry?.align === 'full' && geometry.viewport === 'desktop'
			? Math.max( 1, geometry.contentScale || 1 )
			: 1;
	const elements = new Map();
	for ( const [ index, item ] of items.entries() ) {
		const anchors = placements[ index ]?._base?.anchors || {};
		const constrained =
			anchors.left !== undefined &&
			anchors.right !== undefined &&
			Object.values( anchors ).some( ( anchor ) =>
				[ 'wide', 'wide-start', 'wide-end' ].includes( anchor )
			);
		const itemScale = constrained ? 1 : scale;
		const text = textElement( item );
		const texts = item.classList.contains( 'canvas__container' )
			? item.querySelectorAll( 'h1,h2,h3,h4,h5,h6,p' )
			: [ text ].filter( Boolean );
		for ( const node of texts ) {
			if (
				node.closest( '.canvas__item' ) === item &&
				! node.closest( '[data-canvas-text-fit="true"]' ) &&
				! node.classList.contains( 'has-fit-text' )
			) {
				elements.set( node, itemScale );
			}
		}
		for ( const button of item.querySelectorAll(
			'.wp-block-button__link'
		) ) {
			if ( button.closest( '.canvas__item' ) === item ) {
				elements.set( button, itemScale );
			}
		}
		// Also clear our output after a block switches to fitted text.
		for ( const node of [
			item,
			...item.querySelectorAll( '[data-canvas-content-scaled]' ),
		] ) {
			node.removeAttribute( 'data-canvas-content-scaled' );
		}
	}
	// Snapshot all native sizes before applying any scaled size to ancestors.
	const sizes = [ ...elements ].map( ( [ element, itemScale ] ) => {
		const css =
			element.ownerDocument.defaultView.getComputedStyle( element );
		const size = parseFloat( css.fontSize );
		return {
			element,
			itemScale,
			size,
			leading:
				css.lineHeight === 'normal'
					? 'normal'
					: String( parseFloat( css.lineHeight ) / size ),
		};
	} );
	for ( const { element, itemScale, size, leading } of sizes ) {
		if ( itemScale > 1 && size > 0 ) {
			set(
				element,
				'--canvas-content-font-size',
				`${ size * itemScale }px`
			);
			set( element, '--canvas-content-line-height', leading );
			element.setAttribute( 'data-canvas-content-scaled', '' );
		} else {
			element.style.removeProperty( '--canvas-content-font-size' );
			element.style.removeProperty( '--canvas-content-line-height' );
		}
	}
}

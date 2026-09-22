import { imageShape } from './image-shapes.mjs';
import { ATTRIBUTE } from './placement.mjs';
import { radiusEditableUnit, radiusModel } from './radius.mjs';
const CSS_CORNERS = [
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-right-radius',
	'border-bottom-left-radius',
];
const transparent = ( color ) =>
	! color ||
	color === 'transparent' ||
	/(?:,\s*0(?:\.0+)?|\/\s*0(?:\.0+)?%?)\s*\)$/.test( color );
function hasSurface( css ) {
	return (
		! transparent( css.backgroundColor ) ||
		css.backgroundImage !== 'none' ||
		[ 'Top', 'Right', 'Bottom', 'Left' ].some(
			( side ) =>
				parseFloat( css[ `border${ side }Width` ] ) > 0 &&
				! transparent( css[ `border${ side }Color` ] )
		)
	);
}
function unitSize( unit, element, css ) {
	const view = element.ownerDocument.defaultView;
	if ( unit === 'px' || unit === '%' ) {
		return 1;
	}
	if ( unit === 'em' ) {
		return parseFloat( css.fontSize );
	}
	if ( unit === 'rem' ) {
		return parseFloat(
			view.getComputedStyle( element.ownerDocument.documentElement )
				.fontSize
		);
	}
	// Ask CSS to resolve other native length units, including viewport units.
	const probe = element.ownerDocument.createElement( 'span' );
	probe.className = 'canvas-measure-radius';
	probe.style.fontSize = css.fontSize;
	probe.style.width = `1${ unit }`;
	probe.style.fontFamily = css.fontFamily;
	// Keep measurement nodes outside the canvas's layout MutationObserver.
	element.ownerDocument.body.append( probe );
	const size = parseFloat( view.getComputedStyle( probe ).width );
	probe.remove();
	return size;
}
export function readRadiusTargets( block, grid, store, rtl, settings ) {
	if ( ! block || ! grid ) {
		return [];
	}
	const blocks =
		block.name === 'core/buttons'
			? block.innerBlocks.filter(
					( child ) => child.name === 'core/button'
				)
			: [ block ];
	// A Buttons edit is atomic, including when one child disallows styling.
	if (
		blocks.some(
			( child ) =>
				store.getBlockEditingMode( child.clientId ) !== 'default'
		)
	) {
		return [];
	}
	const targets = blocks.flatMap( ( child ) => {
		if (
			child.name === 'core/image' &&
			imageShape( child.attributes?.[ ATTRIBUTE ]?.shape ) !== 'none'
		) {
			return [];
		}
		const root = grid.ownerDocument.getElementById(
			`block-${ child.clientId }`
		);
		let element;
		if ( child.name === 'core/button' ) {
			element = root?.querySelector( '.wp-block-button__link' );
		} else if ( child.name === 'core/image' ) {
			element = root?.querySelector( 'img' );
		} else if ( child.name === 'core/group' ) {
			element = root;
		} else {
			element = null;
		}
		if ( ! element || ! grid.contains( element ) ) {
			return [];
		}
		const css =
			element.ownerDocument.defaultView.getComputedStyle( element );
		if ( child.name === 'core/group' && ! hasSurface( css ) ) {
			return [];
		}
		const width = element.offsetWidth;
		const height = element.offsetHeight;
		if ( ! width || ! height ) {
			return [];
		}
		const raw = child.attributes.style?.border?.radius;
		const computed =
			css[ rtl ? 'borderTopLeftRadius' : 'borderTopRightRadius' ];
		const unit = radiusEditableUnit(
			raw,
			computed,
			settings.get( child.clientId ),
			rtl
		);
		if ( ! unit ) {
			return [];
		}
		const pixelsPerUnit = unitSize( unit.value, element, css );
		if ( ! Number.isFinite( pixelsPerUnit ) || pixelsPerUnit <= 0 ) {
			return [];
		}
		const model = radiusModel( raw, computed, {
			width,
			height,
			pixelsPerUnit,
			rtl,
			unit: unit.value,
			step: unit.step,
		} );
		return [
			{
				id: child.clientId,
				element,
				model,
			},
		];
	} );
	return targets.length === blocks.length ? targets : [];
}

// DOM-only previews do not enter Core history or trigger responsive placement
// writes. Restore only radius declarations, leaving other live styles intact.
export function previewRadius( targets ) {
	const originals = targets.map( ( { element } ) =>
		Array.from( element.style )
			.filter(
				( property ) =>
					property === 'border-radius' ||
					CSS_CORNERS.includes( property )
			)
			.map( ( property ) => [
				property,
				element.style.getPropertyValue( property ),
				element.style.getPropertyPriority( property ),
			] )
	);
	return {
		update( values ) {
			targets.forEach( ( { element }, index ) =>
				element.style.setProperty(
					'border-radius',
					values[ index ],
					'important'
				)
			);
		},
		restore() {
			targets.forEach( ( { element }, index ) => {
				element.style.removeProperty( 'border-radius' );
				CSS_CORNERS.forEach( ( property ) =>
					element.style.removeProperty( property )
				);
				originals[ index ].forEach( ( [ property, value, priority ] ) =>
					element.style.setProperty( property, value, priority )
				);
			} );
		},
	};
}

// Presentation only: alignment never changes a saved grid placement.
export function alignmentAttributes( name, attributes = {} ) {
	const text = [ 'core/heading', 'core/paragraph' ].includes( name );
	if ( text ) {
		return {
			'data-canvas-text-align-y': [ 'center', 'bottom' ].includes(
				attributes.canvas?.verticalAlign
			)
				? attributes.canvas.verticalAlign
				: 'top',
		};
	}
	if ( name !== 'core/buttons' ) {
		return {};
	}
	const layout = attributes.layout || {};
	return {
		'data-canvas-justify': [
			'left',
			'center',
			'right',
			'space-between',
		].includes( layout.justifyContent )
			? layout.justifyContent
			: 'stretch',
		'data-canvas-align-y': [
			'top',
			'center',
			'bottom',
			'space-between',
		].includes( layout.verticalAlignment )
			? layout.verticalAlignment
			: 'stretch',
		'data-canvas-orientation':
			layout.orientation === 'vertical' ? 'vertical' : 'horizontal',
	};
}

// Project only alignment into the native toolbar when responsive editing is off.
// Core still owns the saved style states and their editor/frontend CSS.
export function responsiveAlignmentAttributes( attributes, mode ) {
	if ( ! [ 'tablet', 'mobile' ].includes( mode ) ) {
		return attributes;
	}
	const alignment = attributes.style?.[ `@${ mode }` ]?.typography?.textAlign;
	if ( alignment === undefined ) {
		return attributes;
	}
	return {
		...attributes,
		style: {
			...attributes.style,
			typography: {
				...attributes.style?.typography,
				textAlign: alignment,
			},
		},
	};
}

export function responsiveAlignmentUpdates( attributes, shown, updates, mode ) {
	if ( ! [ 'tablet', 'mobile' ].includes( mode ) || ! updates.style ) {
		return updates;
	}
	const alignment = updates.style.typography?.textAlign;
	const changed = alignment !== shown.style?.typography?.textAlign;
	const viewport = `@${ mode }`;
	return {
		...updates,
		style: {
			...updates.style,
			typography: {
				...updates.style.typography,
				textAlign: attributes.style?.typography?.textAlign,
			},
			...( changed
				? {
						[ viewport ]: {
							...updates.style[ viewport ],
							typography: {
								...updates.style[ viewport ]?.typography,
								textAlign: alignment,
							},
						},
					}
				: {} ),
		},
	};
}

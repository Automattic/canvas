// Presentation only: alignment never changes a saved grid placement.
export function alignmentAttributes( name, attributes = {} ) {
	const text = [ 'core/heading', 'core/paragraph' ].includes( name );
	if ( text ) {
		return {
			...( [ 'left', 'center', 'right', 'justify' ].includes(
				attributes.canvas?.mobileTextAlign
			)
				? {
						'data-canvas-mobile-text-align':
							attributes.canvas.mobileTextAlign,
					}
				: {} ),
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

// The native control sees the mobile value; only that value belongs in Canvas.
export function mobileAlignmentUpdates( attributes, shown, updates ) {
	if ( ! updates.style ) {
		return updates;
	}
	const alignment = updates.style.typography?.textAlign;
	const changed = alignment !== shown.style?.typography?.textAlign;
	return {
		...updates,
		style: {
			...updates.style,
			typography: {
				...updates.style.typography,
				textAlign: attributes.style?.typography?.textAlign,
			},
		},
		...( changed
			? {
					canvas: {
						...attributes.canvas,
						...updates.canvas,
						mobileTextAlign: alignment,
					},
				}
			: {} ),
	};
}

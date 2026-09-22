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

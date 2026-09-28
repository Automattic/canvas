function luminance( channels ) {
	const linear = Array.from( channels )
		.slice( 0, 3 )
		.map( ( channel ) => {
			const value = channel / 255;
			return value <= 0.04045
				? value / 12.92
				: ( ( value + 0.055 ) / 1.055 ) ** 2.4;
		} );
	return 0.2126 * linear[ 0 ] + 0.7152 * linear[ 1 ] + 0.0722 * linear[ 2 ];
}

// Keep the authored foreground when it contrasts with the solid background.
export function guideColors( element ) {
	const document = element.ownerDocument;
	const canvas = document.createElement( 'canvas' );
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext( '2d', { willReadFrequently: true } );
	const backgrounds = [];
	for ( let node = element; node; node = node.parentElement ) {
		backgrounds.push(
			document.defaultView.getComputedStyle( node ).backgroundColor
		);
	}
	// Let the browser parse CSS colors and composite transparent ancestors.
	context.fillStyle = '#fff';
	context.fillRect( 0, 0, 1, 1 );
	for ( const background of backgrounds.reverse() ) {
		context.fillStyle = background;
		context.fillRect( 0, 0, 1, 1 );
	}
	const [ red, green, blue ] = context.getImageData( 0, 0, 1, 1 ).data;
	const backgroundLuminance = luminance( [ red, green, blue ] );
	const foreground = document.defaultView.getComputedStyle( element ).color;
	context.fillStyle = foreground;
	context.fillRect( 0, 0, 1, 1 );
	const foregroundLuminance = luminance(
		context.getImageData( 0, 0, 1, 1 ).data
	);
	const contrast =
		( Math.max( backgroundLuminance, foregroundLuminance ) + 0.05 ) /
		( Math.min( backgroundLuminance, foregroundLuminance ) + 0.05 );
	const fallback = backgroundLuminance > 0.179 ? '#000' : '#fff';
	return {
		background: `rgb(${ red }, ${ green }, ${ blue })`,
		foreground: contrast >= 4.5 ? foreground : fallback,
		fallback,
	};
}

// Share the same computed default between the editor and the front end.
// Keep it out of saved attributes so clearing a text color restores automation.
export function observeAutomaticTextColor( grid ) {
	const wrapper = grid?.closest( '.wp-block-tabor-canvas' );
	if ( ! wrapper ) {
		return;
	}
	const property = '--canvas-auto-text-color';
	const update = () => {
		const automatic =
			wrapper.classList.contains( 'has-background' ) &&
			! wrapper.classList.contains( 'has-text-color' );
		const color = automatic ? guideColors( wrapper ).fallback : '';
		if ( wrapper.style.getPropertyValue( property ) !== color ) {
			if ( color ) {
				wrapper.style.setProperty( property, color );
			} else {
				wrapper.style.removeProperty( property );
			}
		}
	};
	update();
	const observer = new wrapper.ownerDocument.defaultView.MutationObserver(
		update
	);
	for ( let node = wrapper; node; node = node.parentElement ) {
		observer.observe( node, {
			attributes: true,
			attributeFilter: [ 'class', 'style' ],
		} );
	}
	return () => observer.disconnect();
}

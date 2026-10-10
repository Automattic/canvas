// CSS used dimensions retain subpixel precision without visual transforms.
export function intrinsicBoxSize( element ) {
	const css = element.ownerDocument?.defaultView?.getComputedStyle( element );
	const dimension = ( name, edges ) => {
		const used = parseFloat( css?.[ name ] );
		if ( ! Number.isFinite( used ) ) {
			return name === 'height'
				? element.offsetHeight
				: element.offsetWidth;
		}
		return (
			used +
			( css.boxSizing === 'border-box'
				? 0
				: edges.reduce(
						( total, edge ) =>
							total +
							( parseFloat( css[ `padding${ edge }` ] ) || 0 ) +
							( parseFloat( css[ `border${ edge }Width` ] ) ||
								0 ),
						0
					) )
		);
	};
	return {
		width: dimension( 'width', [ 'Left', 'Right' ] ),
		height: dimension( 'height', [ 'Top', 'Bottom' ] ),
	};
}

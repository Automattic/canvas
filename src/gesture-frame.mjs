// Pointer input can arrive faster than the display can paint. Retain only the
// latest sample, with explicit flushing for release and cancellation for Escape.
export function gestureFrame( view, update ) {
	let frame = null;
	let pending;
	const cancel = () => {
		if ( frame !== null ) {
			view.cancelAnimationFrame( frame );
		}
		frame = null;
		pending = undefined;
	};
	const flush = () => {
		const value = pending;
		cancel();
		if ( value !== undefined ) {
			update( value );
		}
	};
	return {
		push( value ) {
			pending = value;
			if ( frame === null ) {
				frame = view.requestAnimationFrame( flush );
			}
		},
		flush,
		cancel,
	};
}

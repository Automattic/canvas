export function gridMetrics( grid ) {
	const css = grid.ownerDocument.defaultView.getComputedStyle( grid );
	const mode = css.getPropertyValue( '--canvas-viewport' ).trim();
	const canvas = grid.canvasGeometry?.[ mode ];
	if ( ! canvas ) {
		return null;
	}
	let scale = grid.offsetWidth / grid.getBoundingClientRect().width || 1;
	// Pointer coordinates are local to the iframe, but snapping tolerance is in
	// screen pixels, including Gutenberg's zoomed-out iframe transform.
	for (
		let frame = grid.ownerDocument.defaultView.frameElement;
		frame;
		frame = frame.ownerDocument.defaultView.frameElement
	) {
		scale *= frame.offsetWidth / frame.getBoundingClientRect().width || 1;
	}
	return {
		...canvas,
		mode,
		visibleRows: canvas.rows.length,
		geometry: grid.canvasGeometry,
		scale,
	};
}

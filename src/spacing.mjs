// WordPress stores linked spacing as a string, or top/left for the two axes.
// Let the browser resolve units and spacing presets in the canvas's context.
export function measureCanvasSpacing( canvas, probe ) {
	let value;
	try {
		value = JSON.parse(
			canvas.getAttribute( 'data-canvas-spacing' ) || 'null'
		);
	} catch {
		value = null;
	}
	const view = canvas.ownerDocument.defaultView;
	const inherited =
		parseFloat( view.getComputedStyle( probe ).marginBlockStart ) || 0;
	const measure = ( amount ) => {
		probe.style.removeProperty( 'margin-block-start' );
		if ( amount === undefined || amount === null || amount === '' ) {
			return inherited;
		}
		const css = String( amount ).replace(
			/^var:preset\|spacing\|(.+)$/,
			'var(--wp--preset--spacing--$1)'
		);
		probe.style.marginBlockStart = css;
		return Math.max(
			0,
			parseFloat( view.getComputedStyle( probe ).marginBlockStart ) || 0
		);
	};
	const gap = measure(
		typeof value === 'object' && value !== null ? value.top : value
	);
	const columnGap = measure(
		typeof value === 'object' && value !== null ? value.left : value
	);
	probe.style.removeProperty( 'margin-block-start' );
	return { gap, columnGap };
}

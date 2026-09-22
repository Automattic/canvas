export const MIN_TEXT_SIZE = 12;
const MAX_TEXT_SIZE = 512;

// A small bounded search works with real browser line wrapping, including <br>.
export function fittingFontSize(
	measure,
	width,
	height,
	min = MIN_TEXT_SIZE,
	max = MAX_TEXT_SIZE
) {
	const fits = ( size ) => {
		const box = measure( size );
		return box.width <= width && box.height <= height;
	};
	if ( ! fits( min ) ) {
		return min;
	}
	let low = min;
	let high = max;
	for ( let i = 0; i < 14 && high - low > 0.1; i++ ) {
		const middle = ( low + high ) / 2;
		if ( fits( middle ) ) {
			low = middle;
		} else {
			high = middle;
		}
	}
	return Math.floor( low * 10 ) / 10;
}

const TEXT_SELECTOR = 'h1,h2,h3,h4,h5,h6,p';
const VARIABLES = [ '--canvas-text-size', '--canvas-text-leading' ];
const TYPOGRAPHY = [
	'fontFamily',
	'fontWeight',
	'fontStyle',
	'fontStretch',
	'fontVariant',
	'fontFeatureSettings',
	'fontVariationSettings',
	'fontKerning',
	'fontOpticalSizing',
	'letterSpacing',
	'wordSpacing',
	'textTransform',
	'textIndent',
	'whiteSpace',
	'wordBreak',
	'overflowWrap',
	'hyphens',
	'direction',
	'tabSize',
];

export const textElement = ( item ) =>
	item.matches( TEXT_SELECTOR )
		? item
		: item.querySelector( `:scope > :is(${ TEXT_SELECTOR })` );

// Measure original typography independently of the current fitted size. Both
// responsive layout and area fitting use the same browser line-breaking rules.
export function measureText( item, width, callback, includeBox = false ) {
	const text = textElement( item );
	if ( ! text ) {
		return null;
	}
	const fitted = item.hasAttribute( 'data-canvas-text-fitted' );
	const automatic = item.getAttribute( 'data-canvas-auto-active' );
	item.removeAttribute( 'data-canvas-text-fitted' );
	item.removeAttribute( 'data-canvas-auto-active' );
	const css = text.ownerDocument.defaultView.getComputedStyle( text );
	const fontSize = parseFloat( css.fontSize ) || 16;
	const leading =
		css.lineHeight === 'normal'
			? 1.2
			: parseFloat( css.lineHeight ) / fontSize;
	const px = ( name ) => parseFloat( css[ name ] ) || 0;
	const insetX = includeBox
		? px( 'paddingLeft' ) +
			px( 'paddingRight' ) +
			px( 'borderLeftWidth' ) +
			px( 'borderRightWidth' )
		: 0;
	const insetY = includeBox
		? px( 'paddingTop' ) +
			px( 'paddingBottom' ) +
			px( 'borderTopWidth' ) +
			px( 'borderBottomWidth' )
		: 0;
	const probe = text.cloneNode( true );
	for ( const element of [ probe, ...probe.querySelectorAll( '*' ) ] ) {
		element.removeAttribute( 'id' );
		element.removeAttribute( 'contenteditable' );
	}
	probe
		.querySelectorAll( '[data-rich-text-placeholder]' )
		.forEach( ( element ) => element.remove() );
	probe.className = 'canvas-measure-text';
	probe.setAttribute( 'aria-hidden', 'true' );
	probe.inert = true;
	probe.lang =
		text.closest( '[lang]' )?.lang ||
		text.ownerDocument.documentElement.lang;
	probe.removeAttribute( 'style' );
	for ( const property of TYPOGRAPHY ) {
		probe.style[ property ] = css[ property ];
	}
	// Emergency character wrapping must not count as a successful text fit.
	probe.style.overflowWrap =
		item.hasAttribute( 'data-canvas-text-fit' ) || width === 'min-content'
			? 'normal'
			: css.overflowWrap;
	probe.style.removeProperty( 'word-break' );
	probe.style.removeProperty( 'hyphens' );
	probe.style.width =
		width === 'min-content'
			? 'min-content'
			: `${ Math.max( 1, width - insetX ) }px`;
	probe.style.lineHeight = String( leading );
	if ( fitted ) {
		item.setAttribute( 'data-canvas-text-fitted', '' );
	}
	if ( automatic ) {
		item.setAttribute( 'data-canvas-auto-active', automatic );
	}
	text.ownerDocument.body.append( probe );
	const range = text.ownerDocument.createRange();
	range.selectNodeContents( probe );
	try {
		return callback(
			( size ) => {
				probe.style.setProperty(
					'font-size',
					`${ size }px`,
					'important'
				);
				// scrollWidth rounds to an integer and can accept a word a fraction too
				// wide. Range keeps subpixel precision at the exact wrap boundary.
				return {
					width: range.getBoundingClientRect().width + insetX,
					height:
						Math.max( probe.offsetHeight, probe.scrollHeight ) +
						insetY,
				};
			},
			{ fontSize, leading }
		);
	} finally {
		probe.remove();
	}
}

function clearFit( item ) {
	item.removeAttribute( 'data-canvas-text-fitted' );
	VARIABLES.forEach( ( name ) => item.style.removeProperty( name ) );
}

function fitItem( item, view ) {
	const text = textElement( item );
	if ( ! text || ! text.textContent.trim() ) {
		clearFit( item );
		return;
	}

	// The fixed grid area is independent of typography. Read the original
	// typography without changing saved styles.
	item.removeAttribute( 'data-canvas-text-fitted' );
	const css = view.getComputedStyle( text );
	const px = ( name ) => parseFloat( css[ name ] ) || 0;
	const paddingX = px( 'paddingLeft' ) + px( 'paddingRight' );
	const paddingY = px( 'paddingTop' ) + px( 'paddingBottom' );
	const borderY = px( 'borderTopWidth' ) + px( 'borderBottomWidth' );
	const width = text.clientWidth - paddingX;
	if ( width <= 0 ) {
		clearFit( item );
		return;
	}
	const leading =
		css.lineHeight === 'normal'
			? 1.2
			: px( 'lineHeight' ) / ( px( 'fontSize' ) || 16 );

	const height =
		item.clientHeight - paddingY - ( text === item ? 0 : borderY );
	const size = measureText( item, width, ( measure ) =>
		fittingFontSize( measure, width, height, MIN_TEXT_SIZE, MAX_TEXT_SIZE )
	);
	if (
		item.style.getPropertyValue( '--canvas-text-size' ) !== `${ size }px`
	) {
		item.style.setProperty( '--canvas-text-size', `${ size }px` );
	}
	if (
		item.style.getPropertyValue( '--canvas-text-leading' ) !==
		String( leading )
	) {
		item.style.setProperty( '--canvas-text-leading', String( leading ) );
	}
	item.setAttribute( 'data-canvas-text-fitted', '' );
}

// Shared by the editor iframe and the frontend, with no WordPress dependency.
export function observeTextFit( grid ) {
	const view = grid.ownerDocument.defaultView;
	const tracked = new Set();
	let frame;
	let disposed = false;
	const schedule = () => {
		if ( ! disposed && ! frame ) {
			frame = view.requestAnimationFrame( refresh );
		}
	};
	const resize = new view.ResizeObserver( schedule );
	const changes = new view.MutationObserver( schedule );
	const observeChanges = () =>
		changes.observe( grid, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: [ 'data-canvas-text-fit', 'style', 'class' ],
		} );
	function refresh() {
		frame = null;
		changes.disconnect();
		try {
			const items = new Set(
				[
					...grid.querySelectorAll( '[data-canvas-text-fit="true"]' ),
				].filter( ( item ) => item.closest( '.canvas__grid' ) === grid )
			);
			for ( const item of tracked ) {
				if ( ! items.has( item ) ) {
					clearFit( item );
					resize.unobserve( item );
					tracked.delete( item );
				}
			}
			for ( const item of items ) {
				if ( ! tracked.has( item ) ) {
					tracked.add( item );
					resize.observe( item );
				}
				fitItem( item, view );
			}
		} finally {
			if ( ! disposed ) {
				observeChanges();
			}
		}
	}
	resize.observe( grid );
	view.addEventListener( 'resize', schedule );
	grid.ownerDocument.fonts?.addEventListener( 'loadingdone', schedule );
	grid.ownerDocument.fonts?.ready.then( schedule );
	refresh();
	return () => {
		disposed = true;
		view.cancelAnimationFrame( frame );
		resize.disconnect();
		changes.disconnect();
		view.removeEventListener( 'resize', schedule );
		grid.ownerDocument.fonts?.removeEventListener(
			'loadingdone',
			schedule
		);
		tracked.forEach( clearFit );
	};
}

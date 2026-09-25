export const MIN_TEXT_SIZE = 12;
const MAX_TEXT_SIZE = 2400;

// A small bounded search works with real browser line wrapping, including <br>.
export function fittingFontSize(
	measure,
	width,
	height,
	min = 1,
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
export function measureText(
	item,
	width,
	callback,
	includeBox = false,
	preserveFitted = false,
	cache
) {
	const text = textElement( item );
	if ( ! text ) {
		return null;
	}
	const fitted = item.hasAttribute( 'data-canvas-text-fitted' );
	const automatic = item.getAttribute( 'data-canvas-auto-active' );
	if ( ! preserveFitted ) {
		item.removeAttribute( 'data-canvas-text-fitted' );
	}
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
	// Snapshot computed typography before restoring the live fitted styles.
	const styles = Object.fromEntries(
		TYPOGRAPHY.map( ( property ) => [ property, css[ property ] ] )
	);
	// Emergency character wrapping must not count as a successful text fit.
	styles.overflowWrap =
		item.hasAttribute( 'data-canvas-text-fit' ) || width === 'min-content'
			? 'normal'
			: css.overflowWrap;
	delete styles.wordBreak;
	delete styles.hyphens;
	styles.width =
		width === 'min-content'
			? 'min-content'
			: `${ Math.max( 1, width - insetX ) }px`;
	styles.lineHeight = String( leading );
	const language =
		text.closest( '[lang]' )?.lang ||
		text.ownerDocument.documentElement.lang;
	if ( fitted ) {
		item.setAttribute( 'data-canvas-text-fitted', '' );
	}
	if ( automatic ) {
		item.setAttribute( 'data-canvas-auto-active', automatic );
	}
	let measurements;
	// Plain text has no descendant styling or replaced content to invalidate.
	// Keep a few widths for responsive min-content/height passes, bounded during
	// continuous resizing. The owner clears the cache when fonts/styles change.
	if ( cache && ! text.childElementCount ) {
		let entries = cache.get( text );
		if ( ! entries ) {
			entries = new Map();
			cache.set( text, entries );
		}
		const key = JSON.stringify( [
			text.textContent,
			language,
			styles,
			insetX,
			insetY,
		] );
		measurements = entries.get( key );
		if ( ! measurements ) {
			if ( entries.size >= 8 ) {
				entries.delete( entries.keys().next().value );
			}
			measurements = new Map();
			entries.set( key, measurements );
		}
	}
	let probe, range;
	const prepare = () => {
		probe = text.cloneNode( true );
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
		probe.lang = language;
		probe.removeAttribute( 'style' );
		Object.assign( probe.style, styles );
		text.ownerDocument.body.append( probe );
		range = text.ownerDocument.createRange();
		range.selectNodeContents( probe );
	};
	try {
		return callback(
			( size ) => {
				if ( measurements?.has( size ) ) {
					return { ...measurements.get( size ) };
				}
				if ( ! probe ) {
					prepare();
				}
				probe.style.setProperty(
					'font-size',
					`${ size }px`,
					'important'
				);
				// scrollWidth rounds to an integer and can accept a word a fraction too
				// wide. Range keeps subpixel precision at the exact wrap boundary.
				let measuredWidth = range.getBoundingClientRect().width;
				const frameWidth = parseFloat( probe.style.width );
				const height = Math.max(
					probe.offsetHeight,
					probe.scrollHeight
				);
				if (
					Number.isFinite( frameWidth ) &&
					measuredWidth > frameWidth &&
					probe.scrollWidth <= Math.ceil( frameWidth )
				) {
					// Ranges include spaces hanging off soft-wrapped lines. Check the
					// longest unbreakable content before treating those as overflow;
					// retain fractional precision for a genuinely overwide word.
					const previousWidth = probe.style.width;
					probe.style.width = 'min-content';
					measuredWidth = Math.max(
						frameWidth,
						range.getBoundingClientRect().width
					);
					probe.style.width = previousWidth;
				}
				const result = {
					width: measuredWidth + insetX,
					height: height + insetY,
				};
				if ( measurements?.size >= 32 ) {
					measurements.clear();
				}
				measurements?.set( size, result );
				return { ...result };
			},
			{ fontSize, leading }
		);
	} finally {
		probe?.remove();
	}
}

function clearFit( item ) {
	item.removeAttribute( 'data-canvas-text-fitted' );
	VARIABLES.forEach( ( name ) => item.style.removeProperty( name ) );
}

// Width owns the fitted size. Two measurements account for fixed spacing and
// box insets; a bounded correction handles optical font sizing.
export function measureWidthFit( item, width, measurements ) {
	return measureText(
		item,
		width,
		( measure, { fontSize, leading } ) => {
			const base = Math.max( 1, fontSize );
			const first = measure( base ).width;
			const slope = ( measure( base * 2 ).width - first ) / base;
			let size =
				textElement( item ).textContent.trim() && slope > 0
					? Math.max(
							1,
							Math.min(
								MAX_TEXT_SIZE,
								Math.floor(
									( base + ( width - first ) / slope ) * 10
								) / 10
							)
						)
					: base;
			let box = measure( size );
			for (
				let pass = 0;
				pass < 3 && slope > 0 && Math.abs( width - box.width ) > 0.25;
				pass++
			) {
				const next = Math.max(
					1,
					Math.min(
						MAX_TEXT_SIZE,
						Math.floor(
							( size + ( width - box.width ) / slope ) * 10
						) / 10
					)
				);
				if (
					next === size ||
					! textElement( item ).textContent.trim()
				) {
					break;
				}
				size = next;
				box = measure( size );
			}
			return { size, leading, height: box.height };
		},
		true,
		true,
		measurements
	);
}

function fitItem( item, view, measurements ) {
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
	const size = measureText(
		item,
		width,
		( measure ) =>
			fittingFontSize( measure, width, height, 1, MAX_TEXT_SIZE ),
		false,
		false,
		measurements
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
	let measurements = new WeakMap();
	let frame;
	let disposed = false;
	const schedule = () => {
		if ( ! disposed && ! frame ) {
			frame = view.requestAnimationFrame( refresh );
		}
	};
	const invalidate = () => {
		measurements = new WeakMap();
		schedule();
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
				fitItem( item, view, measurements );
			}
		} finally {
			if ( ! disposed ) {
				observeChanges();
			}
		}
	}
	resize.observe( grid );
	view.addEventListener( 'resize', invalidate );
	grid.ownerDocument.fonts?.addEventListener( 'loadingdone', invalidate );
	grid.ownerDocument.fonts?.ready.then( invalidate );
	refresh();
	return () => {
		disposed = true;
		view.cancelAnimationFrame( frame );
		resize.disconnect();
		changes.disconnect();
		view.removeEventListener( 'resize', invalidate );
		grid.ownerDocument.fonts?.removeEventListener(
			'loadingdone',
			invalidate
		);
		tracked.forEach( clearFit );
	};
}

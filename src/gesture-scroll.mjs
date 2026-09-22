// A custom grid gesture owns its scroll space until it ends. Core selection
// scrolling and browser scroll anchoring must not turn a preview into more
// pointer movement, which would grow the canvas and feed back into scrolling.
export function holdGestureScroll( grid ) {
	const containers = [];
	const views = new Set();
	for (
		let node = grid.parentElement;
		node;
		node = node.parentElement || node.ownerDocument.defaultView.frameElement
	) {
		const doc = node.ownerDocument;
		const view = doc.defaultView;
		views.add( view );
		const css = view.getComputedStyle( node );
		if (
			node !== doc.scrollingElement &&
			! /(auto|scroll|hidden)/.test(
				`${ css.overflowX } ${ css.overflowY }`
			)
		) {
			continue;
		}
		const properties = [ 'overflow-anchor', 'scroll-behavior' ];
		containers.push( {
			node,
			left: node.scrollLeft,
			top: node.scrollTop,
			styles: properties.map( ( name ) => [
				name,
				node.style.getPropertyValue( name ),
				node.style.getPropertyPriority( name ),
			] ),
		} );
		node.style.setProperty( 'overflow-anchor', 'none' );
		node.style.setProperty( 'scroll-behavior', 'auto' );
	}
	const restore = () => {
		for ( const { node, left, top } of containers ) {
			if ( node.scrollLeft !== left ) {
				node.scrollLeft = left;
			}
			if ( node.scrollTop !== top ) {
				node.scrollTop = top;
			}
		}
	};
	const preventWheel = ( event ) => event.preventDefault();
	for ( const view of views ) {
		view.addEventListener( 'scroll', restore, true );
		view.addEventListener( 'wheel', preventWheel, {
			capture: true,
			passive: false,
		} );
	}
	return {
		// A pointermove can arrive before the browser delivers its scroll event.
		restore,
		release() {
			restore();
			for ( const view of views ) {
				view.removeEventListener( 'scroll', restore, true );
				view.removeEventListener( 'wheel', preventWheel, true );
			}
			for ( const { node, styles } of containers ) {
				for ( const [ name, value, priority ] of styles ) {
					if ( value ) {
						node.style.setProperty( name, value, priority );
					} else {
						node.style.removeProperty( name );
					}
				}
			}
		},
	};
}

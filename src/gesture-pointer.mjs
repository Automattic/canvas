// Keep listening above Gutenberg's canvas iframe as well as inside it. Losing
// capture or crossing the iframe boundary must not discard a valid preview.
export function gestureDocuments( doc ) {
	const documents = [ doc ];
	for (
		let frame = doc.defaultView.frameElement;
		frame;
		frame = frame.ownerDocument.defaultView.frameElement
	) {
		documents.push( frame.ownerDocument );
	}
	return documents;
}

// Pointer events use the viewport of the document that received them. Convert
// through frame borders and transforms before comparing them with the grid.
export function gesturePoint( event, doc ) {
	const source = event.view?.document || event.target?.ownerDocument || doc;
	let { clientX: x, clientY: y } = event;
	if ( source === doc ) {
		return { x, y };
	}
	const frames = ( document ) =>
		gestureDocuments( document )
			.slice( 0, -1 )
			.map( ( item ) => item.defaultView.frameElement );
	for ( const frame of frames( source ) ) {
		const rect = frame.getBoundingClientRect();
		x =
			rect.left +
			( ( x + frame.clientLeft ) * rect.width ) / frame.offsetWidth;
		y =
			rect.top +
			( ( y + frame.clientTop ) * rect.height ) / frame.offsetHeight;
	}
	for ( const frame of frames( doc ).reverse() ) {
		const rect = frame.getBoundingClientRect();
		x =
			( ( x - rect.left ) * frame.offsetWidth ) / rect.width -
			frame.clientLeft;
		y =
			( ( y - rect.top ) * frame.offsetHeight ) / rect.height -
			frame.clientTop;
	}
	return { x, y };
}

export function observeGesturePointer( event, target, { move, end, cancel } ) {
	const documents = gestureDocuments( target.ownerDocument );
	const view = documents.at( -1 ).defaultView;
	const captureOptions = { capture: true };
	const matching = ( callback ) => ( next ) => {
		if ( next.pointerId === event.pointerId ) {
			callback( next );
		}
	};
	const onMove = matching( ( next ) => {
		// Recover a release missed outside the window when the pointer returns.
		// eslint-disable-next-line no-bitwise -- PointerEvent.buttons is a bitmask.
		if ( ! ( next.buttons & 1 ) ) {
			end();
		} else {
			move( next );
		}
	} );
	const onEnd = matching( end );
	const onCancel = matching( cancel );
	// Focus moving between the iframe and editor chrome is not an interruption.
	// Leaving the window settles the last preview instead of silently undoing it.
	const settle = () => end();
	const visibility = () => {
		if ( view.document.hidden ) {
			settle();
		}
	};
	for ( const doc of documents ) {
		doc.addEventListener( 'pointermove', onMove, captureOptions );
		doc.addEventListener( 'pointerup', onEnd, captureOptions );
		doc.addEventListener( 'pointercancel', onCancel, captureOptions );
	}
	view.addEventListener( 'blur', settle );
	view.document.addEventListener( 'visibilitychange', visibility );
	return {
		capture() {
			// Capture on the stable grid, not a handle or item that may be remounted.
			// Document listeners still finish the gesture if capture is unavailable.
			try {
				target.setPointerCapture?.( event.pointerId );
			} catch {
				/* Pointer already released. */
			}
		},
		release() {
			for ( const doc of documents ) {
				doc.removeEventListener(
					'pointermove',
					onMove,
					captureOptions
				);
				doc.removeEventListener( 'pointerup', onEnd, captureOptions );
				doc.removeEventListener(
					'pointercancel',
					onCancel,
					captureOptions
				);
			}
			view.removeEventListener( 'blur', settle );
			view.document.removeEventListener( 'visibilitychange', visibility );
			if ( target.hasPointerCapture?.( event.pointerId ) ) {
				target.releasePointerCapture( event.pointerId );
			}
		},
	};
}

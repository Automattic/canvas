import { gestureDocuments } from './gesture-pointer.mjs';
import { HOLD_DELAY, TOUCH_SLOP } from './touch-geometry.mjs';

// A single owner arbitrates taps, holds, moves and two-pointer transforms.
// Unselected surfaces never prevent browser panning or acquire scroll locks.
export function observeTouchSession(
	event,
	target,
	{ canMove = true, canPair, move, pair, transform, end, cancel, tap, hold }
) {
	const documents = gestureDocuments( target.ownerDocument );
	const view = documents.at( -1 ).defaultView;
	const points = new Map( [ [ event.pointerId, event ] ] );
	let moving = false,
		paired = false,
		settled = false,
		disposed = false;
	let timer;
	const stop = ( e ) => {
		if ( e.cancelable ) {
			e.preventDefault();
		}
		e.stopPropagation();
	};
	const clearHold = () => {
		view.clearTimeout( timer );
		timer = null;
	};
	const capture = ( id ) => {
		try {
			target.setPointerCapture?.( id );
		} catch {
			/* Already released. */
		}
	};
	const releaseCapture = () => {
		for ( const id of points.keys() ) {
			if ( target.hasPointerCapture?.( id ) ) {
				target.releasePointerCapture( id );
			}
		}
	};
	const context = ( e ) => {
		if ( ! target.contains( e.target ) && e.target !== event.target ) {
			return;
		}
		stop( e );
		if ( ! moving && ! paired && ! settled && hold ) {
			finishHold();
		}
	};
	const click = ( e ) => {
		if (
			e.pointerType === 'touch' ||
			e.sourceCapabilities?.firesTouchEvents
		) {
			stop( e );
			e.stopImmediatePropagation();
		}
	};
	// Keep the click guard until the compatibility click has passed. A new
	// primary contact ends it before a menu item or editable text is handled.
	const guardDone = () => {
		view.clearTimeout( guardTimer );
		for ( const doc of documents ) {
			doc.removeEventListener( 'click', click, { capture: true } );
			doc.removeEventListener( 'pointerdown', nextContact, {
				capture: true,
			} );
		}
	};
	const nextContact = ( e ) => {
		if ( e.isPrimary ) {
			guardDone();
		}
	};
	let guardTimer;
	const dispose = () => {
		if ( disposed ) {
			return;
		}
		disposed = true;
		clearHold();
		for ( const doc of documents ) {
			for ( const [ type, handler ] of Object.entries( handlers ) ) {
				doc.removeEventListener( type, handler, { capture: true } );
			}
			doc.addEventListener( 'pointerdown', nextContact, true );
		}
		view.removeEventListener( 'blur', blur );
		view.document.removeEventListener( 'visibilitychange', visibility );
		guardTimer = view.setTimeout( guardDone, 800 );
	};
	const settle = ( callback ) => {
		if ( settled ) {
			return;
		}
		settled = true;
		clearHold();
		callback?.();
		releaseCapture();
		if ( ! points.size ) {
			dispose();
		}
	};
	const finishHold = () => settle( () => hold( event ) );
	const down = ( e ) => {
		if (
			e.pointerType !== 'touch' ||
			points.has( e.pointerId ) ||
			settled
		) {
			return;
		}
		clearHold();
		if ( ! canMove || paired || ! canPair?.( e ) ) {
			return;
		}
		points.set( e.pointerId, e );
		paired = true;
		stop( e );
		for ( const id of points.keys() ) {
			capture( id );
		}
		pair( [ ...points.values() ] );
	};
	const update = ( e ) => {
		if ( ! points.has( e.pointerId ) || settled ) {
			return;
		}
		points.set( e.pointerId, e );
		if ( paired ) {
			stop( e );
			transform( [ ...points.values() ] );
			return;
		}
		if (
			! moving &&
			Math.hypot( e.clientX - event.clientX, e.clientY - event.clientY ) <
				TOUCH_SLOP
		) {
			return;
		}
		clearHold();
		if ( ! canMove ) {
			settle( cancel );
			return;
		}
		moving = true;
		stop( e );
		capture( e.pointerId );
		move( e );
	};
	const up = ( e ) => {
		if ( ! points.has( e.pointerId ) ) {
			return;
		}
		if ( ! settled ) {
			update( e );
			stop( e );
			// Release positions can be newer than the last delivered move.
			settle( moving || paired ? end : () => tap?.( e ) );
		}
		points.delete( e.pointerId );
		if ( ! points.size ) {
			dispose();
		}
	};
	const abort = ( e ) => {
		if ( ! points.has( e.pointerId ) ) {
			return;
		}
		settle( cancel );
		points.delete( e.pointerId );
		if ( ! points.size ) {
			dispose();
		}
	};
	const scroll = () => {
		if ( ! moving && ! paired ) {
			settle( cancel );
		}
	};
	const blur = () => {
		settle( moving || paired ? end : cancel );
		points.clear();
		dispose();
	};
	const visibility = () => {
		if ( view.document.hidden ) {
			blur();
		}
	};
	const handlers = {
		pointerdown: down,
		pointermove: update,
		pointerup: up,
		pointercancel: abort,
		contextmenu: context,
		scroll,
	};
	for ( const doc of documents ) {
		for ( const [ type, handler ] of Object.entries( handlers ) ) {
			doc.addEventListener( type, handler, {
				capture: true,
				passive: false,
			} );
		}
		doc.addEventListener( 'click', click, true );
	}
	view.addEventListener( 'blur', blur );
	view.document.addEventListener( 'visibilitychange', visibility );
	if ( hold ) {
		timer = view.setTimeout( finishHold, HOLD_DELAY );
	}
	return {
		capture: () => {
			for ( const id of points.keys() ) {
				capture( id );
			}
		},
		release() {
			// Normal completion drains remaining fingers without starting a new
			// gesture. External cancellation (selection/mode/unmount) tears down now.
			if ( ! settled ) {
				settled = true;
				releaseCapture();
				points.clear();
				dispose();
			}
		},
		destroy() {
			settled = true;
			releaseCapture();
			points.clear();
			dispose();
			guardDone();
		},
	};
}

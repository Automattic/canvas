import { normalizeRotation } from './rotation.mjs';
export const TOUCH_SLOP = 8;
export const HOLD_DELAY = 500;
const clamp = ( value, min, max ) => Math.max( min, Math.min( max, value ) );
const midpoint = ( [ a, b ] ) => ( {
	x: ( a.x + b.x ) / 2,
	y: ( a.y + b.y ) / 2,
} );
const distance = ( [ a, b ] ) => Math.hypot( b.x - a.x, b.y - a.y );
const angle = ( [ a, b ] ) => Math.atan2( b.y - a.y, b.x - a.x );

// Apply the fingers' similarity transform to the grabbed rectangle. Work from
// a fixed baseline, never the previous frame, so neither scale nor angle drifts.
export function transformTouchRect(
	rect,
	rotation,
	origin,
	current,
	bounds,
	minimum = {
		width: 24,
		height: 24,
	}
) {
	if (
		distance( origin ) < 1 ||
		! [ ...origin, ...current ].every(
			( p ) => Number.isFinite( p.x ) && Number.isFinite( p.y )
		)
	) {
		return {
			rect: {
				...rect,
			},
			rotation: normalizeRotation( rotation ),
		};
	}
	const max = Math.min(
		bounds.width / rect.width,
		bounds.height / rect.height
	);
	const min = Math.min(
		max,
		Math.max( minimum.width / rect.width, minimum.height / rect.height )
	);
	const scale = clamp( distance( current ) / distance( origin ), min, max );
	const radians = angle( current ) - angle( origin );
	const before = midpoint( origin ),
		after = midpoint( current );
	const x = ( rect.left + rect.width / 2 - before.x ) * scale;
	const y = ( rect.top + rect.height / 2 - before.y ) * scale;
	const width = rect.width * scale,
		height = rect.height * scale;
	return {
		rect: {
			left: clamp(
				after.x +
					x * Math.cos( radians ) -
					y * Math.sin( radians ) -
					width / 2,
				0,
				bounds.width - width
			),
			top: clamp(
				after.y +
					x * Math.sin( radians ) +
					y * Math.cos( radians ) -
					height / 2,
				0,
				bounds.height - height
			),
			width,
			height,
		},
		rotation: normalizeRotation(
			( rotation || 0 ) + ( radians * 180 ) / Math.PI
		),
	};
}
export function nearestTouchHandle( point, handles ) {
	const at = ( kind ) => handles.find( ( handle ) => handle.kind === kind );
	const n = at( 'n' ),
		e = at( 'e' ),
		s = at( 's' ),
		w = at( 'w' );
	if ( n && e && s && w ) {
		const width = Math.hypot( e.x - w.x, e.y - w.y ),
			height = Math.hypot( s.x - n.x, s.y - n.y );
		const dx = point.x - ( e.x + w.x ) / 2,
			dy = point.y - ( e.y + w.y ) / 2;
		const x = ( dx * ( e.x - w.x ) + dy * ( e.y - w.y ) ) / width;
		const y = ( dx * ( s.x - n.x ) + dy * ( s.y - n.y ) ) / height;
		// Expanded handles must not consume the entire body of a short text block.
		// Its interior still selects/edits/drags; visible handles keep precedence.
		if (
			Math.min( width, height ) < 44 &&
			Math.abs( x ) < width / 2 - 6 &&
			Math.abs( y ) < height / 2 - 6
		) {
			return 'move';
		}
	}
	return handles.reduce( ( best, handle ) => {
		const distanceValue = Math.hypot(
			point.x - handle.x,
			point.y - handle.y
		);
		return ! best || distanceValue < best.distance
			? {
					...handle,
					distance: distanceValue,
				}
			: best;
	}, null )?.kind;
}

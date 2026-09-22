import { MAX_ROWS, rowPitch, minimumSpans } from './placement.mjs';
import {
	centerCanvasPlacement,
	snapCanvasPlacement,
} from './canvas-geometry.mjs';
import { translateGroupPlacement } from './canvas-groups.mjs';

export function centerInSection(
	placement,
	mode,
	axis = 'both',
	{ minimum = minimumSpans(), preserveSize = false } = {}
) {
	if ( ! preserveSize ) {
		const centered = centerCanvasPlacement(
			placement,
			mode,
			axis,
			minimum
		);
		if ( ! placement.frameRatio ) {
			return centered;
		}
		// Save the displayed proportions after centering and horizontal cell
		// snapping. Do not restore an older ratio when saving the move.
		const frameRatio = centered._rect.width / centered._rect.height;
		return {
			...centered,
			frameRatio,
			_base: { ...centered._base, frameRatio },
		};
	}
	// Groups have derived bounds rather than a resizable cell span. Translate
	// the composition intact, just like ordinary group movement.
	const { _rect: rect, _canvas: canvas } = placement;
	const destination = ( tracks, center, size ) => {
		const starts = tracks
			.map( ( track ) => track.start )
			.filter(
				( start ) =>
					start >= 0 && start + size <= tracks.at( -1 ).end + 0.0001
			);
		return starts.reduce(
			( best, start ) =>
				Math.abs( start + size / 2 - center ) <
				Math.abs( best + size / 2 - center ) - 0.0001
					? start
					: best,
			starts[ 0 ] ?? 0
		);
	};
	return translateGroupPlacement(
		placement,
		mode,
		axis === 'vertical'
			? 0
			: destination(
					canvas.columns,
					canvas.center ?? canvas.width / 2,
					rect.width
				) - rect.left,
		axis === 'horizontal'
			? 0
			: destination( canvas.rows, canvas.height / 2, rect.height ) -
					rect.top
	);
}

export function canMoveSelection( store, ids, canvasId ) {
	if (
		! ids.length ||
		new Set( ids.map( ( id ) => store.getBlockRootClientId( id ) ) )
			.size !== 1 ||
		! store.canMoveBlocks( ids )
	) {
		return false;
	}
	return ids.every(
		( id ) =>
			store.getBlockParents( id ).includes( canvasId ) &&
			[
				id,
				...store
					.getBlockParents( id )
					.filter(
						( parent ) =>
							parent === canvasId ||
							store.getBlockParents( parent ).includes( canvasId )
					),
			].every(
				( key ) =>
					! store.getBlockAttributes( key )?.lock?.move &&
					! store.getTemplateLock( key ) &&
					store.getBlockEditingMode( key ) === 'default'
			)
	);
}

// Clamp once for the whole selection. Already-overflowing frames may move back
// toward the canvas without jumping on the untouched axis.
export function moveSelection(
	layouts,
	ids,
	mode,
	anchorId,
	dx,
	dy,
	{ snap = false, minimum = minimumSpans(), tolerance = 6 } = {}
) {
	const anchor = layouts[ anchorId ][ mode ];
	const clampDelta = ( x, y ) => {
		let left = -Infinity,
			right = Infinity,
			top = -Infinity,
			bottom = Infinity;
		for ( const id of ids ) {
			const { _rect: rect, _canvas: g } = layouts[ id ][ mode ];
			left = Math.max( left, Math.min( 0, -rect.left ) );
			right = Math.min(
				right,
				Math.max( 0, g.width - rect.left - rect.width )
			);
			top = Math.max( top, Math.min( 0, -rect.top ) );
			bottom = Math.min(
				bottom,
				Math.max(
					0,
					g.padding.top +
						MAX_ROWS * rowPitch( g ) -
						g.gap -
						rect.top -
						rect.height
				)
			);
		}
		return [
			Math.max( left, Math.min( right, x ) ),
			Math.max( top, Math.min( bottom, y ) ),
		];
	};
	[ dx, dy ] = clampDelta( dx, dy );
	if ( snap && ( dx || dy ) ) {
		const candidate = translateGroupPlacement( anchor, mode, dx, dy );
		const snapped = snapCanvasPlacement(
			candidate,
			mode,
			minimum,
			anchor,
			tolerance
		);
		// Snapping supplies a destination, never a new size for the selection.
		[ dx, dy ] = clampDelta(
			dx ? snapped._rect.left - anchor._rect.left : 0,
			dy ? snapped._rect.top - anchor._rect.top : 0
		);
	}
	return Object.fromEntries(
		ids.map( ( id ) => [
			id,
			dx || dy
				? translateGroupPlacement( layouts[ id ][ mode ], mode, dx, dy )
				: layouts[ id ][ mode ],
		] )
	);
}

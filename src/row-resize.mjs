import {
	canvasRows,
	mapCanvasPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { exactPlacement } from './canvas-groups.mjs';
import { MAX_ROWS, integer, rowPitch } from './placement.mjs';

// A Shift drag adds the same number of whole rows at each end. Clamp the
// shared delta once so neither end can push existing content out of bounds.
export function resizeCanvasRows(
	layouts,
	mode,
	rowCount,
	minimumRows,
	delta,
	symmetric = false
) {
	if ( ! symmetric ) {
		const rows = Math.max(
			minimumRows,
			Math.min( MAX_ROWS, rowCount + delta )
		);
		return {
			rows: integer( rows, rowCount, minimumRows, MAX_ROWS ),
			offset: 0,
			heightDelta: rows - rowCount,
		};
	}
	let lower = Math.max(
		Math.ceil( ( 1 - rowCount ) / 2 ),
		minimumRows - rowCount
	);
	for ( const layout of Object.values( layouts ) ) {
		const placement = layout[ mode ];
		if ( ! placement?._canvas ) {
			continue;
		}
		const { _rect: rect, _canvas: g } = placement;
		const room = Math.max(
			0,
			Math.min( rect.top, g.height - rect.top - rect.height )
		);
		lower = Math.max(
			lower,
			-Math.floor( ( room + 0.001 ) / rowPitch( g ) )
		);
	}
	const offset =
		integer( delta, 0, lower, Math.floor( ( MAX_ROWS - rowCount ) / 2 ) ) ||
		0;
	return { rows: rowCount + offset * 2, offset, heightDelta: offset * 2 };
}

// Ordinary resizing leaves placements alone. Shift resizing translates the
// original frames to add equal space above and below them.
export function preserveRowsOnResize( layouts, mode, offset = 0, rows ) {
	return Object.fromEntries(
		Object.entries( layouts ).flatMap( ( [ id, layout ] ) => {
			const placement = layout[ mode ];
			// Group bounds follow their children; translating both would apply twice.
			if ( layout.group ) {
				return [];
			}
			if ( offset && placement?._canvas ) {
				const g = placement._canvas;
				const geometry = {
					...g,
					...canvasRows(
						g.padding.top,
						g.padding.bottom,
						rows,
						g.gap,
						g.rowHeight
					),
				};
				const base = savedCanvasPlacement( placement );
				const rect = {
					...placement._rect,
					top: placement._rect.top + offset * rowPitch( g ),
				};
				const shifted = mapCanvasPlacement(
					{
						...base,
						row: base.row + offset,
						...( base.free
							? {
									free: {
										...base.free,
										y: base.free.y + offset,
									},
								}
							: {} ),
					},
					mode,
					geometry
				);
				// Moving a clipped padding cell inward must not expand its frame.
				return [
					[
						id,
						Math.abs( shifted._rect.top - rect.top ) < 0.001 &&
						Math.abs( shifted._rect.height - rect.height ) < 0.001
							? shifted
							: exactPlacement( rect, mode, geometry, base ),
					],
				];
			}

			return [];
		} )
	);
}

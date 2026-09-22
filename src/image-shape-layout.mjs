import { imageShape } from './image-shapes.mjs';
import { ATTRIBUTE, COLUMNS } from './geometry.mjs';
import { normalizeRotation } from './rotation.mjs';

// Preview and commit use the same proposed attributes. Neither mutates the
// source, so hovering cannot create history or accumulate previous previews.
export function imageShapeUpdates( attributes, current, mode, value, canMove ) {
	const saved = attributes?.[ ATTRIBUTE ] || {};
	const shape = imageShape( value );
	const clearRadius =
		shape !== 'none' && attributes?.style?.border?.radius !== undefined;
	const clearRotation =
		shape !== 'none' &&
		canMove &&
		Object.keys( COLUMNS ).some(
			( viewport ) =>
				normalizeRotation( saved[ viewport ]?.rotation ) !== 0
		);
	if (
		imageShape( saved.shape ) === shape &&
		! clearRadius &&
		! clearRotation
	) {
		return null;
	}
	let placement = saved;
	if ( clearRotation ) {
		placement = { ...placement };
		for ( const viewport of Object.keys( COLUMNS ) ) {
			if ( placement[ viewport ] ) {
				placement[ viewport ] = {
					...placement[ viewport ],
					rotation: 0,
				};
			}
		}
	}
	const updates = {
		[ ATTRIBUTE ]: {
			...placement,
			shape: shape === 'none' ? undefined : shape,
			shapeStretch:
				imageShape( saved.shape ) === shape
					? saved.shapeStretch
					: undefined,
		},
	};
	if ( clearRadius ) {
		const { radius, ...border } = attributes.style.border;
		updates.style = { ...attributes.style, border };
	}
	return updates;
}

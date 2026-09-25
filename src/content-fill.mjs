import { ATTRIBUTE } from './placement.mjs';
import { imageFill, imageShape } from './image-shapes.mjs';

export const isFrameMedia = ( name ) =>
	[ 'core/image', 'core/video' ].includes( name );

export const supportsFill = ( name ) =>
	[ 'core/image', 'core/video', 'core/heading', 'core/paragraph' ].includes(
		name
	);

export function contentFill( name, attributes = {} ) {
	const saved = attributes[ ATTRIBUTE ] || {};
	if ( name === 'core/video' ) {
		return saved.fill !== false;
	}
	return name === 'core/image'
		? imageFill( saved )
		: supportsFill( name ) && saved.fill === true && ! attributes.fitText;
}

// Both controls change the same authored setting. Shapes require fill, while
// text area fitting and WordPress's native width fitting are mutually exclusive.
export function fillUpdates( name, attributes, fill ) {
	if (
		! supportsFill( name ) ||
		typeof fill !== 'boolean' ||
		( name === 'core/image' &&
			imageShape( attributes[ ATTRIBUTE ]?.shape ) !== 'none' &&
			! fill )
	) {
		return undefined;
	}
	return {
		[ ATTRIBUTE ]: { ...attributes[ ATTRIBUTE ], fill },
		...( ! isFrameMedia( name ) && fill ? { fitText: undefined } : {} ),
	};
}

export function textWidthUpdates( attributes, enabled ) {
	const updates = {
		fitText: enabled ? true : undefined,
		[ ATTRIBUTE ]: { ...attributes[ ATTRIBUTE ], fill: false },
	};
	if ( enabled ) {
		updates.fontSize = undefined;
		if ( attributes.style?.typography?.fontSize ) {
			updates.style = {
				...attributes.style,
				typography: {
					...attributes.style.typography,
					fontSize: undefined,
				},
			};
		}
	}
	return updates;
}

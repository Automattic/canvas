import { freeFrameFromRect } from './aspect-ratio.mjs';
import {
	canvasColumns,
	mapCanvasPlacement,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { imageFrameRatio, mapImagePlacement } from './image-layout.mjs';
import { projectPlacement } from './placement.mjs';

// Density is an editing affordance, not a layout transform. Resolve inherited
// frames on their authored grid, then express the result on the editing grid
// without rounding either edge. Every sibling uses the same cell pitch/scale.
export function proportionalPlacement(
	source,
	sourceMode,
	mode,
	geometry,
	sourceGeometry,
	minimum,
	image = false
) {
	if ( source.free ) {
		const width =
			( sourceGeometry.referenceWidth * source.gridColumns ) /
			( sourceGeometry.referenceColumns || sourceGeometry.gridColumns );
		const available =
			geometry.contentColumns.at( -1 ).end -
			geometry.contentColumns[ 0 ].start;
		const scale =
			available /
			( width -
				sourceGeometry.padding.left -
				sourceGeometry.padding.right );
		source = {
			...source,
			free: {
				...source.free,
				x:
					( geometry.contentColumns[ 0 ].start +
						( source.free.x * width -
							sourceGeometry.padding.left ) *
							scale ) /
					geometry.width,
				width: ( source.free.width * width * scale ) / geometry.width,
			},
		};
	}
	const authoredGrid = {
		...geometry,
		...canvasColumns(
			geometry.width,
			geometry.padding,
			geometry.wideStart,
			geometry.wideEnd,
			geometry.columnGap,
			mode,
			source.gridColumns
		),
	};
	const left = source.anchors.left ?? source.column - 1;
	const right = source.anchors.right ?? source.column + source.columnSpan - 1;
	const placement = image
		? mapImagePlacement(
				source,
				sourceMode,
				authoredGrid,
				imageFrameRatio( source, sourceMode, sourceGeometry ),
				minimum,
				{
					x:
						typeof left === 'number' &&
						typeof right === 'number' &&
						left + right === source.gridColumns,
				}
			)
		: mapCanvasPlacement( source, sourceMode, authoredGrid, minimum );
	const rect = { ...placement._rect };
	const target = geometry;
	const base = projectPlacement(
		savedCanvasPlacement( placement ),
		sourceMode,
		mode,
		minimum,
		geometry.gridColumns
	);
	return mapCanvasPlacement(
		{
			...base,
			free: freeFrameFromRect( rect, target ),
		},
		mode,
		target,
		minimum,
		false,
		true
	);
}

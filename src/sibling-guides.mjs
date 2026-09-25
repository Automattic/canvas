// Use each current drop placement, not the rotation at gesture start. Keep
// rotated items in the cell preview, but omit them from alignment claims.
export function unrotatedRectangles( placements ) {
	return placements
		.filter( ( placement ) => placement?._rect && ! placement.rotation )
		.map( ( placement ) => placement._rect );
}

export function siblingGuideRectangles( preview ) {
	if ( preview?.rotating || preview?.replacing ) {
		return [];
	}
	const placements = preview?.dropPlacements
		? Object.values( preview.dropPlacements )
		: [ preview?.dropPlacement ];
	return unrotatedRectangles( placements );
}

// Match edges and centres in either direction. Rectangles are local to the
// Canvas, so editor zoom never changes the alignment calculation.
export function siblingMatches(
	rect,
	siblings,
	tolerance = 0.1,
	kind = 'move'
) {
	const matches = [];
	for ( const axis of [ 'x', 'y' ] ) {
		const start = axis === 'x' ? 'left' : 'top';
		const size = axis === 'x' ? 'width' : 'height';
		const handles = axis === 'x' ? [ 'w', 'e' ] : [ 'n', 's' ];
		const edges =
			kind === 'move'
				? [ 0, 0.5, 1 ]
				: [ 0, 1 ].filter( ( edge ) =>
						kind.includes( handles[ edge ] )
					);
		for ( const sibling of siblings ) {
			for ( const edge of edges ) {
				for ( const target of [ 0, 0.5, 1 ] ) {
					const position =
						sibling[ start ] + sibling[ size ] * target;
					const delta =
						position - rect[ start ] - rect[ size ] * edge;
					if ( Math.abs( delta ) <= tolerance ) {
						matches.push( {
							axis,
							edge,
							target,
							position,
							delta,
							sibling,
						} );
					}
				}
			}
		}
	}
	return matches.sort(
		( a, b ) => Math.abs( a.delta ) - Math.abs( b.delta )
	);
}

// Only actual drop rectangles produce guides. Nearby pointer positions never do.
export function alignedSiblingGuides( rectangles, siblings ) {
	const guides = [];
	for ( const rect of rectangles ) {
		const matches = siblingMatches( rect, siblings );
		for ( const match of matches ) {
			const { axis, position, sibling } = match;
			// Matching outer edges already communicate this pair's alignment.
			// Keep centre matches with other, differently sized siblings.
			if (
				match.edge === 0.5 &&
				match.target === 0.5 &&
				[ 0, 1 ].every( ( edge ) =>
					matches.some(
						( other ) =>
							other.axis === axis &&
							other.sibling === sibling &&
							other.edge === edge &&
							other.target === edge
					)
				)
			) {
				continue;
			}
			const start = axis === 'x' ? 'top' : 'left';
			const size = axis === 'x' ? 'height' : 'width';
			const from = Math.min( rect[ start ], sibling[ start ] );
			const to = Math.max(
				rect[ start ] + rect[ size ],
				sibling[ start ] + sibling[ size ]
			);
			const existing = guides.find(
				( guide ) =>
					guide.axis === axis &&
					Math.abs( guide.position - position ) < 0.1
			);
			if ( existing ) {
				existing.from = Math.min( existing.from, from );
				existing.to = Math.max( existing.to, to );
			} else {
				guides.push( { axis, position, from, to } );
			}
		}
	}
	return guides;
}

// Divide the available content width without adding cells for outer padding.
export function columnTracks( width, gap, count ) {
	gap = Math.min( gap, width / ( count * 2 ) );
	const cell = ( width - ( count - 1 ) * gap ) / count;
	return Array.from( { length: count }, ( _, index ) => ( {
		start: index * ( cell + gap ),
		end: index * ( cell + gap ) + cell,
	} ) );
}

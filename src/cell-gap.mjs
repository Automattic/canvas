export const CANVAS = 'tabor/canvas';
const present = ( value ) =>
	value !== undefined && value !== null && value !== '';

// Native gap values are either linked scalars or vertical/top and horizontal/left.
export function gapAxes( value ) {
	const axes =
		typeof value === 'object' && value !== null
			? value
			: {
					top: value,
					left: value,
				};
	return Object.fromEntries(
		[ 'top', 'left' ]
			.filter( ( side ) => present( axes[ side ] ) )
			.map( ( side ) => [ side, axes[ side ] ] )
	);
}
export function resolveGap( ...values ) {
	return Object.assign( {}, ...values.map( gapAxes ) );
}
export function inheritedGap( base = {}, user = {}, className = '' ) {
	const block = base.blocks?.[ CANVAS ];
	const custom = user.blocks?.[ CANVAS ];
	const variations = className
		.split( /\s+/ )
		.filter( ( name ) => name.startsWith( 'is-style-' ) )
		.map( ( name ) => name.slice( 9 ) );
	// Match WordPress's theme/user merge before resolving inheritance between
	// scopes: an object replaces a scalar; two objects merge their own axes.
	const merge = ( a, b ) => {
		if ( ! present( b ) ) {
			return a;
		} else if (
			typeof a === 'object' &&
			a !== null &&
			typeof b === 'object' &&
			b !== null
		) {
			return {
				...a,
				...b,
			};
		}
		return b;
	};
	// Canvas has its own default; block-specific styles can override either axis.
	return resolveGap(
		'24px',
		merge( block?.spacing?.blockGap, custom?.spacing?.blockGap ),
		...variations.map( ( name ) =>
			merge(
				block?.variations?.[ name ]?.spacing?.blockGap,
				custom?.variations?.[ name ]?.spacing?.blockGap
			)
		)
	);
}
export function withGap( style = {}, value ) {
	const spacing = {
		...style.spacing,
	};
	if ( Object.keys( gapAxes( value ) ).length ) {
		spacing.blockGap = value;
	} else {
		delete spacing.blockGap;
	}
	const next = {
		...style,
		spacing,
	};
	if ( ! Object.keys( spacing ).length ) {
		delete next.spacing;
	}
	return next;
}
export function withGlobalGap( styles = {}, value ) {
	return {
		...styles,
		blocks: {
			...styles.blocks,
			[ CANVAS ]: withGap( styles.blocks?.[ CANVAS ], value ),
		},
	};
}
export function pageGapTargets( blocks, sourceId, value, canEdit ) {
	const targets = [];
	let skipped = 0;
	const visit = ( items ) =>
		items.forEach( ( block ) => {
			// These inner blocks belong to a different entity, even when expanded in the editor.
			if (
				[
					'core/block',
					'core/template-part',
					'core/post-content',
				].includes( block.name )
			) {
				return;
			}
			if ( block.name === CANVAS && block.clientId !== sourceId ) {
				if ( ! canEdit( block.clientId ) ) {
					skipped++;
				} else {
					const current = gapAxes(
						block.attributes?.style?.spacing?.blockGap
					);
					const next = gapAxes( value );
					if (
						current.top !== next.top ||
						current.left !== next.left
					) {
						targets.push( block );
					}
				}
			}
			visit( block.innerBlocks || [] );
		} );
	visit( blocks );
	return {
		targets,
		skipped,
	};
}

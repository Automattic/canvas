import { ATTRIBUTE, minimumSpans, savePlacement } from './geometry.mjs';
import {
	isCanvasGroup,
	saveGroupMove,
	sourcePlacement,
} from './canvas-groups.mjs';

export function canDuplicateSelection( store, ids ) {
	const parent = store.getBlockRootClientId( ids[ 0 ] );
	return (
		!! ids.length &&
		! store.getTemplateLock( parent ) &&
		ids.every(
			( id ) =>
				store.getBlockRootClientId( id ) === parent &&
				store.getBlockEditingMode( id ) === 'default' &&
				store.canInsertBlockType( store.getBlockName( id ), parent )
		)
	);
}

export function duplicateDragLayout( block, current, placement, mode ) {
	return isCanvasGroup( block )
		? saveGroupMove(
				block.attributes[ ATTRIBUTE ],
				current[ mode ],
				placement,
				mode
			)
		: savePlacement(
				block.attributes[ ATTRIBUTE ],
				current,
				mode,
				sourcePlacement( placement, mode, current[ mode ] ),
				minimumSpans( block.name )
			);
}

// Keep the starting appearance visible while the existing gesture previews the
// destination. These inert snapshots never enter WordPress's block tree/history.
export function preserveDragOriginals( grid, ids ) {
	const copies = ids.map( ( id ) => {
		const source = grid.querySelector( `[data-canvas-item="${ id }"]` );
		if ( ! source ) {
			return null;
		}
		const copy = source.cloneNode( true );
		const originals = [ source, ...source.querySelectorAll( '*' ) ];
		[ copy, ...copy.querySelectorAll( '*' ) ].forEach( ( node, index ) => {
			const css = grid.ownerDocument.defaultView.getComputedStyle(
				originals[ index ]
			);
			for ( const property of css ) {
				node.style.setProperty(
					property,
					css.getPropertyValue( property )
				);
			}
			for ( const attribute of [ ...node.attributes ] ) {
				if (
					attribute.name.startsWith( 'data-' ) ||
					[ 'id', 'contenteditable' ].includes( attribute.name )
				) {
					node.removeAttribute( attribute.name );
				}
			}
			node.classList.remove(
				'canvas__item',
				'block-editor-block-list__block',
				'is-selected'
			);
		} );
		copy.inert = true;
		copy.setAttribute( 'aria-hidden', 'true' );
		copy.classList.add( 'canvas__drag-original' );
		source.before( copy );
		return copy;
	} );
	return () => copies.forEach( ( copy ) => copy?.remove() );
}

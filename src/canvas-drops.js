import { useLayoutEffect, useState } from '@wordpress/element';
import {
	cloneBlock,
	createBlock,
	getBlockTransforms,
	pasteHandler,
} from '@wordpress/blocks';
import { store as blockEditorStore } from '@wordpress/block-editor';
import { ALLOWED_BLOCKS, ATTRIBUTE } from './geometry.mjs';
import {
	droppedLayouts,
	placementRectangle,
	dropGuidePreview,
} from './drop-layout.mjs';
import { gridMetrics } from './canvas-metrics.mjs';
import { occupiedRows } from './canvas-geometry.mjs';
import { canDropBlocks } from './drop-permissions.mjs';
import { withInsertionDefaults } from './insertion-defaults.mjs';
function transferBlocks( transfer ) {
	try {
		return JSON.parse( transfer.getData( 'wp-blocks' ) ) || {};
	} catch {
		return {};
	}
}
export function useCanvasDrops( {
	stageRef,
	gridRef,
	clientId,
	mode,
	registry,
} ) {
	const [ preview, setPreview ] = useState( null );
	useLayoutEffect( () => {
		const grid = gridRef.current;
		const canvas = stageRef.current.parentElement;
		const doc = grid.ownerDocument;
		const documents = new Set( [ doc, canvas.ownerDocument, document ] );
		const store = registry.select( blockEditorStore );
		const actions = registry.dispatch( blockEditorStore );
		let active = false;
		const clear = () => {
			if ( ! active ) {
				return;
			}
			active = false;
			setPreview( null );
			actions.hideInsertionPoint();
			documents.forEach( ( document ) => {
				if ( document.body.dataset.canvasDropOwner === clientId ) {
					delete document.body.dataset.canvasDropOwner;
				}
			} );
		};
		const currentBlocks = ( ids ) => {
			// Core Button requires Buttons. Its visible surface represents that item.
			const roots = [
				...new Set(
					ids.map( ( id ) =>
						store.getBlockName( id ) === 'core/button'
							? store.getBlockRootClientId( id )
							: id
					)
				),
			];
			return roots
				.filter(
					( id ) =>
						! store
							.getBlockParents( id )
							.some( ( parent ) => roots.includes( parent ) )
				)
				.map( ( id ) => store.getBlock( id ) )
				.filter( Boolean );
		};
		const read = ( transfer, dropping ) => {
			if ( ! transfer ) {
				return null;
			}
			const data = transferBlocks( transfer );
			if (
				data.type === 'block' ||
				( ! dropping && store.getDraggedBlockClientIds().length )
			) {
				const ids =
					data.srcClientIds || store.getDraggedBlockClientIds();
				if ( ! Array.isArray( ids ) ) {
					return null;
				}
				const blocks = currentBlocks( ids );
				return {
					blocks,
					move: true,
				};
			}
			if ( data.type === 'inserter' && Array.isArray( data.blocks ) ) {
				if (
					data.blocks.some(
						( block ) =>
							! block ||
							! [ ...ALLOWED_BLOCKS, 'core/button' ].includes(
								block.name
							)
					)
				) {
					return null;
				}
				return {
					blocks: data.blocks.map( ( block ) =>
						block.name === 'core/button'
							? createBlock( 'core/buttons', {}, [
									cloneBlock( block ),
								] )
							: cloneBlock( block )
					),
				};
			}
			if ( dropping ) {
				const files = Array.from( transfer.files || [] );
				if ( files.length ) {
					if (
						! store.getSettings().mediaUpload ||
						files.some(
							( file ) => ! file.type.startsWith( 'image/' )
						)
					) {
						return null;
					}
					// Core Image's file transform creates blob-backed blocks; the normal
					// Image editor then uploads them and owns progress/error handling.
					const transform = getBlockTransforms(
						'from',
						'core/image'
					).find(
						( item ) =>
							item.type === 'files' && item.isMatch( files )
					);
					return transform
						? {
								blocks: transform.transform( files ),
								media: true,
							}
						: null;
				}
				const html = transfer.getData( 'text/html' );
				return html
					? {
							blocks: pasteHandler( {
								HTML: html,
								mode: 'BLOCKS',
							} ),
							media: true,
						}
					: null;
			}
			const types = Array.from( transfer.types || [] );
			const names = types
				.filter( ( type ) => type.startsWith( 'wp-block:' ) )
				.map( ( type ) => type.slice( 9 ) );
			if ( names.length ) {
				return {
					blocks: names.map( ( name, index ) => ( {
						name: name === 'core/button' ? 'core/buttons' : name,
						clientId: `drop-${ index }`,
						attributes: {},
					} ) ),
				};
			}
			const files = Array.from( transfer.items || [] ).filter(
				( item ) => item.kind === 'file'
			);
			if (
				( files.length &&
					files.every( ( file ) =>
						file.type.startsWith( 'image/' )
					) ) ||
				types.includes( 'text/html' )
			) {
				return {
					blocks: Array.from(
						{
							length: Math.max( 1, files.length ),
						},
						( _, index ) => ( {
							name: 'core/image',
							clientId: `drop-${ index }`,
							attributes: {},
						} )
					),
					media: true,
				};
			}
			return null;
		};
		const allowed = ( payload ) =>
			canDropBlocks( payload, clientId, store );
		const placement = ( event, blocks ) => {
			const metrics = gridMetrics( grid );
			const bounds = grid.getBoundingClientRect();
			const scale = grid.offsetWidth / bounds.width || 1;
			const layouts = droppedLayouts(
				store.getBlocks( clientId ),
				blocks,
				mode,
				{
					x: ( event.clientX - bounds.left ) * scale,
					y: ( event.clientY - bounds.top ) * scale,
				},
				metrics
			);
			return {
				layouts,
				metrics,
			};
		};
		const replacement = ( event, payload ) => {
			if (
				! payload?.media ||
				payload.blocks.length !== 1 ||
				payload.blocks[ 0 ].name !== 'core/image'
			) {
				return null;
			}
			const element = event.target.closest?.( '[data-canvas-item]' );
			const id = element?.dataset.canvasItem;
			if (
				! id ||
				store.getBlockRootClientId( id ) !== clientId ||
				store.getBlockName( id ) !== 'core/image' ||
				store.getBlockEditingMode( id ) === 'disabled' ||
				! store.canRemoveBlock( id )
			) {
				return null;
			}
			return {
				element,
				block: store.getBlock( id ),
			};
		};
		const own = ( event ) => {
			event.preventDefault();
			event.stopImmediatePropagation();
			active = true;
			documents.forEach( ( document ) => {
				document.body.dataset.canvasDropOwner = clientId;
			} );
			actions.hideInsertionPoint();
		};
		const over = ( event ) => {
			own( event );
			const payload = read( event.dataTransfer, false );
			const valid = allowed( payload );
			if ( event.dataTransfer ) {
				let dropEffect;
				if ( valid ) {
					if ( payload.move ) {
						dropEffect = 'move';
					} else {
						dropEffect = 'copy';
					}
				} else {
					dropEffect = 'none';
				}
				event.dataTransfer.dropEffect = dropEffect;
			}
			if ( ! valid ) {
				setPreview( null );
				return;
			}
			const target = replacement( event, payload );
			if ( target ) {
				const bounds = grid.getBoundingClientRect();
				const image = target.element.getBoundingClientRect();
				const scale = grid.offsetWidth / bounds.width || 1;
				setPreview( {
					replacing: true,
					rectangles: [
						{
							left: ( image.left - bounds.left ) * scale,
							top: ( image.top - bounds.top ) * scale,
							width: image.width * scale,
							height: image.height * scale,
						},
					],
					rows: 0,
				} );
				return;
			}
			const { layouts, metrics } = placement( event, payload.blocks );
			const next = layouts
				? {
						...dropGuidePreview(
							layouts,
							store.getBlocks( clientId ),
							mode,
							metrics
						),
						rectangles: Object.values( layouts ).map( ( layout ) =>
							placementRectangle( layout[ mode ], metrics )
						),
						rows: Math.max(
							...Object.values( layouts ).map( ( layout ) =>
								occupiedRows( layout[ mode ] )
							)
						),
					}
				: null;
			setPreview( ( old ) =>
				JSON.stringify( old ) === JSON.stringify( next ) ? old : next
			);
		};
		const drop = ( event ) => {
			own( event );
			try {
				const payload = read( event.dataTransfer, true );
				if ( ! allowed( payload ) ) {
					return;
				}
				const target = replacement( event, payload );
				if ( target ) {
					const { url, id, alt, blob } =
						payload.blocks[ 0 ].attributes;
					// Remount Core Image so its native blob upload lifecycle runs again.
					// Clone the target to retain its grid placement and image styling.
					const image = cloneBlock( target.block, {
						url,
						id,
						alt: alt || '',
						blob,
					} );
					actions.replaceBlock( target.block.clientId, image );
					actions.selectBlock( image.clientId, null );
					return;
				}
				const { blocks, move } = payload;
				const { layouts, metrics } = placement( event, blocks );
				if ( ! layouts ) {
					return;
				}
				registry.batch( () => {
					if ( move ) {
						// Do not change source order for moves already inside this canvas.
						for ( const block of blocks ) {
							const source = store.getBlockRootClientId(
								block.clientId
							);
							if ( source !== clientId ) {
								actions.moveBlocksToPosition(
									[ block.clientId ],
									source,
									clientId,
									store.getBlockCount( clientId )
								);
							}
							actions.updateBlock( block.clientId, {
								attributes: {
									...block.attributes,
									[ ATTRIBUTE ]: layouts[ block.clientId ],
								},
							} );
						}
					} else {
						actions.insertBlocks(
							blocks.map( ( block ) => ( {
								...block,
								attributes: {
									...withInsertionDefaults(
										block,
										mode,
										metrics
									).attributes,
									[ ATTRIBUTE ]: layouts[ block.clientId ],
								},
							} ) ),
							store.getBlockCount( clientId ),
							clientId,
							false
						);
					}
					actions.selectBlock( blocks[ 0 ].clientId, null );
				} );
			} finally {
				clear();
				actions.stopDraggingBlocks();
			}
		};
		const leave = ( event ) => {
			if ( ! canvas.contains( event.relatedTarget ) ) {
				clear();
			}
		};
		const key = ( event ) => {
			if ( active && event.key === 'Escape' ) {
				event.preventDefault();
				clear();
			}
		};
		const handlers = {
			dragenter: over,
			dragover: over,
			dragleave: leave,
			drop,
		};
		for ( const [ name, handler ] of Object.entries( handlers ) ) {
			canvas.addEventListener( name, handler, true );
		}
		documents.forEach( ( document ) => {
			document.addEventListener( 'dragend', clear, true );
			document.addEventListener( 'keydown', key, true );
		} );
		doc.defaultView.addEventListener( 'blur', clear );
		return () => {
			clear();
			for ( const [ name, handler ] of Object.entries( handlers ) ) {
				canvas.removeEventListener( name, handler, true );
			}
			documents.forEach( ( document ) => {
				document.removeEventListener( 'dragend', clear, true );
				document.removeEventListener( 'keydown', key, true );
			} );
			doc.defaultView.removeEventListener( 'blur', clear );
		};
	}, [ stageRef, gridRef, clientId, mode, registry ] );
	return preview;
}

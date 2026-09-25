import {
	compactCanvasAttributes,
	serializePlacement,
} from './serialization.mjs';
import { preserveRowsOnResize } from './row-resize.mjs';
import {
	canMoveSelection,
	moveSelection,
	centerInSection,
} from './selection-movement.mjs';
import { imageShape, imageResizeRatio } from './image-shapes.mjs';
import { imageShapeUpdates } from './image-shape-layout.mjs';
import {
	isCanvasGroup,
	canvasBlocks,
	resolveCanvasLayouts,
	saveGroupMove,
	sourcePlacement,
	nudgeGroupPlacement,
} from './canvas-groups.mjs';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { useSelect, useDispatch, useRegistry } from '@wordpress/data';
import { Path, SVG, ToolbarButton } from '@wordpress/components';
import {
	store as blockEditorStore,
	useBlockProps,
	useInnerBlocksProps,
	BlockControls,
	BlockSettingsMenuControls,
	__unstableBlockSettingsMenuFirstItem as BlockSettingsMenuFirstItem,
} from '@wordpress/block-editor';
import {
	ALLOWED_BLOCKS,
	ATTRIBUTE,
	COLUMNS,
	columnsForAlignment,
	MAX_ROWS,
	changeViewport,
	duplicateLayout,
	integer,
	mapPlacement,
	minimumRows as savedMinimumRows,
	minimumSpans,
	normalizePlacement,
	nudge,
	reorderLayer,
	requiredRows,
	savePlacement,
} from './geometry.mjs';
import { observeTextFit } from './text-fit.mjs';
import { observeCanvasLayout } from './layout-observer.mjs';
import { useCanvasInteractions } from './canvas-interactions';
import { useImageReposition } from './image-reposition';
import { useCanvasDrops } from './canvas-drops';
import { useCanvasGestures } from './canvas-gestures';
import {
	useCanvasViewport,
	useSelectionBox,
	useItemToolbar,
	useGridPreview,
} from './canvas-observers';
import {
	GridGuidelines,
	GridHandle,
	RESIZE_HANDLES,
	resizeHandleAtTouch,
} from './canvas-overlays';
import { ItemMenu, ItemLayerMenu } from './item-controls';
import { CanvasMenu } from './canvas-menu';
import { CanvasContext } from './editor-context';
import { owningGridItem } from './drop-layout.mjs';
import {
	resizeCanvasWithKey,
	savedCanvasPlacement,
} from './canvas-geometry.mjs';
import { useCanvasKeyboard, useLayoutAnnouncement } from './canvas-keyboard';
import { normalizeRotation, rotationModifier } from './rotation.mjs';
import { resizeGestureKind } from './resize-modifiers.mjs';
import { ContainerActions, useContainerSettings } from './container-actions';
import {
	CanvasInserter,
	CanvasContextMenu,
	useCanvasInsertion,
} from './canvas-inserter';
import { RadiusHandle } from './radius-control';
import { useCanvasGap } from './use-canvas-gap';
export default function Edit( { clientId, attributes, isSelected } ) {
	const gap = useCanvasGap( attributes );
	const stageRef = useRef( null );
	const gridRef = useRef( null );
	const initialized = useRef( new Set() );
	const mounted = useRef( false );
	const announce = useLayoutAnnouncement();
	const [ preview, setPreview ] = useState( null );
	const [ showCells, setShowCells ] = useState( false );
	const [ shapePreview, setShapePreview ] = useState( null );
	const clearShapePreview = useCallback( () => setShapePreview( null ), [] );
	const [ geometry, setGeometry ] = useState( {} );
	const mode = useCanvasViewport( gridRef );
	const gridPreview = useGridPreview(
		JSON.stringify( [ gap.effective, attributes.style?.spacing?.padding ] ),
		isSelected,
		gridRef
	);
	useLayoutEffect( () => observeTextFit( gridRef.current ), [] );
	useLayoutEffect(
		() => observeCanvasLayout( gridRef.current, setGeometry ),
		[]
	);
	const registry = useRegistry();
	useContainerSettings( clientId, registry );
	const {
		updateBlockAttributes,
		updateBlock,
		selectBlock,
		__unstableMarkNextChangeAsNotPersistent,
	} = useDispatch( blockEditorStore );
	// UPDATE_BLOCK creates a distinct public history change. Attribute-only
	// actions coalesce successive changes to the same keys, even across drags.
	// Batch layer swaps into one notification/undo step.
	const commitUpdates = useCallback(
		( updates ) =>
			registry.batch( () => {
				for ( const [ id, attributesValue ] of Object.entries(
					updates
				) ) {
					updateBlock( id, {
						attributes: compactCanvasAttributes( attributesValue ),
					} );
				}
			} ),
		[ registry, updateBlock ]
	);
	const {
		blocks,
		rootBlocks,
		selectedId,
		selectedBlockName,
		selectedImageHasSource,
		directSelected,
		locked,
		canResetMobile,
		canResetTablet,
		canvasLocked,
	} = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			const children = store.getBlocks( clientId );
			const selection = store.getSelectedBlockClientIds();
			const selected = owningGridItem(
				store.getSelectedBlockClientId() || selection[ 0 ],
				clientId,
				store.getBlockRootClientId,
				( id ) => isCanvasGroup( store.getBlock( id ) )
			);
			const blocksValue = canvasBlocks( children );
			const selectedClientId = store.getSelectedBlockClientId();
			const canvasAttributes = store.getBlockAttributes( clientId ) || {};
			const canvasEditable =
				! store.getTemplateLock( clientId ) &&
				store.getBlockEditingMode( clientId ) === 'default';
			const movementLocked = ( id ) =>
				!! store.getBlockAttributes( id )?.lock?.move ||
				!! store.getTemplateLock( id ) ||
				store.getBlockEditingMode( id ) !== 'default';
			const ancestors = selected ? store.getBlockParents( selected ) : [];
			const ancestorLocked = ancestors
				.filter(
					( id ) =>
						id === clientId ||
						store.getBlockParents( id ).includes( clientId )
				)
				.some( movementLocked );
			const canReset = ( viewport ) =>
				canvasEditable &&
				( savedMinimumRows( canvasAttributes, viewport ) > 1 ||
					blocksValue.some( ( block ) => {
						const saved = block.attributes[ ATTRIBUTE ];
						return (
							( saved?.[ viewport ] ||
								saved?.offset?.[ viewport ] ) &&
							! block.attributes.lock?.move &&
							store.getBlockEditingMode( block.clientId ) ===
								'default'
						);
					} ) );
			return {
				blocks: blocksValue,
				rootBlocks: children,
				selectedId: selected,
				selectedBlockName: selected
					? store.getBlockName( selectedClientId )
					: null,
				selectedImageHasSource: !! (
					selected &&
					store.getBlockAttributes( selectedClientId )?.url
				),
				directSelected: !! selected && selected === selectedClientId,
				canResetMobile: canReset( 'mobile' ),
				canResetTablet: canReset( 'tablet' ),
				canvasLocked:
					! canvasEditable || !! canvasAttributes.lock?.move,
				locked:
					!! ancestorLocked ||
					!! store.getTemplateLock( clientId ) ||
					!! (
						selected &&
						( store.getBlockAttributes( selected )?.lock?.move ||
							store.getBlockEditingMode( selected ) !==
								'default' )
					),
			};
		},
		[ clientId ]
	);
	const selectedName = blocks.find(
		( block ) => block.clientId === selectedId
	)?.name;

	const layouts = useMemo(
		() => resolveCanvasLayouts( rootBlocks, geometry ),
		[ rootBlocks, geometry ]
	);
	// Initialize newly inserted/pasted children only once per edit session. Undoing
	// initialization must not trigger another persistent update in an effect loop.
	useEffect( () => {
		const updates = {};
		if ( ! mounted.current ) {
			mounted.current = true;
			blocks.forEach( ( block ) =>
				initialized.current.add( block.clientId )
			);
			return;
		}
		// Core duplication shallow-copies attributes, retaining the layout object.
		// Only match existing siblings so loading a page, pasting serialized blocks,
		// and duplicating an entire canvas preserve their saved arrangements.
		const originals = new Map(
			blocks
				.filter(
					( block ) =>
						initialized.current.has( block.clientId ) &&
						block.attributes[ ATTRIBUTE ]
				)
				.map( ( block ) => [
					block.attributes[ ATTRIBUTE ],
					block.clientId,
				] )
		);
		let hasDuplicates = false;
		for ( const block of blocks ) {
			if ( initialized.current.has( block.clientId ) ) {
				continue;
			}
			initialized.current.add( block.clientId );
			let originalId = originals.get( block.attributes[ ATTRIBUTE ] );
			const store = registry.select( blockEditorStore );
			if (
				originalId &&
				store.getBlockRootClientId( originalId ) !==
					store.getBlockRootClientId( block.clientId )
			) {
				originalId = null;
			}
			if ( originalId ) {
				updates[ block.clientId ] = {
					[ ATTRIBUTE ]: isCanvasGroup( block )
						? saveGroupMove(
								block.attributes[ ATTRIBUTE ],
								layouts[ originalId ][ mode ],
								{
									_rect: {
										...layouts[ originalId ][ mode ]._rect,
										top:
											layouts[ originalId ][ mode ]._rect
												.top + 36,
									},
								},
								mode
							)
						: duplicateLayout(
								layouts[ originalId ],
								block.attributes[ ATTRIBUTE ]
							),
				};
				if ( ! isCanvasGroup( block ) ) {
					const saved = updates[ block.clientId ][ ATTRIBUTE ];
					for ( const viewport of Object.keys( COLUMNS ) ) {
						if (
							saved[ viewport ] &&
							geometry[ viewport ]?.canvas
						) {
							saved[ viewport ] = savedCanvasPlacement(
								sourcePlacement(
									mapPlacement(
										saved[ viewport ],
										viewport,
										geometry[ viewport ]
									),
									viewport,
									layouts[ originalId ][ viewport ]
								)
							);
						}
					}
				}
				hasDuplicates = true;
			} else if (
				! isCanvasGroup( block ) &&
				! block.attributes[ ATTRIBUTE ]?.desktop
			) {
				updates[ block.clientId ] = {
					[ ATTRIBUTE ]: {
						...block.attributes[ ATTRIBUTE ],
						desktop: savedCanvasPlacement(
							layouts[ block.clientId ].desktop
						),
					},
				};
			}
			if (
				block.attributes[ ATTRIBUTE ] &&
				! updates[ block.clientId ]
			) {
				const attrs = compactCanvasAttributes( block.attributes );
				if (
					JSON.stringify( attrs[ ATTRIBUTE ] ) !==
					JSON.stringify( block.attributes[ ATTRIBUTE ] )
				) {
					updates[ block.clientId ] = {
						[ ATTRIBUTE ]: attrs[ ATTRIBUTE ],
					};
				}
			}
			if ( block.name === 'core/image' && ! block.attributes.sizeSlug ) {
				updates[ block.clientId ] = {
					...updates[ block.clientId ],
					sizeSlug: 'large',
				};
			}
		}
		if ( Object.keys( updates ).length ) {
			// Keep the automatic offset in the native duplication's undo step.
			if ( hasDuplicates ) {
				__unstableMarkNextChangeAsNotPersistent();
			}
			updateBlockAttributes(
				Object.keys( updates ),
				Object.fromEntries(
					Object.entries( updates ).map( ( [ id, attrs ] ) => [
						id,
						compactCanvasAttributes( attrs ),
					] )
				),
				{
					uniqueByBlock: true,
				}
			);
		}
	}, [
		blocks,
		layouts,
		updateBlockAttributes,
		__unstableMarkNextChangeAsNotPersistent,
		geometry,
		mode,
		registry,
	] );
	const minimumRows = requiredRows( layouts, mode );
	const rowKey = `${ mode }Rows`;
	const rowCount = Math.max(
		savedMinimumRows( attributes, mode ),
		minimumRows,
		geometry[ mode ]?.coreRows || 1
	);
	const commitSelection = useCallback(
		( placements, fitAreas = {} ) => {
			const updates = {};
			for ( const [ id, placement ] of Object.entries( placements ) ) {
				const current = layouts[ id ];
				const block = blocks.find(
					( blockValue ) => blockValue.clientId === id
				);
				if ( ! current || ! block ) {
					continue;
				}
				const fitArea = fitAreas[ id ] ?? current.fitArea;
				if (
					placement === current[ mode ] &&
					fitArea === current.fitArea
				) {
					continue;
				}
				if ( isCanvasGroup( block ) ) {
					updates[ id ] = {
						[ ATTRIBUTE ]: saveGroupMove(
							block.attributes[ ATTRIBUTE ],
							current[ mode ],
							placement,
							mode
						),
					};
					continue;
				}
				const next = savePlacement(
					block.attributes[ ATTRIBUTE ],
					current,
					mode,
					sourcePlacement( placement, mode, current[ mode ] ),
					minimumSpans( block.name )
				);
				if (
					JSON.stringify( next[ mode ] ) ===
						JSON.stringify(
							serializePlacement( current[ mode ], mode )
						) &&
					fitArea === current.fitArea
				) {
					continue;
				}
				updates[ id ] = {
					[ ATTRIBUTE ]: {
						...next,
						fitArea,
					},
					...( fitArea
						? {
								fitText: undefined,
							}
						: {} ),
				};
			}
			if ( Object.keys( updates ).length ) {
				commitUpdates( updates );
			}
		},
		[ blocks, layouts, mode, commitUpdates ]
	);
	const commit = useCallback(
		( id, placement, fitArea ) =>
			commitSelection(
				{
					[ id ]: placement,
				},
				{
					[ id ]: fitArea,
				}
			),
		[ commitSelection ]
	);
	const centerBlock = useCallback(
		( id, axis = 'both' ) => {
			const store = registry.select( blockEditorStore );
			if (
				! layouts[ id ]?.[ mode ]?._canvas ||
				! canMoveSelection( store, [ id ], clientId )
			) {
				return;
			}
			commit(
				id,
				centerInSection( layouts[ id ][ mode ], mode, axis, {
					minimum: minimumSpans( store.getBlockName( id ) ),
					preserveSize: layouts[ id ].group,
				} )
			);
			let announcement;
			if ( axis === 'horizontal' ) {
				announcement = 'Block centered horizontally.';
			} else if ( axis === 'vertical' ) {
				announcement = 'Block centered vertically.';
			} else {
				announcement = 'Block centered in section.';
			}
			announce( announcement );
		},
		[ registry, layouts, mode, clientId, commit, announce ]
	);
	const commitRows = useCallback(
		( rows, offset = 0 ) => {
			const next = integer(
				rows,
				rowCount,
				Math.max( 1, minimumRows + offset ),
				MAX_ROWS
			);
			if ( next === rowCount ) {
				return;
			}
			const updates = {
				[ clientId ]: {
					[ rowKey ]: next,
				},
			};
			for ( const [ id, placement ] of Object.entries(
				preserveRowsOnResize( layouts, mode, offset, next )
			) ) {
				// Full-height previews follow rows without rewriting image metadata.
				if ( placement.fillHeight ) {
					continue;
				}
				const block = blocks.find(
					( blockValue ) => blockValue.clientId === id
				);
				if ( block && ! isCanvasGroup( block ) ) {
					updates[ id ] = {
						[ ATTRIBUTE ]: savePlacement(
							block.attributes[ ATTRIBUTE ],
							layouts[ id ],
							mode,
							sourcePlacement(
								placement,
								mode,
								layouts[ id ][ mode ]
							),
							minimumSpans( block.name ),
							false
						),
					};
				}
			}
			commitUpdates( updates );
		},
		[
			commitUpdates,
			clientId,
			rowKey,
			rowCount,
			minimumRows,
			layouts,
			mode,
			blocks,
		]
	);
	const changeRotation = useCallback(
		( id, value ) => {
			const store = registry.select( blockEditorStore );
			if (
				! layouts[ id ] ||
				layouts[ id ].group ||
				! Number.isFinite( value ) ||
				store.getTemplateLock( clientId ) ||
				store.getBlockAttributes( id )?.lock?.move ||
				store.getBlockEditingMode( id ) !== 'default'
			) {
				return;
			}
			const rotation = normalizeRotation( value );
			commit( id, {
				...layouts[ id ][ mode ],
				rotation,
			} );
			announce( `Rotation ${ rotation } degrees.` );
		},
		[ registry, layouts, clientId, mode, commit, announce ]
	);
	const layer = useCallback(
		( id, direction ) => {
			const store = registry.select( blockEditorStore );
			if (
				store.getTemplateLock( clientId ) ||
				store.getBlockAttributes( id )?.lock?.move ||
				store.getBlockEditingMode( id ) !== 'default'
			) {
				return;
			}
			const siblings = Object.fromEntries(
				Object.entries( layouts ).filter(
					( [ key ] ) =>
						store.getBlockRootClientId( key ) ===
						store.getBlockRootClientId( id )
				)
			);
			const next = reorderLayer( siblings, id, mode, direction );
			if ( next === layouts ) {
				return;
			}
			const updates = Object.fromEntries(
				Object.keys( next )
					.filter(
						( key ) =>
							next[ key ][ mode ].layer !==
							layouts[ key ][ mode ].layer
					)
					.map( ( key ) => [
						key,
						{
							[ ATTRIBUTE ]: {
								...store.getBlockAttributes( key )[ ATTRIBUTE ],
								layers: {
									...store.getBlockAttributes( key )[
										ATTRIBUTE
									]?.layers,
									[ mode ]: next[ key ][ mode ].layer,
								},
							},
						},
					] )
			);
			commitUpdates( updates );
		},
		[ layouts, mode, commitUpdates, registry, clientId ]
	);
	const changeFit = useCallback(
		( id, fit ) => {
			const store = registry.select( blockEditorStore );
			const saved = store.getBlockAttributes( id )?.[ ATTRIBUTE ] || {};
			if (
				store.getBlockEditingMode( id ) !== 'default' ||
				imageShape( saved.shape ) !== 'none'
			) {
				return;
			}
			commitUpdates( {
				[ id ]: {
					[ ATTRIBUTE ]: {
						...saved,
						...( store.getBlockName( id ) === 'core/video'
							? { fill: fit === 'cover' }
							: { fit } ),
					},
				},
			} );
		},
		[ registry, commitUpdates ]
	);
	const changeShapeStretch = useCallback(
		( id, shapeStretch ) => {
			const store = registry.select( blockEditorStore );
			const saved = store.getBlockAttributes( id )?.[ ATTRIBUTE ] || {};
			if (
				store.getBlockName( id ) !== 'core/image' ||
				store.getBlockEditingMode( id ) !== 'default' ||
				imageShape( saved.shape ) === 'none' ||
				typeof shapeStretch !== 'boolean'
			) {
				return;
			}
			clearShapePreview();
			commitUpdates( {
				[ id ]: {
					[ ATTRIBUTE ]: {
						...saved,
						shapeStretch,
					},
				},
			} );
			announce(
				shapeStretch
					? 'Shape stretched to fill its frame.'
					: 'Shape proportions preserved.'
			);
		},
		[ registry, clearShapePreview, commitUpdates, announce ]
	);
	const getShapeUpdates = useCallback(
		( id, value ) => {
			const store = registry.select( blockEditorStore );
			if (
				store.getBlockName( id ) !== 'core/image' ||
				store.getBlockEditingMode( id ) !== 'default'
			) {
				return null;
			}
			return imageShapeUpdates(
				store.getBlockAttributes( id ),
				layouts[ id ],
				mode,
				value,
				canMoveSelection( store, [ id ], clientId )
			);
		},
		[ registry, layouts, mode, clientId ]
	);
	const previewShape = useCallback(
		( id, value ) => {
			const attributesValue = getShapeUpdates( id, value );
			setShapePreview(
				attributesValue
					? {
							id,
							mode,
							attributes: attributesValue,
						}
					: null
			);
		},
		[ getShapeUpdates, mode ]
	);
	const changeShape = useCallback(
		( id, value ) => {
			const updates = getShapeUpdates( id, value );
			clearShapePreview();
			if ( ! updates ) {
				return;
			}
			commitUpdates( {
				[ id ]: updates,
			} );
			announce( 'Image shape: ' + imageShape( value ) + '.' );
		},
		[ getShapeUpdates, clearShapePreview, commitUpdates, announce ]
	);
	const activeShapePreview =
		shapePreview?.mode === mode ? shapePreview : null;
	const shapeLayouts = useMemo( () => {
		if ( ! activeShapePreview ) {
			return layouts;
		}
		const replace = ( blocksValue ) =>
			blocksValue.map( ( block ) => {
				if ( block.clientId === activeShapePreview.id ) {
					return {
						...block,
						attributes: {
							...block.attributes,
							...activeShapePreview.attributes,
						},
					};
				} else if ( block.innerBlocks?.length ) {
					return {
						...block,
						innerBlocks: replace( block.innerBlocks ),
					};
				}
				return block;
			} );
		return resolveCanvasLayouts( replace( rootBlocks ), geometry );
	}, [ activeShapePreview, layouts, rootBlocks, geometry ] );
	const changeAspectRatio = useCallback(
		( id ) => {
			const store = registry.select( blockEditorStore );
			if (
				store.getBlockName( id ) !== 'core/image' ||
				store.getBlockEditingMode( id ) !== 'default' ||
				layouts[ id ]?.fit !== 'cover'
			) {
				return;
			}
			const rect = layouts[ id ]?.[ mode ]._rect;
			if ( ! rect?.width || ! rect?.height ) {
				return;
			}
			const current = store.getBlockAttributes( id );
			commitUpdates( {
				[ id ]: {
					[ ATTRIBUTE ]: {
						...current[ ATTRIBUTE ],
						aspectRatio: layouts[ id ].aspectRatio
							? undefined
							: rect.width / rect.height,
					},
				},
			} );
		},
		[ registry, layouts, mode, commitUpdates ]
	);
	const resetLayout = useCallback( () => {
		const store = registry.select( blockEditorStore );
		if (
			canvasLocked ||
			store.getTemplateLock( clientId ) ||
			store.getBlockEditingMode( clientId ) !== 'default'
		) {
			return;
		}
		const updates = {};
		for ( const block of blocks ) {
			if (
				block.attributes.lock?.move ||
				store.getBlockEditingMode( block.clientId ) !== 'default'
			) {
				continue;
			}
			const saved = {
				...block.attributes[ ATTRIBUTE ],
			};
			if (
				! saved.mobile &&
				! saved.tablet &&
				! saved.offset?.mobile &&
				! saved.offset?.tablet
			) {
				continue;
			}
			for ( const viewport of [ 'mobile', 'tablet' ] ) {
				delete saved[ viewport ];
				if ( saved.offset ) {
					saved.offset = {
						...saved.offset,
					};
					delete saved.offset[ viewport ];
				}
			}
			updates[ block.clientId ] = {
				[ ATTRIBUTE ]: saved,
			};
		}
		for ( const viewport of [ 'mobile', 'tablet' ] ) {
			if ( savedMinimumRows( attributes, viewport ) > 1 ) {
				updates[ clientId ] = {
					...updates[ clientId ],
					[ `${ viewport }Rows` ]:
						viewport === 'mobile' ? 1 : undefined,
				};
			}
		}
		commitUpdates( updates );
	}, [
		attributes,
		blocks,
		registry,
		clientId,
		commitUpdates,
		canvasLocked,
	] );
	const changeTextSizing = useCallback(
		( id, sizing ) => {
			const current = registry
				.select( blockEditorStore )
				.getBlockAttributes( id );
			if ( ! current || ! layouts[ id ] ) {
				return;
			}
			const updates = {
				fitText: sizing === 'width' ? true : undefined,
				[ ATTRIBUTE ]: {
					...current[ ATTRIBUTE ],
					fitArea: sizing === 'area',
				},
			};
			// Match core Fit text: width fitting replaces explicit font-size settings.
			if ( sizing === 'width' ) {
				updates.fontSize = undefined;
				if ( current.style?.typography?.fontSize ) {
					updates.style = {
						...current.style,
						typography: {
							...current.style.typography,
							fontSize: undefined,
						},
					};
				}
			}
			commitUpdates( {
				[ id ]: updates,
			} );
		},
		[ layouts, registry, commitUpdates ]
	);
	const changeAlignment = useCallback(
		( id, axis, value, buttons ) => {
			const current = registry
				.select( blockEditorStore )
				.getBlockAttributes( id );
			if ( ! current ) {
				return;
			}
			// Buttons retain WordPress's own layout attributes, including orientation.
			// Empty values preserve Canvas's existing fill behavior on either axis.
			const updates = buttons
				? {
						layout: {
							...current.layout,
							type: current.layout?.type || 'flex',
							[ axis === 'x'
								? 'justifyContent'
								: 'verticalAlignment' ]:
								value === 'stretch' ? undefined : value,
						},
					}
				: {
						[ ATTRIBUTE ]: {
							...current[ ATTRIBUTE ],
							verticalAlign: value === 'top' ? undefined : value,
						},
					};
			commitUpdates( {
				[ id ]: updates,
			} );
		},
		[ registry, commitUpdates ]
	);
	const gesture = useCanvasGestures( {
		gridRef,
		mode,
		layouts,
		selectedId,
		minimum: minimumSpans( selectedName ),
		commit,
		commitSelection,
		rowCount,
		minimumRows,
		commitRows,
		setPreview,
		registry,
		announce,
	} );
	const box = useSelectionBox(
		stageRef,
		gridRef,
		selectedId,
		preview,
		layouts,
		mode,
		attributes
	);
	const moveWithKey = useCallback(
		( event, ids = [ selectedId ], anchorId = selectedId ) => {
			const offsets = {
				ArrowLeft: [ -1, 0 ],
				ArrowRight: [ 1, 0 ],
				ArrowUp: [ 0, -1 ],
				ArrowDown: [ 0, 1 ],
			};
			if ( ids.length > 1 ) {
				if (
					event.shiftKey ||
					event.altKey ||
					event.ctrlKey ||
					event.metaKey ||
					! offsets[ event.key ]
				) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				const store = registry.select( blockEditorStore );
				if (
					! ids.includes( anchorId ) ||
					! canMoveSelection( store, ids, clientId ) ||
					ids.some( ( id ) => ! layouts[ id ]?.[ mode ]?._canvas )
				) {
					return;
				}
				const [ x, y ] = offsets[ event.key ];
				const start = layouts[ anchorId ][ mode ];
				const next = layouts[ anchorId ].group
					? nudgeGroupPlacement( start, mode, x, y )
					: nudge(
							start,
							mode,
							x,
							y,
							minimumSpans( store.getBlockName( anchorId ) )
						);
				commitSelection(
					moveSelection(
						layouts,
						ids,
						mode,
						anchorId,
						next._rect.left - start._rect.left,
						next._rect.top - start._rect.top
					)
				);
				announce( `${ ids.length } blocks moved.` );
				return;
			}
			if (
				event.shiftKey ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				! offsets[ event.key ] ||
				locked ||
				! layouts[ selectedId ]
			) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const [ x, y ] = offsets[ event.key ];
			const start = layouts[ selectedId ][ mode ];
			const next = layouts[ selectedId ].group
				? nudgeGroupPlacement( start, mode, x, y )
				: nudge( start, mode, x, y, minimumSpans( selectedName ) );
			commit( selectedId, next );
			announce(
				`${ next.column === start.column && next.row === start.row ? 'Movement limit reached. ' : '' }Column ${ next.column }, row ${ next.row }.`
			);
		},
		[
			announce,
			commit,
			commitSelection,
			registry,
			clientId,
			layouts,
			locked,
			mode,
			selectedId,
			selectedName,
		]
	);
	const rotateWithKey = ( event ) => {
		if (
			locked ||
			layouts[ selectedId ]?.group ||
			! layouts[ selectedId ] ||
			event.altKey ||
			! rotationModifier( event ) ||
			! [
				'ArrowLeft',
				'ArrowRight',
				'ArrowUp',
				'ArrowDown',
				'Home',
			].includes( event.key )
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const placement = layouts[ selectedId ][ mode ];
		const direction = [ 'ArrowLeft', 'ArrowDown' ].includes( event.key )
			? -1
			: 1;
		const rotation =
			event.key === 'Home'
				? 0
				: normalizeRotation(
						( placement.rotation || 0 ) +
							direction * ( event.shiftKey ? 15 : 1 )
					);
		commit( selectedId, {
			...placement,
			rotation,
		} );
		announce( `Rotation ${ rotation } degrees.` );
	};
	const resizeWithKey = ( event ) => {
		const offsets = {
			ArrowLeft: [ -1, 0 ],
			ArrowRight: [ 1, 0 ],
			ArrowUp: [ 0, -1 ],
			ArrowDown: [ 0, 1 ],
		};
		if (
			locked ||
			layouts[ selectedId ]?.group ||
			! layouts[ selectedId ] ||
			event.shiftKey ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			! offsets[ event.key ]
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const start = layouts[ selectedId ][ mode ];
		const [ x, y ] = offsets[ event.key ];
		const next = resizeCanvasWithKey(
			start,
			mode,
			x,
			y,
			minimumSpans( selectedName ),
			imageResizeRatio( layouts[ selectedId ], start )
		);
		commit( selectedId, next );
		announce(
			`${ next.columnSpan === start.columnSpan && next.rowSpan === start.rowSpan ? 'Size limit reached. ' : '' }Width ${ next.columnSpan } columns, height ${ next.rowSpan } rows.`
		);
	};
	const heightWithKey = ( event ) => {
		if (
			canvasLocked ||
			event.shiftKey ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			! [ 'ArrowUp', 'ArrowDown' ].includes( event.key )
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const rows = integer(
			rowCount + ( event.key === 'ArrowDown' ? 1 : -1 ),
			rowCount,
			minimumRows,
			MAX_ROWS
		);
		commitRows( rows );
		announce(
			`${ rows === rowCount ? 'Height limit reached. ' : '' }Canvas height ${ rows } rows.`
		);
	};
	const insertion = useCanvasInsertion( {
		clientId,
		gridRef,
		mode,
		registry,
	} );
	const {
		editingId,
		exitEditing,
		finishEditing,
		selectInsertedBlock,
		contextMenu,
		closeContextMenu,
		openTouchMenu,
		handleTouchSurface,
		selectedIds,
		afterGrouping,
	} = useCanvasInteractions( {
		gridRef,
		clientId,
		selectedId,
		mode,
		gesture,
		registry,
		selectBlock,
		moveWithKey,
		rotateWithKey,
		announce,
		canInsert: !! insertion.allowed.length,
	} );
	useItemToolbar(
		selectedId,
		selectedName,
		directSelected,
		selectedBlockName,
		rootBlocks.some( ( block ) => block.clientId === selectedId ),
		selectedImageHasSource,
		editingId
	);
	const finishImageReposition = useImageReposition( {
		gridRef,
		editingId,
		mode,
		registry,
		commitUpdates,
		announce,
		exitEditing,
	} );
	const resizeWithPointer = ( event, direction ) => {
		const kind = resizeHandleAtTouch( event, direction );
		if ( kind === 'move' ) {
			handleTouchSurface( event );
		} else {
			gesture( event, resizeGestureKind( event, kind ), {
				onHold: openTouchMenu,
			} );
		}
	};
	useCanvasKeyboard( {
		gridRef,
		selectedId,
		editingId,
		mode,
	} );
	const dropPreview = useCanvasDrops( {
		stageRef,
		gridRef,
		clientId,
		mode,
		registry,
	} );
	const radiusSettings = useMemo( () => new Map(), [] );
	const renderItemMenu = useCallback(
		( menu, onClose ) => (
			<ItemMenu
				centerBlock={ centerBlock }
				menu={ menu }
				layouts={ layouts }
				mode={ mode }
				layer={ layer }
				changeAspectRatio={ changeAspectRatio }
				changeFit={ changeFit }
				changeShape={ changeShape }
				changeShapeStretch={ changeShapeStretch }
				previewShape={ previewShape }
				clearShapePreview={ clearShapePreview }
				changeTextSizing={ changeTextSizing }
				changeRotation={ changeRotation }
				onClose={ onClose }
				grouping={
					<ContainerActions
						menu={ menu }
						canvasId={ clientId }
						registry={ registry }
						gridRef={ gridRef }
						mode={ mode }
						onClose={ onClose }
						onComplete={ afterGrouping }
						onDistribute={ commitSelection }
					/>
				}
			/>
		),
		[
			centerBlock,
			layouts,
			mode,
			layer,
			changeAspectRatio,
			changeFit,
			changeShape,
			changeShapeStretch,
			previewShape,
			clearShapePreview,
			changeTextSizing,
			changeRotation,
			clientId,
			registry,
			afterGrouping,
			commitSelection,
		]
	);
	const context = useMemo(
		() => ( {
			layouts,
			shapeLayouts,
			shapePreview: activeShapePreview,
			previewShape,
			clearShapePreview,
			mode,
			preview,
			editingId,
			finishImageReposition,
			finishEditing,
			changeFit,
			changeShape,
			changeAlignment,
			layer,
			radiusSettings,
			gridRef,
		} ),
		[
			layouts,
			shapeLayouts,
			activeShapePreview,
			previewShape,
			clearShapePreview,
			mode,
			preview,
			editingId,
			finishImageReposition,
			finishEditing,
			changeFit,
			changeShape,
			changeAlignment,
			layer,
			radiusSettings,
		]
	);
	let shownLayouts;
	if ( preview?.placements ) {
		shownLayouts = {
			...layouts,
			...Object.fromEntries(
				Object.entries( preview.placements ).map(
					( [ id, placement ] ) => [
						id,
						changeViewport( layouts[ id ], mode, placement ),
					]
				)
			),
		};
	} else if ( preview?.placement ) {
		shownLayouts = {
			...layouts,
			[ preview.id ]: changeViewport(
				layouts[ preview.id ],
				mode,
				preview.placement
			),
		};
	} else {
		shownLayouts = shapeLayouts;
	}
	const gridStyle = Object.fromEntries(
		Object.keys( COLUMNS ).map( ( viewport ) => [
			`--canvas-${ viewport }-rows`,
			Math.max(
				savedMinimumRows( attributes, viewport ),
				requiredRows( shownLayouts, viewport )
			),
		] )
	);
	if ( preview?.rows ) {
		gridStyle[ `--canvas-${ mode }-rows` ] = preview.rows;
	}
	if ( preview?.height !== undefined ) {
		gridStyle.height = `${ preview.height }px`;
	}
	if ( dropPreview ) {
		gridStyle[ `--canvas-${ mode }-rows` ] = Math.max(
			rowCount,
			dropPreview.rows
		);
	}
	const blockProps = useBlockProps( {
		'data-canvas-spacing': JSON.stringify( gap.effective ),
		style: {
			'--canvas-desktop-columns': columnsForAlignment(
				'desktop',
				attributes.align
			),
		},
	} );
	// Keep core's layout and global padding on the canvas wrapper, as Group does.
	// Canvas positions its children. Let Core omit their block-alignment control
	// through the parent layout rather than hiding its translated toolbar label.
	const childLayout = useMemo(
		() => ( {
			type: 'default',
			alignments: [ 'none' ],
		} ),
		[]
	);
	const { children, ...innerProps } = useInnerBlocksProps( blockProps, {
		layout: childLayout,
		allowedBlocks: [ ...ALLOWED_BLOCKS, 'core/group' ],
		prioritizedInserterBlocks: ALLOWED_BLOCKS,
		renderAppender: false,
		__unstableDisableDropZone: true,
	} );
	const active = ! editingId && !! ( isSelected || selectedId );
	return (
		<div { ...innerProps }>
			{ isSelected && (
				<BlockControls group="block">
					<ToolbarButton
						label="Show cells"
						icon={
							<SVG viewBox="0 0 24 24" width="24" height="24">
								<Path d="M4 4h4v4H4V4Zm6 0h4v4h-4V4Zm6 0h4v4h-4V4ZM4 10h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM4 16h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4Z" />
							</SVG>
						}
						isPressed={ showCells }
						onClick={ () =>
							setShowCells( ( visible ) => ! visible )
						}
					/>
				</BlockControls>
			) }
			{ ! preview &&
				mode !== 'mobile' &&
				!! insertion.allowed.length &&
				( isSelected || !! selectedId ) && (
					<CanvasInserter
						clientId={ clientId }
						disabled={
							minimumRows +
								normalizePlacement( {}, mode ).rowSpan >
							MAX_ROWS
						}
						onSelect={ ( block ) => {
							insertion.onSelect( block );
							selectInsertedBlock( block );
						} }
					/>
				) }
			<BlockSettingsMenuControls>
				{ ( { selectedClientIds, canEdit, onClose } ) => {
					const id =
						selectedClientIds?.length === 1
							? selectedClientIds[ 0 ]
							: null;
					// The regular slot identifies the actual menu target, including List View.
					// The first-item slot supplies placement without exposing that target.
					return canEdit && layouts[ id ] ? (
						<BlockSettingsMenuFirstItem>
							<ItemLayerMenu
								clientId={ id }
								layouts={ layouts }
								mode={ mode }
								layer={ layer }
								onClose={ onClose }
							/>
						</BlockSettingsMenuFirstItem>
					) : null;
				} }
			</BlockSettingsMenuControls>
			{ contextMenu?.id && contextMenu.mode === mode && (
				<CanvasMenu
					menu={ contextMenu }
					label="Canvas options"
					onClose={ closeContextMenu }
				>
					{ renderItemMenu( contextMenu, closeContextMenu ) }
				</CanvasMenu>
			) }
			{ contextMenu &&
				! contextMenu.id &&
				contextMenu.mode === mode &&
				!! insertion.allowed.length && (
					<CanvasContextMenu
						menu={ contextMenu }
						allowed={ insertion.allowed }
						canReset={
							! canvasLocked &&
							( canResetMobile || canResetTablet )
						}
						resetLayout={ resetLayout }
						insertAt={ ( name, point ) =>
							selectInsertedBlock(
								insertion.insertAt( name, point )
							)
						}
						onClose={ closeContextMenu }
					/>
				) }
			<CanvasContext.Provider value={ context }>
				<div className="canvas__stage" ref={ stageRef }>
					<div
						className="canvas__grid"
						ref={ gridRef }
						style={ gridStyle }
						data-canvas-preview-rows={ preview?.rows ?? undefined }
						data-canvas-desktop-minimum={
							attributes.desktopRows || 12
						}
						data-canvas-tablet-minimum={
							attributes.tabletRows || 1
						}
						data-canvas-mobile-minimum={
							attributes.mobileRows || 1
						}
					>
						{ children }
					</div>
					<GridGuidelines
						gridRef={ gridRef }
						active={
							! dropPreview?.replacing &&
							( ! blocks.length ||
								( showCells &&
									( isSelected || !! selectedId ) ) ||
								gridPreview ||
								!! dropPreview ||
								( active && !! preview && ! preview.rotating ) )
						}
						showAlignment={
							( preview?.rows === null ||
								preview?.rows === undefined ) &&
							! preview?.rotating &&
							( !! dropPreview || !! preview?.placement )
						}
						preview={
							dropPreview ||
							( preview?.rotating ? null : preview )
						}
					/>
					{ dropPreview && (
						<div
							className="canvas__drop-preview"
							aria-hidden="true"
						>
							{ dropPreview.rectangles.map(
								( rectangle, index ) => (
									<div key={ index } style={ rectangle } />
								)
							) }
						</div>
					) }
					{ box &&
						selectedId &&
						selectedIds.length <= 1 &&
						! editingId &&
						! locked && (
							<div className="canvas__selection" style={ box }>
								{ ! preview &&
									[
										'core/image',
										'core/buttons',
										'core/group',
									].includes( selectedName ) && (
										<RadiusHandle
											gridRef={ gridRef }
											selectedId={ selectedId }
											box={ box }
											mode={ mode }
											registry={ registry }
											commitUpdates={ commitUpdates }
											announce={ announce }
										/>
									) }
								{ ! layouts[ selectedId ]?.group &&
									Object.entries( RESIZE_HANDLES ).map(
										( [ direction, label ] ) => (
											<GridHandle
												key={ direction }
												type="button"
												className={ `canvas__resize canvas__resize--${ direction }` }
												aria-label={ `Resize ${ label }` }
												data-canvas-resize={ direction }
												data-canvas-keyboard={
													direction === 'se'
														? 'resize'
														: undefined
												}
												aria-description={ `Width ${ layouts[ selectedId ][ mode ].columnSpan } columns, height ${ layouts[ selectedId ][ mode ].rowSpan } rows. Left and right change width; up and down change height. Hold Shift + Command/Ctrl while dragging to resize proportionally from the center; Command/Ctrl alone rotates corners. Escape returns to the block.` }
												title={ `Resize ${ label } · Shift + Command/Ctrl-drag resizes from center${ direction.length === 2 ? ' · Command/Ctrl-drag to rotate' : '' }` }
												onPointerDown={ ( event ) =>
													resizeWithPointer(
														event,
														direction
													)
												}
												onKeyDown={
													direction === 'se'
														? ( event ) => {
																rotateWithKey(
																	event
																);
																resizeWithKey(
																	event
																);
															}
														: undefined
												}
												tabIndex={
													direction === 'se' ? 0 : -1
												}
											/>
										)
									) }
								{ preview?.placement &&
									( preview.resizing ||
										preview.rotating ||
										preview.transforming ) && (
										<span className="canvas__dimensions">
											{ preview.rotating
												? `${ normalizeRotation( preview.placement.rotation ) }°`
												: `${ preview.placement.columnSpan } × ${ preview.placement.rowSpan }${ preview.transforming ? ` · ${ normalizeRotation( preview.placement.rotation ) }°` : '' }` }
										</span>
									) }
							</div>
						) }
					{ isSelected && ! canvasLocked && (
						<GridHandle
							data-canvas-keyboard="height"
							type="button"
							className="canvas__height components-resizable-box__handle components-resizable-box__side-handle components-resizable-box__handle-bottom"
							aria-label="Resize canvas height"
							aria-description={ `${ preview?.rows ?? rowCount } rows. Hold Shift while dragging to resize the top and bottom equally. Up and down change height. Escape returns to the block.` }
							title="Drag to resize canvas · Shift-drag adjusts top and bottom · arrow keys adjust height"
							onPointerDown={ ( event ) =>
								gesture( event, 'canvas' )
							}
							onKeyDown={ heightWithKey }
						/>
					) }
					{ active &&
						preview?.rows !== null &&
						preview?.rows !== undefined && (
							<span className="canvas__dimensions canvas__dimensions--canvas">
								{ preview.rows }{ ' ' }
								{ preview.rows === 1 ? 'row' : 'rows' }
							</span>
						) }
				</div>
			</CanvasContext.Provider>
		</div>
	);
}

import { isFrameMedia } from './content-fill.mjs';
import { compactCanvas, compactCanvasAttributes } from './serialization.mjs';
import { ImageShapeMenu } from './image-shape-controls';
import {
	isCanvasGroup,
	saveGroupMove,
	sourcePlacement,
} from './canvas-groups.mjs';
import {
	cloneElement,
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useRef,
} from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import {
	BlockControls,
	BlockVerticalAlignmentControl,
	JustifyContentControl,
	MediaReplaceFlow,
	MediaUpload,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { MenuItem, ToolbarButton } from '@wordpress/components';
import { addFilter } from '@wordpress/hooks';
import {
	ALLOWED_BLOCKS,
	ATTRIBUTE,
	changeViewport,
	layoutVariables,
	savePlacement,
} from './geometry.mjs';
import {
	alignmentAttributes,
	responsiveAlignmentAttributes,
	responsiveAlignmentUpdates,
} from './alignment.mjs';
import { freeFrameStyles } from './aspect-ratio.mjs';
import { CanvasContext } from './editor-context';
import { Menu } from './core-menu';
import { CanvasMenuToggle, CanvasSubmenu } from './canvas-menu';
import { imageWasReplaced } from './image-position.mjs';
import { RadiusSettings } from './radius-settings';
import { __ } from '@wordpress/i18n';

const EmptyMediaContext = createContext( false );

function MediaPlaceholderIcon( { icon } ) {
	const ref = useRef( null );
	useLayoutEffect( () => {
		const element = ref.current;
		const doc = element.ownerDocument;
		const view = doc.defaultView;
		const ancestors = [];
		for (
			let node = element.parentElement;
			node;
			node = node.parentElement
		) {
			ancestors.push( node );
		}
		const update = () => {
			// Transparent media wrappers inherit the visible surface behind them.
			const background = ancestors
				.map(
					( node ) => view.getComputedStyle( node ).backgroundColor
				)
				.find(
					( color ) =>
						color !== 'transparent' &&
						! /(?:,\s*0|\/\s*0(?:%)?)\s*\)$/.test( color )
				);
			element.style.setProperty(
				'--canvas-placeholder-surface',
				background || 'Canvas'
			);
		};
		const observer = new view.MutationObserver( update );
		ancestors.forEach( ( node ) =>
			observer.observe( node, {
				attributes: true,
				attributeFilter: [ 'class', 'style' ],
			} )
		);
		observer.observe( doc.head, {
			childList: true,
			subtree: true,
			characterData: true,
		} );
		update();
		return () => observer.disconnect();
	}, [] );
	return (
		<span
			ref={ ref }
			className="canvas__media-placeholder-icon"
			aria-hidden="true"
		>
			{ icon }
		</span>
	);
}

addFilter(
	'editor.MediaPlaceholder',
	'tabor/canvas-empty-media',
	( Original ) =>
		function CanvasMediaPlaceholder( props ) {
			const emptyMedia = useContext( EmptyMediaContext );
			if (
				! emptyMedia ||
				props.disableMediaButtons ||
				! props.placeholder
			) {
				return <Original { ...props } />;
			}
			// Reuse Core's illustration and upload handling without the inline form.
			const placeholder = cloneElement( props.placeholder( null ), {
				withIllustration: true,
				icon: null,
				label: null,
				instructions: null,
				children: (
					<>
						<Original { ...props } disableMediaButtons />
						{ emptyMedia === 'video' && (
							<MediaPlaceholderIcon icon={ props.icon } />
						) }
					</>
				),
			} );
			return (
				<>
					<MediaUpload
						allowedTypes={ props.allowedTypes }
						onSelect={ props.onSelect }
						render={ ( { open } ) =>
							cloneElement( placeholder, { onDoubleClick: open } )
						}
					/>
					{ emptyMedia === 'video' && (
						<BlockControls group="other">
							<MediaReplaceFlow
								name={ __( 'Add video' ) }
								allowedTypes={ props.allowedTypes }
								accept={ props.accept }
								onSelect={ props.onSelect }
								onSelectURL={ props.onSelectURL }
								onError={ props.onError }
								variant="toolbar"
							/>
						</BlockControls>
					) }
				</>
			);
		}
);
export function ItemLayerMenu( {
	clientId,
	layouts,
	mode,
	layer,
	onClose,
	contextMenu = false,
} ) {
	const locked = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			return (
				!! store.getTemplateLock(
					store.getBlockRootClientId( clientId )
				) ||
				!! store.getBlockAttributes( clientId )?.lock?.move ||
				store.getBlockEditingMode( clientId ) !== 'default'
			);
		},
		[ clientId ]
	);
	const ids = Object.keys( layouts )
		.filter(
			( id ) =>
				layouts[ id ].parents?.at( -1 ) ===
				layouts[ clientId ]?.parents?.at( -1 )
		)
		.sort(
			( a, b ) => layouts[ a ][ mode ].layer - layouts[ b ][ mode ].layer
		);
	const index = ids.indexOf( clientId );
	const Item = contextMenu ? Menu.Item : MenuItem;
	return (
		<>
			{ [
				[ 'Bring to front', ids.length ],
				[ 'Send to back', -ids.length ],
			].map( ( [ label, direction ] ) => (
				<Item
					key={ label }
					disabled={
						locked ||
						( direction < 0
							? index === 0
							: index === ids.length - 1 )
					}
					onClick={ () => {
						layer( clientId, direction );
						if ( ! contextMenu ) {
							onClose();
						}
					} }
				>
					{ contextMenu ? (
						<Menu.ItemLabel>{ label }</Menu.ItemLabel>
					) : (
						label
					) }
				</Item>
			) ) }
			{ ! contextMenu && <hr className="canvas__menu-separator" /> }
		</>
	);
}
function ItemAlignmentControls( { clientId, name, attributes } ) {
	const { changeAlignment } = useContext( CanvasContext );
	const editable = useSelect(
		( select ) =>
			select( blockEditorStore ).getBlockEditingMode( clientId ) ===
			'default',
		[ clientId ]
	);
	if ( ! editable ) {
		return null;
	}
	const buttons = name === 'core/buttons';
	const data = alignmentAttributes( name, attributes );
	return (
		<BlockControls group="block">
			<div data-canvas-alignment-controls>
				{ buttons && (
					<JustifyContentControl
						value={ data[ 'data-canvas-justify' ] }
						allowedControls={ [
							'left',
							'center',
							'right',
							'space-between',
							'stretch',
						] }
						onChange={ ( value ) =>
							changeAlignment( clientId, 'x', value, true )
						}
					/>
				) }
				<BlockVerticalAlignmentControl
					value={
						data[
							buttons
								? 'data-canvas-align-y'
								: 'data-canvas-text-align-y'
						]
					}
					controls={
						buttons
							? [
									'top',
									'center',
									'bottom',
									'space-between',
									'stretch',
								]
							: [ 'top', 'center', 'bottom' ]
					}
					onChange={ ( value ) =>
						changeAlignment( clientId, 'y', value, buttons )
					}
				/>
			</div>
		</BlockControls>
	);
}
function ItemMenuItems( {
	centerBlock,
	menu,
	layouts,
	mode,
	layer,
	changeAspectRatio,
	changeFill,
	changeTextSizing,
	changeShape,
	changeShapeStretch,
	previewShape,
	clearShapePreview,
	grouping,
} ) {
	const name = useSelect(
		( select ) => select( blockEditorStore ).getBlockName( menu.id ),
		[ menu.id ]
	);
	const fitText = useSelect(
		( select ) =>
			!! select( blockEditorStore ).getBlockAttributes( menu.id )
				?.fitText,
		[ menu.id ]
	);
	const hasImage = useSelect(
		( select ) =>
			!! select( blockEditorStore ).getBlockAttributes( menu.id )?.url,
		[ menu.id ]
	);
	const image = name === 'core/image';
	const emptyImage = image && ! hasImage;
	const video = name === 'core/video';
	const fill = layouts[ menu.id ].fill;
	const shaped = layouts[ menu.id ].shape !== 'none';
	const fillArea =
		emptyImage ||
		( image && shaped ? layouts[ menu.id ].shapeStretch : fill );
	const text = [ 'core/heading', 'core/paragraph' ].includes( name );
	let fillDescription =
		'Scale and wrap text to fit its width and height. Turn off to use its normal font size.';
	if ( image ) {
		fillDescription = shaped
			? 'Stretch the shape to fill its area. Turn off to keep its proportions. The image always fills the shape.'
			: 'Crop the image to fill its area. Turn off to show the whole image.';
	}
	if ( video ) {
		fillDescription =
			'Crop the video to fill its area. Turn off to show the whole video.';
	}
	const editable = useSelect(
		( select ) =>
			select( blockEditorStore ).getBlockEditingMode( menu.id ) ===
			'default',
		[ menu.id ]
	);
	const rotationLocked = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			return (
				!! store.getTemplateLock(
					store.getBlockRootClientId( menu.id )
				) || !! store.getBlockAttributes( menu.id )?.lock?.move
			);
		},
		[ menu.id ]
	);
	const hideOnClick = () => {
		// Core focuses the disclosure before closing. Restore focus without
		// scrolling a partially visible block before Core attempts that focus.
		menu.anchor?.contextElement?.focus( {
			preventScroll: true,
		} );
		return true;
	};
	return (
		<>
			<Menu.Group>
				<ItemLayerMenu
					clientId={ menu.id }
					layouts={ layouts }
					mode={ mode }
					layer={ layer }
					contextMenu
				/>
				<Menu.Item
					hideOnClick={ hideOnClick }
					disabled={ ! editable || rotationLocked }
					onClick={ () => centerBlock( menu.id ) }
				>
					<Menu.ItemLabel>Center</Menu.ItemLabel>
				</Menu.Item>
				<Menu.Separator />
			</Menu.Group>
			{ ( text || image || video ) && (
				<CanvasMenuToggle
					hideOnClick={ hideOnClick }
					checked={ fillArea }
					disabled={ ! editable || emptyImage }
					aria-description={
						emptyImage ? undefined : fillDescription
					}
					onChange={ () =>
						image && shaped
							? changeShapeStretch( menu.id, ! fillArea )
							: changeFill( menu.id, ! fillArea )
					}
				>
					<Menu.ItemLabel>Fill area</Menu.ItemLabel>
				</CanvasMenuToggle>
			) }
			{ image && (
				<CanvasSubmenu>
					<Menu.SubmenuTriggerItem>
						<Menu.ItemLabel>Image</Menu.ItemLabel>
					</Menu.SubmenuTriggerItem>
					<Menu.Popover aria-label="Image">
						<CanvasMenuToggle
							hideOnClick={ hideOnClick }
							checked={ !! layouts[ menu.id ].aspectRatio }
							disabled={ ! editable || ! fill }
							onChange={ () => changeAspectRatio( menu.id ) }
						>
							<Menu.ItemLabel>Lock aspect ratio</Menu.ItemLabel>
						</CanvasMenuToggle>
					</Menu.Popover>
				</CanvasSubmenu>
			) }
			{ image && (
				<ImageShapeMenu
					clientId={ menu.id }
					shape={ layouts[ menu.id ].shape }
					editable={ editable }
					changeShape={ changeShape }
					previewShape={ previewShape }
					clearShapePreview={ clearShapePreview }
				/>
			) }
			{ text && (
				<CanvasMenuToggle
					hideOnClick={ hideOnClick }
					checked={ fitText }
					disabled={ ! editable }
					aria-description="Scale text to one line; height follows its width."
					onChange={ () => changeTextSizing( menu.id, ! fitText ) }
				>
					<Menu.ItemLabel>Fit text</Menu.ItemLabel>
				</CanvasMenuToggle>
			) }
			{ grouping }
		</>
	);
}
export function ItemMenu( {
	centerBlock,
	menu,
	layouts,
	mode,
	layer,
	changeAspectRatio,
	changeFill,
	changeTextSizing,
	changeShape,
	changeShapeStretch,
	previewShape,
	clearShapePreview,
	onClose,
	grouping,
} ) {
	return (
		<>
			{ layouts[ menu.id ] && ( menu.ids?.length || 1 ) === 1 ? (
				<ItemMenuItems
					centerBlock={ centerBlock }
					menu={ menu }
					layouts={ layouts }
					mode={ mode }
					layer={ layer }
					changeAspectRatio={ changeAspectRatio }
					changeFill={ changeFill }
					changeTextSizing={ changeTextSizing }
					changeShape={ changeShape }
					changeShapeStretch={ changeShapeStretch }
					previewShape={ previewShape }
					clearShapePreview={ clearShapePreview }
					onClose={ onClose }
					grouping={ grouping }
				/>
			) : (
				grouping
			) }
		</>
	);
}
function ItemMediaEditingControl( { clientId, name } ) {
	const { editingId, finishImageReposition, finishEditing } =
		useContext( CanvasContext );
	return (
		editingId === clientId && (
			<BlockControls group="other">
				{ name === 'core/video' && (
					<div
						className="canvas__media-divider"
						role="separator"
						aria-orientation="vertical"
					/>
				) }
				<ToolbarButton
					data-canvas-image-done={
						name === 'core/image' ? '' : undefined
					}
					onClick={
						name === 'core/image'
							? finishImageReposition
							: finishEditing
					}
				>
					Done
				</ToolbarButton>
			</BlockControls>
		)
	);
}
function CanvasItem( { Original, ...props } ) {
	const canvas = useContext( CanvasContext );
	const layout = canvas?.shapeLayouts[ props.clientId ];
	const shapeAttributes =
		canvas?.shapePreview?.id === props.clientId
			? canvas.shapePreview.attributes
			: null;
	const attributes = shapeAttributes
		? {
				...props.attributes,
				...shapeAttributes,
			}
		: props.attributes;
	if ( ! layout ) {
		return <Original { ...props } />;
	}
	const { preview, mode } = canvas;
	const placement =
		preview?.placements?.[ props.clientId ] ||
		( preview?.id === props.clientId ? preview.placement : null );
	const shown = placement
		? changeViewport( layout, mode, placement )
		: layout;
	let savedPlacement;
	if ( placement ) {
		if ( layout.group ) {
			savedPlacement = saveGroupMove(
				props.attributes[ ATTRIBUTE ],
				layout[ mode ],
				placement,
				mode
			);
		} else {
			savedPlacement = savePlacement(
				props.attributes[ ATTRIBUTE ],
				layout,
				mode,
				sourcePlacement( placement, mode, layout[ mode ] )
			);
		}
	} else {
		savedPlacement = attributes[ ATTRIBUTE ] || {};
	}
	let description;
	if ( props.name === 'core/image' && ! props.attributes.url ) {
		description =
			'Empty image. Double-click to open the media library. Drag or use arrow keys to move. Tab reaches layout handles. Enter reaches Add image in the toolbar. Shift+F10 opens Canvas options.';
	} else if ( props.name === 'core/image' && shown.fill ) {
		if ( canvas.editingId === props.clientId ) {
			description =
				'Reposition image. Drag or use arrow keys. Shift uses larger steps. Home centers. Tab reaches Done. Escape finishes.';
		} else {
			description =
				'Drag to move the block. Click the selected block again or press Enter to reposition the image inside its frame.';
		}
	} else if ( props.name === 'core/video' && ! props.attributes.src ) {
		description =
			'Empty video. Double-click to open the media library. Drag or use arrow keys to move. Tab reaches layout handles. Enter reaches Add video in the toolbar. Shift+F10 opens Canvas options.';
	} else if ( props.name === 'core/video' && props.attributes.src ) {
		description =
			canvas.editingId === props.clientId
				? 'Video editing. Use playback controls. Choose Done or press Escape to return to moving.'
				: 'Drag to move the block. Click the selected block again or press Enter to use video controls.';
	} else if ( layout.group ) {
		description =
			'Group. Drag or use arrow keys to move. Enter edits children. Escape exits the group.';
	} else if ( canvas.editingId === props.clientId ) {
		description = 'Editing mode. Escape returns to moving.';
	} else {
		description = `Column ${ shown[ mode ].column }, row ${ shown[ mode ].row }. Arrow keys move one cell. Tab reaches resize, radius when available, rotation, and canvas height. Enter edits. Shift+F10 opens Canvas options.`;
	}
	let itemClass;
	if ( props.name === 'core/image' ) {
		itemClass = ' canvas__image';
	} else if ( props.name === 'core/video' ) {
		itemClass = ' canvas__video';
	} else if ( props.name === 'core/group' ) {
		itemClass = ' canvas__container';
	} else {
		itemClass = '';
	}
	return (
		<Original
			{ ...props }
			attributes={ attributes }
			wrapperProps={ {
				...props.wrapperProps,
				...alignmentAttributes( props.name, props.attributes ),
				draggable: false,
				'data-canvas-item': props.clientId,
				'data-canvas-layout': JSON.stringify(
					compactCanvas( savedPlacement )
				),
				'data-canvas-group': layout.group ? '' : undefined,
				'data-canvas-name': props.name,
				'data-canvas-auto': [ 'tablet', 'mobile' ]
					.filter(
						( viewport ) =>
							! attributes[ ATTRIBUTE ]?.[ viewport ] &&
							! ( placement && viewport === mode )
					)
					.join( ' ' ),
				'data-canvas-editing':
					canvas.editingId === props.clientId ? 'true' : undefined,
				'data-canvas-transforming': placement?.free
					? 'true'
					: undefined,
				'aria-description': description,
				'data-canvas-shape':
					props.name === 'core/image' && shown.shape !== 'none'
						? shown.shape
						: undefined,
				'data-canvas-shape-stretch':
					props.name === 'core/image' && shown.shape !== 'none'
						? String( shown.shapeStretch )
						: undefined,
				'data-canvas-text-fit':
					shown.fill &&
					[ 'core/heading', 'core/paragraph' ].includes( props.name )
						? 'true'
						: undefined,
				style: {
					...props.wrapperProps?.style,
					...layoutVariables( shown ),
					...freeFrameStyles( shown[ mode ] ),
				},
			} }
			className={ `${ props.className || '' } canvas__item${ itemClass }` }
		/>
	);
}
export function registerItemControls() {
	addFilter(
		'editor.BlockListBlock',
		'tabor/canvas-layout-wrapper',
		( Original ) =>
			function CanvasBlockListItem( props ) {
				return <CanvasItem Original={ Original } { ...props } />;
			}
	);
	addFilter(
		'editor.BlockEdit',
		'tabor/canvas-layout-controls',
		( Original ) =>
			function CanvasBlockEdit( props ) {
				const canvas = useContext( CanvasContext );
				const direct = !! canvas?.layouts[ props.clientId ];
				const text =
					direct &&
					[ 'core/heading', 'core/paragraph' ].includes( props.name );
				const image = direct && props.name === 'core/image';
				let emptyMedia = false;
				if ( image && ! props.attributes.url ) {
					emptyMedia = 'image';
				} else if (
					direct &&
					props.name === 'core/video' &&
					! props.attributes.src
				) {
					emptyMedia = 'video';
				}
				const context =
					direct && isFrameMedia( props.name )
						? {
								...props.context,
								allowResize: false,
							}
						: props.context;
				// Supply the default on the first render, before Core Image starts uploading.
				// Core resolves the Large URL and falls back when that size is unavailable.
				const container = !! canvas && props.name === 'core/group';
				let attributes;
				if ( container ) {
					attributes = {
						...props.attributes,
						allowedBlocks: isCanvasGroup( props )
							? [ ...ALLOWED_BLOCKS, 'core/group' ]
							: ALLOWED_BLOCKS,
					};
				} else if ( image && ! props.attributes.sizeSlug ) {
					attributes = {
						...props.attributes,
						sizeSlug: 'large',
					};
				} else {
					attributes = props.attributes;
				}
				const responsiveText =
					text && [ 'tablet', 'mobile' ].includes( canvas.mode );
				if ( responsiveText ) {
					attributes = responsiveAlignmentAttributes(
						attributes,
						canvas.mode
					);
				}
				// Keep the native Typography controls in sync with Canvas options. Choosing
				// core Fit text or an explicit font size also leaves our area-fitting mode.
				const setAttributes = useCallback(
					( updates ) => {
						if (
							container &&
							updates.layout &&
							( isCanvasGroup( props ) ||
								updates.layout.type !== 'flex' )
						) {
							return;
						}
						if (
							image &&
							imageWasReplaced( props.attributes, updates )
						) {
							updates = {
								...updates,
								[ ATTRIBUTE ]: {
									...( updates[ ATTRIBUTE ] ||
										props.attributes[ ATTRIBUTE ] ),
									imagePosition: undefined,
								},
							};
						}
						if ( responsiveText ) {
							updates = responsiveAlignmentUpdates(
								props.attributes,
								attributes,
								updates,
								canvas.mode
							);
						}
						const fontSizeChanged =
							( 'fontSize' in updates &&
								updates.fontSize !==
									props.attributes.fontSize ) ||
							( 'style' in updates &&
								updates.style?.typography?.fontSize !==
									props.attributes.style?.typography
										?.fontSize );
						if (
							text &&
							canvas.layouts[ props.clientId ].fill &&
							( updates.fitText || fontSizeChanged )
						) {
							updates = {
								...updates,
								[ ATTRIBUTE ]: {
									...props.attributes[ ATTRIBUTE ],
									...updates[ ATTRIBUTE ],
									fill: false,
								},
							};
						}
						props.setAttributes(
							compactCanvasAttributes( updates )
						);
					},
					[
						text,
						image,
						container,
						canvas,
						props,
						responsiveText,
						attributes,
					]
				);
				let inspectorControls;
				if ( isFrameMedia( props.name ) ) {
					inspectorControls = (
						<ItemMediaEditingControl
							clientId={ props.clientId }
							name={ props.name }
						/>
					);
				} else {
					inspectorControls = null;
				}
				return (
					<>
						{ canvas &&
							[
								'core/image',
								'core/group',
								'core/button',
							].includes( props.name ) && (
								<RadiusSettings
									clientId={ props.clientId }
									name={ props.name }
								/>
							) }
						<EmptyMediaContext.Provider value={ emptyMedia }>
							<Original
								{ ...props }
								attributes={ attributes }
								context={ context }
								setAttributes={ setAttributes }
							/>
						</EmptyMediaContext.Provider>
						{ props.isSelected &&
							direct &&
							( text || props.name === 'core/buttons' ) && (
								<ItemAlignmentControls
									clientId={ props.clientId }
									name={ props.name }
									attributes={ props.attributes }
								/>
							) }
						{ props.isSelected && direct && inspectorControls }
					</>
				);
			}
	);
}

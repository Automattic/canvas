import { compactCanvas, compactCanvasAttributes } from './serialization.mjs';
import { ImageShapeMenu } from './image-shape-controls';
import {
	isCanvasGroup,
	saveGroupMove,
	sourcePlacement,
} from './canvas-groups.mjs';
import { memo, useCallback, useContext } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import {
	BlockControls,
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
import { CanvasContext, CanvasPreviewContext } from './editor-context';
import { Menu } from './core-menu';
import { CanvasSubmenu } from './canvas-menu';
import { normalizeRotation } from './rotation.mjs';
import { imageWasReplaced } from './image-position.mjs';
import { RadiusSettings } from './radius-settings';
const TEXT_SIZING_OPTIONS = [
	{
		value: 'default',
		label: 'Default',
		info: 'Use the normal font size.',
	},
	{
		value: 'area',
		label: 'Fit area',
		info: 'Resize and wrap to fit.',
	},
	{
		value: 'width',
		label: 'Fit width',
		info: 'Resize to fit one line.',
	},
];
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
function ItemAlignmentMenu( {
	clientId,
	buttons,
	editable,
	changeAlignment,
	hideOnClick,
} ) {
	const attributes = useSelect(
		( select ) => select( blockEditorStore ).getBlockAttributes( clientId ),
		[ clientId ]
	);
	const data = alignmentAttributes(
		buttons ? 'core/buttons' : 'core/paragraph',
		attributes
	);
	const axes = [
		{
			axis: 'y',
			label: 'Vertical',
			value: buttons
				? data[ 'data-canvas-align-y' ]
				: data[ 'data-canvas-text-align-y' ],
			options: buttons
				? [ 'top', 'center', 'bottom', 'stretch' ]
				: [ 'top', 'center', 'bottom' ],
		},
	];
	if ( buttons ) {
		axes.unshift( {
			axis: 'x',
			label: 'Horizontal',
			value: data[ 'data-canvas-justify' ],
			options: [ 'left', 'center', 'right', 'stretch' ],
		} );
	}
	return (
		<CanvasSubmenu>
			<Menu.SubmenuTriggerItem>
				<Menu.ItemLabel>Content alignment</Menu.ItemLabel>
			</Menu.SubmenuTriggerItem>
			<Menu.Popover aria-label="Content alignment">
				{ axes.map( ( { axis, label, value, options } ) => (
					<Menu.Group key={ axis }>
						<Menu.GroupLabel>{ label }</Menu.GroupLabel>
						{ options.map( ( option ) => (
							<Menu.RadioItem
								key={ option }
								name={ `content-alignment-${ axis }` }
								value={ option }
								checked={
									( value === 'space-between'
										? options[ 0 ]
										: value ) === option
								}
								disabled={ ! editable }
								hideOnClick={ hideOnClick }
								onChange={ () =>
									changeAlignment(
										clientId,
										axis,
										option,
										buttons
									)
								}
							>
								<Menu.ItemLabel>
									{ option[ 0 ].toUpperCase() +
										option.slice( 1 ) }
								</Menu.ItemLabel>
							</Menu.RadioItem>
						) ) }
					</Menu.Group>
				) ) }
			</Menu.Popover>
		</CanvasSubmenu>
	);
}
function ItemMenuItems( {
	centerBlock,
	menu,
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
	changeAlignment,
	changeRotation,
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
	const image = name === 'core/image';
	const fill = layouts[ menu.id ].fit === 'cover';
	const shaped = layouts[ menu.id ].shape !== 'none';
	const text = [ 'core/heading', 'core/paragraph' ].includes( name );
	let sizing;
	if ( fitText ) {
		sizing = 'width';
	} else if ( layouts[ menu.id ].fitArea ) {
		sizing = 'area';
	} else {
		sizing = 'default';
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
			{ image && (
				<CanvasSubmenu>
					<Menu.SubmenuTriggerItem>
						<Menu.ItemLabel>Image</Menu.ItemLabel>
					</Menu.SubmenuTriggerItem>
					<Menu.Popover aria-label="Image">
						<Menu.CheckboxItem
							name="image-fill"
							hideOnClick={ hideOnClick }
							checked={ fill }
							disabled={ ! editable || shaped }
							aria-description={
								shaped
									? 'Shapes require the image to fill its area.'
									: 'Crop the image to fill its area. Turn off to show the whole image.'
							}
							onChange={ () =>
								changeFit( menu.id, fill ? 'contain' : 'cover' )
							}
						>
							<Menu.ItemLabel>Fill image</Menu.ItemLabel>
						</Menu.CheckboxItem>
						<Menu.CheckboxItem
							name="image-aspect-ratio"
							hideOnClick={ hideOnClick }
							checked={ !! layouts[ menu.id ].aspectRatio }
							disabled={ ! editable || ! fill }
							onChange={ () => changeAspectRatio( menu.id ) }
						>
							<Menu.ItemLabel>Lock aspect ratio</Menu.ItemLabel>
						</Menu.CheckboxItem>
						<Menu.Item
							hideOnClick={ hideOnClick }
							disabled={
								! editable ||
								rotationLocked ||
								normalizeRotation(
									layouts[ menu.id ][ mode ].rotation
								) === 0
							}
							onClick={ () => changeRotation( menu.id, 0 ) }
						>
							<Menu.ItemLabel>Reset rotation</Menu.ItemLabel>
						</Menu.Item>
						{ shaped && (
							<Menu.CheckboxItem
								name="shape-stretch"
								hideOnClick={ hideOnClick }
								checked={ layouts[ menu.id ].shapeStretch }
								disabled={ ! editable }
								aria-description="Fill the frame with the shape. Turn off to keep its proportions."
								onChange={ () =>
									changeShapeStretch(
										menu.id,
										! layouts[ menu.id ].shapeStretch
									)
								}
							>
								<Menu.ItemLabel>Stretch shape</Menu.ItemLabel>
							</Menu.CheckboxItem>
						) }
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
			{ ( text || name === 'core/buttons' ) && (
				<ItemAlignmentMenu
					clientId={ menu.id }
					buttons={ name === 'core/buttons' }
					editable={ editable }
					changeAlignment={ changeAlignment }
					hideOnClick={ hideOnClick }
				/>
			) }
			{ text && (
				<CanvasSubmenu>
					<Menu.SubmenuTriggerItem>
						<Menu.ItemLabel>Text sizing</Menu.ItemLabel>
					</Menu.SubmenuTriggerItem>
					<Menu.Popover aria-label="Text sizing">
						{ TEXT_SIZING_OPTIONS.map(
							( { value, label, info } ) => (
								<Menu.RadioItem
									key={ value }
									name="text-sizing"
									value={ value }
									hideOnClick={ hideOnClick }
									checked={ sizing === value }
									disabled={ ! editable }
									onChange={ () =>
										changeTextSizing( menu.id, value )
									}
								>
									<Menu.ItemLabel>{ label }</Menu.ItemLabel>
									<Menu.ItemHelpText>
										{ info }
									</Menu.ItemHelpText>
								</Menu.RadioItem>
							)
						) }
					</Menu.Popover>
				</CanvasSubmenu>
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
	changeFit,
	changeShape,
	changeShapeStretch,
	previewShape,
	clearShapePreview,
	changeTextSizing,
	changeAlignment,
	changeRotation,
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
					changeFit={ changeFit }
					changeShape={ changeShape }
					changeShapeStretch={ changeShapeStretch }
					previewShape={ previewShape }
					clearShapePreview={ clearShapePreview }
					changeTextSizing={ changeTextSizing }
					changeAlignment={ changeAlignment }
					changeRotation={ changeRotation }
					onClose={ onClose }
					grouping={ grouping }
				/>
			) : (
				grouping
			) }
		</>
	);
}
function ItemImageRepositionControl( { clientId } ) {
	const { editingId, finishImageReposition } = useContext( CanvasContext );
	return (
		editingId === clientId && (
			<BlockControls group="other">
				<ToolbarButton
					data-canvas-image-done
					onClick={ finishImageReposition }
				>
					Done
				</ToolbarButton>
			</BlockControls>
		)
	);
}
function CanvasItem( { Original, ...props } ) {
	const canvas = useContext( CanvasContext );
	const preview = useContext( CanvasPreviewContext );
	const layout = canvas?.shapeLayouts[ props.clientId ];
	const shapeAttributes =
		canvas?.shapePreview?.id === props.clientId
			? canvas.shapePreview.attributes
			: null;
	const placement =
		preview?.placements?.[ props.clientId ] ||
		( preview?.id === props.clientId ? preview.placement : null );
	const fitArea = preview?.placements ? layout?.fitArea : preview?.fitArea;
	return (
		<CanvasItemPlacement
			{ ...props }
			Original={ Original }
			canvasLayout={ layout }
			canvasShapeAttributes={ shapeAttributes }
			canvasPlacement={ placement }
			canvasFitArea={ placement ? fitArea : undefined }
			canvasMode={ canvas?.mode }
			canvasEditing={ canvas?.editingId === props.clientId }
		/>
	);
}

// Context still reaches each small subscriber, but unchanged items can skip
// serialization, style generation, and rendering Gutenberg's block subtree.
const CanvasItemPlacement = memo( function ItemPlacement( {
	Original,
	canvasLayout: layout,
	canvasShapeAttributes: shapeAttributes,
	canvasPlacement: placement,
	canvasFitArea: fitArea,
	canvasMode: mode,
	canvasEditing: editing,
	...props
} ) {
	const attributes = shapeAttributes
		? {
				...props.attributes,
				...shapeAttributes,
			}
		: props.attributes;
	if ( ! layout ) {
		return <Original { ...props } />;
	}
	// Core width fitting keeps ownership during a drag, so a preview never
	// runs two fitting engines.
	const shown = placement
		? changeViewport(
				{
					...layout,
					fitArea: fitArea && ! props.attributes.fitText,
				},
				mode,
				placement
			)
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
			'Empty image. Drag or use arrow keys to move. Tab reaches layout handles. Enter reaches upload controls. Shift+F10 opens Canvas options.';
	} else if ( props.name === 'core/image' && shown.fit === 'cover' ) {
		if ( editing ) {
			description =
				'Reposition image. Drag or use arrow keys. Shift uses larger steps. Home centers. Tab reaches Done. Escape finishes.';
		} else {
			description =
				'Drag to move the block. Double-click or press Enter to reposition the image inside its frame.';
		}
	} else if ( layout.group ) {
		description =
			'Group. Drag or use arrow keys to move. Enter edits children. Escape exits the group.';
	} else if ( editing ) {
		description = 'Editing mode. Escape returns to moving.';
	} else {
		description = `Column ${ shown[ mode ].column }, row ${ shown[ mode ].row }. Arrow keys move one cell. Tab reaches resize, radius when available, rotation, and canvas height. Enter edits. Shift+F10 opens Canvas options.`;
	}
	let itemClass;
	if ( props.name === 'core/image' ) {
		itemClass = ' canvas__image';
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
				'data-canvas-editing': editing ? 'true' : undefined,
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
					shown.fitArea &&
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
} );
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
				const context = image
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
							canvas.layouts[ props.clientId ].fitArea &&
							( updates.fitText || fontSizeChanged )
						) {
							updates = {
								...updates,
								[ ATTRIBUTE ]: {
									...props.attributes[ ATTRIBUTE ],
									...updates[ ATTRIBUTE ],
									fitArea: false,
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
				if ( props.name === 'core/image' ) {
					inspectorControls = (
						<ItemImageRepositionControl
							clientId={ props.clientId }
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
						<Original
							{ ...props }
							attributes={ attributes }
							context={ context }
							setAttributes={ setAttributes }
						/>
						{ props.isSelected && direct && inspectorControls }
					</>
				);
			}
	);
}

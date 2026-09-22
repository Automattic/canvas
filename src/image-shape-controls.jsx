import { useContext, useEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import {
	InspectorControls,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { CanvasContext } from './editor-context';
import { CanvasSubmenu } from './canvas-menu';
import { Menu } from './core-menu';
import {
	IMAGE_SHAPES,
	shapePath,
	preferredShapeRatio,
} from './image-shapes.mjs';

function ShapeIcon( { shape } ) {
	const ratio = preferredShapeRatio( shape ) || 1;
	const x = Math.max( 0, ( 100 - 100 * ratio ) / 2 ),
		y = Math.max( 0, ( 100 - 100 / ratio ) / 2 );
	return (
		<svg
			viewBox="0 0 100 100"
			width="24"
			height="24"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d={ shapePath( shape ) }
				fill="currentColor"
				transform={ `translate(${ x } ${ y }) scale(${ 1 - x / 50 } ${ 1 - y / 50 })` }
			/>
			{ shape === 'none' && (
				<path d="M10 90L90 10" stroke="white" strokeWidth="8" />
			) }
		</svg>
	);
}

function useShapePreviewCleanup( clientId, clearShapePreview ) {
	useEffect(
		() => () => clearShapePreview(),
		[ clientId, clearShapePreview ]
	);
}

export function ImageShapeMenu( {
	clientId,
	shape,
	editable,
	changeShape,
	previewShape,
	clearShapePreview,
} ) {
	useShapePreviewCleanup( clientId, clearShapePreview );
	return (
		<CanvasSubmenu
			onOpenChange={ ( open ) => {
				if ( ! open ) {
					clearShapePreview();
				}
			} }
		>
			<Menu.SubmenuTriggerItem disabled={ ! editable }>
				<Menu.ItemLabel>Shape</Menu.ItemLabel>
			</Menu.SubmenuTriggerItem>
			<Menu.Popover
				aria-label="Shape"
				onPointerLeave={ clearShapePreview }
				onBlur={ ( event ) => {
					if (
						! event.currentTarget.contains( event.relatedTarget )
					) {
						clearShapePreview();
					}
				} }
			>
				{ IMAGE_SHAPES.map( ( { value, label } ) => (
					<Menu.RadioItem
						key={ value }
						name="image-shape"
						value={ value }
						checked={ shape === value }
						disabled={ ! editable }
						hideOnClick
						onChange={ () => changeShape( clientId, value ) }
						onPointerEnter={ () => {
							if ( editable ) {
								previewShape( clientId, value );
							}
						} }
						onFocus={ () => {
							if ( editable ) {
								previewShape( clientId, value );
							}
						} }
					>
						<Menu.ItemLabel>
							<span className="canvas-image-shape-label">
								<ShapeIcon shape={ value } />
								<span>{ label }</span>
							</span>
						</Menu.ItemLabel>
					</Menu.RadioItem>
				) ) }
			</Menu.Popover>
		</CanvasSubmenu>
	);
}

export function ImageShapeInspector( { clientId } ) {
	const { layouts, changeShape, previewShape, clearShapePreview } =
		useContext( CanvasContext );
	useShapePreviewCleanup( clientId, clearShapePreview );
	const editable = useSelect(
		( select ) =>
			select( blockEditorStore ).getBlockEditingMode( clientId ) ===
			'default',
		[ clientId ]
	);
	const shape = layouts[ clientId ].shape;
	return (
		<InspectorControls group="styles">
			<PanelBody title="Shape">
				<div
					className="canvas-image-shapes"
					role="radiogroup"
					aria-label="Image shape"
					onPointerLeave={ clearShapePreview }
					onBlur={ ( event ) => {
						if (
							! event.currentTarget.contains(
								event.relatedTarget
							)
						) {
							clearShapePreview();
						}
					} }
				>
					{ IMAGE_SHAPES.map( ( { value, label } ) => (
						<label
							key={ value }
							className="canvas-image-shapes__option"
							htmlFor={ `canvas-image-shape-${ clientId }-${ value }` }
							onPointerEnter={ () => {
								if ( editable ) {
									previewShape( clientId, value );
								}
							} }
						>
							<input
								type="radio"
								id={ `canvas-image-shape-${ clientId }-${ value }` }
								name={ `canvas-image-shape-${ clientId }` }
								value={ value }
								checked={ shape === value }
								disabled={ ! editable }
								onChange={ () =>
									changeShape( clientId, value )
								}
								onFocus={ () => {
									if ( editable ) {
										previewShape( clientId, value );
									}
								} }
							/>
							<span>
								<ShapeIcon shape={ value } />
								<span>{ label }</span>
							</span>
						</label>
					) ) }
				</div>
			</PanelBody>
		</InspectorControls>
	);
}

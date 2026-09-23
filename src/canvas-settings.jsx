import { useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	__experimentalVStack as VStack,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components';
import { CellGapControls } from './cell-gap-controls';
import { fillScreenSize, SCREEN_HEIGHTS } from './fill-screen.mjs';

export function CanvasSettings( {
	clientId,
	attributes,
	disabled,
	previewGrid,
	...props
} ) {
	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const size = fillScreenSize( attributes );
	return (
		<PanelBody title="Settings" initialOpen>
			<VStack spacing={ 4 } className="canvas-screen-settings">
				<ToggleControl
					label="Fill screen"
					checked={ !! size }
					disabled={ disabled }
					__nextHasNoMarginBottom
					onChange={ ( fillScreen ) => {
						updateBlockAttributes( clientId, {
							fillScreen,
							fillScreenHeight: 'large',
						} );
						previewGrid();
					} }
				/>
				{ size && (
					<ToggleGroupControl
						label="Height"
						value={ size }
						isBlock
						disabled={ disabled }
						__next40pxDefaultSize
						__nextHasNoMarginBottom
						onChange={ ( fillScreenHeight ) => {
							if (
								! Object.hasOwn(
									SCREEN_HEIGHTS,
									fillScreenHeight
								)
							) {
								return;
							}
							updateBlockAttributes( clientId, {
								fillScreenHeight,
							} );
							previewGrid();
						} }
					>
						{ Object.entries( SCREEN_HEIGHTS ).map(
							( [ value, height ] ) => (
								<ToggleGroupControlOption
									key={ value }
									value={ value }
									label={ value[ 0 ].toUpperCase() }
									aria-label={ `${ value[ 0 ].toUpperCase() }${ value.slice( 1 ) }: ${ height }% of screen height` }
									onClick={ previewGrid }
									showTooltip
								/>
							)
						) }
					</ToggleGroupControl>
				) }
			</VStack>
			<CellGapControls
				clientId={ clientId }
				attributes={ attributes }
				{ ...props }
			/>
		</PanelBody>
	);
}

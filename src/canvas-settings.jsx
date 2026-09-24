import { PanelBody } from '@wordpress/components';
import { CellGapControls } from './cell-gap-controls';

export function CanvasSettings( { clientId, attributes, ...props } ) {
	return (
		<PanelBody title="Settings" initialOpen>
			<CellGapControls
				clientId={ clientId }
				attributes={ attributes }
				{ ...props }
			/>
		</PanelBody>
	);
}

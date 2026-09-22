import { useContext, useLayoutEffect } from '@wordpress/element';
import { useSettings } from '@wordpress/block-editor';
import { getBlockSupport } from '@wordpress/blocks';
import { __experimentalUseCustomUnits as useCustomUnits } from '@wordpress/components';
import { CanvasContext } from './editor-context';

// Read inside each target's BlockEdit context, so Core resolves theme, block,
// ancestor and filtered settings exactly as it does for the native Inspector.
export function RadiusSettings( { clientId, name } ) {
	const { radiusSettings, gridRef } = useContext( CanvasContext );
	const [ enabled, availableUnits ] = useSettings(
		'border.radius',
		'spacing.units'
	);
	const units = useCustomUnits( {
		availableUnits: availableUnits || [ 'px', 'em', 'rem' ],
	} );
	const support = getBlockSupport( name, '__experimentalBorder' );
	const settings = JSON.stringify( {
		enabled: !! enabled && ( support === true || !! support?.radius ),
		units: units.map( ( { value, step } ) => ( { value, step } ) ),
	} );
	useLayoutEffect( () => {
		const notify = () => {
			const grid = gridRef.current;
			if ( grid ) {
				grid.dispatchEvent(
					new grid.ownerDocument.defaultView.Event(
						'canvas-radius-settings-change'
					)
				);
			}
		};
		radiusSettings.set( clientId, JSON.parse( settings ) );
		notify();
		return () => {
			radiusSettings.delete( clientId );
			notify();
		};
	}, [ clientId, settings, radiusSettings, gridRef ] );
	return null;
}

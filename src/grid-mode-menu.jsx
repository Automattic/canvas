import { MenuItem } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { Menu } from './core-menu';
import { CanvasMenuToggle } from './canvas-menu';

export function GridModeMenu( {
	cells,
	setAttributes,
	onClose,
	contextMenu = false,
} ) {
	const label = __( 'Grid', 'canvas' );
	const onChange = () => {
		setAttributes( { cells: ! cells } );
		onClose();
	};
	return contextMenu ? (
		<CanvasMenuToggle checked={ cells } onChange={ onChange }>
			<Menu.ItemLabel>{ label }</Menu.ItemLabel>
		</CanvasMenuToggle>
	) : (
		<MenuItem
			role="menuitemcheckbox"
			isSelected={ cells }
			onClick={ onChange }
		>
			{ label }
		</MenuItem>
	);
}

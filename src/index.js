import { registerBlockType } from '@wordpress/blocks';
import {
	InnerBlocks,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { select } from '@wordpress/data';
import { CANVAS_ICON } from './canvas-icon';
import { addFilter } from '@wordpress/hooks';
import metadata from './block.json';
import Edit from './editor';
import { registerItemControls } from './item-controls';
import { ALLOWED_BLOCKS, ATTRIBUTE } from './geometry.mjs';
import './style.scss';
import './editor.scss';

addFilter(
	'blocks.registerBlockType',
	'tabor/canvas-layout-attribute',
	( settings, name ) => {
		if ( ! [ ...ALLOWED_BLOCKS, 'core/group' ].includes( name ) ) {
			return settings;
		}
		return {
			...settings,
			attributes: {
				...settings.attributes,
				[ ATTRIBUTE ]: { type: 'object' },
			},
		};
	}
);

registerItemControls();

// Contextual settings let Core omit duotone controls before rendering them,
// while preserving Image controls outside Canvas and existing saved styles.
const emptyPresets = [];
addFilter(
	'blockEditor.useSetting.before',
	'tabor/canvas-image-duotone',
	( value, path, clientId, name ) => {
		if ( name !== 'core/image' || ! clientId ) {
			return value;
		}
		const preset = [
			'color.duotone.custom',
			'color.duotone.theme',
			'color.duotone.default',
		].includes( path );
		if (
			! preset &&
			! [ 'color.customDuotone', 'color.defaultDuotone' ].includes( path )
		) {
			return value;
		}
		const editor = select( blockEditorStore );
		if (
			! editor
				.getBlockParents( clientId )
				.some( ( id ) => editor.getBlockName( id ) === metadata.name )
		) {
			return value;
		}
		return preset ? emptyPresets : false;
	}
);

registerBlockType( metadata.name, {
	...metadata,
	icon: CANVAS_ICON,
	edit: Edit,
	// Keep core content available even if this plugin is disabled.
	save: () => <InnerBlocks.Content />,
} );

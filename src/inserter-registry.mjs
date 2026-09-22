import { BLOCK_NAME } from './placement.mjs';
import {
	DEFAULT_HEADING_CONTENT,
	DEFAULT_PARAGRAPH_CONTENT,
} from './insertion-defaults.mjs';

// Discovery is intentionally narrower than the blocks Canvas can contain.
const INSERTER_BLOCKS = [
	'core/heading',
	'core/image',
	'core/paragraph',
	'core/buttons',
];

export function canvasInserterPlugin( registry ) {
	const cache = new WeakMap();
	return {
		select( store ) {
			const selectors = registry.select( store );
			if ( ( store?.name || store ) !== 'core/block-editor' ) {
				return selectors;
			}
			if ( cache.has( selectors ) ) {
				return cache.get( selectors );
			}

			const itemsCache = new WeakMap();
			const settingsCache = new WeakMap();
			const listSettingsCache = new WeakMap();
			const isCanvas = ( rootClientId ) =>
				selectors.getBlockName( rootClientId ) === BLOCK_NAME;
			const overrides = {
				getInserterItems( rootClientId, ...args ) {
					const items = selectors.getInserterItems(
						rootClientId,
						...args
					);
					if ( ! isCanvas( rootClientId ) ) {
						return items;
					}
					if ( ! itemsCache.has( items ) ) {
						itemsCache.set(
							items,
							INSERTER_BLOCKS.flatMap( ( name ) =>
								items.filter(
									( item ) =>
										item.id === name && item.name === name
								)
							)
								// Supply the content before RichText mounts so its initial value
								// and the insertion's history both include the default text.
								.map( ( item ) =>
									[
										'core/heading',
										'core/paragraph',
									].includes( item.name )
										? {
												...item,
												initialAttributes: {
													...item.initialAttributes,
													content:
														item.initialAttributes
															?.content ||
														( item.name ===
														'core/heading'
															? DEFAULT_HEADING_CONTENT
															: DEFAULT_PARAGRAPH_CONTENT ),
												},
											}
										: item
								)
						);
					}
					return itemsCache.get( items );
				},
				getBlockListSettings( rootClientId ) {
					const settings =
						selectors.getBlockListSettings( rootClientId );
					if ( ! settings || ! isCanvas( rootClientId ) ) {
						return settings;
					}
					if ( ! listSettingsCache.has( settings ) ) {
						listSettingsCache.set( settings, {
							...settings,
							prioritizedInserterBlocks: INSERTER_BLOCKS,
						} );
					}
					return listSettingsCache.get( settings );
				},
				getSettings() {
					const settings = selectors.getSettings();
					if ( ! settingsCache.has( settings ) ) {
						const {
							__experimentalSetIsInserterOpened,
							...localSettings
						} = settings;
						settingsCache.set( settings, localSettings );
					}
					return settingsCache.get( settings );
				},
			};
			// Forward Core's selector metadata, including private API symbols used
			// internally by Inserter. No global selectors or editor state are changed.
			const scoped = new Proxy( selectors, {
				get( target, key, receiver ) {
					return Object.hasOwn( overrides, key )
						? overrides[ key ]
						: Reflect.get( target, key, receiver );
				},
			} );
			cache.set( selectors, scoped );
			return scoped;
		},
	};
}

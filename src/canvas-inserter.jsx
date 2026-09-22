import { useCallback } from '@wordpress/element';
import {
	createRegistry,
	RegistryProvider,
	useRegistry,
	useSelect,
} from '@wordpress/data';
import {
	BlockPopover,
	Inserter,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { createBlock, getBlockType } from '@wordpress/blocks';
import { Toolbar, ToolbarButton } from '@wordpress/components';
import { ALLOWED_BLOCKS, ATTRIBUTE } from './geometry.mjs';
import { gridMetrics } from './canvas-metrics.mjs';
import { insertionLayout } from './insertion-layout.mjs';
import { withInsertionDefaults } from './insertion-defaults.mjs';
import { canvasInserterPlugin } from './inserter-registry.mjs';
import { CanvasMenu, CanvasSubmenu } from './canvas-menu';
import { Menu } from './core-menu';

const INSERTER_ICON = (
	<svg
		className="canvas__inserter-icon"
		viewBox="0 0 24 24"
		width="24"
		height="24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M11 12.5V17.5H12.5V12.5H17.5V11H12.5V6H11V11H6V12.5H11Z" />
	</svg>
);

// A child registry subscribes to its parent. Reuse it across Canvas blocks and
// toolbar remounts instead of creating a new parent subscription on every open.
const inserterRegistries = new WeakMap();
function getInserterRegistry( parent ) {
	if ( ! inserterRegistries.has( parent ) ) {
		const registry = createRegistry( {}, parent );
		registry.use( canvasInserterPlugin );
		inserterRegistries.set( parent, registry );
	}
	return inserterRegistries.get( parent );
}

export function useCanvasInsertion( { clientId, gridRef, mode, registry } ) {
	const allowed = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			return store.getBlockEditingMode( clientId ) === 'default'
				? ALLOWED_BLOCKS.filter( ( name ) =>
						store.canInsertBlockType( name, clientId )
					)
				: [];
		},
		[ clientId ]
	);
	const attributesFor = useCallback(
		( block, point ) => {
			const metrics = gridMetrics( gridRef.current );
			if ( ! metrics ) {
				return null;
			}
			const store = registry.select( blockEditorStore );
			const incoming = withInsertionDefaults( block, mode, metrics );
			const layout = insertionLayout(
				store.getBlocks( clientId ),
				block,
				mode,
				metrics,
				point
			);
			return layout
				? { ...incoming.attributes, [ ATTRIBUTE ]: layout }
				: null;
		},
		[ clientId, gridRef, mode, registry ]
	);
	const onSelect = useCallback(
		( block ) => {
			if ( ! block?.clientId ) {
				return;
			}
			// Core also calls this when the picker closes.
			const store = registry.select( blockEditorStore );
			if ( store.getBlockRootClientId( block.clientId ) !== clientId ) {
				return;
			}
			const attributes = attributesFor( block );
			if ( ! attributes ) {
				return;
			}
			const actions = registry.dispatch( blockEditorStore );
			// Match Core's grid appender: fold placement into the insertion's history.
			actions.__unstableMarkNextChangeAsNotPersistent();
			actions.updateBlockAttributes( block.clientId, attributes );
		},
		[ attributesFor, clientId, registry ]
	);
	const insertAt = useCallback(
		( name, point ) => {
			const store = registry.select( blockEditorStore );
			if (
				store.getBlockEditingMode( clientId ) !== 'default' ||
				! store.canInsertBlockType( name, clientId ) ||
				! ALLOWED_BLOCKS.includes( name )
			) {
				return;
			}
			// Buttons stays a standard Core container with its normal editable child.
			const block = createBlock(
				name,
				{},
				name === 'core/buttons' ? [ createBlock( 'core/button' ) ] : []
			);
			const attributes = attributesFor( block, point );
			if ( ! attributes ) {
				return;
			}
			registry.dispatch( blockEditorStore ).insertBlocks(
				{
					...block,
					attributes: { ...block.attributes, ...attributes },
				},
				store.getBlockCount( clientId ),
				clientId
			);
			return block;
		},
		[ attributesFor, clientId, registry ]
	);
	return { allowed, onSelect, insertAt };
}

export function CanvasInserter( { clientId, onSelect, disabled: canvasFull } ) {
	const registry = getInserterRegistry( useRegistry() );
	const inserter = (
		<RegistryProvider value={ registry }>
			<Inserter
				rootClientId={ clientId }
				isAppender
				__experimentalIsQuick
				position="bottom left"
				onSelectOrClose={ onSelect }
				renderToggle={ ( { onToggle, isOpen, disabled } ) => (
					<ToolbarButton
						icon={ INSERTER_ICON }
						label="Add block"
						onClick={ onToggle }
						disabled={ disabled || canvasFull }
						title={
							canvasFull
								? 'This canvas has reached its row limit.'
								: undefined
						}
						aria-description={
							canvasFull
								? 'This canvas has reached its row limit.'
								: undefined
						}
						aria-haspopup="true"
						aria-expanded={ isOpen }
					>
						Add block
					</ToolbarButton>
				) }
			/>
		</RegistryProvider>
	);
	// Use Core's persistent block-tools layer outside the scrolling iframe.
	// It also forwards wheel events over the toolbar to the editor canvas.
	return (
		<BlockPopover
			clientId={ clientId }
			placement="top-end"
			inline={ false }
			__unstableSlotName="__unstable-block-tools-after"
			offset={ ( { rects } ) => ( {
				mainAxis: -rects.floating.height,
				crossAxis: -8,
			} ) }
			className="canvas__toolbar"
		>
			<Toolbar label="Canvas">{ inserter }</Toolbar>
		</BlockPopover>
	);
}

function CanvasInsertionMenu( { allowed, onSelect } ) {
	return (
		<CanvasSubmenu>
			<Menu.SubmenuTriggerItem>
				<Menu.ItemLabel>Add block</Menu.ItemLabel>
			</Menu.SubmenuTriggerItem>
			<Menu.Popover aria-label="Add block">
				{ allowed.map( ( name ) => (
					<Menu.Item key={ name } onClick={ () => onSelect( name ) }>
						<Menu.ItemLabel>
							{ getBlockType( name )?.title }
						</Menu.ItemLabel>
					</Menu.Item>
				) ) }
			</Menu.Popover>
		</CanvasSubmenu>
	);
}

export function CanvasContextMenu( { menu, allowed, insertAt, onClose } ) {
	return (
		<CanvasMenu menu={ menu } label="Canvas options" onClose={ onClose }>
			<CanvasInsertionMenu
				allowed={ allowed }
				onSelect={ ( name ) => {
					onClose();
					insertAt( name, menu.point );
				} }
			/>
		</CanvasMenu>
	);
}

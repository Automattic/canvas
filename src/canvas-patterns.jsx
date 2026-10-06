import { useCallback, useMemo, useState } from '@wordpress/element';
import { useDispatch, useSelect, useRegistry } from '@wordpress/data';
import { cloneBlock } from '@wordpress/blocks';
import {
	// Core's layout chooser has no stable export. Verify on WordPress upgrades.
	// eslint-disable-next-line @wordpress/no-unsafe-wp-apis
	__experimentalBlockPatternSetup as BlockPatternSetup,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Button, Modal, Toolbar, ToolbarButton } from '@wordpress/components';
import { BLOCK_NAME } from './placement.mjs';
import { PATTERN_ICON } from './canvas-inserter-icon';
import { editablePatternBlocks } from './pattern-insertion.mjs';

// Categories and blockTypes can also describe mixed or wrapped content.
function isCanvasPattern( pattern ) {
	return (
		pattern.blocks?.length === 1 && pattern.blocks[ 0 ].name === BLOCK_NAME
	);
}

function CanvasPatternGrid( { clientId, onSelect } ) {
	const [ category, setCategory ] = useState( '' );
	const { patterns, registeredCategories } = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			return {
				patterns: store.__experimentalGetAllowedPatterns(
					store.getBlockRootClientId( clientId )
				),
				registeredCategories:
					store.getSettings().__experimentalBlockPatternCategories,
			};
		},
		[ clientId ]
	);
	const categories = useMemo( () => {
		const canvasPatterns = patterns.filter( isCanvasPattern );
		return ( registeredCategories || [] )
			.filter(
				( item ) =>
					item.name !== 'tabor-canvas' &&
					canvasPatterns.some( ( pattern ) =>
						pattern.categories?.includes( item.name )
					)
			)
			.sort( ( a, b ) => a.label.localeCompare( b.label ) );
	}, [ patterns, registeredCategories ] );
	const selectedCategory = categories.some(
		( item ) => item.name === category
	)
		? category
		: '';
	const filterPatterns = useCallback(
		( pattern ) =>
			isCanvasPattern( pattern ) &&
			( ! selectedCategory ||
				pattern.categories?.includes( selectedCategory ) ),
		[ selectedCategory ]
	);
	return (
		<div className="canvas-pattern-picker__layout">
			<nav
				className="canvas-pattern-picker__categories"
				aria-label="Pattern categories"
			>
				{ [ { name: '', label: 'All' }, ...categories ].map(
					( item ) => (
						<Button
							key={ item.name }
							__next40pxDefaultSize
							isPressed={ selectedCategory === item.name }
							onClick={ () => setCategory( item.name ) }
						>
							{ item.label }
						</Button>
					)
				) }
			</nav>
			<BlockPatternSetup
				key={ selectedCategory }
				clientId={ clientId }
				blockName={ BLOCK_NAME }
				filterPatternsFn={ filterPatterns }
				onBlockPatternSelect={ onSelect }
				initialViewMode="grid"
				showTitles
			/>
		</div>
	);
}

export function CanvasPatternInserter( { clientId, placeholder = false } ) {
	const [ isOpen, setIsOpen ] = useState( false );
	const { replaceBlocks } = useDispatch( blockEditorStore );
	const canReplace = useSelect(
		( select ) => {
			const store = select( blockEditorStore );
			return (
				store.getBlockCount( clientId ) === 0 &&
				store.canRemoveBlock( clientId ) &&
				store.canInsertBlockType(
					BLOCK_NAME,
					store.getBlockRootClientId( clientId )
				)
			);
		},
		[ clientId ]
	);
	if ( ! canReplace ) {
		return null;
	}
	return (
		<>
			{ placeholder && (
				<p className="canvas__empty-instructions">
					Add blocks to build your layout, or start with a pattern.
				</p>
			) }
			<div
				className={
					placeholder
						? 'canvas__toolbar canvas__empty-action'
						: undefined
				}
			>
				<Toolbar label="Add pattern">
					<ToolbarButton
						icon={ PATTERN_ICON }
						label="Add pattern"
						onClick={ () => setIsOpen( true ) }
						aria-haspopup="dialog"
						aria-expanded={ isOpen }
					>
						Add pattern
					</ToolbarButton>
				</Toolbar>
			</div>
			{ isOpen && (
				<Modal
					className="canvas-pattern-picker"
					title="Patterns"
					onRequestClose={ () => setIsOpen( false ) }
					isFullScreen
				>
					<CanvasPatternGrid
						clientId={ clientId }
						onSelect={ ( blocks ) => {
							setIsOpen( false );
							replaceBlocks(
								clientId,
								editablePatternBlocks( blocks ).map(
									( block ) => cloneBlock( block )
								)
							);
						} }
					/>
				</Modal>
			) }
		</>
	);
}

export function CanvasPatternAfter( { clientId } ) {
	const [ isOpen, setIsOpen ] = useState( false );
	const registry = useRegistry();
	const { insertBlocks } = useDispatch( blockEditorStore );
	const canInsert = useSelect(
		( select ) => {
			const editor = select( blockEditorStore );
			return editor.canInsertBlockType(
				BLOCK_NAME,
				editor.getBlockRootClientId( clientId )
			);
		},
		[ clientId ]
	);
	if ( ! canInsert ) {
		return null;
	}
	const insertAfter = ( blocks ) => {
		const editor = registry.select( blockEditorStore );
		const rootClientId = editor.getBlockRootClientId( clientId );
		const index = editor.getBlockIndex( clientId, rootClientId );
		if (
			index < 0 ||
			! editor.canInsertBlockType( BLOCK_NAME, rootClientId )
		) {
			setIsOpen( false );
			return;
		}
		setIsOpen( false );
		insertBlocks(
			editablePatternBlocks( blocks ).map( ( block ) =>
				cloneBlock( block )
			),
			index + 1,
			rootClientId,
			true
		);
	};
	return (
		<>
			<ToolbarButton
				icon={ PATTERN_ICON }
				label="Add pattern after"
				onClick={ () => setIsOpen( true ) }
				aria-haspopup="dialog"
				aria-expanded={ isOpen }
			/>
			{ isOpen && (
				<Modal
					className="canvas-pattern-picker"
					title="Add pattern after"
					onRequestClose={ () => setIsOpen( false ) }
					isFullScreen
				>
					<CanvasPatternGrid
						clientId={ clientId }
						onSelect={ insertAfter }
					/>
				</Modal>
			) }
		</>
	);
}

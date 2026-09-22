import { useEffect, useMemo, useState } from '@wordpress/element';
import { useDispatch, useRegistry, useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as editorStore } from '@wordpress/editor';
import { store as noticesStore } from '@wordpress/notices';
import {
	store as blockEditorStore,
	__experimentalSpacingSizesControl as SpacingSizesControl,
} from '@wordpress/block-editor';
import {
	BaseControl,
	Button,
	DropdownMenu,
	Modal,
	Notice,
	SVG,
	Path,
} from '@wordpress/components';
import {
	CANVAS,
	gapAxes,
	inheritedGap,
	pageGapTargets,
	resolveGap,
	withGap,
	withGlobalGap,
} from './cell-gap.mjs';
// WordPress icons, kept inline like the other Canvas controls.
const link = (
	<SVG viewBox="0 0 24 24">
		<Path d="M10 17.389H8.444A5.194 5.194 0 1 1 8.444 7H10v1.5H8.444a3.694 3.694 0 0 0 0 7.389H10v1.5ZM14 7h1.556a5.194 5.194 0 0 1 0 10.39H14v-1.5h1.556a3.694 3.694 0 0 0 0-7.39H14V7Zm-4.5 6h5v-1.5h-5V13Z" />
	</SVG>
);
const linkOff = (
	<SVG viewBox="0 0 24 24">
		<Path d="M17.031 4.703 15.576 4l-1.56 3H14v.03l-2.324 4.47H9.5V13h1.396l-1.502 2.889h-.95a3.694 3.694 0 0 1 0-7.389H10V7H8.444a5.194 5.194 0 1 0 0 10.389h.17L7.5 19.53l1.416.719L15.049 8.5h.507a3.694 3.694 0 0 1 0 7.39H14v1.5h1.556a5.194 5.194 0 0 0 .273-10.383l1.202-2.304Z" />
	</SVG>
);
const moreVertical = (
	<SVG viewBox="0 0 24 24">
		<Path d="M13 19h-2v-2h2v2zm0-6h-2v-2h2v2zm0-6h-2V5h2v2z" />
	</SVG>
);
export function useCanvasGap( attributes ) {
	const { id, canUpdate, baseStyles, userStyles } = useSelect( ( select ) => {
		const core = select( coreStore );
		const idValue = core.__experimentalGetCurrentGlobalStylesId();
		const canUpdateValue = idValue
			? core.canUser( 'update', {
					kind: 'root',
					name: 'globalStyles',
					id: idValue,
				} )
			: false;
		let user;
		if ( idValue && typeof canUpdateValue === 'boolean' ) {
			if ( canUpdateValue ) {
				user = core.getEditedEntityRecord(
					'root',
					'globalStyles',
					idValue
				);
			} else {
				user = core.getEntityRecord( 'root', 'globalStyles', idValue, {
					context: 'view',
				} );
			}
		} else {
			user = undefined;
		}
		const base = core.__experimentalGetCurrentThemeBaseGlobalStyles();
		return {
			id: idValue,
			canUpdate: !! canUpdateValue && !! user,
			baseStyles: base?.styles,
			userStyles: user?.styles,
		};
	}, [] );
	const inherited = useMemo(
		() => inheritedGap( baseStyles, userStyles, attributes.className ),
		[ baseStyles, userStyles, attributes.className ]
	);
	const effective = useMemo(
		() => resolveGap( inherited, attributes.style?.spacing?.blockGap ),
		[ inherited, attributes.style?.spacing?.blockGap ]
	);
	return {
		id,
		canUpdate,
		inherited,
		effective,
	};
}
export function CellGapControls( { clientId, attributes, gap, geometry } ) {
	const registry = useRegistry();
	const { updateBlockAttributes } = useDispatch( blockEditorStore );
	const { createNotice } = useDispatch( noticesStore );
	const [ unlinked, setUnlinked ] = useState( false );
	const [ confirmDefault, setConfirmDefault ] = useState( false );
	const [ pendingDefault, setPendingDefault ] = useState( false );
	const value = resolveGap(
		{
			top: `${ geometry?.gap ?? 0 }px`,
			left: `${ geometry?.columnGap ?? 0 }px`,
		},
		gap.effective
	);
	const split = unlinked || value.top !== value.left;
	const { targets, skipped, editable, isPage, dirty, saveError, savedGap } =
		useSelect(
			( select ) => {
				const store = select( blockEditorStore );
				const canEdit = ( id ) => {
					for (
						let parent = id;
						parent;
						parent = store.getBlockRootClientId( parent )
					) {
						if (
							store.getBlockName( parent ) === 'core/post-content'
						) {
							break;
						}
						if (
							store.getBlockEditingMode( parent ) !== 'default' ||
							store.getTemplateLock( parent ) ||
							store.getBlockAttributes( parent )?.lock?.move
						) {
							return false;
						}
					}
					return true;
				};
				const editor = select( editorStore );
				const type = editor.getCurrentPostType();
				// In the template preview, only the current Post Content entity belongs to
				// this page. Do not traverse the template or another query's post content.
				const contentRoot = store
					.getBlockParents( clientId )
					.find(
						( id ) =>
							store.getBlockName( id ) === 'core/post-content'
					);
				const isPageValue =
					!! type &&
					! [
						'wp_template',
						'wp_template_part',
						'wp_block',
					].includes( type ) &&
					( editor.getRenderingMode() === 'post-only' ||
						!! contentRoot );
				const core = select( coreStore );
				return {
					...pageGapTargets(
						isPageValue ? store.getBlocks( contentRoot ) : [],
						clientId,
						value,
						canEdit
					),
					editable: canEdit( clientId ),
					isPage: isPageValue,
					dirty: gap.id
						? core.hasEditsForEntityRecord(
								'root',
								'globalStyles',
								gap.id
							)
						: false,
					savedGap: gap.canUpdate
						? JSON.stringify(
								gapAxes(
									core.getEntityRecord(
										'root',
										'globalStyles',
										gap.id
									)?.styles?.blocks?.[ CANVAS ]?.spacing
										?.blockGap
								)
							)
						: undefined,
					saveError: gap.id
						? core.getLastEntitySaveError(
								'root',
								'globalStyles',
								gap.id
							)
						: null,
				};
			},
			[ clientId, value, gap.id, gap.canUpdate ]
		);
	useEffect( () => {
		if ( pendingDefault && ! dirty && ! saveError ) {
			if ( savedGap === pendingDefault ) {
				createNotice( 'success', 'Canvas default saved.', {
					type: 'snackbar',
				} );
			}
			setPendingDefault( false );
		}
	}, [ pendingDefault, dirty, saveError, savedGap, createNotice ] );
	const change = ( next ) =>
		updateBlockAttributes( clientId, {
			style: withGap( attributes.style, next ),
		} );
	const applyToPage = () => {
		// UPDATE_BLOCK preserves the existing editor's distinct, batched undo boundary.
		registry.batch( () =>
			targets.forEach( ( block ) =>
				registry
					.dispatch( blockEditorStore )
					.updateBlock( block.clientId, {
						attributes: {
							...block.attributes,
							style: withGap( block.attributes.style, {
								...value,
							} ),
						},
					} )
			)
		);
		createNotice(
			'success',
			`Gap applied to ${ targets.length } ${ targets.length === 1 ? 'canvas' : 'canvases' }.${ skipped ? ` ${ skipped } skipped because editing is restricted.` : '' }`,
			{
				type: 'snackbar',
			}
		);
	};
	const setDefault = () => {
		const core = registry.select( coreStore );
		const current = core.getEditedEntityRecord(
			'root',
			'globalStyles',
			gap.id
		);
		registry
			.dispatch( coreStore )
			.editEntityRecord( 'root', 'globalStyles', gap.id, {
				styles: withGlobalGap( current.styles, {
					...value,
				} ),
			} );
		setPendingDefault( JSON.stringify( gapAxes( value ) ) );
		setConfirmDefault( false );
	};
	return (
		<>
			<div className="canvas-cell-gap__heading">
				<BaseControl.VisualLabel>Gap</BaseControl.VisualLabel>
				<div>
					<Button
						size="small"
						icon={ split ? linkOff : link }
						label={ split ? 'Link gap' : 'Unlink gap' }
						isPressed={ ! split }
						disabled={ ! editable }
						onClick={ () => {
							if ( split ) {
								change( value.top );
								setUnlinked( false );
							} else {
								setUnlinked( true );
							}
						} }
					/>
					<DropdownMenu
						icon={ moreVertical }
						label="Gap options"
						controls={ [
							{
								title: 'Reset to default',
								isDisabled:
									! editable ||
									! Object.keys(
										gapAxes(
											attributes.style?.spacing?.blockGap
										)
									).length,
								onClick: () => {
									change( undefined );
									setUnlinked( false );
								},
							},
							...( isPage
								? [
										{
											title: 'Apply to all canvases on this page',
											isDisabled:
												! editable || ! targets.length,
											onClick: applyToPage,
										},
									]
								: [] ),
							...( gap.canUpdate
								? [
										{
											title: 'Set as Canvas default…',
											isDisabled: ! editable,
											onClick: () =>
												setConfirmDefault( true ),
										},
									]
								: [] ),
						] }
					/>
				</div>
			</div>
			<fieldset
				disabled={ ! editable }
				className={ `canvas-cell-gap__inputs${ split ? '' : ' is-linked' }` }
			>
				<SpacingSizesControl
					key={ split ? 'axes' : 'linked' }
					label="Gap"
					showSideInLabel={ false }
					sides={ split ? [ 'horizontal', 'vertical' ] : [ 'top' ] }
					values={
						split
							? {
									...value,
									bottom: value.top,
									right: value.left,
								}
							: {
									top: value.top,
								}
					}
					onChange={ ( next ) =>
						change(
							split
								? {
										top: next.top,
										left: next.left,
									}
								: next.top
						)
					}
				/>
			</fieldset>
			{ ! Object.keys( gapAxes( attributes.style?.spacing?.blockGap ) )
				.length && (
				<p className="components-base-control__help">
					Using the default gap.
				</p>
			) }
			{ pendingDefault && (
				<Notice
					status={ saveError ? 'error' : 'info' }
					isDismissible={ false }
				>
					{ saveError
						? `Canvas default could not be saved: ${ saveError.message || 'Please try saving again.' }`
						: 'Canvas default updated. Save Styles to keep this change.' }
				</Notice>
			) }
			{ confirmDefault && (
				<Modal
					title="Set as Canvas default"
					onRequestClose={ () => setConfirmDefault( false ) }
				>
					<p>
						Use this gap for new canvases and existing canvases that
						use the default. Canvases with a custom gap keep their
						spacing.
					</p>
					<p>This change will be included when you save Styles.</p>
					<div className="canvas-cell-gap__actions">
						<Button
							variant="tertiary"
							onClick={ () => setConfirmDefault( false ) }
						>
							Cancel
						</Button>
						<Button variant="primary" onClick={ setDefault }>
							Set default
						</Button>
					</div>
				</Modal>
			) }
		</>
	);
}

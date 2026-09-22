import {
	createPortal,
	useContext,
	useEffect,
	useLayoutEffect,
} from '@wordpress/element';
import {
	__experimentalStyleProvider as StyleProvider,
	ToolbarButton,
} from '@wordpress/components';
import { Menu } from './core-menu';
import { CANVAS_ICON } from './canvas-icon';
import { gestureDocuments } from './gesture-pointer.mjs';

function CanvasToolbarMenuContent( { children } ) {
	const { store } = useContext( Menu.Context );
	return (
		<>
			<Menu.TriggerButton
				render={
					<ToolbarButton
						icon={ CANVAS_ICON }
						label="Canvas options"
					/>
				}
			/>
			<Menu.Popover
				aria-label="Canvas options"
				modal={ false }
				// Keep menu items and portal focus guards outside Core's toolbar.
				// Otherwise its tabbable-item check remounts the toolbar on opening.
				portal
				preserveTabOrder={ false }
			>
				{ children( () => store.hide() ) }
			</Menu.Popover>
		</>
	);
}

export function CanvasToolbarMenu( { children, onOpen } ) {
	return (
		<Menu onOpenChange={ ( open ) => open && onOpen?.() }>
			<CanvasToolbarMenuContent>{ children }</CanvasToolbarMenuContent>
		</Menu>
	);
}

function containsMenuTarget( menu, target ) {
	if ( ! menu ) {
		return false;
	}
	if ( menu.contains( target ) ) {
		return true;
	}
	// Core portals submenus separately; follow their disclosure relationships.
	return [
		...menu.querySelectorAll( '[aria-haspopup="menu"][aria-controls]' ),
	].some( ( trigger ) =>
		containsMenuTarget(
			menu.ownerDocument.getElementById(
				trigger.getAttribute( 'aria-controls' )
			),
			target
		)
	);
}

// Side-by-side menus cannot fit on a phone. Keep Core's positioning and focus
// machinery, but let it place and slide submenus above/below their disclosure.
export function CanvasSubmenu( props ) {
	const { store } = useContext( Menu.Context );
	const doc = store.getState().contentElement?.ownerDocument || document;
	return (
		<Menu
			placement={
				doc.defaultView.innerWidth < 600 ? 'bottom-start' : undefined
			}
			{ ...props }
		/>
	);
}

function CanvasMenuPopover( { menu, label, onClose, children } ) {
	const { store } = useContext( Menu.Context );
	useLayoutEffect( () => {
		// Keep positioning and focus tied to the canvas document across the iframe.
		store.setAnchorElement( menu.anchor.contextElement );
		store.setDisclosureElement( menu.anchor.contextElement );
		store.setAutoFocusOnShow( true );
		store.setInitialFocus( menu.keyboard ? 'first' : 'container' );
	}, [ menu, store ] );
	useEffect( () => {
		const documents = gestureDocuments( menu.anchor.ownerDocument );
		const dismiss = ( event ) => {
			if (
				containsMenuTarget(
					store.getState().contentElement,
					event.target
				)
			) {
				return;
			}
			// A context-menu anchor is also an outside target. Close before canvas
			// handlers consume the press, and let the new selection/drag own focus.
			menu.skipRestoreFocus = true;
			onClose();
		};
		for ( const doc of documents ) {
			doc.addEventListener( 'pointerdown', dismiss, true );
		}
		return () => {
			for ( const doc of documents ) {
				doc.removeEventListener( 'pointerdown', dismiss, true );
			}
		};
	}, [ menu, store, onClose ] );
	return (
		<Menu.Popover
			aria-label={ label }
			getAnchorRect={ menu.anchor.getBoundingClientRect }
			gutter={ 0 }
			modal={ false }
			finalFocus={ menu.anchor.contextElement }
			autoFocusOnHide={ ( element ) => {
				if ( ! menu.skipRestoreFocus ) {
					element?.focus( { preventScroll: true } );
				}
				return false;
			} }
		>
			{ children }
		</Menu.Popover>
	);
}

export function CanvasMenu( { menu, label, onClose, children } ) {
	useEffect( () => {
		const doc = menu.anchor.ownerDocument;
		doc.addEventListener( 'scroll', onClose, true );
		return () => doc.removeEventListener( 'scroll', onClose, true );
	}, [ menu, onClose ] );
	const doc = menu.anchor.ownerDocument;
	const editorDocument = doc.defaultView.frameElement?.ownerDocument || doc;
	return createPortal(
		<StyleProvider document={ editorDocument }>
			<Menu
				open
				placement="bottom-start"
				onOpenChange={ ( open ) => {
					if ( ! open ) {
						onClose();
					}
				} }
			>
				<CanvasMenuPopover
					menu={ menu }
					label={ label }
					onClose={ onClose }
				>
					{ children }
				</CanvasMenuPopover>
			</Menu>
		</StyleProvider>,
		editorDocument.body
	);
}

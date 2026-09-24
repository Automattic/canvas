import { useMemo } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { inheritedGap, resolveGap } from './cell-gap.mjs';

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

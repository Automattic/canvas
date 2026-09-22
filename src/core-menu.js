import { privateApis } from '@wordpress/components';
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';

// Use the same Menu as Gutenberg's PostActions. This private API requires the
// components module's opt-in; keep it isolated and verify on WordPress upgrades.
const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/components'
);

export const { Menu } = unlock( privateApis );

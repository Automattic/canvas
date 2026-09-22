const wordpress = require( '@wordpress/eslint-plugin' );

module.exports = [
	{ ignores: [ 'node_modules/**', 'vendor/**', 'build/**', '.playground/**' ] },
	...wordpress.configs.recommended,
	{
		files: [ 'src/**/*.{js,jsx,mjs}' ],
		languageOptions: {
			parserOptions: {
				requireConfigFile: false,
				babelOptions: {
					presets: [ require.resolve( '@wordpress/babel-preset-default' ) ],
				},
			},
		},
		settings: {
			// wp-scripts extracts these imports to WordPress's registered scripts.
			'import/core-modules': [
				'@wordpress/a11y',
				'@wordpress/block-editor',
				'@wordpress/blocks',
				'@wordpress/components',
				'@wordpress/core-data',
				'@wordpress/data',
				'@wordpress/editor',
				'@wordpress/element',
				'@wordpress/hooks',
				'@wordpress/i18n',
				'@wordpress/notices',
				'@wordpress/private-apis',
			],
		},
		rules: {
			// Existing WordPress 7.1 editor integrations; reject any new unsafe APIs.
			'@wordpress/no-unsafe-wp-apis': [ 'error', {
				'@wordpress/block-editor': [ '__experimentalSpacingSizesControl', '__unstableBlockSettingsMenuFirstItem' ],
				'@wordpress/components': [ '__experimentalStyleProvider', '__experimentalVStack', '__experimentalToggleGroupControl', '__experimentalToggleGroupControlOption', '__experimentalUseCustomUnits' ],
			} ],
		},
	},
];

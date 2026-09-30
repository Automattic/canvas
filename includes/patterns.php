<?php
/**
 * Canvas block patterns.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Patterns;

defined( 'ABSPATH' ) || exit;

// Keep inserted unsynced patterns immediately editable in the main editor.
/**
 * Keep inserted unsynced patterns editable in the main editor.
 *
 * @param array $settings Editor settings.
 * @return array Updated settings.
 */
function enable_pattern_editing( $settings ) {
	$settings['disableContentOnlyForUnsyncedPatterns'] = true;
	return $settings;
}
add_filter( 'block_editor_settings_all', __NAMESPACE__ . '\\enable_pattern_editing' );

/**
 * Register the Canvas category and bundled composition patterns.
 *
 * @return void
 */
function register_patterns() {
	register_block_pattern_category( 'tabor-canvas', array( 'label' => __( 'Canvas', 'canvas' ) ) );
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-1.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-1',
		array(
			'title'       => __( 'pattern-1', 'canvas' ),
			'description' => __( 'A full-width Canvas section with a large centered headline over a scalloped image, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'banner' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-6.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-6',
		array(
			'title'       => __( 'pattern-6', 'canvas' ),
			'description' => __( 'A full-width Canvas website introduction with a large headline, overlapping images, and a call-to-action button, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'banner', 'call-to-action' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-2.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-2',
		array(
			'title'       => __( 'pattern-2', 'canvas' ),
			'description' => __( 'A full-width Canvas section with oversized Word and Press headings and staggered rounded image placeholders.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'banner' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-4.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-4',
		array(
			'title'       => __( 'pattern-4', 'canvas' ),
			'description' => __( 'A full-width Canvas floral composition with two oversized headings layered around two flower-shaped images, with desktop and tablet layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'banner' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-5.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-5',
		array(
			'title'       => __( 'pattern-5', 'canvas' ),
			'description' => __( 'A full-width Canvas introduction with an oversized heading, introductory text, and two staggered images, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'about' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-3.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-3',
		array(
			'title'         => __( 'pattern-3', 'canvas' ),
			'description'   => __( 'A full-width Canvas section with a tilted oval image, headings, and a centered call-to-action button, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'    => array( 'tabor-canvas', 'call-to-action' ),
			'viewportWidth' => 1000,
			'content'       => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/creative-home.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-creative-home',
		array(
			'title'       => __( 'Creative home', 'canvas' ),
			'description' => __( 'A full-width hero with oversized typography, a decorative asterisk, and a pill call to action.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'banner', 'call-to-action' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/freedom-to-grow.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-freedom-to-grow',
		array(
			'title'       => __( 'Freedom to grow', 'canvas' ),
			'description' => __( 'An introduction with three arch-shaped image placeholders and editable website benefits.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'about', 'services' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/freedom-to-grow-arches.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-freedom-to-grow-arches',
		array(
			'title'       => __( 'Freedom to grow — overlapping arches', 'canvas' ),
			'description' => __( 'A full-width introduction with a centered headline, three overlapping arch-shaped image placeholders, and three editable benefit columns, with a staggered tablet layout.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'about', 'services' ),
			'content'     => $content,
		)
	);
}
add_action( 'init', __NAMESPACE__ . '\\register_patterns', 20 );

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
			'categories'  => array( 'tabor-canvas', 'featured' ),
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
			'description' => __( 'A full-width Canvas coaching introduction with a large headline, overlapping images, and a call-to-action button, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas' ),
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
			'description' => __( 'A full-width Canvas section with two oversized headings and staggered rounded images, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
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
			'description' => __( 'A full-width Canvas portfolio introduction with two oversized red headings layered around a soft-square image.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
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
			'description' => __( 'A full-width Canvas introduction with an oversized heading, story text, and two staggered images, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas' ),
			'content'     => $content,
		)
	);
}
add_action( 'init', __NAMESPACE__ . '\\register_patterns', 20 );

/**
 * Register the bundled energy healing composition.
 *
 * @return void
 */
function register_energy_healing_pattern() {
	ob_start();
	require dirname( __DIR__ ) . '/patterns/pattern-3.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-pattern-3',
		array(
			'title'       => __( 'pattern-3', 'canvas' ),
			'description' => __( 'A full-width Canvas section with a tilted oval image, yellow headings, and a centered booking button, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
			'content'     => $content,
		)
	);
}
add_action( 'init', __NAMESPACE__ . '\\register_energy_healing_pattern', 20 );

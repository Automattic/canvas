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
	require dirname( __DIR__ ) . '/patterns/build-it.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-build-it',
		array(
			'title'       => __( 'Build it', 'canvas' ),
			'description' => __( 'A full-width Canvas section with a large centered headline over a scalloped image, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/skydiving-school.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-skydiving-school',
		array(
			'title'       => __( 'Skydiving school', 'canvas' ),
			'description' => __( 'A full-width Canvas section with two oversized headings and staggered rounded images, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/portfolio.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-portfolio',
		array(
			'title'       => __( 'Portfolio', 'canvas' ),
			'description' => __( 'A full-width Canvas portfolio introduction with two oversized red headings layered around a soft-square image.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
			'content'     => $content,
		)
	);
	ob_start();
	require dirname( __DIR__ ) . '/patterns/our-story.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-our-story',
		array(
			'title'       => __( 'Our story', 'canvas' ),
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
	require dirname( __DIR__ ) . '/patterns/energy-healing.php';
	$content = ob_get_clean();
	register_block_pattern(
		'tabor/canvas-energy-healing',
		array(
			'title'       => __( 'Energy healing', 'canvas' ),
			'description' => __( 'A full-width Canvas section with a tilted oval image, yellow headings, and a centered booking button, with desktop, tablet, and mobile layouts.', 'canvas' ),
			'categories'  => array( 'tabor-canvas', 'featured' ),
			'content'     => $content,
		)
	);
}
add_action( 'init', __NAMESPACE__ . '\\register_energy_healing_pattern', 20 );

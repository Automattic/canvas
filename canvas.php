<?php
/**
 * Plugin Name: Canvas
 * Description: Move, resize, and layer blocks to create your own layout.
 * Version: 0.1.0
 * Requires at least: 7.1
 * Requires PHP: 8.3
 * Author: Rich Tabor
 * Plugin URI: https://github.com/Automattic/canvas
 * Update URI: https://github.com/Automattic/canvas
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: canvas
 *
 * @package Canvas
 */

namespace PlaygroundPlugin;

defined( 'ABSPATH' ) || exit;

const VERSION = '0.1.0';

/**
 * Check that all required compiled block assets are readable.
 *
 * @return bool Whether the build is complete.
 */
function has_build_assets() {
	foreach ( array( 'block.json', 'index.js', 'index.asset.php', 'index.css', 'style-index.css', 'view.js', 'view.asset.php' ) as $file ) {
		if ( ! is_readable( __DIR__ . '/build/' . $file ) ) {
			return false;
		}
	}
	return true;
}

/**
 * Show administrators the recovery instructions for a missing build.
 *
 * @return void
 */
function missing_build_notice() {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	wp_admin_notice(
		__( 'Canvas is missing its compiled block assets. Install the built Canvas ZIP, or run npm ci and npm run build from the source repository.', 'canvas' ),
		array( 'type' => 'error' )
	);
}

/**
 * Reject activation when compiled assets are missing.
 *
 * @return void
 */
function activate() {
	if ( ! has_build_assets() ) {
		wp_die(
			esc_html__( 'Canvas is missing its compiled block assets. Install the built Canvas ZIP, or run npm ci and npm run build from the source repository.', 'canvas' ),
			esc_html__( 'Canvas could not be activated', 'canvas' ),
			array( 'back_link' => true )
		);
	}
}
register_activation_hook( __FILE__, __NAMESPACE__ . '\\activate' );

// A source archive or interrupted deployment must not register unusable blocks.
if ( ! has_build_assets() ) {
	add_action( 'admin_notices', __NAMESPACE__ . '\\missing_build_notice' );
	add_action( 'network_admin_notices', __NAMESPACE__ . '\\missing_build_notice' );
	return;
}

require_once __DIR__ . '/includes/canvas.php';
require_once __DIR__ . '/includes/style-variations.php';
require_once __DIR__ . '/includes/abilities.php';
require_once __DIR__ . '/includes/patterns.php';

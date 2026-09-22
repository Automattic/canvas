<?php
/**
 * Use Group block style variations only when Canvas has none of its own.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Canvas;

defined( 'ABSPATH' ) || exit;

/**
 * Inherit Group variations when Canvas has no native variations.
 *
 * @param \WP_Theme_JSON_Data $theme_json Theme or user style data.
 * @return \WP_Theme_JSON_Data Updated style data.
 */
function inherit_group_style_variations( $theme_json ) {
	$registry      = \WP_Block_Styles_Registry::get_instance();
	$canvas_styles = $registry->get_registered_styles_for_block( BLOCK_NAME );
	$block_type    = \WP_Block_Type_Registry::get_instance()->get_registered( BLOCK_NAME );
	$native_styles = array_filter(
		$canvas_styles,
		static function ( $style ) {
			return empty( $style['__canvas_group_fallback'] );
		}
	);
	if ( $native_styles || ! empty( $block_type->styles ) ) {
		// A theme may register its own styles after an earlier resolution.
		// Remove only our fallback registrations, preserving all native styles.
		foreach ( $canvas_styles as $name => $style ) {
			if ( ! empty( $style['__canvas_group_fallback'] ) ) {
				unregister_block_style( BLOCK_NAME, $name );
			}
		}
		return $theme_json;
	}

	$data             = $theme_json->get_data();
	$group_variations = $data['styles']['blocks']['core/group']['variations'] ?? array();
	if ( empty( $group_variations ) ) {
		return $theme_json;
	}

	$variations = array();
	foreach ( $registry->get_registered_styles_for_block( 'core/group' ) as $style ) {
		$name = $style['name'];
		if ( empty( $group_variations[ $name ] ) ) {
			continue;
		}

		// Register before updating theme.json so WordPress retains the variation
		// during sanitization and exposes it in the native Styles panel.
		if ( ! $registry->is_registered( BLOCK_NAME, $name ) ) {
			$registration = array_intersect_key( $style, array_flip( array( 'name', 'label', 'is_default' ) ) );
			// Distinguish inherited registrations on subsequent theme/user passes.
			$registration['__canvas_group_fallback'] = true;
			register_block_style( BLOCK_NAME, $registration );
		}
		$variations[ $name ] = array_replace_recursive(
			$group_variations[ $name ],
			$data['styles']['blocks'][ BLOCK_NAME ]['variations'][ $name ] ?? array()
		);
	}

	if ( $variations ) {
		$theme_json->update_with(
			array(
				'version' => \WP_Theme_JSON::LATEST_SCHEMA,
				'styles'  => array( 'blocks' => array( BLOCK_NAME => array( 'variations' => $variations ) ) ),
			)
		);
	}
	return $theme_json;
}

// Theme data already contains the resolved JSON partials and PHP style_data.
// Apply the same mapping to Global Styles edits at their original priority.
add_filter( 'wp_theme_json_data_theme', __NAMESPACE__ . '\\inherit_group_style_variations', 20 );
add_filter( 'wp_theme_json_data_user', __NAMESPACE__ . '\\inherit_group_style_variations', 20 );

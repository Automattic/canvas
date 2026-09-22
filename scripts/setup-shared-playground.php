<?php
/** Bootstrap only a fresh, disposable shared Playground. */
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
wp_set_current_user( 1 );

$snapshot = json_decode( file_get_contents( '/tmp/canvas-demo/snapshot.json' ), true, 512, JSON_THROW_ON_ERROR );
if ( get_option( 'canvas_shared_demo_installed' ) ) {
	throw new Exception( 'This demo is already installed. Start a fresh Playground to reset it.' );
}

function canvas_share_insert( $post ) {
	$id = isset( $post['ID'] ) ? wp_update_post( wp_slash( $post ), true ) : wp_insert_post( wp_slash( $post ), true );
	if ( is_wp_error( $id ) ) {
		throw new Exception( $id->get_error_message() );
	}
	return $id;
}

$url_map = array();
$id_map = array();
$image_ids = array();
foreach ( $snapshot['media'] as $media ) {
	$upload = wp_upload_bits( $media['name'], null, file_get_contents( '/tmp/canvas-demo/' . $media['name'] ) );
	if ( $upload['error'] ) {
		throw new Exception( $upload['error'] );
	}
	$type = wp_check_filetype( $upload['file'] );
	$id = wp_insert_attachment( array( 'post_title' => $media['title'], 'post_mime_type' => $type['type'], 'post_status' => 'inherit' ), $upload['file'], 0, true );
	if ( is_wp_error( $id ) ) {
		throw new Exception( $id->get_error_message() );
	}
	wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $upload['file'] ) );
	update_post_meta( $id, '_wp_attachment_image_alt', $media['alt'] );
	$url_map[ $media['token'] ] = wp_get_attachment_url( $id );
	$image_ids[ $media['token'] ] = $id;
	if ( $media['oldId'] ) {
		$id_map[ $media['oldId'] ] = $id;
	}
}

function canvas_share_blocks( $content, $url_map, $id_map, $image_ids ) {
	$walk = function ( $blocks ) use ( &$walk, $url_map, $id_map, $image_ids ) {
		foreach ( $blocks as &$block ) {
			if ( 'core/image' === $block['blockName'] ) {
				$old_id = $block['attrs']['id'] ?? null;
				if ( $old_id && isset( $id_map[ $old_id ] ) ) {
					$block['attrs']['id'] = $id_map[ $old_id ];
				} else {
					foreach ( $image_ids as $token => $id ) {
						if ( str_contains( $block['innerHTML'], $token ) ) {
							$block['attrs']['id'] = $id;
							break;
						}
					}
				}
			}
			$block['attrs'] = json_decode( strtr( wp_json_encode( $block['attrs'], JSON_UNESCAPED_SLASHES ), $url_map ), true );
			foreach ( $block['innerContent'] as &$chunk ) {
				if ( ! is_string( $chunk ) ) {
					continue;
				}
				$chunk = strtr( $chunk, $url_map );
				$chunk = preg_replace_callback( '/\bwp-image-(\d+)\b/', static fn( $match ) => 'wp-image-' . ( $id_map[ (int) $match[1] ] ?? $match[1] ), $chunk );
				if ( 'core/image' === $block['blockName'] && isset( $block['attrs']['id'] ) && ! str_contains( $chunk, 'wp-image-' ) ) {
					$image_class = 'wp-image-' . $block['attrs']['id'];
					$chunk = preg_replace_callback( '/<img\b([^>]*)>/', static function ( $match ) use ( $image_class ) {
						$attrs = $match[1];
						$attrs = str_contains( $attrs, 'class="' )
							? preg_replace( '/class="/', 'class="' . $image_class . ' ', $attrs, 1 )
							: ' class="' . $image_class . '"' . $attrs;
						return '<img' . $attrs . '>';
					}, $chunk );
				}
			}
			unset( $chunk );
			$block['innerBlocks'] = $walk( $block['innerBlocks'] );
		}
		unset( $block );
		return $blocks;
	};
	return serialize_blocks( $walk( parse_blocks( $content ) ) );
}

// Remove only the fresh installation's stock examples.
foreach ( array( 1, 2, 3 ) as $id ) {
	$post = get_post( $id );
	if ( $post && in_array( $post->post_name, array( 'hello-world', 'sample-page', 'privacy-policy' ), true ) ) {
		wp_delete_post( $id, true );
	}
}
$page_id = canvas_share_insert( array(
	'post_type' => 'page',
	'post_status' => 'publish',
	'post_title' => $snapshot['page']['post_title'],
	'post_name' => $snapshot['page']['post_name'],
	'post_content' => canvas_share_blocks( $snapshot['page']['post_content'], $url_map, $id_map, $image_ids ),
	'post_author' => 1,
) );
$template_id = canvas_share_insert( array(
	'post_type' => 'wp_template', 'post_status' => 'publish', 'post_name' => 'page', 'post_title' => 'Pages',
	'post_content' => canvas_share_blocks( $snapshot['template'], $url_map, $id_map, $image_ids ),
) );
wp_set_object_terms( $template_id, 'twentytwentyfive', 'wp_theme' );
update_post_meta( $template_id, 'origin', 'theme' );
$styles_id = WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
canvas_share_insert( array( 'ID' => $styles_id, 'post_content' => strtr( wp_json_encode( $snapshot['styles'], JSON_UNESCAPED_SLASHES ), $url_map ) ) );
wp_set_object_terms( $styles_id, 'twentytwentyfive', 'wp_theme' );
if ( ! empty( $snapshot['navigation'] ) ) {
	$blocks = parse_blocks( $snapshot['navigation'] );
	foreach ( $blocks as &$block ) {
		if ( 'core/navigation-link' === $block['blockName'] ) {
			unset( $block['attrs']['id'], $block['attrs']['metadata'] );
			$block['attrs']['kind'] = 'custom';
			$block['attrs']['type'] = 'custom';
			$block['attrs']['url'] = str_replace( 'https://canvas.invalid/home/', home_url( '/' ), $block['attrs']['url'] );
		}
	}
	unset( $block );
	canvas_share_insert( array( 'post_type' => 'wp_navigation', 'post_status' => 'publish', 'post_title' => 'Navigation', 'post_content' => serialize_blocks( $blocks ) ) );
}
update_option( 'blogname', $snapshot['siteTitle'] );
update_option( 'blogdescription', $snapshot['siteDescription'] );
update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $page_id );
update_option( 'blog_public', 0 );
// Keep the shared demo ready to edit without adding editor experiments to the plugin.
$preferences_key = $wpdb->get_blog_prefix() . 'persisted_preferences';
$preferences = get_user_meta( 1, $preferences_key, true );
$preferences = is_array( $preferences ) ? $preferences : array();
$preferences['_modified'] = gmdate( 'c' );
$preferences['core/edit-site'] = array_merge( $preferences['core/edit-site'] ?? array(), array(
	'welcomeGuide' => false,
	'welcomeGuideStyles' => false,
	'welcomeGuidePage' => false,
	'welcomeGuideTemplate' => false,
) );
update_user_meta( 1, $preferences_key, $preferences );
update_option( 'canvas_shared_demo_installed', true );
WP_Theme_JSON_Resolver::clean_cached_data();
if ( (int) WP_Theme_JSON_Resolver::get_user_global_styles_post_id() !== (int) $styles_id ) {
	throw new Exception( 'The imported global styles are not linked to the active theme.' );
}

// Resolve the generated page ID rather than assuming the source site's ID.
$destination = 'site-editor.php?postType=page&postId=' . $page_id . '&canvas=edit';
$launcher = "<?php\nrequire_once __DIR__ . '/admin.php';\nwp_safe_redirect( admin_url( " . var_export( $destination, true ) . " ) );\nexit;\n";
if ( false === file_put_contents( ABSPATH . 'wp-admin/canvas-demo.php', $launcher ) ) {
	throw new Exception( 'Could not write the Site Editor launcher.' );
}
$bundled = array_intersect( array( 'akismet/akismet.php', 'hello.php' ), array_keys( get_plugins() ) );
if ( $bundled && true !== delete_plugins( $bundled ) ) {
	throw new Exception( 'Could not remove bundled example plugins.' );
}
echo wp_json_encode( array( 'pageId' => $page_id, 'editor' => admin_url( $destination ), 'images' => count( $image_ids ) ) );

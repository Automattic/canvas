<?php
/** Bootstrap a fresh browser Playground using the selected demo content. */
require '/wordpress/wp-load.php';
wp_set_current_user( 1 );

$demo = json_decode( file_get_contents( '/tmp/preview-config.json' ), true, 512, JSON_THROW_ON_ERROR );

$content = file_get_contents( '/tmp/canvas-preview.html' );
if ( false === $content || '' === trim( $content ) ) {
	throw new Exception( 'The demo content is unavailable.' );
}
$content = str_replace( '{{THEME_URL}}', esc_url( get_stylesheet_directory_uri() ), $content );
$content = str_replace( '{{CANVAS_PLUGIN_URL}}', esc_url( plugins_url( 'canvas' ) ), $content );

$page_id = wp_insert_post( wp_slash( array(
	'post_type'    => 'page',
	'post_status'  => 'publish',
	'post_title'   => $demo['title'],
	'post_name'    => $demo['slug'],
	'post_content' => $content,
	'post_author'  => 1,
) ), true );
if ( is_wp_error( $page_id ) ) {
	throw new Exception( $page_id->get_error_message() );
}

update_post_meta( $page_id, '_wp_page_template', 'page-no-title' );
update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $page_id );
update_option( 'blogname', $demo['title'] . ' Demo' );
update_option( 'blog_public', 0 );

$preferences = array(
	'_modified'      => gmdate( 'c' ),
	'core'           => array(
		'showBlockBreadcrumbs' => false,
		'renderingModes'       => array(
			get_stylesheet() => array( 'page' => 'template-locked' ),
		),
	),
	'core/edit-post' => array( 'welcomeGuide' => false ),
	'core/edit-site' => array(
		'welcomeGuide'         => false,
		'welcomeGuideStyles'   => false,
		'welcomeGuidePage'     => false,
		'welcomeGuideTemplate' => false,
	),
);
update_user_meta( 1, $wpdb->get_blog_prefix() . 'persisted_preferences', $preferences );

// Resolve the generated page ID when Playground opens its fixed landing URL.
$destination = 'site-editor.php?postType=page&postId=' . $page_id . '&canvas=edit';
$launcher = "<?php\nrequire_once __DIR__ . '/admin.php';\nwp_safe_redirect( admin_url( " . var_export( $destination, true ) . " ) );\nexit;\n";
if ( false === file_put_contents( ABSPATH . 'wp-admin/' . sanitize_key( $demo['slug'] ) . '-preview.php', $launcher ) ) {
	throw new Exception( 'Could not create the demo editor launcher.' );
}

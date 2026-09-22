<?php
/** Bootstrap a fresh browser Playground using only bundled Canvas content. */
require '/wordpress/wp-load.php';
wp_set_current_user( 1 );

$pattern = WP_Block_Patterns_Registry::get_instance()->get_registered( 'tabor/canvas-pattern-1' );
if ( ! $pattern || empty( $pattern['content'] ) ) {
	throw new Exception( 'The Canvas pattern-1 pattern is unavailable.' );
}

$page_id = wp_insert_post( wp_slash( array(
	'post_type'    => 'page',
	'post_status'  => 'publish',
	'post_title'   => 'Canvas',
	'post_name'    => 'canvas',
	'post_content' => $pattern['content'],
	'post_author'  => 1,
) ), true );
if ( is_wp_error( $page_id ) ) {
	throw new Exception( $page_id->get_error_message() );
}

update_post_meta( $page_id, '_wp_page_template', 'page-no-title' );
update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $page_id );
update_option( 'blogname', 'Canvas' );
update_option( 'blog_public', 0 );

$preferences = array(
	'_modified'      => gmdate( 'c' ),
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
if ( false === file_put_contents( ABSPATH . 'wp-admin/canvas-preview.php', $launcher ) ) {
	throw new Exception( 'Could not create the Canvas editor launcher.' );
}

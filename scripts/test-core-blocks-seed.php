<?php
/** Deterministic content for the isolated Core-block compatibility Playground. */
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

update_option( 'blogdescription', 'Native site tagline fixture' );
update_option( 'page_comments', true );
update_option( 'comments_per_page', 1 );
update_option( 'default_comments_page', 'oldest' );
update_option( 'thread_comments', true );
update_option( 'show_avatars', true );
wp_update_user( array( 'ID' => 1, 'description' => 'Native author biography fixture.', 'display_name' => 'Canvas Author', 'user_url' => home_url( '/' ) ) );
$existing = get_page_by_path( 'canvas-core-audit' );
$id = wp_insert_post( array( 'ID' => $existing ? $existing->ID : 0, 'post_author' => 1, 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => 'canvas-core-audit', 'post_title' => 'Canvas core audit', 'post_content' => '<!-- wp:paragraph --><p>Core audit.</p><!-- /wp:paragraph -->' ) );
$upload = wp_upload_dir();
$media = array();
$files = array(
	'image' => array( 'name' => 'canvas-audit-image.png', 'mime' => 'image/png', 'bytes' => file_get_contents( ABSPATH . 'wp-admin/images/wordpress-logo.png' ) ),
	'file' => array( 'name' => 'canvas-audit-document.txt', 'mime' => 'text/plain', 'bytes' => "Native Canvas downloadable document.\n" ),
	'audio' => array( 'name' => 'canvas-audit-tone.wav', 'mime' => 'audio/wav', 'bytes' => 'RIFF' . pack( 'V', 16036 ) . 'WAVEfmt ' . pack( 'VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16 ) . 'data' . pack( 'V', 16000 ) . str_repeat( pack( 'v', 0 ), 8000 ) ),
);
if ( file_exists( '/wordpress/canvas-audit-video.mp4' ) ) {
	$files['video'] = array( 'name' => 'canvas-audit-video.mp4', 'mime' => 'video/mp4', 'bytes' => file_get_contents( '/wordpress/canvas-audit-video.mp4' ) );
}
foreach ( $files as $kind => $file ) {
	$path = $upload['path'] . '/' . $file['name'];
	file_put_contents( $path, $file['bytes'] );
	$found = get_posts( array( 'post_type' => 'attachment', 'name' => sanitize_title( $file['name'] ), 'posts_per_page' => 1, 'post_status' => 'inherit' ) );
	$attachment = wp_insert_attachment( array( 'ID' => $found ? $found[0]->ID : 0, 'post_name' => sanitize_title( $file['name'] ), 'post_title' => 'Canvas audit ' . $kind, 'post_status' => 'inherit', 'post_mime_type' => $file['mime'] ), $path );
	update_attached_file( $attachment, $path );
	if ( 'image' === $kind ) {
		wp_update_attachment_metadata( $attachment, wp_generate_attachment_metadata( $attachment, $path ) );
	}
	$media[ $kind ] = array( 'id' => $attachment, 'url' => wp_get_attachment_url( $attachment ) );
}
set_theme_mod( 'custom_logo', $media['image']['id'] );
$term = term_exists( 'canvas-audit-category', 'category' );
$term = $term ?: wp_insert_term( 'Canvas Audit Category', 'category', array( 'slug' => 'canvas-audit-category', 'description' => 'Native taxonomy description fixture.' ) );
$category = (int) $term['term_id'];
wp_update_term( $category, 'category', array( 'description' => 'Native taxonomy description fixture.' ) );
$tag = term_exists( 'canvas-audit-tag', 'post_tag' );
$tag = $tag ?: wp_insert_term( 'Canvas Audit Tag', 'post_tag', array( 'slug' => 'canvas-audit-tag' ) );
$posts = array();
for ( $index = 1; $index <= 5; ++$index ) {
	$slug = 'canvas-context-story-' . $index;
	$existing = get_page_by_path( $slug, OBJECT, 'post' );
	$post_id = wp_insert_post( array( 'ID' => $existing ? $existing->ID : 0, 'post_type' => 'post', 'post_status' => 'publish', 'post_author' => 1, 'post_name' => $slug, 'post_title' => 'Canvas Context Story ' . $index, 'post_date' => '2024-01-0' . $index . ' 12:00:00', 'post_excerpt' => 'Native excerpt fixture ' . $index . '.', 'comment_status' => 'open', 'post_content' => '<!-- wp:paragraph --><p>' . str_repeat( 'Native flowing post body fixture. ', 90 ) . '</p><!-- /wp:paragraph -->' ) );
	set_post_thumbnail( $post_id, $media['image']['id'] );
	wp_set_post_categories( $post_id, array( $category ) );
	wp_set_post_terms( $post_id, array( (int) $tag['term_id'] ), 'post_tag' );
	update_post_meta( $post_id, 'footnotes', wp_json_encode( array( array( 'id' => 'canvas-note-' . $index, 'content' => 'Native footnote fixture ' . $index . '.' ) ) ) );
	$posts[] = $post_id;
}
$comment_ids = array();
for ( $index = 1; $index <= 4; ++$index ) {
	$content = 'Native approved comment fixture ' . $index . '.';
	$existing = get_comments( array( 'post_id' => $posts[2], 'search' => $content, 'number' => 1, 'status' => 'approve' ) );
	$comment_ids[] = $existing ? $existing[0]->comment_ID : wp_insert_comment( array( 'comment_post_ID' => $posts[2], 'comment_author' => 'Canvas Reader ' . $index, 'comment_author_email' => 'reader' . $index . '@example.test', 'comment_content' => $content, 'comment_approved' => 1, 'comment_date' => '2024-01-10 12:0' . $index . ':00' ) );
}
$existing = get_posts( array( 'post_type' => 'wp_template_part', 'name' => 'canvas-audit-shared', 'posts_per_page' => 1, 'post_status' => 'publish' ) );
$part = wp_insert_post( array( 'ID' => $existing ? $existing[0]->ID : 0, 'post_type' => 'wp_template_part', 'post_status' => 'publish', 'post_name' => 'canvas-audit-shared', 'post_title' => 'Canvas audit shared part', 'post_content' => '<!-- wp:paragraph --><p>Native shared template part fixture.</p><!-- /wp:paragraph -->' ) );
wp_set_object_terms( $part, get_stylesheet(), 'wp_theme' );
wp_set_object_terms( $part, 'uncategorized', 'wp_template_part_area' );
$existing = get_posts( array( 'post_type' => 'wp_template_part', 'name' => 'canvas-audit-overlay', 'posts_per_page' => 1, 'post_status' => 'publish' ) );
$overlay = wp_insert_post( array( 'ID' => $existing ? $existing[0]->ID : 0, 'post_type' => 'wp_template_part', 'post_status' => 'publish', 'post_name' => 'canvas-audit-overlay', 'post_title' => 'Canvas audit navigation overlay', 'post_content' => '<!-- wp:tabor/canvas --><!-- wp:navigation-overlay-close {"displayMode":"both","text":"Close fixture menu"} /--><!-- wp:paragraph --><p>Native custom overlay fixture.</p><!-- /wp:paragraph --><!-- /wp:tabor/canvas -->' ) );
wp_set_object_terms( $overlay, get_stylesheet(), 'wp_theme' );
wp_set_object_terms( $overlay, 'navigation-overlay', 'wp_template_part_area' );
update_option( 'canvas_core_audit_media', $media );
wp_mkdir_p( WPMU_PLUGIN_DIR );
$runtime = <<<'PHP'
<?php
// Test-only deterministic services and native queried-context rendering.
add_filter( 'get_avatar_data', static function ( $args ) {
	$media = get_option( 'canvas_core_audit_media' );
	$args['url'] = $media['image']['url'];
	$args['found_avatar'] = true;
	return $args;
} );
add_filter( 'pre_oembed_result', static function ( $result, $url ) {
	return home_url( '/?canvas-core-embed=1' ) === $url ? '<iframe title="Native local embed fixture" src="' . esc_url( home_url( '/?canvas-core-embed-frame=1' ) ) . '" width="480" height="270"></iframe>' : $result;
}, 10, 2 );
add_filter( 'pre_http_request', static function ( $response, $args, $url ) {
	if ( home_url( '/?canvas-core-rss=1' ) !== $url ) { return $response; }
	$xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Canvas local RSS</title><link>' . home_url( '/' ) . '</link><description>Local audit feed</description><item><title>Native RSS fixture story</title><link>' . home_url( '/' ) . '</link><guid>canvas-audit-rss</guid><description>Native RSS fixture summary.</description><pubDate>Mon, 01 Jan 2024 12:00:00 +0000</pubDate></item></channel></rss>';
	return array( 'headers' => array( 'content-type' => 'application/rss+xml' ), 'body' => $xml, 'response' => array( 'code' => 200, 'message' => 'OK' ), 'cookies' => array(), 'filename' => null );
}, 10, 3 );
add_action( 'template_redirect', static function () {
	if ( isset( $_GET['canvas-core-embed-frame'] ) ) {
		header( 'Content-Type: text/html; charset=UTF-8' );
		echo '<!doctype html><html><body><p>Canvas local embedded document</p></body></html>';
		exit;
	}
	if ( ! isset( $_GET['canvas_audit_page'] ) ) { return; }
	$page = get_post( (int) $_GET['canvas_audit_page'] );
	if ( ! $page || ! str_starts_with( $page->post_name, 'canvas-core-' ) ) { return; }
	$content = $page->post_content;
	if ( isset( $_GET['canvas_audit_fixture'] ) ) {
		$fixture = sanitize_html_class( wp_unslash( $_GET['canvas_audit_fixture'] ) );
		$blocks = array_filter( parse_blocks( $content ), static function ( $block ) use ( $fixture ) {
			return 'tabor/canvas' === $block['blockName'] && in_array( $fixture, explode( ' ', $block['attrs']['className'] ?? '' ), true );
		} );
		$content = serialize_blocks( $blocks );
	}
	status_header( 200 );
	echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">';
	wp_head();
	echo '</head><body><main>' . do_blocks( $content ) . '</main>';
	wp_footer();
	echo '</body></html>';
	exit;
}, 1 );
PHP;
file_put_contents( WPMU_PLUGIN_DIR . '/canvas-core-audit-runtime.php', $runtime );
$manifest = array( 'supportedBlocks' => \PlaygroundPlugin\Abilities\BLOCKS, 'id' => $id, 'posts' => $posts, 'postId' => $posts[2], 'postUrl' => get_permalink( $posts[2] ), 'categoryId' => $category, 'categoryUrl' => get_category_link( $category ), 'commentIds' => $comment_ids, 'media' => $media, 'theme' => get_stylesheet(), 'templatePart' => 'canvas-audit-shared', 'embedUrl' => home_url( '/?canvas-core-embed=1' ), 'embedFrameUrl' => home_url( '/?canvas-core-embed-frame=1' ), 'rssUrl' => home_url( '/?canvas-core-rss=1' ) );
file_put_contents( '/wordpress/canvas-core-audit.json', wp_json_encode( $manifest ) );

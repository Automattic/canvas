<?php
/** Integration checks in the local Playground PHP runtime. Own fixtures only. */
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/user.php';
$checks = array(); $pages = array(); $users = array();
function check_canvas( $condition, $label ) {
	if ( ! $condition ) throw new Exception( $label );
	$GLOBALS['checks'][] = $label;
}
function call_canvas( $name, $input = array() ) {
	$result = wp_get_ability( 'canvas/' . $name )->execute( $input );
	if ( is_wp_error( $result ) ) throw new Exception( $name . ': ' . $result->get_error_message() );
	return $result;
}
try {
	$admins = get_users( array( 'role' => 'administrator', 'number' => 1 ) );
	wp_set_current_user( $admins[0]->ID );
	$context = call_canvas( 'get-context' );
	$guide = $context['guide'];
	preg_match( '/```html\n(.*?)\n```/s', $guide, $match ); $markup = $match[1];
	foreach ( array( 'build-it', 'skydiving-school', 'energy-healing' ) as $slug ) {
		$pattern = \WP_Block_Patterns_Registry::get_instance()->get_registered( 'tabor/canvas-' . $slug )['content'];
		check_canvas( ! is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $pattern ) ) ), 'bundled composition validates: ' . $slug );
	}
	check_canvas( isset( $context['settings']['layout']['wideSize'] ) && isset( $context['blocks']['core/image'] ), 'context returns site widths and registered schemas' );
	check_canvas( 1 === call_canvas( 'validate-sections', array( 'markup' => $markup ) )['section_count'], 'guide example validates' );
	foreach ( array(
		str_replace( '<!-- /wp:tabor/canvas -->', '', $markup ),
		str_replace( '<!-- /wp:heading -->', '<!-- /wp:paragraph -->', $markup ),
		str_replace( '"columnSpan":18', '"columnSpan":19', $markup ),
		str_replace( '<p>', '<p onclick="alert(1)">', $markup ),
		str_replace( '<p>', '<script>alert(1)</script><p>', $markup ),
		'<!-- wp:html --><div>raw</div><!-- /wp:html -->',
		str_replace( '"align":"wide"', '"invented":true', $markup ),
	) as $invalid ) check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $invalid ) ) ), 'invalid input rejected ' . count( $checks ) );
	$created = call_canvas( 'create-page', array( 'title' => 'Canvas ability test', 'markup' => $markup ) ); $pages[] = $created['page_id']; $id = $created['page_id'];
	check_canvas( 'publish' === get_post_status( $id ), 'new page publishes by default' );
	$before = get_post_field( 'post_content', $id );
	$inserted = call_canvas( 'insert-sections', array( 'page_id' => $id, 'fingerprint' => $created['fingerprint'], 'markup' => $markup . "\n" . $markup ) );
	check_canvas( 3 === count( call_canvas( 'get-sections', array( 'page_id' => $id ) )['blocks'] ), 'multiple sections inserted into published page' );
	check_canvas( get_post( $inserted['revision_id'] )->post_content === $before, 'pre-change revision preserves original content' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/insert-sections' )->execute( array( 'page_id' => $id, 'fingerprint' => $created['fingerprint'], 'markup' => $markup ) ) ), 'stale fingerprint rejected' );
	$updated = call_canvas( 'update-section', array( 'page_id' => $id, 'fingerprint' => $inserted['fingerprint'], 'path' => array( 1 ), 'markup' => str_replace( 'A little room', 'A changed section', $markup ) ) );
	$tree = parse_blocks( get_post_field( 'post_content', $id ) );
	check_canvas( serialize_block( $tree[0] ) === $before && serialize_block( $tree[2] ) === $before, 'unrelated sections preserved' );
	check_canvas( 'publish' === $updated['status'], 'updates retain published status' );
	$nested = '<!-- wp:group --><div class="wp-block-group">' . $markup . '</div><!-- /wp:group -->';
	wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $nested ) ) );
	$current = call_canvas( 'get-sections', array( 'page_id' => $id ) );
	call_canvas( 'update-section', array( 'page_id' => $id, 'fingerprint' => $current['fingerprint'], 'path' => array( 0, 0 ), 'markup' => $markup ) );
	check_canvas( get_post_field( 'post_content', $id ) === $nested, 'nested replacement preserves parent wrapper' );
	$prefix = '<!-- wp:core/paragraph { "className" : "keep-me" } --><p class="keep-me">Keep &amp; preserve.</p><!-- /wp:core/paragraph -->' . "\n\n";
	$suffix = "\n\n" . '<!-- wp:separator /-->';
	wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $prefix . $nested . $suffix ) ) );
	$current = call_canvas( 'get-sections', array( 'page_id' => $id ) );
	$changed_markup = str_replace( 'A little room', 'Changed nested section', $markup );
	call_canvas( 'update-section', array( 'page_id' => $id, 'fingerprint' => $current['fingerprint'], 'path' => array( 2, 0 ), 'markup' => $changed_markup ) );
	check_canvas( get_post_field( 'post_content', $id ) === $prefix . str_replace( $markup, $changed_markup, $nested ) . $suffix, 'noncanonical neighboring markup preserved byte for byte' );
	$current = call_canvas( 'get-sections', array( 'page_id' => $id ) );
	$before_insert = get_post_field( 'post_content', $id );
	call_canvas( 'insert-sections', array( 'page_id' => $id, 'fingerprint' => $current['fingerprint'], 'index' => 2, 'markup' => $markup ) );
	check_canvas( get_post_field( 'post_content', $id ) === $prefix . $markup . substr( $before_insert, strlen( $prefix ) ), 'insertion preserves noncanonical surrounding bytes' );
	$current = call_canvas( 'get-sections', array( 'page_id' => $id ) );
	update_post_meta( $id, '_edit_lock', time() . ':' . get_current_user_id() );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/insert-sections' )->execute( array( 'page_id' => $id, 'fingerprint' => $current['fingerprint'], 'markup' => $markup ) ) ), 'active editor conflict rejected' );
	delete_post_meta( $id, '_edit_lock' );
	$draft = call_canvas( 'create-page', array( 'title' => 'Explicit draft test', 'markup' => $markup, 'status' => 'draft' ) ); $pages[] = $draft['page_id'];
	check_canvas( 'draft' === $draft['status'], 'explicit draft respected' );
	$uid = wp_insert_user( array( 'user_login' => 'canvas-test-' . wp_generate_password( 12, false ), 'user_pass' => wp_generate_password(), 'role' => 'subscriber' ) ); $users[] = $uid;
	wp_set_current_user( $uid );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( array( 'page_id' => $id ) ) ), 'subscriber cannot inspect editing data' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/create-page' )->execute( array( 'title' => 'Forbidden', 'markup' => $markup ) ) ), 'subscriber cannot create pages' );
	wp_set_current_user( 0 );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-context' )->execute( array() ) ), 'anonymous access rejected' );
	$report = array( 'passed' => count( $checks ), 'checks' => $checks );
} catch ( Throwable $error ) {
	$report = array( 'passed' => count( $checks ), 'error' => $error->getMessage(), 'checks' => $checks );
} finally {
	foreach ( $pages as $id ) wp_delete_post( $id, true );
	foreach ( $users as $id ) wp_delete_user( $id );
}
file_put_contents( '/wordpress/canvas-abilities-test.json', wp_json_encode( $report ) );

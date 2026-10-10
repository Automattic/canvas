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
	foreach ( array( 'pattern-1', 'pattern-2', 'pattern-3' ) as $slug ) {
		$pattern = \WP_Block_Patterns_Registry::get_instance()->get_registered( 'tabor/canvas-' . $slug )['content'];
		$images = new WP_HTML_Tag_Processor( $pattern );
		while ( $images->next_tag( 'IMG' ) ) {
			if ( ! $images->get_attribute( 'src' ) ) $images->set_attribute( 'src', 'https://example.org/canvas-fixture.jpg' );
		}
		$pattern = $images->get_updated_html();
		$validation = wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $pattern ) );
		check_canvas( ! is_wp_error( $validation ), 'bundled composition validates: ' . $slug . ( is_wp_error( $validation ) ? ': ' . $validation->get_error_message() : '' ) );
	}
	check_canvas( isset( $context['settings']['layout']['wideSize'] ) && isset( $context['blocks']['core/image'] ), 'context returns site widths and registered schemas' );
	check_canvas( ! isset( $context['blocks']['core/html']['attributes']['content'] ), 'authoring schemas omit temporary Custom HTML editor state' );
	$local_html = '<!-- wp:tabor/canvas --><!-- wp:html {"content":"<p>Unsaved editor state</p>"} /--><!-- /wp:tabor/canvas -->';
	check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $local_html ) ) ), 'temporary Custom HTML attributes cannot silently replace saved markup' );
	check_canvas( array( 'core/query' ) === $context['blocks']['core/post-template']['ancestor'] && in_array( 'query', $context['blocks']['core/post-template']['uses_context'], true ), 'context exposes native loop ancestry and inherited data' );
	check_canvas( array( 'core/image' ) === $context['blocks']['core/gallery']['allowed_blocks'] && in_array( 'core/navigation-submenu', $context['blocks']['core/navigation-submenu']['allowed_blocks'], true ), 'context exposes native child restrictions including editor-only submenu nesting' );
	check_canvas( array( 'core/list' ) === $context['blocks']['core/list-item']['parent'], 'context exposes structural child parent restrictions' );
	$file_links = '<!-- wp:tabor/canvas --><!-- wp:file {"displayPreview":false} --><div class="wp-block-file"><a href="https://example.org/document.pdf">Document</a><a href="https://example.org/document.pdf" class="wp-block-file__button wp-element-button" download>Download</a></div><!-- /wp:file --><!-- /wp:tabor/canvas -->';
	call_canvas( 'validate-sections', array( 'markup' => $file_links ) );
	check_canvas( true, 'native file download links validate without an embedded PDF object' );
	$file_preview = str_replace( '<div class="wp-block-file">', '<div class="wp-block-file"><object class="wp-block-file__embed" data="https://example.org/document.pdf" type="application/pdf" width="100%" height="600px"></object>', $file_links );
	$file_preview_result = wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $file_preview ) );
	check_canvas( is_wp_error( $file_preview_result ) && str_contains( $file_preview_result->get_error_message(), 'displayPreview: false' ), 'embedded PDF objects retain sanitization and explain the native alternative' );
	foreach ( array( 'html', 'freeform' ) as $native_html ) {
		$safe_html = '<!-- wp:tabor/canvas --><!-- wp:' . $native_html . ' --><section><h3>Safe native HTML</h3><p>Readable <strong>content</strong>.</p></section><p>Another root.</p><!-- /wp:' . $native_html . ' --><!-- /wp:tabor/canvas -->';
		call_canvas( 'validate-sections', array( 'markup' => $safe_html ) );
		check_canvas( true, 'safe native markup validates without relaxing sanitization: ' . $native_html );
		foreach ( array(
			'<script>alert(1)</script>',
			'<p onclick="alert(1)">Unsafe handler</p>',
			'<a href="javascript:alert(1)">Unsafe URL</a>',
			'<iframe src="https://example.org"></iframe>',
			'<svg><path d="M0 0L1 1"></path></svg>',
		) as $unsafe_html ) {
			$unsafe_markup = '<!-- wp:tabor/canvas --><!-- wp:' . $native_html . ' -->' . $unsafe_html . '<!-- /wp:' . $native_html . ' --><!-- /wp:tabor/canvas -->';
			$result = wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $unsafe_markup ) );
			check_canvas( is_wp_error( $result ) && str_contains( $result->get_error_message(), 'unsupported HTML' ), 'unsafe native markup rejected by sanitizer: ' . $native_html . ' ' . count( $checks ) );
		}
	}
	$widget_group = '<!-- wp:tabor/canvas --><!-- wp:widget-group {"title":"Native widget group"} --><!-- wp:paragraph --><p>Native widget content.</p><!-- /wp:paragraph --><!-- /wp:widget-group --><!-- /wp:tabor/canvas -->';
	call_canvas( 'validate-sections', array( 'markup' => $widget_group ) );
	check_canvas( true, 'native widget group accepts ordinary native children' );
	foreach ( array( 'gallery', 'list', 'columns', 'accordion', 'tabs', 'playlist' ) as $container ) {
		$invalid_child = '<!-- wp:tabor/canvas --><!-- wp:' . $container . ' --><!-- wp:paragraph --><p>Wrong native child</p><!-- /wp:paragraph --><!-- /wp:' . $container . ' --><!-- /wp:tabor/canvas -->';
		check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $invalid_child ) ) ), 'native restricted container rejects arbitrary children: ' . $container );
	}
	check_canvas( 1 === call_canvas( 'validate-sections', array( 'markup' => $markup ) )['section_count'], 'guide example validates' );
	$flow_markup = '<!-- wp:tabor/canvas -->' .
		'<!-- wp:query {"query":{"perPage":2,"inherit":false}} --><div class="wp-block-query">' .
		'<!-- wp:post-template --><!-- wp:tabor/canvas -->' .
		'<!-- wp:post-title {"isLink":true} /--><!-- wp:post-date /--><!-- wp:post-terms {"term":"category"} /-->' .
		'<!-- /wp:tabor/canvas --><!-- /wp:post-template -->' .
		'<!-- wp:tabor/canvas --><!-- wp:query-pagination --><!-- wp:query-pagination-numbers /--><!-- /wp:query-pagination --><!-- /wp:tabor/canvas -->' .
		'<!-- wp:query-no-results --><!-- wp:tabor/canvas --><!-- wp:search {"label":"Find stories"} /--><!-- /wp:tabor/canvas --><!-- /wp:query-no-results -->' .
		'</div><!-- /wp:query --><!-- wp:post-content /--><!-- /wp:tabor/canvas -->';
	check_canvas( ! is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $flow_markup ) ) ), 'native query with nested Canvas cards and flow body validates' );
	foreach ( array( 'core/query', 'core/post-content', 'core/search', 'core/post-date', 'core/post-template' ) as $name ) {
		check_canvas( isset( $context['blocks'][ $name ] ), 'native flow schema exposed: ' . $name );
	}
	foreach ( array(
		'<!-- wp:tabor/canvas --><!-- wp:post-template /--><!-- /wp:tabor/canvas -->',
		'<!-- wp:tabor/canvas --><!-- wp:query-pagination-numbers /--><!-- /wp:tabor/canvas -->',
		'<!-- wp:tabor/canvas --><!-- wp:comment-content /--><!-- /wp:tabor/canvas -->',
		'<!-- wp:tabor/canvas --><!-- wp:query --><div class="wp-block-query"><!-- wp:query-pagination --><!-- wp:tabor/canvas --><!-- wp:query-pagination-numbers /--><!-- /wp:tabor/canvas --><!-- /wp:query-pagination --></div><!-- /wp:query --><!-- /wp:tabor/canvas -->',
		'<!-- wp:tabor/canvas --><!-- wp:comments --><div class="wp-block-comments"><!-- wp:tabor/canvas --><!-- wp:comment-template /--><!-- /wp:tabor/canvas --></div><!-- /wp:comments --><!-- /wp:tabor/canvas -->',
	) as $orphan ) {
		check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $orphan ) ) ), 'orphan native loop context rejected ' . count( $checks ) );
	}
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
	$rest = new WP_REST_Request( 'GET', '/wp-abilities/v1/abilities/canvas/get-sections/run' );
	$rest->set_param( 'input', array( 'page_id' => $id ) );
	$response = rest_do_request( $rest );
	check_canvas( 200 === $response->get_status() && $id === $response->get_data()['page_id'], 'registered REST ability preserves legacy selector without injecting template defaults' );
	$rest->set_param( 'input', array( 'page_id' => $id, 'unexpected' => true ) );
	check_canvas( 400 === rest_do_request( $rest )->get_status(), 'registered REST ability rejects unknown input fields' );
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
	$post = call_canvas( 'create-post', array( 'title' => 'Canvas post fixture', 'markup' => $markup, 'status' => 'draft' ) ); $pages[] = $post['post_id'];
	check_canvas( 'post' === $post['post_type'] && ! isset( $post['page_id'] ), 'post destination has native post identity' );
	$post_sections = call_canvas( 'get-sections', array( 'post_id' => $post['post_id'] ) );
	$post_changed = call_canvas( 'update-section', array( 'post_id' => $post['post_id'], 'fingerprint' => $post_sections['fingerprint'], 'path' => array( 0 ), 'markup' => $changed_markup ) );
	check_canvas( 'draft' === $post_changed['status'] && get_post( $post_changed['revision_id'] )->post_content === $markup, 'post edit preserves status and recovery revision' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( array( 'page_id' => $id, 'post_id' => $post['post_id'] ) ) ), 'ambiguous document destination rejected' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( array() ) ), 'missing destination rejected' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( array( 'page_id' => $post['post_id'] ) ) ), 'legacy page selector cannot target a post' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-context' )->execute( array( 'template_type' => 'wp_template_part' ) ) ), 'orphan template type rejected by context' );
	$structure = call_canvas( 'get-site-structure' );
	check_canvas( count( $structure['templates'] ) > 0 && count( $structure['template_parts'] ) > 0, 'active theme templates and shared parts discovered' );
	$slug = 'canvas-test-' . strtolower( wp_generate_password( 10, false ) );
	$created_part = call_canvas( 'create-template', array( 'title' => 'Canvas shared part fixture', 'slug' => $slug, 'template_type' => 'wp_template_part', 'area' => 'header', 'markup' => $markup ) ); $pages[] = $created_part['post_id'];
	$part_target = array( 'template_id' => $created_part['template_id'], 'template_type' => 'wp_template_part' );
	check_canvas( get_stylesheet() . '//' . $slug === $created_part['template_id'] && 'custom' === $created_part['source'], 'new shared part scoped to active theme' );
	check_canvas( has_term( 'header', 'wp_template_part_area', $created_part['post_id'] ), 'new shared part retains semantic area' );
	$part_changed = call_canvas( 'update-section', array_merge( $part_target, array( 'fingerprint' => $created_part['fingerprint'], 'path' => array( 0 ), 'markup' => $changed_markup ) ) );
	check_canvas( get_post( $part_changed['revision_id'] )->post_content === $markup, 'shared part edit creates recovery revision' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/insert-sections' )->execute( array_merge( $part_target, array( 'fingerprint' => $created_part['fingerprint'], 'markup' => $markup ) ) ) ), 'shared part stale fingerprint rejected' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/create-template' )->execute( array( 'title' => 'Duplicate', 'slug' => $slug, 'template_type' => 'wp_template_part', 'markup' => $markup ) ) ), 'existing effective template cannot be overwritten by creation' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( array( 'template_id' => 'wrong-theme//' . $slug, 'template_type' => 'wp_template_part' ) ) ), 'foreign theme identity rejected' );
	update_post_meta( $created_part['post_id'], '_edit_lock', time() . ':' . get_current_user_id() );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/insert-sections' )->execute( array_merge( $part_target, array( 'fingerprint' => $part_changed['fingerprint'], 'markup' => $markup ) ) ) ), 'shared part active editor lock rejected' );
	delete_post_meta( $created_part['post_id'], '_edit_lock' );
	foreach ( $structure['templates'] as $template ) {
		if ( 'theme' !== $template['source'] ) continue;
		$target = array( 'template_id' => $template['template_id'] );
		$effective = call_canvas( 'get-sections', $target );
		$original = get_block_template( $template['template_id'] )->content;
		$customized = call_canvas( 'insert-sections', array_merge( $target, array( 'fingerprint' => $effective['fingerprint'], 'markup' => $markup ) ) ); $pages[] = $customized['post_id'];
		check_canvas( 'custom' === $customized['source'] && get_post( $customized['revision_id'] )->post_content === $original, 'theme template customization preserves original revision' );
		check_canvas( str_starts_with( get_block_template( $template['template_id'] )->content, $original ), 'theme template insertion preserves dynamic blocks and shared references' );
		check_canvas( is_wp_error( wp_get_ability( 'canvas/insert-sections' )->execute( array_merge( $target, array( 'fingerprint' => $effective['fingerprint'], 'markup' => $markup ) ) ) ), 'theme source fingerprint invalidated by customization' );
		break;
	}
	foreach ( $structure['template_parts'] as $template ) {
		if ( 'theme' !== $template['source'] ) continue;
		$target = array( 'template_id' => $template['template_id'], 'template_type' => 'wp_template_part' );
		$effective = call_canvas( 'get-sections', $target );
		$customized = call_canvas( 'insert-sections', array_merge( $target, array( 'fingerprint' => $effective['fingerprint'], 'markup' => $markup ) ) ); $pages[] = $customized['post_id'];
		check_canvas( has_term( $template['area'], 'wp_template_part_area', $customized['post_id'] ), 'theme shared part customization preserves semantic area' );
		break;
	}
	$template_slug = 'canvas-template-' . strtolower( wp_generate_password( 10, false ) );
	$expired_key = 'canvas_write_' . md5( 'wp_template:' . get_stylesheet() . '//' . $template_slug );
	add_option( $expired_key, array( 'token' => 'expired-fixture', 'expires' => time() - 1 ), '', false );
	$created_template = call_canvas( 'create-template', array( 'title' => 'Canvas template fixture', 'slug' => $template_slug, 'markup' => $markup ) ); $pages[] = $created_template['post_id'];
	check_canvas( 'wp_template' === $created_template['post_type'] && false === get_option( $expired_key ), 'template creation reclaims expired lease and releases it' );
	foreach ( array( 'site-logo', 'site-title', 'post-title', 'post-featured-image', 'post-excerpt' ) as $dynamic ) {
		$dynamic_markup = '<!-- wp:tabor/canvas --><div class="wp-block-tabor-canvas"><!-- wp:' . $dynamic . ' /--></div><!-- /wp:tabor/canvas -->';
		call_canvas( 'validate-sections', array( 'markup' => $dynamic_markup ) );
		check_canvas( true, 'native dynamic block validates: ' . $dynamic );
	}
	$navigation_markup = '<!-- wp:tabor/canvas --><div class="wp-block-tabor-canvas"><!-- wp:navigation --><!-- wp:navigation-link {"label":"Home","url":"/"} /--><!-- /wp:navigation --></div><!-- /wp:tabor/canvas -->';
	call_canvas( 'validate-sections', array( 'markup' => $navigation_markup ) );
	check_canvas( true, 'inline native navigation validates' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => str_replace( '<!-- wp:navigation -->', '', str_replace( '<!-- /wp:navigation -->', '', $navigation_markup ) ) ) ) ), 'navigation links cannot escape native parent' );
	foreach ( array( 'home-link', 'page-list' ) as $descendant ) {
		$child = '<!-- wp:' . $descendant . ' /-->';
		$native = '<!-- wp:tabor/canvas --><div class="wp-block-tabor-canvas"><!-- wp:navigation -->' . $child . '<!-- /wp:navigation --></div><!-- /wp:tabor/canvas -->';
		$result = call_canvas( 'validate-sections', array( 'markup' => $native ) );
		$tree = parse_blocks( $result['markup'] );
		check_canvas( 'core/' . $descendant === $tree[0]['innerBlocks'][0]['innerBlocks'][0]['blockName'], 'native navigation descendant preserved: ' . $descendant );
		$standalone = str_replace( array( '<!-- wp:navigation -->', '<!-- /wp:navigation -->' ), '', $native );
		$standalone_result = wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $standalone ) );
		check_canvas( ( 'home-link' === $descendant ) === is_wp_error( $standalone_result ), 'native standalone availability preserved: ' . $descendant );
		$placed = str_replace( $child, '<!-- wp:' . $descendant . ' {"canvas":{"desktop":{"column":1}}} /-->', $native );
		check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $placed ) ) ), 'navigation descendant rejects Canvas placement: ' . $descendant );
	}
	$submenu_markup = str_replace( '<!-- wp:navigation-link {"label":"Home","url":"/"} /-->', '<!-- wp:navigation-submenu {"label":"Explore"} --><!-- wp:navigation-submenu {"label":"More"} --><!-- wp:navigation-link {"label":"Home","url":"/"} /--><!-- /wp:navigation-submenu --><!-- /wp:navigation-submenu -->', $navigation_markup );
	call_canvas( 'validate-sections', array( 'markup' => $submenu_markup ) );
	check_canvas( true, 'recursive native navigation submenus validate' );
	$search_navigation = str_replace( '<!-- wp:navigation-link {"label":"Home","url":"/"} /-->', '<!-- wp:search {"label":"Search"} /-->', $navigation_markup );
	call_canvas( 'validate-sections', array( 'markup' => $search_navigation ) );
	check_canvas( true, 'navigation accepts native search child' );
	$invalid_navigation = str_replace( '<!-- wp:navigation-link {"label":"Home","url":"/"} /-->', '<!-- wp:paragraph --><p>Not a navigation item</p><!-- /wp:paragraph -->', $navigation_markup );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => $invalid_navigation ) ) ), 'navigation retains native child restrictions' );
	$navigation = wp_insert_post( array( 'post_type' => 'wp_navigation', 'post_title' => 'Canvas navigation fixture', 'post_status' => 'publish', 'post_content' => '<!-- wp:navigation-link {"label":"Home","url":"/"} /-->' ) ); $pages[] = $navigation;
	$ref_markup = '<!-- wp:tabor/canvas --><div class="wp-block-tabor-canvas"><!-- wp:navigation {"ref":' . $navigation . '} /--></div><!-- /wp:tabor/canvas -->';
	$ref = call_canvas( 'validate-sections', array( 'markup' => $ref_markup ) );
	check_canvas( str_contains( $ref['markup'], '"ref":' . $navigation ), 'native navigation reference preserved during authoring' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/validate-sections' )->execute( array( 'markup' => str_replace( '"ref":' . $navigation, '"ref":' . $id, $ref_markup ) ) ) ), 'navigation ref cannot target arbitrary post' );
	$author = wp_insert_user( array( 'user_login' => 'canvas-author-' . wp_generate_password( 12, false ), 'user_pass' => wp_generate_password(), 'role' => 'author' ) ); $users[] = $author;
	wp_set_current_user( $author );
	$author_post = call_canvas( 'create-post', array( 'title' => 'Author fixture', 'markup' => $markup ) ); $pages[] = $author_post['post_id'];
	call_canvas( 'get-sections', array( 'post_id' => $author_post['post_id'] ) );
	check_canvas( true, 'author can create and inspect own posts without page capability' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-sections' )->execute( $part_target ) ), 'post author cannot edit shared template parts' );
	check_canvas( is_wp_error( wp_get_ability( 'canvas/get-site-structure' )->execute( array() ) ), 'post author cannot inspect site editing data' );
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

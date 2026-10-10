<?php
/** Read-only native Query/Canvas integration check; run in a seeded WordPress site. */
require_once getenv( 'CANVAS_WP_LOAD' ) ?: ( file_exists( '/wordpress/wp-load.php' ) ? '/wordpress/wp-load.php' : '/var/www/html/wp-load.php' );

function canvas_flow_block( $name, $attributes = array(), $children = array() ) {
	return array(
		'blockName'    => $name,
		'attrs'        => $attributes,
		'innerBlocks'  => $children,
		'innerHTML'    => '',
		'innerContent' => array_fill( 0, count( $children ), null ),
	);
}

function canvas_flow_check( $condition, $message ) {
	if ( ! $condition ) {
		throw new RuntimeException( $message );
	}
}

// Canvas must retain the child filter lifecycle used by WP_Block::render().
$filter_events = array();
$filter_render_count = 0;
register_block_type( 'canvas-test/native-filter', array(
	'attributes' => array( 'marker' => array( 'type' => 'string' ) ),
	'uses_context' => array( 'canvas-test/context' ),
	'render_callback' => static function ( $attributes, $content, $block ) use ( &$filter_render_count ) {
		++$filter_render_count;
		return '<p>' . esc_html( ( $attributes['marker'] ?? '' ) . ':' . ( $block->context['canvas-test/context'] ?? '' ) ) . '</p>';
	},
) );
$filter_pre = static function ( $pre, $parsed, $parent ) use ( &$filter_events ) {
	if ( 'canvas-test/native-filter' === $parsed['blockName'] ) {
		$filter_events[] = array( 'pre', $parent->name ?? null );
		if ( 'override' === ( $parsed['attrs']['marker'] ?? '' ) ) {
			return '<p>Native pre-render override.</p>';
		}
		if ( 'empty-override' === ( $parsed['attrs']['marker'] ?? '' ) ) {
			return '';
		}
	}
	return $pre;
};
$filter_data = static function ( $parsed, $source, $parent ) use ( &$filter_events ) {
	if ( 'canvas-test/native-filter' === $parsed['blockName'] ) {
		$filter_events[] = array( 'data', $parent->name ?? null );
		$parsed['attrs']['marker'] = 'Native filtered data';
	}
	return $parsed;
};
$filter_context = static function ( $context, $parsed, $parent ) use ( &$filter_events ) {
	if ( 'core/group' === $parsed['blockName'] && 1 === ( $parsed['attrs']['canvas']['group'] ?? null ) ) {
		$filter_events[] = array( 'group-context', $parent->name ?? null );
		$context['canvas-test/context'] = 'Inherited group context';
	}
	if ( 'canvas-test/native-filter' === $parsed['blockName'] ) {
		$filter_events[] = array( 'context', $parent->name ?? null );
		$context['canvas-test/context'] = $context['canvas-test/context'] ?? 'Native filtered context';
	}
	return $context;
};
add_filter( 'pre_render_block', $filter_pre, 10, 3 );
add_filter( 'render_block_data', $filter_data, 10, 3 );
add_filter( 'render_block_context', $filter_context, 10, 3 );
try {
	$filter_fixture = canvas_flow_block( 'tabor/canvas', array(), array( canvas_flow_block( 'canvas-test/native-filter', array( 'marker' => 'original' ) ) ) );
	$filter_html = do_blocks( serialize_block( $filter_fixture ) );
	canvas_flow_check( str_contains( $filter_html, 'Native filtered data:Native filtered context' ), 'Canvas children must receive native data and context filters before rendering.' );
	canvas_flow_check( 1 === $filter_render_count && array( array( 'pre', 'tabor/canvas' ), array( 'data', 'tabor/canvas' ), array( 'context', 'tabor/canvas' ) ) === $filter_events, 'Canvas must run each native child filter once, in order, with the actual parent.' );
	$filter_events = array();
	$filter_fixture['innerBlocks'][0]['attrs']['marker'] = 'override';
	$filter_html = do_blocks( serialize_block( $filter_fixture ) );
	canvas_flow_check( str_contains( $filter_html, 'Native pre-render override.' ) && 1 === $filter_render_count, 'Canvas must honor a native pre-render override without invoking the render callback.' );
	canvas_flow_check( array( array( 'pre', 'tabor/canvas' ) ) === $filter_events, 'Native pre-render overrides must skip subsequent data and context filters.' );
	$filter_events = array();
	$filter_fixture['innerBlocks'][0]['attrs']['marker'] = 'empty-override';
	$filter_html = do_blocks( serialize_block( $filter_fixture ) );
	canvas_flow_check( 1 === $filter_render_count && ! str_contains( $filter_html, '<p>' ) && array( array( 'pre', 'tabor/canvas' ) ) === $filter_events, 'An empty-string pre-render override must suppress the child callback and subsequent filters.' );
	$filter_events = array();
	$filter_fixture['innerBlocks'][0]['attrs']['marker'] = 'original';
	$filter_group = canvas_flow_block( 'core/group', array( 'canvas' => array( 'group' => 1 ) ), array( $filter_fixture ) );
	$filter_group['innerHTML'] = '<div class="wp-block-group"></div>';
	$filter_group['innerContent'] = array( '<div class="wp-block-group">', null, '</div>' );
	$filter_html = do_blocks( serialize_block( canvas_flow_block( 'tabor/canvas', array(), array( $filter_group ) ) ) );
	canvas_flow_check( 2 === $filter_render_count && 1 === substr_count( $filter_html, 'Native filtered data:Inherited group context' ), 'Filtered marked-group context must reach nested Canvas content exactly once.' );
	canvas_flow_check( 1 === substr_count( $filter_html, 'data-canvas-group=""' ) && 1 === substr_count( $filter_html, 'data-canvas-name="tabor/canvas"' ) && 1 === substr_count( $filter_html, 'data-canvas-name="canvas-test/native-filter"' ), 'Refreshing marked-group context must preserve each nested placement wrapper exactly once.' );
	canvas_flow_check( array( array( 'group-context', 'tabor/canvas' ), array( 'pre', 'tabor/canvas' ), array( 'data', 'tabor/canvas' ), array( 'context', 'tabor/canvas' ) ) === $filter_events, 'Marked-group context refresh must not duplicate native child filter calls.' );
} finally {
	remove_filter( 'pre_render_block', $filter_pre, 10 );
	remove_filter( 'render_block_data', $filter_data, 10 );
	remove_filter( 'render_block_context', $filter_context, 10 );
	unregister_block_type( 'canvas-test/native-filter' );
}

$excerpt_content = '<!-- wp:tabor/canvas --><!-- wp:paragraph --><p>Readable Canvas summary.</p><!-- /wp:paragraph --><!-- wp:tabor/canvas --><!-- wp:paragraph --><p>Nested summary.</p><!-- /wp:paragraph --><!-- /wp:tabor/canvas --><!-- wp:post-excerpt /--><!-- wp:query --><div class="wp-block-query"><!-- wp:paragraph --><p>Loop text must not enter the summary.</p><!-- /wp:paragraph --></div><!-- /wp:query --><!-- /wp:tabor/canvas -->';
$excerpt = excerpt_remove_blocks( $excerpt_content );
canvas_flow_check( str_contains( $excerpt, 'Readable Canvas summary.' ) && str_contains( $excerpt, 'Nested summary.' ), 'Native excerpts must include nested Canvas text.' );
canvas_flow_check( ! str_contains( $excerpt, 'Loop text' ) && ! str_contains( $excerpt, 'canvas__' ), 'Excerpt extraction must skip dynamic loops and Canvas layout markup.' );
$manual_excerpt_post = new WP_Post( (object) array( 'ID' => 0, 'filter' => 'raw', 'post_content' => $excerpt_content, 'post_excerpt' => 'Manual editorial summary.', 'post_password' => '', 'post_status' => 'publish', 'post_type' => 'post' ) );
canvas_flow_check( 'Manual editorial summary.' === get_the_excerpt( $manual_excerpt_post ), 'Manual excerpts must remain unchanged.' );

$seed      = '1' === getenv( 'CANVAS_NATIVE_FLOW_SEED' );
$placement = array( 'canvas' => array( 'desktop' => array( 'column' => 1, 'columnSpan' => 24, 'row' => 1, 'rowSpan' => 2 ) ) );
if ( $seed ) {
	foreach ( array( 'First', 'Second' ) as $label ) {
		$slug = strtolower( $label ) . '-native-canvas-story';
		$existing = get_page_by_path( $slug, OBJECT, 'post' );
		$paragraph = canvas_flow_block( 'core/paragraph', $placement );
		$paragraph['innerHTML']    = '<p>' . str_repeat( esc_html( $label . ' native flowing article content. ' ), 20 ) . '</p>';
		$paragraph['innerContent'] = array( $paragraph['innerHTML'] );
		$body = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 2 ), array( $paragraph ) );
		$id   = wp_insert_post( array(
			'ID'           => $existing ? $existing->ID : 0,
			'post_type'    => 'post',
			'post_status'  => 'publish',
			'post_title'   => $label . ' Native Canvas Story',
			'post_name'    => $slug,
			'post_content' => serialize_block( $body ),
			'post_excerpt' => $label . ' native excerpt for repeated post context.',
		), true );
		canvas_flow_check( ! is_wp_error( $id ), 'Could not seed native story.' );
		$seeded_ids[] = $id;
	}
}
$query     = array( 'postType' => 'post', 'perPage' => 2, 'order' => 'desc', 'orderBy' => 'date', 'inherit' => false );
$posts     = get_posts( array( 'post_type' => 'post', 'numberposts' => 2, 'orderby' => 'date', 'order' => 'DESC' ) );
canvas_flow_check( 2 === count( $posts ), 'Seed two published posts before running this check.' );

$card = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 4 ), array(
	canvas_flow_block( 'core/post-title', array_merge( $placement, array( 'isLink' => true ) ) ),
	canvas_flow_block( 'core/post-excerpt', array_merge( $placement, array( 'canvas' => array( 'desktop' => array( 'row' => 3, 'rowSpan' => 2 ) ) ) ) ),
) );
$root = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 4 ), array(
	canvas_flow_block( 'core/query', array_merge( $placement, array( 'queryId' => 937, 'query' => $query ) ), array(
		canvas_flow_block( 'core/post-template', array(), array( $card ) ),
	) ),
) );
$root['innerBlocks'][0]['innerContent'] = array( '<div class="wp-block-query">', null, '</div>' );
$root['innerBlocks'][0]['innerHTML'] = '<div class="wp-block-query"></div>';
$html = do_blocks( serialize_block( $root ) );
canvas_flow_check( 3 === substr_count( $html, 'data-canvas-desktop-minimum=' ), 'Query should render one outer Canvas and two native card Canvases.' );
foreach ( $posts as $post ) {
	canvas_flow_check( str_contains( $html, esc_html( get_the_title( $post ) ) ), 'Repeated card lost its post title context.' );
	canvas_flow_check( str_contains( $html, esc_url( get_permalink( $post ) ) ), 'Repeated card lost its native post permalink.' );
}

if ( $seed ) {
	$existing = get_page_by_path( 'native-canvas-query', OBJECT, 'page' );
	$page_id = wp_insert_post( array(
		'ID'           => $existing ? $existing->ID : 0,
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_title'   => 'Native Canvas Query',
		'post_name'    => 'native-canvas-query',
		'post_content' => serialize_block( $root ),
	), true );
	canvas_flow_check( ! is_wp_error( $page_id ), 'Could not seed native query page.' );
	$routes = array( array( 'name' => 'Native Query cards', 'url' => get_permalink( $page_id ), 'editor_url' => admin_url( 'post.php?post=' . $page_id . '&action=edit' ) ) );
	foreach ( $seeded_ids as $id ) {
		$routes[] = array( 'name' => get_the_title( $id ), 'url' => get_permalink( $id ), 'editor_url' => admin_url( 'post.php?post=' . $id . '&action=edit' ) );
	}
	$report = array( 'passed' => true, 'routes' => $routes, 'posts' => $seeded_ids, 'stress_url' => get_permalink( $seeded_ids[0] ) );
}

$content = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 2 ), array(
	canvas_flow_block( 'core/post-content', $placement ),
) );
if ( $seed ) {
	$sentinel = canvas_flow_block( 'core/paragraph', array( 'canvas' => array( 'desktop' => array( 'row' => 4, 'rowSpan' => 2, 'column' => 1, 'columnSpan' => 24 ) ) ) );
	$sentinel['innerHTML'] = '<p>Native flow following sentinel.</p>';
	$sentinel['innerContent'] = array( $sentinel['innerHTML'] );
	$content['innerBlocks'][] = $sentinel;
	$content['innerContent'][] = null;
	$templates = get_block_templates( array( 'slug__in' => array( 'single' ) ), 'wp_template' );
	$template_id = wp_insert_post( array(
		'ID' => $templates && ! empty( $templates[0]->wp_id ) ? $templates[0]->wp_id : 0,
		'post_type' => 'wp_template', 'post_status' => 'publish', 'post_name' => 'single',
		'post_title' => 'Native Canvas Single', 'post_content' => serialize_block( $content ),
	), true );
	canvas_flow_check( ! is_wp_error( $template_id ), 'Could not seed Canvas Single template.' );
	wp_set_object_terms( $template_id, get_stylesheet(), 'wp_theme' );
	$report['editors'] = array( array( 'name' => 'Canvas Single template', 'url' => admin_url( 'site-editor.php?postType=wp_template&postId=' . rawurlencode( get_stylesheet() . '//single' ) . '&canvas=edit' ) ) );
}
$block = new WP_Block( $content, array( 'postId' => $posts[0]->ID, 'postType' => 'post' ) );
$html  = $block->render();
canvas_flow_check( str_contains( $html, 'wp-block-post-content' ), 'Native Post Content did not render within Canvas.' );
canvas_flow_check( str_contains( $html, 'data-canvas-name="core/post-content"' ), 'Post Content lost its measured native placement wrapper.' );
if ( $seed ) {
	$report['navigation_routes'] = array();
	$fit_blocks = array();
	foreach ( array( 'AFTERIMAGE', 'Make something remarkable', 'LOOK<br>AGAIN' ) as $index => $label ) {
		$heading = canvas_flow_block( 'core/heading', array( 'fitText' => true, 'className' => 'canvas-native-fit-' . $index, 'canvas' => array( 'desktop' => array( 'column' => 1, 'columnSpan' => 24, 'row' => 1, 'rowSpan' => 2 ) ) ) );
		$heading['innerHTML'] = '<h2 class="wp-block-heading has-fit-text canvas-native-fit-' . $index . '">' . $label . '</h2>';
		$heading['innerContent'] = array( $heading['innerHTML'] );
		$fit_blocks[] = serialize_block( canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 2 ), array( $heading ) ) );
	}
	$existing = get_page_by_path( 'native-canvas-fit-text', OBJECT, 'page' );
	$fit_id = wp_insert_post( array( 'ID' => $existing ? $existing->ID : 0, 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Native Canvas Fit Text', 'post_name' => 'native-canvas-fit-text', 'post_content' => implode( '', $fit_blocks ) ), true );
	canvas_flow_check( ! is_wp_error( $fit_id ), 'Could not seed native Fit Text fixture.' );
	$report['fit_text_url'] = get_permalink( $fit_id );
	$report['editors'][] = array( 'name' => 'Native Canvas Fit Text', 'url' => admin_url( 'post.php?post=' . $fit_id . '&action=edit' ) );
	foreach ( array( false, true ) as $nested ) {
		$slug = $nested ? 'native-canvas-navigation-nested' : 'native-canvas-navigation-direct';
		$nav_placement = array( 'desktop' => array( 'column' => 1, 'columnSpan' => 24, 'row' => 1, 'rowSpan' => 2 ), 'mobile' => array( 'column' => 1, 'columnSpan' => 12, 'row' => 1, 'rowSpan' => 2 ) );
		if ( $nested ) {
			$nav_placement['desktop']['rotation'] = 13;
			$nav_placement['mobile']['rotation'] = 13;
		}
		$navigation = canvas_flow_block( 'core/navigation', array( 'className' => 'canvas-flow-navigation', 'overlayMenu' => 'mobile', 'canvas' => $nav_placement ), array(
			canvas_flow_block( 'core/navigation-link', array( 'label' => 'Native Canvas destination', 'url' => get_permalink( $page_id ), 'kind' => 'custom' ) ),
		) );
		$header = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 4, 'mobileRows' => 4 ), array( $navigation ) );
		if ( $nested ) {
			$header['attrs']['canvas'] = array( 'desktop' => array( 'column' => 2, 'columnSpan' => 20, 'row' => 1, 'rowSpan' => 4, 'rotation' => 17 ), 'mobile' => array( 'column' => 2, 'columnSpan' => 10, 'row' => 1, 'rowSpan' => 4, 'rotation' => 17 ) );
			$header = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 6, 'mobileRows' => 6 ), array( $header ) );
		}
		$following = canvas_flow_block( 'core/paragraph', $placement );
		$following['innerHTML'] = '<p>Following Canvas section must stay behind the native menu.</p>';
		$following['innerContent'] = array( $following['innerHTML'] );
		$section = canvas_flow_block( 'tabor/canvas', array( 'align' => 'full', 'desktopRows' => 12, 'mobileRows' => 12, 'style' => array( 'color' => array( 'background' => '#ffdd00' ) ) ), array( $following ) );
		$existing = get_page_by_path( $slug, OBJECT, 'page' );
		$nav_id = wp_insert_post( array( 'ID' => $existing ? $existing->ID : 0, 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $nested ? 'Nested rotated Canvas navigation' : 'Direct Canvas navigation', 'post_name' => $slug, 'post_content' => serialize_block( $header ) . serialize_block( $section ) ), true );
		canvas_flow_check( ! is_wp_error( $nav_id ), 'Could not seed native navigation fixture.' );
		$report['navigation_routes'][] = array( 'name' => get_the_title( $nav_id ), 'url' => get_permalink( $nav_id ), 'nested' => $nested );
		$report['editors'][] = array( 'name' => get_the_title( $nav_id ), 'url' => admin_url( 'post.php?post=' . $nav_id . '&action=edit' ) );
	}
	file_put_contents( '/wordpress/canvas-native-flow.json', wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
}
echo "Native flow integration: nested Query post context and Post Content passed.\n";

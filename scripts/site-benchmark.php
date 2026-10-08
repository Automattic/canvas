<?php
/** Isolated, repeatable whole-site fixture for the Playground benchmark. */
require '/wordpress/wp-load.php';

function canvas_benchmark_check( $condition, $message ) {
	if ( ! $condition ) {
		throw new Exception( $message );
	}
}

function canvas_benchmark_save( $type, $slug, $title, $content ) {
	$existing = get_page_by_path( $slug, OBJECT, $type );
	$id = wp_insert_post( array(
		'ID'           => $existing ? $existing->ID : 0,
		'post_type'    => $type,
		'post_name'    => $slug,
		'post_title'   => $title,
		'post_content' => $content,
		'post_status'  => 'publish',
		'post_author'  => 1,
	), true );
	canvas_benchmark_check( ! is_wp_error( $id ), 'Could not save ' . $slug );
	if ( in_array( $type, array( 'wp_template', 'wp_template_part' ), true ) ) {
		wp_set_object_terms( $id, get_stylesheet(), 'wp_theme' );
	}
	return $id;
}

function canvas_benchmark_placement( $desktop, $mobile ) {
	$keys = array( 'column', 'row', 'columnSpan', 'rowSpan' );
	return array( 'canvas' => array(
		'desktop' => array_merge( array( 'gridColumns' => 24 ), array_combine( $keys, $desktop ) ),
		'mobile'  => array_merge( array( 'gridColumns' => 12 ), array_combine( $keys, $mobile ) ),
	) );
}

function canvas_benchmark_dynamic( $name, $attrs, $desktop, $mobile ) {
	return '<!-- wp:' . $name . ' ' . wp_json_encode( array_merge( $attrs, canvas_benchmark_placement( $desktop, $mobile ) ) ) . ' /-->';
}

function canvas_benchmark_canvas( $content, $rows = 8 ) {
	return '<!-- wp:tabor/canvas ' . wp_json_encode( array( 'align' => 'full', 'desktopRows' => $rows, 'mobileRows' => $rows + 4 ) ) . ' -->' . $content . '<!-- /wp:tabor/canvas -->';
}

function canvas_benchmark_frame( $content ) {
	$theme = wp_json_encode( get_stylesheet() );
	return '<!-- wp:template-part {"slug":"canvas-benchmark-header","theme":' . $theme . ',"tagName":"header"} /-->' .
		'<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} --><main class="wp-block-group">' . $content . '</main><!-- /wp:group -->' .
		'<!-- wp:template-part {"slug":"canvas-benchmark-footer","theme":' . $theme . ',"tagName":"footer"} /-->';
}

function canvas_benchmark_section( $heading, $copy ) {
	return '<!-- wp:heading --><h2 class="wp-block-heading">' . esc_html( $heading ) . '</h2><!-- /wp:heading -->' .
		'<!-- wp:paragraph --><p>' . esc_html( $copy ) . '</p><!-- /wp:paragraph -->';
}

$report = array( 'passed' => false );
try {
	$profile = defined( 'CANVAS_BENCHMARK_PROFILE' ) ? CANVAS_BENCHMARK_PROFILE : 'service';
	canvas_benchmark_check( WP_Block_Type_Registry::get_instance()->is_registered( 'tabor/canvas' ), 'Canvas must be active and built.' );
	canvas_benchmark_check( wp_is_block_theme(), 'The benchmark needs a block theme.' );
	update_option( 'blogname', 'Field Notes Studio' );
	update_option( 'blogdescription', 'Independent gardens, thoughtful places.' );
	$styles_id = WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
	wp_set_object_terms( $styles_id, get_stylesheet(), 'wp_theme' );
	$styles = array( 'version' => 3, 'isGlobalStylesUserThemeJSON' => true, 'styles' => array(
		'color' => array( 'background' => '#ffffff', 'text' => '#172d28' ),
		'typography' => array( 'fontFamily' => 'var:preset|font-family|manrope', 'fontSize' => '18px', 'lineHeight' => '1.6' ),
		'spacing' => array( 'blockGap' => '32px' ),
	) );
	wp_update_post( array( 'ID' => $styles_id, 'post_status' => 'publish', 'post_content' => wp_slash( wp_json_encode( $styles ) ) ) );
	WP_Theme_JSON_Resolver::clean_cached_data();
	canvas_benchmark_check( '18px' === wp_get_global_styles( array( 'typography', 'fontSize' ) ), 'Global typography did not apply.' );
	$styles['styles']['typography']['fontSize'] = '22px';
	$styles['styles']['spacing']['blockGap'] = '48px';
	wp_update_post( array( 'ID' => $styles_id, 'post_content' => wp_json_encode( $styles ) ) );
	WP_Theme_JSON_Resolver::clean_cached_data();
	canvas_benchmark_check( '22px' === wp_get_global_styles( array( 'typography', 'fontSize' ) ) && '48px' === wp_get_global_styles( array( 'spacing', 'blockGap' ) ), 'Global typography and spacing mutation did not propagate.' );
	$styles['styles']['typography']['fontSize'] = '18px';
	$styles['styles']['spacing']['blockGap'] = '32px';
	wp_update_post( array( 'ID' => $styles_id, 'post_content' => wp_json_encode( $styles ) ) );
	WP_Theme_JSON_Resolver::clean_cached_data();
	$about = canvas_benchmark_save( 'page', 'studio', 'Our studio', '<!-- wp:paragraph --><p>We design gardens for everyday life, from a small courtyard to a public landscape.</p><!-- /wp:paragraph -->' );
	$home = canvas_benchmark_save( 'page', 'home', 'Gardens for everyday life', '<!-- wp:paragraph --><p>Good gardens make room for people, changing seasons, and unexpected discoveries.</p><!-- /wp:paragraph -->' );
	update_option( 'show_on_front', 'page' );
	update_option( 'page_on_front', $home );
	$navigation = '<!-- wp:navigation-link ' . wp_json_encode( array( 'label' => 'Studio', 'type' => 'page', 'id' => $about, 'url' => get_permalink( $about ), 'kind' => 'post-type' ) ) . ' /-->';
	$header = canvas_benchmark_canvas(
		canvas_benchmark_dynamic( 'site-title', array( 'level' => 0 ), array( 2, 2, 10, 2 ), array( 1, 1, 12, 2 ) ) .
		'<!-- wp:navigation ' . wp_json_encode( array_merge( array( 'overlayMenu' => 'mobile' ), canvas_benchmark_placement( array( 15, 2, 8, 2 ), array( 1, 4, 12, 2 ) ) ) ) . ' -->' . $navigation . '<!-- /wp:navigation -->', 5
	);
	$footer = canvas_benchmark_canvas( canvas_benchmark_dynamic( 'site-title', array( 'level' => 0 ), array( 2, 2, 20, 2 ), array( 1, 1, 12, 2 ) ), 4 );
	$parts = array(
		'header' => canvas_benchmark_save( 'wp_template_part', 'canvas-benchmark-header', 'Field Notes header', $header ),
		'footer' => canvas_benchmark_save( 'wp_template_part', 'canvas-benchmark-footer', 'Field Notes footer', $footer ),
	);
	foreach ( $parts as $area => $id ) {
		wp_set_object_terms( $id, $area, 'wp_template_part_area' );
	}
	$title = canvas_benchmark_canvas( canvas_benchmark_dynamic( 'post-title', array( 'level' => 1 ), array( 2, 2, 20, 4 ), array( 1, 1, 12, 6 ) ), 8 );
	$hero = canvas_benchmark_canvas(
		canvas_benchmark_dynamic( 'post-title', array( 'level' => 1 ), array( 2, 2, 10, 7 ), array( 1, 1, 12, 6 ) ) .
		canvas_benchmark_dynamic( 'post-featured-image', array( 'aspectRatio' => '4/3' ), array( 13, 2, 10, 8 ), array( 1, 8, 12, 6 ) ), 14
	);
	$flow = '<!-- wp:post-content {"layout":{"type":"constrained"}} /-->';
	$query = '<!-- wp:query {"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","inherit":true}} -->' .
		'<!-- wp:post-template --><!-- wp:post-title {"isLink":true,"level":2} /--><!-- wp:post-excerpt /--><!-- /wp:post-template -->' .
		'<!-- wp:query-pagination --><!-- wp:query-pagination-previous /--><!-- wp:query-pagination-numbers /--><!-- wp:query-pagination-next /--><!-- /wp:query-pagination -->' .
		'<!-- wp:query-no-results --><!-- wp:paragraph --><p>No field notes found.</p><!-- /wp:paragraph --><!-- /wp:query-no-results --><!-- /wp:query -->';
	$templates = array(
		'front-page' => $hero . $flow,
		'page'       => $title . $flow,
		'single'     => $hero . $flow,
		'archive'    => '<!-- wp:query-title {"type":"archive"} /-->' . $query,
		'index'      => $query,
		'search'     => '<!-- wp:query-title {"type":"search"} /--><!-- wp:search {"label":"Search field notes","buttonText":"Search"} /-->' . $query,
		'404'        => '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">This path ends here.</h1><!-- /wp:heading --><!-- wp:search {"label":"Find another path","buttonText":"Search"} /-->',
	);
	$editors = array();
	foreach ( $templates as $slug => $content ) {
		canvas_benchmark_save( 'wp_template', $slug, 'Field Notes ' . $slug, canvas_benchmark_frame( $content ) );
		$template = get_block_template( get_stylesheet() . '//' . $slug, 'wp_template' );
		canvas_benchmark_check( $template && 'custom' === $template->source, 'Template override did not resolve: ' . $slug );
		canvas_benchmark_check( 2 === substr_count( $template->content, 'wp:template-part' ), 'Shared parts missing: ' . $slug );
		canvas_benchmark_check( serialize_blocks( parse_blocks( $template->content ) ) === $template->content, 'Template failed serialization roundtrip: ' . $slug );
		$editors[] = array( 'name' => 'template-' . $slug, 'url' => admin_url( 'site-editor.php?postType=wp_template&postId=' . rawurlencode( get_stylesheet() . '//' . $slug ) . '&canvas=edit' ) );
	}
	foreach ( $parts as $area => $part_id ) {
		$editors[] = array( 'name' => 'part-' . $area, 'url' => admin_url( 'site-editor.php?postType=wp_template_part&postId=' . rawurlencode( get_stylesheet() . '//canvas-benchmark-' . $area ) . '&canvas=edit' ) );
	}
	$posts = array();
	foreach ( array( 'A courtyard in spring', 'When the garden outgrows the drawing', 'A very long field note title about making space for changing seasons and the people who care for a garden', 'Planting for a dry summer' ) as $index => $post_title ) {
		$body = str_repeat( '<!-- wp:paragraph --><p>We returned to the garden after the rain. New shoots appeared beside the path, and the planting had begun to soften the edges of the space.</p><!-- /wp:paragraph -->', 1 + $index * 4 );
		$posts[] = canvas_benchmark_save( 'post', 'canvas-field-note-' . $index, $post_title, $body );
	}
	$media = get_page_by_path( 'canvas-benchmark-garden', OBJECT, 'attachment' );
	if ( ! $media ) {
		$image_path = get_theme_root() . '/twentytwentyfive/assets/images/dallas-creek-square.webp';
		canvas_benchmark_check( is_readable( $image_path ), 'The benchmark needs the bundled Twenty Twenty-Five garden image.' );
		$upload = wp_upload_bits( 'canvas-benchmark-garden.webp', null, file_get_contents( $image_path ) );
		canvas_benchmark_check( empty( $upload['error'] ), 'Could not upload fixture image.' );
		$media_id = wp_insert_attachment( array( 'post_name' => 'canvas-benchmark-garden', 'post_title' => 'Garden wildflowers', 'post_mime_type' => 'image/webp', 'post_status' => 'inherit' ), $upload['file'], 0, true );
		canvas_benchmark_check( ! is_wp_error( $media_id ), 'Could not register fixture image.' );
		require_once ABSPATH . 'wp-admin/includes/image.php';
		wp_update_attachment_metadata( $media_id, wp_generate_attachment_metadata( $media_id, $upload['file'] ) );
		update_post_meta( $media_id, '_wp_attachment_image_alt', 'Wildflowers growing beside a garden path' );
	} else {
		$media_id = $media->ID;
	}
	foreach ( array_merge( array( $home ), array_slice( $posts, 0, 3 ) ) as $post_id ) {
		set_post_thumbnail( $post_id, $media_id );
	}
	$homepage_content = array(
		'service' => canvas_benchmark_section( 'A garden that feels like yours', 'We start by listening: how you live, what you love, and what your outdoor space could become.' ) .
			canvas_benchmark_section( 'Design, planting, and care', 'A clear plan, carefully chosen plants, and practical support through the first seasons. Our projects range from courtyard renovations to complete landscape designs.' ) .
			canvas_benchmark_section( 'From first conversation to first spring', 'Visit the studio, walk your site with us, and review a proposal grounded in your budget and timeline.' ) .
			canvas_benchmark_section( 'Start a conversation', 'Tell us about your space, your ideas, and when you would like to begin.' ),
		'editorial' => canvas_benchmark_section( 'Observations from the growing world', 'Essays, field reports, and conversations about the places we share with plants.' ) .
			str_replace( '"inherit":true', '"inherit":false', $query ) .
			canvas_benchmark_section( 'The seasonal letter', 'Every month we gather practical discoveries and new voices from the garden. Read slowly, and come back when the season changes.' ),
		'portfolio' => canvas_benchmark_section( 'Selected landscapes', 'Small interventions and generous outdoor rooms, made with the people who use them.' ) .
			'<!-- wp:image {"id":' . $media_id . ',"sizeSlug":"full","linkDestination":"none"} --><figure class="wp-block-image size-full"><img src="' . esc_url( wp_get_attachment_url( $media_id ) ) . '" alt="Wildflowers beside a garden path" class="wp-image-' . $media_id . '"/></figure><!-- /wp:image -->' .
			canvas_benchmark_section( 'The courtyard project', 'A sheltered city garden with seasonal planting and a quiet place to sit.' ) .
			canvas_benchmark_section( 'A shared green', 'A landscape designed for neighbors to meet, children to explore, and local planting to thrive.' ) .
			canvas_benchmark_section( 'Working together', 'We collaborate with homeowners, architects, and community groups from the first sketch through the last planting day.' ),
	);
	wp_update_post( array( 'ID' => $home, 'post_title' => array( 'service' => 'Gardens for everyday life', 'editorial' => 'Field notes from a changing landscape', 'portfolio' => 'Places to grow together' )[ $profile ], 'post_content' => $homepage_content[ $profile ] ) );
	$previous_post = $GLOBALS['post'] ?? null;
	$GLOBALS['post'] = get_post( $posts[2] );
	setup_postdata( $GLOBALS['post'] );
	$rendered_hero = do_blocks( $hero );
	canvas_benchmark_check( str_contains( $rendered_hero, 'A very long field note title' ), 'Post title did not inherit template context.' );
	canvas_benchmark_check( str_contains( $rendered_hero, 'canvas-benchmark-garden' ), 'Featured image did not inherit template context.' );
	$GLOBALS['post'] = get_post( $posts[3] );
	setup_postdata( $GLOBALS['post'] );
	canvas_benchmark_check( ! str_contains( do_blocks( $hero ), '<img' ), 'Missing featured image rendered stale media.' );
	$GLOBALS['post'] = $previous_post;
	wp_reset_postdata();
	$rendered_header = do_blocks( $header );
	canvas_benchmark_check( str_contains( $rendered_header, 'Field Notes Studio' ), 'Dynamic site title did not render.' );
	canvas_benchmark_check( str_contains( $rendered_header, 'Studio' ), 'Navigation did not render.' );
	update_option( 'blogname', 'Field Notes Studio and Landscape Research Collective' );
	canvas_benchmark_check( str_contains( do_blocks( $header ), 'Landscape Research Collective' ), 'Shared header did not reflect changed site data.' );
	update_option( 'blogname', 'Field Notes Studio' );
	$expanded_header = str_replace( '<!-- /wp:navigation -->', '<!-- wp:navigation-link {"label":"Community projects and seasonal workshops","url":"#workshops","kind":"custom"} /--><!-- /wp:navigation -->', $header );
	wp_update_post( array( 'ID' => $parts['header'], 'post_content' => wp_slash( $expanded_header ) ) );
	canvas_benchmark_check( str_contains( do_blocks( canvas_benchmark_frame( '' ) ), 'Community projects and seasonal workshops' ), 'Template-part navigation edit did not propagate.' );
	wp_update_post( array( 'ID' => $parts['header'], 'post_content' => wp_slash( $header ) ) );
	$report = array(
		'passed'    => true,
		'profile'   => $profile,
		'assertions' => array( 'custom template resolution', 'shared template-part references', 'native block serialization roundtrip', 'dynamic site title and navigation rendering', 'post context for titles and featured images', 'missing featured image', 'global typography and spacing mutations', 'shared site-title and navigation edits' ),
		'templates' => array_keys( $templates ),
		'parts'     => $parts,
		'posts'     => $posts,
		'editors'   => $editors,
		'routes'    => array(
			array( 'name' => 'home', 'url' => home_url( '/' ), 'editor_url' => admin_url( 'post.php?post=' . $home . '&action=edit' ) ),
			array( 'name' => 'page', 'url' => get_permalink( $about ), 'editor_url' => admin_url( 'post.php?post=' . $about . '&action=edit' ) ),
			array( 'name' => 'single-short', 'url' => get_permalink( $posts[0] ) ),
			array( 'name' => 'single-long', 'url' => get_permalink( $posts[2] ) ),
			array( 'name' => 'single-no-image', 'url' => get_permalink( $posts[3] ) ),
			array( 'name' => 'archive', 'url' => home_url( '/?cat=1' ) ),
			array( 'name' => 'search', 'url' => home_url( '/?s=garden' ) ),
			array( 'name' => 'search-empty', 'url' => home_url( '/?s=no-matching-field-note' ) ),
			array( 'name' => '404', 'url' => home_url( '/canvas-missing-path/' ) ),
		),
		'stress'    => array( 'Compare the shortest and longest post at 375, 768, and 1440px.', 'Rename the site and add navigation links in the shared header.', 'Change global typography and verify every template.', 'Replace a featured image; verify its crop and missing-image state.', 'Publish more posts and follow archive/search pagination.', 'Edit, undo, save, reload each template and shared part.' ),
	);
} catch ( Throwable $error ) {
	$report['error'] = $error->getMessage();
}
file_put_contents( '/wordpress/canvas-site-benchmark.json', wp_json_encode( $report, JSON_PRETTY_PRINT ) );
canvas_benchmark_check( $report['passed'], $report['error'] ?? 'Benchmark failed.' );

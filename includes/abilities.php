<?php
/**
 * Canvas authoring operations shared by REST, MCP, and Playground.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Abilities;

defined( 'ABSPATH' ) || exit;

const VERSION = 1;
const BLOCKS  = array(
	'tabor/canvas',
	'core/group',
	'core/heading',
	'core/paragraph',
	'core/image',
	'core/video',
	'core/buttons',
	'core/button',
	'core/site-logo',
	'core/site-title',
	'core/navigation',
	'core/navigation-link',
	'core/navigation-submenu',
	'core/home-link',
	'core/page-list',
	'core/post-title',
	'core/post-featured-image',
	'core/post-excerpt',
	'core/post-content',
	'core/post-date',
	'core/post-terms',
	'core/post-author',
	'core/post-author-name',
	'core/post-author-biography',
	'core/query-title',
	'core/term-description',
	'core/query',
	'core/post-template',
	'core/query-no-results',
	'core/query-pagination',
	'core/query-pagination-previous',
	'core/query-pagination-numbers',
	'core/query-pagination-next',
	'core/search',
	'core/template-part',
	'core/comments',
	'core/post-comments-form',
	'core/comments-title',
	'core/comment-template',
	'core/comment-content',
	'core/comment-author-name',
	'core/comment-date',
	'core/comment-reply-link',
	'core/comment-edit-link',
	'core/avatar',
	'core/comments-pagination',
	'core/comments-pagination-previous',
	'core/comments-pagination-numbers',
	'core/comments-pagination-next',
	'core/accordion',
	'core/accordion-item',
	'core/accordion-heading',
	'core/accordion-panel',
	'core/archives',
	'core/audio',
	'core/breadcrumbs',
	'core/calendar',
	'core/categories',
	'core/code',
	'core/columns',
	'core/column',
	'core/cover',
	'core/details',
	'core/embed',
	'core/file',
	'core/footnotes',
	'core/freeform',
	'core/gallery',
	'core/html',
	'core/icon',
	'core/latest-comments',
	'core/latest-posts',
	'core/list',
	'core/list-item',
	'core/loginout',
	'core/math',
	'core/media-text',
	'core/navigation-overlay-close',
	'core/playlist',
	'core/playlist-track',
	'core/post-comments-count',
	'core/post-comments-link',
	'core/post-navigation-link',
	'core/post-time-to-read',
	'core/preformatted',
	'core/pullquote',
	'core/query-total',
	'core/quote',
	'core/read-more',
	'core/rss',
	'core/separator',
	'core/site-tagline',
	'core/social-links',
	'core/social-link',
	'core/spacer',
	'core/table',
	'core/tabs',
	'core/tab-list',
	'core/tab-panels',
	'core/tab-panel',
	'core/tag-cloud',
	'core/term-count',
	'core/term-name',
	'core/term-template',
	'core/terms-query',
	'core/verse',
	'core/widget-group',
);

/**
 * Create a structured authoring error with an HTTP status.
 *
 * @param string $message Error message.
 * @param string $code Error identifier.
 * @param int    $status HTTP status.
 * @return \WP_Error Authoring error.
 */
function failure( $message, $code = 'canvas_invalid', $status = 400 ) {
	return new \WP_Error( $code, $message, array( 'status' => $status ) );
}
/**
 * Build a closed object schema for ability inputs.
 *
 * @param array $properties Property schemas.
 * @param array $required Required property names.
 * @return array Input schema.
 */
function schema( $properties, $required = array() ) {
	return array(
		'type'                 => 'object',
		'properties'           => $properties,
		'required'             => $required,
		'additionalProperties' => false,
		'default'              => array(),
	);
}
/**
 * Register Canvas authoring abilities when the API is available.
 *
 * @return void
 */
function register() {
	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}
	$id          = array(
		'type'        => 'integer',
		'minimum'     => 1,
		'description' => 'WordPress page ID.',
	);
	$markup      = array(
		'type'        => 'string',
		'minLength'   => 1,
		'maxLength'   => 500000,
		'description' => 'Native serialized Gutenberg markup; every root block must be tabor/canvas. Read canvas/get-context first.',
	);
	$path        = array(
		'type'        => 'array',
		'items'       => array(
			'type'    => 'integer',
			'minimum' => 0,
		),
		'minItems'    => 1,
		'maxItems'    => 20,
		'description' => 'Block path returned by canvas/get-sections, relative to the page root.',
	);
	$fingerprint = array(
		'type'        => 'string',
		'pattern'     => '^[a-f0-9]{64}$',
		'description' => 'Current content fingerprint from canvas/get-sections. Reread after every write.',
	);
	$specs       = array(
		'get-context'       => array( 'Read Canvas authoring instructions and site styles before composing sections.', schema( array( 'page_id' => $id ) ) ),
		'get-sections'      => array( 'Read saved Canvas sections, page structure, and fingerprint. Does not include unsaved editor changes.', schema( array( 'page_id' => $id ), array( 'page_id' ) ) ),
		'validate-sections' => array( 'Validate Canvas markup without saving. Browser review is still needed to verify layout and Gutenberg validity.', schema( array( 'markup' => $markup ), array( 'markup' ) ) ),
		'create-page'       => array(
			'Create a page of Canvas sections. Publishes immediately by default; use draft only when requested. Read canvas/get-context first.',
			schema(
				array(
					'title'  => array(
						'type'      => 'string',
						'minLength' => 1,
						'maxLength' => 200,
					),
					'markup' => $markup,
					'status' => array(
						'type'    => 'string',
						'enum'    => array( 'publish', 'draft' ),
						'default' => 'publish',
					),
				),
				array( 'title', 'markup' )
			),
		),
		'insert-sections'   => array(
			'Insert Canvas sections into a saved page. Published pages change live immediately. Preserves other blocks and status; rejects stale content. Reopen the editor after saving.',
			schema(
				array(
					'page_id'     => $id,
					'fingerprint' => $fingerprint,
					'markup'      => $markup,
					'index'       => array(
						'type'        => 'integer',
						'minimum'     => 0,
						'description' => 'Root block insertion index from get-sections. Omit to append.',
					),
				),
				array( 'page_id', 'fingerprint', 'markup' )
			),
		),
		'update-section'    => array(
			'Replace one saved Canvas section. Published pages change live immediately. Preserves other blocks and status; rejects stale content. Reopen the editor after saving.',
			schema(
				array(
					'page_id'     => $id,
					'fingerprint' => $fingerprint,
					'markup'      => $markup,
					'path'        => $path,
				),
				array( 'page_id', 'fingerprint', 'markup', 'path' )
			),
		),
	);
	// Add destination selectors without changing the legacy page contract.
	$destination = array(
		'post_id'       => array(
			'type'        => 'integer',
			'minimum'     => 1,
			'description' => 'Saved post or page ID.',
		),
		'template_id'   => array(
			'type'        => 'string',
			'pattern'     => '^[^/]+//[^/]+$',
			'description' => 'Effective template identity, theme//slug, from get-site-structure.',
		),
		'template_type' => array(
			'type'        => 'string',
			'enum'        => array( 'wp_template', 'wp_template_part' ),
			'description' => 'Defaults to wp_template when template_id is provided.',
		),
	);
	foreach ( array( 'get-context', 'get-sections', 'insert-sections', 'update-section' ) as $operation ) {
		$specs[ $operation ][1]['properties'] = array_merge( $specs[ $operation ][1]['properties'], $destination );
		$specs[ $operation ][1]['required']   = array_values( array_diff( $specs[ $operation ][1]['required'], array( 'page_id' ) ) );
		$specs[ $operation ][0]               = str_replace( array( 'page', 'Published pages' ), array( 'document', 'Published documents' ), $specs[ $operation ][0] );
	}
	$specs['create-post']        = $specs['create-page'];
	$specs['create-post'][0]     = 'Create a post of Canvas sections. Publishes by default; use status draft to save a draft.';
	$specs['get-site-structure'] = array( 'Discover effective templates, shared template parts, and content search endpoints.', schema( array() ) );
	$specs['create-template']    = array(
		'Create a missing template or shared template part in the active theme. Does not replace existing effective templates.',
		schema(
			array(
				'title'         => array(
					'type'      => 'string',
					'minLength' => 1,
					'maxLength' => 200,
				),
				'slug'          => array(
					'type'      => 'string',
					'pattern'   => '^[a-z0-9][a-z0-9-]*$',
					'maxLength' => 200,
				),
				'template_type' => $destination['template_type'],
				'area'          => array(
					'type'    => 'string',
					'enum'    => array( 'header', 'footer', 'uncategorized' ),
					'default' => 'uncategorized',
				),
				'markup'        => $markup,
			),
			array( 'title', 'slug', 'markup' )
		),
	);
	foreach ( $specs as $name => $spec ) {
		$write = in_array( $name, array( 'create-page', 'create-post', 'create-template', 'insert-sections', 'update-section' ), true );
		wp_register_ability(
			'canvas/' . $name,
			array(
				'label'               => ucwords( str_replace( '-', ' ', $name ) ),
				'description'         => $spec[0],
				'category'            => 'site',
				'input_schema'        => $spec[1],
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'schema_version' => array(
							'type' => 'integer',
							'enum' => array( VERSION ),
						),
					),
					'required'   => array( 'schema_version' ),
				),
				'permission_callback' => static function ( $input ) use ( $name ) {
					return permission( $name, $input ); },
				'execute_callback'    => static function ( $input ) use ( $name ) {
					return execute( $name, $input ); },
				'meta'                => array(
					'public'       => true,
					'show_in_rest' => true,
					'mcp'          => array(
						'public' => true,
						'type'   => 'tool',
					),
					'annotations'  => array(
						'readonly'    => ! $write,
						'destructive' => $write,
						'idempotent'  => ! $write,
					),
				),
			)
		);
	}
}
add_action( 'wp_abilities_api_init', __NAMESPACE__ . '\\register' );

/**
 * Check the current user can perform an authoring operation.
 *
 * @param string $name Ability name.
 * @param array  $input Ability input.
 * @return bool Whether the operation is allowed.
 */
function permission( $name, $input ) {
	if ( isset( $input['template_id'] ) || in_array( $name, array( 'get-site-structure', 'create-template' ), true ) ) {
		return current_user_can( 'edit_theme_options' );
	}
	if ( isset( $input['page_id'] ) || isset( $input['post_id'] ) ) {
		$post = get_post( $input['page_id'] ?? $input['post_id'] );
		return $post && in_array( $post->post_type, array( 'post', 'page' ), true ) && ( ! isset( $input['page_id'] ) || 'page' === $post->post_type ) && current_user_can( 'edit_post', $post->ID );
	}
	if ( 'create-page' === $name || 'create-post' === $name ) {
		$type = get_post_type_object( 'create-page' === $name ? 'page' : 'post' );
		return current_user_can( $type->cap->create_posts ) && ( 'draft' === ( $input['status'] ?? 'publish' ) || current_user_can( $type->cap->publish_posts ) );
	}
	return current_user_can( 'edit_posts' ) || current_user_can( 'edit_pages' ) || current_user_can( 'edit_theme_options' );
}

/**
 * Resolve exactly one saved document or effective template destination.
 *
 * @param array $input Destination selectors.
 * @return \WP_Post|\WP_Error Resolved document.
 */
function destination( $input ) {
	$selectors = array_intersect( array( 'page_id', 'post_id', 'template_id' ), array_keys( $input ) );
	if ( 1 !== count( $selectors ) || ( isset( $input['template_type'] ) && ! isset( $input['template_id'] ) ) ) {
		return failure( 'Provide exactly one of page_id, post_id, or template_id.' );
	}
	if ( isset( $input['template_id'] ) ) {
		$type = $input['template_type'] ?? 'wp_template';
		if ( ! in_array( $type, array( 'wp_template', 'wp_template_part' ), true ) || ! is_string( $input['template_id'] ) || ! preg_match( '#^[^/]+//[^/]+$#', $input['template_id'] ) ) {
			return failure( 'Select a valid template identity and type.' );
		}
		$template = get_block_template( $input['template_id'], $type );
		if ( ! $template || get_stylesheet() !== $template->theme ) {
			return failure( 'Select an effective template from the active theme.', 'canvas_document_not_found', 404 );
		}
		$post = new \WP_Post(
			(object) array(
				'ID'                => $template->wp_id ?? 0,
				'post_type'         => $type,
				'post_title'        => $template->title,
				'post_content'      => $template->content,
				'post_status'       => $template->status ?? 'publish',
				'post_modified_gmt' => '',
				'post_name'         => $template->slug,
			)
		);
		if ( $post->ID ) {
			$post = get_post( $post->ID );
		}
		$post->canvas_template = $template;
		return $post;
	}
	$post = get_post( $input['page_id'] ?? $input['post_id'] );
	if ( ! $post || ! in_array( $post->post_type, array( 'post', 'page' ), true ) || ( isset( $input['page_id'] ) && 'page' !== $post->post_type ) || in_array( $post->post_status, array( 'trash', 'auto-draft' ), true ) ) {
		return failure( 'Select an existing post or page.', 'canvas_document_not_found', 404 );
	}
	return $post;
}

/**
 * Discover the active theme's effective templates and shared parts.
 *
 * @return array Site editing destinations.
 */
function site_structure() {
	$result = array(
		'schema_version'     => VERSION,
		'theme'              => get_stylesheet(),
		'templates'          => array(),
		'template_parts'     => array(),
		'post_search_url'    => rest_url( 'wp/v2/posts?context=edit&search=' ),
		'page_search_url'    => rest_url( 'wp/v2/pages?context=edit&search=' ),
		'templates_url'      => rest_url( 'wp/v2/templates?context=edit' ),
		'template_parts_url' => rest_url( 'wp/v2/template-parts?context=edit' ),
		'navigation_url'     => rest_url( 'wp/v2/navigation?context=edit' ),
	);
	foreach ( array(
		'wp_template'      => 'templates',
		'wp_template_part' => 'template_parts',
	) as $type => $key ) {
		foreach ( get_block_templates( array(), $type ) as $template ) {
			$result[ $key ][] = array(
				'template_id'   => $template->id,
				'template_type' => $type,
				'title'         => $template->title,
				'slug'          => $template->slug,
				'source'        => $template->source,
				'post_id'       => $template->wp_id ?? null,
				'area'          => $template->area ?? null,
				'references'    => template_references( parse_blocks( $template->content ) ),
			);
		}
	}
	return $result;
}

/**
 * Describe native shared template-part and navigation references.
 *
 * @param array $blocks Parsed blocks.
 * @return array References in document order.
 */
function template_references( $blocks ) {
	$result = array();
	foreach ( $blocks as $block ) {
		if ( 'core/template-part' === $block['blockName'] && isset( $block['attrs']['slug'] ) ) {
			$result[] = array(
				'template_id'   => ( $block['attrs']['theme'] ?? get_stylesheet() ) . '//' . $block['attrs']['slug'],
				'template_type' => 'wp_template_part',
			);
		}
		if ( 'core/navigation' === $block['blockName'] && isset( $block['attrs']['ref'] ) ) {
			$result[] = array( 'navigation_id' => $block['attrs']['ref'] );
		}
		$result = array_merge( $result, template_references( $block['innerBlocks'] ) );
	}
	return $result;
}
/**
 * Hash saved page content and status for conflict detection.
 *
 * @param \WP_Post $page Saved page.
 * @return string Content fingerprint.
 */
function fingerprint( $page ) {
	return hash( 'sha256', $page->post_content . '\0' . $page->post_status . '\0' . $page->post_modified_gmt . ( isset( $page->canvas_template ) ? '\0' . $page->canvas_template->id . '\0' . $page->canvas_template->source : '' ) );
}
/**
 * Describe a saved page and its optional recovery revision.
 *
 * @param int      $id Page ID.
 * @param int|null $revision Revision ID.
 * @return array Page metadata and links.
 */
function page_result( $id, $revision = null ) {
	$page   = $id instanceof \WP_Post ? $id : get_post( $id );
	$id     = $page->ID;
	$result = array(
		'schema_version' => VERSION,
		'post_id'        => $id ? $id : null,
		'post_type'      => $page->post_type,
		'status'         => $page->post_status,
		'fingerprint'    => fingerprint( $page ),
		'editor_url'     => $id ? get_edit_post_link( $id, 'raw' ) : null,
		'url'            => in_array( $page->post_type, array( 'page', 'post' ), true ) ? get_permalink( $id ) : null,
		'preview_url'    => in_array( $page->post_type, array( 'page', 'post' ), true ) ? get_preview_post_link( $id ) : null,
		'revision_id'    => $revision ? $revision : null,
	);
	if ( 'page' === $page->post_type ) {
		$result['page_id'] = $id;
	}
	if ( isset( $page->canvas_template ) ) {
		$result['template_id']   = $page->canvas_template->id;
		$result['template_type'] = $page->post_type;
		$result['source']        = $page->canvas_template->source;
		$result['editor_url']    = add_query_arg(
			array(
				'postId'   => $page->canvas_template->id,
				'postType' => $page->post_type,
			),
			admin_url( 'site-editor.php' )
		);
	}
	return $result;
}
/**
 * Describe parsed blocks with stable paths to Canvas sections.
 *
 * @param array $blocks Parsed blocks.
 * @param array $prefix Parent block path.
 * @return array Section tree.
 */
function section_tree( $blocks, $prefix = array() ) {
	$result = array();
	foreach ( $blocks as $index => $block ) {
		$path  = array_merge( $prefix, array( $index ) );
		$entry = array(
			'path'       => $path,
			'name'       => $block['blockName'],
			'attributes' => $block['attrs'],
		);
		if ( 'tabor/canvas' === $block['blockName'] ) {
			$entry['markup'] = serialize_block( $block );
		}
		$entry['children'] = section_tree( $block['innerBlocks'], $path );
		$result[]          = $entry;
	}
	return $result;
}
/**
 * Return authoring instructions, block schemas, and site styles.
 *
 * @param array $input Ability input with an optional page ID.
 * @return array|\WP_Error Authoring context or a page error.
 */
function context( $input ) {
	if ( isset( $input['template_type'] ) && ! isset( $input['template_id'] ) ) {
		return failure( 'template_type requires template_id.' );
	}
	$registry = \WP_Block_Type_Registry::get_instance();
	$types    = array();
	foreach ( BLOCKS as $name ) {
		$type = $registry->get_registered( $name );
		if ( $type ) {
			$types[ $name ] = array(
				'attributes'       => authoring_attributes( $type ),
				'supports'         => $type->supports,
				'parent'           => $type->parent,
				'ancestor'         => $type->ancestor,
				'allowed_blocks'   => native_allowed_children( $type ),
				'uses_context'     => $type->uses_context,
				'provides_context' => $type->provides_context,
			);
		}
	}
	$result = array(
		'schema_version'     => VERSION,
		'canvas_version'     => \PlaygroundPlugin\VERSION,
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Reads bundled local authoring instructions.
		'guide'              => file_get_contents( __DIR__ . '/../AUTHORING.md' ),
		'blocks'             => $types,
		'settings'           => wp_get_global_settings(),
		'styles'             => wp_get_global_styles(),
		'width_note'         => 'Configured CSS values, not measured pixels. Parent layouts, template styles and viewport can further constrain the section. Inspect the rendered page.',
		'page_search_url'    => rest_url( 'wp/v2/pages?context=edit&search=' ),
		'post_search_url'    => rest_url( 'wp/v2/posts?context=edit&search=' ),
		'templates_url'      => current_user_can( 'edit_theme_options' ) ? rest_url( 'wp/v2/templates?context=edit' ) : null,
		'template_parts_url' => current_user_can( 'edit_theme_options' ) ? rest_url( 'wp/v2/template-parts?context=edit' ) : null,
		'template_note'      => 'Canvas abilities create and edit Canvas sections, including nested compositions and native flow children such as Post Content and Query Loop. Keep native loop structure and context; read the guide and registered schemas before composing. Native WordPress template APIs can assemble structural shared references.',
		'media_search_url'   => rest_url( 'wp/v2/media?search=' ),
	);
	if ( isset( $input['page_id'] ) || isset( $input['post_id'] ) || isset( $input['template_id'] ) ) {
		$document = destination( $input );
		if ( is_wp_error( $document ) ) {
			return $document;
		}
		$result['document'] = sections( $document );
		if ( isset( $input['page_id'] ) ) {
			$result['page'] = $result['document'];
		}
	}
	return $result;
}
/**
 * Read the saved block tree for an available page.
 *
 * @param int $id Page ID.
 * @return array|\WP_Error Page sections or an error.
 */
function sections( $id ) {
	$page = $id instanceof \WP_Post ? $id : destination( array( 'page_id' => $id ) );
	if ( is_wp_error( $page ) ) {
		return $page;
	}
	return array_merge(
		page_result( $page ),
		array(
			'title'      => $page->post_title,
			'blocks'     => section_tree( parse_blocks( $page->post_content ) ),
			'references' => template_references( parse_blocks( $page->post_content ) ),
		)
	);
}

/**
 * Validate authored Canvas metadata and placement bounds.
 *
 * @param mixed $layout Authored Canvas metadata.
 * @return true|\WP_Error Validation result.
 */
function validate_layout( $layout ) {
	if ( ! is_array( $layout ) ) {
		return failure( 'canvas must be an object.' );
	}
	$known = array( 'desktop', 'tablet', 'mobile', 'fill', 'shape', 'shapeStretch', 'verticalAlign', 'imagePosition', 'aspectRatio', 'group', 'offset', 'order' );
	foreach ( $layout as $key => $value ) {
		if ( ! in_array( $key, $known, true ) ) {
			return failure( "Unknown canvas field: $key" );
		}
	}
	$enums = array(
		'shape'         => array_column( \PlaygroundPlugin\Canvas\image_shapes(), 'value' ),
		'verticalAlign' => array( 'top', 'center', 'bottom' ),
		'group'         => array( 1 ),
	);
	foreach ( $enums as $key => $values ) {
		if ( array_key_exists( $key, $layout ) && ! in_array( $layout[ $key ], $values, true ) ) {
			return failure( "Unsupported canvas.$key value." );
		}
	}
	$finite = static fn( $value ) => ( is_int( $value ) || is_float( $value ) ) && is_finite( $value );
	if ( array_key_exists( 'shapeStretch', $layout ) && ! is_bool( $layout['shapeStretch'] ) ) {
		return failure( 'canvas.shapeStretch must be a boolean.' );
	}
	if ( array_key_exists( 'aspectRatio', $layout ) && ( ! $finite( $layout['aspectRatio'] ) || $layout['aspectRatio'] <= 0 ) ) {
		return failure( 'canvas.aspectRatio must be a positive finite number.' );
	}
	if ( array_key_exists( 'order', $layout ) && ( ! is_int( $layout['order'] ) || $layout['order'] < 0 ) ) {
		return failure( 'canvas.order must be a nonnegative integer.' );
	}
	if ( array_key_exists( 'imagePosition', $layout ) ) {
		$position = $layout['imagePosition'];
		if ( ! is_array( $position ) ) {
			return failure( 'canvas.imagePosition must be an object.' );
		}
		foreach ( $position as $axis => $value ) {
			if ( ! in_array( $axis, array( 'x', 'y' ), true ) || ! $finite( $value ) || $value < 0 || $value > 1 ) {
				return failure( 'canvas.imagePosition requires x/y numbers between 0 and 1.' );
			}
		}
	}
	if ( array_key_exists( 'offset', $layout ) ) {
		if ( ! is_array( $layout['offset'] ) ) {
			return failure( 'canvas.offset must be an object.' );
		}
		foreach ( $layout['offset'] as $mode => $offset ) {
			if ( ! in_array( $mode, array( 'desktop', 'tablet', 'mobile' ), true ) || ! is_array( $offset ) ) {
				return failure( 'canvas.offset requires objects keyed by viewport.' );
			}
			foreach ( $offset as $axis => $value ) {
				if ( ! in_array( $axis, array( 'x', 'y' ), true ) || ! $finite( $value ) ) {
					return failure( "canvas.offset.$mode requires finite x/y numbers." );
				}
			}
		}
	}
	if ( array_key_exists( 'fill', $layout ) && ! is_bool( $layout['fill'] ) ) {
		return failure( 'canvas.fill must be a boolean.' );
	}
	foreach ( array( 'desktop', 'tablet', 'mobile' ) as $mode ) {
		if ( ! isset( $layout[ $mode ] ) ) {
			continue;
		}
		$p = $layout[ $mode ];
		if ( ! is_array( $p ) ) {
			return failure( "$mode placement must be an object." );
		}
		foreach ( $p as $key => $value ) {
			if ( ! in_array( $key, array( 'column', 'columnSpan', 'row', 'rowSpan', 'gridColumns', 'rotation', 'frameRatio', 'fillHeight', 'free', 'anchors' ), true ) ) {
				return failure( "Unknown canvas.$mode field: $key" );
			}
		}
		$limits = array(
			'column'      => array( 1, 2048 ),
			'columnSpan'  => array( 1, 2048 ),
			'row'         => array( 1, 500 ),
			'rowSpan'     => array( 1, 500 ),
			'gridColumns' => array( 1, 2048 ),
		);
		if ( array_key_exists( 'fillHeight', $p ) && ! is_bool( $p['fillHeight'] ) ) {
			return failure( "$mode.fillHeight must be a boolean." );
		}
		foreach ( $limits as $key => $range ) {
			if ( isset( $p[ $key ] ) && ( ! is_int( $p[ $key ] ) || $p[ $key ] < $range[0] || $p[ $key ] > $range[1] ) ) {
				return failure( "$mode.$key is out of range." );
			}
		}
		foreach ( array( 'rotation', 'frameRatio' ) as $key ) {
			if ( isset( $p[ $key ] ) && ( ! is_numeric( $p[ $key ] ) || ! is_finite( (float) $p[ $key ] ) || ( 'frameRatio' === $key && $p[ $key ] <= 0 ) ) ) {
				return failure( "$mode.$key must be a valid number." );
			}
		}
		if ( isset( $p['free'] ) ) {
			$f = $p['free'];
			if ( ! is_array( $f ) || array_diff( array_keys( $f ), array( 'x', 'y', 'width', 'ratio' ) ) ) {
				return failure( "$mode.free must contain only x, y, width, and ratio." );
			}
			foreach ( array( 'x', 'y', 'width', 'ratio' ) as $key ) {
				if ( ! isset( $f[ $key ] ) || ! is_numeric( $f[ $key ] ) || ! is_finite( (float) $f[ $key ] ) ) {
					return failure( "$mode.free.$key must be a number." );
				}
			}
			if ( $f['width'] <= 0 || $f['width'] > 2048 || $f['ratio'] <= 0 || $f['x'] < -2048 || $f['x'] + $f['width'] > 2048 || abs( $f['y'] ) > 500 ) {
				return failure( "$mode.free exceeds the supported frame bounds." );
			}
		}
		$columns = $p['gridColumns'] ?? array(
			'desktop' => 24,
			'tablet'  => 12,
			'mobile'  => 12,
		)[ $mode ];
		if ( ( $p['column'] ?? 1 ) + ( $p['columnSpan'] ?? 1 ) - 1 > $columns || ( $p['row'] ?? 1 ) + ( $p['rowSpan'] ?? 1 ) - 1 > 500 ) {
			return failure( "$mode placement exceeds its grid." );
		}
		if ( isset( $p['anchors'] ) && ! is_array( $p['anchors'] ) ) {
			return failure( "$mode.anchors must be an object." );
		}
		foreach ( $p['anchors'] ?? array() as $key => $v ) {
			if ( ! in_array( $key, array( 'left', 'right' ), true ) ) {
				return failure( "Unknown anchor: $mode.anchors.$key" );
			}
			$horizontal = in_array( $key, array( 'left', 'right' ), true );
			if ( is_int( $v ) && abs( $v ) <= 2048 ) {
				continue;
			}
			if ( $horizontal && in_array( $v, array( 'padding', 'canvas', 'wide', 'wide-start', 'wide-end', 'center' ), true ) ) {
				continue;
			}
			return failure( "$mode.anchors.$key is not a supported anchor." );
		}
	}
	return true;
}
/**
 * Expose registered attributes and supported editor typography.
 *
 * @param \WP_Block_Type $type Registered block type.
 * @return array Attribute schemas.
 */
function authoring_attributes( $type ) {
	// Editor-local state is never serialized into a saved block's attributes.
	$attributes = array_filter( $type->get_attributes(), static fn( $schema ) => 'local' !== ( $schema['role'] ?? null ) );
	// Core registers this typography attribute in the editor, while its PHP
	// renderer consumes it directly from parsed attrs. Expose the same contract.
	if ( ! empty( $type->supports['typography']['fitText'] ) ) {
		$attributes['fitText'] = array( 'type' => 'boolean' );
	}
	return $attributes;
}

/**
 * Retain Core's structural context through nested Canvas compositions.
 *
 * @param string      $name Block name.
 * @param string|null $parent_name Immediate parent.
 * @param array       $ancestors Ancestor block names.
 * @param array       $constraints Registered native parent and ancestor constraints.
 * @return true|\WP_Error Validation result.
 */
function validate_nesting( $name, $parent_name, $ancestors = array(), $constraints = array() ) {
	if ( ( null === $parent_name && 'tabor/canvas' !== $name ) || ( 'core/button' === $name && 'core/buttons' !== $parent_name ) || ( 'core/buttons' === $parent_name && 'core/button' !== $name ) ) {
		return failure( 'Unsupported nesting for ' . $name );
	}
	// Core's Submenu explicitly permits recursive links despite their Navigation parent metadata.
	$submenu_child = 'core/navigation-submenu' === $parent_name && in_array( $name, array( 'core/navigation-link', 'core/navigation-submenu' ), true );
	if ( ! $submenu_child && ! empty( $constraints['parent'] ) && ! in_array( $parent_name, $constraints['parent'], true ) ) {
		return failure( 'Missing native parent for ' . $name );
	}
	if ( ! empty( $constraints['ancestor'] ) && ! array_intersect( $constraints['ancestor'], array_merge( $ancestors, array( $parent_name ) ) ) ) {
		return failure( 'Missing native context for ' . $name );
	}
	return true;
}

/**
 * Read native child restrictions, including Core's editor-only Submenu contract.
 *
 * @param \WP_Block_Type|null $type Registered parent block.
 * @return array|null Permitted native children, or null when unrestricted.
 */
function native_allowed_children( $type ) {
	if ( $type && 'core/navigation-submenu' === $type->name ) {
		// Core defines these in navigation-submenu/edit, not in block.json.
		return array( 'core/navigation-link', 'core/navigation-submenu', 'core/page-list', 'core/loginout' );
	}
	return $type->allowed_blocks ?? null;
}

/**
 * Validate block types, attributes, nesting, and markup recursively.
 *
 * @param array       $block Parsed block.
 * @param string|null $parent_name Parent block name.
 * @param int         $depth Current nesting depth.
 * @param array       $ancestors Ancestor block names, nearest last.
 * @return true|\WP_Error Validation result.
 */
function validate_block( $block, $parent_name = null, $depth = 0, $ancestors = array() ) {
	$name = $block['blockName'];
	if ( $depth > 20 || ! in_array( $name, BLOCKS, true ) ) {
		return failure( 'Unsupported block or nesting depth: ' . ( $name ? $name : 'raw HTML' ) );
	}
	$type = \WP_Block_Type_Registry::get_instance()->get_registered( $name );
	if ( ! $type ) {
		return failure( 'Block is not registered: ' . $name );
	}
	$nesting = validate_nesting(
		$name,
		$parent_name,
		$ancestors,
		array(
			'parent'   => $type->parent,
			'ancestor' => $type->ancestor,
		)
	);
	if ( is_wp_error( $nesting ) ) {
		return $nesting;
	}
	$navigation_parent = in_array( $parent_name, array( 'core/navigation', 'core/navigation-submenu' ), true );
	$parent_type       = $parent_name ? \WP_Block_Type_Registry::get_instance()->get_registered( $parent_name ) : null;
	$allowed_children  = native_allowed_children( $parent_type );
	if ( is_array( $allowed_children ) && ! in_array( $name, $allowed_children, true ) ) {
		return failure( 'Unsupported native child for ' . $parent_name . ': ' . $name );
	}
	if ( $navigation_parent && ( isset( $block['attrs']['canvas'] ) || isset( $block['attrs']['fitText'] ) ) ) {
		return failure( 'Navigation descendants require native navigation nesting without Canvas placement.' );
	}
	if ( $block['innerBlocks'] && ! in_array( $name, array( 'tabor/canvas', 'core/group', 'core/buttons', 'core/navigation', 'core/navigation-submenu', 'core/query', 'core/post-template', 'core/query-no-results', 'core/query-pagination', 'core/comments', 'core/comment-template', 'core/comments-pagination', 'core/accordion', 'core/accordion-item', 'core/accordion-panel', 'core/columns', 'core/column', 'core/cover', 'core/details', 'core/gallery', 'core/list', 'core/list-item', 'core/media-text', 'core/playlist', 'core/quote', 'core/social-links', 'core/tabs', 'core/tab-panels', 'core/tab-panel', 'core/terms-query', 'core/term-template', 'core/widget-group' ), true ) ) {
		return failure( 'This block cannot contain children: ' . $name );
	}
	$attrs = $block['attrs'];
	if ( 'tabor/canvas' === $name && isset( $attrs['align'] ) && ! in_array( $attrs['align'], array( '', 'wide', 'full' ), true ) ) {
		return failure( 'Canvas alignment must be content (omitted), wide, or full.' );
	}
	$known = authoring_attributes( $type );
	foreach ( $attrs as $key => $value ) {
		if ( ! isset( $known[ $key ] ) ) {
			return failure( "Unknown attribute $name.$key" );
		}
		$valid = rest_validate_value_from_schema( $value, $known[ $key ], "$name.$key" );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
	}
	if ( isset( $attrs['canvas'] ) ) {
		$valid = validate_layout( $attrs['canvas'] );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
		foreach ( array( 'desktop', 'tablet', 'mobile' ) as $mode ) {
			if ( ! empty( $attrs['canvas'][ $mode ]['fillHeight'] ) && ( 'core/image' !== $name || 'tabor/canvas' !== $parent_name ) ) {
				return failure( 'Fill height requires an image directly inside Canvas.' );
			}
		}
		if ( ! empty( $attrs['fitText'] ) && ! empty( $attrs['canvas']['fill'] ) ) {
			return failure( 'Choose either fitText or canvas.fill.' );
		}
	}
	foreach ( array( 'desktopRows', 'tabletRows', 'mobileRows' ) as $key ) {
		if ( isset( $attrs[ $key ] ) && ( ! is_int( $attrs[ $key ] ) || $attrs[ $key ] < 1 || $attrs[ $key ] > 500 ) ) {
			return failure( "$key must be between 1 and 500." );
		}
	}
	if ( ( isset( $attrs['ref'] ) && 'core/navigation' !== $name ) || isset( $attrs['metadata']['bindings'] ) ) {
		return failure( 'Synced content and block bindings are not supported.' );
	}
	if ( 'core/navigation' === $name && isset( $attrs['ref'] ) ) {
		$navigation = get_post( $attrs['ref'] );
		if ( ! $navigation || 'wp_navigation' !== $navigation->post_type || 'publish' !== $navigation->post_status || ! current_user_can( 'edit_post', $navigation->ID ) || $block['innerBlocks'] ) {
			return failure( 'Navigation ref requires an editable published navigation document and no inline links.' );
		}
	}
	// Never accept executable HTML, even for users with unfiltered_html.
	if ( preg_replace( '#\\s*/>#', ' />', wp_kses_post( $block['innerHTML'] ) ) !== preg_replace( '#\\s*/>#', ' />', $block['innerHTML'] ) ) {
		if ( 'core/file' === $name ) {
			return failure( 'File markup contains unsupported HTML. For PDF files, disable the embedded preview (displayPreview: false) and use native download-link serialization.' );
		}
		return failure( 'Markup contains unsupported HTML in ' . $name . '. Use native block serialization.' );
	}
	if ( 'core/image' === $name ) {
		$image = new \WP_HTML_Tag_Processor( $block['innerHTML'] );
		if ( ! $image->next_tag( 'IMG' ) || ! preg_match( '#^(https?://|/)#i', (string) $image->get_attribute( 'src' ) ) ) {
			return failure( 'Image needs an HTTP(S) or site-relative source URL.' );
		}
	}
	if ( 'core/image' === $name && isset( $attrs['id'] ) && ! wp_attachment_is_image( $attrs['id'] ) ) {
		return failure( 'Image attachment does not exist.' );
	}
	if ( 'core/video' === $name ) {
		$video = new \WP_HTML_Tag_Processor( $block['innerHTML'] );
		if ( ! $video->next_tag( 'VIDEO' ) || ! preg_match( '#^(https?://|/)#i', (string) $video->get_attribute( 'src' ) ) ) {
			return failure( 'Video needs an HTTP(S) or site-relative source URL.' );
		}
		if ( isset( $attrs['id'] ) && 'video' !== strtok( (string) get_post_mime_type( $attrs['id'] ), '/' ) ) {
			return failure( 'Video attachment does not exist.' );
		}
	}
	$ancestors[] = $name;
	foreach ( $block['innerBlocks'] as $child ) {
		$valid = validate_block( $child, $name, $depth + 1, $ancestors );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
	}
	return true;
}
/**
 * Check block delimiters and attribute JSON before parsing markup.
 *
 * @param string $markup Serialized block markup.
 * @return bool Whether block markup is balanced.
 */
function balanced_markup( $markup ) {
	preg_match_all( '/<!--\\s*(\\/?)wp:([a-z0-9_-]+(?:\\/[a-z0-9_-]+)?)([\\s\\S]*?)-->/', $markup, $tokens, PREG_SET_ORDER );
	$stack = array();
	foreach ( $tokens as $token ) {
		if ( '/' === $token[1] ) {
			if ( array_pop( $stack ) !== $token[2] || '' !== trim( $token[3] ) ) {
				return false;
			}
		} else {
			$tail         = trim( $token[3] );
			$self_closing = '/' === substr( $tail, -1 );
			$json         = $self_closing ? trim( substr( $tail, 0, -1 ) ) : $tail;
			if ( '' !== $json && ( '{' !== substr( $json, 0, 1 ) || ! is_array( json_decode( $json, true ) ) || JSON_ERROR_NONE !== json_last_error() ) ) {
				return false;
			}
			if ( ! $self_closing ) {
				$stack[] = $token[2];
			}
		}
	}
	return ! $stack;
}
/**
 * Validate and compact complete Canvas sections before saving.
 *
 * @param mixed $markup Serialized block markup.
 * @return array|\WP_Error Validated blocks or an error.
 */
function validated( $markup ) {
	if ( ! is_string( $markup ) || strlen( $markup ) > 500000 ) {
		return failure( 'Markup must be under 500 KB.' );
	}
	if ( ! balanced_markup( $markup ) ) {
		return failure( 'Unbalanced block comments or invalid block attribute JSON.' );
	}
	$blocks = parse_blocks( trim( $markup ) );
	$blocks = array_values(
		array_filter(
			$blocks,
			static function ( $block ) {
				return $block['blockName'] || '' !== trim( $block['innerHTML'] );
			}
		)
	);
	if ( ! $blocks ) {
		return failure( 'Provide at least one Canvas section.' );
	}
	foreach ( $blocks as $block ) {
		$valid = validate_block( $block );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
	}
	$blocks     = array_map( '\\PlaygroundPlugin\\Canvas\\compact_canvas_block', $blocks );
	$serialized = serialize_blocks( $blocks );
	if ( wp_pre_kses_block_attributes( $serialized, 'post', array() ) !== $serialized ) {
		return failure( 'Block attributes contain unsafe HTML or URLs.' );
	}
	return $blocks;
}
/**
 * Find block byte ranges while preserving untouched page content.
 *
 * @param string $content Saved page content.
 * @return array|\WP_Error Block byte ranges or an error.
 */
function block_ranges( $content ) {
	if ( ! balanced_markup( $content ) ) {
		return failure( 'Existing page has unbalanced block markup; repair it in the editor first.' );
	}
	$parser           = new \WP_Block_Parser();
	$parser->document = $content;
	$parser->offset   = 0;
	$stack            = array();
	$ranges           = array();
	$root_index       = 0;
	$root_end         = 0;
	while ( true ) {
		list( $type, $name, $attrs, $start, $length ) = $parser->next_token();
		if ( 'no-more-tokens' === $type ) {
			break;
		}
		$end            = $start + $length;
		$parser->offset = $end;
		if ( 'block-closer' === $type ) {
			$frame = array_pop( $stack );
			if ( ! $frame || $frame['name'] !== $name ) {
				return failure( 'Cannot locate the requested section safely.' );
			}
			$ranges[ implode( '.', $frame['path'] ) ] = array( $frame['start'], $end, $name );
			if ( ! $stack ) {
				$root_end = $end;
			}
			continue;
		}
		if ( ! $stack ) {
			if ( $start > $root_end ) {
				$ranges[ (string) $root_index++ ] = array( $root_end, $start, null );
			}
			$path = array( $root_index++ );
		} else {
			$parent = count( $stack ) - 1;
			$path   = array_merge( $stack[ $parent ]['path'], array( $stack[ $parent ]['next']++ ) );
		}
		if ( 'void-block' === $type ) {
			$ranges[ implode( '.', $path ) ] = array( $start, $end, $name );
			if ( ! $stack ) {
				$root_end = $end;
			}
		} else {
			$stack[] = array(
				'path'  => $path,
				'start' => $start,
				'name'  => $name,
				'next'  => 0,
			);
		}
	}
	if ( $stack ) {
		return failure( 'Cannot locate the requested section safely.' );
	}
	if ( $root_end < strlen( $content ) ) {
		$ranges[ (string) $root_index ] = array( $root_end, strlen( $content ), null );
	}
	return $ranges;
}
/**
 * Release a write lease only when its stored token still matches.
 *
 * @param string $key Lock option name.
 * @param array  $value Lease value held by this request.
 * @return void
 */
function release_lock( $key, $value ) {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Atomic compare-and-delete prevents releasing another request's lease; the option cache is cleared below.
	$deleted = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, maybe_serialize( $value ) ) );
	if ( $deleted ) {
		wp_cache_delete( $key, 'options' );
	}
}
/**
 * Execute an authorized ability with validation and write protection.
 *
 * @param string $name Ability name.
 * @param array  $input Validated ability input.
 * @return array|\WP_Error Operation result or an error.
 */
function execute( $name, $input ) {
	if ( ! permission( $name, $input ) ) {
		return failure( 'You cannot edit this page.', 'canvas_forbidden', 403 );
	}
	if ( 'get-context' === $name ) {
		return context( $input );
	}
	if ( 'get-site-structure' === $name ) {
		return site_structure();
	}
	if ( 'get-sections' === $name ) {
		$document = destination( $input );
		return is_wp_error( $document ) ? $document : sections( $document );
	}
	$blocks = validated( $input['markup'] );
	if ( is_wp_error( $blocks ) ) {
		return $blocks;
	}
	if ( 'validate-sections' === $name ) {
		return array(
			'schema_version' => VERSION,
			'valid'          => true,
			'section_count'  => count( $blocks ),
			'markup'         => serialize_blocks( $blocks ),
		);
	}
	if ( 'create-template' === $name ) {
		$type     = $input['template_type'] ?? 'wp_template';
		$identity = get_stylesheet() . '//' . $input['slug'];
		$lock     = 'canvas_write_' . md5( $type . ':' . $identity );
		$previous = get_option( $lock );
		if ( is_array( $previous ) && ( $previous['expires'] ?? PHP_INT_MAX ) < time() ) {
			release_lock( $lock, $previous );
		}
		$lease = array(
			'token'   => wp_generate_uuid4(),
			'expires' => time() + 120,
		);
		if ( ! add_option( $lock, $lease, '', false ) ) {
			return failure( 'Another Canvas write is in progress.', 'canvas_busy', 409 );
		}
		try {
			if ( get_block_template( $identity, $type ) ) {
				return failure( 'Template already exists. Read its sections before updating.', 'canvas_conflict', 409 );
			}
			$id = wp_insert_post(
				wp_slash(
					array(
						'post_type'    => $type,
						'post_name'    => $input['slug'],
						'post_title'   => sanitize_text_field( $input['title'] ),
						'post_content' => serialize_blocks( $blocks ),
						'post_status'  => 'publish',
						'tax_input'    => array( 'wp_theme' => array( get_stylesheet() ) ),
					)
				),
				true
			);
			if ( is_wp_error( $id ) ) {
				return $id;
			}
			if ( 'wp_template_part' === $type ) {
				wp_set_object_terms( $id, $input['area'] ?? 'uncategorized', 'wp_template_part_area' );
			}
			$document = destination(
				array(
					'template_id'   => $identity,
					'template_type' => $type,
				)
			);
			return is_wp_error( $document ) ? $document : page_result( $document );
		} finally {
			release_lock( $lock, $lease );
		}
	}
	if ( 'create-page' === $name || 'create-post' === $name ) {
		$id = wp_insert_post(
			wp_slash(
				array(
					'post_type'    => 'create-post' === $name ? 'post' : 'page',
					'post_title'   => sanitize_text_field( $input['title'] ),
					'post_content' => serialize_blocks( $blocks ),
					'post_status'  => $input['status'] ?? 'publish',
					'post_author'  => get_current_user_id(),
				)
			),
			true
		);
		return is_wp_error( $id ) ? $id : page_result( $id );
	}
	$document = destination( $input );
	if ( is_wp_error( $document ) ) {
		return $document;
	}
	$id = $document->ID;
	// Serialize Canvas writes; other editors are protected by the fingerprint and post lock.
	$lock     = 'canvas_write_' . ( isset( $input['template_id'] ) ? md5( ( $input['template_type'] ?? 'wp_template' ) . ':' . $input['template_id'] ) : $id );
	$previous = get_option( $lock );
	if ( is_array( $previous ) && ( $previous['expires'] ?? PHP_INT_MAX ) < time() ) {
		release_lock( $lock, $previous );
	}
	$lease = array(
		'token'   => wp_generate_uuid4(),
		'expires' => time() + 120,
	);
	if ( ! add_option( $lock, $lease, '', false ) ) {
		return failure( 'Another Canvas write is in progress. Retry after it finishes.', 'canvas_busy', 409 );
	}
	try {
		clean_post_cache( $id );
		$page = destination( $input );
		if ( is_wp_error( $page ) ) {
			return $page;
		}
		$id = $page->ID;
		if ( in_array( $page->post_status, array( 'trash', 'auto-draft' ), true ) ) {
			return failure( 'This page is unavailable.' );
		}
		if ( ! hash_equals( fingerprint( $page ), $input['fingerprint'] ) ) {
			return failure( 'Page changed. Read canvas/get-sections again before editing.', 'canvas_conflict', 409 );
		}
		require_once ABSPATH . 'wp-admin/includes/post.php';
		$editor_lock = get_post_meta( $id, '_edit_lock', true );
		if ( $editor_lock && (int) explode( ':', $editor_lock )[0] > time() - 150 ) {
			return failure( 'The page is open for editing. Save and leave the editor before changing its saved content.', 'canvas_editor_active', 409 );
		}
		$existing = parse_blocks( $page->post_content );
		$ranges   = block_ranges( $page->post_content );
		if ( is_wp_error( $ranges ) ) {
			return $ranges;
		}
		if ( 'insert-sections' === $name ) {
			$index = $input['index'] ?? count( $existing );
			if ( $index > count( $existing ) ) {
				return failure( 'Insertion index exceeds root block count.' );
			}
			$offset = count( $existing ) === $index ? strlen( $page->post_content ) : ( $ranges[ (string) $index ][0] ?? null );
			if ( null === $offset ) {
				return failure( 'Cannot locate the insertion point.' );
			}
			$content = substr_replace( $page->post_content, serialize_blocks( $blocks ), $offset, 0 );
		} else {
			if ( 1 !== count( $blocks ) ) {
				return failure( 'Replacement must contain exactly one Canvas section.' );
			}
			$range = $ranges[ implode( '.', $input['path'] ) ] ?? null;
			if ( ! $range || 'tabor/canvas' !== $range[2] ) {
				return failure( 'Target must be an existing Canvas section.' );
			}
			$content = substr_replace( $page->post_content, serialize_block( $blocks[0] ), $range[0], $range[1] - $range[0] );
		}
		if ( ! $id && isset( $page->canvas_template ) ) {
			$id = wp_insert_post(
				wp_slash(
					array(
						'post_type'    => $page->post_type,
						'post_name'    => $page->post_name,
						'post_title'   => $page->post_title,
						'post_content' => $page->post_content,
						'post_status'  => 'publish',
						'tax_input'    => array( 'wp_theme' => array( get_stylesheet() ) ),
					)
				),
				true
			);
			if ( is_wp_error( $id ) ) {
				return $id;
			}
			if ( 'wp_template_part' === $page->post_type ) {
				wp_set_object_terms( $id, $page->canvas_template->area ?? 'uncategorized', 'wp_template_part_area' );
			}
		}
		$revision = _wp_put_post_revision( $id );
		if ( is_wp_error( $revision ) ) {
			return $revision;
		}
		$saved = wp_update_post(
			wp_slash(
				array(
					'ID'           => $id,
					'post_content' => $content,
				)
			),
			true
		);
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		$document = destination( $input );
		return is_wp_error( $document ) ? $document : page_result( $document, $revision );
	} finally {
		release_lock( $lock, $lease );
	}
}

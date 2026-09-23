<?php
/**
 * Canvas authoring operations shared by REST, MCP, and Playground.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Abilities;

defined( 'ABSPATH' ) || exit;

const VERSION = 1;
const BLOCKS  = array( 'tabor/canvas', 'core/group', 'core/heading', 'core/paragraph', 'core/image', 'core/buttons', 'core/button' );

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
	foreach ( $specs as $name => $spec ) {
		$write = in_array( $name, array( 'create-page', 'insert-sections', 'update-section' ), true );
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
	if ( ! current_user_can( 'edit_pages' ) ) {
		return false;
	}
	if ( isset( $input['page_id'] ) ) {
		$page = get_post( $input['page_id'] );
		if ( ! $page || 'page' !== $page->post_type || ! current_user_can( 'edit_post', $page->ID ) ) {
			return false;
		}
	}
	return 'create-page' !== $name || 'draft' === ( $input['status'] ?? 'publish' ) || current_user_can( 'publish_pages' );
}
/**
 * Hash saved page content and status for conflict detection.
 *
 * @param \WP_Post $page Saved page.
 * @return string Content fingerprint.
 */
function fingerprint( $page ) {
	return hash( 'sha256', $page->post_content . '\0' . $page->post_status . '\0' . $page->post_modified_gmt );
}
/**
 * Describe a saved page and its optional recovery revision.
 *
 * @param int      $id Page ID.
 * @param int|null $revision Revision ID.
 * @return array Page metadata and links.
 */
function page_result( $id, $revision = null ) {
	$page = get_post( $id );
	return array(
		'schema_version' => VERSION,
		'page_id'        => $id,
		'status'         => $page->post_status,
		'fingerprint'    => fingerprint( $page ),
		'editor_url'     => get_edit_post_link( $id, 'raw' ),
		'url'            => get_permalink( $id ),
		'preview_url'    => get_preview_post_link( $id ),
		'revision_id'    => $revision ? $revision : null,
	);
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
	$registry = \WP_Block_Type_Registry::get_instance();
	$types    = array();
	foreach ( BLOCKS as $name ) {
		$type = $registry->get_registered( $name );
		if ( $type ) {
			$types[ $name ] = array(
				'attributes' => authoring_attributes( $type ),
				'supports'   => $type->supports,
			);
		}
	}
	$result = array(
		'schema_version'   => VERSION,
		'canvas_version'   => \PlaygroundPlugin\VERSION,
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Reads bundled local authoring instructions.
		'guide'            => file_get_contents( __DIR__ . '/../AUTHORING.md' ),
		'blocks'           => $types,
		'settings'         => wp_get_global_settings(),
		'styles'           => wp_get_global_styles(),
		'width_note'       => 'Configured CSS values, not measured pixels. Parent layouts, template styles and viewport can further constrain the section. Inspect the rendered page.',
		'page_search_url'  => rest_url( 'wp/v2/pages?context=edit&search=' ),
		'media_search_url' => rest_url( 'wp/v2/media?search=' ),
	);
	if ( isset( $input['page_id'] ) ) {
		$result['page'] = sections( $input['page_id'] );
		if ( is_wp_error( $result['page'] ) ) {
			return $result['page'];
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
	$page = get_post( $id );
	if ( ! $page || 'page' !== $page->post_type || in_array( $page->post_status, array( 'trash', 'auto-draft' ), true ) ) {
		return failure( 'Select an existing page.', 'canvas_page_not_found', 404 );
	}
	return array_merge(
		page_result( $id ),
		array(
			'title'  => $page->post_title,
			'blocks' => section_tree( parse_blocks( $page->post_content ) ),
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
	$known = array( 'desktop', 'tablet', 'mobile', 'layers', 'fitArea', 'shape', 'shapeStretch', 'fit', 'verticalAlign', 'imagePosition', 'aspectRatio', 'group', 'offset', 'order' );
	foreach ( $layout as $key => $value ) {
		if ( ! in_array( $key, $known, true ) ) {
			return failure( "Unknown canvas field: $key" );
		}
	}
	$enums = array(
		'shape'         => array_column( \PlaygroundPlugin\Canvas\image_shapes(), 'value' ),
		'fit'           => array( 'cover', 'contain' ),
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
	if ( isset( $layout['fitArea'] ) && ! is_bool( $layout['fitArea'] ) ) {
		return failure( 'canvas.fitArea must be a boolean.' );
	}
	if ( isset( $layout['layers'] ) ) {
		if ( ! is_array( $layout['layers'] ) ) {
			return failure( 'canvas.layers must be an object.' );
		}
		foreach ( $layout['layers'] as $mode => $layer ) {
			if ( ! in_array( $mode, array( 'desktop', 'tablet', 'mobile' ), true ) || ! ( is_int( $layer ) || is_float( $layer ) ) || ! is_finite( $layer ) ) {
				return failure( 'canvas.layers requires finite numbers keyed by viewport.' );
			}
		}
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
			if ( ! in_array( $key, array( 'column', 'columnSpan', 'row', 'rowSpan', 'gridColumns', 'rotation', 'frameRatio', 'free', 'anchors' ), true ) ) {
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
	$attributes = $type->get_attributes();
	// Core registers this typography attribute in the editor, while its PHP
	// renderer consumes it directly from parsed attrs. Expose the same contract.
	if ( ! empty( $type->supports['typography']['fitText'] ) ) {
		$attributes['fitText'] = array( 'type' => 'boolean' );
	}
	return $attributes;
}

/**
 * Validate block types, attributes, nesting, and markup recursively.
 *
 * @param array       $block Parsed block.
 * @param string|null $parent_name Parent block name.
 * @param int         $depth Current nesting depth.
 * @return true|\WP_Error Validation result.
 */
function validate_block( $block, $parent_name = null, $depth = 0 ) {
	$name = $block['blockName'];
	if ( $depth > 20 || ! in_array( $name, BLOCKS, true ) ) {
		return failure( 'Unsupported block or nesting depth: ' . ( $name ? $name : 'raw HTML' ) );
	}
	if ( ( null === $parent_name && 'tabor/canvas' !== $name ) || ( null !== $parent_name && 'tabor/canvas' === $name ) || ( 'core/button' === $name && 'core/buttons' !== $parent_name ) || ( 'core/buttons' === $parent_name && 'core/button' !== $name ) ) {
		return failure( 'Unsupported nesting for ' . $name );
	}
	if ( $block['innerBlocks'] && ! in_array( $name, array( 'tabor/canvas', 'core/group', 'core/buttons' ), true ) ) {
		return failure( 'This block cannot contain children: ' . $name );
	}
	$type = \WP_Block_Type_Registry::get_instance()->get_registered( $name );
	if ( ! $type ) {
		return failure( 'Block is not registered: ' . $name );
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
		if ( ! empty( $attrs['fitText'] ) && ! empty( $attrs['canvas']['fitArea'] ) ) {
			return failure( 'Choose either fitText or canvas.fitArea.' );
		}
	}
	foreach ( array( 'desktopRows', 'tabletRows', 'mobileRows' ) as $key ) {
		if ( isset( $attrs[ $key ] ) && ( ! is_int( $attrs[ $key ] ) || $attrs[ $key ] < 1 || $attrs[ $key ] > 500 ) ) {
			return failure( "$key must be between 1 and 500." );
		}
	}
	if ( isset( $attrs['ref'] ) || isset( $attrs['metadata']['bindings'] ) ) {
		return failure( 'Synced content and block bindings are not supported.' );
	}
	// Never accept executable HTML, even for users with unfiltered_html.
	if ( preg_replace( '#\\s*/>#', ' />', wp_kses_post( $block['innerHTML'] ) ) !== preg_replace( '#\\s*/>#', ' />', $block['innerHTML'] ) ) {
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
	foreach ( $block['innerBlocks'] as $child ) {
		$valid = validate_block( $child, $name, $depth + 1 );
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
	if ( 'get-sections' === $name ) {
		return sections( $input['page_id'] );
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
	if ( 'create-page' === $name ) {
		$id = wp_insert_post(
			wp_slash(
				array(
					'post_type'    => 'page',
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
	$id = $input['page_id'];
	// Serialize Canvas writes; other editors are protected by the fingerprint and post lock.
	$lock     = 'canvas_write_' . $id;
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
		$page = get_post( $id );
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
		return is_wp_error( $saved ) ? $saved : page_result( $id, $revision );
	} finally {
		release_lock( $lock, $lease );
	}
}

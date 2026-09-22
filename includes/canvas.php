<?php
/**
 * Canvas registration and rendering.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Canvas;

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/canvas-serialization.php';

const BLOCK_NAME     = 'tabor/canvas';
const ATTRIBUTE      = 'canvas';
const GRID_COLUMNS   = array(
	'desktop' => 24,
	'tablet'  => 12,
	'mobile'  => 12,
);
const ALLOWED_BLOCKS = array( 'core/image', 'core/heading', 'core/paragraph', 'core/buttons' );

// Match inheritedGap/resolveGap in cell-gap.mjs, retaining unresolved presets
// so the browser measures each axis in this canvas's own style context.
/**
 * Resolve inherited and authored gap values without measuring presets.
 *
 * @param array $attributes Canvas block attributes.
 * @return array Vertical and horizontal CSS gap values.
 */
function canvas_gap( $attributes ) {
	$styles = wp_get_global_styles();
	$block  = $styles['blocks'][ BLOCK_NAME ] ?? array();
	$values = array( $block['spacing']['blockGap'] ?? null );
	foreach ( preg_split( '/\s+/', $attributes['className'] ?? '' ) as $class ) {
		if ( str_starts_with( $class, 'is-style-' ) ) {
			$values[] = $block['variations'][ substr( $class, 9 ) ]['spacing']['blockGap'] ?? null;
		}
	}
	$values[] = $attributes['style']['spacing']['blockGap'] ?? null;
	$gap      = array(
		'top'  => '24px',
		'left' => '24px',
	);
	foreach ( $values as $value ) {
		$axes = is_array( $value ) ? $value : array(
			'top'  => $value,
			'left' => $value,
		);
		foreach ( array( 'top', 'left' ) as $axis ) {
			if ( isset( $axes[ $axis ] ) && '' !== $axes[ $axis ] ) {
				$gap[ $axis ] = $axes[ $axis ];
			}
		}
	}
	return $gap;
}

/**
 * Get the authored column count for a viewport and alignment.
 *
 * @param string $mode Viewport name.
 * @param string $align Block alignment.
 * @return int Column count.
 */
function columns_for_alignment( $mode, $align = '' ) {
	return 'desktop' === $mode ? ( 'full' === $align ? 24 : ( 'wide' === $align ? 18 : 12 ) ) : GRID_COLUMNS[ $mode ];
}

/**
 * Normalize a numeric value within an inclusive integer range.
 *
 * @param mixed     $value Input value.
 * @param int|float $fallback Value used for nonnumeric input.
 * @param int       $min Lower bound.
 * @param int       $max Upper bound.
 * @return int|float Bounded value.
 */
function bounded_int( $value, $fallback, $min, $max ) {
	return max( $min, min( $max, is_numeric( $value ) ? (int) round( (float) $value ) : $fallback ) );
}

/**
 * Normalize placement values for rendering without changing saved data.
 *
 * @param array     $value Authored placement.
 * @param string    $mode Viewport name.
 * @param int       $next_row Default starting row.
 * @param int|float $layer Default stacking order.
 * @param string    $block_name Child block name.
 * @return array Normalized placement.
 */
function placement( $value, $mode, $next_row, $layer, $block_name = '' ) {
	$value   = is_array( $value ) ? $value : array();
	$columns = bounded_int( $value['gridColumns'] ?? null, GRID_COLUMNS[ $mode ], 1, 2048 );
	// Keep in sync with minimumSpans() in geometry.mjs.
	$buttons  = 'core/buttons' === $block_name;
	$width    = bounded_int( $value['columnSpan'] ?? null, $columns / ( 'mobile' === $mode ? 1 : 2 ), $buttons ? 4 : 1, $columns );
	$height   = bounded_int( $value['rowSpan'] ?? null, 6, $buttons ? 2 : 1, 500 );
	$position = array(
		'column'      => bounded_int( $value['column'] ?? null, 1, 1, $columns - $width + 1 ),
		'row'         => bounded_int( $value['row'] ?? null, $next_row, 1, 501 - $height ),
		'columnSpan'  => $width,
		'rowSpan'     => $height,
		'layer'       => is_numeric( $value['layer'] ?? null ) && is_finite( (float) $value['layer'] ) ? 0 + $value['layer'] : $layer,
		'gridColumns' => $columns,
	);
	if ( isset( $value['frameRatio'] ) && is_numeric( $value['frameRatio'] ) && is_finite( (float) $value['frameRatio'] ) && $value['frameRatio'] > 0 ) {
		$position['frameRatio'] = (float) $value['frameRatio'];
	}
	if ( isset( $value['rotation'] ) ) {
		$angle                = is_numeric( $value['rotation'] ) && is_finite( (float) $value['rotation'] ) ? (int) fmod( floor( (float) $value['rotation'] + .5 ), 360 ) : 0;
		$position['rotation'] = ( ( $angle + 540 ) % 360 ) - 180;
	}
	$free = normalize_free_frame( $value['free'] ?? null );
	if ( $free ) {
		$position['free'] = $free;
	}
	$anchors = array();
	foreach ( array( 'left', 'right' ) as $edge ) {
		$anchor = ( (array) ( $value['anchors'] ?? array() ) )[ $edge ] ?? null;
		if ( is_numeric( $anchor ) ) {
			$anchors[ $edge ] = bounded_int( $anchor, 0, -2048, 2048 );
		} elseif ( is_string( $anchor ) && in_array( $edge, array( 'left', 'right' ), true ) && in_array( $anchor, array( 'padding', 'canvas', 'wide', 'wide-start', 'wide-end', 'center' ), true ) ) {
			$anchors[ $edge ] = $anchor;
		}
	}
	$position['anchors'] = (object) $anchors;
	return $position;
}

/**
 * Normalize a precise frame using the same bounds as JavaScript.
 *
 * @param mixed $value Authored frame.
 * @return array|null Normalized frame.
 */
function normalize_free_frame( $value ) {
	$value = is_array( $value ) || is_object( $value ) ? (array) $value : array();
	foreach ( array( 'x', 'y', 'width', 'ratio' ) as $key ) {
		$number = $value[ $key ] ?? null;
		if ( ! ( is_int( $number ) || is_float( $number ) ) || ! is_finite( (float) $number ) ) {
			return null;
		}
	}
	if ( $value['width'] <= 0 || $value['ratio'] <= 0 ) {
		return null;
	}
	$width = max( 0.000001, min( 1, $value['width'] ) );
	return array(
		'x'     => max( 0, min( 1 - $width, $value['x'] ) ),
		'y'     => max( -500, min( 500, $value['y'] ) ),
		'width' => $width,
		'ratio' => max( 0.000001, min( 1000000, $value['ratio'] ) ),
	);
}

/**
 * Calculate the occupied content rows.
 *
 * @param array $value Normalized placement.
 * @return int|float Occupied row count.
 */
function occupied_rows( $value ) {
	return bounded_int( $value['row'] + $value['rowSpan'] - 1, 1, 1, 500 );
}

/**
 * Register Canvas metadata on supported core blocks.
 *
 * @param array  $args Block registration arguments.
 * @param string $name Block name.
 * @return array Updated registration arguments.
 */
function register_child_attribute( $args, $name ) {
	if ( in_array( $name, array_merge( ALLOWED_BLOCKS, array( 'core/group' ) ), true ) ) {
		$args['attributes'][ ATTRIBUTE ] = array( 'type' => 'object' );
	}
	return $args;
}
add_filter( 'register_block_type_args', __NAMESPACE__ . '\\register_child_attribute', 10, 2 );

/**
 * Register the dynamic Canvas block from its compiled metadata.
 *
 * @return void
 */
function register_canvas() {
	$build = dirname( __DIR__ ) . '/build';
	if ( file_exists( $build . '/block.json' ) ) {
		register_block_type(
			$build,
			array(
				'render_callback'   => __NAMESPACE__ . '\\render_canvas',
				'skip_inner_blocks' => true,
			)
		);
	}
}
add_action( 'init', __NAMESPACE__ . '\\register_canvas' );

// Use the same viewport settings and defaults as WordPress in both contexts.
/**
 * Enqueue responsive rules using the site viewport media queries.
 *
 * @return void
 */
function enqueue_viewport_styles() {
	$viewport = wp_get_global_settings()['viewport'] ?? null;
	$queries  = \WP_Theme_JSON::get_viewport_media_queries( $viewport );
	$canvas   = '.wp-block-tabor-canvas';
	$grid     = "$canvas .canvas__grid";
	$css      = '';
	foreach ( $queries as $key => $query ) {
		$mode = ltrim( $key, '@' );
		// Carry the API's lower range boundary to the shared layout resolver.
		// It plans collision relationships for the whole range, not each pixel.
		$range_start = preg_match( '/\(([\d.]+(?:px|em|rem)) < width/', $query, $matches ) ? $matches[1] : '0px';
		$count       = GRID_COLUMNS[ $mode ] - 1;
		$span        = 'mobile' === $mode ? GRID_COLUMNS[ $mode ] : 6;
		$css        .= "$query { $canvas { --canvas-viewport:$mode; --canvas-range-start:$range_start; } $grid { grid-template-columns:var(--canvas-$mode-tracks,repeat($count,minmax(0,1fr) var(--canvas-column-gap,24px)) minmax(0,1fr));grid-template-rows:var(--canvas-$mode-row-tracks,repeat(var(--canvas-$mode-rows,12),24px)); }";
		$css        .= "$grid > .canvas__item { grid-column:var(--canvas-$mode-line-left,calc(2 * var(--canvas-$mode-column,1) - 1)) / var(--canvas-$mode-line-right,span calc(2 * var(--canvas-$mode-columnSpan,$span) - 1));grid-row:var(--canvas-$mode-line-top,var(--canvas-$mode-row,1)) / var(--canvas-$mode-line-bottom,span var(--canvas-$mode-rowSpan,6));z-index:var(--canvas-$mode-layer,1);rotate:calc(var(--canvas-$mode-rotation,0) * 1deg); } }";
	}
	wp_enqueue_style( 'tabor-canvas-style' );
	wp_add_inline_style( 'tabor-canvas-style', $css );
}
add_action( 'enqueue_block_assets', __NAMESPACE__ . '\\enqueue_viewport_styles' );

// Mirror projectPlacement(): project directly from the saved density.
/**
 * Project saved placement density into a target viewport.
 *
 * @param array    $value Saved placement.
 * @param string   $source_mode Source viewport.
 * @param string   $mode Target viewport.
 * @param string   $block_name Child block name.
 * @param int|null $count Target column count, or the viewport default.
 * @return array Projected placement.
 */
function project_placement( $value, $source_mode, $mode, $block_name = '', $count = null ) {
	$count = $count ?? GRID_COLUMNS[ $mode ];
	$value = placement( $value, $source_mode, 1, 1, $block_name );
	if ( $value['gridColumns'] === $count ) {
		return $value;
	}
	$scale   = $count / $value['gridColumns'];
	$anchors = (array) $value['anchors'];
	foreach ( array( 'left', 'right' ) as $edge ) {
		if ( isset( $anchors[ $edge ] ) && is_numeric( $anchors[ $edge ] ) ) {
			$anchors[ $edge ] = (int) floor( $anchors[ $edge ] * $scale + .5 );
		}
	}
	$value['anchors'] = (object) $anchors;
	$left             = bounded_int( ( $value['column'] - 1 ) * $scale + 1, 1, 1, $count );
	$right            = bounded_int( ( $value['column'] + $value['columnSpan'] - 1 ) * $scale, $count, $left, $count );
	return placement(
		array_merge(
			$value,
			array(
				'gridColumns' => $count,
				'column'      => $left,
				'columnSpan'  => $right - $left + 1,
			)
		),
		$mode,
		1,
		1,
		$block_name
	);
}

// Keep in sync with alignmentAttributes(): these attributes only position
// content inside an item's area and never alter its saved grid coordinates.
/**
 * Map native block alignment to Canvas rendering attributes.
 *
 * @param string $name Block name.
 * @param array  $attributes Block attributes.
 * @return array HTML data attributes.
 */
function alignment_attributes( $name, $attributes ) {
	if ( in_array( $name, array( 'core/heading', 'core/paragraph' ), true ) ) {
		$value = $attributes[ ATTRIBUTE ]['verticalAlign'] ?? 'top';
		return array( 'data-canvas-text-align-y' => in_array( $value, array( 'center', 'bottom' ), true ) ? $value : 'top' );
	}
	if ( 'core/buttons' !== $name ) {
		return array();
	}
	$layout = $attributes['layout'] ?? array();
	$x      = $layout['justifyContent'] ?? null;
	$y      = $layout['verticalAlignment'] ?? null;
	return array(
		'data-canvas-justify'     => in_array( $x, array( 'left', 'center', 'right', 'space-between' ), true ) ? $x : 'stretch',
		'data-canvas-align-y'     => in_array( $y, array( 'top', 'center', 'bottom', 'space-between' ), true ) ? $y : 'stretch',
		'data-canvas-orientation' => 'vertical' === ( $layout['orientation'] ?? null ) ? 'vertical' : 'horizontal',
	);
}

// Shared silhouettes keep PHP, editor previews and the reposition overlay aligned.
/**
 * Read the bundled image shape definitions shared with JavaScript.
 *
 * @return array Shape definitions.
 */
function image_shapes() {
	static $shapes;
	if ( null === $shapes ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Reads bundled local shape definitions, never a remote URL.
		$shapes = json_decode( file_get_contents( __DIR__ . '/image-shapes.json' ), true );
	}
	return $shapes;
}

/**
 * Resolve a supported image shape name.
 *
 * @param mixed $value Requested shape name.
 * @return string Shape name, or none.
 */
function image_shape( $value ) {
	return in_array( $value, array_column( image_shapes(), 'value' ), true ) ? $value : 'none';
}

/**
 * Resolve an explicit stretch preference or the shape default.
 *
 * @param string    $shape Shape name.
 * @param bool|null $stretch Authored preference.
 * @return bool Whether to stretch the mask.
 */
function image_shape_stretch( $shape, $stretch = null ) {
	foreach ( image_shapes() as $entry ) {
		if ( $entry['value'] === $shape && 'none' !== $shape ) {
			return is_bool( $stretch ) ? $stretch : empty( $entry['lockAspectRatio'] );
		}
	}
	return false;
}

/**
 * Build an SVG mask URL for a supported shape.
 *
 * @param string    $shape Shape name.
 * @param bool|null $stretch Authored stretch preference.
 * @return string CSS mask URL.
 */
function image_mask( $shape, $stretch = null ) {
	foreach ( image_shapes() as $entry ) {
		if ( $entry['value'] === $shape && 'none' !== $shape ) {
			$locked        = ! image_shape_stretch( $shape, $stretch );
			list( $x, $y ) = $locked ? $entry['proportions'] : array( 1, 1 );
			$preserve      = $locked ? 'xMidYMid meet' : 'none';
			$svg           = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . ( 100 * $x ) . ' ' . ( 100 * $y ) . '" preserveAspectRatio="' . $preserve . '"><path d="' . $entry['path'] . '" transform="scale(' . $x . ' ' . $y . ')"/></svg>';
			return 'url("data:image/svg+xml,' . rawurlencode( $svg ) . '")';
		}
	}
	return 'none';
}

/**
 * Normalize the image focal point to fractions of its frame.
 *
 * @param mixed $value Authored image position.
 * @return array Horizontal and vertical positions.
 */
function image_position( $value ) {
	$value  = is_array( $value ) ? $value : array();
	$result = array();
	foreach ( array( 'x', 'y' ) as $axis ) {
		$number          = $value[ $axis ] ?? null;
		$result[ $axis ] = ( is_int( $number ) || is_float( $number ) ) && is_finite( (float) $number ) ? max( 0, min( 1, $number ) ) : .5;
	}
	return $result;
}

// Resolve source ordering before converting arbitrary layer values to CSS ranks.
/**
 * Rank sibling layers while preserving group stacking relationships.
 *
 * @param array|\WP_Block_List $blocks Canvas child blocks.
 * @return array Per-block layer ranks keyed by viewport.
 */
function canvas_paint_layers( $blocks ) {
	$leaves   = array();
	$is_group = static fn( $block ) => 'core/group' === $block->name && 1 === ( $block->attributes[ ATTRIBUTE ]['group'] ?? null );
	$collect  = function ( $siblings ) use ( &$collect, &$leaves, $is_group ) {
		foreach ( $siblings as $block ) {
			if ( $is_group( $block ) ) {
				$collect( $block->inner_blocks );
			} else {
				$leaves[] = $block;
			}
		}
	};
	$collect( $blocks );
	usort( $leaves, static fn( $a, $b ) => ( $a->attributes[ ATTRIBUTE ]['order'] ?? INF ) <=> ( $b->attributes[ ATTRIBUTE ]['order'] ?? INF ) );
	$defaults = array();
	foreach ( $leaves as $index => $leaf ) {
		$defaults[ spl_object_id( $leaf ) ] = $index + 1;
	}
	$values  = array();
	$resolve = function ( $siblings ) use ( &$resolve, &$values, $defaults, $is_group ) {
		foreach ( $siblings as $block ) {
			if ( $is_group( $block ) ) {
				$resolve( $block->inner_blocks );
			}
			foreach ( array_keys( GRID_COLUMNS ) as $mode ) {
				$children = array();
				if ( $is_group( $block ) ) {
					foreach ( $block->inner_blocks as $child ) {
						$children[] = $values[ spl_object_id( $child ) ][ $mode ];
					}
				}
				$values[ spl_object_id( $block ) ][ $mode ] = $block->attributes[ ATTRIBUTE ]['layers'][ $mode ] ?? ( $is_group( $block ) ? max( array_merge( array( 1 ), $children ) ) : $defaults[ spl_object_id( $block ) ] );
			}
		}
	};
	$resolve( $blocks );
	$ranks = array();
	$rank  = function ( $siblings ) use ( &$rank, &$ranks, $values, $is_group ) {
		foreach ( array_keys( GRID_COLUMNS ) as $mode ) {
			$ordered = is_array( $siblings ) ? $siblings : iterator_to_array( $siblings );
			usort( $ordered, static fn( $a, $b ) => $values[ spl_object_id( $a ) ][ $mode ] <=> $values[ spl_object_id( $b ) ][ $mode ] );
			foreach ( $ordered as $index => $block ) {
				$ranks[ spl_object_id( $block ) ][ $mode ] = $index + 1;
			}
		}
		foreach ( $siblings as $block ) {
			if ( $is_group( $block ) ) {
				$rank( $block->inner_blocks );
			}
		}
	};
	$rank( $blocks );
	return $ranks;
}

/**
 * Build the opening wrapper for a positioned Canvas child.
 *
 * @param \WP_Block $child Child block.
 * @param int       $index Child index.
 * @param array     $next Next available row in each viewport, updated by reference.
 * @param int       $desktop_columns Authored desktop column count.
 * @param array     $paint Resolved layer ranks.
 * @return string Opening wrapper markup.
 */
function canvas_item_open( $child, $index, &$next, $desktop_columns, $paint = array() ) {
	$saved   = $child->attributes[ ATTRIBUTE ] ?? array();
	$saved   = is_array( $saved ) ? $saved : array();
	$shape   = 'core/image' === $child->name ? image_shape( $saved['shape'] ?? null ) : 'none';
	$fit     = 'none' === $shape && 'contain' === ( $saved['fit'] ?? '' ) ? 'contain' : 'cover';
	$css     = '--canvas-fit:' . $fit . ';';
	$stretch = image_shape_stretch( $shape, $saved['shapeStretch'] ?? null );
	if ( 'none' !== $shape ) {
		$css .= '--canvas-image-mask:' . image_mask( $shape, $stretch ) . ';';
	}
	$shape_attribute = 'none' !== $shape ? ' data-canvas-shape="' . esc_attr( $shape ) . '" data-canvas-shape-stretch="' . ( $stretch ? 'true' : 'false' ) . '"' : '';
	$position        = image_position( 'contain' === $fit ? null : ( $saved['imagePosition'] ?? null ) );
	$css            .= '--canvas-image-position:' . ( $position['x'] * 100 ) . '% ' . ( $position['y'] * 100 ) . '%;';
	$source          = placement( $saved['desktop'] ?? array( 'gridColumns' => $desktop_columns ), 'desktop', $next['desktop'], $index + 1, $child->name );
	$desktop         = project_placement( $source, 'desktop', 'desktop', $child->name, $desktop_columns );
	$tablet_source   = isset( $saved['tablet'] ) ? placement( $saved['tablet'], 'tablet', $next['tablet'], $index + 1, $child->name ) : $source;
	$source_mode     = isset( $saved['tablet'] ) ? 'tablet' : 'desktop';
	$tablet          = project_placement( $tablet_source, $source_mode, 'tablet', $child->name );
	$mobile          = isset( $saved['mobile'] ) ? project_placement( placement( $saved['mobile'], 'mobile', $next['mobile'], $index + 1, $child->name ), 'mobile', 'mobile', $child->name ) : project_placement( $tablet_source, $source_mode, 'mobile', $child->name );
	foreach ( array(
		'desktop' => $desktop,
		'tablet'  => $tablet,
		'mobile'  => $mobile,
	) as $mode => $position ) {
		$position['layer'] = $paint[ spl_object_id( $child ) ][ $mode ] ?? $index + 1;
		$next[ $mode ]     = max( $next[ $mode ], occupied_rows( $position ) + 1 );
		foreach ( $position as $key => $value ) {
			if ( 'anchors' === $key || 'free' === $key ) {
				continue;
			}
			$css .= '--canvas-' . $mode . '-' . $key . ':' . $value . ';';
		}
	}
	$image_class = 'core/image' === $child->name ? ' canvas__image' : ( 'core/group' === $child->name ? ' canvas__container' : '' );
	$auto_modes  = array_filter( array( 'tablet', 'mobile' ), static fn( $mode ) => ! isset( $saved[ $mode ] ) );
	$auto        = ' data-canvas-auto="' . esc_attr( implode( ' ', $auto_modes ) ) . '" data-canvas-layout="' . esc_attr( wp_json_encode( compact_canvas( $saved ) ) ) . '"';
	$text_fit    = true === ( $saved['fitArea'] ?? false ) && in_array( $child->name, array( 'core/heading', 'core/paragraph' ), true ) ? ' data-canvas-text-fit="true"' : '';
	$alignment   = '';
	foreach ( alignment_attributes( $child->name, $child->attributes ) as $key => $value ) {
		$alignment .= ' ' . $key . '="' . esc_attr( $value ) . '"';
	}
	$group = 'core/group' === $child->name && 1 === ( $saved['group'] ?? null ) ? ' data-canvas-group=""' : '';
	return '<div class="canvas__item' . $image_class . '" data-canvas-name="' . esc_attr( $child->name ) . '" style="' . esc_attr( $css ) . '"' . $text_fit . $alignment . $auto . $group . $shape_attribute . '>';
}

// Add canvas wrappers to a marked Group's existing render tree. Native blocks
// still render exactly once with their normal context, filters and style support.
/**
 * Wrap a Canvas group while retaining native child rendering.
 *
 * @param \WP_Block $block Group block.
 * @param array     $next Next available rows, updated by reference.
 * @param array     $restore Original render trees, collected by reference.
 * @param int       $desktop_columns Desktop column count.
 * @param array     $paint Resolved layer ranks.
 * @return void
 */
function prepare_canvas_group( $block, &$next, &$restore, $desktop_columns, $paint ) {
	if ( 'core/group' !== $block->name || 1 !== ( $block->attributes[ ATTRIBUTE ]['group'] ?? null ) ) {
		return;
	}
	$restore[] = array( $block, $block->inner_content, $block->parsed_block, $block->inner_blocks );
	$content   = array();
	$index     = 0;
	foreach ( $block->inner_content as $chunk ) {
		if ( null !== $chunk ) {
			$content[] = $chunk;
			continue;
		}
		$child     = $block->inner_blocks[ $index ];
		$content[] = canvas_item_open( $child, $index, $next, $desktop_columns, $paint );
		$content[] = null;
		$content[] = '</div>';
		prepare_canvas_group( $child, $next, $restore, $desktop_columns, $paint );
		$block->parsed_block['innerBlocks'][ $index ] = $child->parsed_block;
		++$index;
	}
	$block->inner_content                = $content;
	$block->parsed_block['innerContent'] = $content;
}

/**
 * Render Canvas with native block content and authored layout values.
 *
 * @param array     $attributes Canvas attributes.
 * @param string    $content Saved inner markup.
 * @param \WP_Block $block Canvas block instance.
 * @return string Rendered block markup.
 */
function render_canvas( $attributes, $content, $block ) {
	$paint           = canvas_paint_layers( $block->inner_blocks );
	$desktop_columns = columns_for_alignment( 'desktop', $attributes['align'] ?? '' );
	$next            = array(
		'desktop' => 1,
		'tablet'  => 1,
		'mobile'  => 1,
	);
	$items           = '';
	foreach ( $block->inner_blocks as $index => $child ) {
		$open    = canvas_item_open( $child, $index, $next, $desktop_columns, $paint );
		$restore = array();
		try {
			prepare_canvas_group( $child, $next, $restore, $desktop_columns, $paint );
			$items .= $open . $child->render() . '</div>';
		} finally {
			foreach ( $restore as $entry ) {
				$entry[0]->inner_content = $entry[1];
				$entry[0]->parsed_block  = $entry[2];
				$entry[0]->inner_blocks  = $entry[3];
			}
		}
	}
	$css = '';
	foreach ( $next as $mode => $next_row ) {
		$minimum  = $attributes[ $mode . 'Rows' ] ?? ( 'desktop' === $mode ? 12 : 1 );
		$trailing = 0;
		if ( 'desktop' !== $mode && $minimum <= 1 ) {
			$source_mode    = 'mobile' === $mode && ( $attributes['tabletRows'] ?? 1 ) > 1 ? 'tablet' : 'desktop';
			$source_minimum = $attributes[ $source_mode . 'Rows' ] ?? ( 'desktop' === $source_mode ? 12 : 1 );
			$trailing       = max( 0, $source_minimum - ( $next[ $source_mode ] - 1 ) );
		}
		$rows = min( 500, max( bounded_int( $minimum, 12, 1, 500 ), $next_row - 1 + $trailing ) );
		$css .= "--canvas-$mode-rows:$rows;";
	}
	$minimums = ' data-canvas-desktop-minimum="' . bounded_int( $attributes['desktopRows'] ?? null, 12, 1, 500 ) . '" data-canvas-tablet-minimum="' . bounded_int( $attributes['tabletRows'] ?? null, 1, 1, 500 ) . '" data-canvas-mobile-minimum="' . bounded_int( $attributes['mobileRows'] ?? null, 1, 1, 500 ) . '"';
	$wrapper  = array(
		'style'               => '--canvas-desktop-columns:' . $desktop_columns . ';',
		'data-canvas-spacing' => wp_json_encode( canvas_gap( $attributes ) ),
	);
	if ( ! empty( $attributes['fillScreen'] ) ) {
		$size                               = $attributes['fillScreenHeight'] ?? 'large';
		$wrapper['data-canvas-fill-screen'] = in_array( $size, array( 'small', 'medium', 'large' ), true ) ? $size : 'large';
	}
	return '<div ' . get_block_wrapper_attributes( $wrapper ) . '><div class="canvas__grid" style="' . esc_attr( $css ) . '"' . $minimums . '>' . $items . '</div></div>';
}

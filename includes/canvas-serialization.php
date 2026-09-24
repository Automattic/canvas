<?php
/**
 * Compact saved Canvas attributes. Mirrors serialization.mjs.
 *
 * @package Canvas
 */

namespace PlaygroundPlugin\Canvas;

defined( 'ABSPATH' ) || exit;

/**
 * Compact authored placement without saving derived geometry.
 *
 * @param array|object $value Authored placement.
 * @param string       $mode Viewport name.
 * @return object Compact placement.
 */
function serialize_placement( $value, $mode ) {
	$value  = (array) $value;
	$result = array_intersect_key( $value, array_flip( array( 'column', 'row', 'columnSpan', 'rowSpan', 'gridColumns', 'free' ) ) );
	if ( isset( $result['free'] ) && ( is_array( $result['free'] ) || is_object( $result['free'] ) ) ) {
		$free = array_intersect_key( (array) $result['free'], array_flip( array( 'x', 'y', 'width', 'ratio' ) ) );
		foreach ( array( 'x', 'y', 'width', 'ratio' ) as $key ) {
			$number = $free[ $key ] ?? null;
			if ( ( is_int( $number ) || is_float( $number ) ) && is_finite( $number ) ) {
				// Match JavaScript's rounding, including negative half steps and zero.
				$rounded = ( $number < 0 ? -1 : 1 ) * floor( abs( $number ) * 1e6 + 0.5 ) / 1e6;
				// Do not turn a tiny positive dimension into an invalid zero.
				$free[ $key ] = $rounded ? $rounded : ( in_array( $key, array( 'width', 'ratio' ), true ) && $number > 0 ? $number : 0 );
			}
		}
		$result['free'] = (object) $free;
	}
	$p = placement( $value, $mode, 1, 1 );
	if ( ! empty( $p['fillHeight'] ) ) {
		$result['fillHeight'] = true;
	}
	if ( ! empty( $p['rotation'] ) ) {
		$result['rotation'] = $p['rotation'];
	}
	if ( isset( $p['frameRatio'] ) ) {
		$result['frameRatio'] = (float) sprintf( '%.6g', $p['frameRatio'] );
	}
	// Missing coordinates may inherit a content-dependent append position.
	$implicit         = array(
		'left'  => isset( $value['column'] ) ? $value['column'] - 1 : null,
		'right' => isset( $value['column'], $value['columnSpan'] ) ? $value['column'] + $value['columnSpan'] - 1 : null,
	);
	$boundaries       = (array) $p['anchors'];
	$horizontal_frame = isset( $value['free'] ) && ( is_string( $boundaries['left'] ?? null ) || is_string( $boundaries['right'] ?? null ) );
	$anchors          = array();
	foreach ( (array) $p['anchors'] as $key => $anchor ) {
		if ( $anchor !== $implicit[ $key ] || ( $horizontal_frame && in_array( $key, array( 'left', 'right' ), true ) ) ) {
			$anchors[ $key ] = $anchor;
		}
	}
	if ( $anchors ) {
		$result['anchors'] = (object) $anchors;
	}
	return (object) $result;
}

/**
 * Remove default and unsupported Canvas metadata.
 *
 * @param array|object $value Authored Canvas metadata.
 * @return object Compact metadata.
 */
function compact_canvas( $value ) {
	$value  = (array) $value;
	$result = array_intersect_key( $value, array_flip( array( 'shape', 'fit', 'verticalAlign', 'imagePosition', 'aspectRatio', 'group', 'offset', 'order' ) ) );
	if ( isset( $value['shapeStretch'] ) && is_bool( $value['shapeStretch'] ) ) {
		$result['shapeStretch'] = $value['shapeStretch'];
	}
	foreach ( array(
		'shape'         => 'none',
		'fit'           => 'cover',
		'verticalAlign' => 'top',
	) as $key => $default ) {
		if ( ( $result[ $key ] ?? null ) === $default ) {
			unset( $result[ $key ] );
		}
	}
	if ( true === ( $value['fitArea'] ?? false ) ) {
		$result['fitArea'] = true;
	}
	$layers = array();
	foreach ( array( 'desktop', 'tablet', 'mobile' ) as $mode ) {
		$layer = ( (array) ( $value['layers'] ?? array() ) )[ $mode ] ?? null;
		if ( ( is_int( $layer ) || is_float( $layer ) ) && is_finite( $layer ) ) {
			$layers[ $mode ] = $layer;
		}
	}
	if ( $layers ) {
		$result['layers'] = (object) $layers;
	}
	foreach ( array( 'desktop', 'tablet', 'mobile' ) as $mode ) {
		if ( isset( $value[ $mode ] ) && ( is_array( $value[ $mode ] ) || is_object( $value[ $mode ] ) ) ) {
			$result[ $mode ] = serialize_placement( $value[ $mode ], $mode );
		}
	}
	return (object) $result;
}

/**
 * Compact Canvas metadata throughout a parsed block tree.
 *
 * @param array $block Parsed block.
 * @return array Updated block tree.
 */
function compact_canvas_block( $block ) {
	if ( isset( $block['attrs'][ ATTRIBUTE ] ) ) {
		$block['attrs'][ ATTRIBUTE ] = compact_canvas( $block['attrs'][ ATTRIBUTE ] );
	}
	$block['innerBlocks'] = array_map( __NAMESPACE__ . '\\compact_canvas_block', $block['innerBlocks'] );
	return $block;
}

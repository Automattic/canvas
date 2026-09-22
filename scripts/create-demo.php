<?php
/** Run with scripts/create-demo.mjs through the local Playground PHP runtime. */
require '/wordpress/wp-load.php';

$existing = get_page_by_path( 'canvas-playground', OBJECT, 'page' );
if ( $existing ) {
	file_put_contents( '/wordpress/canvas-demo.json', wp_json_encode( array( 'id' => $existing->ID, 'created' => false ) ) );
	return;
}

function canvas_demo_block( $name, $attrs, $html = '', $children = array(), $chunks = null ) {
	return array( 'blockName' => $name, 'attrs' => $attrs, 'innerHTML' => $html, 'innerBlocks' => $children, 'innerContent' => $chunks ?? array( $html ) );
}
function canvas_demo_layout( $desktop, $mobile ) {
	$keys = array( 'column', 'row', 'columnSpan', 'rowSpan' );
	return array( 'canvas' => array( 'layers' => array( 'desktop' => $desktop[4], 'tablet' => $desktop[4], 'mobile' => $mobile[4] ), 'desktop' => array_merge( array( 'gridColumns' => 24 ), array_combine( $keys, array_slice( $desktop, 0, 4 ) ) ), 'mobile' => array_merge( array( 'gridColumns' => 8 ), array_combine( $keys, array_slice( $mobile, 0, 4 ) ) ) ) );
}

$media = array();
foreach ( array( 'dallas-creek-square.webp' => 'Hanging wildflowers', 'botany-flowers.webp' => 'Botanical flowers' ) as $filename => $title ) {
	$path = get_theme_root() . '/twentytwentyfive/assets/images/' . $filename;
	$upload = wp_upload_bits( 'canvas-' . $filename, null, file_get_contents( $path ) );
	if ( ! empty( $upload['error'] ) ) { throw new Exception( $upload['error'] ); }
	$id = wp_insert_attachment( array( 'post_mime_type' => 'image/webp', 'post_title' => $title, 'post_status' => 'inherit' ), $upload['file'] );
	$size = getimagesize( $upload['file'] );
	wp_update_attachment_metadata( $id, array( 'width' => $size[0], 'height' => $size[1], 'file' => _wp_relative_upload_path( $upload['file'] ), 'sizes' => array() ) );
	update_post_meta( $id, '_wp_attachment_image_alt', $title );
	$media[] = array( 'id' => $id, 'url' => wp_get_attachment_url( $id ), 'alt' => $title );
}
$image = $media[0];
$image_html = '<figure class="wp-block-image size-full"><img src="' . esc_url( $image['url'] ) . '" alt="' . esc_attr( $image['alt'] ) . '" class="wp-image-' . $image['id'] . '"/><figcaption class="wp-element-caption">A different perspective.</figcaption></figure>';
$children = array(
	canvas_demo_block( 'core/image', array_merge( canvas_demo_layout( array( 8, 2, 17, 15, 1 ), array( 1, 1, 8, 10, 1 ) ), array( 'id' => $image['id'], 'sizeSlug' => 'full', 'linkDestination' => 'none' ) ), $image_html ),
	canvas_demo_block( 'core/heading', array_merge( canvas_demo_layout( array( 2, 4, 12, 5, 3 ), array( 1, 11, 8, 3, 3 ) ), array( 'style' => array( 'color' => array( 'text' => '#f6f6ed' ), 'typography' => array( 'fontSize' => 'clamp(36px, 5vw, 76px)', 'lineHeight' => '1.05' ) ) ) ), '<h2 class="wp-block-heading has-text-color" style="color:#f6f6ed;font-size:clamp(36px, 5vw, 76px);line-height:1.05">A little room<br>to explore.</h2>' ),
	canvas_demo_block( 'core/paragraph', canvas_demo_layout( array( 2, 11, 6, 4, 2 ), array( 1, 15, 8, 4, 2 ) ), '<p>Good ideas rarely arrive in straight lines. Move a block, make it bigger, and see where it takes you.</p>' ),
	canvas_demo_block( 'core/buttons', canvas_demo_layout( array( 2, 17, 8, 2, 2 ), array( 1, 21, 8, 2, 2 ) ), '', array(
		canvas_demo_block( 'core/button', array(), '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Make some space</a></div>' ),
	), array( '<div class="wp-block-buttons">', null, '</div>' ) ),
	canvas_demo_block( 'core/group', array_merge( canvas_demo_layout( array( 2, 22, 22, 5, 2 ), array( 1, 26, 8, 7, 2 ) ), array( 'layout' => array( 'type' => 'constrained' ), 'style' => array( 'color' => array( 'background' => '#e9eddf', 'text' => '#202820' ), 'spacing' => array( 'padding' => array( 'top' => '24px', 'right' => '24px', 'bottom' => '24px', 'left' => '24px' ) ) ) ) ), '', array(
		canvas_demo_block( 'core/heading', array( 'level' => 3 ), '<h3 class="wp-block-heading">Ordinary blocks. A more open canvas.</h3>' ),
		canvas_demo_block( 'core/paragraph', array(), '<p>This is a normal Group, with a normal heading and paragraph inside. The group moves as one item; its contents still edit the WordPress way.</p>' ),
	), array( '<div class="wp-block-group has-text-color has-background" style="color:#202820;background-color:#e9eddf;padding-top:24px;padding-right:24px;padding-bottom:24px;padding-left:24px">', null, null, '</div>' ) ),
);
$canvas = canvas_demo_block( 'tabor/canvas', array(
	'align' => 'full', 'desktopRows' => 28, 'mobileRows' => 34,
	'style' => array( 'color' => array( 'background' => '#202820', 'text' => '#f6f6ed' ), 'spacing' => array( 'blockGap' => '12px', 'padding' => array( 'top' => '32px', 'bottom' => '32px', 'left' => '24px', 'right' => '24px' ) ) ),
), '', $children, array_fill( 0, count( $children ), null ) );
$page_id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Canvas — Playground', 'post_name' => 'canvas-playground', 'post_content' => serialize_block( $canvas ), 'post_author' => 1 ), true );
if ( is_wp_error( $page_id ) ) { throw new Exception( $page_id->get_error_message() ); }
file_put_contents( '/wordpress/canvas-demo.json', wp_json_encode( array( 'id' => $page_id, 'created' => true, 'media' => $media ) ) );

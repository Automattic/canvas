<?php
/**
 * Pattern-1: overlapping headline and scalloped image.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":17,"align":"full","className":"is-style-default","style":{},"metadata":{"categories":["tabor-canvas"],"patternName":"tabor/canvas-pattern-1","name":"pattern-1"}} -->
<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"shape":"scallop","desktop":{"column":6,"row":3,"columnSpan":13,"rowSpan":13,"gridColumns":24,"frameRatio":1.09975,"anchors":{"right":19}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:heading {"canvas":{"desktop":{"column":2,"row":6,"columnSpan":22,"rowSpan":7,"gridColumns":24}},"style":{"typography":{"textAlign":"center"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-center has-fit-text">BUILD IT</h2>
<!-- /wp:heading -->
<!-- /wp:tabor/canvas -->

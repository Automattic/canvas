<?php
/**
 * Portfolio: layered headings and a soft-square image.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":18,"backgroundColor":"accent-5","align":"full","className":"is-style-section-2","style":{"color":{"text":"#ff0000"},"elements":{"link":{"color":{"text":"#ff0000"}}}}} -->
<!-- wp:heading {"canvas":{"verticalAlign":"bottom","layers":{"desktop":3},"desktop":{"column":1,"row":1,"columnSpan":24,"rowSpan":7,"gridColumns":24}},"className":"is-style-default","style":{"typography":{"textTransform":"uppercase","textAlign":"center"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-center is-style-default has-fit-text" style="text-transform:uppercase">Portfolio</h2>
<!-- /wp:heading -->

<!-- wp:heading {"canvas":{"layers":{"desktop":1},"desktop":{"column":1,"row":7,"columnSpan":24,"rowSpan":7,"gridColumns":24,"anchors":{"left":"wide","right":"wide"}}},"className":"is-style-default","style":{"typography":{"textTransform":"uppercase","textAlign":"center"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-center is-style-default has-fit-text" style="text-transform:uppercase">Portfolio</h2>
<!-- /wp:heading -->

<!-- wp:image {"sizeSlug":"full","linkDestination":"none","canvas":{"shape":"soft-square","layers":{"desktop":2},"desktop":{"column":11,"row":5,"columnSpan":10,"rowSpan":12,"gridColumns":24,"frameRatio":0.933152}}} -->
<figure class="wp-block-image size-full"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- /wp:tabor/canvas -->

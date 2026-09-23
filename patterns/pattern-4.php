<?php
/**
 * Pattern-4: layered headings and flower-shaped images.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url        = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
$second_image_url = plugin_dir_url( __DIR__ ) . 'images/image-3.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":18,"backgroundColor":"accent-5","align":"full","className":"is-style-section-2","style":{"color":{"text":"#ff0000"},"elements":{"link":{"color":{"text":"#ff0000"}}}},"metadata":{"categories":["tabor-canvas"],"patternName":"tabor/canvas-pattern-4","name":"pattern-4"}} -->
<!-- wp:heading {"canvas":{"verticalAlign":"bottom","layers":{"desktop":2,"tablet":1},"desktop":{"column":1,"row":1,"columnSpan":24,"rowSpan":9,"gridColumns":24,"anchors":{"left":"canvas","right":"canvas"}},"tablet":{"column":1,"row":2,"columnSpan":12,"rowSpan":9,"gridColumns":12,"anchors":{"left":"canvas","right":"canvas"}}},"className":"is-style-default","style":{"typography":{"textTransform":"uppercase","textAlign":"center"}},"fontFamily":"fira-code","fitText":true} -->
<h2 class="wp-block-heading has-text-align-center is-style-default has-fit-text has-fira-code-font-family" style="text-transform:uppercase">FLOWERS</h2>
<!-- /wp:heading -->

<!-- wp:heading {"canvas":{"verticalAlign":"bottom","layers":{"desktop":4,"tablet":4},"desktop":{"column":1,"row":9,"columnSpan":24,"rowSpan":9,"gridColumns":24,"anchors":{"left":"canvas","right":"canvas"}},"tablet":{"column":1,"row":7,"columnSpan":12,"rowSpan":9,"gridColumns":12,"free":{"x":0,"y":7,"width":1,"ratio":3.374166},"anchors":{"left":"canvas","right":"canvas"}}},"className":"is-style-default","style":{"typography":{"textTransform":"uppercase","textAlign":"center"}},"fontFamily":"fira-code","fitText":true} -->
<h2 class="wp-block-heading has-text-align-center is-style-default has-fit-text has-fira-code-font-family" style="text-transform:uppercase">FLOWERS</h2>
<!-- /wp:heading -->

<!-- wp:image {"sizeSlug":"full","linkDestination":"none","canvas":{"shape":"flower","layers":{"desktop":3,"tablet":3},"desktop":{"column":15,"row":4,"columnSpan":9,"rowSpan":11,"gridColumns":24,"frameRatio":0.875366},"tablet":{"column":7,"row":1,"columnSpan":5,"rowSpan":14,"gridColumns":12,"frameRatio":0.760944}}} -->
<figure class="wp-block-image size-full"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"full","linkDestination":"none","canvas":{"shape":"flower","layers":{"desktop":1,"tablet":2},"desktop":{"column":1,"row":7,"columnSpan":7,"rowSpan":9,"gridColumns":24,"rotation":27,"frameRatio":0.828366,"anchors":{"left":-1,"right":6}},"tablet":{"column":3,"row":6,"columnSpan":4,"rowSpan":7,"gridColumns":12,"rotation":27,"frameRatio":1.24589}}} -->
<figure class="wp-block-image size-full"><img src="<?php echo esc_url( $second_image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- /wp:tabor/canvas -->

<?php
/**
 * Pattern-2: staggered headings and rounded images.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url        = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
$second_image_url = plugin_dir_url( __DIR__ ) . 'images/image-2.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":14,"mobileRows":15,"tabletRows":12,"align":"full","className":"is-style-section-5","metadata":{"categories":["tabor-canvas"],"patternName":"tabor/canvas-pattern-2","name":"pattern-2"}} -->
<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"imagePosition":{"x":0.5,"y":0.7851762472740097},"desktop":{"column":14,"row":3,"columnSpan":11,"rowSpan":4,"gridColumns":24,"free":{"x":0.547801,"y":3,"width":0.417477,"ratio":3.210674},"frameRatio":3.21067,"anchors":{"right":"wide"}},"tablet":{"column":8,"row":3,"columnSpan":5,"rowSpan":4,"gridColumns":12,"frameRatio":2.90714,"anchors":{"right":"padding"}},"mobile":{"column":8,"row":4,"columnSpan":5,"rowSpan":4,"gridColumns":12,"frameRatio":2.90714,"anchors":{"right":"wide"}}},"style":{"border":{"radius":"20px"}}} -->
<figure class="wp-block-image size-large has-custom-border"><img src="<?php echo esc_url( $image_url ); ?>" alt="" style="border-radius:20px"/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"imagePosition":{"x":0.5,"y":0.15116512147261407},"desktop":{"column":1,"row":9,"columnSpan":10,"rowSpan":4,"gridColumns":24,"free":{"x":0.034722,"y":7,"width":0.378009,"ratio":2.907142},"frameRatio":2.90714,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":7,"columnSpan":5,"rowSpan":4,"gridColumns":12,"frameRatio":2.90714,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":9,"columnSpan":5,"rowSpan":4,"gridColumns":12,"frameRatio":2.90714,"anchors":{"left":"wide"}}},"style":{"border":{"radius":"20px"}}} -->
<figure class="wp-block-image size-large has-custom-border"><img src="<?php echo esc_url( $second_image_url ); ?>" alt="" style="border-radius:20px"/></figure>
<!-- /wp:image -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","fill":true,"desktop":{"column":1,"row":2,"columnSpan":13,"rowSpan":6,"gridColumns":24,"free":{"x":0.034722,"y":2,"width":0.496412,"ratio":2.44087}},"tablet":{"column":1,"row":2,"columnSpan":6,"rowSpan":6,"gridColumns":12,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":3,"columnSpan":7,"rowSpan":6,"gridColumns":12,"anchors":{"left":"wide"}}},"style":{"typography":{"textAlign":"left","textTransform":"uppercase"}}} -->
<h2 class="wp-block-heading has-text-align-left" style="text-transform:uppercase">WORD</h2>
<!-- /wp:heading -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","fill":true,"desktop":{"column":11,"row":8,"columnSpan":14,"rowSpan":6,"gridColumns":24,"free":{"x":0.350463,"y":6,"width":0.614815,"ratio":3.02306},"anchors":{"left":8,"right":"wide"}},"tablet":{"column":6,"row":6,"columnSpan":7,"rowSpan":6,"gridColumns":12,"anchors":{"right":"padding"}},"mobile":{"column":6,"row":8,"columnSpan":7,"rowSpan":6,"gridColumns":12,"anchors":{"right":"wide"}}},"style":{"typography":{"textTransform":"uppercase","textAlign":"right"}}} -->
<h2 class="wp-block-heading has-text-align-right" style="text-transform:uppercase">Press</h2>
<!-- /wp:heading -->
<!-- /wp:tabor/canvas -->

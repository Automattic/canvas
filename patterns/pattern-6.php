<?php
/**
 * Pattern-6: website introduction with overlapping images.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":22,"mobileRows":52,"tabletRows":24,"align":"full","className":"is-style-default","style":{"spacing":{"blockGap":"20px","margin":{"top":"0","bottom":"0"}}},"metadata":{"categories":["tabor-canvas"],"patternName":"tabor/canvas-pattern-6","name":"pattern-6"}} -->
<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":14,"row":1,"columnSpan":11,"rowSpan":18,"gridColumns":24,"free":{"x":0.536196,"y":2,"width":0.33325,"ratio":0.731298},"frameRatio":0.731298,"anchors":{"right":"wide"}},"tablet":{"column":8,"row":5,"columnSpan":5,"rowSpan":17,"gridColumns":12,"frameRatio":0.70272,"anchors":{"right":"padding"}},"mobile":{"column":5,"row":18,"columnSpan":8,"rowSpan":21,"gridColumns":12,"free":{"x":0.354211,"y":25,"width":0.583159,"ratio":0.805523},"frameRatio":0.805523,"anchors":{"right":"wide"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"imagePosition":{"x":0.5,"y":0.2889419558397065},"desktop":{"column":11,"row":5,"columnSpan":12,"rowSpan":10,"gridColumns":24,"free":{"x":0.442586,"y":6,"width":0.364453,"ratio":1.465275},"frameRatio":1.40967},"tablet":{"column":7,"row":9,"columnSpan":5,"rowSpan":8,"gridColumns":12,"frameRatio":1.53335},"mobile":{"column":1,"row":23,"columnSpan":9,"rowSpan":12,"gridColumns":12,"free":{"x":0.06263,"y":30,"width":0.656054,"ratio":1.585874},"frameRatio":1.58587,"anchors":{"left":"wide"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:heading {"canvas":{"fitArea":true,"desktop":{"column":1,"row":5,"columnSpan":10,"rowSpan":5,"gridColumns":24,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":2,"columnSpan":6,"rowSpan":5,"gridColumns":12,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":2,"columnSpan":9,"rowSpan":9,"gridColumns":12,"free":{"x":0.06263,"y":2,"width":0.653099,"ratio":2.475469},"anchors":{"left":"wide"}}}} -->
<h2 class="wp-block-heading">A site that grows with you</h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"canvas":{"verticalAlign":"center","desktop":{"column":1,"row":14,"columnSpan":9,"rowSpan":2,"gridColumns":24,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":7,"columnSpan":5,"rowSpan":6,"gridColumns":12,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":11,"columnSpan":9,"rowSpan":6,"gridColumns":12,"free":{"x":0.06263,"y":11,"width":0.653099,"ratio":3.798295},"anchors":{"left":"wide"}}}} -->
<p>Build on WordPress with the freedom to shape your site, share your ideas, and grow on your own terms.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"canvas":{"desktop":{"column":1,"row":16,"columnSpan":6,"rowSpan":2,"gridColumns":24,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":13,"columnSpan":4,"rowSpan":3,"gridColumns":12,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":19,"columnSpan":5,"rowSpan":4,"gridColumns":12,"free":{"x":0.06263,"y":19,"width":0.357579,"ratio":3.230457},"anchors":{"left":"wide"}}},"layout":{"type":"flex"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Get started</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
<!-- /wp:tabor/canvas -->

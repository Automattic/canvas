<?php
/**
 * Skydiving school: staggered headings and rounded images.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url        = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
$second_image_url = plugin_dir_url( __DIR__ ) . 'images/image-2.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":16,"mobileRows":16,"tabletRows":10,"align":"full","className":"is-style-section-5"} -->
<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":17,"row":3,"columnSpan":8,"rowSpan":6,"gridColumns":24,"frameRatio":1.6748,"anchors":{"right":"wide"}},"mobile":{"column":1,"row":8,"columnSpan":8,"rowSpan":5,"gridColumns":8,"frameRatio":2.12907,"anchors":{"left":"wide","right":"wide"}}},"style":{"border":{"radius":"20px"}}} -->
<figure class="wp-block-image size-large has-custom-border"><img src="<?php echo esc_url( $image_url ); ?>" alt="" style="border-radius:20px"/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":1,"row":9,"columnSpan":10,"rowSpan":6,"gridColumns":24,"frameRatio":2.11023},"tablet":{"column":1,"row":6,"columnSpan":5,"rowSpan":3,"gridColumns":12,"frameRatio":2.11023,"anchors":{"left":"padding"}},"mobile":{"column":2,"row":11,"columnSpan":6,"rowSpan":4,"gridColumns":8,"frameRatio":2.01465}},"style":{"border":{"radius":"20px"}}} -->
<figure class="wp-block-image size-large has-custom-border"><img src="<?php echo esc_url( $second_image_url ); ?>" alt="" style="border-radius:20px"/></figure>
<!-- /wp:image -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","desktop":{"column":1,"row":3,"columnSpan":15,"rowSpan":6,"gridColumns":24},"tablet":{"column":1,"row":3,"columnSpan":8,"rowSpan":4,"gridColumns":12,"anchors":{"left":"padding"}},"mobile":{"column":1,"row":3,"columnSpan":8,"rowSpan":3,"gridColumns":8,"anchors":{"left":"wide","right":"wide"}}},"style":{"typography":{"textAlign":"left","textTransform":"uppercase"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-left has-fit-text" style="text-transform:uppercase">Skydiving</h2>
<!-- /wp:heading -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","desktop":{"column":12,"row":9,"columnSpan":13,"rowSpan":6,"gridColumns":24},"tablet":{"column":6,"row":6,"columnSpan":7,"rowSpan":4,"gridColumns":12,"anchors":{"right":"padding"}},"mobile":{"column":2,"row":5,"columnSpan":6,"rowSpan":3,"gridColumns":8}},"style":{"typography":{"textTransform":"uppercase","textAlign":"right"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-right has-fit-text" style="text-transform:uppercase">School</h2>
<!-- /wp:heading -->
<!-- /wp:tabor/canvas -->

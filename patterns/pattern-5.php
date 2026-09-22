<?php
/**
 * Pattern-5: an editorial introduction with staggered images.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$story_image_url  = plugin_dir_url( __DIR__ ) . 'images/image-3.jpg';
$detail_image_url = plugin_dir_url( __DIR__ ) . 'images/image-1.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":24,"tabletRows":31,"align":"full","className":"is-style-default"} -->
<!-- wp:heading {"canvas":{"fitArea":true,"desktop":{"column":1,"row":3,"columnSpan":11,"rowSpan":3,"gridColumns":24,"anchors":{"left":"wide"}}}} -->
<h2 class="wp-block-heading">Our story</h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"canvas":{"desktop":{"column":16,"row":3,"columnSpan":9,"rowSpan":7,"gridColumns":24,"anchors":{"right":"wide"}},"tablet":{"column":1,"row":6,"columnSpan":12,"rowSpan":9,"gridColumns":12}},"className":""} -->
<p>It all begins with an idea. Maybe you want to launch a business. Maybe you want to turn a hobby into something more. Or maybe you have a creative project to share with the world. Whatever it is, the way you tell your story online can make all the difference.<br><br>Sound like you. There are over 1.5 billion websites out there, but your story is what’s going to separate this one from the rest. If you read the words back and don’t hear your own voice in your head, that’s a good sign you still have more work to do.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":1,"row":9,"columnSpan":14,"rowSpan":11,"gridColumns":24,"frameRatio":1.44628,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":18,"columnSpan":8,"rowSpan":11,"gridColumns":12,"frameRatio":1.6587,"anchors":{"left":"padding"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $story_image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":20,"row":17,"columnSpan":5,"rowSpan":7,"gridColumns":24,"frameRatio":0.766255,"anchors":{"left":22,"right":"canvas"}},"tablet":{"column":9,"row":22,"columnSpan":4,"rowSpan":10,"gridColumns":12,"frameRatio":0.812846,"anchors":{"left":9,"right":"canvas"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $detail_image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- /wp:tabor/canvas -->

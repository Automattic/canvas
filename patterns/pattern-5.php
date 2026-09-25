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
<!-- wp:heading {"canvas":{"fill":true,"desktop":{"column":1,"row":3,"columnSpan":11,"rowSpan":3,"gridColumns":24,"anchors":{"left":"wide"}}}} -->
<h2 class="wp-block-heading">Your site</h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"canvas":{"desktop":{"column":16,"row":3,"columnSpan":9,"rowSpan":7,"gridColumns":24,"anchors":{"right":"wide"}},"tablet":{"column":1,"row":6,"columnSpan":12,"rowSpan":9,"gridColumns":12}},"className":""} -->
<p>Make room for your ideas with WordPress. Build a home for your business, publish the stories you want to tell, or share the work you love. With flexible blocks and patterns, you can shape every page around your vision and make a website that feels like you.<br><br>Your content belongs to you. Built on open source, WordPress gives you the freedom to make your own choices as your site grows. Try a fresh design, add new features, and reach more people, all while keeping control of the work you put into the world.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":1,"row":9,"columnSpan":14,"rowSpan":11,"gridColumns":24,"frameRatio":1.44628,"anchors":{"left":"wide"}},"tablet":{"column":1,"row":18,"columnSpan":8,"rowSpan":11,"gridColumns":12,"frameRatio":1.6587,"anchors":{"left":"padding"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $story_image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:image {"sizeSlug":"large","linkDestination":"none","canvas":{"desktop":{"column":20,"row":17,"columnSpan":5,"rowSpan":7,"gridColumns":24,"frameRatio":0.766255,"anchors":{"left":22,"right":"canvas"}},"tablet":{"column":9,"row":22,"columnSpan":4,"rowSpan":10,"gridColumns":12,"frameRatio":0.812846,"anchors":{"left":9,"right":"canvas"}}}} -->
<figure class="wp-block-image size-large"><img src="<?php echo esc_url( $detail_image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- /wp:tabor/canvas -->

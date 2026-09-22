<?php
/**
 * Pattern-3: tilted oval image, headings, and booking button.
 *
 * @package Canvas
 */

defined( 'ABSPATH' ) || exit;
$image_url = plugin_dir_url( __DIR__ ) . 'images/image-2.jpg';
?>
<!-- wp:tabor/canvas {"desktopRows":18,"backgroundColor":"accent-4","align":"full","className":"is-style-section-4","style":{"spacing":{"margin":{"top":"0","bottom":"0"}},"elements":{"link":{"color":{"text":"#ffe500"}}},"color":{"text":"#ffe500"}}} -->
<!-- wp:image {"sizeSlug":"full","linkDestination":"none","canvas":{"shape":"tilted-oval","shapeStretch":true,"desktop":{"column":4,"row":5,"columnSpan":18,"rowSpan":10,"gridColumns":24,"frameRatio":1.98853}}} -->
<figure class="wp-block-image size-full"><img src="<?php echo esc_url( $image_url ); ?>" alt=""/></figure>
<!-- /wp:image -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","desktop":{"column":6,"row":2,"columnSpan":14,"rowSpan":5,"gridColumns":24}},"style":{"typography":{"textAlign":"center"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-center has-fit-text">Energy</h2>
<!-- /wp:heading -->

<!-- wp:heading {"canvas":{"verticalAlign":"center","desktop":{"column":6,"row":12,"columnSpan":14,"rowSpan":5,"gridColumns":24}},"style":{"typography":{"textAlign":"center"}},"fitText":true} -->
<h2 class="wp-block-heading has-text-align-center has-fit-text">Healing</h2>
<!-- /wp:heading -->

<!-- wp:buttons {"canvas":{"desktop":{"column":10,"row":8,"columnSpan":6,"rowSpan":4,"gridColumns":24}},"layout":{"type":"flex","verticalAlignment":"center","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Book Experience</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
<!-- /wp:tabor/canvas -->

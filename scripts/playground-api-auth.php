<?php
/** Local Playground only: let REST authenticate instead of redirecting to auto-login. */
add_action( 'init', static function () {
	$path = parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH );
	if ( isset( $_GET['rest_route'] ) || 0 === strpos( $path ?? '', '/wp-json/' ) ) {
		remove_action( 'init', 'playground_auto_login', 1 );
	}
}, 0 );

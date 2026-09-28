import { observeTextFit } from './text-fit.mjs';
import { observeCanvasLayout } from './layout-observer.mjs';
import { observeAutomaticTextColor } from './guide-colors.mjs';

const start = () => {
	document
		.querySelectorAll( '.wp-block-tabor-canvas > .canvas__grid' )
		.forEach( ( grid ) => {
			observeAutomaticTextColor( grid );
			observeCanvasLayout( grid );
			if ( grid.querySelector( '[data-canvas-text-fit="true"]' ) ) {
				observeTextFit( grid );
			}
		} );
};
if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', start, { once: true } );
} else {
	start();
}

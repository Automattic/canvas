const VISIBILITY_VIEWPORTS = [ 'desktop', 'tablet', 'mobile' ];

export function isHiddenOnViewport( metadata, viewport ) {
	const visibility = metadata?.blockVisibility;
	return visibility === false || visibility?.viewport?.[ viewport ] === false;
}

// Use WordPress's native metadata so List View, its visibility dialog, and
// frontend rendering all share the same state. Keep other metadata intact.
export function toggleViewportVisibility( metadata = {}, viewport ) {
	if ( ! VISIBILITY_VIEWPORTS.includes( viewport ) ) {
		return metadata;
	}
	const current = metadata.blockVisibility;
	const visibility = current && typeof current === 'object' ? current : {};
	const viewports =
		current === false
			? Object.fromEntries(
					VISIBILITY_VIEWPORTS.map( ( key ) => [ key, false ] )
				)
			: { ...visibility.viewport };
	if ( isHiddenOnViewport( metadata, viewport ) ) {
		delete viewports[ viewport ];
	} else {
		viewports[ viewport ] = false;
	}
	const next = { ...visibility, viewport: viewports };
	if ( ! Object.keys( viewports ).length ) {
		delete next.viewport;
	}
	const result = { ...metadata, blockVisibility: next };
	if ( ! Object.keys( next ).length ) {
		delete result.blockVisibility;
	}
	return result;
}

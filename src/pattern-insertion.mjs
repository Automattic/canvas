import { BLOCK_NAME } from './placement.mjs';

// Canvas sections are edited directly, regardless of the insertion surface.
// Preserve all other metadata and explicit locks.
export function editablePatternMetadata( metadata ) {
	if ( ! metadata?.patternName ) {
		return metadata;
	}
	const editable = { ...metadata };
	delete editable.patternName;
	return editable;
}

// Keep Core's pattern treatment for other roots.
export function editablePatternBlocks( blocks ) {
	return blocks.map( ( block ) => {
		if (
			block.name !== BLOCK_NAME ||
			! block.attributes.metadata?.patternName
		) {
			return block;
		}
		const metadata = editablePatternMetadata( block.attributes.metadata );
		return {
			...block,
			attributes: { ...block.attributes, metadata },
		};
	} );
}

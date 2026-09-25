import { createContext } from '@wordpress/element';

export const CanvasContext = createContext( null );

// Pointer-frequency updates are only consumed by item placement wrappers.
export const CanvasPreviewContext = createContext( null );

import { rotationModifier } from './rotation.mjs';

export function centerResizeModifier( event ) {
	return (
		event.pointerType !== 'touch' &&
		!! event.shiftKey &&
		!! rotationModifier( event )
	);
}

export function resizeGestureKind( event, direction ) {
	return event.pointerType !== 'touch' &&
		direction.length === 2 &&
		rotationModifier( event ) &&
		! centerResizeModifier( event )
		? 'rotate'
		: direction;
}

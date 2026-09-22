const CORNERS = [ 'topLeft', 'topRight', 'bottomRight', 'bottomLeft' ];
const QUANTITY = /^([+]?(?:\d*\.)?\d+)\s*([a-z%]*)$/i;
const clamp = ( value, maximum ) => Math.max( 0, Math.min( maximum, value ) );

export function radiusQuantity( value ) {
	const match = String( value ?? '' )
		.trim()
		.match( QUANTITY );
	return match
		? {
				value: Number( match[ 1 ] ),
				unit: match[ 2 ].toLowerCase() || 'px',
			}
		: null;
}

export function radiusCorner( value, rtl = false ) {
	return value && typeof value === 'object'
		? value[ rtl ? 'topLeft' : 'topRight' ]
		: value;
}

export function radiusIsMixed( value ) {
	return (
		!! value &&
		typeof value === 'object' &&
		new Set( CORNERS.map( ( corner ) => value[ corner ] ) ).size > 1
	);
}

// Percent radii describe an ellipse relative to both dimensions. Length radii
// become a pill at half the shorter dimension; percent radii do so at 50%.
export function radiusModel(
	raw,
	computed,
	{
		width,
		height,
		pixelsPerUnit = 1,
		rtl = false,
		unit: editableUnit,
		step = 1,
	}
) {
	const authored = radiusQuantity( radiusCorner( raw, rtl ) );
	const resolved = radiusQuantity( computed ) || { value: 0, unit: 'px' };
	const unit = editableUnit || authored?.unit || resolved.unit;
	const factor = unit === '%' ? width / 100 : pixelsPerUnit;
	const maximum = unit === '%' ? 50 : Math.min( width, height ) / 2 / factor;
	const resolvedPixels =
		resolved.value * ( resolved.unit === '%' ? width / 100 : 1 );
	return {
		unit,
		factor,
		maximum,
		step,
		value: clamp( resolvedPixels / factor, maximum ),
		label: radiusIsMixed( raw )
			? 'Mixed'
			: ( radiusCorner( raw, rtl ) ?? computed ?? '0px' ),
	};
}

export function radiusAtDelta( model, pixels ) {
	// Use the native UnitControl step for both drag and keyboard adjustments.
	// Round the upper limit up to a step so odd-sized blocks can still form pills.
	const step = model.step;
	const maximum = Math.ceil( model.maximum / step ) * step;
	const value = Number(
		clamp(
			Math.round( ( model.value + pixels / model.factor ) / step ) * step,
			maximum
		).toFixed( 8 )
	);
	return `${ value }${ model.unit }`;
}

export function radiusEditableUnit( raw, computed, settings, rtl = false ) {
	if ( ! settings?.enabled ) {
		return null;
	}
	const units = settings.units || [];
	const authored = radiusQuantity( radiusCorner( raw, rtl ) );
	const resolved = radiusQuantity( computed );
	return (
		units.find( ( { value } ) => value === authored?.unit ) ||
		units.find( ( { value } ) => value === resolved?.unit ) ||
		units.find( ( { value } ) => value === 'px' ) ||
		units[ 0 ] ||
		null
	);
}

export function radiusDragDelta( dx, dy, rotation = 0, rtl = false ) {
	const radians = ( rotation * Math.PI ) / 180;
	return (
		( dx * Math.cos( radians ) + dy * Math.sin( radians ) ) *
		( rtl ? 1 : -1 )
	);
}

export function radiusKeyDelta( key, rtl = false ) {
	if ( key === 'ArrowUp' ) {
		return 1;
	}
	if ( key === 'ArrowDown' ) {
		return -1;
	}
	if ( key === 'ArrowLeft' ) {
		return rtl ? -1 : 1;
	}
	if ( key === 'ArrowRight' ) {
		return rtl ? 1 : -1;
	}
	return 0;
}

export function radiusUpdates( targets, values, attributesFor ) {
	return Object.fromEntries(
		targets.flatMap( ( { id }, index ) => {
			const attributes = attributesFor( id );
			if (
				! attributes ||
				attributes.style?.border?.radius === values[ index ]
			) {
				return [];
			}
			return [
				[
					id,
					{
						style: {
							...attributes.style,
							border: {
								...attributes.style?.border,
								radius: values[ index ],
							},
						},
					},
				],
			];
		} )
	);
}

export function radiusHandlePosition(
	width,
	height,
	pixels,
	rtl = false,
	touch = false,
	scale = 1,
	availableEnd = Infinity
) {
	const clearance = ( touch ? 48 : 20 ) / scale;
	const outside = width < clearance * 2 || height < clearance * 2;
	const inset = outside
		? -clearance
		: Math.min( width / 2, Math.max( clearance, pixels ) );
	if ( outside && availableEnd < ( touch ? 70 : 36 ) ) {
		return { left: width / 2, top: height + clearance };
	}
	// Small blocks use the outer end edge, leaving the floating toolbar above
	// the block unobstructed as well as keeping separate resize touch targets.
	return {
		left: rtl ? inset : width - inset,
		top: outside ? Math.min( clearance, height / 2 ) : clearance,
	};
}

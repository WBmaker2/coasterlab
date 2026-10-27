/** All values are SI units unless noted. */

/** Standard gravitational acceleration used by the educational model. */
export const GRAVITY = 9.81;

/** Display mass of the cart. Forces scale with this, so it cancels in G-force. */
export const CART_MASS = 500;

/** Above this sustained G-force the ride is marked unsafe in this model. */
export const MAX_G = 6;

/** At the top of a loop, v² must be at least g × R. */
export const MIN_LOOP_SPEED_FACTOR = 1;

/** Spatial integration step in metres. Physics is deterministic and frame independent. */
export const PHYSICS_STEP = 0.2;

/** Used to keep an accidental pinched control point from producing infinite forces. */
export const MAX_CURVATURE = 2.5;

/** A run is stopped after this many simulated seconds. */
export const MAX_RUN_TIME = 120;

/**
 * Small negative normal forces are treated as a short airtime warning.
 * A sustained dip below this value is a derailment risk.
 */
export const DERAILMENT_G_THRESHOLD = -0.5;

export const MIN_POINT_SPACING = 0.25;

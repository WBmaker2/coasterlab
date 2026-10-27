import { CART_MASS, GRAVITY, MAX_CURVATURE, MIN_LOOP_SPEED_FACTOR } from './constants';

export function clampCurvature(curvature: number): number {
  if (!Number.isFinite(curvature)) return 0;
  return Math.min(Math.max(curvature, -MAX_CURVATURE), MAX_CURVATURE);
}

/**
 * Track normal force, with the track normal chosen as the 90° left normal of
 * the sideways tangent. Positive means the track pushes the cart away from
 * the track surface. A negative value means an open track would lose contact.
 *
 * N = m (v² κ + g n_y)
 * κ is signed curvature (positive when turning left / concave up).
 */
export function normalForce(
  speed: number,
  curvature: number,
  normalY: number,
  mass = CART_MASS,
  gravity = GRAVITY
): number {
  const k = clampCurvature(curvature);
  return mass * (speed * speed * k + gravity * normalY);
}

export function gForce(speed: number, curvature: number, normalY: number, gravity = GRAVITY): number {
  return normalForce(speed, curvature, normalY, CART_MASS, gravity) / (CART_MASS * gravity);
}

/** Centripetal acceleration magnitude for the local radius of curvature. */
export function centripetalAcceleration(speed: number, curvature: number): number {
  return speed * speed * Math.abs(clampCurvature(curvature));
}

/** Required top-of-loop speed: v² ≥ gR. */
export function minimumLoopSpeed(radius: number, gravity = GRAVITY): number {
  return Math.sqrt(Math.max(0, MIN_LOOP_SPEED_FACTOR * gravity * radius));
}

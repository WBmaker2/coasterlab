export function kineticEnergy(mass: number, speed: number): number {
  return 0.5 * mass * speed * speed;
}

export function potentialEnergy(mass: number, gravity: number, height: number): number {
  return mass * gravity * height;
}

export function mechanicalEnergy(mass: number, gravity: number, height: number, speed: number): number {
  return potentialEnergy(mass, gravity, height) + kineticEnergy(mass, speed);
}

/**
 * Speed from conservation of mechanical energy with thermal losses.
 * Returns 0 when the cart no longer has enough energy to reach the height.
 */
export function speedFromEnergy(
  availableMechanicalEnergy: number,
  mass: number,
  gravity: number,
  height: number
): number {
  if (mass <= 0) return 0;
  const kinetic = availableMechanicalEnergy - potentialEnergy(mass, gravity, height);
  if (kinetic <= 0) return 0;
  return Math.sqrt((2 * kinetic) / mass);
}

export function clampSpeed(speed: number, max = 80): number {
  if (!Number.isFinite(speed)) return 0;
  return Math.min(Math.max(speed, 0), max);
}

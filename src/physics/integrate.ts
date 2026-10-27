import { CART_MASS, DERAILMENT_G_THRESHOLD, MAX_RUN_TIME, PHYSICS_STEP } from './constants';
import type { RunResult, Sample, SampleAtTime } from './cart';
import { normalForce } from './forces';
import { buildSpline, resampleAtStep, type Spline } from '../track/spline';
import type { Track } from '../track/types';

function lerp(a: number, b: number, ratio: number): number {
  return a + (b - a) * ratio;
}

function binarySearchTime(samples: Sample[], time: number): number {
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].t <= time) low = mid;
    else high = mid;
  }
  return low;
}

function interpolateSample(a: Sample, b: Sample, ratio: number): Sample {
  return {
    s: lerp(a.s, b.s, ratio),
    t: lerp(a.t, b.t, ratio),
    x: lerp(a.x, b.x, ratio),
    y: lerp(a.y, b.y, ratio),
    z: lerp(a.z, b.z, ratio),
    speed: lerp(a.speed, b.speed, ratio),
    kinetic: lerp(a.kinetic, b.kinetic, ratio),
    potential: lerp(a.potential, b.potential, ratio),
    thermal: lerp(a.thermal, b.thermal, ratio),
    normalForce: lerp(a.normalForce, b.normalForce, ratio),
    gForce: lerp(a.gForce, b.gForce, ratio),
    curvature: lerp(a.curvature, b.curvature, ratio)
  };
}

/**
 * Runs the deterministic 1D energy simulation along the track.
 *
 * At every spatial step the remaining mechanical energy is
 *   E0 − m·g·y − Q
 * and speed follows from ½mv². This keeps energy conservation exact by
 * construction, independent of frame rate.
 */
export function simulateTrack(track: Track, spline?: Spline): RunResult {
  const curve = spline ?? buildSpline(track.points);
  const profile = resampleAtStep(curve, PHYSICS_STEP);
  const mass = CART_MASS;
  const gravity = track.gravity;
  const friction = Math.max(0, track.friction);
  const startSpeed = Math.max(0, track.startSpeed);

  if (profile.length === 0) {
    return {
      samples: [],
      length: 0,
      duration: 0,
      initialEnergy: 0,
      maxSpeed: 0,
      maxSpeedS: 0,
      maxHeight: 0,
      maxG: 0,
      maxGS: 0,
      minG: 0,
      minGS: 0,
      stalled: false,
      stallS: null,
      derailment: false,
      derailS: null,
      timedOut: false
    };
  }

  const y0 = profile[0].y;
  const energyPerKg = 0.5 * startSpeed * startSpeed + gravity * y0;
  const initialEnergy = energyPerKg * mass;

  const samples: Sample[] = [];
  let thermalPerKg = 0;
  let time = 0;
  let previousSpeed = startSpeed;
  let stalled = false;
  let stallS: number | null = null;
  let derailment = false;
  let derailS: number | null = null;
  let timedOut = false;

  let maxSpeed = startSpeed;
  let maxSpeedS = 0;
  let maxHeight = y0;
  let maxG = -Infinity;
  let maxGS = 0;
  let minG = Infinity;
  let minGS = 0;

  for (let i = 0; i < profile.length; i += 1) {
    const point = profile[i];

    if (i > 0) {
      const previous = profile[i - 1];
      const ds = Math.max(0, point.s - previous.s);
      if (ds > 0 && friction > 0) {
        const grade = Math.min(1, Math.max(-1, (point.y - previous.y) / ds));
        const cosSlope = Math.sqrt(Math.max(0, 1 - grade * grade));
        thermalPerKg += friction * gravity * cosSlope * ds;
      }
    }

    const remainingMechPerKg = energyPerKg - thermalPerKg - gravity * point.y;
    let speed = Math.sqrt(Math.max(0, remainingMechPerKg * 2));

    if (!Number.isFinite(speed)) speed = 0;

    if (i > 0 && speed < 1e-4) {
      stalled = true;
      stallS = point.s;
      speed = 0;
      // At the stopping point all available mechanical energy has been spent.
      thermalPerKg = Math.max(0, energyPerKg - gravity * point.y);
    }

    if (i > 0 && !stalled) {
      const ds = point.s - profile[i - 1].s;
      const average = (previousSpeed + speed) / 2;
      if (average > 0.02) time += ds / average;
    }

    const curvature = Number.isFinite(point.curvature) ? point.curvature : 0;
    const normal = normalForce(speed, curvature, point.ny, mass, gravity);
    const g = normal / (mass * gravity);

    const sample: Sample = {
      s: point.s,
      t: time,
      x: point.x,
      y: point.y,
      z: point.z,
      speed,
      kinetic: 0.5 * mass * speed * speed,
      potential: mass * gravity * point.y,
      thermal: mass * thermalPerKg,
      normalForce: normal,
      gForce: g,
      curvature
    };
    samples.push(sample);

    if (speed > maxSpeed) {
      maxSpeed = speed;
      maxSpeedS = point.s;
    }
    if (point.y > maxHeight) maxHeight = point.y;
    if (speed > 0.1) {
      if (g > maxG) {
        maxG = g;
        maxGS = point.s;
      }
      if (g < minG) {
        minG = g;
        minGS = point.s;
      }
      if (g < DERAILMENT_G_THRESHOLD && !derailment) {
        derailment = true;
        derailS = point.s;
      }
    }

    previousSpeed = speed;
    if (stalled) break;
    if (time > MAX_RUN_TIME) {
      timedOut = true;
      break;
    }
  }

  const last = samples[samples.length - 1];
  return {
    samples,
    length: last ? last.s : 0,
    duration: last ? last.t : 0,
    initialEnergy,
    maxSpeed,
    maxSpeedS,
    maxHeight,
    maxG: Number.isFinite(maxG) ? maxG : 0,
    maxGS,
    minG: Number.isFinite(minG) ? minG : 0,
    minGS,
    stalled,
    stallS,
    derailment,
    derailS,
    timedOut
  };
}

export function sampleAtTime(run: RunResult, time: number): SampleAtTime {
  const samples = run.samples;
  if (samples.length === 0) throw new Error('Run has no samples.');
  if (samples.length === 1) return { sample: samples[0], index: 0, ratio: 0 };
  const clamped = Math.min(Math.max(time, 0), samples[samples.length - 1].t);
  const low = binarySearchTime(samples, clamped);
  const a = samples[low];
  const b = samples[Math.min(low + 1, samples.length - 1)];
  const span = b.t - a.t;
  const ratio = span > 1e-9 ? (clamped - a.t) / span : 0;
  return { sample: interpolateSample(a, b, ratio), index: low, ratio };
}

export function sampleAtDistance(run: RunResult, distance: number): SampleAtTime {
  const samples = run.samples;
  if (samples.length === 0) throw new Error('Run has no samples.');
  if (samples.length === 1) return { sample: samples[0], index: 0, ratio: 0 };
  const clamped = Math.min(Math.max(distance, 0), samples[samples.length - 1].s);
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].s <= clamped) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[Math.min(low + 1, samples.length - 1)];
  const span = b.s - a.s;
  const ratio = span > 1e-9 ? (clamped - a.s) / span : 0;
  return { sample: interpolateSample(a, b, ratio), index: low, ratio };
}

import type { TrackPoint } from './types';

export interface SplineSample {
  /** Arc length in metres. */
  s: number;
  x: number;
  y: number;
  z: number;
  /** Unit 3D tangent. */
  tx: number;
  ty: number;
  tz: number;
  /** Unit normal in the side-view plane, 90° left of the horizontal tangent. */
  nx: number;
  ny: number;
  nz: number;
  /** Signed horizontal curvature, positive when turning left (counter-clockwise). */
  curvature: number;
}

export interface Spline {
  samples: SplineSample[];
  length: number;
  /** Arc length at each control point. */
  controlPointS: number[];
  pointAt: (s: number) => SplineSample;
}

const DEFAULT_SAMPLES_PER_SEGMENT = 160;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function mix(a: Vec3, b: Vec3, ratio: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
    z: a.z + (b.z - a.z) * ratio
  };
}

/**
 * Centripetal Catmull-Rom interpolation. Unlike the uniform variant it does
 * not overshoot above a start point or make cusps at unevenly spaced controls.
 */
function catmullRomPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const d1 = Math.pow(Math.max(distance(p0, p1), 1e-5), 0.5);
  const d2 = Math.pow(Math.max(distance(p1, p2), 1e-5), 0.5);
  const d3 = Math.pow(Math.max(distance(p2, p3), 1e-5), 0.5);
  const t0 = 0;
  const t1 = t0 + d1;
  const t2 = t1 + d2;
  const t3 = t2 + d3;
  const u = t1 + t * (t2 - t1);

  const a1 = mix(p0, p1, (u - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (u - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (u - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (u - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (u - t1) / (t3 - t1));
  return mix(b1, b2, (u - t1) / (t2 - t1));
}

function normalize2(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y);
  if (len < 1e-12) return [1, 0];
  return [x / len, y / len];
}

/**
 * Builds a centripetal Catmull-Rom spline through every control point.
 * Phantom mirrored end points keep the curve anchored to the first and last
 * control point without overshooting them.
 */
export function buildSpline(
  points: TrackPoint[],
  samplesPerSegment = DEFAULT_SAMPLES_PER_SEGMENT
): Spline {
  if (points.length < 2) {
    throw new Error('A track needs at least two control points.');
  }

  const count = points.length;
  const flat = points.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  const raw: Array<{ x: number; y: number; z: number }> = [];
  const controlSampleIndex: number[] = [];
  const perSegment = Math.max(12, Math.floor(samplesPerSegment));

  for (let i = 0; i < count - 1; i += 1) {
    const p1 = flat[i];
    const p2 = flat[i + 1];
    const phantom0 =
      i === 0 ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y, z: 2 * p1.z - p2.z } : flat[i - 1];
    const phantom3 =
      i === count - 2 ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y, z: 2 * p2.z - p1.z } : flat[i + 2];
    controlSampleIndex.push(raw.length);
    for (let j = 0; j < perSegment; j += 1) {
      const t = j / perSegment;
      raw.push(catmullRomPoint(phantom0, p1, p2, phantom3, t));
    }
  }
  controlSampleIndex.push(raw.length);
  raw.push({ ...flat[count - 1] });

  const cumulative: number[] = [0];
  for (let i = 1; i < raw.length; i += 1) {
    const dx = raw[i].x - raw[i - 1].x;
    const dy = raw[i].y - raw[i - 1].y;
    const dz = raw[i].z - raw[i - 1].z;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy, dz));
  }
  const length = cumulative[cumulative.length - 1];

  const samples: SplineSample[] = raw.map((point, i) => {
    const back = raw[Math.max(0, i - 2)];
    const forward = raw[Math.min(raw.length - 1, i + 2)];
    let dx = forward.x - back.x;
    let dy = forward.y - back.y;
    let dz = forward.z - back.z;
    const len3 = Math.hypot(dx, dy, dz);
    if (len3 < 1e-12) {
      dx = 1;
      dy = 0;
      dz = 0;
    } else {
      dx /= len3;
      dy /= len3;
      dz /= len3;
    }
    const [hx, hy] = normalize2(dx, dy);
    const nx = -hy;
    const ny = hx;

    return {
      s: cumulative[i],
      x: point.x,
      y: point.y,
      z: point.z,
      tx: dx,
      ty: dy,
      tz: dz,
      nx,
      ny,
      nz: 0,
      curvature: 0
    };
  });

  // Curvature from the horizontal tangent, using a wider stencil for stability.
  for (let i = 0; i < samples.length; i += 1) {
    const a = samples[Math.max(0, i - 3)];
    const b = samples[Math.min(samples.length - 1, i + 3)];
    const ds = b.s - a.s;
    if (ds < 1e-9) {
      samples[i].curvature = 0;
      continue;
    }
    const [ax, ay] = normalize2(a.tx, a.ty);
    const [bx, by] = normalize2(b.tx, b.ty);
    const dtx = (bx - ax) / ds;
    const dty = (by - ay) / ds;
    const t = samples[i];
    const [tx, ty] = normalize2(t.tx, t.ty);
    samples[i].curvature = tx * dty - ty * dtx;
  }

  const controlPointS = controlSampleIndex.map((index) =>
    index >= samples.length ? length : samples[index].s
  );

  const pointAt = (s: number): SplineSample => sampleAtS(samples, s);

  return { samples, length, controlPointS, pointAt };
}

function interpolateSample(a: SplineSample, b: SplineSample, ratio: number): SplineSample {
  const lerp = (u: number, v: number) => u + (v - u) * ratio;
  const tx = lerp(a.tx, b.tx);
  const ty = lerp(a.ty, b.ty);
  const tz = lerp(a.tz, b.tz);
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const nx = lerp(a.nx, b.nx);
  const ny = lerp(a.ny, b.ny);
  const nLen = Math.hypot(nx, ny) || 1;
  return {
    s: lerp(a.s, b.s),
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    z: lerp(a.z, b.z),
    tx: tx / tLen,
    ty: ty / tLen,
    tz: tz / tLen,
    nx: nx / nLen,
    ny: ny / nLen,
    nz: 0,
    curvature: lerp(a.curvature, b.curvature)
  };
}

export function sampleAtS(samples: SplineSample[], s: number): SplineSample {
  if (samples.length === 0) throw new Error('Cannot sample an empty spline.');
  if (!Number.isFinite(s) || s <= samples[0].s) return samples[0];
  const last = samples[samples.length - 1];
  if (s >= last.s) return last;

  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].s <= s) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[high];
  const span = b.s - a.s;
  const ratio = span > 1e-12 ? (s - a.s) / span : 0;
  return interpolateSample(a, b, ratio);
}

/**
 * Resamples a spline at a fixed spatial step. The final sample always lands
 * exactly on the end of the track, so the run never stops short.
 */
export function resampleAtStep(spline: Spline, step = 0.2): SplineSample[] {
  if (step <= 0) throw new Error('Step must be positive.');
  const out: SplineSample[] = [];
  for (let s = 0; s < spline.length; s += step) {
    out.push(spline.pointAt(s));
  }
  out.push(spline.pointAt(spline.length));
  return out;
}

export function horizontalTangent(sample: SplineSample): [number, number] {
  return normalize2(sample.tx, sample.ty);
}

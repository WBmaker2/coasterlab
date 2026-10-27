import { MAX_G, MIN_POINT_SPACING } from '../physics/constants';
import { simulateTrack } from '../physics/integrate';
import { analyzeLoop } from '../physics/safety';
import type { RunResult } from '../physics/cart';
import { buildSpline, type Spline } from './spline';
import type { Track } from './types';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  status: CheckStatus;
  run: RunResult;
  spline: Spline;
  intersections: Intersection[];
}

export interface Intersection {
  s1: number;
  s2: number;
  x: number;
  y: number;
}

interface SegmentPoint {
  x: number;
  y: number;
  s: number;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Returns the crossing point of two 2D segments, or null. */
function segmentIntersection(
  a: SegmentPoint,
  b: SegmentPoint,
  c: SegmentPoint,
  d: SegmentPoint
): { x: number; y: number } | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denominator = cross(rX, rY, sX, sY);
  if (Math.abs(denominator) < 1e-10) return null;
  const qX = c.x - a.x;
  const qY = c.y - a.y;
  const t = cross(qX, qY, sX, sY) / denominator;
  const u = cross(qX, qY, rX, rY) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rX, y: a.y + t * rY };
}

/**
 * Finds side-view crossings. Adjacent samples and the intentional crossing
 * inside a marked loop are filtered out by the caller.
 */
export function findSelfIntersections(spline: Spline, step = 0.75): Intersection[] {
  const points: SegmentPoint[] = [];
  for (let s = 0; s < spline.length; s += step) {
    const sample = spline.pointAt(s);
    points.push({ x: sample.x, y: sample.y, s });
  }
  const end = spline.pointAt(spline.length);
  points.push({ x: end.x, y: end.y, s: spline.length });

  const hits: Intersection[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 2; j < points.length - 1; j += 1) {
      const a = points[i];
      const b = points[i + 1];
      const c = points[j];
      const d = points[j + 1];
      if (Math.abs(c.s - b.s) < 2.5) continue;
      if (Math.abs(d.s - a.s) < 2.5) continue;
      const hit = segmentIntersection(a, b, c, d);
      if (!hit) continue;
      if (
        hits.some(
          (existing) =>
            Math.abs(existing.x - hit.x) < 0.2 &&
            Math.abs(existing.y - hit.y) < 0.2 &&
            Math.abs(existing.s1 - a.s) < 2
        )
      ) {
        continue;
      }
      hits.push({ x: hit.x, y: hit.y, s1: a.s, s2: c.s });
      if (hits.length >= 8) return hits;
    }
  }
  return hits;
}

export function validateTrack(track: Track, existingSpline?: Spline): ValidationResult {
  const checks: ValidationCheck[] = [];
  let spline: Spline;
  try {
    spline = existingSpline ?? buildSpline(track.points);
  } catch {
    const fallback = buildSpline([
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    ]);
    return {
      checks: [
        {
          id: 'points',
          label: '제어점',
          status: 'fail',
          detail: '제어점이 2개 이상 필요합니다.'
        }
      ],
      status: 'fail',
      run: simulateTrack(track),
      spline: fallback,
      intersections: []
    };
  }

  const run = simulateTrack(track, spline);

  const invalidPoint = track.points.some(
    (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
  );
  const enoughPoints = track.points.length >= 2 && !invalidPoint;
  checks.push({
    id: 'points',
    label: '제어점',
    status: enoughPoints ? 'pass' : 'fail',
    detail: enoughPoints
      ? `${track.points.length}개의 제어점이 유효합니다.`
      : '제어점이 2개 이상 필요하고 모든 좌표가 유한해야 합니다.'
  });

  let spacingOk = true;
  let shortest = Infinity;
  for (let i = 1; i < track.points.length; i += 1) {
    const previous = track.points[i - 1];
    const current = track.points[i];
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    shortest = Math.min(shortest, distance);
    if (distance < MIN_POINT_SPACING) spacingOk = false;
  }
  checks.push({
    id: 'spacing',
    label: '제어점 간격',
    status: spacingOk ? 'pass' : 'fail',
    detail: spacingOk
      ? `가장 가까운 이웃 간격은 ${shortest.toFixed(1)} m입니다.`
      : '겹치거나 너무 가까운 제어점이 있습니다. 점을 떨어뜨리세요.'
  });

  const start = track.points[0];
  const finish = track.points[track.points.length - 1];
  const drop = start && finish ? start.y - finish.y : 0;
  checks.push({
    id: 'drop',
    label: '출발 · 도착 높이',
    status: drop > 0.5 ? 'pass' : 'fail',
    detail:
      drop > 0.5
        ? `출발점이 도착점보다 ${drop.toFixed(1)} m 높습니다.`
        : '출발점이 도착점보다 높아야 카트가 끝까지 갈 수 있습니다.'
  });

  const intersections = findSelfIntersections(spline);
  let loopStart = -Infinity;
  let loopEnd = Infinity;
  if (track.loop) {
    loopStart = spline.controlPointS[track.loop.startIndex] ?? 0;
    loopEnd = spline.controlPointS[track.loop.endIndex] ?? spline.length;
  }
  const blockedIntersections = intersections.filter((hit) => {
    if (!track.loop) return true;
    const inLoop = (s: number) => s >= loopStart - 10 && s <= loopEnd + 10;
    return !(inLoop(hit.s1) && inLoop(hit.s2));
  });
  checks.push({
    id: 'intersection',
    label: '트랙 교차',
    status: blockedIntersections.length === 0 ? 'pass' : 'fail',
    detail:
      blockedIntersections.length === 0
        ? track.loop
          ? '루프 안의 의도된 교차만 있습니다.'
          : '측면에서 트랙이 스스로 교차하지 않습니다.'
        : `의도하지 않은 교차가 ${blockedIntersections.length}곳 있습니다.`
  });

  if (track.loop) {
    const analysis = analyzeLoop(track, spline, run);
    const top = analysis?.top ?? null;
    let status: CheckStatus = 'pass';
    let detail = '';
    if (!analysis) {
      status = 'fail';
      detail = '루프 정보를 읽을 수 없습니다.';
    } else if (!top) {
      status = 'fail';
      detail = '카트가 루프 꼭대기에 도달하지 못합니다.';
    } else if (top.gForce < 0) {
      status = 'fail';
      detail = `꼭대기 G-force가 ${top.gForce.toFixed(2)} G입니다. v² < gR이라 트랙이 카트를 당겨야 합니다.`;
    } else if (top.gForce < 0.15) {
      status = 'warn';
      detail = `꼭대기에서 ${top.gForce.toFixed(2)} G로 아슬아슬합니다.`;
    } else {
      detail = `꼭대기 G-force ${top.gForce.toFixed(2)} G · 필요 속도 ${analysis.requiredSpeed.toFixed(1)} m/s.`;
    }
    checks.push({ id: 'loop', label: '루프 통과 조건', status, detail });
  }

  let stallStatus: CheckStatus = 'pass';
  let stallDetail = '카트가 트랙 끝까지 주행합니다.';
  if (run.stalled) {
    stallStatus = 'fail';
    stallDetail = `S=${(run.stallS ?? 0).toFixed(1)} m에서 멈춥니다. 출발 높이를 더 확보하세요.`;
  } else if (run.timedOut) {
    stallStatus = 'warn';
    stallDetail = '시뮬레이션 시간이 너무 깁니다.';
  }
  checks.push({ id: 'stall', label: '주행 완주', status: stallStatus, detail: stallDetail });

  let gStatus: CheckStatus = 'pass';
  let gDetail = `최대 ${run.maxG.toFixed(2)} G · 안전 기준 ${MAX_G} G 이하.`;
  if (run.maxG > MAX_G) {
    gStatus = 'fail';
    gDetail = `최대 ${run.maxG.toFixed(2)} G가 안전 기준 ${MAX_G} G를 넘습니다.`;
  } else if (run.maxG > 5.1) {
    gStatus = 'warn';
    gDetail = `최대 ${run.maxG.toFixed(2)} G로 기준에 가깝습니다.`;
  }
  checks.push({ id: 'g-force', label: 'G-force 한계', status: gStatus, detail: gDetail });

  const hasDanger = run.minG < -0.5;
  const hasAirtime = run.minG < -0.05;
  checks.push({
    id: 'contact',
    label: '트랙 접촉',
    status: hasDanger ? 'fail' : hasAirtime ? 'warn' : 'pass',
    detail: hasDanger
      ? `최소 ${run.minG.toFixed(2)} G · 수직항력이 0보다 작아 이탈 위험이 있습니다.`
      : hasAirtime
        ? `최소 ${run.minG.toFixed(2)} G · 짧은 에어타임이 감지되었습니다.`
        : `최소 ${run.minG.toFixed(2)} G · 카트가 트랙에 붙어 있습니다.`
  });

  const overall: CheckStatus = checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'warn')
      ? 'warn'
      : 'pass';

  return { checks, status: overall, run, spline, intersections };
}

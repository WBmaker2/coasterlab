import { describe, expect, it } from 'vitest';
import { buildSpline } from '../../track/spline';
import { findSelfIntersections } from '../../track/validation';
import type { TrackPoint } from '../../track/types';

describe('Catmull-Rom spline', () => {
  it('passes through every control point', () => {
    const points: TrackPoint[] = [
      { x: 0, y: 20 },
      { x: 12, y: 16 },
      { x: 24, y: 4 },
      { x: 40, y: 8 },
      { x: 52, y: 2 }
    ];
    const spline = buildSpline(points);
    points.forEach((point, index) => {
      const sample = spline.pointAt(spline.controlPointS[index]);
      expect(sample.x).toBeCloseTo(point.x, 5);
      expect(sample.y).toBeCloseTo(point.y, 5);
    });
  });

  it('computes the arc length of a straight line', () => {
    const spline = buildSpline([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 }
    ]);
    expect(spline.length).toBeCloseTo(20, 2);
  });

  it('approximates the arc length of a circular arc', () => {
    const radius = 10;
    const points: TrackPoint[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const angle = (i / 8) * (Math.PI / 2);
      points.push({ x: radius * Math.sin(angle), y: radius * (1 - Math.cos(angle)) });
    }
    const spline = buildSpline(points);
    const expected = radius * (Math.PI / 2);
    expect(spline.length).toBeGreaterThan(expected * 0.98);
    expect(spline.length).toBeLessThan(expected * 1.02);
  });

  it('keeps curvature near 1/r on a circle', () => {
    const radius = 10;
    const points: TrackPoint[] = [];
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      points.push({ x: radius * Math.sin(angle), y: radius * (1 - Math.cos(angle)) });
    }
    points.push({ x: 0, y: 0 });
    const spline = buildSpline(points);
    const middle = spline.samples
      .filter((sample) => sample.y > radius && sample.y < radius * 1.5)
      .map((sample) => sample.curvature)
      .sort((a, b) => a - b);
    const median = middle[Math.floor(middle.length / 2)];
    expect(median).toBeGreaterThan(0.08);
    expect(median).toBeLessThan(0.13);
  });

  it('detects self-intersections in the side view', () => {
    const spline = buildSpline([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 }
    ]);
    const hits = findSelfIntersections(spline);
    expect(hits.length).toBeGreaterThan(0);
  });
});

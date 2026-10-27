import { describe, expect, it } from 'vitest';
import { simulateTrack } from '../../physics/integrate';
import { gForce, minimumLoopSpeed, normalForce } from '../../physics/forces';
import { GRAVITY, CART_MASS, MAX_G } from '../../physics/constants';
import { getPreset } from '../../track/pieces';
import { buildSpline } from '../../track/spline';
import type { Track } from '../../track/types';

describe('energy model', () => {
  it('conserves mechanical energy on a frictionless track', () => {
    const track = getPreset('hill')!;
    const run = simulateTrack(track);
    expect(run.samples.length).toBeGreaterThan(20);
    for (const sample of run.samples) {
      const total = sample.kinetic + sample.potential + sample.thermal;
      expect(Math.abs(total - run.initialEnergy)).toBeLessThan(run.initialEnergy * 0.01);
    }
  });

  it('converts friction work into thermal energy', () => {
    const track: Track = {
      id: 'flat',
      nameKo: 'flat',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 }
      ],
      friction: 0.1,
      gravity: GRAVITY,
      startSpeed: 10
    };
    const run = simulateTrack(track);
    const expected = 0.1 * GRAVITY * CART_MASS * 20;
    const last = run.samples[run.samples.length - 1];
    expect(last.thermal).toBeGreaterThan(expected * 0.97);
    expect(last.thermal).toBeLessThan(expected * 1.03);
  });

  it('matches sqrt(2gh + v0²) at the bottom of a frictionless drop', () => {
    const track: Track = {
      id: 'drop',
      nameKo: 'drop',
      points: [
        { x: 0, y: 10 },
        { x: 10, y: 5 },
        { x: 20, y: 0 }
      ],
      friction: 0,
      gravity: GRAVITY,
      startSpeed: 3
    };
    const run = simulateTrack(track);
    const last = run.samples[run.samples.length - 1];
    const expected = Math.sqrt(2 * GRAVITY * 10 + 3 * 3);
    expect(last.speed).toBeCloseTo(expected, 2);
  });

  it('stops the cart when it cannot reach a higher point', () => {
    const track: Track = {
      id: 'stall',
      nameKo: 'stall',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 }
      ],
      friction: 0,
      gravity: GRAVITY,
      startSpeed: 0
    };
    const run = simulateTrack(track);
    expect(run.stalled).toBe(true);
    expect(run.samples[run.samples.length - 1].speed).toBe(0);
  });
});

describe('loop forces', () => {
  it('uses v² = gR as the zero-G loop condition', () => {
    const radius = 8;
    const speed = minimumLoopSpeed(radius);
    expect(gForce(speed, 1 / radius, -1)).toBeCloseTo(0, 5);
    expect(gForce(Math.sqrt(2 * GRAVITY * radius), 1 / radius, -1)).toBeCloseTo(1, 5);
  });

  it('matches the analytical valley normal force', () => {
    const speed = 20;
    const curvature = 1 / 10;
    const normal = normalForce(speed, curvature, 1);
    expect(normal / (CART_MASS * GRAVITY)).toBeCloseTo((speed * speed) / (GRAVITY * 10) + 1, 5);
  });

  it('runs the loop preset without NaN and with a positive top G', () => {
    const track = getPreset('loop')!;
    const spline = buildSpline(track.points);
    const run = simulateTrack(track, spline);
    for (const sample of run.samples) {
      expect(Number.isFinite(sample.speed)).toBe(true);
      expect(Number.isFinite(sample.gForce)).toBe(true);
      expect(Number.isFinite(sample.normalForce)).toBe(true);
    }
    const top = run.samples
      .filter(
        (sample) =>
          track.loop &&
          sample.s >= spline.controlPointS[track.loop.startIndex] &&
          sample.s <= spline.controlPointS[track.loop.endIndex]
      )
      .reduce((best, sample) => (sample.y > best.y ? sample : best));
    expect(top.gForce).toBeGreaterThan(0);
  });

  it('flags excessive G on the tight valley preset', () => {
    const track = getPreset('gforce')!;
    const run = simulateTrack(track);
    expect(run.maxG).toBeGreaterThan(MAX_G);
  });

  it('does not produce NaN for extreme inputs', () => {
    const track: Track = {
      id: 'extreme',
      nameKo: 'extreme',
      points: [
        { x: -1000, y: 1000 },
        { x: 0, y: -2000 },
        { x: 1000, y: 500 }
      ],
      friction: 0.15,
      gravity: 20,
      startSpeed: 200
    };
    const run = simulateTrack(track);
    for (const sample of run.samples) {
      expect(Number.isFinite(sample.speed)).toBe(true);
      expect(Number.isFinite(sample.x)).toBe(true);
      expect(Number.isFinite(sample.y)).toBe(true);
    }
  });
});

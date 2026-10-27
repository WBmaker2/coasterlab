import { describe, expect, it } from 'vitest';
import { validateTrack } from '../../track/validation';
import { getPreset, LOOP_SLOW_TRACK } from '../../track/pieces';
import { buildSpline } from '../../track/spline';
import type { Track } from '../../track/types';

describe('track validation', () => {
  it('rejects coincident control points', () => {
    const track: Track = {
      id: 'bad',
      nameKo: 'bad',
      points: [
        { x: 0, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      ],
      friction: 0,
      gravity: 9.81,
      startSpeed: 1
    };
    const result = validateTrack(track);
    const spacing = result.checks.find((check) => check.id === 'spacing');
    expect(spacing?.status).toBe('fail');
    expect(result.status).toBe('fail');
  });

  it('rejects an unintended side-view crossing', () => {
    const track: Track = {
      id: 'cross',
      nameKo: 'cross',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      ],
      friction: 0,
      gravity: 9.81,
      startSpeed: 1
    };
    const result = validateTrack(track);
    const crossing = result.checks.find((check) => check.id === 'intersection');
    expect(crossing?.status).toBe('fail');
  });

  it('accepts the intended crossing in the loop preset', () => {
    const track = getPreset('loop')!;
    const result = validateTrack(track);
    const crossing = result.checks.find((check) => check.id === 'intersection');
    expect(crossing?.status).toBe('pass');
    const loop = result.checks.find((check) => check.id === 'loop');
    expect(loop?.status).toBe('pass');
  });

  it('fails the slow loop safety condition', () => {
    const spline = buildSpline(LOOP_SLOW_TRACK.points);
    const result = validateTrack(LOOP_SLOW_TRACK, spline);
    const loop = result.checks.find((check) => check.id === 'loop');
    expect(loop?.status).toBe('fail');
    expect(result.run.stalled).toBe(false);
  });

  it('detects excessive G-force on the valley preset', () => {
    const track = getPreset('gforce')!;
    const result = validateTrack(track);
    const g = result.checks.find((check) => check.id === 'g-force');
    expect(g?.status).toBe('fail');
  });
});

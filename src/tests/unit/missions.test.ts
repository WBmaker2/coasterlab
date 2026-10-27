import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../features/missions/missions';
import { getMissionTrack } from '../../track/pieces';
import { buildSpline } from '../../track/spline';
import { simulateTrack } from '../../physics/integrate';

describe('mission data', () => {
  it('has five missions with valid prediction answers', () => {
    expect(MISSIONS).toHaveLength(5);
    for (const mission of MISSIONS) {
      expect(mission.prediction.options).toContain(mission.prediction.answer);
      expect(mission.prediction.options.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('loads a valid track and run for every mission', () => {
    for (const mission of MISSIONS) {
      const track = getMissionTrack(mission.trackPreset);
      expect(track, mission.id).not.toBeNull();
      if (!track) continue;
      const spline = buildSpline(track.points);
      const run = simulateTrack(track, spline);
      expect(run.samples.length, mission.id).toBeGreaterThan(10);
      expect(run.stalled, mission.id).toBe(false);
      expect(Number.isFinite(run.maxG), mission.id).toBe(true);
    }
  });

  it('keeps mission 5 as a slow-loop investigation', () => {
    const track = getMissionTrack('loop-slow');
    expect(track?.friction).toBeGreaterThan(0);
    const spline = buildSpline(track!.points);
    const run = simulateTrack(track!, spline);
    expect(run.stalled).toBe(false);
    expect(run.maxG).toBeLessThan(6.5);
  });
});

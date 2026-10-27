import type { Sample } from './cart';
import type { RunResult } from './cart';
import type { Spline } from '../track/spline';
import type { Track } from '../track/types';
import { minimumLoopSpeed } from './forces';
import { MAX_G } from './constants';

export interface LoopAnalysis {
  startS: number;
  endS: number;
  top: Sample | null;
  topG: number | null;
  requiredSpeed: number;
  actualSpeed: number | null;
}

export function analyzeLoop(track: Track, spline: Spline, run: RunResult): LoopAnalysis | null {
  if (!track.loop) return null;
  const startS = spline.controlPointS[track.loop.startIndex] ?? 0;
  const endS = spline.controlPointS[track.loop.endIndex] ?? spline.length;
  const window = run.samples.filter((sample) => sample.s >= startS - 1 && sample.s <= endS + 1);
  let top: Sample | null = null;
  for (const sample of window) {
    if (!top || sample.y > top.y) top = sample;
  }
  const requiredSpeed = minimumLoopSpeed(track.loop.radius, track.gravity);
  return {
    startS,
    endS,
    top,
    topG: top ? top.gForce : null,
    requiredSpeed,
    actualSpeed: top ? top.speed : null
  };
}

export function safetyLabel(run: RunResult): '안전' | '주의' | '위험' {
  if (run.stalled || run.derailment || run.maxG > MAX_G) return '위험';
  if (run.maxG > 5 || run.timedOut) return '주의';
  return '안전';
}

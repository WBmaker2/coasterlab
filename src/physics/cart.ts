export interface Sample {
  /** Arc length in metres. */
  s: number;
  /** Simulated time in seconds. */
  t: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  /** Joules. */
  kinetic: number;
  potential: number;
  thermal: number;
  /** Newtons. Negative means the open track would need to pull the cart. */
  normalForce: number;
  /** Normal force divided by weight. */
  gForce: number;
  curvature: number;
}

export interface RunResult {
  samples: Sample[];
  length: number;
  duration: number;
  initialEnergy: number;
  maxSpeed: number;
  maxSpeedS: number;
  maxHeight: number;
  maxG: number;
  maxGS: number;
  minG: number;
  minGS: number;
  stalled: boolean;
  stallS: number | null;
  derailment: boolean;
  derailS: number | null;
  timedOut: boolean;
}

export interface SampleAtTime {
  sample: Sample;
  index: number;
  ratio: number;
}

export const EMPTY_RUN: RunResult = {
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

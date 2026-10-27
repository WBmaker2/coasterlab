import type { CameraMode, Track } from '../track/types';
import { DEFAULT_TRACK, cloneTrack } from '../track/pieces';

export type Route = 'design' | 'missions' | 'teacher';
export type ViewMode = 'editor' | '3d';

export interface MissionState {
  currentId: string | null;
  answers: Record<string, string>;
  completed: string[];
  scores: Record<string, number>;
  attempts: Record<string, number>;
}

export interface Preferences {
  reducedMotion: boolean;
  showForces: boolean;
  showGraphLabels: boolean;
}

export interface AppState {
  route: Route;
  track: Track;
  selectedPoint: number | null;
  view: ViewMode;
  camera: CameraMode;
  comfortMode: boolean;
  mission: MissionState;
  preferences: Preferences;
  enabledMissions: string[];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function createDefaultState(): AppState {
  return {
    route: 'design',
    track: cloneTrack(DEFAULT_TRACK),
    selectedPoint: 0,
    view: 'editor',
    camera: 'orbit',
    comfortMode: false,
    mission: {
      currentId: null,
      answers: {},
      completed: [],
      scores: {},
      attempts: {}
    },
    preferences: {
      reducedMotion: prefersReducedMotion(),
      showForces: false,
      showGraphLabels: true
    },
    enabledMissions: ['energy-fastest', 'friction-thermal', 'loop-top-g', 'gforce-valley', 'loop-slow']
  };
}

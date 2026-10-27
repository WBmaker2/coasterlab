export interface TrackPoint {
  x: number;
  y: number;
  z?: number;
  locked?: boolean;
}

export interface LoopInfo {
  /** Index of the first control point of the loop in Track.points. */
  startIndex: number;
  /** Index of the control point where the loop rejoins the main line. */
  endIndex: number;
  /** Approximate top radius in metres, used for the checklist copy. */
  radius: number;
}

export interface Track {
  id: string;
  nameKo: string;
  points: TrackPoint[];
  /** Coulomb friction coefficient. 0 disables friction. */
  friction: number;
  /** m/s². Kept on the track for teacher experiments. */
  gravity: number;
  /** m/s at s = 0. */
  startSpeed: number;
  loop?: LoopInfo;
}

export type CameraMode = 'follow' | 'orbit' | 'side';

export interface TrackPreset {
  id: string;
  nameKo: string;
  descriptionKo: string;
  track: Track;
}

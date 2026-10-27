import type { AppState, MissionState, Preferences } from '../app/state';
import { createDefaultState } from '../app/state';
import { cloneTrack, getPreset } from '../track/pieces';
import type { Track } from '../track/types';

const STORAGE_KEY = 'coasterlab.progress.v1';

interface SavedSnapshot {
  version: 1;
  track: Track;
  mission: MissionState;
  preferences: Preferences;
  enabledMissions: string[];
  comfortMode: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Track>;
  if (!Array.isArray(candidate.points) || candidate.points.length < 2) return null;
  const points = candidate.points
    .filter(
      (point): point is Track['points'][number] =>
        !!point && typeof point === 'object' && isFiniteNumber(point.x) && isFiniteNumber(point.y)
    )
    .map((point) => ({
      x: point.x,
      y: point.y,
      z: isFiniteNumber(point.z) ? point.z : 0,
      locked: point.locked === true
    }));
  if (points.length < 2) return null;
  const loop = candidate.loop;
  const validLoop =
    loop &&
    Number.isInteger(loop.startIndex) &&
    Number.isInteger(loop.endIndex) &&
    loop.startIndex >= 0 &&
    loop.endIndex > loop.startIndex &&
    loop.endIndex < points.length &&
    isFiniteNumber(loop.radius)
      ? { ...loop }
      : undefined;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : 'saved',
    nameKo: typeof candidate.nameKo === 'string' ? candidate.nameKo : '저장된 트랙',
    points,
    friction: isFiniteNumber(candidate.friction) ? Math.min(0.2, Math.max(0, candidate.friction)) : 0,
    gravity: isFiniteNumber(candidate.gravity) ? Math.min(20, Math.max(1, candidate.gravity)) : 9.81,
    startSpeed: isFiniteNumber(candidate.startSpeed)
      ? Math.min(40, Math.max(0, candidate.startSpeed))
      : 1,
    loop: validLoop
  };
}

function sanitizeMission(value: unknown): MissionState {
  const fallback = createDefaultState().mission;
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<MissionState>;
  const stringRecord = (record: unknown): Record<string, string> => {
    if (!record || typeof record !== 'object') return {};
    return Object.fromEntries(
      Object.entries(record as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  };
  const numberRecord = (record: unknown): Record<string, number> => {
    if (!record || typeof record !== 'object') return {};
    return Object.fromEntries(
      Object.entries(record as Record<string, unknown>).filter((entry): entry is [string, number] =>
        isFiniteNumber(entry[1])
      )
    );
  };
  return {
    currentId: typeof candidate.currentId === 'string' ? candidate.currentId : null,
    answers: stringRecord(candidate.answers),
    completed: Array.isArray(candidate.completed)
      ? candidate.completed.filter((id): id is string => typeof id === 'string')
      : [],
    scores: numberRecord(candidate.scores),
    attempts: numberRecord(candidate.attempts)
  };
}

export function loadSnapshot(base: AppState): AppState {
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SavedSnapshot>;
    const track = sanitizeTrack(parsed.track) ?? cloneTrack(getPreset('hill') ?? base.track);
    const mission = sanitizeMission(parsed.mission);
    const prefs = (parsed.preferences ?? {}) as Partial<Preferences>;
    const enabled = Array.isArray(parsed.enabledMissions)
      ? parsed.enabledMissions.filter((id): id is string => typeof id === 'string')
      : base.enabledMissions;
    return {
      ...base,
      track,
      selectedPoint: 0,
      mission,
      comfortMode: parsed.comfortMode === true,
      preferences: {
        reducedMotion:
          typeof prefs.reducedMotion === 'boolean'
            ? prefs.reducedMotion
            : base.preferences.reducedMotion,
        showForces: prefs.showForces === true,
        showGraphLabels: typeof prefs.showGraphLabels === 'boolean' ? prefs.showGraphLabels : true
      },
      enabledMissions: Array.isArray(parsed.enabledMissions) ? enabled : base.enabledMissions
    };
  } catch {
    return base;
  }
}

let saveTimer: number | undefined;

export function saveSnapshot(state: AppState): void {
  if (typeof window === 'undefined') return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const snapshot: SavedSnapshot = {
        version: 1,
        track: state.track,
        mission: state.mission,
        preferences: state.preferences,
        enabledMissions: state.enabledMissions,
        comfortMode: state.comfortMode
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage can be unavailable in private mode; the session still works.
    }
  }, 180);
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

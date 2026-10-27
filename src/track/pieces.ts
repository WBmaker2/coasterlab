import type { Track, TrackPreset } from './types';

const hill: Track = {
  id: 'hill',
  nameKo: '이중 언덕',
  points: [
    { x: 0, y: 24, z: 0 },
    { x: 12, y: 23.5, z: 0.8 },
    { x: 24, y: 18, z: 1.7 },
    { x: 34, y: 12, z: 2.2 },
    { x: 44, y: 6, z: 1.4 },
    { x: 54, y: 4, z: 0 },
    { x: 66, y: 4.4, z: -1.3 },
    { x: 78, y: 4.8, z: -2.1 },
    { x: 90, y: 4.6, z: -1.2 },
    { x: 102, y: 4.8, z: 0 }
  ],
  friction: 0,
  gravity: 9.81,
  startSpeed: 1
};

const friction: Track = {
  id: 'friction',
  nameKo: '긴 내리막',
  points: [
    { x: 0, y: 20, z: 0 },
    { x: 12, y: 19, z: 0.6 },
    { x: 24, y: 15, z: 1.2 },
    { x: 36, y: 11, z: 1.5 },
    { x: 48, y: 8, z: 1.1 },
    { x: 60, y: 6, z: 0.4 },
    { x: 72, y: 4, z: -0.4 },
    { x: 84, y: 3, z: -1 },
    { x: 96, y: 2, z: 0 }
  ],
  friction: 0.07,
  gravity: 9.81,
  startSpeed: 2
};

const loop: Track = {
  id: 'loop',
  nameKo: '수직 루프',
  points: [
    { x: 0, y: 24, z: 0 },
    { x: 8, y: 22, z: 0 },
    { x: 16, y: 18.5, z: 0 },
    { x: 22, y: 13.5, z: 0 },
    { x: 28, y: 8, z: 0 },
    { x: 33, y: 3.8, z: 0 },
    { x: 38, y: 1.2, z: 0 },
    { x: 41, y: 0.3, z: 0 },
    { x: 44, y: 0, z: 0 },
    { x: 47.11, y: 0.32, z: 0 },
    { x: 50, y: 1.27, z: 0 },
    { x: 52.49, y: 2.78, z: 0 },
    { x: 54.39, y: 4.75, z: 0 },
    { x: 55.57, y: 7.04, z: 0 },
    { x: 55.91, y: 9.5, z: 0 },
    { x: 55.3, y: 11.96, z: 0 },
    { x: 53.78, y: 14.25, z: 0 },
    { x: 51.52, y: 16.22, z: 0 },
    { x: 48.94, y: 17.73, z: 0 },
    { x: 46.39, y: 18.68, z: 0 },
    { x: 44, y: 19, z: 0 },
    { x: 41.61, y: 18.68, z: 0 },
    { x: 39.06, y: 17.73, z: 0 },
    { x: 36.48, y: 16.22, z: 0 },
    { x: 34.22, y: 14.25, z: 0 },
    { x: 32.7, y: 11.96, z: 0 },
    { x: 32.09, y: 9.5, z: 0 },
    { x: 32.43, y: 7.04, z: 0 },
    { x: 33.61, y: 4.75, z: 0 },
    { x: 35.51, y: 2.78, z: 0 },
    { x: 38, y: 1.27, z: 0 },
    { x: 40.89, y: 0.32, z: 0 },
    { x: 44, y: 0, z: 0 },
    { x: 48, y: 0, z: 0 },
    { x: 58, y: 0, z: 0 },
    { x: 70, y: 0, z: 0 },
    { x: 84, y: 0, z: 0 }
  ],
  friction: 0,
  gravity: 9.81,
  startSpeed: 1,
  loop: { startIndex: 8, endIndex: 32, radius: 8 }
};

const loopSlow: Track = {
  ...cloneTrack(loop),
  id: 'loop-slow',
  nameKo: '느린 루프',
  friction: 0.03,
  startSpeed: 0.5
};

const gforce: Track = {
  id: 'gforce',
  nameKo: '급경사 골짜기',
  points: [
    { x: 0, y: 16, z: 0 },
    { x: 10, y: 15, z: 0 },
    { x: 18, y: 8, z: 0 },
    { x: 24, y: 1, z: 0 },
    { x: 28, y: 0, z: 0 },
    { x: 32, y: 2, z: 0 },
    { x: 38, y: 8, z: 0 },
    { x: 46, y: 13, z: 0 },
    { x: 56, y: 14, z: 0 },
    { x: 66, y: 11, z: 0 },
    { x: 76, y: 5, z: 0 },
    { x: 86, y: 1, z: 0 }
  ],
  friction: 0,
  gravity: 9.81,
  startSpeed: 1
};

const sbank: Track = {
  id: 'sbank',
  nameKo: 'S자 강하',
  points: [
    { x: 0, y: 18, z: 0 },
    { x: 10, y: 17, z: 0 },
    { x: 20, y: 13, z: 3 },
    { x: 30, y: 10, z: 6 },
    { x: 40, y: 8.5, z: 4 },
    { x: 50, y: 8.5, z: 0 },
    { x: 60, y: 7, z: -4 },
    { x: 70, y: 4, z: -6 },
    { x: 80, y: 2, z: -3 },
    { x: 90, y: 0, z: 0 }
  ],
  friction: 0.01,
  gravity: 9.81,
  startSpeed: 1
};

export const blankTrack: Track = {
  id: 'blank',
  nameKo: '새 트랙',
  points: [
    { x: 0, y: 18, z: 0 },
    { x: 20, y: 14, z: 0 },
    { x: 40, y: 6, z: 0 },
    { x: 60, y: 4, z: 0 },
    { x: 80, y: 1, z: 0 }
  ],
  friction: 0,
  gravity: 9.81,
  startSpeed: 1
};

export const PRESETS: TrackPreset[] = [
  {
    id: 'hill',
    nameKo: '이중 언덕',
    descriptionKo: '위치에너지가 운동에너지로 바뀌는 기본 트랙',
    track: hill
  },
  {
    id: 'friction',
    nameKo: '긴 내리막',
    descriptionKo: '마찰이 역학적 에너지를 열로 바꾸는 트랙',
    track: friction
  },
  {
    id: 'loop',
    nameKo: '수직 루프',
    descriptionKo: '꼭대기에서 수직항력이 0에 가까워지는 루프',
    track: loop
  },
  {
    id: 'gforce',
    nameKo: '급경사 골짜기',
    descriptionKo: '바닥에서 G-force가 커지는 급경사 트랙',
    track: gforce
  },
  {
    id: 'sbank',
    nameKo: 'S자 강하',
    descriptionKo: '3D에서 좌우로 휘어지는 강하 트랙',
    track: sbank
  }
];

export function cloneTrack(track: Track): Track {
  return {
    ...track,
    points: track.points.map((point) => ({ ...point })),
    loop: track.loop ? { ...track.loop } : undefined
  };
}

export function getPreset(id: string): Track | null {
  if (id === 'blank') return cloneTrack(blankTrack);
  const preset = PRESETS.find((item) => item.id === id);
  return preset ? cloneTrack(preset.track) : null;
}

export function getMissionTrack(id: string): Track | null {
  if (id === 'loop-slow') return cloneTrack(loopSlow);
  return getPreset(id);
}

export const DEFAULT_TRACK = cloneTrack(hill);

export const LOOP_SLOW_TRACK = cloneTrack(loopSlow);

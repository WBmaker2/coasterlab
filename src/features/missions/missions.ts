import rawMissions from '../../data/missions.json';

export type Concept = 'energy' | 'friction' | 'circular' | 'g-force' | 'safety';

export interface Mission {
  id: string;
  titleKo: string;
  concept: Concept;
  promptKo: string;
  trackPreset: string;
  prediction: {
    options: string[];
    answer: string;
  };
  explanationKo: string;
  takeawayKo: string;
  difficulty: 1 | 2 | 3;
}

export const MISSIONS = rawMissions as Mission[];

export const CONCEPT_LABEL: Record<Concept, string> = {
  energy: '에너지',
  friction: '마찰',
  circular: '원운동',
  'g-force': 'G-force',
  safety: '안전'
};

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '기본',
  2: '보통',
  3: '도전'
};

export function getMission(id: string | null | undefined): Mission | undefined {
  if (!id) return undefined;
  return MISSIONS.find((mission) => mission.id === id);
}

export function missionOrder(id: string): number {
  return MISSIONS.findIndex((mission) => mission.id === id) + 1;
}

export function nextMissionId(id: string): string | null {
  const index = MISSIONS.findIndex((mission) => mission.id === id);
  return index >= 0 && index < MISSIONS.length - 1 ? MISSIONS[index + 1].id : null;
}

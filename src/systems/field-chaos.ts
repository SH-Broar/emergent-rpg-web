import type { ChaosEffectKind, MetaProgress, RunState } from '@/data/schemas';
import { useDataStore } from '@/stores/data';

export const FRACTURED_TIME_CHAOS_ID = 'ch-fractured-time';
export const FRACTURED_TIME_ATTACK_BONUS = 0.25;

type StoryMeta = Pick<MetaProgress, 'unlockedChaosIds'> & { storyEndings?: { chaosUnlocked?: boolean } };
type ChaosRun = Pick<RunState, 'activeChaos'>;

/** Story Chaos is earned by a witnessed ending, never by spending souls. */
export function isFracturedTimeUnlocked(meta: StoryMeta): boolean {
  return meta.storyEndings?.chaosUnlocked === true;
}

function activeChaos(run: ChaosRun): { id: string; intensity: number }[] {
  const unique = new Map<string, number>();
  for (const entry of run.activeChaos ?? []) {
    const id = typeof entry === 'string' ? entry : entry.id;
    const intensity = typeof entry === 'string' ? 1 : Number(entry.intensity);
    if (!id || !Number.isFinite(intensity) || intensity < 1) continue;
    unique.set(id, Math.max(unique.get(id) ?? 1, Math.floor(intensity)));
  }
  return [...unique].map(([id, intensity]) => ({ id, intensity }));
}

export function hasFracturedTime(run: ChaosRun): boolean {
  return activeChaos(run).some(c => c.id === FRACTURED_TIME_CHAOS_ID);
}

/** Read the actual selected levels; rank comes from the field creature, including arc bosses. */
function sumEffect(run: ChaosRun, kind: ChaosEffectKind): number {
  const definitions = useDataStore().chaosDefs;
  let sum = 0;
  for (const active of activeChaos(run)) {
    const definition = definitions.get(active.id);
    if (definition?.effectKind !== kind || !definition.levels.length) continue;
    const level = definition.levels[Math.min(active.intensity, definition.levels.length) - 1]!;
    const amount = Number(level.param);
    if (Number.isFinite(amount)) sum += amount;
  }
  return Math.max(0, sum);
}

export function fieldChaosHpMultiplier(run: ChaosRun, rank: string): number {
  return 1 + sumEffect(run, 'enemy-hp-mul') + (rank === 'elite' || rank === 'boss' ? sumEffect(run, 'elite-hp-mul') : 0);
}

/** Applied when an attack is telegraphed, so its displayed damage matches its eventual hit. */
export function fieldChaosAttackMultiplier(run: ChaosRun, rank: string): number {
  return 1 + sumEffect(run, 'enemy-atk-mul') + (rank === 'boss' ? sumEffect(run, 'boss-atk-mul') : 0)
    + (hasFracturedTime(run) ? FRACTURED_TIME_ATTACK_BONUS : 0);
}

export function fieldChaosDefenseBonus(run: ChaosRun): number {
  return Math.floor(sumEffect(run, 'enemy-def-add'));
}

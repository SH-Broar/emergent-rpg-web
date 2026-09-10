import type { Card } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { instantiateCard, shuffle } from './deck';
import { rewardCard } from './reward-feed';

const IDS = ['c-tactic-water', 'c-tactic-spark', 'c-tactic-shove', 'c-tactic-fire', 'c-tactic-smoke', 'c-tactic-lure'];
export function starterTactics(): Card[] {
  const cards = useDataStore().cards;
  return IDS.slice(0, 3).map(id => cards.get(id)).filter((c): c is Card => !!c).map(instantiateCard);
}

export function offerTacticalReward(): void {
  const run = useRunStore().data;
  if (run.tacticalDraft?.length) return;
  const data = useDataStore();
  const cards = IDS.map(id => data.cards.get(id)).filter((c): c is Card => !!c);
  // A pending choice survives travel and cannot be overwritten by another result.
  run.tacticalDraft = shuffle(cards).slice(0, 3).map(c => ({ ...c }));
}

/** Full decks replace a basic card first; displaced cards remain in the collection. */
export function chooseTacticalReward(index: number | null): boolean {
  const run = useRunStore();
  const choices = run.data.tacticalDraft;
  if (!choices?.length) return false;
  if (index === null) { run.data.tacticalDraft = []; return true; }
  if (!Number.isInteger(index) || !choices[index]) return false;
  const card = choices[index];
  run.data.tacticalDraft = [];
  run.addCardToCollection(card);
  const instance = run.data.collection[run.data.collection.length - 1];
  if (!run.data.deck.some(c => c.instanceId === instance.instanceId)) {
    const basic = run.data.deck.findIndex(c => c.rank === 'basic');
    run.data.deck.splice(basic >= 0 ? basic : run.data.deck.length - 1, 1, instance);
  }
  rewardCard(card.name);
  return true;
}

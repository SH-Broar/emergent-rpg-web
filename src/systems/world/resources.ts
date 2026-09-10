/** Resource classification, independent of action labels, container tags and moral judgments. */
const FOOD_RESOURCE_IDS = new Set([
  'i-crop-grain', 'i-crop-grain-fine',
  'i-life-mush', 'i-life-mush-fine',
  'i-life-game', 'i-life-game-fine',
  'i-life-dried', 'i-life-dried-fine',
  'i-life-fish', 'i-life-fish-fine',
]);

const MATERIAL_TAGS: Record<string, readonly string[]> = {
  'i-life-char': ['fuel', 'processed'], 'i-life-char-fine': ['fuel', 'processed'],
  'i-life-ore': ['mineral'], 'i-life-ore-fine': ['mineral'],
  'i-life-charge': ['charge'], 'i-life-charge-fine': ['charge'],
  'raw-fiber': ['raw', 'fiber'], 'raw-stone': ['raw', 'mineral'],
  water: ['liquid', 'water'],
};

/** Unclassified tools/materials never become edible because of their name or location. */
export function isFoodResource(id: string): boolean { return FOOD_RESOURCE_IDS.has(id); }

/** Return a snapshot so saved evidence cannot change with mutable live entity tags. */
export function resourceTags(id: string | undefined): string[] {
  if (!id) return [];
  return isFoodResource(id) ? ['food'] : [...(MATERIAL_TAGS[id] ?? [])];
}

// color-narrative-defs.ts — 컬러 서사 레지스트리

const colorNarrativeRegistry = new Map<string, string[]>();

export function clearColorNarratives(): void {
  colorNarrativeRegistry.clear();
}

export function registerColorNarrative(key: string, lines: string[]): void {
  colorNarrativeRegistry.set(key, lines);
}

export function getColorNarrativeLines(
  elementName: string,
  type: 'rising' | 'falling' | 'peak' | 'npc_reaction',
): string[] {
  return colorNarrativeRegistry.get(elementName + '.' + type) ?? [];
}

export function getRandomColorNarrative(
  elementName: string,
  type: 'rising' | 'falling' | 'peak' | 'npc_reaction',
): string {
  const lines = getColorNarrativeLines(elementName, type);
  if (lines.length === 0) return '';
  return lines[Math.floor(Math.random() * lines.length)];
}

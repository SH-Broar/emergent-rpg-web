// dialogue-choice-init.ts — dialogue_choices.txt 파싱

import { DataSection } from './parser';
import { registerDialogueChoiceDef, clearDialogueChoiceDefs } from './dialogue-choice-defs';
import { DialogueChoiceDef, DialogueChoiceOption } from '../models/dialogue-choice';

function parseColorEffects(raw: string): { elementKey: string; delta: number }[] {
  if (!raw) return [];
  return raw.split(',').map(token => {
    const t = token.trim();
    const colon = t.indexOf(':');
    if (colon === -1) return null;
    return {
      elementKey: t.slice(0, colon).trim(),
      delta: parseFloat(t.slice(colon + 1).trim()) || 0,
    };
  }).filter(Boolean) as { elementKey: string; delta: number }[];
}

function parseOption(s: DataSection, n: number): DialogueChoiceOption {
  return {
    text: s.get(`option_${n}`, ''),
    response: s.get(`option_${n}_response`, ''),
    relationshipDelta: s.getFloat(`option_${n}_relationship`, 0),
    colorEffects: parseColorEffects(s.get(`option_${n}_color`, '')),
  };
}

export function initDialogueChoices(sections: DataSection[]): void {
  clearDialogueChoiceDefs();
  for (const s of sections) {
    const id = s.name;
    const npc = s.get('npc', '');
    if (!id || !npc) continue;

    const triggerRaw = s.get('trigger', 'relationship:0');
    const triggerRelationship = parseFloat(triggerRaw.replace('relationship:', '').trim()) || 0;

    const opt1 = parseOption(s, 1);
    const opt2 = parseOption(s, 2);
    const opt3 = parseOption(s, 3);
    if (!opt1.text || !opt2.text || !opt3.text) continue;

    const def: DialogueChoiceDef = {
      id,
      npc,
      triggerRelationship,
      context: s.get('context', ''),
      promptText: s.get('prompt_text', ''),
      options: [opt1, opt2, opt3],
    };
    registerDialogueChoiceDef(def);
  }
}

// color-narrative-init.ts — color_narratives.txt 파싱

import { DataSection } from './parser';
import { registerColorNarrative, clearColorNarratives } from './color-narrative-defs';

export function initColorNarratives(sections: DataSection[]): void {
  clearColorNarratives();
  for (const s of sections) {
    const lines: string[] = [];
    let i = 1;
    while (s.has(String(i))) {
      lines.push(s.get(String(i)));
      i++;
    }
    if (lines.length > 0) {
      registerColorNarrative(s.name, lines);
    }
  }
}

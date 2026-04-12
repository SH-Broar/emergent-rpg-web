// benzen-init.ts — benzen-lines.txt 파서

import { DataSection } from './parser';
import { registerBenzenLine } from './village-defs';

export function initBenzenLines(sections: DataSection[]): void {
  for (const s of sections) {
    registerBenzenLine({
      id: s.name,
      condition: s.get('condition', 'default'),
      text: s.get('text', '...'),
      priority: s.getInt('priority', 1),
    });
  }
}

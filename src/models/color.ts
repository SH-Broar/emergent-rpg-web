// ============================================================
// color.ts — 컬러 프로파일 시스템
// 원본: Color.h:173-300
// ============================================================

import { Element, Trait, ELEMENT_COUNT } from '../types/enums';
import { randomFloat, randomInt } from '../types/rng';

export interface ElementDomain {
  highTrait: Trait;
  lowTrait: Trait;
}

export interface ElementTraitPool {
  highCandidates: Trait[];
  lowCandidates: Trait[];
}

export function getTraitPool(e: Element): ElementTraitPool {
  switch (e) {
    case Element.Fire:
      return { highCandidates: [Trait.Passionate, Trait.Aggressive, Trait.Excited],
               lowCandidates: [Trait.Calm, Trait.Melancholy, Trait.Cautious] };
    case Element.Water:
      return { highCandidates: [Trait.Empathetic, Trait.Adaptable],
               lowCandidates: [Trait.Indifferent, Trait.Rigid] };
    case Element.Electric:
      return { highCandidates: [Trait.Impulsive, Trait.Inventive],
               lowCandidates: [Trait.Methodical, Trait.Stagnant] };
    case Element.Iron:
      return { highCandidates: [Trait.Stubborn, Trait.Reliable],
               lowCandidates: [Trait.Flexible, Trait.Fragile] };
    case Element.Earth:
      return { highCandidates: [Trait.Patient, Trait.Greedy],
               lowCandidates: [Trait.Generous, Trait.Restless] };
    case Element.Wind:
      return { highCandidates: [Trait.Freesprited, Trait.Flighty],
               lowCandidates: [Trait.Grounded, Trait.Withdrawn] };
    case Element.Light:
      return { highCandidates: [Trait.Hopeful, Trait.Righteous],
               lowCandidates: [Trait.Cynical, Trait.Apathetic] };
    case Element.Dark:
      return { highCandidates: [Trait.Cunning, Trait.Secretive],
               lowCandidates: [Trait.Honest, Trait.Naive] };
    default:
      return { highCandidates: [], lowCandidates: [] };
  }
}

export class ColorProfile {
  values: number[] = new Array(ELEMENT_COUNT).fill(0);
  domains: ElementDomain[] = new Array(ELEMENT_COUNT).fill(null).map(() => ({
    highTrait: Trait.Calm,
    lowTrait: Trait.Calm,
  }));

  randomizeValues(): void {
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      this.values[i] = randomFloat(0.1, 0.9);
    }
  }

  randomizeDomains(): void {
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const pool = getTraitPool(i as Element);
      if (pool.highCandidates.length > 0 && pool.lowCandidates.length > 0) {
        const hi = randomInt(0, pool.highCandidates.length - 1);
        const lo = randomInt(0, pool.lowCandidates.length - 1);
        this.domains[i] = {
          highTrait: pool.highCandidates[hi],
          lowTrait: pool.lowCandidates[lo],
        };
      }
    }
  }

  getDominantTrait(): Trait {
    let maxIdx = 0;
    let minIdx = 0;
    for (let i = 1; i < ELEMENT_COUNT; i++) {
      if (this.values[i] > this.values[maxIdx]) maxIdx = i;
      if (this.values[i] < this.values[minIdx]) minIdx = i;
    }
    const maxDev = this.values[maxIdx] - 0.5;
    const minDev = 0.5 - this.values[minIdx];
    return maxDev >= minDev
      ? this.domains[maxIdx].highTrait
      : this.domains[minIdx].lowTrait;
  }

  getTraitFor(e: Element): Trait {
    const idx = e as number;
    return this.values[idx] >= 0.5
      ? this.domains[idx].highTrait
      : this.domains[idx].lowTrait;
  }

  applyInfluence(influence: number[]): void {
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      let inf = influence[i];
      if (inf > 0) {
        inf *= (1.5 - this.values[i]);
      } else if (inf < 0) {
        inf *= (0.5 + this.values[i]);
      }
      this.values[i] = Math.max(0, Math.min(1, this.values[i] + inf));
    }
  }

  clone(): ColorProfile {
    const c = new ColorProfile();
    c.values = [...this.values];
    c.domains = this.domains.map(d => ({ ...d }));
    return c;
  }
}

export class ColorGaugeState {
  prev: number[] = new Array(ELEMENT_COUNT).fill(0);
  deltas: number[] = new Array(ELEMENT_COUNT).fill(0);

  snapshot(v: number[]): void {
    this.prev = [...v];
  }

  calcDelta(v: number[]): void {
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      this.deltas[i] = v[i] - this.prev[i];
    }
  }
}

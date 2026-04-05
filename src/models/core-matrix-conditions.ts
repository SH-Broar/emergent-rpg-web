// core-matrix-conditions.ts — Default conditions for 8x8 CoreMatrix
// Ported from C++ CoreMatrix.cpp GenerateDefaultCellConditions/Row/Col

import type { CellCondition, LineCondition } from './knowledge';

const MATRIX_SIZE = 8;

interface RowAxis {
  primary: number;
  aux1: number;
  aux2: number;
  opp: number;
}

const ROW_AXES: RowAxis[] = [
  { primary: 0, aux1: 5, aux2: 6, opp: 1 }, // Fire
  { primary: 1, aux1: 4, aux2: 6, opp: 0 }, // Water
  { primary: 2, aux1: 5, aux2: 7, opp: 3 }, // Electric
  { primary: 3, aux1: 0, aux2: 4, opp: 2 }, // Iron
  { primary: 4, aux1: 1, aux2: 3, opp: 5 }, // Earth
  { primary: 5, aux1: 2, aux2: 0, opp: 4 }, // Wind
  { primary: 6, aux1: 1, aux2: 5, opp: 7 }, // Light
  { primary: 7, aux1: 0, aux2: 3, opp: 6 }, // Dark
];

// Column 7 uses a complex 4-element pattern that varies per row and cannot
// be expressed with the standard axis fields alone.
const COL7_WEIGHTS: number[][] = [
  [0.3, 0,   0,   0.3, 0,   0.2, 0.2, 0  ], // Row 0 Fire
  [0,   0.3, 0,   0,   0.2, 0,   0.2, 0.3], // Row 1 Water
  [0,   0,   0.3, 0.2, 0,   0.2, 0.2, 0.3], // Row 2 Electric
  [0.3, 0,   0,   0.3, 0.2, 0,   0.2, 0  ], // Row 3 Iron
  [0,   0.3, 0,   0,   0.3, 0.2, 0.2, 0  ], // Row 4 Earth
  [0.3, 0,   0.2, 0,   0,   0.3, 0.2, 0  ], // Row 5 Wind
  [0,   0.3, 0,   0,   0,   0.2, 0.3, 0.2], // Row 6 Light
  [0.3, 0,   0,   0.3, 0.2, 0,   0.2, 0  ], // Row 7 Dark
];

function makeCellWeights(
  axis: RowAxis,
  col: number,
): { weights: number[]; threshold: number } {
  const w = new Array(MATRIX_SIZE).fill(0) as number[];
  switch (col) {
    case 0:
      w[axis.primary] = 0.8;
      w[axis.aux1] = 0.2;
      return { weights: w, threshold: 0.45 };
    case 1:
      w[axis.primary] = 0.2;
      w[axis.opp] = 0.6;
      return { weights: w, threshold: 0.4 };
    case 2:
      w[axis.primary] = 0.4;
      w[axis.aux1] = 0.6;
      return { weights: w, threshold: 0.5 };
    case 3:
      w[axis.primary] = 0.3;
      w[axis.aux2] = 0.5;
      w[axis.aux1] = 0.2;
      return { weights: w, threshold: 0.45 };
    case 4:
      w[axis.primary] = 0.5;
      w[axis.opp] = 0.5;
      return { weights: w, threshold: 0.55 };
    case 5:
      w[axis.opp] = 0.7;
      w[axis.aux2] = 0.3;
      return { weights: w, threshold: 0.45 };
    case 6:
      w[axis.primary] = 0.4;
      w[axis.aux1] = 0.3;
      w[axis.aux2] = 0.3;
      return { weights: w, threshold: 0.55 };
    default:
      return { weights: w, threshold: 0.5 };
  }
}

export function generateDefaultCellConditions(): CellCondition[] {
  const conditions: CellCondition[] = [];
  for (let r = 0; r < MATRIX_SIZE; r++) {
    for (let c = 0; c < MATRIX_SIZE; c++) {
      if (c === 7) {
        conditions.push({
          weights: [...COL7_WEIGHTS[r]],
          threshold: 0.5,
          invert: false,
        });
      } else {
        const { weights, threshold } = makeCellWeights(ROW_AXES[r], c);
        conditions.push({ weights, threshold, invert: false });
      }
    }
  }
  return conditions;
}

export function generateDefaultRowConditions(): LineCondition[] {
  const conditions: LineCondition[] = [];
  for (let r = 0; r < MATRIX_SIZE; r++) {
    const w = new Array(MATRIX_SIZE).fill(0) as number[];
    w[r] = 1.0;
    conditions.push({ weights: w, threshold: 0.85, flipIfTrue: true });
  }
  return conditions;
}

export function generateDefaultColConditions(): LineCondition[] {
  const conditions: LineCondition[] = [];
  for (let c = 0; c < MATRIX_SIZE; c++) {
    const w = new Array(MATRIX_SIZE).fill(0) as number[];
    w[(c + 4) % MATRIX_SIZE] = 1.0; // opposite element index
    conditions.push({ weights: w, threshold: 0.85, flipIfTrue: true });
  }
  return conditions;
}

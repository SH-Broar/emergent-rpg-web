// color-gauge.ts — 8원소 시각화

export function createColorGauge(
  values: number[],
  labels: string[],
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'color-gauge';

  const count = Math.min(values.length, labels.length);
  for (let i = 0; i < count; i++) {
    const pct = Math.round((values[i] ?? 0.5) * 100);

    const row = document.createElement('div');
    row.className = 'color-gauge-row';
    row.innerHTML = `
      <span class="el-name">${labels[i]}</span>
      <div class="bar">
        <div class="bar-fill" style="width:${pct}%;background:var(--el-${i})"></div>
      </div>
      <span class="color-gauge-val">${(values[i] ?? 0.5).toFixed(2)}</span>
    `;
    container.appendChild(row);
  }

  return container;
}

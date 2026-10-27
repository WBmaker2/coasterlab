import type { RunResult, Sample } from '../physics/cart';
import { fmt } from '../ui/dom';

type ChartKey = 'energy' | 'speed' | 'g-force';

interface ChartCard {
  key: ChartKey;
  title: string;
  unit: string;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  baseContext: CanvasRenderingContext2D;
  table: HTMLElement;
  caption: HTMLElement;
  width: number;
  height: number;
}

const COLORS = {
  kinetic: '#0072b2',
  potential: '#d55e00',
  thermal: '#009e73',
  total: '#1c1d21',
  speed: '#0072b2',
  g: '#d55e00',
  grid: '#e2e4e7',
  axis: '#9a9ea6',
  text: '#5f636b',
  marker: '#ff4f00'
};

const MARGIN = { left: 46, right: 14, top: 14, bottom: 26 };

export class GraphPanel {
  private readonly cards: ChartCard[] = [];
  private run: RunResult | null = null;
  private marker: Sample | null = null;
  private labels = true;
  private readonly resizeObserver: ResizeObserver;
  private drawScheduled = false;

  constructor(host: HTMLElement) {
    host.innerHTML = `
      <div class="graph-grid">
        ${this.cardTemplate('energy', '에너지', 'kJ')}
        ${this.cardTemplate('speed', '속도', 'm/s')}
        ${this.cardTemplate('g-force', 'G-force', 'G')}
      </div>
    `;
    const cards = host.querySelectorAll<HTMLElement>('.graph-card');
    cards.forEach((card) => {
      const key = card.dataset.graph as ChartKey;
      const canvas = card.querySelector('canvas') as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      const base = document.createElement('canvas');
      const baseContext = base.getContext('2d');
      const table = card.querySelector('.data-table') as HTMLElement;
      const caption = card.querySelector('.graph-caption') as HTMLElement;
      if (!context || !baseContext) return;
      this.cards.push({
        key,
        title: key === 'energy' ? '에너지' : key === 'speed' ? '속도' : 'G-force',
        unit: key === 'energy' ? 'kJ' : key === 'speed' ? 'm/s' : 'G',
        canvas,
        context,
        base,
        baseContext,
        table,
        caption,
        width: 0,
        height: 0
      });
    });
    this.resizeObserver = new ResizeObserver(() => this.scheduleDraw());
    this.resizeObserver.observe(host);
    this.drawEmpty();
  }

  private cardTemplate(key: ChartKey, title: string, unit: string): string {
    const legend =
      key === 'energy'
        ? `<div class="graph-legend" aria-hidden="true">
            <span><i class="legend-line kinetic solid"></i>운동에너지</span>
            <span><i class="legend-line potential dashed"></i>위치에너지</span>
            <span><i class="legend-line thermal dotted"></i>열에너지</span>
            <span><i class="legend-line total solid"></i>총합</span>
          </div>`
        : key === 'g-force'
          ? `<div class="graph-legend" aria-hidden="true">
              <span><i class="legend-line g solid"></i>G-force</span>
              <span><i class="legend-line threshold dashed"></i>안전 기준 6 G</span>
            </div>`
          : '';
    return `
      <article class="graph-card" data-graph="${key}">
        <header class="graph-head">
          <h2>${title}</h2>
          <span class="graph-unit">${unit}</span>
        </header>
        <div class="graph-canvas-wrap">
          <canvas role="img" aria-label="${title} 그래프"></canvas>
        </div>
        ${legend}
        <p class="graph-caption">실행을 누르면 주행 데이터가 그려집니다.</p>
        <details class="data-details">
          <summary>데이터 표</summary>
          <div class="data-table-wrap"><div class="data-table"></div></div>
        </details>
      </article>
    `;
  }

  setRun(run: RunResult | null): void {
    this.run = run;
    this.marker = null;
    if (run) this.buildTables(run);
    else {
      for (const card of this.cards) {
        card.table.innerHTML = '';
        card.caption.textContent = '실행을 누르면 주행 데이터가 그려집니다.';
        card.canvas.setAttribute('aria-label', `${card.title} 그래프, 데이터 없음`);
      }
    }
    this.drawBaseAll();
    this.drawMarker();
  }

  setMarker(sample: Sample | null): void {
    this.marker = sample;
    this.drawMarker();
  }

  setLabels(show: boolean): void {
    if (show === this.labels) return;
    this.labels = show;
    this.drawBaseAll();
    this.drawMarker();
  }

  private buildTables(run: RunResult): void {
    const energy = this.cards.find((card) => card.key === 'energy');
    const speed = this.cards.find((card) => card.key === 'speed');
    const gforce = this.cards.find((card) => card.key === 'g-force');
    if (!energy || !speed || !gforce) return;
    const samples = run.samples;
    const step = Math.max(1, Math.ceil(samples.length / 12));
    const rows: Sample[] = [];
    for (let i = 0; i < samples.length; i += step) rows.push(samples[i]);
    if (rows[rows.length - 1] !== samples[samples.length - 1]) {
      rows.push(samples[samples.length - 1]);
    }
    const table = (head: string[], body: string[][], caption: string): string => `
      <table>
        <caption>${caption}</caption>
        <thead><tr>${head.map((cell) => `<th scope="col">${cell}</th>`).join('')}</tr></thead>
        <tbody>${body
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
          .join('')}</tbody>
      </table>
    `;
    energy.table.innerHTML = table(
      ['거리 (m)', '운동 (kJ)', '위치 (kJ)', '열 (kJ)', '총합 (kJ)'],
      rows.map((sample) => [
        fmt(sample.s),
        fmt(sample.kinetic / 1000, 2),
        fmt(sample.potential / 1000, 2),
        fmt(sample.thermal / 1000, 2),
        fmt((sample.kinetic + sample.potential + sample.thermal) / 1000, 2)
      ]),
      '에너지 데이터 표'
    );
    speed.table.innerHTML = table(
      ['거리 (m)', '속도 (m/s)', '시간 (s)'],
      rows.map((sample) => [fmt(sample.s), fmt(sample.speed), fmt(sample.t, 2)]),
      '속도 데이터 표'
    );
    gforce.table.innerHTML = table(
      ['거리 (m)', 'G-force', '수직항력 (kN)', '곡률 반경 (m)'],
      rows.map((sample) => [
        fmt(sample.s),
        fmt(sample.gForce, 2),
        fmt(sample.normalForce / 1000, 1),
        Math.abs(sample.curvature) > 1e-4 ? fmt(1 / Math.abs(sample.curvature)) : '∞'
      ]),
      'G-force 데이터 표'
    );
    energy.caption.textContent = `최대 ${fmt(run.maxSpeed)} m/s · ${fmt(run.duration, 1)}초 주행`;
    speed.caption.textContent = `최대 ${fmt(run.maxSpeed)} m/s · 평균 ${fmt(
      run.length / Math.max(run.duration, 0.01)
    )} m/s`;
    gforce.caption.textContent = `최대 ${fmt(run.maxG, 2)} G · 최소 ${fmt(run.minG, 2)} G`;
    energy.canvas.setAttribute(
      'aria-label',
      `에너지 그래프. 최대 속도 ${fmt(run.maxSpeed)} 미터 매 초, 최대 G-force ${fmt(run.maxG, 2)} G.`
    );
    speed.canvas.setAttribute(
      'aria-label',
      `속도 그래프. 최대 ${fmt(run.maxSpeed)} 미터 매 초, 총 거리 ${fmt(run.length)} 미터.`
    );
    gforce.canvas.setAttribute(
      'aria-label',
      `G-force 그래프. 최대 ${fmt(run.maxG, 2)} G, 최소 ${fmt(run.minG, 2)} G, 안전 기준 6 G.`
    );
  }

  private scheduleDraw(): void {
    if (this.drawScheduled) return;
    this.drawScheduled = true;
    window.requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.drawBaseAll();
      this.drawMarker();
    });
  }

  private drawEmpty(): void {
    this.drawBaseAll();
  }

  private ensureSize(card: ChartCard): boolean {
    const rect = card.canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width < 40 || rect.height < 40) return false;
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (card.width !== width || card.height !== height) {
      card.width = width;
      card.height = height;
      card.canvas.width = Math.floor(width * dpr);
      card.canvas.height = Math.floor(height * dpr);
      card.base.width = Math.floor(width * dpr);
      card.base.height = Math.floor(height * dpr);
      card.baseContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    card.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  private drawBaseAll(): void {
    for (const card of this.cards) this.drawBase(card);
  }

  private chartBounds(card: ChartCard): { left: number; top: number; width: number; height: number } {
    return {
      left: MARGIN.left,
      top: MARGIN.top,
      width: card.width - MARGIN.left - MARGIN.right,
      height: card.height - MARGIN.top - MARGIN.bottom
    };
  }

  private seriesFor(card: ChartCard): {
    xMax: number;
    yMin: number;
    yMax: number;
    lines: Array<{ values: number[]; color: string; dash: number[]; width: number }>;
  } | null {
    const run = this.run;
    if (!run || run.samples.length < 2) return null;
    const samples = run.samples;
    const xMax = Math.max(1, samples[samples.length - 1].s);
    if (card.key === 'energy') {
      let max = 0;
      for (const sample of samples) {
        max = Math.max(max, (sample.kinetic + sample.potential + sample.thermal) / 1000);
      }
      const yMax = Math.max(1, Math.ceil(max * 1.08));
      return {
        xMax,
        yMin: 0,
        yMax,
        lines: [
          { values: samples.map((s) => s.kinetic / 1000), color: COLORS.kinetic, dash: [], width: 2 },
          {
            values: samples.map((s) => s.potential / 1000),
            color: COLORS.potential,
            dash: [5, 3],
            width: 1.7
          },
          {
            values: samples.map((s) => s.thermal / 1000),
            color: COLORS.thermal,
            dash: [2, 3],
            width: 1.7
          },
          {
            values: samples.map((s) => (s.kinetic + s.potential + s.thermal) / 1000),
            color: COLORS.total,
            dash: [8, 4],
            width: 1.3
          }
        ]
      };
    }
    if (card.key === 'speed') {
      const yMax = Math.max(5, Math.ceil((run.maxSpeed * 1.1) / 5) * 5);
      return {
        xMax,
        yMin: 0,
        yMax,
        lines: [{ values: samples.map((s) => s.speed), color: COLORS.speed, dash: [], width: 2.2 }]
      };
    }
    const yMax = Math.max(7, Math.ceil((Math.max(run.maxG, 6) + 0.8) * 2) / 2);
    const yMin = Math.min(0, Math.floor((run.minG - 0.5) * 2) / 2);
    return {
      xMax,
      yMin,
      yMax,
      lines: [{ values: samples.map((s) => s.gForce), color: COLORS.g, dash: [], width: 2.2 }]
    };
  }

  private drawBase(card: ChartCard): void {
    if (!this.ensureSize(card)) return;
    const ctx = card.baseContext;
    const { width, height } = card;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const bounds = this.chartBounds(card);
    const series = this.seriesFor(card);

    if (!series) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = bounds.top + (bounds.height * i) / 4;
        ctx.beginPath();
        ctx.moveTo(bounds.left, y);
        ctx.lineTo(bounds.left + bounds.width, y);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.text;
      ctx.font = '12px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('주행 데이터 없음', bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return;
    }

    const xScale = (s: number) => bounds.left + (s / series.xMax) * bounds.width;
    const yScale = (value: number) =>
      bounds.top + bounds.height - ((value - series.yMin) / (series.yMax - series.yMin)) * bounds.height;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = bounds.top + (bounds.height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.left + bounds.width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(bounds.left, bounds.top);
    ctx.lineTo(bounds.left, bounds.top + bounds.height);
    ctx.lineTo(bounds.left + bounds.width, bounds.top + bounds.height);
    ctx.stroke();

    if (this.labels) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i += 1) {
        const value = series.yMin + ((series.yMax - series.yMin) * (4 - i)) / 4;
        const y = bounds.top + (bounds.height * i) / 4;
        const label = card.key === 'energy' ? fmt(value, 0) : fmt(value, 1);
        ctx.fillText(label, bounds.left - 8, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= 4; i += 1) {
        const value = (series.xMax * i) / 4;
        const x = bounds.left + (bounds.width * i) / 4;
        ctx.fillText(`${fmt(value, 0)}`, x, bounds.top + bounds.height + 8);
      }
      ctx.textAlign = 'left';
      ctx.fillText('m', bounds.left + bounds.width - 8, bounds.top + bounds.height + 8);
    }

    if (card.key === 'g-force' && series.yMin <= 0 && series.yMax >= 6) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#b5451e';
      ctx.lineWidth = 1;
      const y = yScale(6);
      ctx.beginPath();
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.left + bounds.width, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#b5451e';
      ctx.font = '10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      if (this.labels) ctx.fillText('6 G', bounds.left + bounds.width, y - 2);
    }

    const stride = Math.max(1, Math.floor(runLength(this.run) / 420));
    for (const line of series.lines) {
      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(line.dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < line.values.length; i += stride) {
        const sample = this.run!.samples[i];
        const x = xScale(sample.s);
        const y = yScale(line.values[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      const lastIndex = line.values.length - 1;
      const lastSample = this.run!.samples[lastIndex];
      ctx.lineTo(xScale(lastSample.s), yScale(line.values[lastIndex]));
      ctx.stroke();
      ctx.restore();
    }

    if (card.key === 'g-force') {
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (this.labels) ctx.fillText('G', bounds.left + 4, bounds.top + 4);
    }
  }

  private drawMarker(): void {
    for (const card of this.cards) {
      if (!this.ensureSize(card)) continue;
      const ctx = card.context;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, card.canvas.width, card.canvas.height);
      ctx.drawImage(card.base, 0, 0);
      if (!this.run || !this.marker) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const series = this.seriesFor(card);
      if (!series) continue;
      const bounds = this.chartBounds(card);
      const x = bounds.left + (this.marker.s / series.xMax) * bounds.width;
      if (x < bounds.left || x > bounds.left + bounds.width) continue;
      ctx.save();
      ctx.strokeStyle = COLORS.marker;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, bounds.top + bounds.height);
      ctx.stroke();
      ctx.restore();
      const yScale = (value: number) =>
        bounds.top +
        bounds.height -
        ((value - series.yMin) / (series.yMax - series.yMin)) * bounds.height;
      for (const line of series.lines) {
        const value = markerValue(card.key, this.marker, line.color);
        if (value === null) continue;
        const y = yScale(value);
        if (y < bounds.top || y > bounds.top + bounds.height) continue;
        ctx.beginPath();
        ctx.fillStyle = line.color;
        ctx.arc(x, y, card.key === 'energy' ? 2.2 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function runLength(run: RunResult | null): number {
  return run && run.samples.length > 0 ? run.samples.length : 1;
}

function markerValue(key: ChartKey, sample: Sample, color: string): number | null {
  if (key === 'energy') {
    if (color === COLORS.kinetic) return sample.kinetic / 1000;
    if (color === COLORS.potential) return sample.potential / 1000;
    if (color === COLORS.thermal) return sample.thermal / 1000;
    return (sample.kinetic + sample.potential + sample.thermal) / 1000;
  }
  if (key === 'speed') return sample.speed;
  return sample.gForce;
}

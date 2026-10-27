import type { Sample } from '../physics/cart';
import { buildSpline, type Spline } from '../track/spline';
import type { Track } from '../track/types';
import type { ValidationResult } from '../track/validation';

const NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 1000;
const VIEW_H = 620;
const MARGIN = { left: 58, right: 42, top: 42, bottom: 58 };

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Layout {
  scale: number;
  originX: number;
  originY: number;
}

export interface EditorCallbacks {
  onSelectPoint: (index: number) => void;
  onMovePoint: (index: number, x: number, y: number) => void;
  onRemovePoint: () => void;
  onRun: () => void;
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clonePoints(track: Track): Track['points'] {
  return track.points.map((point) => ({ ...point }));
}

export class SideViewEditor {
  private readonly svg: SVGSVGElement;
  private readonly gridGroup: SVGGElement;
  private readonly trackGroup: SVGGElement;
  private readonly loopGroup: SVGGElement;
  private readonly warningGroup: SVGGElement;
  private readonly annotationGroup: SVGGElement;
  private readonly pointsGroup: SVGGElement;
  private readonly cartGroup: SVGGElement;

  private track: Track | null = null;
  private spline: Spline | null = null;
  private selected: number | null = null;
  private validation: ValidationResult | null = null;
  private bounds: Bounds = { minX: -5, maxX: 100, minY: -4, maxY: 30 };
  private layout: Layout = { scale: 8, originX: 40, originY: 560 };
  private structureKey = '';
  private pointNodes: Array<{
    group: SVGGElement;
    hit: SVGCircleElement;
    dot: SVGCircleElement;
    halo: SVGCircleElement;
  }> = [];
  private dragIndex: number | null = null;
  private cartSample: Sample | null = null;
  private readonly callbacks: EditorCallbacks;
  private readonly resizeObserver: ResizeObserver;
  private compact: boolean;

  constructor(host: HTMLElement, callbacks: EditorCallbacks) {
    this.callbacks = callbacks;
    host.innerHTML = '';
    this.svg = svgEl('svg', {
      class: 'editor-svg',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      role: 'group',
      'aria-label': '롤러코스터 측면 설계 편집기'
    }) as SVGSVGElement;
    const desc = svgEl('desc');
    desc.textContent =
      '제어점을 드래그하거나 Tab으로 선택한 뒤 화살표 키로 이동해 트랙을 설계합니다. Enter 키로 주행합니다.';
    this.svg.append(desc);

    const background = svgEl('rect', {
      x: 0,
      y: 0,
      width: VIEW_W,
      height: VIEW_H,
      class: 'editor-bg'
    });
    this.gridGroup = svgEl('g', { class: 'editor-grid' }) as SVGGElement;
    this.loopGroup = svgEl('g', { class: 'editor-loop' }) as SVGGElement;
    this.trackGroup = svgEl('g', { class: 'editor-track' }) as SVGGElement;
    this.warningGroup = svgEl('g', { class: 'editor-warnings' }) as SVGGElement;
    this.cartGroup = svgEl('g', { class: 'editor-cart' }) as SVGGElement;
    this.annotationGroup = svgEl('g', { class: 'editor-annotations' }) as SVGGElement;
    this.pointsGroup = svgEl('g', { class: 'editor-points' }) as SVGGElement;

    const centerRail = svgEl('path', { class: 'track-center' });
    const railLeft = svgEl('path', { class: 'track-rail' });
    const railRight = svgEl('path', { class: 'track-rail' });
    this.trackGroup.append(railLeft, railRight, centerRail);
    this.trackGroup.dataset.rails = 'left,right,center';

    this.cartGroup.append(
      svgEl('line', { class: 'cart-drop' }),
      svgEl('rect', { class: 'cart-body', x: -14, y: -8, width: 28, height: 15, rx: 2 }),
      svgEl('rect', { class: 'cart-seat', x: -7, y: -15, width: 14, height: 8, rx: 1 }),
      svgEl('circle', { class: 'cart-wheel', cx: -8, cy: 8, r: 3.4 }),
      svgEl('circle', { class: 'cart-wheel', cx: 8, cy: 8, r: 3.4 })
    );

    this.svg.append(
      background,
      this.gridGroup,
      this.loopGroup,
      this.trackGroup,
      this.warningGroup,
      this.cartGroup,
      this.annotationGroup,
      this.pointsGroup
    );
    host.append(this.svg);
    this.compact = host.clientWidth > 0 && host.clientWidth < 900;
    this.svg.classList.toggle('compact', this.compact);
    this.resizeObserver = new ResizeObserver(() => {
      const compact = host.clientWidth > 0 && host.clientWidth < 900;
      if (compact === this.compact) return;
      this.compact = compact;
      this.svg.classList.toggle('compact', compact);
      if (this.track && this.spline) {
        this.renderGrid();
        this.renderLoop();
        this.renderTrack();
        this.renderPoints(false);
        this.renderAnnotations();
        this.renderCart();
      }
    });
    this.resizeObserver.observe(host);

    this.svg.addEventListener('pointermove', this.handlePointerMove);
    this.svg.addEventListener('pointerup', this.handlePointerUp);
    this.svg.addEventListener('pointercancel', this.handlePointerUp);
  }

  setTrack(
    track: Track,
    spline: Spline,
    validation: ValidationResult | null,
    selected: number | null
  ): void {
    const key = `${track.id}:${track.points.length}`;
    const fit = key !== this.structureKey;
    this.track = track;
    this.spline = spline;
    this.validation = validation;
    this.selected = selected;
    if (fit || this.wouldLeaveBounds(track)) {
      this.bounds = this.computeBounds(track);
      this.computeLayout();
    }
    this.structureKey = key;
    this.renderGrid();
    this.renderLoop();
    this.renderTrack();
    this.renderWarnings();
    this.renderPoints(fit);
    this.renderAnnotations();
    this.renderCart();
  }

  setSelected(index: number | null): void {
    this.selected = index;
    this.updatePointStyles();
    this.renderAnnotations();
  }

  setValidation(validation: ValidationResult | null): void {
    this.validation = validation;
    this.renderWarnings();
  }

  setCartSample(sample: Sample | null): void {
    this.cartSample = sample;
    this.renderCart();
  }

  requestFit(): void {
    this.structureKey = '';
  }

  focusPoint(index: number): void {
    window.requestAnimationFrame(() => {
      const node = this.pointNodes[index];
      node?.hit.focus({ preventScroll: true });
    });
  }

  private computeBounds(track: Track): Bounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of track.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    minY = Math.min(minY, 0);
    minX -= 5;
    maxX += 7;
    minY -= 4;
    maxY += 5;
    return { minX, maxX, minY, maxY };
  }

  private wouldLeaveBounds(track: Track): boolean {
    return track.points.some(
      (point) =>
        point.x < this.bounds.minX + 1 ||
        point.x > this.bounds.maxX - 1 ||
        point.y < this.bounds.minY + 1 ||
        point.y > this.bounds.maxY - 1
    );
  }

  private computeLayout(): void {
    const rangeX = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const rangeY = Math.max(1, this.bounds.maxY - this.bounds.minY);
    const width = VIEW_W - MARGIN.left - MARGIN.right;
    const height = VIEW_H - MARGIN.top - MARGIN.bottom;
    const scale = Math.min(width / rangeX, height / rangeY);
    const usedW = rangeX * scale;
    const usedH = rangeY * scale;
    this.layout = {
      scale,
      originX: MARGIN.left + (width - usedW) / 2,
      originY: MARGIN.top + (height - usedH) / 2
    };
  }

  private toScreen(x: number, y: number): [number, number] {
    return [
      this.layout.originX + (x - this.bounds.minX) * this.layout.scale,
      this.layout.originY + (this.bounds.maxY - y) * this.layout.scale
    ];
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_W;
    const svgY = ((clientY - rect.top) / rect.height) * VIEW_H;
    return {
      x: this.bounds.minX + (svgX - this.layout.originX) / this.layout.scale,
      y: this.bounds.maxY - (svgY - this.layout.originY) / this.layout.scale
    };
  }

  private gridStep(): { step: number; labelEvery: number } {
    const range = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxY - this.bounds.minY);
    const target = range / 11;
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100];
    const step = candidates.find((value) => value >= target) ?? 100;
    const lines = range / step;
    const labelEvery = Math.max(1, Math.ceil(lines / 8));
    return { step, labelEvery };
  }

  private renderGrid(): void {
    this.gridGroup.replaceChildren();
    const { step, labelEvery } = this.gridStep();
    const startX = Math.ceil(this.bounds.minX / step) * step;
    const startY = Math.ceil(this.bounds.minY / step) * step;
    let index = 0;
    for (let x = startX; x <= this.bounds.maxX; x += step) {
      const [screenX] = this.toScreen(x, 0);
      const major = index % labelEvery === 0;
      this.gridGroup.append(
        svgEl('line', {
          x1: screenX,
          x2: screenX,
          y1: MARGIN.top - 10,
          y2: VIEW_H - MARGIN.bottom + 8,
          class: major ? 'grid-line major' : 'grid-line'
        })
      );
      if (major) {
        const label = svgEl('text', {
          x: screenX,
          y: VIEW_H - MARGIN.bottom + 24,
          class: 'grid-label',
          'text-anchor': 'middle'
        });
        label.textContent = `${round(x)}`;
        this.gridGroup.append(label);
      }
      index += 1;
    }
    index = 0;
    for (let y = startY; y <= this.bounds.maxY; y += step) {
      const [, screenY] = this.toScreen(0, y);
      const major = index % labelEvery === 0;
      this.gridGroup.append(
        svgEl('line', {
          x1: MARGIN.left - 8,
          x2: VIEW_W - MARGIN.right + 8,
          y1: screenY,
          y2: screenY,
          class: major ? 'grid-line major' : 'grid-line'
        })
      );
      if (major) {
        const label = svgEl('text', {
          x: MARGIN.left - 14,
          y: screenY + 4,
          class: 'grid-label',
          'text-anchor': 'end'
        });
        label.textContent = `${round(y)}`;
        this.gridGroup.append(label);
      }
      index += 1;
    }
    const [zeroX, zeroY] = this.toScreen(0, 0);
    this.gridGroup.append(
      svgEl('line', {
        x1: MARGIN.left - 8,
        x2: VIEW_W - MARGIN.right + 8,
        y1: zeroY,
        y2: zeroY,
        class: 'ground-line'
      }),
      svgEl('line', {
        x1: zeroX,
        x2: zeroX,
        y1: MARGIN.top,
        y2: VIEW_H - MARGIN.bottom,
        class: 'ground-line'
      })
    );
    const groundLabel = svgEl('text', {
      x: MARGIN.left - 14,
      y: zeroY - 6,
      class: 'axis-note',
      'text-anchor': 'end'
    });
    groundLabel.textContent = '지면 0 m';
    this.gridGroup.append(groundLabel);
  }

  private pathForSamples(samples: Spline['samples'], offset = 0): string {
    let path = '';
    const stride = Math.max(1, Math.floor(samples.length / 480));
    for (let i = 0; i < samples.length; i += stride) {
      const sample = samples[i];
      const [x, y] = this.toScreen(sample.x + sample.nx * offset, sample.y + sample.ny * offset);
      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    const last = samples[samples.length - 1];
    const [lastX, lastY] = this.toScreen(last.x + last.nx * offset, last.y + last.ny * offset);
    path += `L${lastX.toFixed(1)} ${lastY.toFixed(1)}`;
    return path;
  }

  private renderTrack(): void {
    if (!this.spline) return;
    const paths = this.trackGroup.querySelectorAll('path');
    if (paths.length === 3) {
      (paths[0] as SVGPathElement).setAttribute('d', this.pathForSamples(this.spline.samples, 0.16));
      (paths[1] as SVGPathElement).setAttribute('d', this.pathForSamples(this.spline.samples, -0.16));
      (paths[2] as SVGPathElement).setAttribute('d', this.pathForSamples(this.spline.samples, 0));
    }
  }

  private renderLoop(): void {
    this.loopGroup.replaceChildren();
    if (!this.track?.loop || !this.spline) return;
    const startS = this.spline.controlPointS[this.track.loop.startIndex] ?? 0;
    const endS = this.spline.controlPointS[this.track.loop.endIndex] ?? this.spline.length;
    const loopSamples = this.spline.samples.filter((sample) => sample.s >= startS && sample.s <= endS);
    if (loopSamples.length === 0) return;
    let path = '';
    loopSamples.forEach((sample, index) => {
      const [x, y] = this.toScreen(sample.x, sample.y);
      path += `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    });
    this.loopGroup.append(svgEl('path', { d: path, class: 'loop-band' }));
    let top = loopSamples[0];
    for (const sample of loopSamples) {
      if (sample.y > top.y) top = sample;
    }
    const [labelX, labelY] = this.toScreen(top.x, top.y);
    const label = svgEl('text', {
      x: labelX,
      y: labelY - 18,
      class: 'loop-label',
      'text-anchor': 'middle'
    });
    label.textContent = `루프 · R ≈ ${round(this.track.loop.radius)} m`;
    this.loopGroup.append(label);
  }

  private renderWarnings(): void {
    this.warningGroup.replaceChildren();
    if (!this.track || !this.validation) return;
    const intersectionCheck = this.validation.checks.find((check) => check.id === 'intersection');
    if (intersectionCheck?.status !== 'fail') return;
    const loop = this.track.loop;
    const startS = loop && this.spline ? this.spline.controlPointS[loop.startIndex] : -Infinity;
    const endS = loop && this.spline ? this.spline.controlPointS[loop.endIndex] : Infinity;
    for (const hit of this.validation.intersections) {
      const inLoop =
        loop &&
        hit.s1 >= startS - 10 &&
        hit.s1 <= endS + 10 &&
        hit.s2 >= startS - 10 &&
        hit.s2 <= endS + 10;
      if (inLoop) continue;
      const [x, y] = this.toScreen(hit.x, hit.y);
      const group = svgEl('g', { class: 'warning-mark', transform: `translate(${x} ${y})` });
      group.append(
        svgEl('circle', { r: 12, class: 'warning-ring' }),
        svgEl('path', { d: 'M-5 -5L5 5M5 -5L-5 5', class: 'warning-cross' })
      );
      this.warningGroup.append(group);
    }
  }

  private renderPoints(rebuild: boolean): void {
    if (!this.track) return;
    const count = this.track.points.length;
    if (rebuild || this.pointNodes.length !== count) {
      this.pointsGroup.replaceChildren();
      this.pointNodes = [];
      for (let index = 0; index < count; index += 1) {
        const group = svgEl('g', { class: 'point-group', 'data-index': index }) as SVGGElement;
        const hit = svgEl('circle', {
          r: 19,
          class: 'point-hit',
          tabindex: 0,
          role: 'button'
        }) as SVGCircleElement;
        const halo = svgEl('circle', { r: 13, class: 'point-halo' }) as SVGCircleElement;
        const dot = svgEl('circle', { r: 7, class: 'point-dot' }) as SVGCircleElement;
        group.append(halo, dot, hit);
        this.pointsGroup.append(group);
        hit.addEventListener('pointerdown', (event) =>
          this.handlePointerDown(event as PointerEvent, index)
        );
        hit.addEventListener('focus', () => this.callbacks.onSelectPoint(index));
        hit.addEventListener('keydown', (event) => this.handleKeyDown(event, index));
        this.pointNodes.push({ group, hit, dot, halo });
      }
    }
    const hitRadius = this.compact ? 56 : 19;
    const dotRadius = this.compact ? 13 : 7;
    const haloRadius = this.compact ? 21 : 13;
    for (let index = 0; index < count; index += 1) {
      const point = this.track.points[index];
      const [x, y] = this.toScreen(point.x, point.y);
      const node = this.pointNodes[index];
      node.group.setAttribute('transform', `translate(${x} ${y})`);
      node.dot.setAttribute('cx', '0');
      node.dot.setAttribute('cy', '0');
      node.dot.setAttribute('r', String(dotRadius));
      node.halo.setAttribute('cx', '0');
      node.halo.setAttribute('cy', '0');
      node.halo.setAttribute('r', String(haloRadius));
      node.hit.setAttribute('cx', '0');
      node.hit.setAttribute('cy', '0');
      node.hit.setAttribute('r', String(hitRadius));
      node.hit.setAttribute(
        'aria-label',
        `제어점 ${index + 1}, x ${round(point.x)} 미터, y ${round(point.y)} 미터`
      );
      node.hit.setAttribute('aria-pressed', index === this.selected ? 'true' : 'false');
    }
    this.updatePointStyles();
  }

  private updatePointStyles(): void {
    this.pointNodes.forEach((node, index) => {
      const selected = index === this.selected;
      node.group.classList.toggle('is-selected', selected);
      node.group.classList.toggle(
        'is-endpoint',
        index === 0 || index === (this.track?.points.length ?? 0) - 1
      );
      node.halo.setAttribute('visibility', selected ? 'visible' : 'hidden');
    });
  }

  private renderAnnotations(): void {
    this.annotationGroup.replaceChildren();
    if (!this.track || !this.spline) return;
    const first = this.track.points[0];
    const last = this.track.points[this.track.points.length - 1];
    if (first) {
      const [x, y] = this.toScreen(first.x, first.y);
      const label = svgEl('text', {
        x,
        y: y - 22,
        class: 'endpoint-label',
        'text-anchor': 'middle'
      });
      label.textContent = '출발';
      this.annotationGroup.append(label);
    }
    if (last) {
      const [x, y] = this.toScreen(last.x, last.y);
      const label = svgEl('text', {
        x,
        y: y + 30,
        class: 'endpoint-label',
        'text-anchor': 'middle'
      });
      label.textContent = '도착';
      this.annotationGroup.append(label);
    }
    if (this.selected !== null) {
      const point = this.track.points[this.selected];
      const s = this.spline.controlPointS[this.selected] ?? 0;
      const frame = this.spline.pointAt(s);
      const [x, y] = this.toScreen(point.x, point.y);
      const tangentX = frame.tx;
      const tangentY = -frame.ty;
      const length = 34;
      const line = svgEl('line', {
        x1: x - tangentX * length,
        y1: y - tangentY * length,
        x2: x + tangentX * length,
        y2: y + tangentY * length,
        class: 'tangent-line'
      });
      const label = svgEl('text', {
        x: x + 16,
        y: y - 16,
        class: 'point-label'
      });
      label.textContent = `P${this.selected + 1} · ${round(point.x)} m, ${round(point.y)} m`;
      this.annotationGroup.append(line, label);
    }
    const { step } = this.gridStep();
    const barMeters = step * Math.max(1, Math.round(20 / step));
    const [bx, by] = this.toScreen(this.bounds.minX + 3, this.bounds.minY + 2.5);
    const barPx = barMeters * this.layout.scale;
    this.annotationGroup.append(
      svgEl('line', { x1: bx, y1: by, x2: bx + barPx, y2: by, class: 'scale-bar' }),
      svgEl('line', { x1: bx, y1: by - 4, x2: bx, y2: by + 4, class: 'scale-bar' }),
      svgEl('line', { x1: bx + barPx, y1: by - 4, x2: bx + barPx, y2: by + 4, class: 'scale-bar' })
    );
    const scaleLabel = svgEl('text', { x: bx, y: by + 16, class: 'axis-note' });
    scaleLabel.textContent = `${barMeters} m`;
    this.annotationGroup.append(scaleLabel);
  }

  private renderCart(): void {
    if (!this.track || !this.spline) {
      this.cartGroup.setAttribute('visibility', 'hidden');
      return;
    }
    this.cartGroup.setAttribute('visibility', 'visible');
    let sample = this.cartSample;
    if (!sample || sample.s === undefined) {
      const start = this.spline.pointAt(0);
      sample = {
        s: 0,
        t: 0,
        x: start.x,
        y: start.y,
        z: start.z,
        speed: 0,
        kinetic: 0,
        potential: 0,
        thermal: 0,
        normalForce: 0,
        gForce: 0,
        curvature: 0
      };
    }
    const [x, y] = this.toScreen(sample.x, sample.y);
    const frame = this.spline.pointAt(sample.s);
    const angle = (Math.atan2(-frame.ty, frame.tx) * 180) / Math.PI;
    this.cartGroup.setAttribute(
      'transform',
      `translate(${x} ${y}) rotate(${angle}) scale(${this.compact ? 1.8 : 1})`
    );
    const [groundX, groundY] = this.toScreen(sample.x, 0);
    const drop = this.cartGroup.querySelector('.cart-drop') as SVGLineElement | null;
    if (drop) {
      drop.setAttribute('x1', '0');
      drop.setAttribute('y1', '10');
      drop.setAttribute('x2', String(groundX - x));
      drop.setAttribute('y2', String(groundY - y));
      drop.setAttribute('visibility', sample.y > 1 ? 'visible' : 'hidden');
    }
  }

  private handlePointerDown(event: PointerEvent, index: number): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    this.callbacks.onSelectPoint(index);
    this.dragIndex = index;
    const target = event.currentTarget as SVGCircleElement;
    target.setPointerCapture(event.pointerId);
    target.focus({ preventScroll: true });
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.dragIndex === null || !this.track) return;
    const world = this.toWorld(event.clientX, event.clientY);
    const x = round(Math.max(-20, Math.min(220, world.x)));
    const y = round(Math.max(-5, Math.min(90, world.y)));
    this.callbacks.onMovePoint(this.dragIndex, x, y);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.dragIndex === null) return;
    const target = event.currentTarget as SVGSVGElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.dragIndex = null;
  };

  private handleKeyDown(event: KeyboardEvent, index: number): void {
    if (!this.track) return;
    const point = this.track.points[index];
    if (!point) return;
    const step = event.shiftKey ? 2 : 0.5;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = step;
    else if (event.key === 'ArrowDown') dy = -step;
    else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.callbacks.onRemovePoint();
      return;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.callbacks.onRun();
      return;
    }
    if (dx !== 0 || dy !== 0) {
      event.preventDefault();
      const points = clonePoints(this.track);
      points[index] = {
        ...points[index],
        x: round(point.x + dx),
        y: round(point.y + dy)
      };
      try {
        const spline = buildSpline(points);
        this.track = { ...this.track, points };
        this.spline = spline;
        this.renderTrack();
        this.renderPoints(false);
        this.renderAnnotations();
        this.renderLoop();
      } catch {
        // A malformed edit is ignored; the app still owns the last valid track.
      }
      this.callbacks.onMovePoint(index, points[index].x, points[index].y);
    }
  }
}

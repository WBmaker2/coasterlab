import { buildSpline } from '../track/spline';
import type { Track } from '../track/types';

const ICONS: Record<string, string> = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="7" y="5" width="3.5" height="14" rx="0.5" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="0.5" fill="currentColor" stroke="none"/>',
  reset: '<path d="M3.5 11.5a8.5 8.5 0 1 0 2.4-6"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5v5l3 1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  camera: '<path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
  orbit:
    '<circle cx="12" cy="12" r="3"/><path d="M4.5 15.5c-2-3 2.5-8.5 7.5-10M19.5 8.5c2 3-2.5 8.5-7.5 10"/>',
  target:
    '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  side: '<path d="M4 17c3-9 13-9 16 0"/><path d="M4 20h16"/>',
  follow: '<path d="M4 18l5-12 5 12 5-12"/><circle cx="9" cy="6" r="1.2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  warning: '<path d="M12 3.5L21 20H3z"/><path d="M12 9v5M12 17.2v.3"/>',
  print: '<path d="M7 8V4h10v4M7 17H4V9h16v8h-3"/><rect x="7" y="13" width="10" height="7" rx="1"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M17 12v3M20 12v2"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
};

export function icon(name: keyof typeof ICONS | string, className = 'icon'): string {
  const path = ICONS[name] ?? ICONS.spark;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function trackThumbnail(track: Track, width = 168, height = 64): string {
  try {
    const spline = buildSpline(track.points, 60);
    const samples = spline.samples;
    if (samples.length === 0) return '';
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const sample of samples) {
      minX = Math.min(minX, sample.x);
      maxX = Math.max(maxX, sample.x);
      minY = Math.min(minY, sample.y);
      maxY = Math.max(maxY, sample.y);
    }
    const pad = 5;
    const scale = Math.min(
      (width - pad * 2) / Math.max(1, maxX - minX),
      (height - pad * 2) / Math.max(1, maxY - minY)
    );
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    let path = '';
    const stride = Math.max(1, Math.floor(samples.length / 240));
    for (let i = 0; i < samples.length; i += stride) {
      const sample = samples[i];
      const x = offsetX + (sample.x - minX) * scale;
      const y = height - offsetY - (sample.y - minY) * scale;
      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    const last = samples[samples.length - 1];
    path += `L${(offsetX + (last.x - minX) * scale).toFixed(1)} ${(
      height -
      offsetY -
      (last.y - minY) * scale
    ).toFixed(1)}`;
    return `<svg class="track-thumb" viewBox="0 0 ${width} ${height}" role="img" aria-label="${track.nameKo} 트랙 미리보기"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } catch {
    return '';
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function announce(message: string): void {
  const region = document.getElementById('live-region');
  if (region) {
    region.textContent = '';
    window.setTimeout(() => {
      region.textContent = message;
    }, 30);
  }
}

/**
 * Media & Mermaid lightbox pure helpers (FR-3).
 */

export const LIGHTBOX_ZOOM_MIN = 0.5;
export const LIGHTBOX_ZOOM_MAX = 4.0;
export const LIGHTBOX_ZOOM_STEP = 0.25;

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.max(LIGHTBOX_ZOOM_MIN, Math.min(LIGHTBOX_ZOOM_MAX, scale));
  return Math.round(clamped * 100) / 100;
}

export function stepZoom(scale: number, direction: 1 | -1): number {
  return clampZoom(clampZoom(scale) + direction * LIGHTBOX_ZOOM_STEP);
}

export function formatZoomPercent(scale: number): string {
  return `${Math.round(clampZoom(scale) * 100)}%`;
}

/** Images wrapped in links should navigate rather than open the lightbox. */
export function shouldOpenImageLightbox(target: { tagName: string; hasLinkAncestor: boolean }): boolean {
  return target.tagName.toLowerCase() === 'img' && !target.hasLinkAncestor;
}

/**
 * Prefix every locally defined SVG id and its internal references (url(#...), href="#...")
 * so cloning a rendered Mermaid SVG into a top-layer dialog never collides with the original DOM.
 */
export function scopeSvgIds(svgMarkup: string, prefix = 'lb-'): string {
  if (!svgMarkup || !prefix) return svgMarkup;
  const ids = new Set<string>();
  for (const match of svgMarkup.matchAll(/\bid=(["'])([^"']+)\1/g)) {
    if (match[2]) ids.add(match[2]);
  }
  if (ids.size === 0) return svgMarkup;

  let scoped = svgMarkup;
  // Sort longest first so shorter IDs that are prefixes of longer IDs don't partially replace them.
  const orderedIds = [...ids].sort((a, b) => b.length - a.length);
  for (const id of orderedIds) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = `${prefix}${id}`;
    scoped = scoped.replace(new RegExp(`\\bid=(["'])${escaped}\\1`, 'g'), `id=$1${next}$1`);
    scoped = scoped.replace(new RegExp(`url\\(\\s*(["']?)#${escaped}\\1\\s*\\)`, 'g'), `url($1#${next}$1)`);
    scoped = scoped.replace(new RegExp(`((?:xlink:)?href=)(["'])#${escaped}\\2`, 'g'), `$1$2#${next}$2`);
  }
  return scoped;
}

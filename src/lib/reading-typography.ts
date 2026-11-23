/**
 * Reading typography presets & validation (FR-2).
 * Widths scale with the active reading-area container inline size (cqi) so wide monitors
 * can expand naturally while narrow windows stay legible.
 */

export type ReadingWidthPreset = 'narrow' | 'comfortable' | 'wide';
export type ReadingLineHeightPreset = 'compact' | 'standard' | 'relaxed';

export interface ReadingTypography {
  fontSize: number;
  width: ReadingWidthPreset;
  lineHeight: ReadingLineHeightPreset;
}

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 32;

export const DEFAULT_TYPOGRAPHY: ReadingTypography = {
  fontSize: 16,
  width: 'comfortable',
  lineHeight: 'standard',
};

export const WIDTH_PRESETS: readonly ReadingWidthPreset[] = ['narrow', 'comfortable', 'wide'];
export const LINE_HEIGHT_PRESETS: readonly ReadingLineHeightPreset[] = ['compact', 'standard', 'relaxed'];

export const WIDTH_PRESET_CSS: Record<ReadingWidthPreset, string> = {
  narrow: 'clamp(520px, 56cqi, 100cqi)',
  comfortable: 'clamp(680px, 74cqi, 100cqi)',
  wide: 'clamp(880px, 94cqi, 100cqi)',
};

/** Shell width when the 278px Knowledge Echo sidebar is visible alongside the article. */
export const ECHO_SHELL_WIDTH_CSS: Record<ReadingWidthPreset, string> = {
  narrow: 'clamp(840px, 68cqi, calc(100cqi - 48px))',
  comfortable: 'clamp(960px, 82cqi, calc(100cqi - 48px))',
  wide: 'calc(100cqi - 48px)',
};

export const LINE_HEIGHT_PRESET_VALUE: Record<ReadingLineHeightPreset, number> = {
  compact: 1.5,
  standard: 1.65,
  relaxed: 1.85,
};

export function normalizeTypography(raw: unknown): ReadingTypography {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TYPOGRAPHY };
  const candidate = raw as Partial<ReadingTypography>;

  const rawSize = typeof candidate.fontSize === 'number' && Number.isFinite(candidate.fontSize)
    ? Math.round(candidate.fontSize)
    : DEFAULT_TYPOGRAPHY.fontSize;
  const fontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, rawSize));

  const width = WIDTH_PRESETS.includes(candidate.width as ReadingWidthPreset)
    ? (candidate.width as ReadingWidthPreset)
    : DEFAULT_TYPOGRAPHY.width;

  const lineHeight = LINE_HEIGHT_PRESETS.includes(candidate.lineHeight as ReadingLineHeightPreset)
    ? (candidate.lineHeight as ReadingLineHeightPreset)
    : DEFAULT_TYPOGRAPHY.lineHeight;

  return { fontSize, width, lineHeight };
}

export function isDefaultTypography(value: ReadingTypography): boolean {
  return value.fontSize === DEFAULT_TYPOGRAPHY.fontSize
    && value.width === DEFAULT_TYPOGRAPHY.width
    && value.lineHeight === DEFAULT_TYPOGRAPHY.lineHeight;
}

export function typographyCssVars(value: ReadingTypography): Record<string, string> {
  const safe = normalizeTypography(value);
  return {
    '--reader-font-size': `${safe.fontSize}px`,
    '--reader-max-width': WIDTH_PRESET_CSS[safe.width],
    '--reader-shell-width': ECHO_SHELL_WIDTH_CSS[safe.width],
    '--reader-line-height': String(LINE_HEIGHT_PRESET_VALUE[safe.lineHeight]),
  };
}

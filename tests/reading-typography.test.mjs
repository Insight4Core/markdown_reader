import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TYPOGRAPHY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  WIDTH_PRESET_CSS,
  ECHO_SHELL_WIDTH_CSS,
  normalizeTypography,
  isDefaultTypography,
  typographyCssVars,
} from '../src/lib/reading-typography.ts';

test('normalizeTypography falls back to defaults and clamps out-of-range values to 14-32px', () => {
  assert.equal(FONT_SIZE_MIN, 14);
  assert.equal(FONT_SIZE_MAX, 32);
  assert.deepEqual(normalizeTypography(null), DEFAULT_TYPOGRAPHY);
  assert.deepEqual(normalizeTypography(undefined), DEFAULT_TYPOGRAPHY);
  assert.deepEqual(normalizeTypography({ fontSize: 999, width: 'huge', lineHeight: 'loose' }), {
    fontSize: 32,
    width: 'comfortable',
    lineHeight: 'standard',
  });
  assert.deepEqual(normalizeTypography({ fontSize: 8.4, width: 'narrow', lineHeight: 'compact' }), {
    fontSize: 14,
    width: 'narrow',
    lineHeight: 'compact',
  });
  assert.deepEqual(normalizeTypography({ fontSize: 27.6, width: 'wide', lineHeight: 'relaxed' }), {
    fontSize: 28,
    width: 'wide',
    lineHeight: 'relaxed',
  });
});

test('isDefaultTypography detects any deviation from baseline', () => {
  assert.equal(isDefaultTypography(DEFAULT_TYPOGRAPHY), true);
  assert.equal(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, fontSize: 24 }), false);
  assert.equal(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, width: 'wide' }), false);
  assert.equal(isDefaultTypography({ ...DEFAULT_TYPOGRAPHY, lineHeight: 'relaxed' }), false);
});

test('typographyCssVars maps presets to window-relative cqi widths and scoped typography vars', () => {
  assert.deepEqual(typographyCssVars(DEFAULT_TYPOGRAPHY), {
    '--reader-font-size': '16px',
    '--reader-max-width': WIDTH_PRESET_CSS.comfortable,
    '--reader-shell-width': ECHO_SHELL_WIDTH_CSS.comfortable,
    '--reader-line-height': '1.65',
  });
  assert.deepEqual(typographyCssVars({ fontSize: 30, width: 'wide', lineHeight: 'relaxed' }), {
    '--reader-font-size': '30px',
    '--reader-max-width': WIDTH_PRESET_CSS.wide,
    '--reader-shell-width': ECHO_SHELL_WIDTH_CSS.wide,
    '--reader-line-height': '1.85',
  });
  for (const value of [...Object.values(WIDTH_PRESET_CSS), ...Object.values(ECHO_SHELL_WIDTH_CSS)]) {
    assert.ok(value.includes('cqi'));
  }
});

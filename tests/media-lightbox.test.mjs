import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampZoom,
  stepZoom,
  formatZoomPercent,
  shouldOpenImageLightbox,
  scopeSvgIds,
} from '../src/lib/media-lightbox.ts';

test('zoom helpers clamp, step and format percentages safely', () => {
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(9), 4);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(0.5, -1), 0.5);
  assert.equal(stepZoom(4, 1), 4);
  assert.equal(formatZoomPercent(1.5), '150%');
});

test('shouldOpenImageLightbox ignores images wrapped inside links', () => {
  assert.equal(shouldOpenImageLightbox({ tagName: 'IMG', hasLinkAncestor: false }), true);
  assert.equal(shouldOpenImageLightbox({ tagName: 'img', hasLinkAncestor: true }), false);
  assert.equal(shouldOpenImageLightbox({ tagName: 'DIV', hasLinkAncestor: false }), false);
});

test('scopeSvgIds prefixes local SVG ids and internal references without colliding prefixes', () => {
  const svg = '<svg><defs><marker id="arrow"></marker><marker id="arrow-long"></marker></defs><path marker-end="url(#arrow)" /><path marker-end="url(#arrow-long)" /><use xlink:href="#arrow" href="#arrow-long" /></svg>';
  const scoped = scopeSvgIds(svg, 'lb-');
  assert.ok(scoped.includes('id="lb-arrow"'));
  assert.ok(scoped.includes('id="lb-arrow-long"'));
  assert.ok(scoped.includes('url(#lb-arrow)'));
  assert.ok(scoped.includes('url(#lb-arrow-long)'));
  assert.ok(scoped.includes('xlink:href="#lb-arrow"'));
  assert.ok(scoped.includes('href="#lb-arrow-long"'));
  assert.ok(!scoped.includes('id="arrow"'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadDetails } from '../docs/assets/analytics.js';
import { refreshWindowsDownload } from '../docs/assets/release-downloads.js';

const root = 'https://github.com/Insight4Core/markdown_reader';
const asset = `${root}/releases/download/v0.10.0/Pyrus_0.10.0_x64-setup.exe`;
const anchor = (href, location) => ({ href, getAttribute: () => location, closest: () => null });

test('Windows installer clicks retain their placement and artifact type', () => {
  for (const placement of ['guide_start', 'reader_section', 'article_cta']) {
    assert.deepEqual(downloadDetails(anchor(asset, placement), '/markdown_reader/en/open-md-file-windows/'), {
      target_platform: 'windows', button_location: placement,
      download_kind: 'installer', artifact_format: 'exe',
    });
  }
});

test('release-page navigation is not classified as an installer download', () => {
  assert.equal(downloadDetails(anchor(`${root}/releases/latest`), '/markdown_reader/en/').download_kind, 'release_page');
});

test('examples, signatures, metadata, unrelated repositories and source links are excluded', () => {
  for (const url of [asset + '.sig', `${root}/releases/download/v0.10.0/latest.json`,
    `${root}/releases/download/v0.10.0/reading-demo.md`, `${root}/issues`,
    asset.replace('Insight4Core', 'unrelated'), asset.replace('github.com', 'example.com')]) {
    assert.equal(downloadDetails(anchor(url), '/markdown_reader/en/'), null, url);
  }
});

test('future releases update all installer links and visible metadata together', async () => {
  const links = [{ href: asset }, { href: asset }, { href: asset }];
  const version = { textContent: 'v0.10.0' };
  const name = { textContent: 'Pyrus_0.10.0_x64-setup.exe' };
  const selectors = { '[data-pyrus-windows-installer]': links,
    '[data-pyrus-release-version]': [version], '[data-pyrus-installer-name]': [name] };
  const doc = { querySelectorAll: selector => selectors[selector] };
  const next = asset.replaceAll('0.10.0', '1.0.0');
  await refreshWindowsDownload(doc, async () => ({ ok: true, json: async () => ({
    tag_name: 'v1.0.0', assets: [{ state: 'uploaded', name: 'Pyrus_1.0.0_x64-setup.exe', browser_download_url: next }],
  }) }));
  assert.ok(links.every(link => link.href === next));
  assert.equal(version.textContent, 'v1.0.0');
  assert.equal(name.textContent, 'Pyrus_1.0.0_x64-setup.exe');
});

test('GitHub outages leave the static installer link usable', async () => {
  for (const request of [async () => ({ ok: false }), async () => { throw new Error('offline'); }]) {
    const links = [{ href: asset }];
    await refreshWindowsDownload({ querySelectorAll: () => links }, request);
    assert.equal(links[0].href, asset);
  }
});

// The HTML always has a working, version-labelled installer link, including without JS.
// Enhance it with the latest published x64 .exe when GitHub's public API is available.
const endpoint = 'https://api.github.com/repos/Insight4Core/markdown_reader/releases/latest';

export function windowsInstaller(release) {
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find(item => item && item.state === 'uploaded' && /^Pyrus_[^/]+_x64-setup\.exe$/i.test(item.name));
  if (!asset) return null;
  try {
    const url = new URL(asset.browser_download_url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
        !url.pathname.startsWith('/Insight4Core/markdown_reader/releases/download/') || url.search || url.hash || url.username || url.password) return null;
    return { url: url.href, name: asset.name, version: release.tag_name };
  } catch { return null; }
}

export async function refreshWindowsDownload(documentRoot = document, fetchRelease = fetch) {
  const links = documentRoot.querySelectorAll('[data-pyrus-windows-installer]');
  if (!links.length) return;
  try {
    const response = await fetchRelease(endpoint, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return;
    const installer = windowsInstaller(await response.json());
    if (!installer) return;
    links.forEach(link => { link.href = installer.url; });
    documentRoot.querySelectorAll('[data-pyrus-release-version]').forEach(node => { node.textContent = installer.version; });
    documentRoot.querySelectorAll('[data-pyrus-installer-name]').forEach(node => { node.textContent = installer.name; });
  } catch {
    // Rate limits, offline use, or missing assets must never disable the HTML download.
  }
}

if (typeof document !== 'undefined') void refreshWindowsDownload();

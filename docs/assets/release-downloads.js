// The HTML always has a working, version-labelled installer link, including without JS.
// Enhance it with the latest published x64 .exe or aarch64 .dmg when GitHub's public API is available.
const endpoint = 'https://api.github.com/repos/Insight4Core/markdown_reader/releases/latest';

function matchInstaller(release, pattern) {
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find(item => item && item.state === 'uploaded' && pattern.test(item.name));
  if (!asset) return null;
  try {
    const url = new URL(asset.browser_download_url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
        !url.pathname.startsWith('/Insight4Core/markdown_reader/releases/download/') || url.search || url.hash || url.username || url.password) return null;
    return { url: url.href, name: asset.name, version: release.tag_name };
  } catch { return null; }
}

export function windowsInstaller(release) {
  return matchInstaller(release, /^Pyrus_[^/]+_x64-setup\.exe$/i);
}

export function macosInstaller(release) {
  return matchInstaller(release, /^Pyrus_[^/]+_aarch64\.dmg$/i);
}

export async function refreshWindowsDownload(documentRoot = document, fetchRelease = fetch) {
  const winLinks = documentRoot.querySelectorAll('[data-pyrus-windows-installer]') || [];
  const macLinks = documentRoot.querySelectorAll('[data-pyrus-macos-installer]') || [];
  if (!winLinks.length && !macLinks.length) return;
  try {
    const response = await fetchRelease(endpoint, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return;
    const release = await response.json();
    const win = winLinks.length ? windowsInstaller(release) : null;
    const mac = macLinks.length ? macosInstaller(release) : null;
    if (!win && !mac) return;
    if (win) {
      winLinks.forEach(link => { link.href = win.url; });
      (documentRoot.querySelectorAll('[data-pyrus-installer-name]') || []).forEach(node => { node.textContent = win.name; });
    }
    if (mac) {
      macLinks.forEach(link => { link.href = mac.url; });
      (documentRoot.querySelectorAll('[data-pyrus-macos-installer-name]') || []).forEach(node => { node.textContent = mac.name; });
    }
    const version = (win || mac).version;
    (documentRoot.querySelectorAll('[data-pyrus-release-version]') || []).forEach(node => { node.textContent = version; });
  } catch {
    // Rate limits, offline use, or missing assets must never disable the HTML download.
  }
}

if (typeof document !== 'undefined') void refreshWindowsDownload();

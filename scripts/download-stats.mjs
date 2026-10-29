#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = 'Insight4Core/markdown_reader';
const statsDirectory = fileURLToPath(new URL('../.local-stats/downloads/', import.meta.url));

export function assetCategory(name) {
  if (typeof name !== 'string') return null;
  if (/\.(exe|msi)$/i.test(name)) return 'windows';
  if (/\.dmg$/i.test(name)) return 'macos';
  if (/\.(deb|rpm|AppImage)$/i.test(name)) return 'linux';
  if (/\.app\.tar\.gz$/i.test(name)) return 'updater';
  return null; // signatures, latest.json, source archives, and other metadata
}

export function summarizeReleases(releases) {
  const totals = { windows: 0, macos: 0, linux: 0, updater: 0 };
  const versions = releases.filter(release => !release.draft).map(release => {
    const counts = { windows: 0, macos: 0, linux: 0, updater: 0 };
    const assets = (release.assets || []).flatMap(asset => {
      const category = assetCategory(asset.name);
      if (!category || !Number.isSafeInteger(asset.download_count) || asset.download_count < 0) return [];
      counts[category] += asset.download_count;
      totals[category] += asset.download_count;
      return [{ id: asset.id, name: asset.name, category, downloads: asset.download_count }];
    });
    return { version: release.tag_name, prerelease: Boolean(release.prerelease), publishedAt: release.published_at, ...counts, assets };
  });
  return { totals: { ...totals, installers: totals.windows + totals.macos + totals.linux }, versions };
}

async function fetchReleases(latest) {
  const releases = [];
  for (let page = 1; page <= 50; page++) {
    const url = latest ? `https://api.github.com/repos/${repository}/releases/latest`
      : `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pyrus-download-stats' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}. Public API rate limits may apply; retry later.`);
    const data = await response.json();
    if (latest) return [data];
    if (!Array.isArray(data)) throw new Error('Unexpected release response from GitHub.');
    releases.push(...data);
    if (!response.headers.get('link')?.includes('rel="next"')) return releases;
  }
  throw new Error('More than 50 release pages; refusing to report a partial total.');
}

async function saveSnapshot(snapshot) {
  await mkdir(statsDirectory, { recursive: true, mode: 0o700 });
  const files = (await readdir(statsDirectory)).filter(name => name.endsWith('.json')).sort().reverse();
  let previous = null;
  for (const file of files) {
    try {
      const saved = JSON.parse(await readFile(join(statsDirectory, file), 'utf8'));
      if (saved.repository === repository && saved.scope === snapshot.scope && saved.totals) { previous = saved; break; }
    } catch { /* Ignore incomplete or unrelated local files. */ }
  }
  const destination = join(statsDirectory, snapshot.capturedAt.replaceAll(':', '-') + '.json');
  await writeFile(destination, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { destination, previous };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log('npm run downloads [-- --latest --snapshot --json]\nDefault: all public releases; --latest: latest stable release only.\n--snapshot: save an ignored local baseline and compare with the previous matching scope.');
    return;
  }
  for (const arg of args) if (!['--latest', '--snapshot', '--json'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
  const latest = args.has('--latest');
  const summary = summarizeReleases(await fetchReleases(latest));
  const snapshot = { repository, scope: latest ? 'latest' : 'all', capturedAt: new Date().toISOString(), ...summary };
  const saved = args.has('--snapshot') ? await saveSnapshot(snapshot) : null;
  if (args.has('--json')) { console.log(JSON.stringify(snapshot, null, 2)); return; }
  console.log(`GitHub download counters — ${repository} — ${latest ? 'latest stable release' : 'all public releases (including prereleases)'}`);
  console.log(`Checked: ${new Date(snapshot.capturedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} Asia/Shanghai`);
  console.table(summary.versions.map(({ version, prerelease, windows, macos, linux, updater }) => ({ version: version + (prerelease ? ' (pre)' : ''), windows, macos, linux, updater })));
  console.log(`Installer counters: ${summary.totals.installers} (Windows ${summary.totals.windows}, macOS ${summary.totals.macos}, Linux ${summary.totals.linux}). Updater payloads separately: ${summary.totals.updater}.`);
  if (latest) console.table(summary.versions.flatMap(version => version.assets.map(({ name, category, downloads }) => ({ file: name, category, downloads }))));
  if (saved) {
    console.log(`Local snapshot: ${saved.destination}`);
    if (saved.previous) {
      console.log(`Net installer-counter change since ${saved.previous.capturedAt}: ${snapshot.totals.installers - saved.previous.totals.installers}. Deleted/replaced assets or a new latest release can affect this comparison.`);
    } else console.log('First baseline saved. Run again with --snapshot later to compare.');
  }
  console.log('These are file-download counters, not unique people, completed installs, or active users. Repeats, tests, and automation can contribute. No binary was downloaded by this check.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

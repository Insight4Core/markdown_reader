export type ReadingLink =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; fragment: string }
  | { kind: 'markdown'; path: string; fragment?: string }
  | { kind: 'unsupported' };

export function decodeLinkPart(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** Classify before decoding: an encoded # belongs to a filename, not a fragment. */
export function parseReadingLink(href: string): ReadingLink {
  const value = href.trim();
  if (!value) return { kind: 'unsupported' };
  if (value.startsWith('#')) return { kind: 'anchor', fragment: value.slice(1) };
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return { kind: 'external', url: value };
  if (value.startsWith('//')) return { kind: 'external', url: `https:${value}` };

  let local = value;
  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.hostname && url.hostname !== 'localhost') return { kind: 'unsupported' };
      local = `${url.pathname}${url.search}${url.hash}`;
      if (/^\/[a-z]:\//i.test(local)) local = local.slice(1);
    } catch { return { kind: 'unsupported' }; }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[/\\]/i.test(value)) {
    return { kind: 'unsupported' };
  }

  const hash = local.indexOf('#');
  const fragment = hash < 0 ? undefined : local.slice(hash + 1);
  const path = decodeLinkPart((hash < 0 ? local : local.slice(0, hash)).split('?')[0]);
  if (!/\.(md|markdown|mdx)$/i.test(path)) return { kind: 'unsupported' };
  return { kind: 'markdown', path, fragment };
}

export function fragmentCandidates(fragment: string): string[] {
  const decoded = decodeLinkPart(fragment);
  return [...new Set([fragment, decoded, encodeURIComponent(decoded)])];
}

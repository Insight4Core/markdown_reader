/**
 * Turn the rendered article into HTML that survives being pasted into mail, docs and chat apps.
 * Those apps drop stylesheets and class names, so app chrome is removed and the few styles that
 * carry meaning (code, tables, quotes) are inlined.
 */

const FONT_BODY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_CODE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const INLINE_STYLES: Record<string, string> = {
  pre: `margin:0 0 1em;padding:12px 14px;border-radius:6px;background:#f6f8fa;font-family:${FONT_CODE};font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;`,
  code: `padding:1px 4px;border-radius:4px;background:#eff1ef;font-family:${FONT_CODE};font-size:0.92em;`,
  blockquote: 'margin:0 0 1em;padding:0 1em;border-left:4px solid #d0d7de;color:#57606a;',
  table: 'margin:0 0 1em;border-collapse:collapse;',
  th: 'padding:6px 12px;border:1px solid #d0d7de;background:#f6f8fa;font-weight:600;text-align:left;vertical-align:top;',
  td: 'padding:6px 12px;border:1px solid #d0d7de;text-align:left;vertical-align:top;',
  img: 'max-width:100%;height:auto;',
  hr: 'margin:1.5em 0;border:0;border-top:1px solid #d0d7de;',
  mark: 'background:#fff07e;',
};
const CALLOUT_STYLE = 'margin:0 0 1em;padding:8px 14px;border-left:4px solid #326657;background:#f4f7f5;';

/** Elements that belong to the reading interface, not the note. */
const APP_CHROME = '.md-reader__btn, .md-reader__btn--copy, .md-reader__head-anchor, .header-anchor, script, button';

export async function articleHtmlForClipboard(article: Element): Promise<string> {
  const clone = article.cloneNode(true) as HTMLElement;
  // The clone is not laid out, so take diagram sizes from the article on screen.
  const svgSizes = new Map<SVGSVGElement, { width: number; height: number }>();
  const shownSvgs = article.querySelectorAll('svg');
  clone.querySelectorAll('svg').forEach((svg, index) => {
    const box = shownSvgs[index]?.getBoundingClientRect();
    if (box) svgSizes.set(svg, { width: Math.round(box.width), height: Math.round(box.height) });
  });
  clone.querySelectorAll(APP_CHROME).forEach(element => element.remove());
  // Pasted documents are white: keep the light drawing of each diagram, drop the dark-theme one.
  clone.querySelectorAll('.mermaid-diagram__screen').forEach(element => element.remove());

  // KaTeX renders math twice (MathML + styled spans); without its stylesheet both show up garbled.
  // The TeX source is what readers and other tools understand once the styles are gone.
  const replaceMath = (element: Element, display: boolean) => {
    const tex = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    if (!tex) return;
    const code = document.createElement('code');
    code.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    if (display) {
      const block = document.createElement('p');
      block.append(code);
      element.replaceWith(block);
    } else {
      element.replaceWith(code);
    }
  };
  clone.querySelectorAll('.katex-display').forEach(element => replaceMath(element, true));
  clone.querySelectorAll('.katex').forEach(element => replaceMath(element, false));

  // Checkboxes are dropped by most editors; keep the state as text.
  clone.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.replaceWith(document.createTextNode((input as HTMLInputElement).checked || input.hasAttribute('checked') ? '☑ ' : '☐ '));
  });

  // Callouts lose their look with their class names, so mark them before classes are stripped.
  clone.querySelectorAll('.markdown-alert, blockquote.info, blockquote.tip, blockquote.success, blockquote.warning, blockquote.danger').forEach(element => {
    element.setAttribute('data-export-callout', '');
  });

  await Promise.all(Array.from(clone.querySelectorAll('svg')).map(svg => rasterizeSvg(svg, svgSizes.get(svg))));

  for (const element of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    if (element.closest('svg') && element.tagName.toLowerCase() !== 'svg') continue;
    const tag = element.tagName.toLowerCase();
    const callout = element.hasAttribute('data-export-callout');
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const keep = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'width', 'height', 'viewbox', 'xmlns'].includes(name)
        || (tag === 'svg' && name !== 'class' && name !== 'id' && name !== 'style');
      if (!keep) element.removeAttribute(attribute.name);
    }
    const inPre = tag === 'code' && element.parentElement?.tagName.toLowerCase() === 'pre';
    const style = callout ? CALLOUT_STYLE : inPre ? 'font-family:inherit;' : INLINE_STYLES[tag];
    if (style) element.setAttribute('style', style);
  }

  return `<div style='font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#1f2328;'>${clone.innerHTML}</div>`;
}

/** Diagrams (Mermaid) are inline SVG, which most paste targets ignore; swap in a PNG when the browser allows it. */
async function rasterizeSvg(svg: SVGSVGElement, shown?: { width: number; height: number }) {
  try {
    const viewBox = svg.viewBox?.baseVal;
    const width = Math.round(shown?.width || viewBox?.width || Number(svg.getAttribute('width')) || 0);
    const height = Math.round(shown?.height || viewBox?.height || Number(svg.getAttribute('height')) || 0);
    if (width < 24 || height < 24) return; // icons and decorations, not diagrams
    const source = svg.cloneNode(true) as SVGSVGElement;
    source.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    source.setAttribute('width', String(width));
    source.setAttribute('height', String(height));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(source))}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG could not be loaded'));
      image.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = document.createElement('img');
    png.src = canvas.toDataURL('image/png'); // throws if the SVG tainted the canvas (e.g. foreignObject labels)
    png.alt = svg.getAttribute('aria-label') || 'Diagram';
    png.width = width;
    png.height = height;
    svg.replaceWith(png);
  } catch {
    // Keep the SVG: apps that understand it still show the diagram.
  }
}

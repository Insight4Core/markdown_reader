import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import mSub from 'markdown-it-sub'
import mSup from 'markdown-it-sup'
import mIns from 'markdown-it-ins'
import mAbbr from 'markdown-it-abbr'
import mMark from 'markdown-it-mark'
import { full as mEmoji } from 'markdown-it-emoji'
import mDeflist from 'markdown-it-deflist'
import mFootnote from 'markdown-it-footnote'
import mTaskLists from 'markdown-it-task-lists'
import mToc from 'markdown-it-table-of-contents'
import mKatex from '@traptitech/markdown-it-katex'
import 'katex/dist/katex.min.css'
import { markdownItMermaid } from '$lib/mermaid-diagrams'
import mAlert from '@/plugins/alert'
import mMultimdTable from 'markdown-it-multimd-table'
import MD_PLUGINS from '@/config/md-plugins'
import className from '@/config/class-name'
import { escapeHtml } from 'markdown-it/lib/common/utils'

type Plugins = { [p: string]: ((a: MdOptions) => any[]) | any[] }
const PLUGINS: Plugins = {
  Emoji: [mEmoji],
  Sub: [mSub],
  Sup: [mSup],
  Ins: [mIns],
  Abbr: [mAbbr],
  Katex: [mKatex],
  // Diagrams are drawn after the HTML is on the page (see renderMermaidDiagrams).
  Mermaid: [markdownItMermaid],
  Mark: [mMark],
  Deflist: [mDeflist],
  Footnote: [mFootnote],
  TaskLists: [mTaskLists],
  TOC: [mToc],
  Alert: [mAlert],
}

export interface MdOptions {
  [key: string]: any
  config?: MarkdownIt.Options
  plugins?: Array<string>
}

function initRender({ config = {}, plugins = [...MD_PLUGINS] }: MdOptions) {
  const copyButtonHtml = `<button type="button" class="${className.MD_BUTTON} ${className.COPY_BTN}" title="Copy" aria-label="Copy code">`
    + `<svg class="icon-copy" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2.5"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
    + `<svg class="icon-success" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`
    + `</button>`

  const md = new MarkdownIt({
    html: true,
    breaks: false,
    linkify: true,
    xhtmlOut: true,
    typographer: true,
    highlight(str: string, language: string) {
      if (language && hljs.getLanguage(language)) {
        try {
          return `<pre class="hljs-pre md-reader__code-block"><code class="hljs" lang="${language}">${
            hljs.highlight(str, { language, ignoreIllegals: true }).value
          }</code>${copyButtonHtml}</pre>`
        } catch (err) {
          console.error(err)
          return 'parse error'
        }
      }
      const code = escapeHtml(str)
      return `<pre class="hljs-pre md-reader__code-block"><code class="hljs ${language}">${code}</code>${copyButtonHtml}</pre>`
    },
    ...config,
  })

  // parse email
  md.linkify.set({ fuzzyEmail: true })
  // builtin plugins
  md.use(mMultimdTable)

  // custom plugins
  plugins.forEach(name => {
    let plugin = PLUGINS[name]
    if (typeof plugin === 'function') {
      plugin = plugin(arguments[0])
    }
    plugin && md.use(plugin[0], ...plugin.slice(1))
  })

  md.core.ruler.push('source_lines', state => {
    for (const token of state.tokens) {
      if (token.map && token.nesting !== -1 && token.type !== 'inline') {
        token.attrSet('data-source-start', String(token.map[0] + 1))
        token.attrSet('data-source-end', String(token.map[1]))
      }
    }
  })
  for (const name of ['fence', 'code_block']) {
    const render = md.renderer.rules[name]
    if (!render) continue
    md.renderer.rules[name] = (tokens, index, options, env, self) => {
      const html = render(tokens, index, options, env, self)
      const map = tokens[index].map
      return map ? html.replace(/<pre\b/, `<pre data-source-start="${map[0] + 1}" data-source-end="${map[1]}"`) : html
    }
  }
  return md
}

// identify & filter frontmatter
function removeFrontmatter(content: string): string {
  const frontmatterRegex = /^---[\s\S]+?---\n/
  return content.replace(frontmatterRegex, match => '\n'.repeat((match.match(/\n/g) || []).length))
}

interface MdRender {
  (code: string, options: MdOptions): string
  md?: MarkdownIt
}
export const mdRender: MdRender = (code, options): string => {
  if (!mdRender.md || options) {
    mdRender.md = initRender(options)
  }
  // filter frontmatter
  const filteredCode = removeFrontmatter(code)
  return mdRender.md.render(filteredCode)
}

export default initRender

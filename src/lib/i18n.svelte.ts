export const translations: Record<string, Record<string, string>> = {
  zh: {
    'sidebar.files': '文件夹',
    'sidebar.toc': '大纲',
    'sidebar.search_placeholder': '🔍 搜索文件...',
    'sidebar.no_md_match': '无匹配的 Markdown 文件',
    'sidebar.no_toc': '暂无目录',
    
    'welcome.title': '欢迎来到您的知识库',
    'welcome.subtitle': '请在左侧栏选择一个 Markdown 文档开始阅读',
    
    'settings.title': '偏好设置',
    'settings.open_file': '📄 打开单篇 Markdown 文件',
    'settings.open_folder': '📁 指定知识库文件夹',
    'settings.scan_depth': '📁 文件夹扫描深度',
    'settings.layers': '层',
    'settings.refresh': '刷新扫描',
    'settings.depth_hint': '调大后会读取内部嵌套更深的子文件夹文件。',
    'settings.sys_language': '🌐 语言 (Language)',
    'settings.toggle_sidebar': '开启侧边栏',
    
    'misc.reader_title': '阅读器'
  },
  en: {
    'sidebar.files': 'Explorer',
    'sidebar.toc': 'Outline',
    'sidebar.search_placeholder': '🔍 Search files...',
    'sidebar.no_md_match': 'No matching Markdown files',
    'sidebar.no_toc': 'No outline available',
    
    'welcome.title': 'Welcome to your Workspace',
    'welcome.subtitle': 'Please select a Markdown document from the sidebar to start reading',
    
    'settings.title': 'Preferences',
    'settings.open_file': '📄 Open single Markdown file',
    'settings.open_folder': '📁 Choose workspace folder',
    'settings.scan_depth': '📁 Folder scan depth',
    'settings.layers': 'layers',
    'settings.refresh': 'Refresh',
    'settings.depth_hint': 'Increasing this reads deeper nested sub-folders.',
    'settings.sys_language': '🌐 Language',
    'settings.toggle_sidebar': 'Enable Sidebar',
    
    'misc.reader_title': 'Reader'
  }
};

export const i18nState = $state({
  locale: 'zh'
});

export function t(key: string): string {
  const dict = translations[i18nState.locale] || translations['zh'];
  return dict[key] || key;
}

export function detectSystemLanguage() {
  if (typeof navigator === 'undefined') return 'zh';
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('en')) return 'en';
  // Default to zh for zh-CN, zh-TW, etc. or fallback
  return 'zh';
}

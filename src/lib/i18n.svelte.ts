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
    
    'settings.appearance': '💡 主题风格',
    'settings.typography': '🔤 排版字体',
    'font.auto': '跟随主题 (Auto)',
    'font.lxgw': '✨ 霞鹜文楷 (内置极品)',
    'font.system': '系统无衬线 (System)',
    'font.serif': '古典衬线 (Serif)',
    'font.mono': '极客等宽 (Monospace)',
    'font.custom': '自定义 (Custom Name)...',
    'font.custom_placeholder': '输入系统中已安装的字体名',
    
    'theme.light': '极简白天',
    'theme.dark': '极夜暗黑',
    'theme.newsprint': 'Newsprint (报刊阅读)',
    'theme.terminal': 'Terminal (极客终端)',
    'theme.glass': 'Glass (果味纯毛玻璃)',
    
    'update.new_version': '发现新版本',
    'update.content': '更新内容',
    'update.regular': '常规功能升级与优化',
    'update.prompt': '是否立即下载并在后台重启更新',
    'update.title': '升级提示',
    'update.check_btn': '🔄 检查更新',
    'update.checking': '检查中...',
    'update.up_to_date': '您贴心的 Pyrus 当前已是最新版本！',
    'update.error': '网络通讯或配置问题，检查更新失败：',
    
    'misc.reader_title': 'Pyrus'
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
    
    'settings.appearance': '💡 Appearance',
    'settings.typography': '🔤 Typography',
    'font.auto': 'Auto (Follow Theme)',
    'font.lxgw': '✨ LXGW WenKai (Built-in)',
    'font.system': 'System Sans-serif',
    'font.serif': 'Classic Serif',
    'font.mono': 'Developer Monospace',
    'font.custom': 'Custom Font Family...',
    'font.custom_placeholder': 'Enter exact font name installed on system',
    
    'theme.light': 'Minimal Light',
    'theme.dark': 'Night Dark',
    'theme.newsprint': 'Newsprint (Paper)',
    'theme.terminal': 'Terminal (Hacker)',
    'theme.glass': 'Glassmorphism',
    
    'update.new_version': 'New version available',
    'update.content': 'Release Notes',
    'update.regular': 'General improvements and bug fixes',
    'update.prompt': 'Download and restart to apply the update',
    'update.title': 'Update Prompt',
    'update.check_btn': '🔄 Check for Updates',
    'update.checking': 'Checking...',
    'update.up_to_date': 'Your Pyrus is already up to date!',
    'update.error': 'Failed to check for updates due to network or config error: ',
    
    'misc.reader_title': 'Pyrus'
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

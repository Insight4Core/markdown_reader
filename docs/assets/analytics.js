import { measurementId } from './analytics-config.js';

const consentKey = 'pyrus-site-analytics-consent-v1';
const consentLifetime = 180 * 24 * 60 * 60 * 1000;
const productionHost = 'insight4core.github.io';
const productionPath = '/markdown_reader/';

export function downloadDetails(anchor, pagePath) {
  let url;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com' ||
      !/^\/Insight4Core\/markdown_reader\/releases\/latest\/?$/i.test(url.pathname)) return null;

  const platform = pagePath.includes('/open-md-file-windows/') ? 'windows'
    : pagePath.includes('/open-md-file-mac/') ? 'macos' : 'all';
  const placement = anchor.closest('.hero') ? 'hero'
    : anchor.closest('.closing') ? 'closing'
    : anchor.closest('.article-cta') ? 'article_cta' : 'article_inline';
  return { target_platform: platform, button_location: placement };
}

function readConsent() {
  try {
    const saved = JSON.parse(localStorage.getItem(consentKey));
    return saved && ['granted', 'denied'].includes(saved.value) &&
      Date.now() - saved.at >= 0 && Date.now() - saved.at < consentLifetime
      ? saved.value : null;
  } catch {
    return null;
  }
}

function init() {
  if (!/^G-[A-Z0-9]+$/.test(measurementId) ||
      location.hostname !== productionHost || !location.pathname.startsWith(productionPath)) return;

  const zh = document.documentElement.lang.toLowerCase().startsWith('zh');
  const copy = zh ? {
    title: '帮助我们了解网站是否有用',
    text: '允许后，Google Analytics 会使用 Cookie 统计页面访问和下载入口点击，并处理浏览器、设备及大致地区信息。不读取笔记或本地文件。你可以随时在页脚更改选择。',
    allow: '允许统计', reject: '不允许', settings: '统计设置', policy: 'Google 数据使用说明',
  } : {
    title: 'Help us understand what works',
    text: 'With your permission, Google Analytics uses cookies to measure page visits and download-link clicks, and processes browser, device, and approximate region information. It cannot read your notes or local files. Change your choice in the footer anytime.',
    allow: 'Allow analytics', reject: 'Decline', settings: 'Analytics settings', policy: 'How Google uses data',
  };
  let consent = readConsent();
  let started = false;
  const pageLocation = location.origin + location.pathname;
  const pageFields = {
    page_location: pageLocation,
    page_title: document.title,
    page_language: zh ? 'zh-cn' : 'en',
  };
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch {}

  function start() {
    if (started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      ...pageFields, page_referrer: referrer,
      send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, cookie_path: productionPath,
      cookie_expires: 15552000,
    });
    window.gtag('event', 'page_view', { ...pageFields, page_referrer: referrer, send_to: measurementId });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
  }

  const banner = document.createElement('section');
  banner.className = 'analytics-consent';
  banner.setAttribute('aria-label', copy.title);
  const title = document.createElement('strong');
  title.textContent = copy.title;
  const text = document.createElement('p');
  text.textContent = copy.text;
  const policy = document.createElement('a');
  policy.href = 'https://policies.google.com/technologies/partner-sites';
  policy.textContent = copy.policy;
  policy.target = '_blank';
  policy.rel = 'noopener noreferrer';
  const actions = document.createElement('div');
  actions.className = 'analytics-consent__actions';

  function choose(value) {
    consent = value;
    try { localStorage.setItem(consentKey, JSON.stringify({ value, at: Date.now() })); } catch {}
    banner.hidden = true;
    window[`ga-disable-${measurementId}`] = value !== 'granted';
    if (value === 'granted') {
      if (started) window.gtag('consent', 'update', { analytics_storage: 'granted' });
      else start();
    } else if (started) {
      // Unload the Google tag after withdrawing consent; the next page stays blocked.
      location.reload();
    }
  }

  for (const [value, label] of [['denied', copy.reject], ['granted', copy.allow]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = label;
    button.addEventListener('click', () => choose(value));
    actions.append(button);
  }
  banner.append(title, text, policy, actions);
  banner.hidden = consent !== null;
  document.body.append(banner);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'analytics-settings';
  settings.textContent = copy.settings;
  settings.addEventListener('click', () => {
    banner.hidden = false;
    actions.querySelector('button').focus();
  });
  (document.querySelector('.footer') || document.body).append(settings);

  document.addEventListener('click', (event) => {
    if (consent !== 'granted' || !started || !(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const details = downloadDetails(anchor, location.pathname);
    if (!details) return;
    window.gtag('event', 'download_click', {
      ...pageFields, ...details, send_to: measurementId,
      transport_type: 'beacon',
    });
  });
  if (consent === 'granted') start();
}

if (typeof document !== 'undefined') init();

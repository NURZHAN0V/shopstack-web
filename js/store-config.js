/**
 * Публичная конфигурация магазина с API (кэш на сессию страницы).
 */
import { getStoreConfig } from './api.js';
import { applyDocumentMeta, mediaUrl, setCurrency, setCurrencyFormat } from './utils.js';

let config = null;

function defaultConfig() {
  return {
    general: { shopName: 'Магазин', description: '' },
    storefront: {
      homepageTitle: '',
      catalogLayout: 'grid',
      productsPerPage: 24,
      showOutOfStock: true,
      showProductSku: false,
      enableGuestCheckout: true,
      showBreadcrumbs: true,
    },
    products: {
      showWeight: true,
      showDimensions: false,
      allowReviews: true,
    },
    currency: {
      currency: 'RUB',
      currencyPosition: 'after',
      decimalSeparator: ',',
      thousandSeparator: 'space',
    },
    seo: {},
  };
}

function applyFavicon(url) {
  if (!url) return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = mediaUrl(url);
}

function applyVerificationMeta(seo = {}) {
  const pairs = [
    ['google-site-verification', seo.googleSiteVerification],
    ['yandex-verification', seo.yandexSiteVerification],
  ];
  pairs.forEach(([name, content]) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!content) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('meta');
      el.name = name;
      document.head.appendChild(el);
    }
    el.content = content;
  });
  if (seo.allowIndexing === false) {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow';
  }
}

function applyConfig(cfg) {
  const currency = cfg.currency || {};
  if (currency.currency) setCurrency(currency.currency);
  setCurrencyFormat(currency);
  applyVerificationMeta(cfg.seo || {});
  applyFavicon(cfg.general?.faviconUrl);
}

/** Загружает /api/store/config и применяет валюту, favicon, SEO-meta. */
export async function loadStoreConfig(force = false) {
  if (config && !force) return config;
  try {
    config = await getStoreConfig();
  } catch {
    config = defaultConfig();
  }
  applyConfig(config);
  return config;
}

export function getCachedStoreConfig() {
  return config || defaultConfig();
}

/** Данные для шапки/подвала из store_configs. */
export function siteFromConfig(cfg = getCachedStoreConfig()) {
  const g = cfg.general || {};
  const seo = cfg.seo || {};
  return {
    id: 1,
    name: g.shopName || g.shopShortName || 'Магазин',
    tagline: g.description || '',
    metaTitle: seo.metaTitle || g.shopName || 'Магазин',
    metaDescription: seo.metaDescription || g.description || '',
    logo: g.logoUrl || '',
    favicon: g.faviconUrl || '',
    contactEmail: g.shopEmail || '',
    contactPhone: g.shopPhone || '',
    address: g.address || g.city || '',
    domain: g.domain || seo.domain || '',
  };
}

/** SEO для конкретной страницы: title + description через разделитель. */
export function pageTitle(parts = [], cfg = getCachedStoreConfig()) {
  const seo = cfg.seo || {};
  const shop = cfg.general?.shopName || 'Магазин';
  const sep = seo.titleSeparator || '|';
  const filtered = parts.filter(Boolean);
  if (!filtered.length) return seo.metaTitle || shop;
  return `${filtered.join(` ${sep} `)} ${sep} ${shop}`;
}

export function applyStoreSeoDefaults(cfg = getCachedStoreConfig()) {
  const site = siteFromConfig(cfg);
  applyDocumentMeta(site.metaTitle, site.metaDescription);
}

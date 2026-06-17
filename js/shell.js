import { getStoreStatus, getSite, discoverFooterPages } from './api.js';
import {
  escapeHtml,
  formatPrice,
  FOOTER_PAGE_SLUGS,
  isOutOfStock,
  mediaUrl,
  pageUrl,
  setCurrency,
} from './utils.js';

const state = {
  site: null,
  storeStatus: null,
  categories: [],
  ready: false,
};

export function getSiteData() {
  return state.site;
}

export function getStoreStatusData() {
  return state.storeStatus;
}

function renderMaintenance(message) {
  document.body.innerHTML = `
    <div class="maintenance">
      <div class="maintenance__card">
        <div class="maintenance__icon" aria-hidden="true">🔧</div>
        <h1 class="maintenance__title">Сайт временно недоступен</h1>
        <p class="maintenance__text">${escapeHtml(message || 'Мы проводим техническое обслуживание. Пожалуйста, зайдите позже.')}</p>
      </div>
    </div>`;
}

export async function initShell(options = {}) {
  const { activeNav = '', skipMaintenance = false } = options;

  let status;
  try {
    status = await getStoreStatus();
    state.storeStatus = status;
    if (status.baseCurrency) setCurrency(status.baseCurrency);
  } catch {
    status = { maintenanceMode: false };
  }

  if (!skipMaintenance && status.maintenanceMode) {
    renderMaintenance(status.maintenanceMessageRu || status.maintenanceMessageEn);
    return { maintenance: true };
  }

  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');
  const appEl = document.getElementById('app-content');

  if (!headerEl || !footerEl) {
    return { maintenance: false };
  }

  try {
    state.site = await getSite();
  } catch {
    state.site = { name: 'Магазин', tagline: '' };
  }

  const site = state.site;
  const logoSrc = site.logo ? mediaUrl(site.logo) : '';
  const logoHtml = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="" width="40" height="40">`
    : '';

  headerEl.innerHTML = `
    <div class="container site-header__inner">
      <a class="site-header__logo" href="index.html">
        ${logoHtml}
        <span>${escapeHtml(site.name || 'ShopStack')}</span>
      </a>
      <nav class="site-header__nav" aria-label="Основная навигация">
        <a href="index.html" class="${activeNav === 'home' ? 'is-active' : ''}">Главная</a>
        <a href="catalog.html" class="${activeNav === 'catalog' ? 'is-active' : ''}">Каталог</a>
      </nav>
      <form class="site-header__search" action="search.html" method="get" role="search">
        <label class="sr-only" for="header-search">Поиск товаров</label>
        <input id="header-search" type="search" name="q" placeholder="Поиск товаров…" autocomplete="off">
        <button type="submit" class="btn btn--primary btn--sm">Найти</button>
      </form>
      <button type="button" class="site-header__menu-btn" id="mobile-menu-btn" aria-label="Меню" aria-expanded="false">☰</button>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Мобильное меню">
      <a href="index.html">Главная</a>
      <a href="catalog.html">Каталог</a>
    </nav>`;

  const footerPages = await discoverFooterPages(FOOTER_PAGE_SLUGS);
  const pageLinks = footerPages
    .map((p) => `<a href="${pageUrl(p.slug)}">${escapeHtml(p.title)}</a>`)
    .join('');

  const contacts = [
    site.contactPhone && `<div>Телефон: <a href="tel:${escapeHtml(site.contactPhone)}">${escapeHtml(site.contactPhone)}</a></div>`,
    site.contactEmail && `<div>Email: <a href="mailto:${escapeHtml(site.contactEmail)}">${escapeHtml(site.contactEmail)}</a></div>`,
    site.address && `<div>${escapeHtml(site.address)}</div>`,
  ]
    .filter(Boolean)
    .join('');

  footerEl.innerHTML = `
    <div class="container">
      <div class="site-footer__grid">
        <div>
          <div class="site-footer__brand">${escapeHtml(site.name || 'ShopStack')}</div>
          <p class="site-footer__text">${escapeHtml(site.tagline || 'Интернет-магазин на платформе ShopStack')}</p>
        </div>
        <div>
          <div class="site-footer__heading">Покупателям</div>
          <div class="site-footer__links">
            <a href="catalog.html">Каталог</a>
            <a href="search.html">Поиск</a>
            ${pageLinks}
          </div>
        </div>
        <div>
          <div class="site-footer__heading">Контакты</div>
          <div class="site-footer__text">${contacts || 'Контактные данные уточняйте у продавца.'}</div>
        </div>
      </div>
      <div class="site-footer__bottom">
        <span>© ${new Date().getFullYear()} ${escapeHtml(site.name || 'ShopStack')}</span>
      </div>
    </div>`;

  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('mobile-nav');
  menuBtn?.addEventListener('click', () => {
    const open = mobileNav?.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  if (appEl) appEl.classList.remove('app-hidden');
  state.ready = true;

  return { maintenance: false, site };
}

export function showLoading(container) {
  if (!container) return;
  container.innerHTML = '<div class="spinner" role="status"><span class="sr-only">Загрузка…</span></div>';
}

export function showEmpty(container, { title, text, actionHtml = '' }) {
  if (!container) return;
  container.innerHTML = `
    <div class="state">
      <div class="state__icon" aria-hidden="true">📦</div>
      <h2 class="state__title">${escapeHtml(title)}</h2>
      <p class="state__text">${escapeHtml(text)}</p>
      ${actionHtml ? `<div class="state__action">${actionHtml}</div>` : ''}
    </div>`;
}

export function renderProductCard(product) {
  const img = product.productImages?.find((i) => !i.isVideo) || product.productImages?.[0];
  const imgSrc = img?.url ? mediaUrl(img.url) : '';
  const out = isOutOfStock(product);
  const categoryName = product.category?.name || '';
  const price = formatPrice(
    product.discountPrice > 0 ? product.discountPrice : product.price,
  );
  const old = product.oldPrice > (product.discountPrice || product.price)
    ? formatPrice(product.oldPrice)
    : product.discountPrice > 0 && product.price > product.discountPrice
      ? formatPrice(product.price)
      : '';

  return `
    <article class="product-card">
      <a class="product-card__link" href="product.html?slug=${encodeURIComponent(product.slug)}">
        <div class="product-card__image-wrap">
          ${
            imgSrc
              ? `<img class="product-card__image" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(img.alt || product.title)}" loading="lazy">`
              : `<div class="product-card__image skeleton"></div>`
          }
          <div class="product-card__badges">
            ${out ? '<span class="badge badge--out">Нет в наличии</span>' : ''}
            ${product.discountPrice > 0 ? '<span class="badge badge--sale">Акция</span>' : ''}
          </div>
        </div>
        <div class="product-card__body">
          ${categoryName ? `<div class="product-card__category">${escapeHtml(categoryName)}</div>` : ''}
          <h3 class="product-card__title">${escapeHtml(product.title)}</h3>
          <div class="price">${price}${old ? `<span class="price__old">${old}</span>` : ''}</div>
        </div>
      </a>
    </article>`;
}

export function renderProductGrid(products) {
  if (!products?.length) return '';
  return `<div class="product-grid">${products.map(renderProductCard).join('')}</div>`;
}

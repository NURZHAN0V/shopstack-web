import { getStoreStatus, getSite, discoverFooterPages } from './api.js';
import {
  buildCategoryTree,
  loadCategories,
  renderRootList,
  renderSubcategoryPanel,
} from './categories.js';
import {
  escapeHtml,
  formatPrice,
  FOOTER_PAGE_SLUGS,
  isOutOfStock,
  mediaUrl,
  pageUrl,
  productUrl,
  setCurrency,
} from './utils.js';
import { initHeaderSearch } from './search-widget.js';
import { initCartBadge } from './cart-store.js';

const state = {
  site: null,
  storeStatus: null,
  categories: [],
  categoryTree: [],
  ready: false,
};

let megaMenuBound = false;

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

function updateCatalogTriggerIcon(isOpen) {
  const trigger = document.getElementById('catalog-trigger');
  const icon = trigger?.querySelector('.catalog-trigger__icon');
  if (!icon) return;
  icon.textContent = isOpen ? '×' : '☰';
  trigger.setAttribute('aria-label', isOpen ? 'Закрыть каталог' : 'Каталог');
}

function closeMegaMenu() {
  const mega = document.getElementById('catalog-mega');
  const trigger = document.getElementById('catalog-trigger');
  const header = document.getElementById('site-header');
  mega?.classList.remove('is-open');
  trigger?.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
  header?.classList.remove('site-header--catalog-open');
  document.body.classList.remove('catalog-mega-open');
  updateCatalogTriggerIcon(false);
}

function openMegaMenu() {
  const mega = document.getElementById('catalog-mega');
  const trigger = document.getElementById('catalog-trigger');
  const header = document.getElementById('site-header');
  if (!mega || !trigger) return;
  mega.classList.add('is-open');
  trigger.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  header?.classList.add('site-header--catalog-open');
  document.body.classList.add('catalog-mega-open');
  document.dispatchEvent(new CustomEvent('shopstack:catalog-open'));
  updateCatalogTriggerIcon(true);

  const firstRoot = mega.querySelector('[data-root-id]');
  if (firstRoot && !mega.querySelector('.catalog-mega__roots .is-active')) {
    selectMegaRoot(firstRoot.dataset.rootId);
  }
}

function selectMegaRoot(rootId) {
  const mega = document.getElementById('catalog-mega');
  if (!mega) return;

  mega.querySelectorAll('.catalog-mega__roots .catalog-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.rootId === String(rootId));
  });

  const subs = document.getElementById('catalog-mega-subs');
  if (subs) {
    subs.innerHTML = renderSubcategoryPanel(state.categories, rootId);
  }
}

function bindMegaMenu() {
  if (megaMenuBound) return;
  megaMenuBound = true;

  const trigger = document.getElementById('catalog-trigger');
  const mega = document.getElementById('catalog-mega');
  const backdrop = document.getElementById('catalog-mega-backdrop');

  trigger?.addEventListener('click', () => {
    if (mega?.classList.contains('is-open')) {
      closeMegaMenu();
    } else {
      openMegaMenu();
    }
  });

  backdrop?.addEventListener('click', closeMegaMenu);

  mega?.querySelector('.catalog-mega__roots')?.addEventListener('mouseover', (e) => {
    const link = e.target.closest('[data-root-id]');
    if (link) selectMegaRoot(link.dataset.rootId);
  });

  mega?.querySelector('.catalog-mega__roots')?.addEventListener('focusin', (e) => {
    const link = e.target.closest('[data-root-id]');
    if (link) selectMegaRoot(link.dataset.rootId);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMegaMenu();
  });
}

function bindMobileCatalogNav() {
  const toggle = document.getElementById('mobile-catalog-toggle');
  const panel = document.getElementById('mobile-catalog-panel');
  toggle?.addEventListener('click', () => {
    const open = panel?.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
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

  state.categories = await loadCategories();
  state.categoryTree = buildCategoryTree(state.categories);

  const site = state.site;
  const logoSrc = site.logo ? mediaUrl(site.logo) : '';
  const logoHtml = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="" width="40" height="40">`
    : '';

  const rootListHtml = renderRootList(state.categoryTree);
  const firstRootId = state.categoryTree[0]?.id || '';
  const initialSubs = firstRootId
    ? renderSubcategoryPanel(state.categories, firstRootId)
    : '<p class="catalog-subs__empty">Категории пока не добавлены.</p>';

  headerEl.innerHTML = `
    <div class="container site-header__inner">
      <div class="site-header__left">
        <a class="site-header__logo" href="/index.html">
          ${logoHtml}
          <span>${escapeHtml(site.name || 'ShopStack')}</span>
        </a>
        <button type="button" class="catalog-trigger" id="catalog-trigger" aria-expanded="false" aria-controls="catalog-mega" aria-label="Каталог">
          <span class="catalog-trigger__icon" aria-hidden="true">☰</span>
          Каталог
        </button>
      </div>
      <div class="site-header__search-wrap" id="header-search-root"></div>
      <div class="site-header__right">
        <a class="site-header__cart" href="/cart.html" aria-label="Корзина">
          <span class="site-header__cart-icon" aria-hidden="true">🛒</span>
          <span class="site-header__cart-label">Корзина</span>
          <span class="site-header__cart-badge" id="cart-badge" hidden>0</span>
        </a>
        <button type="button" class="site-header__menu-btn" id="mobile-menu-btn" aria-label="Меню" aria-expanded="false">☰</button>
      </div>
    </div>
    <div class="catalog-mega" id="catalog-mega" aria-hidden="true">
      <div class="catalog-mega__backdrop" id="catalog-mega-backdrop"></div>
      <div class="catalog-mega__panel">
        <div class="catalog-mega__inner">
          <nav class="catalog-mega__roots" aria-label="Категории">${rootListHtml}</nav>
          <div class="catalog-mega__subs" id="catalog-mega-subs">${initialSubs}</div>
        </div>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Мобильное меню">
      <div class="mobile-nav__inner">
        <div class="mobile-catalog-nav">
          <button type="button" class="mobile-catalog-nav__toggle" id="mobile-catalog-toggle" aria-expanded="false" aria-controls="mobile-catalog-panel">
            Каталог
            <span aria-hidden="true">▾</span>
          </button>
          <div class="mobile-catalog-nav__panel" id="mobile-catalog-panel">
            ${rootListHtml}
          </div>
        </div>
        <a href="/catalog.html">Все товары</a>
        <a href="/cart.html">Корзина</a>
      </div>
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
            <a href="/catalog.html">Каталог</a>
            <a href="/cart.html">Корзина</a>
            <a href="/search.html">Поиск</a>
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
    if (!open) closeMegaMenu();
  });

  bindMegaMenu();
  bindMobileCatalogNav();
  initHeaderSearch();
  initCartBadge();

  if (appEl) appEl.classList.remove('app-hidden');
  state.ready = true;

  return { maintenance: false, site, categories: state.categories, categoryTree: state.categoryTree };
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

export function renderProductCard(product, options = {}) {
  const { eagerImage = false } = options;
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
      <a class="product-card__link" href="${productUrl(product.slug, product.id)}">
        <div class="product-card__image-wrap">
          ${
            imgSrc
              ? `<img class="product-card__image" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(img.alt || product.title)}" decoding="async" ${eagerImage ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>`
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

export function renderProductGrid(products, options = {}) {
  if (!products?.length) return '';
  return `<div class="product-grid">${products.map((p) => renderProductCard(p, options)).join('')}</div>`;
}

import { getAttributes, getCategories, getProducts } from './api.js';
import {
  initShell,
  renderProductGrid,
  showEmpty,
  showLoading,
} from './shell.js';
import { initCookieBanner } from './cookies.js';
import {
  debounce,
  escapeHtml,
  parseQuery,
  setMeta,
  updateQuery,
} from './utils.js';

let categories = [];
let attributes = [];

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: 'catalog' });
  if (shell.maintenance) return;

  const site = shell.site;
  setMeta(
    `Каталог — ${site.name || 'Магазин'}`,
    site.metaDescription || 'Каталог товаров интернет-магазина',
  );

  [categories, attributes] = await Promise.all([
    getCategories().catch(() => []),
    getAttributes().catch(() => []),
  ]);

  content.innerHTML = `
    <div class="container">
      <h1 class="page-title">Каталог</h1>
      <p class="page-lead">Выберите категорию и уточните параметры поиска.</p>
      <div id="category-nav" class="category-nav"></div>
      <div class="grid-2">
        <aside id="filters-panel" class="filters" aria-label="Фильтры"></aside>
        <div>
          <div class="catalog-toolbar">
            <div id="results-count" class="catalog-toolbar__count"></div>
          </div>
          <div id="products-area"></div>
        </div>
      </div>
    </div>`;

  renderCategoryNav();
  renderFilters();
  await loadProducts();
  bindEvents();
  initCookieBanner();

  window.addEventListener('popstate', () => {
    renderCategoryNav();
    renderFilters();
    loadProducts();
  });
}

function getFiltersFromUrl() {
  const q = parseQuery();
  const attributeValueId = [];
  Object.keys(q).forEach((key) => {
    if (key.startsWith('attr_')) {
      const vals = String(q[key]).split(',').filter(Boolean);
      vals.forEach((v) => attributeValueId.push(v));
    }
  });
  if (q.attributeValueId) {
    String(q.attributeValueId)
      .split(',')
      .forEach((v) => attributeValueId.push(v));
  }
  return {
    categoryId: q.categoryId || '',
    categorySlug: q.category || '',
    q: q.q || '',
    attributeValueId: [...new Set(attributeValueId)],
  };
}

function resolveCategoryId(filters) {
  if (filters.categoryId) return filters.categoryId;
  if (filters.categorySlug) {
    const cat = categories.find((c) => c.slug === filters.categorySlug);
    return cat?.id || '';
  }
  return '';
}

function renderCategoryNav() {
  const el = document.getElementById('category-nav');
  if (!el) return;
  const filters = getFiltersFromUrl();
  const activeId = String(resolveCategoryId(filters));

  const items = categories.filter((c) => c.isActive !== false);
  el.innerHTML = `
    <a href="catalog.html" class="${!activeId ? 'is-active' : ''}">Все</a>
    ${items
      .map(
        (c) => `
      <a href="catalog.html?categoryId=${c.id}" class="${String(c.id) === activeId ? 'is-active' : ''}">
        ${escapeHtml(c.name)}
      </a>`,
      )
      .join('')}`;
}

function renderFilters() {
  const el = document.getElementById('filters-panel');
  if (!el) return;
  const filters = getFiltersFromUrl();
  const selected = new Set(filters.attributeValueId.map(String));

  const groups = attributes
    .filter((a) => a.attributeValues?.length)
    .map((attr) => {
      const options = attr.attributeValues
        .map((val) => {
          const id = String(val.id);
          const checked = selected.has(id) ? 'checked' : '';
          return `
          <label class="filters__option">
            <input type="checkbox" name="attr_${attr.id}" value="${id}" ${checked}>
            <span>${escapeHtml(val.name)}</span>
          </label>`;
        })
        .join('');
      return `
        <div class="filters__group">
          <div class="filters__label">${escapeHtml(attr.name)}</div>
          <div class="filters__options">${options}</div>
        </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="filters__title">Фильтры</div>
    ${groups || '<p style="color:var(--text-muted,#78716c);font-size:0.9375rem">Нет доступных фильтров</p>'}
    <button type="button" class="btn btn--ghost btn--sm filters__clear" id="clear-filters">Сбросить</button>`;
}

async function loadProducts() {
  const area = document.getElementById('products-area');
  const countEl = document.getElementById('results-count');
  if (!area) return;

  area.innerHTML = '<div class="spinner" role="status"><span class="sr-only">Загрузка…</span></div>';

  const filters = getFiltersFromUrl();
  const categoryId = resolveCategoryId(filters);

  const params = { limit: 24, offset: 0 };
  if (categoryId) params.categoryId = categoryId;
  if (filters.q) params.q = filters.q;
  if (filters.attributeValueId.length) params.attributeValueId = filters.attributeValueId;

  try {
    const res = await getProducts(params);
    const items = res.items || [];
    const total = res.total ?? items.length;

    countEl.textContent = total
      ? `Найдено товаров: ${total}`
      : 'Товары не найдены';

    if (!items.length) {
      showEmpty(area, {
        title: 'Товары не найдены',
        text: 'Попробуйте изменить фильтры или выбрать другую категорию.',
        actionHtml: '<a class="btn btn--primary" href="catalog.html">Сбросить фильтры</a>',
      });
      return;
    }

    area.innerHTML = renderProductGrid(items);
  } catch (err) {
    showEmpty(area, {
      title: 'Не удалось загрузить каталог',
      text: err.message || 'Проверьте подключение к API.',
    });
  }
}

function collectFilterParams() {
  const params = {};
  const q = parseQuery();
  if (q.categoryId) params.categoryId = q.categoryId;
  if (q.category) params.category = q.category;
  if (q.q) params.q = q.q;

  document.querySelectorAll('#filters-panel input[type="checkbox"]:checked').forEach((input) => {
    const key = input.name;
    if (!params[key]) params[key] = [];
    if (!Array.isArray(params[key])) params[key] = [params[key]];
    params[key].push(input.value);
  });

  Object.keys(params).forEach((key) => {
    if (key.startsWith('attr_') && Array.isArray(params[key])) {
      params[key] = params[key].join(',');
    }
  });

  return params;
}

function applyFilters(replace = false) {
  const params = collectFilterParams();
  updateQuery(params, replace);
  loadProducts();
}

function bindEvents() {
  const panel = document.getElementById('filters-panel');
  panel?.addEventListener('change', debounce(() => applyFilters(), 200));

  panel?.addEventListener('click', (e) => {
    if (e.target.closest('#clear-filters')) {
      history.pushState(null, '', 'catalog.html');
      renderCategoryNav();
      renderFilters();
      loadProducts();
    }
  });
}

init();

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

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  const site = shell.site;
  const initial = parseQuery();

  [categories, attributes] = await Promise.all([
    getCategories().catch(() => []),
    getAttributes().catch(() => []),
  ]);

  content.innerHTML = `
    <div class="container">
      <div class="search-header">
        <h1 class="page-title">Поиск</h1>
        <p class="page-lead" id="search-lead">Введите запрос для поиска товаров по названию.</p>
      </div>
      <form class="search-form-inline" id="search-form" role="search">
        <label class="sr-only" for="search-input">Поиск</label>
        <input id="search-input" type="search" name="q" placeholder="Название товара…" value="${escapeHtml(initial.q || '')}" autocomplete="off">
        <button type="submit" class="btn btn--primary">Искать</button>
      </form>
      <div id="category-nav" class="category-nav"></div>
      <div class="grid-2">
        <aside id="filters-panel" class="filters" aria-label="Фильтры поиска"></aside>
        <div>
          <div class="catalog-toolbar">
            <div id="results-count" class="catalog-toolbar__count"></div>
          </div>
          <div id="products-area"></div>
        </div>
      </div>
    </div>`;

  setMeta(
    initial.q ? `Поиск: ${initial.q} — ${site.name}` : `Поиск — ${site.name}`,
    `Результаты поиска товаров в ${site.name || 'магазине'}`,
  );

  renderCategoryNav();
  renderFilters();
  await loadProducts();
  bindEvents();
  initCookieBanner();

  window.addEventListener('popstate', () => {
    const q = parseQuery();
    const input = document.getElementById('search-input');
    if (input) input.value = q.q || '';
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
      String(q[key])
        .split(',')
        .forEach((v) => attributeValueId.push(v));
    }
  });
  return {
    categoryId: q.categoryId || '',
    q: q.q || '',
    attributeValueId: [...new Set(attributeValueId)],
  };
}

function renderCategoryNav() {
  const el = document.getElementById('category-nav');
  if (!el) return;
  const filters = getFiltersFromUrl();
  const activeId = String(filters.categoryId || '');

  el.innerHTML = `
    <button type="button" data-category="" class="${!activeId ? 'is-active' : ''}">Все категории</button>
    ${categories
      .filter((c) => c.isActive !== false)
      .map(
        (c) => `
      <button type="button" data-category="${c.id}" class="${String(c.id) === activeId ? 'is-active' : ''}">
        ${escapeHtml(c.name)}
      </button>`,
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
          return `
          <label class="filters__option">
            <input type="checkbox" name="attr_${attr.id}" value="${id}" ${selected.has(id) ? 'checked' : ''}>
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
    <div class="filters__title">Характеристики</div>
    ${groups || '<p style="color:#78716c;font-size:0.9375rem">Нет фильтров</p>'}
    <button type="button" class="btn btn--ghost btn--sm filters__clear" id="clear-filters">Сбросить</button>`;
}

async function loadProducts() {
  const area = document.getElementById('products-area');
  const countEl = document.getElementById('results-count');
  const leadEl = document.getElementById('search-lead');
  if (!area) return;

  const filters = getFiltersFromUrl();
  const query = filters.q.trim();

  if (!query && !filters.categoryId && !filters.attributeValueId.length) {
    countEl.textContent = '';
    showEmpty(area, {
      title: 'Начните поиск',
      text: 'Введите название товара в поле выше или выберите категорию.',
    });
    return;
  }

  if (leadEl && query) {
    leadEl.innerHTML = `Результаты по запросу: <span class="search-header__query">${escapeHtml(query)}</span>`;
  }

  area.innerHTML = '<div class="spinner" role="status"><span class="sr-only">Загрузка…</span></div>';

  const params = { limit: 24 };
  if (query) params.q = query;
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.attributeValueId.length) params.attributeValueId = filters.attributeValueId;

  try {
    const res = await getProducts(params);
    const items = res.items || [];
    const total = res.total ?? items.length;

    setMeta(
      query ? `Поиск: ${query}` : 'Поиск товаров',
      total ? `Найдено ${total} товаров` : 'Ничего не найдено',
    );

    countEl.textContent = total
      ? `Найдено: ${total}`
      : 'Ничего не найдено';

    if (!items.length) {
      showEmpty(area, {
        title: 'Ничего не найдено',
        text: 'Попробуйте другой запрос или измените фильтры.',
        actionHtml: '<a class="btn btn--primary" href="catalog.html">Перейти в каталог</a>',
      });
      return;
    }

    area.innerHTML = renderProductGrid(items);
  } catch (err) {
    showEmpty(area, {
      title: 'Ошибка поиска',
      text: err.message || 'Не удалось выполнить поиск.',
    });
  }
}

function collectParams() {
  const params = {};
  const input = document.getElementById('search-input');
  const q = input?.value?.trim();
  if (q) params.q = q;

  const filters = getFiltersFromUrl();
  if (filters.categoryId) params.categoryId = filters.categoryId;

  document.querySelectorAll('#filters-panel input[type="checkbox"]:checked').forEach((inputEl) => {
    const key = inputEl.name;
    if (!params[key]) params[key] = [];
    if (!Array.isArray(params[key])) params[key] = [params[key]];
    params[key].push(inputEl.value);
  });

  Object.keys(params).forEach((key) => {
    if (key.startsWith('attr_') && Array.isArray(params[key])) {
      params[key] = params[key].join(',');
    }
  });

  return params;
}

function applyFilters(replace = false) {
  updateQuery(collectParams(), replace);
  loadProducts();
}

function bindEvents() {
  document.getElementById('search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters(true);
  });

  document.getElementById('category-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    const catId = btn.dataset.category;
    const params = collectParams();
    if (catId) params.categoryId = catId;
    else delete params.categoryId;
    updateQuery(params, false);
    renderCategoryNav();
    loadProducts();
  });

  document.getElementById('filters-panel')?.addEventListener('change', debounce(() => applyFilters(), 200));

  document.getElementById('filters-panel')?.addEventListener('click', (e) => {
    if (e.target.closest('#clear-filters')) {
      const q = document.getElementById('search-input')?.value?.trim();
      history.pushState(null, '', q ? `search.html?q=${encodeURIComponent(q)}` : 'search.html');
      renderCategoryNav();
      renderFilters();
      loadProducts();
    }
  });
}

init();

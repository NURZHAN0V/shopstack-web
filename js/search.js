import { getAttributes, getProducts } from './api.js';
import {
  buildCategoryTree,
  findCategory,
  getChildCategories,
  getRootCategory,
  loadCategories,
} from './categories.js';
import { sortProducts } from './search-suggest.js';
import { mountSearchWidget } from './search-widget.js';
import {
  initShell,
  renderProductGrid,
  showEmpty,
  showLoading,
} from './shell.js';
import { initCookieBanner } from './cookies.js';
import {
  catalogUrl,
  debounce,
  escapeHtml,
  parseQuery,
  setMeta,
  updateQuery,
} from './utils.js';

let categories = [];
let categoryTree = [];
let attributes = [];
let currentItems = [];
let currentSort = 'popular';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  const site = shell.site;
  const initial = parseQuery();

  categories = shell.categories?.length ? shell.categories : await loadCategories();
  categoryTree = shell.categoryTree?.length ? shell.categoryTree : buildCategoryTree(categories);
  attributes = await getAttributes().catch(() => []);

  content.innerHTML = `
    <div class="search-page">
      <div class="search-page__widget" id="search-page-widget"></div>
      <div class="search-layout">
        <button type="button" class="catalog-panel-toggle" id="search-panel-toggle" aria-expanded="false" aria-controls="search-catalog-panel">
          <span>Каталог</span>
          <span aria-hidden="true">▾</span>
        </button>
        <aside class="catalog-panel" id="search-catalog-panel" aria-label="Каталог">
          <div class="catalog-panel__head">Каталог</div>
          <div class="catalog-panel__section">
            <div class="catalog-panel__label">Категории</div>
            <nav class="catalog-panel__nav search-sidebar__categories" id="search-categories"></nav>
          </div>
          <div class="catalog-panel__section catalog-panel__section--filters" id="filters-panel"></div>
          <button type="button" class="btn btn--ghost btn--sm catalog-panel__reset" id="clear-filters">Сбросить</button>
        </aside>
        <div class="search-main">
          <div class="search-main__toolbar catalog-toolbar">
            <div id="results-count" class="catalog-toolbar__count"></div>
            <label class="search-sort">
              <span class="sr-only">Сортировка</span>
              <select id="search-sort" class="search-sort__select" aria-label="Сортировка">
                <option value="popular">Популярные</option>
                <option value="price-asc">Сначала дешевле</option>
                <option value="price-desc">Сначала дороже</option>
                <option value="name">По названию</option>
              </select>
            </label>
          </div>
          <div id="products-area"></div>
        </div>
      </div>
    </div>`;

  mountSearchWidget(document.getElementById('search-page-widget'), {
    variant: 'page',
    query: initial.q || '',
    categoryId: initial.categoryId || '',
    inputId: 'search-page-input',
  });

  setMeta(
    initial.q ? `Поиск: ${initial.q} — ${site.name}` : `Поиск — ${site.name}`,
    `Результаты поиска товаров в ${site.name || 'магазине'}`,
  );

  renderCategorySidebar();
  renderFilters();
  await loadProducts();
  bindEvents();
  initCookieBanner();

  window.addEventListener('popstate', () => {
    const q = parseQuery();
    renderCategorySidebar();
    renderFilters();
    loadProducts();
    const widgetRoot = document.getElementById('search-page-widget');
    const input = widgetRoot?.querySelector('#search-page-input');
    if (input) input.value = q.q || '';
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

function renderCategorySidebar() {
  const el = document.getElementById('search-categories');
  if (!el) return;

  const filters = getFiltersFromUrl();
  const activeId = filters.categoryId;
  const root = activeId ? getRootCategory(categories, activeId) : null;
  const rootId = root?.id;

  let html = `
    <a href="${catalogUrl()}" class="search-sidebar__all">Все категории</a>`;

  if (rootId) {
    const rootCat = findCategory(categories, rootId);
    html += `
      <div class="search-sidebar__section">
        <a href="${catalogUrl({ categoryId: rootId })}" class="search-sidebar__root ${String(activeId) === String(rootId) ? 'is-active' : ''}">
          ${escapeHtml(rootCat?.name || '')}
        </a>
        <ul class="search-sidebar__children">
          ${getChildCategories(categories, rootId)
            .map(
              (child) => `
            <li>
              <a href="${buildSearchLink({ categoryId: child.id })}" class="${String(activeId) === String(child.id) ? 'is-active' : ''}">
                ${escapeHtml(child.name)}
              </a>
            </li>`,
            )
            .join('')}
        </ul>
      </div>`;
  } else if (categoryTree.length) {
    html += `<ul class="search-sidebar__roots">`;
    html += categoryTree
      .map(
        (root) => `
        <li>
          <a href="${buildSearchLink({ categoryId: root.id })}" class="${String(activeId) === String(root.id) ? 'is-active' : ''}">
            ${escapeHtml(root.name)}
          </a>
        </li>`,
      )
      .join('');
    html += `</ul>`;
  }

  el.innerHTML = html;
}

function buildSearchLink(extra = {}) {
  const filters = getFiltersFromUrl();
  const qs = new URLSearchParams();
  const q = extra.q !== undefined ? extra.q : filters.q;
  const categoryId = extra.categoryId !== undefined ? extra.categoryId : filters.categoryId;
  if (q) qs.set('q', q);
  if (categoryId) qs.set('categoryId', categoryId);

  const urlQ = parseQuery();
  Object.keys(urlQ).forEach((key) => {
    if (key.startsWith('attr_')) qs.set(key, urlQ[key]);
  });

  const query = qs.toString();
  return `/search.html${query ? `?${query}` : ''}`;
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
    <div class="catalog-panel__label">Фильтры</div>
    <div class="filters filters--embedded">
      ${groups || '<p class="filters__empty">Нет доступных фильтров</p>'}
    </div>`;
}

function renderProducts(items) {
  const area = document.getElementById('products-area');
  const sorted = sortProducts(items, currentSort);
  area.innerHTML = renderProductGrid(sorted);
}

async function loadProducts() {
  const area = document.getElementById('products-area');
  const countEl = document.getElementById('results-count');
  if (!area) return;

  const filters = getFiltersFromUrl();
  const query = filters.q.trim();

  if (!query && !filters.categoryId && !filters.attributeValueId.length) {
    countEl.textContent = '';
    showEmpty(area, {
      title: 'Начните поиск',
      text: 'Введите запрос в строке поиска или выберите категорию слева.',
    });
    return;
  }

  area.innerHTML = '<div class="spinner" role="status"><span class="sr-only">Загрузка…</span></div>';

  const params = { limit: 48, offset: 0 };
  if (query) params.q = query;
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.attributeValueId.length) params.attributeValueId = filters.attributeValueId;

  try {
    const res = await getProducts(params);
    const items = res.items || [];
    const total = res.total ?? items.length;
    currentItems = items;

    setMeta(
      query ? `Поиск: ${query}` : 'Поиск товаров',
      total ? `Найдено ${total} товаров` : 'Ничего не найдено',
    );

    countEl.textContent = total
      ? query
        ? `Найдено: ${total} по запросу «${query}»`
        : `Найдено: ${total}`
      : 'Ничего не найдено';

    if (!items.length) {
      showEmpty(area, {
        title: 'Ничего не найдено',
        text: 'Попробуйте другой запрос или измените фильтры.',
        actionHtml: '<a class="btn btn--primary" href="/catalog.html">Перейти в каталог</a>',
      });
      return;
    }

    renderProducts(items);
  } catch (err) {
    showEmpty(area, {
      title: 'Ошибка поиска',
      text: err.message || 'Не удалось выполнить поиск.',
    });
  }
}

function collectParams() {
  const params = {};
  const q = parseQuery();
  if (q.q) params.q = q.q;
  if (q.categoryId) params.categoryId = q.categoryId;

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
  renderCategorySidebar();
  renderFilters();
  loadProducts();
}

function bindEvents() {
  document.getElementById('filters-panel')?.addEventListener('change', debounce(() => applyFilters(), 200));

  document.getElementById('search-catalog-panel')?.addEventListener('click', (e) => {
    if (e.target.closest('#clear-filters')) {
      const q = parseQuery().q || '';
      history.pushState(null, '', q ? `/search.html?q=${encodeURIComponent(q)}` : '/search.html');
      renderCategorySidebar();
      renderFilters();
      loadProducts();
    }
  });

  const panelToggle = document.getElementById('search-panel-toggle');
  const catalogPanel = document.getElementById('search-catalog-panel');
  panelToggle?.addEventListener('click', () => {
    const open = catalogPanel?.classList.toggle('is-open');
    panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.getElementById('search-sort')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    if (currentItems.length) renderProducts(currentItems);
  });
}

init();

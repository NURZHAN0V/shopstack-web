import { getAttributes, getProducts } from './api.js';
import { buildCategoryTree, loadCategories } from './categories.js';
import {
  bindCatalogPanel,
  CATALOG_PANEL_IDS,
  collectFilterParamsFromPanel,
  getBrowseFiltersFromUrl,
  renderCatalogPanelMarkup,
  renderCategorySidebar,
  renderFiltersSection,
  updateCategoryPanelToggleLabel,
} from './catalog-panel.js';
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
  debounce,
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
        ${renderCatalogPanelMarkup()}
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

  refreshPanel();
  await loadProducts();
  bindEvents();
  initCookieBanner();

  window.addEventListener('popstate', () => {
    const q = parseQuery();
    refreshPanel();
    loadProducts();
    const widgetRoot = document.getElementById('search-page-widget');
    const input = widgetRoot?.querySelector('#search-page-input');
    if (input) input.value = q.q || '';
  });
}

function buildSearchLink(extra = {}) {
  const filters = getBrowseFiltersFromUrl();
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

function buildCategoryLink(categoryId) {
  return buildSearchLink({ categoryId: categoryId || '' });
}

function refreshPanel() {
  const filters = getBrowseFiltersFromUrl();

  renderCategorySidebar(document.getElementById(CATALOG_PANEL_IDS.categories), {
    categories,
    categoryTree,
    activeCategoryId: filters.categoryId,
    allHref: buildSearchLink({ categoryId: '' }),
    buildCategoryLink,
  });

  renderFiltersSection(document.getElementById(CATALOG_PANEL_IDS.filters), {
    attributes,
    selectedIds: filters.attributeValueId,
  });

  updateCategoryPanelToggleLabel(categories, filters.categoryId);
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

  const filters = getBrowseFiltersFromUrl();
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

function applyFilters(replace = false) {
  const filters = getBrowseFiltersFromUrl();
  const base = {};
  if (filters.q) base.q = filters.q;
  if (filters.categoryId) base.categoryId = filters.categoryId;

  updateQuery(collectFilterParamsFromPanel(base), replace);
  refreshPanel();
  loadProducts();
}

function bindEvents() {
  bindCatalogPanel({
    onFilterChange: debounce(() => applyFilters(), 200),
    onClear: () => {
      const q = parseQuery().q || '';
      history.pushState(null, '', q ? `/search.html?q=${encodeURIComponent(q)}` : '/search.html');
      refreshPanel();
      loadProducts();
    },
  });

  document.getElementById('search-sort')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    if (currentItems.length) renderProducts(currentItems);
  });
}

init();

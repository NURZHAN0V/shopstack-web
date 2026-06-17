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
  resolveCategoryId,
  updateCategoryPanelToggleLabel,
} from './catalog-panel.js';
import { createProductListLazyLoader } from './product-list-lazy.js';
import {
  initShell,
  showEmpty,
  showLoading,
} from './shell.js';
import { getCachedStoreConfig, pageTitle } from './store-config.js';
import { initCookieBanner } from './cookies.js';
import {
  catalogUrl,
  debounce,
  setMeta,
  updateQuery,
} from './utils.js';

let categories = [];
let categoryTree = [];
let attributes = [];
let productLoader = null;

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: 'catalog' });
  if (shell.maintenance) return;

  const site = shell.site;
  setMeta(
    pageTitle(['Каталог']),
    site.metaDescription || 'Каталог товаров интернет-магазина',
  );

  const cfg = getCachedStoreConfig();
  const layoutClass = cfg.storefront?.catalogLayout === 'list' ? ' catalog-main--list' : '';

  categories = shell.categories?.length ? shell.categories : await loadCategories();
  categoryTree = shell.categoryTree?.length ? shell.categoryTree : buildCategoryTree(categories);
  attributes = await getAttributes().catch(() => []);

  content.innerHTML = `
    <div class="catalog-page">
      ${renderCatalogPanelMarkup()}
      <div class="catalog-main${layoutClass}">
        <div class="catalog-toolbar">
          <div id="results-count" class="catalog-toolbar__count"></div>
        </div>
        <div id="products-area"></div>
      </div>
    </div>`;

  productLoader = createProductListLazyLoader({
    getArea: () => document.getElementById('products-area'),
    getCountEl: () => document.getElementById('results-count'),
    perPage: Math.min(Math.max(Number(cfg.storefront?.productsPerPage) || 24, 6), 100),
    fetchPage: (page) => {
      const filters = getBrowseFiltersFromUrl();
      const categoryId = resolveCategoryId(categories, filters);
      const params = { ...page };
      if (categoryId) params.categoryId = categoryId;
      if (filters.q) params.q = filters.q;
      if (filters.attributeValueId.length) params.attributeValueId = filters.attributeValueId;
      return getProducts(params);
    },
    onEmpty: (area) => {
      showEmpty(area, {
        title: 'Товары не найдены',
        text: 'Попробуйте изменить фильтры или выбрать другую категорию.',
        actionHtml: '<a class="btn btn--primary" href="/catalog.html">Сбросить фильтры</a>',
      });
    },
    onError: (area, err) => {
      showEmpty(area, {
        title: 'Не удалось загрузить каталог',
        text: err.message || 'Проверьте подключение к API.',
      });
    },
  });

  refreshPanel();
  await productLoader.load(true);
  bindEvents();
  initCookieBanner();

  window.addEventListener('popstate', () => {
    refreshPanel();
    productLoader?.load(true);
  });
}

function buildCategoryLink(categoryId) {
  return catalogUrl(categoryId ? { categoryId } : {});
}

function refreshPanel() {
  const filters = getBrowseFiltersFromUrl();
  const activeId = resolveCategoryId(categories, filters);

  renderCategorySidebar(document.getElementById(CATALOG_PANEL_IDS.categories), {
    categories,
    categoryTree,
    activeCategoryId: activeId,
    allHref: '/catalog.html',
    buildCategoryLink,
  });

  renderFiltersSection(document.getElementById(CATALOG_PANEL_IDS.filters), {
    attributes,
    selectedIds: filters.attributeValueId,
  });

  updateCategoryPanelToggleLabel(categories, activeId);
}

function applyFilters(replace = false) {
  const filters = getBrowseFiltersFromUrl();
  const categoryId = resolveCategoryId(categories, filters);
  const base = {};
  if (categoryId) base.categoryId = categoryId;
  if (filters.q) base.q = filters.q;

  updateQuery(collectFilterParamsFromPanel(base), replace);
  refreshPanel();
  productLoader?.load(true);
}

function bindEvents() {
  bindCatalogPanel({
    onFilterChange: debounce(() => applyFilters(), 200),
    onClear: () => {
      history.pushState(null, '', '/catalog.html');
      refreshPanel();
      productLoader?.load(true);
    },
  });
}

init();

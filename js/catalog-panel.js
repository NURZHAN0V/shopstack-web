import {
  buildCategoryTree,
  findCategory,
  getChildCategories,
  getRootCategory,
} from './categories.js';
import { escapeHtml, parseQuery } from './utils.js';

export const CATALOG_PANEL_IDS = {
  panel: 'catalog-panel',
  toggle: 'catalog-panel-toggle',
  toggleLabel: 'catalog-panel-toggle-label',
  categories: 'catalog-panel-categories',
  filters: 'catalog-panel-filters',
  clear: 'catalog-panel-clear',
};

/** Разметка боковой панели «Каталог + фильтры» (одинакова на всех страницах). */
export function renderCatalogPanelMarkup() {
  const { panel, toggle, toggleLabel, categories, filters, clear } = CATALOG_PANEL_IDS;
  return `
    <button type="button" class="catalog-panel-toggle" id="${toggle}" aria-expanded="false" aria-controls="${panel}">
      <span id="${toggleLabel}">Каталог</span>
      <span aria-hidden="true">▾</span>
    </button>
    <aside class="catalog-panel" id="${panel}" aria-label="Каталог и фильтры">
      <div class="catalog-panel__head">Каталог</div>
      <div class="catalog-panel__section">
        <div class="catalog-panel__label">Категории</div>
        <nav class="catalog-panel__nav catalog-panel-nav" id="${categories}" aria-label="Категории"></nav>
      </div>
      <div class="catalog-panel__section catalog-panel__section--filters" id="${filters}"></div>
      <button type="button" class="btn btn--ghost btn--sm catalog-panel__reset" id="${clear}">Сбросить</button>
    </aside>`;
}

/** Парсит attributeValueId из query (attr_* и legacy attributeValueId). */
export function parseAttributeFiltersFromQuery(q = parseQuery()) {
  const attributeValueId = [];
  Object.keys(q).forEach((key) => {
    if (key.startsWith('attr_')) {
      String(q[key])
        .split(',')
        .filter(Boolean)
        .forEach((v) => attributeValueId.push(v));
    }
  });
  if (q.attributeValueId) {
    String(q.attributeValueId)
      .split(',')
      .filter(Boolean)
      .forEach((v) => attributeValueId.push(v));
  }
  return [...new Set(attributeValueId)];
}

export function getBrowseFiltersFromUrl() {
  const q = parseQuery();
  return {
    categoryId: q.categoryId || '',
    categorySlug: q.category || '',
    q: q.q || '',
    attributeValueId: parseAttributeFiltersFromQuery(q),
  };
}

export function resolveCategoryId(categories, filters) {
  if (filters.categoryId) return filters.categoryId;
  if (filters.categorySlug) {
    const cat = categories.find((c) => c.slug === filters.categorySlug);
    return cat?.id || '';
  }
  return '';
}

/**
 * Единый список категорий в боковой панели.
 * @param {HTMLElement | null} navEl
 * @param {{ categories: unknown[], categoryTree?: unknown[], activeCategoryId?: string, allHref: string, buildCategoryLink: (categoryId: string) => string }} options
 */
export function renderCategorySidebar(navEl, options) {
  if (!navEl) return;

  const {
    categories,
    categoryTree = buildCategoryTree(categories),
    activeCategoryId = '',
    allHref,
    buildCategoryLink,
  } = options;

  const activeId = activeCategoryId;
  const root = activeId ? getRootCategory(categories, activeId) : null;
  const rootId = root?.id;
  const allActive = !activeId;

  let html = `
    <a href="${escapeHtml(allHref)}" class="catalog-panel-nav__all ${allActive ? 'is-active' : ''}">Все товары</a>`;

  if (rootId) {
    const rootCat = findCategory(categories, rootId);
    const children = getChildCategories(categories, rootId);
    html += `
      <div class="catalog-panel-nav__section">
        <a href="${buildCategoryLink(rootId)}" class="catalog-panel-nav__root ${String(activeId) === String(rootId) ? 'is-active' : ''}">
          ${escapeHtml(rootCat?.name || '')}
        </a>
        ${
          children.length
            ? `<ul class="catalog-panel-nav__children">
          ${children
            .map(
              (child) => `
            <li>
              <a href="${buildCategoryLink(child.id)}" class="${String(activeId) === String(child.id) ? 'is-active' : ''}">
                ${escapeHtml(child.name)}
              </a>
            </li>`,
            )
            .join('')}
        </ul>`
            : ''
        }
      </div>`;
  } else if (categoryTree.length) {
    html += `<ul class="catalog-panel-nav__roots">
      ${categoryTree
        .map(
          (cat) => `
        <li>
          <a href="${buildCategoryLink(cat.id)}" class="${String(activeId) === String(cat.id) ? 'is-active' : ''}">
            ${escapeHtml(cat.name)}
          </a>
        </li>`,
        )
        .join('')}
    </ul>`;
  }

  navEl.innerHTML = html;
}

export function getCategoryPanelLabel(categories, activeCategoryId) {
  if (!activeCategoryId) return 'Каталог';
  const cat = findCategory(categories, activeCategoryId);
  return cat?.name || 'Каталог';
}

export function updateCategoryPanelToggleLabel(categories, activeCategoryId) {
  const label = document.getElementById(CATALOG_PANEL_IDS.toggleLabel);
  if (label) {
    label.textContent = getCategoryPanelLabel(categories, activeCategoryId);
  }
}

/** Рендер блока фильтров по атрибутам. */
export function renderFiltersSection(el, { attributes = [], selectedIds = [] } = {}) {
  if (!el) return;

  const selected = new Set(selectedIds.map(String));
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

/**
 * Собирает query-параметры из URL и отмеченных чекбоксов панели.
 * @param {Record<string, string | string[]>} baseParams — categoryId, q и т.д.
 */
export function collectFilterParamsFromPanel(baseParams = {}) {
  const params = { ...baseParams };
  const panel = document.getElementById(CATALOG_PANEL_IDS.panel);

  panel
    ?.querySelectorAll(`#${CATALOG_PANEL_IDS.filters} input[type="checkbox"]:checked`)
    .forEach((input) => {
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

/**
 * Привязка событий панели: фильтры, сброс, мобильный toggle.
 * @param {{ onFilterChange?: () => void, onClear?: () => void }} handlers
 */
export function bindCatalogPanel(handlers = {}) {
  const { onFilterChange, onClear } = handlers;
  const panel = document.getElementById(CATALOG_PANEL_IDS.panel);
  const toggle = document.getElementById(CATALOG_PANEL_IDS.toggle);
  const filtersEl = document.getElementById(CATALOG_PANEL_IDS.filters);

  filtersEl?.addEventListener('change', () => onFilterChange?.());

  panel?.addEventListener('click', (e) => {
    if (e.target.closest(`#${CATALOG_PANEL_IDS.clear}`)) {
      onClear?.();
    }
  });

  toggle?.addEventListener('click', () => {
    const open = panel?.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

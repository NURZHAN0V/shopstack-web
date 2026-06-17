import { getAttributes, getProducts } from './api.js';
import { buildCategoryTree, findCategory, loadCategories } from './categories.js';
import {
  buildQuickChips,
  buildTextSuggestions,
  findMatchingCategories,
  formatSuggestionLabel,
} from './search-suggest.js';
import {
  catalogUrl,
  debounce,
  escapeHtml,
  getProductImage,
  productUrl,
  searchUrl,
} from './utils.js';

let attributesCache = null;

async function loadAttributes() {
  if (!attributesCache) {
    attributesCache = (await getAttributes().catch(() => [])) || [];
  }
  return attributesCache;
}

/**
 * Ozon-style поисковый виджет.
 * @param {HTMLElement} root
 * @param {{ variant?: 'header'|'page', query?: string, categoryId?: string, inputId?: string }} options
 */
export function mountSearchWidget(root, options = {}) {
  const {
    variant = 'header',
    query: initialQuery = '',
    categoryId: initialCategoryId = '',
    inputId = variant === 'header' ? 'header-search' : 'search-input',
  } = options;

  const state = {
    query: initialQuery,
    categoryId: initialCategoryId,
    scopeOpen: false,
    dropdownOpen: false,
    activeIndex: -1,
    categories: [],
    categoryTree: [],
    attributes: [],
    suggestions: [],
  };

  root.innerHTML = `
    <form class="search-widget search-widget--${variant}" role="search" autocomplete="off">
      <div class="search-widget__bar">
        <div class="search-widget__scope">
          <button type="button" class="search-widget__scope-btn" id="${inputId}-scope" aria-expanded="false" aria-haspopup="listbox">
            <span class="search-widget__scope-label">Везде</span>
            <span class="search-widget__scope-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="search-widget__scope-menu" id="${inputId}-scope-menu" role="listbox" hidden></div>
        </div>
        <div class="search-widget__field">
          <label class="sr-only" for="${inputId}">Поиск товаров</label>
          <input
            id="${inputId}"
            class="search-widget__input"
            type="search"
            name="q"
            placeholder="Искать в магазине"
            value="${escapeHtml(initialQuery)}"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            aria-autocomplete="list"
            aria-controls="${inputId}-dropdown"
            aria-expanded="false"
          >
          <button type="button" class="search-widget__clear" id="${inputId}-clear" aria-label="Очистить" hidden>×</button>
        </div>
        <button type="submit" class="search-widget__submit" aria-label="Найти">
          <span class="search-widget__submit-icon" aria-hidden="true">⌕</span>
        </button>
      </div>
      <div class="search-widget__chips" id="${inputId}-chips" hidden></div>
      <div class="search-widget__dropdown" id="${inputId}-dropdown" role="listbox" hidden></div>
    </form>`;

  const form = root.querySelector('form');
  const input = root.querySelector(`#${CSS.escape(inputId)}`);
  const clearBtn = root.querySelector(`#${inputId}-clear`);
  const dropdown = root.querySelector(`#${inputId}-dropdown`);
  const chipsEl = root.querySelector(`#${inputId}-chips`);
  const scopeBtn = root.querySelector(`#${inputId}-scope`);
  const scopeMenu = root.querySelector(`#${inputId}-scope-menu`);
  const scopeLabel = scopeBtn?.querySelector('.search-widget__scope-label');

  const fetchSuggestions = debounce(async () => {
    const q = input.value.trim();
    state.query = q;
    updateClearButton();

    if (!q) {
      renderEmptyDropdown();
      renderChips();
      return;
    }

    const [productsRes] = await Promise.all([
      getProducts({ q, limit: 5, categoryId: state.categoryId || undefined }).catch(() => ({ items: [] })),
    ]);

    const products = productsRes.items || [];
    const textSuggestions = buildTextSuggestions(q, state.categories, state.attributes);
    const categoryMatches = findMatchingCategories(q, state.categories, 4);

    state.suggestions = [
      ...textSuggestions.map((text) => ({ type: 'text', text })),
      ...categoryMatches.map((cat) => ({ type: 'category', category: cat })),
      ...products.map((p) => ({ type: 'product', product: p })),
    ];

    renderSuggestionsDropdown();
    renderChips();
  }, 220);

  function updateClearButton() {
    const hasValue = Boolean(input.value.trim());
    clearBtn.hidden = !hasValue;
  }

  function setScopeLabel() {
    if (!scopeLabel) return;
    if (!state.categoryId) {
      scopeLabel.textContent = 'Везде';
      return;
    }
    const cat = findCategory(state.categories, state.categoryId);
    scopeLabel.textContent = cat?.name || 'Везде';
  }

  function renderScopeMenu() {
    const items = [
      `<button type="button" class="search-widget__scope-item ${!state.categoryId ? 'is-active' : ''}" data-category-id="">Везде</button>`,
      ...state.categoryTree.map(
        (root) => `
        <button type="button" class="search-widget__scope-item ${String(root.id) === String(state.categoryId) ? 'is-active' : ''}" data-category-id="${root.id}">
          ${escapeHtml(root.name)}
        </button>`,
      ),
    ];
    scopeMenu.innerHTML = items.join('');
  }

  function renderEmptyDropdown() {
    const roots = state.categoryTree;
    if (!roots.length) {
      dropdown.innerHTML = '<p class="search-widget__empty">Категории пока не добавлены</p>';
      return;
    }

    dropdown.innerHTML = `
      <div class="search-widget__browse">
        <div class="search-widget__browse-head">
          <span class="search-widget__browse-title">Искать везде</span>
          <button type="button" class="search-widget__browse-close" aria-label="Закрыть">×</button>
        </div>
        <div class="search-widget__browse-grid">
          ${roots
            .map(
              (root) => `
            <a href="${catalogUrl({ categoryId: root.id })}" class="search-widget__browse-item">
              <span class="search-widget__browse-icon" aria-hidden="true">▦</span>
              <span>${escapeHtml(root.name)}</span>
            </a>`,
            )
            .join('')}
        </div>
      </div>`;
  }

  function renderSuggestionsDropdown() {
    if (!state.suggestions.length) {
      dropdown.innerHTML = '<p class="search-widget__empty">Ничего не найдено</p>';
      return;
    }

    const q = input.value.trim();
    dropdown.innerHTML = state.suggestions
      .map((item, index) => {
        if (item.type === 'text') {
          return `
            <button type="button" class="search-widget__suggest search-widget__suggest--text" role="option" data-index="${index}" data-action="text" data-value="${escapeHtml(item.text)}">
              <span class="search-widget__suggest-icon" aria-hidden="true">⌕</span>
              <span class="search-widget__suggest-label">${formatSuggestionLabel(q, item.text)}</span>
            </button>`;
        }
        if (item.type === 'category') {
          const cat = item.category;
          const parent = cat.parentId ? findCategory(state.categories, cat.parentId) : null;
          return `
            <a href="${catalogUrl({ categoryId: cat.id })}" class="search-widget__suggest search-widget__suggest--category" role="option" data-index="${index}">
              <span class="search-widget__suggest-thumb search-widget__suggest-thumb--placeholder" aria-hidden="true">▦</span>
              <span class="search-widget__suggest-body">
                <span class="search-widget__suggest-label">${formatSuggestionLabel(q, cat.name)}</span>
                ${parent ? `<span class="search-widget__suggest-meta">${escapeHtml(parent.name)}</span>` : ''}
              </span>
            </a>`;
        }
        const p = item.product;
        const img = getProductImage(p);
        const catName = p.category?.name || '';
        return `
          <a href="${productUrl(p.slug, p.id)}" class="search-widget__suggest search-widget__suggest--product" role="option" data-index="${index}">
            ${
              img
                ? `<img class="search-widget__suggest-thumb" src="${escapeHtml(img)}" alt="" width="40" height="40" loading="lazy">`
                : '<span class="search-widget__suggest-thumb search-widget__suggest-thumb--placeholder" aria-hidden="true">▦</span>'
            }
            <span class="search-widget__suggest-body">
              <span class="search-widget__suggest-label">${escapeHtml(p.title)}</span>
              ${catName ? `<span class="search-widget__suggest-meta">${escapeHtml(catName)}</span>` : ''}
            </span>
          </a>`;
      })
      .join('');
  }

  function renderChips() {
    const q = input.value.trim();
    const chips = buildQuickChips(q, state.attributes);
    if (!chips.length || !q) {
      chipsEl.hidden = true;
      chipsEl.innerHTML = '';
      return;
    }

    chipsEl.hidden = false;
    chipsEl.innerHTML = chips
      .map(
        (chip) => `
      <button type="button" class="search-widget__chip" data-chip="${escapeHtml(chip.label)}">
        ${escapeHtml(chip.label)}
      </button>`,
      )
      .join('');
  }

  function openDropdown() {
    state.dropdownOpen = true;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (!input.value.trim()) renderEmptyDropdown();
  }

  function closeDropdown() {
    state.dropdownOpen = false;
    state.activeIndex = -1;
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function closeScope() {
    state.scopeOpen = false;
    scopeMenu.hidden = true;
    scopeBtn?.setAttribute('aria-expanded', 'false');
  }

  function openScope() {
    state.scopeOpen = true;
    scopeMenu.hidden = false;
    scopeBtn?.setAttribute('aria-expanded', 'true');
    closeDropdown();
  }

  function navigateToSearch(extra = {}) {
    const q = input.value.trim();
    const params = { ...extra };
    if (q) params.q = q;
    if (state.categoryId) params.categoryId = state.categoryId;
    window.location.href = searchUrl(q, params);
  }

  scopeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.scopeOpen) closeScope();
    else openScope();
  });

  scopeMenu?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category-id]');
    if (!btn) return;
    state.categoryId = btn.dataset.categoryId || '';
    setScopeLabel();
    renderScopeMenu();
    closeScope();
    fetchSuggestions();
  });

  input.addEventListener('focus', () => {
    openDropdown();
    if (input.value.trim()) fetchSuggestions();
    else renderEmptyDropdown();
  });

  input.addEventListener('input', () => {
    openDropdown();
    fetchSuggestions();
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    updateClearButton();
    openDropdown();
    renderEmptyDropdown();
    renderChips();
    input.focus();
  });

  chipsEl?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const label = chip.dataset.chip;
    const base = input.value.trim();
    input.value = base ? `${base} ${label}` : label;
    updateClearButton();
    fetchSuggestions();
    input.focus();
  });

  dropdown?.addEventListener('click', (e) => {
    if (e.target.closest('.search-widget__browse-close')) {
      closeDropdown();
      return;
    }
    const textBtn = e.target.closest('[data-action="text"]');
    if (textBtn) {
      e.preventDefault();
      input.value = textBtn.dataset.value || '';
      updateClearButton();
      navigateToSearch();
    }
  });

  dropdown?.addEventListener('mousedown', (e) => {
    if (e.target.closest('a')) return;
    e.preventDefault();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    closeDropdown();
    closeScope();
    navigateToSearch();
  });

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) {
      closeDropdown();
      closeScope();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      closeScope();
      input.blur();
      return;
    }

    const options = dropdown.querySelectorAll('[role="option"], .search-widget__browse-item');
    if (!options.length || dropdown.hidden) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.activeIndex = Math.min(state.activeIndex + 1, options.length - 1);
      options[state.activeIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.activeIndex = Math.max(state.activeIndex - 1, 0);
      options[state.activeIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && state.activeIndex >= 0) {
      e.preventDefault();
      options[state.activeIndex]?.click();
    }
  });

  (async () => {
    state.categories = await loadCategories();
    state.categoryTree = buildCategoryTree(state.categories);
    state.attributes = await loadAttributes();
    renderScopeMenu();
    setScopeLabel();
    updateClearButton();
    if (initialQuery) renderChips();
  })();

  return {
    getQuery: () => input.value.trim(),
    getCategoryId: () => state.categoryId,
    setQuery: (q) => {
      input.value = q;
      updateClearButton();
    },
    focus: () => input.focus(),
  };
}

/** Инициализация поиска в шапке после initShell. */
export function initHeaderSearch() {
  const root = document.getElementById('header-search-root');
  if (!root) return null;
  const params = new URLSearchParams(window.location.search);
  return mountSearchWidget(root, {
    variant: 'header',
    query: params.get('q') || '',
    categoryId: params.get('categoryId') || '',
  });
}

import { getAttributes, getProducts } from './api.js';
import { buildCategoryTree, findCategory, loadCategories } from './categories.js';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistoryItem,
} from './search-history.js';
import {
  buildQuickChips,
  buildSearchSuggestionGroups,
  formatSuggestionLabel,
} from './search-suggest.js';
import {
  catalogUrl,
  debounce,
  escapeHtml,
  formatPrice,
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

function calcDiscountPercent(price, oldPrice) {
  const current = Number(price);
  const old = Number(oldPrice);
  if (!Number.isFinite(current) || !Number.isFinite(old) || old <= current) return 0;
  return Math.round(((old - current) / old) * 100);
}

function renderRecCard(product) {
  const img = getProductImage(product);
  const current = product.discountPrice > 0 ? product.discountPrice : product.price;
  const old = product.oldPrice > current ? product.oldPrice : product.price > current ? product.price : 0;
  const discount = calcDiscountPercent(current, old);
  const stock = product.stockQuantity ?? product.quantity;

  return `
    <a class="search-widget__rec-card" href="${productUrl(product.slug, product.id)}">
      ${
        img
          ? `<img class="search-widget__rec-img" src="${escapeHtml(img)}" alt="" width="72" height="90" loading="lazy">`
          : '<div class="search-widget__rec-img search-widget__rec-img--placeholder" aria-hidden="true">▦</div>'
      }
      <div class="search-widget__rec-price">${formatPrice(current)}</div>
      ${
        old > current
          ? `<div class="search-widget__rec-meta">
          <span class="search-widget__rec-old">${formatPrice(old)}</span>
          ${discount > 0 ? `<span class="search-widget__rec-discount">-${discount}%</span>` : ''}
        </div>`
          : ''
      }
      ${Number.isFinite(stock) && stock > 0 && stock <= 100 ? `<div class="search-widget__rec-stock">${stock} шт осталось</div>` : ''}
      <div class="search-widget__rec-title">${escapeHtml(product.title)}</div>
    </a>`;
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
    suggestionGroups: { texts: [], categories: [], products: [] },
    recommendations: [],
  };

  root.innerHTML = `
    <form class="search-widget search-widget--${variant}" role="search" autocomplete="off">
      <button type="button" class="search-widget__backdrop" id="${inputId}-backdrop" tabindex="-1" aria-hidden="true" hidden></button>
      <div class="search-widget__surface">
        <div class="search-widget__bar">
          <div class="search-widget__scope">
            <button type="button" class="search-widget__scope-btn" id="${inputId}-scope" aria-expanded="false" aria-haspopup="listbox">
              <span class="search-widget__scope-label">Везде</span>
              <span class="search-widget__scope-chevron" aria-hidden="true">▼</span>
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
      </div>
    </form>`;

  const form = root.querySelector('form');
  const backdrop = root.querySelector(`#${inputId}-backdrop`);
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
      renderHomePanel();
      renderChips();
      return;
    }

    const [productsRes] = await Promise.all([
      getProducts({ q, limit: 5, categoryId: state.categoryId || undefined }).catch(() => ({ items: [] })),
    ]);

    const products = productsRes.items || [];
    state.suggestionGroups = buildSearchSuggestionGroups(
      q,
      state.categories,
      state.attributes,
      products,
    );

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

  function renderHistoryList() {
    const history = getSearchHistory();
    if (!history.length) {
      return '<p class="search-widget__history-empty">Здесь появятся ваши недавние запросы</p>';
    }

    return `<ul class="search-widget__history-list">
      ${history
        .map(
          (item) => `
        <li>
          <button type="button" class="search-widget__history-item" data-history-query="${encodeURIComponent(item)}">
            <span class="search-widget__history-icon" aria-hidden="true">↺</span>
            <span class="search-widget__history-text">${escapeHtml(item)}</span>
            <span class="search-widget__history-remove" data-history-remove="${encodeURIComponent(item)}" role="button" tabindex="-1" aria-label="Удалить">×</span>
          </button>
        </li>`,
        )
        .join('')}
    </ul>`;
  }

  function renderRecommendations() {
    if (!state.recommendations.length) {
      return '<p class="search-widget__history-empty">Рекомендации появятся, когда в каталоге будут товары</p>';
    }

    return `<div class="search-widget__recs-grid">
      ${state.recommendations.map((p) => renderRecCard(p)).join('')}
    </div>`;
  }

  function renderHomePanel() {
    const history = getSearchHistory();
    dropdown.innerHTML = `
      <div class="search-widget__panel">
        <section class="search-widget__history" aria-label="История поиска">
          <div class="search-widget__section-head">
            <h3 class="search-widget__section-title">История</h3>
            <button type="button" class="search-widget__history-clear" id="${inputId}-history-clear" ${history.length ? '' : 'disabled'}>Очистить</button>
          </div>
          <div class="search-widget__history-scroll">
            ${renderHistoryList()}
          </div>
        </section>
        <section class="search-widget__recs" aria-label="Рекомендации">
          <h3 class="search-widget__section-title">Рекомендуем для вас</h3>
          <div class="search-widget__recs-scroll">
            ${renderRecommendations()}
          </div>
        </section>
      </div>`;
  }

  function renderSuggestionsDropdown() {
    const { texts, categories, products } = state.suggestionGroups;
    const hasResults = texts.length || categories.length || products.length;

    if (!hasResults) {
      dropdown.innerHTML = '<p class="search-widget__empty">Ничего не найдено</p>';
      return;
    }

    const q = input.value.trim();
    let index = 0;

    const nextIndex = () => {
      const current = index;
      index += 1;
      return current;
    };

    const textHtml = texts
      .map((item) => {
        const i = nextIndex();
        return `
          <button type="button" class="search-widget__suggest search-widget__suggest--text" role="option" data-index="${i}" data-action="text" data-value="${escapeHtml(item.text)}">
            <span class="search-widget__suggest-icon" aria-hidden="true">⌕</span>
            <span class="search-widget__suggest-label">${formatSuggestionLabel(q, item.text)}</span>
          </button>`;
      })
      .join('');

    const categoryHtml = categories
      .map((cat) => {
        const i = nextIndex();
        const parent = cat.parentId ? findCategory(state.categories, cat.parentId) : null;
        return `
          <a href="${catalogUrl({ categoryId: cat.id })}" class="search-widget__suggest search-widget__suggest--category" role="option" data-index="${i}">
            <span class="search-widget__suggest-icon" aria-hidden="true">▦</span>
            <span class="search-widget__suggest-body">
              <span class="search-widget__suggest-label">${formatSuggestionLabel(q, cat.name)}</span>
              ${parent ? `<span class="search-widget__suggest-meta">${escapeHtml(parent.name)}</span>` : ''}
            </span>
          </a>`;
      })
      .join('');

    const productHtml = products
      .map((p) => {
        const i = nextIndex();
        const img = getProductImage(p);
        const catName = p.category?.name || '';
        return `
          <a href="${productUrl(p.slug, p.id)}" class="search-widget__suggest search-widget__suggest--product" role="option" data-index="${i}">
            ${
              img
                ? `<img class="search-widget__suggest-thumb" src="${escapeHtml(img)}" alt="" width="44" height="44" loading="lazy">`
                : '<span class="search-widget__suggest-thumb search-widget__suggest-thumb--placeholder" aria-hidden="true">▦</span>'
            }
            <span class="search-widget__suggest-body">
              <span class="search-widget__suggest-label">${escapeHtml(p.title)}</span>
              ${catName ? `<span class="search-widget__suggest-meta">${escapeHtml(catName)}</span>` : ''}
            </span>
          </a>`;
      })
      .join('');

    dropdown.innerHTML = `
      <div class="search-widget__suggestions">
        ${
          texts.length
            ? `<section class="search-widget__suggest-group" aria-label="Запросы">
            ${texts.length > 1 || categories.length || products.length ? '<div class="search-widget__suggest-group-label">Запросы</div>' : ''}
            ${textHtml}
          </section>`
            : ''
        }
        ${
          categories.length
            ? `<section class="search-widget__suggest-group" aria-label="Категории">
            <div class="search-widget__suggest-group-label">Категории</div>
            ${categoryHtml}
          </section>`
            : ''
        }
        ${
          products.length
            ? `<section class="search-widget__suggest-group" aria-label="Товары">
            <div class="search-widget__suggest-group-label">Товары</div>
            ${productHtml}
          </section>`
            : ''
        }
      </div>`;
  }

  function renderChips() {
    if (variant !== 'page') {
      chipsEl.hidden = true;
      chipsEl.innerHTML = '';
      return;
    }

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

  function setActive(open) {
    form?.classList.toggle('is-active', open);
    if (variant === 'header') {
      backdrop.hidden = !open;
      document.body.classList.toggle('search-widget-open', open);
    }
  }

  function openDropdown() {
    state.dropdownOpen = true;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(true);
    if (!input.value.trim()) renderHomePanel();
  }

  function closeDropdown() {
    state.dropdownOpen = false;
    state.activeIndex = -1;
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(false);
  }

  function closeScope() {
    state.scopeOpen = false;
    scopeMenu.hidden = true;
    scopeBtn?.setAttribute('aria-expanded', 'false');
    form?.classList.remove('is-scope-open');
    if (!state.dropdownOpen) setActive(false);
  }

  function openScope() {
    state.scopeOpen = true;
    scopeMenu.hidden = false;
    scopeBtn?.setAttribute('aria-expanded', 'true');
    form?.classList.add('is-scope-open');
    closeDropdown();
    setActive(true);
  }

  function navigateToSearch(extra = {}) {
    const q = input.value.trim();
    if (q) addSearchHistory(q);
    const params = { ...extra };
    if (q) params.q = q;
    if (state.categoryId) params.categoryId = state.categoryId;
    window.location.href = searchUrl(q, params);
  }

  async function loadRecommendations() {
    const res = await getProducts({ limit: 8, offset: 0 }).catch(() => ({ items: [] }));
    state.recommendations = res.items || [];
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
    input.focus();
  });

  input.addEventListener('focus', () => {
    openDropdown();
    if (input.value.trim()) fetchSuggestions();
    else renderHomePanel();
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
    renderHomePanel();
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
    const removeBtn = e.target.closest('[data-history-remove]');
    if (removeBtn) {
      e.stopPropagation();
      removeSearchHistoryItem(decodeURIComponent(removeBtn.dataset.historyRemove || ''));
      renderHomePanel();
      return;
    }

    const historyBtn = e.target.closest('[data-history-query]');
    if (historyBtn) {
      e.preventDefault();
      input.value = decodeURIComponent(historyBtn.dataset.historyQuery || '');
      updateClearButton();
      navigateToSearch();
      return;
    }

    const clearHistoryBtn = e.target.closest(`#${inputId}-history-clear`);
    if (clearHistoryBtn) {
      clearSearchHistory();
      renderHomePanel();
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
    if (e.target.closest('.search-widget__recs-scroll, .search-widget__history-scroll, .search-widget__suggestions')) {
      return;
    }
    e.preventDefault();
  });

  backdrop?.addEventListener('click', () => {
    closeDropdown();
    closeScope();
    input.blur();
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

    const options = dropdown.querySelectorAll('[role="option"], .search-widget__history-item');
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

  document.addEventListener('shopstack:catalog-open', () => {
    closeDropdown();
    closeScope();
  });

  (async () => {
    state.categories = await loadCategories();
    state.categoryTree = buildCategoryTree(state.categories);
    state.attributes = await loadAttributes();
    await loadRecommendations();
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

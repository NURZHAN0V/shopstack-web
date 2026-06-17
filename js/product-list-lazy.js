import { renderProductCard, renderProductGrid } from './shell.js';

function spinnerHtml() {
  return '<div class="spinner" role="status"><span class="sr-only">Загрузка…</span></div>';
}

/**
 * Ленивая подгрузка товаров в каталоге/поиске: первая страница + догрузка при скролле.
 */
export function createProductListLazyLoader({
  getArea,
  getCountEl,
  fetchPage,
  onEmpty,
  onError,
  perPage = 24,
}) {
  let items = [];
  let total = 0;
  let loading = false;
  let loadingMore = false;
  let observer = null;

  function disconnect() {
    observer?.disconnect();
    observer = null;
  }

  function updateCount() {
    const el = getCountEl();
    if (!el) return;
    if (!total) {
      el.textContent = 'Товары не найдены';
      return;
    }
    if (items.length >= total) {
      el.textContent = `Найдено товаров: ${total}`;
      return;
    }
    el.textContent = `Показано ${items.length} из ${total}`;
  }

  function renderLazyStatus(area) {
    let status = area.querySelector('.catalog-lazy-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'catalog-lazy-status';
      area.appendChild(status);
    }

    if (loadingMore) {
      status.innerHTML = '<p class="catalog-lazy-status__text">Загрузка…</p>';
      return;
    }

    if (items.length >= total) {
      status.innerHTML =
        items.length > 0
          ? '<p class="catalog-lazy-status__text">Все товары загружены</p>'
          : '';
      return;
    }

    status.innerHTML = '<div class="catalog-lazy-sentinel" data-lazy-sentinel></div>';
    connectObserver(area);
  }

  function connectObserver(area) {
    disconnect();
    const sentinel = area.querySelector('[data-lazy-sentinel]');
    if (!sentinel || items.length >= total) return;

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load(false);
        }
      },
      { rootMargin: '160px', threshold: 0 },
    );
    observer.observe(sentinel);
  }

  async function load(reset = true) {
    if (loading || loadingMore) return;
    const area = getArea();
    if (!area) return;

    if (reset) {
      loading = true;
      disconnect();
      items = [];
      total = 0;
      area.innerHTML = spinnerHtml();
    } else {
      if (items.length >= total) return;
      loadingMore = true;
      renderLazyStatus(area);
    }

    try {
      const res = await fetchPage({ limit: perPage, offset: items.length });
      const pageItems = res.items || [];
      total = res.total ?? pageItems.length;

      if (reset) {
        items = pageItems;
        if (!items.length) {
          disconnect();
          onEmpty?.(area);
          updateCount();
          return;
        }
        area.innerHTML = renderProductGrid(items);
        updateCount();
        renderLazyStatus(area);
        return;
      }

      items = items.concat(pageItems);
      const grid = area.querySelector('.product-grid');
      if (grid && pageItems.length) {
        grid.insertAdjacentHTML('beforeend', pageItems.map((p) => renderProductCard(p)).join(''));
      }
      updateCount();
      renderLazyStatus(area);
    } catch (err) {
      if (reset) {
        onError?.(area, err);
      } else {
        const status = area.querySelector('.catalog-lazy-status');
        if (status) {
          status.innerHTML = '<p class="catalog-lazy-status__text catalog-lazy-status__text--error">Не удалось загрузить ещё</p>';
        }
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  return {
    load,
    reset: () => load(true),
    disconnect,
  };
}

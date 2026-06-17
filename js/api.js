import { apiUrl } from './utils.js';

const cache = new Map();

async function request(path, options = {}) {
  const url = `${apiUrl()}${path}`;
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || 'Сайт временно недоступен');
    err.code = 'maintenance';
    err.payload = body;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || body.error || res.statusText);
    err.status = res.status;
    err.payload = body;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function getStoreStatus() {
  return request('/api/store/status');
}

export async function getStoreConfig() {
  return request('/api/store/config');
}

export async function getSite() {
  return request('/api/site');
}

export async function getSlides() {
  return request('/api/slides');
}

export async function getCategories() {
  return request('/api/categories');
}

export async function getAttributes() {
  return request('/api/attributes');
}

export async function getProducts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, String(v)));
    } else {
      qs.set(key, String(value));
    }
  });
  const query = qs.toString();
  return request(`/api/products${query ? `?${query}` : ''}`);
}

/** Полнотекстовый поиск (подсказки, автодополнение). */
export async function searchProducts(q, limit = 10) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  const query = qs.toString();
  const hits = await request(`/api/products/search${query ? `?${query}` : ''}`);
  if (!Array.isArray(hits)) return [];
  return hits.slice(0, limit);
}

export async function getProduct(key) {
  return request(`/api/products/${encodeURIComponent(key)}`);
}

export async function getRelatedProducts(key) {
  return request(`/api/products/${encodeURIComponent(key)}/related`);
}

export async function getDeliveryOptions() {
  const list = await request('/api/delivery-options');
  return Array.isArray(list) ? list.filter((item) => item.isActive !== false) : [];
}

export async function createGuestOrder(body) {
  return request('/api/orders/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getPage(slug) {
  const cacheKey = `page:${slug}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  try {
    const page = await request(`/api/pages/${encodeURIComponent(slug)}`);
    cache.set(cacheKey, page);
    return page;
  } catch (err) {
    if (err.status === 404) {
      cache.set(cacheKey, null);
      return null;
    }
    throw err;
  }
}

/** Пробуем загрузить опубликованные информационные страницы по известным slug. */
export async function discoverFooterPages(slugs) {
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const page = await getPage(slug);
      return page ? { slug, title: page.title } : null;
    }),
  );
  return results.filter(Boolean);
}

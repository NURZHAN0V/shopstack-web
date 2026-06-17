let currency = 'RUB';
let currencyFormatter = null;

export function apiUrl() {
  return (window.ShopStack?.apiUrl || '').replace(/\/$/, '');
}

export function setCurrency(code) {
  currency = code || 'RUB';
  try {
    currencyFormatter = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
  } catch {
    currencyFormatter = null;
  }
}

export function formatPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (currencyFormatter) return currencyFormatter.format(num);
  return `${Math.round(num).toLocaleString('ru-RU')} ${currency}`;
}

export function mediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function productUrl(slug) {
  return `product.html?slug=${encodeURIComponent(slug)}`;
}

export function catalogUrl(params = {}) {
  const qs = new URLSearchParams();
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.categorySlug) qs.set('category', params.categorySlug);
  const query = qs.toString();
  return `catalog.html${query ? `?${query}` : ''}`;
}

export function searchUrl(query, extra = {}) {
  const qs = new URLSearchParams();
  if (query) qs.set('q', query);
  Object.entries(extra).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return `search.html?${qs.toString()}`;
}

export function pageUrl(slug) {
  return `page.html?slug=${encodeURIComponent(slug)}`;
}

export function getProductImage(product) {
  const images = product?.productImages || [];
  const first = images.find((img) => !img.isVideo) || images[0];
  return first?.url ? mediaUrl(first.url) : '';
}

export function isOutOfStock(product) {
  if (product?.displayAsOutOfStock) return true;
  if (product?.unlimitedStock) return false;
  if (typeof product?.stockQuantity === 'number') return product.stockQuantity <= 0;
  return product?.inStock === false;
}

export function effectivePrice(product) {
  if (product?.discountPrice > 0) return product.discountPrice;
  return product?.price ?? 0;
}

export function hasDiscount(product) {
  const price = effectivePrice(product);
  return product?.oldPrice > price || (product?.discountPrice > 0 && product?.price > product.discountPrice);
}

export function oldPrice(product) {
  if (product?.oldPrice > effectivePrice(product)) return product.oldPrice;
  if (product?.discountPrice > 0 && product?.price > product.discountPrice) return product.price;
  return 0;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setMeta(title, description) {
  if (title) document.title = title;
  let desc = document.querySelector('meta[name="description"]');
  if (!desc) {
    desc = document.createElement('meta');
    desc.name = 'description';
    document.head.appendChild(desc);
  }
  if (description) desc.content = description;
}

export function parseQuery() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

export function updateQuery(params, replace = false) {
  const qs = new URLSearchParams(window.location.search);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      qs.delete(key);
    } else if (Array.isArray(value)) {
      qs.delete(key);
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, value);
    }
  });
  const next = `${window.location.pathname}?${qs.toString()}`;
  if (replace) {
    history.replaceState(null, '', next);
  } else {
    history.pushState(null, '', next);
  }
  return qs;
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const FOOTER_PAGE_SLUGS = [
  'about',
  'delivery',
  'payment',
  'returns',
  'privacy',
  'terms',
  'contacts',
  'offer',
];

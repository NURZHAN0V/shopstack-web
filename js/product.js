import { getProduct, getRelatedProducts } from './api.js';
import { addToCart, getCartItem, onCartUpdated, removeFromCart, updateCartQuantity } from './cart-store.js';
import {
  initShell,
  renderProductGrid,
  showEmpty,
  showLoading,
} from './shell.js';
import { initCookieBanner } from './cookies.js';
import {
  effectivePrice,
  escapeHtml,
  formatPrice,
  getProductKeyFromLocation,
  isOutOfStock,
  mediaUrl,
  oldPrice,
  productUrl,
  setMeta,
} from './utils.js';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  const key = getProductKeyFromLocation();

  if (!key) {
    showEmpty(content, {
      title: 'Товар не указан',
      text: 'Перейдите в каталог и выберите товар.',
      actionHtml: '<a class="btn btn--primary" href="catalog.html">Каталог</a>',
    });
    initCookieBanner();
    return;
  }

  let product;
  try {
    product = await getProduct(key);
  } catch (err) {
    showEmpty(content, {
      title: err.status === 404 ? 'Товар недоступен' : 'Не удалось загрузить товар',
      text:
        err.status === 404
          ? 'Возможно, товар снят с продажи или ссылка устарела.'
          : err.message || 'Попробуйте обновить страницу.',
      actionHtml: '<a class="btn btn--primary" href="catalog.html">В каталог</a>',
    });
    setMeta('Товар недоступен', 'Товар не найден');
    initCookieBanner();
    return;
  }

  const title = product.metaTitle || product.title;
  const description = product.metaDescription || stripHtml(product.description).slice(0, 160);
  setMeta(title, description);

  if (product.slug || product.id) {
    history.replaceState(null, '', productUrl(product.slug, product.id));
  }

  const images = (product.productImages || []).filter((img) => !img.isVideo);
  const mainImage = images[0];
  const out = isOutOfStock(product);
  const price = formatPrice(effectivePrice(product));
  const old = oldPrice(product) ? formatPrice(oldPrice(product)) : '';
  const category = product.category;

  content.innerHTML = `
      <nav class="breadcrumb" aria-label="Хлебные крошки">
        <a href="index.html">Главная</a>
        <span class="breadcrumb__sep"><a href="catalog.html">Каталог</a></span>
        ${
          category
            ? `<span class="breadcrumb__sep"><a href="catalog.html?categoryId=${category.id}">${escapeHtml(category.name)}</a></span>`
            : ''
        }
        <span class="breadcrumb__sep">${escapeHtml(product.title)}</span>
      </nav>

      <article class="product-page">
        <div class="product-page__layout">
          <div class="product-page__gallery">
            <div class="product-page__main-image" id="main-image">
              ${
                mainImage
                  ? `<img src="${escapeHtml(mediaUrl(mainImage.url))}" alt="${escapeHtml(mainImage.alt || product.title)}" id="gallery-main-img" decoding="async" fetchpriority="high">`
                  : '<div class="skeleton" style="width:100%;height:100%"></div>'
              }
            </div>
            ${
              images.length > 1
                ? `<div class="product-page__thumbs" id="gallery-thumbs">
              ${images
                .map(
                  (img, i) => `
                <button type="button" class="product-page__thumb ${i === 0 ? 'is-active' : ''}" data-url="${escapeHtml(mediaUrl(img.url))}" data-alt="${escapeHtml(img.alt || product.title)}">
                  <img src="${escapeHtml(mediaUrl(img.url))}" alt="">
                </button>`,
                )
                .join('')}
            </div>`
                : ''
            }
          </div>

          <div class="product-page__info">
            <h1 class="product-page__title">${escapeHtml(product.title)}</h1>
            <div class="product-page__meta">
              <span class="product-page__sku">Артикул: ${escapeHtml(product.sku)}</span>
              ${out ? '<span class="badge badge--out">Нет в наличии</span>' : ''}
            </div>
            <div class="product-page__price-block">
              <div class="price" style="font-size:1.5rem;margin-bottom:0.5rem">${price}${old ? `<span class="price__old">${old}</span>` : ''}</div>
              <div class="product-page__stock ${out ? 'product-page__stock--out' : 'product-page__stock--in'}">
                ${out ? 'Нет в наличии' : product.unlimitedStock ? 'В наличии' : `В наличии: ${product.stockQuantity} шт.`}
              </div>
              ${
                out
                  ? ''
                  : `<div id="product-cart-actions">${renderCartActions(product)}</div>`
              }
            </div>
            ${renderSpecs(product)}
          </div>
        </div>

        ${
          product.description
            ? `<section class="product-page__description-block">
            <h2 class="section-title">Описание</h2>
            <div class="product-page__description">${product.description}</div>
          </section>`
            : ''
        }

        <section class="related" id="related-section" aria-live="polite">
          <h2 class="section-title">Похожие товары</h2>
          <div id="related-products"><div class="spinner"></div></div>
        </section>
      </article>`;

  bindGallery();
  bindCartActions(product);
  onCartUpdated(() => refreshCartActions(product));
  loadRelated(product);
  initCookieBanner();
}

function renderCartActions(product) {
  const inCart = getCartItem(product.id);
  if (!inCart) {
    return `
      <div class="product-page__actions">
        <button type="button" class="btn btn--primary" id="add-to-cart">В корзину</button>
        <a class="btn btn--ghost" href="/cart.html">Перейти в корзину</a>
      </div>`;
  }

  return `
    <div class="product-page__actions product-page__actions--in-cart">
      <div class="product-cart-controls" role="group" aria-label="Количество в корзине">
        <button type="button" class="product-cart-controls__btn" id="cart-qty-minus" aria-label="Уменьшить">−</button>
        <span class="product-cart-controls__qty" id="cart-qty-value">${inCart.quantity}</span>
        <button type="button" class="product-cart-controls__btn" id="cart-qty-plus" aria-label="Увеличить">+</button>
      </div>
      <button type="button" class="btn btn--ghost" id="remove-from-cart">Удалить из корзины</button>
      <a class="btn btn--primary" href="/cart.html">Перейти в корзину</a>
    </div>`;
}

function refreshCartActions(product) {
  const root = document.getElementById('product-cart-actions');
  if (!root) return;
  root.innerHTML = renderCartActions(product);
  bindCartActions(product);
}

function bindCartActions(product) {
  const root = document.getElementById('product-cart-actions');
  if (!root) return;

  root.querySelector('#add-to-cart')?.addEventListener('click', () => {
    addToCart(product, 1);
    refreshCartActions(product);
  });

  root.querySelector('#cart-qty-minus')?.addEventListener('click', () => {
    const item = getCartItem(product.id);
    if (!item) return;
    if (item.quantity <= 1) {
      removeFromCart(product.id);
    } else {
      updateCartQuantity(product.id, null, item.quantity - 1);
    }
    refreshCartActions(product);
  });

  root.querySelector('#cart-qty-plus')?.addEventListener('click', () => {
    const item = getCartItem(product.id);
    if (!item) {
      addToCart(product, 1);
    } else {
      updateCartQuantity(product.id, null, item.quantity + 1);
    }
    refreshCartActions(product);
  });

  root.querySelector('#remove-from-cart')?.addEventListener('click', () => {
    removeFromCart(product.id);
    refreshCartActions(product);
  });
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || '';
}

function formatUnit(unit) {
  const map = { piece: 'шт.', pcs: 'шт.', kg: 'кг', l: 'л' };
  return map[unit] || unit;
}

function formatDimension(value) {
  return value > 0 ? String(value).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') : '—';
}

function buildSpecRows(product) {
  const rows = [];

  if (product.category?.name) {
    rows.push(['Категория', product.category.name]);
  }

  const extraCategories = (product.productCategories || [])
    .map((pc) => pc.category?.name)
    .filter((name) => name && name !== product.category?.name);
  if (extraCategories.length) {
    rows.push(['Также в разделах', [...new Set(extraCategories)].join(', ')]);
  }

  if (product.brand?.name) rows.push(['Бренд', product.brand.name]);
  if (product.supplier?.name) rows.push(['Поставщик', product.supplier.name]);

  const tags = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];
  if (tags.length) rows.push(['Теги', tags.join(', ')]);

  if (product.unit) rows.push(['Единица', formatUnit(product.unit)]);

  if (product.weight > 0) rows.push(['Вес', `${formatDimension(product.weight)} кг`]);

  if (product.length > 0 || product.width > 0 || product.height > 0) {
    rows.push([
      'Габариты (Д×Ш×В)',
      `${formatDimension(product.length)} × ${formatDimension(product.width)} × ${formatDimension(product.height)} см`,
    ]);
  }

  if (product.deliveryTime?.trim()) {
    rows.push(['Срок доставки', product.deliveryTime.trim()]);
  }

  (product.productAttributes || []).forEach((pa) => {
    const name = pa.attribute?.name || pa.Attribute?.name;
    const value = pa.attributeValue?.name || pa.AttributeValue?.name;
    if (name && value) rows.push([name, value]);
  });

  if (product.specifications && typeof product.specifications === 'object') {
    Object.entries(product.specifications).forEach(([key, value]) => {
      if (value != null && value !== '') rows.push([key, String(value)]);
    });
  }

  return rows;
}

function renderSpecs(product) {
  const rows = buildSpecRows(product);
  if (!rows.length) return '';

  return `
    <section class="product-page__specs-block" aria-labelledby="product-specs-title">
      <h2 class="product-page__specs-title" id="product-specs-title">Характеристики</h2>
      <div class="product-page__specs">
        <table>
          <tbody>
            ${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function bindGallery() {
  const mainImg = document.getElementById('gallery-main-img');
  document.getElementById('gallery-thumbs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.product-page__thumb');
    if (!btn || !mainImg) return;
    mainImg.src = btn.dataset.url;
    mainImg.alt = btn.dataset.alt || '';
    document.querySelectorAll('.product-page__thumb').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
}

async function loadRelated(product) {
  const el = document.getElementById('related-products');
  const section = document.getElementById('related-section');
  try {
    const related = await getRelatedProducts(product.slug || product.id);
    const items = (related || []).filter((p) => p.id !== product.id).slice(0, 4);
    if (!items.length) {
      section?.classList.add('app-hidden');
      return;
    }
    el.innerHTML = renderProductGrid(items, { eagerImage: true });
  } catch {
    section?.classList.add('app-hidden');
  }
}

init();

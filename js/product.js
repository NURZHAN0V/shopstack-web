import { getProduct, getRelatedProducts } from './api.js';
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
  isOutOfStock,
  mediaUrl,
  oldPrice,
  parseQuery,
  setMeta,
} from './utils.js';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  const { slug, id } = parseQuery();
  const key = slug || id;

  if (!key) {
    content.innerHTML = '<div class="container"></div>';
    const box = content.querySelector('.container');
    showEmpty(box, {
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
    content.innerHTML = '<div class="container"></div>';
    const box = content.querySelector('.container');
    showEmpty(box, {
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

  if (slug && product.slug && slug !== product.slug) {
    history.replaceState(null, '', `product.html?slug=${encodeURIComponent(product.slug)}`);
  }

  const images = (product.productImages || []).filter((img) => !img.isVideo);
  const mainImage = images[0];
  const out = isOutOfStock(product);
  const price = formatPrice(effectivePrice(product));
  const old = oldPrice(product) ? formatPrice(oldPrice(product)) : '';
  const category = product.category;

  content.innerHTML = `
    <div class="container">
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
                  ? `<img src="${escapeHtml(mediaUrl(mainImage.url))}" alt="${escapeHtml(mainImage.alt || product.title)}" id="gallery-main-img">`
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
            </div>
            ${renderSpecs(product)}
          </div>
        </div>

        ${
          product.description
            ? `<section style="margin-top:3rem">
            <h2 class="section-title">Описание</h2>
            <div class="product-page__description">${product.description}</div>
          </section>`
            : ''
        }

        <section class="related" id="related-section" aria-live="polite">
          <h2 class="section-title">Похожие товары</h2>
          <div id="related-products"><div class="spinner"></div></div>
        </section>
      </article>
    </div>`;

  bindGallery();
  loadRelated(product);
  initCookieBanner();
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || '';
}

function renderSpecs(product) {
  const attrs = product.productAttributes || [];
  const specs = product.specifications;
  const rows = [];

  attrs.forEach((pa) => {
    const name = pa.attribute?.name || pa.Attribute?.name;
    const value = pa.attributeValue?.name || pa.AttributeValue?.name;
    if (name && value) rows.push([name, value]);
  });

  if (specs && typeof specs === 'object') {
    Object.entries(specs).forEach(([k, v]) => {
      if (v != null && v !== '') rows.push([k, String(v)]);
    });
  }

  if (!rows.length) return '';

  return `
    <div class="product-page__specs">
      <table>
        <tbody>
          ${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
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
    el.innerHTML = renderProductGrid(items);
  } catch {
    section?.classList.add('app-hidden');
  }
}

init();

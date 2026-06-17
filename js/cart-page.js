import { createGuestOrder, getDeliveryOptions, getProduct } from './api.js';
import { getCachedStoreConfig, pageTitle } from './store-config.js';
import {
  clearCart,
  getCartItems,
  getCartTotal,
  initCartBadge,
  onCartUpdated,
  removeFromCart,
  updateCartQuantity,
} from './cart-store.js';
import { initShell, showLoading } from './shell.js';
import { initCookieBanner } from './cookies.js';
import {
  escapeHtml,
  formatPrice,
  formatTaxHint,
  effectivePrice,
  mediaUrl,
  productUrl,
  setMeta,
} from './utils.js';

const ORDER_TOKEN_KEY = 'shopstack_last_order';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  setMeta(pageTitle(['Корзина']), 'Оформление заказа');

  await syncCartWithServer();
  await render();
  bindEvents();
  initCookieBanner();
  initCartBadge();
  onCartUpdated(render);
}

async function syncCartWithServer() {
  const items = getCartItems();
  if (!items.length) return;

  let changed = false;
  for (const item of items) {
    try {
      const product = await getProduct(item.slug || item.productId);
      const price = effectivePrice(product);
      const image = product.productImages?.find((img) => !img.isVideo) || product.productImages?.[0];
      if (item.price !== price) {
        item.price = price;
        changed = true;
      }
      if (image?.url && item.image !== image.url) {
        item.image = image.url;
        changed = true;
      }
      if (product.title && item.title !== product.title) {
        item.title = product.title;
        changed = true;
      }
    } catch {
      /* товар мог быть снят — оставляем локальную копию */
    }
  }

  if (changed) {
    localStorage.setItem('shopstack_cart', JSON.stringify(items));
  }
}

async function render() {
  const content = document.getElementById('page-content');
  const items = getCartItems();
  const cfg = getCachedStoreConfig();
  const guestCheckout = cfg.storefront?.enableGuestCheckout !== false;

  if (!items.length) {
    const lastOrder = readLastOrder();
    content.innerHTML = `
      <div class="cart-page">
        ${lastOrder ? renderSuccess(lastOrder) : ''}
        ${showEmptyState()}
      </div>`;
    return;
  }

  let deliveryOptions = [];
  try {
    deliveryOptions = (await getDeliveryOptions()) || [];
  } catch {
    deliveryOptions = [];
  }

  const subtotal = getCartTotal();
  const taxHint = formatTaxHint(subtotal);
  const deliveryHtml = deliveryOptions.length
    ? deliveryOptions
        .map(
          (opt, index) => `
        <label class="cart-checkout__delivery">
          <input type="radio" name="deliveryOptionId" value="${opt.id}" ${index === 0 ? 'checked' : ''} data-price="${opt.price || 0}">
          <span>
            <strong>${escapeHtml(opt.name)}</strong>
            <span class="cart-checkout__delivery-meta">
              ${opt.price > 0 ? formatPrice(opt.price) : 'Бесплатно'}
              ${opt.daysMin || opt.daysMax ? ` · ${opt.daysMin || '?'}-${opt.daysMax || '?'} дн.` : ''}
            </span>
          </span>
        </label>`,
        )
        .join('')
    : '<p class="cart-checkout__hint">Способы доставки временно недоступны.</p>';

  content.innerHTML = `
    <div class="cart-page">
      <h1 class="cart-page__title">Корзина</h1>
      <div class="cart-layout">
        <section class="cart-items" aria-label="Товары в корзине">
          ${items.map(renderCartItem).join('')}
        </section>
        <aside class="cart-checkout">
          <h2 class="cart-checkout__title">Оформление заказа</h2>
          ${
            guestCheckout
              ? `<form id="checkout-form" class="cart-checkout__form" novalidate>
            <label class="field">
              <span class="field__label">Имя и фамилия</span>
              <input type="text" name="contactPerson" required autocomplete="name">
            </label>
            <label class="field">
              <span class="field__label">Телефон</span>
              <input type="tel" name="guestPhone" required autocomplete="tel" placeholder="+7 …">
            </label>
            <label class="field">
              <span class="field__label">Email</span>
              <input type="email" name="guestEmail" required autocomplete="email">
            </label>
            <label class="field">
              <span class="field__label">Город</span>
              <input type="text" name="city" required autocomplete="address-level2">
            </label>
            <label class="field">
              <span class="field__label">Адрес доставки</span>
              <input type="text" name="address" required autocomplete="street-address">
            </label>
            <fieldset class="cart-checkout__fieldset">
              <legend class="field__label">Доставка</legend>
              ${deliveryHtml}
            </fieldset>
            <label class="field">
              <span class="field__label">Комментарий к заказу</span>
              <textarea name="clientComment" rows="3" placeholder="Необязательно"></textarea>
            </label>
            <div class="cart-checkout__summary">
              <div><span>Товары</span><strong id="cart-subtotal">${formatPrice(subtotal)}</strong></div>
              <div><span>Доставка</span><strong id="cart-delivery">${formatPrice(getSelectedDeliveryPrice())}</strong></div>
              ${taxHint ? `<p class="cart-checkout__tax-hint">${escapeHtml(taxHint)}</p>` : ''}
              <div class="cart-checkout__total"><span>Итого</span><strong id="cart-total">${formatPrice(subtotal + getSelectedDeliveryPrice())}</strong></div>
            </div>
            <p class="cart-checkout__error" id="checkout-error" hidden></p>
            <button type="submit" class="btn btn--primary btn--block" id="checkout-submit" ${deliveryOptions.length ? '' : 'disabled'}>
              Оформить заказ
            </button>
          </form>`
              : `<p class="cart-checkout__hint">Гостевое оформление временно недоступно. Свяжитесь с магазином для заказа.</p>`
          }
        </aside>
      </div>
    </div>`;

  updateTotals();
}

function renderCartItem(item) {
  const img = item.image ? mediaUrl(item.image) : '';
  const lineTotal = formatPrice((item.price || 0) * (item.quantity || 0));
  return `
    <article class="cart-item" data-product-id="${item.productId}" data-variant-id="${item.productVariantId || ''}">
      <a href="${productUrl(item.slug, item.productId)}" class="cart-item__image">
        ${img ? `<img src="${escapeHtml(img)}" alt="" width="80" height="80" loading="lazy">` : '<div class="cart-item__placeholder" aria-hidden="true">▦</div>'}
      </a>
      <div class="cart-item__body">
        <a href="${productUrl(item.slug, item.productId)}" class="cart-item__title">${escapeHtml(item.title)}</a>
        <div class="cart-item__price">${formatPrice(item.price)}</div>
        <div class="cart-item__actions">
          <label class="cart-item__qty">
            <span class="sr-only">Количество</span>
            <input type="number" min="1" max="99" value="${item.quantity}" class="cart-qty-input">
          </label>
          <button type="button" class="cart-item__remove">Удалить</button>
        </div>
      </div>
      <div class="cart-item__total">${lineTotal}</div>
    </article>`;
}

function showEmptyState() {
  return `
    <div class="state">
      <div class="state__icon" aria-hidden="true">🛒</div>
      <h2 class="state__title">Корзина пуста</h2>
      <p class="state__text">Добавьте товары из каталога.</p>
      <div class="state__action"><a class="btn btn--primary" href="/catalog.html">Перейти в каталог</a></div>
    </div>`;
}

function renderSuccess(order) {
  return `
    <div class="cart-success">
      <h2 class="cart-success__title">Заказ оформлен</h2>
      <p>Номер заказа: <strong>${escapeHtml(order.number || `#${order.orderId}`)}</strong></p>
      <p class="cart-success__text">Мы свяжемся с вами для подтверждения. Сохраните номер заказа.</p>
    </div>`;
}

function readLastOrder() {
  try {
    const raw = sessionStorage.getItem(ORDER_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastOrder(data) {
  sessionStorage.setItem(ORDER_TOKEN_KEY, JSON.stringify(data));
}

function getSelectedDeliveryPrice() {
  const selected = document.querySelector('input[name="deliveryOptionId"]:checked');
  return selected ? Number(selected.dataset.price) || 0 : 0;
}

function updateTotals() {
  const subtotal = getCartTotal();
  const delivery = getSelectedDeliveryPrice();
  const subtotalEl = document.getElementById('cart-subtotal');
  const deliveryEl = document.getElementById('cart-delivery');
  const totalEl = document.getElementById('cart-total');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (deliveryEl) deliveryEl.textContent = formatPrice(delivery);
  if (totalEl) totalEl.textContent = formatPrice(subtotal + delivery);
}

function bindEvents() {
  document.getElementById('page-content')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.cart-item__remove');
    if (removeBtn) {
      const row = removeBtn.closest('.cart-item');
      removeFromCart(row.dataset.productId, row.dataset.variantId || null);
      render();
      return;
    }
  });

  document.getElementById('page-content')?.addEventListener('change', (e) => {
    if (e.target.matches('.cart-qty-input')) {
      const row = e.target.closest('.cart-item');
      updateCartQuantity(row.dataset.productId, row.dataset.variantId || null, e.target.value);
      render();
      return;
    }
    if (e.target.matches('input[name="deliveryOptionId"]')) {
      updateTotals();
    }
  });

  document.getElementById('page-content')?.addEventListener('submit', async (e) => {
    const form = e.target.closest('#checkout-form');
    if (!form) return;
    e.preventDefault();

    const errorEl = document.getElementById('checkout-error');
    const submitBtn = document.getElementById('checkout-submit');
    errorEl.hidden = true;

    const fd = new FormData(form);
    const deliveryId = Number(fd.get('deliveryOptionId'));
    const items = getCartItems().map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId || undefined,
      quantity: item.quantity,
    }));

    const payload = {
      guestEmail: String(fd.get('guestEmail') || '').trim(),
      guestPhone: String(fd.get('guestPhone') || '').trim(),
      contactPerson: String(fd.get('contactPerson') || '').trim(),
      clientComment: String(fd.get('clientComment') || '').trim(),
      deliveryOptionId: deliveryId,
      shippingAddress: {
        city: String(fd.get('city') || '').trim(),
        address: String(fd.get('address') || '').trim(),
      },
      items,
    };

    if (!payload.contactPerson || !payload.guestEmail || !payload.guestPhone || !deliveryId) {
      errorEl.textContent = 'Заполните обязательные поля.';
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Оформляем…';

    try {
      const res = await createGuestOrder(payload);
      saveLastOrder({ orderId: res.orderId, number: res.number, guestToken: res.guestToken });
      clearCart();
      await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      errorEl.textContent = err.message || 'Не удалось оформить заказ.';
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Оформить заказ';
    }
  });
}

init();

import { effectivePrice } from './utils.js';

const STORAGE_KEY = 'shopstack_cart';
const CART_EVENT = 'shopstack:cart-updated';

function itemKey(productId, variantId) {
  return `${productId}:${variantId || 0}`;
}

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { count: getCartCount() } }));
}

export function getCartItems() {
  return readCart();
}

export function getCartCount() {
  return readCart().reduce((sum, item) => sum + (item.quantity || 0), 0);
}

export function getCartTotal() {
  return readCart().reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
}

export function addToCart(product, quantity = 1) {
  if (!product?.id) return false;
  const qty = Math.max(1, Number(quantity) || 1);
  const key = itemKey(product.id, null);
  const items = readCart();
  const existing = items.find((i) => itemKey(i.productId, i.productVariantId) === key);
  const image = product.productImages?.find((img) => !img.isVideo) || product.productImages?.[0];

  if (existing) {
    existing.quantity += qty;
  } else {
    items.push({
      productId: product.id,
      productVariantId: null,
      slug: product.slug || '',
      title: product.title || '',
      price: effectivePrice(product),
      image: image?.url || '',
      quantity: qty,
    });
  }

  writeCart(items);
  return true;
}

export function updateCartQuantity(productId, productVariantId, quantity) {
  const items = readCart();
  const key = itemKey(productId, productVariantId);
  const item = items.find((i) => itemKey(i.productId, i.productVariantId) === key);
  if (!item) return;

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    writeCart(items.filter((i) => itemKey(i.productId, i.productVariantId) !== key));
    return;
  }

  item.quantity = qty;
  writeCart(items);
}

export function getCartItem(productId, productVariantId = null) {
  const key = itemKey(productId, productVariantId);
  return readCart().find((i) => itemKey(i.productId, i.productVariantId) === key) || null;
}

export function removeFromCart(productId, productVariantId = null) {
  const key = itemKey(productId, productVariantId);
  writeCart(readCart().filter((i) => itemKey(i.productId, i.productVariantId) !== key));
}

export function clearCart() {
  writeCart([]);
}

export function setCartItems(items) {
  writeCart(Array.isArray(items) ? items : []);
}

export function onCartUpdated(callback) {
  window.addEventListener(CART_EVENT, callback);
  return () => window.removeEventListener(CART_EVENT, callback);
}

export function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = getCartCount();
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.hidden = count <= 0;
}

export function initCartBadge() {
  updateCartBadge();
  onCartUpdated(updateCartBadge);
}

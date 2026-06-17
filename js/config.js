/**
 * Базовый URL API ShopStack.
 * При раздаче витрины с того же хоста, что и API, можно задать пустую строку.
 */
window.ShopStack = window.ShopStack || {};

const params = new URLSearchParams(window.location.search);
const fromQuery = params.get('api');
const fromMeta = document.querySelector('meta[name="shopstack-api"]')?.content?.trim();

window.ShopStack.apiUrl = (
  fromQuery ||
  fromMeta ||
  window.ShopStack.apiUrl ||
  'http://localhost:18080'
).replace(/\/$/, '');

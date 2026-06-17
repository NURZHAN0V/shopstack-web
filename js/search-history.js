const STORAGE_KEY = 'shopstack_search_history';
const MAX_ITEMS = 12;

export function getSearchHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((q) => typeof q === 'string' && q.trim()) : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return;
  const next = [q, ...getSearchHistory().filter((item) => item !== q)].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeSearchHistoryItem(query) {
  const q = String(query || '').trim();
  const next = getSearchHistory().filter((item) => item !== q);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearSearchHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

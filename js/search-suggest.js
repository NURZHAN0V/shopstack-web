import { escapeHtml } from './utils.js';

/** Категории, в названии которых есть запрос. */
export function findMatchingCategories(query, flat, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flat
    .filter((c) => c.isActive !== false && c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, 'ru');
    })
    .slice(0, limit);
}

/** Текстовые подсказки: запрос + уточнение из категорий и атрибутов. */
export function buildTextSuggestions(query, flat, attributes, limit = 8) {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  if (q.length < 2) return [];

  const seen = new Set();
  const out = [];

  const push = (text) => {
    const key = text.toLowerCase();
    if (seen.has(key) || key === q) return;
    seen.add(key);
    out.push(text);
  };

  for (const cat of flat) {
    if (cat.isActive === false) continue;
    const name = cat.name.trim();
    if (name.toLowerCase().includes(q)) push(name);
  }

  for (const attr of attributes || []) {
    for (const val of attr.attributeValues || []) {
      const word = String(val.name || '').trim();
      if (word.length < 2) continue;
      if (!q.includes(word.toLowerCase())) {
        push(`${trimmed} ${word}`);
      }
    }
  }

  return out.slice(0, limit);
}

/** Быстрые чипы-уточнения под строкой поиска. */
export function buildQuickChips(query, attributes, limit = 8) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const chips = [];
  const seen = new Set();

  for (const attr of attributes || []) {
    for (const val of attr.attributeValues || []) {
      const label = String(val.name || '').trim();
      if (!label || label.length > 24) continue;
      const key = label.toLowerCase();
      if (seen.has(key) || q.includes(key)) continue;
      seen.add(key);
      chips.push({ label, attrId: attr.id, valueId: val.id });
      if (chips.length >= limit) return chips;
    }
  }

  return chips;
}

/** Подсветка совпадения в подсказке (жирным — дополнение к запросу). */
export function formatSuggestionLabel(query, text) {
  const q = query.trim();
  const full = String(text ?? '');
  if (!q) return escapeHtml(full);

  const lowerFull = full.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerFull.indexOf(lowerQ);

  if (idx === 0) {
    const rest = full.slice(q.length);
    return `${escapeHtml(full.slice(0, q.length))}${rest ? `<strong>${escapeHtml(rest)}</strong>` : ''}`;
  }

  if (idx > 0) {
    return `${escapeHtml(full.slice(0, idx))}<strong>${escapeHtml(full.slice(idx))}</strong>`;
  }

  return escapeHtml(full);
}

/** Сортировка товаров на клиенте (API не отдаёт sort). */
export function sortProducts(items, sortKey) {
  const list = [...(items || [])];
  switch (sortKey) {
    case 'price-asc':
      return list.sort((a, b) => (a.discountPrice || a.price) - (b.discountPrice || b.price));
    case 'price-desc':
      return list.sort((a, b) => (b.discountPrice || b.price) - (a.discountPrice || a.price));
    case 'name':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    default:
      return list;
  }
}

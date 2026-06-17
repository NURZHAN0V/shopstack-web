import { getCategories } from './api.js';
import { catalogUrl, escapeHtml } from './utils.js';

let flatCategories = null;

/** Загружает и кэширует плоский список категорий. */
export async function loadCategories() {
  if (!flatCategories) {
    flatCategories = (await getCategories().catch(() => [])) || [];
  }
  return flatCategories;
}

export function getFlatCategories() {
  return flatCategories || [];
}

/** Строит дерево из плоского списка API. */
export function buildCategoryTree(flat) {
  const active = (flat || []).filter((c) => c.isActive !== false);
  const byId = new Map(active.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];

  for (const cat of byId.values()) {
    if (cat.parentId && byId.has(cat.parentId)) {
      byId.get(cat.parentId).children.push(cat);
    } else if (!cat.parentId) {
      roots.push(cat);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export function findCategory(flat, id) {
  if (!id) return null;
  return flat.find((c) => String(c.id) === String(id)) || null;
}

/** Корневая категория для любой вложенной. */
export function getRootCategory(flat, categoryId) {
  let cat = findCategory(flat, categoryId);
  if (!cat) return null;
  while (cat.parentId) {
    cat = findCategory(flat, cat.parentId);
    if (!cat) break;
  }
  return cat;
}

/** Прямые потомки. */
export function getChildCategories(flat, parentId) {
  return flat
    .filter((c) => c.isActive !== false && String(c.parentId) === String(parentId))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'));
}

/**
 * Группы подкатегорий для панели справа (как у Ozon):
 * каждая прямая дочерняя категория корня — заголовок группы, её дети — ссылки.
 */
export function getCategoryGroups(flat, rootId) {
  const direct = getChildCategories(flat, rootId);
  return direct.map((group) => ({
    category: group,
    links: getChildCategories(flat, group.id).length
      ? getChildCategories(flat, group.id)
      : [group],
  }));
}

export function renderCategoryLink(category, { activeId = '', className = '' } = {}) {
  const isActive = String(category.id) === String(activeId);
  return `<a href="${catalogUrl({ categoryId: category.id })}" class="catalog-link ${className} ${isActive ? 'is-active' : ''}">${escapeHtml(category.name)}</a>`;
}

export function renderRootList(tree, { activeRootId = '', onAll = false } = {}) {
  const allActive = onAll || !activeRootId;
  return `
    <a href="/catalog.html" class="catalog-link catalog-link--root ${allActive ? 'is-active' : ''}">Все товары</a>
    ${tree
      .map(
        (root) => `
      <a href="${catalogUrl({ categoryId: root.id })}" class="catalog-link catalog-link--root ${String(root.id) === String(activeRootId) ? 'is-active' : ''}" data-root-id="${root.id}">
        ${escapeHtml(root.name)}
      </a>`,
      )
      .join('')}`;
}

export function renderSubcategoryPanel(flat, rootId, { activeId = '' } = {}) {
  const root = findCategory(flat, rootId);
  if (!root) return '';

  const groups = getCategoryGroups(flat, rootId);
  if (!groups.length) {
    return `
      <div class="catalog-subs__empty">
        <p>${escapeHtml(root.description || 'Товары этой категории')}</p>
        <a class="btn btn--primary btn--sm" href="${catalogUrl({ categoryId: root.id })}">Смотреть товары</a>
      </div>`;
  }

  return `
    <h2 class="catalog-subs__title">${escapeHtml(root.name)}</h2>
    <div class="catalog-subs__grid">
      ${groups
        .map(
          (group) => `
        <section class="catalog-subs__group">
          <h3 class="catalog-subs__group-title">
            <a href="${catalogUrl({ categoryId: group.category.id })}">${escapeHtml(group.category.name)}</a>
          </h3>
          <ul class="catalog-subs__list">
            ${group.links
              .map(
                (link) => `
              <li>
                <a href="${catalogUrl({ categoryId: link.id })}" class="catalog-subs__item ${String(link.id) === String(activeId) ? 'is-active' : ''}">
                  ${escapeHtml(link.name)}
                </a>
              </li>`,
              )
              .join('')}
          </ul>
        </section>`,
        )
        .join('')}
    </div>`;
}

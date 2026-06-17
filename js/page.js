import { getPage } from './api.js';
import { initShell, showEmpty, showLoading } from './shell.js';
import { initCookieBanner } from './cookies.js';
import { escapeHtml, parseQuery, setMeta } from './utils.js';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: '' });
  if (shell.maintenance) return;

  const { slug } = parseQuery();
  if (!slug) {
    content.innerHTML = '<div class="container"></div>';
    showEmpty(content.querySelector('.container'), {
      title: 'Страница не найдена',
      text: 'Укажите корректный адрес страницы.',
      actionHtml: '<a class="btn btn--primary" href="index.html">На главную</a>',
    });
    initCookieBanner();
    return;
  }

  let page;
  try {
    page = await getPage(slug);
  } catch {
    page = null;
  }

  if (!page) {
    content.innerHTML = '<div class="container"></div>';
    showEmpty(content.querySelector('.container'), {
      title: 'Страница не найдена',
      text: 'Запрошенная страница не существует или не опубликована.',
      actionHtml: '<a class="btn btn--primary" href="index.html">На главную</a>',
    });
    setMeta('Страница не найдена', '');
    initCookieBanner();
    return;
  }

  setMeta(page.metaTitle || page.title, page.metaDescription || '');

  content.innerHTML = `
    <div class="container content-page">
      <nav class="breadcrumb" aria-label="Хлебные крошки">
        <a href="index.html">Главная</a>
        <span class="breadcrumb__sep">${escapeHtml(page.title)}</span>
      </nav>
      <h1 class="page-title">${escapeHtml(page.title)}</h1>
      <div class="content-page__body">${page.body || ''}</div>
    </div>`;

  initCookieBanner();
}

init();

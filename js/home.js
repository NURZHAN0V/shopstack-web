import { getCategories, getProducts, getSlides } from './api.js';
import { initShell, renderProductGrid, showLoading } from './shell.js';
import { initCookieBanner } from './cookies.js';
import { catalogUrl, escapeHtml, mediaUrl, setMeta } from './utils.js';

async function init() {
  const content = document.getElementById('page-content');
  showLoading(content);

  const shell = await initShell({ activeNav: 'home' });
  if (shell.maintenance) return;

  const site = shell.site;
  const metaTitle = site.metaTitle || site.name || 'Главная';
  const metaDesc = site.metaDescription || site.tagline || 'Интернет-магазин';
  setMeta(metaTitle, metaDesc);

  const [slides, categories, productsRes] = await Promise.all([
    getSlides().catch(() => []),
    getCategories().catch(() => []),
    getProducts({ limit: 8 }).catch(() => ({ items: [] })),
  ]);

  const activeSlides = (slides || []).filter((s) => s.isActive !== false);
  const topCategories = (categories || [])
    .filter((c) => c.isActive !== false && !c.parentId)
    .slice(0, 8);

  const heroHtml = activeSlides.length > 0 ? renderHero(activeSlides) : '';

  const categoriesHtml =
    topCategories.length > 0
      ? `
      <section class="home-categories">
        <h2 class="section-title">Категории</h2>
        <div class="home-categories__grid">
          ${topCategories
            .map(
              (c) => `
            <a class="home-categories__item" href="${catalogUrl({ categoryId: c.id })}">
              <div class="home-categories__name">${escapeHtml(c.name)}</div>
            </a>`,
            )
            .join('')}
        </div>
      </section>`
      : '';

  const products = productsRes.items || [];
  const productsHtml = products.length
    ? `
    <section>
      <div class="section-head">
        <h2 class="section-title">Популярные товары</h2>
        <a class="btn btn--ghost btn--sm" href="catalog.html">Весь каталог</a>
      </div>
      ${renderProductGrid(products)}
    </section>`
    : '';

  content.innerHTML = `<div class="section-stack">${heroHtml}${categoriesHtml}${productsHtml}</div>`;
  initCookieBanner();

  if (activeSlides.length > 1) initHeroSlider();
}

function slideImage(slide) {
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  const tablet = window.matchMedia('(max-width: 1024px)').matches;
  const src = mobile
    ? slide.imageMobile || slide.imageTablet || slide.imageDesktop
    : tablet
      ? slide.imageTablet || slide.imageDesktop
      : slide.imageDesktop;
  return src ? mediaUrl(src) : '';
}

function renderHero(slides) {
  return `
    <section class="hero" aria-label="Промо-слайды">
      <div class="hero__slides" id="hero-slides">
        ${slides
          .map((slide, i) => {
            const bg = slideImage(slide);
            return `
          <div class="hero__slide ${i === 0 ? 'is-active' : ''}" data-slide="${i}">
            ${bg ? `<div class="hero__bg"><img src="${escapeHtml(bg)}" alt=""></div>` : ''}
            <div class="hero__content">
              ${slide.title ? `<h1 class="hero__title">${escapeHtml(slide.title)}</h1>` : ''}
              ${slide.subtitle ? `<p class="hero__subtitle">${escapeHtml(slide.subtitle)}</p>` : ''}
              ${
                slide.buttonLabel && slide.buttonUrl
                  ? `<a class="btn btn--primary" href="${escapeHtml(slide.buttonUrl)}">${escapeHtml(slide.buttonLabel)}</a>`
                  : '<a class="btn btn--primary" href="catalog.html">Смотреть каталог</a>'
              }
            </div>
          </div>`;
          })
          .join('')}
      </div>
      ${
        slides.length > 1
          ? `<div class="hero__dots" id="hero-dots">
        ${slides.map((_, i) => `<button type="button" class="hero__dot ${i === 0 ? 'is-active' : ''}" data-dot="${i}" aria-label="Слайд ${i + 1}"></button>`).join('')}
      </div>`
          : ''
      }
    </section>`;
}

function initHeroSlider() {
  const slides = [...document.querySelectorAll('.hero__slide')];
  const dots = [...document.querySelectorAll('.hero__dot')];
  let current = 0;
  let timer;

  function goTo(index) {
    current = index;
    slides.forEach((el, i) => el.classList.toggle('is-active', i === current));
    dots.forEach((el, i) => el.classList.toggle('is-active', i === current));
  }

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      goTo(Number(dot.dataset.dot));
      resetTimer();
    });
  });

  function resetTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo((current + 1) % slides.length), 6000);
  }

  resetTimer();
}

init();

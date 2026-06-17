const STORAGE_KEY = 'shopstack_cookie_consent';

export function initCookieBanner() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Уведомление о cookies');
  banner.innerHTML = `
    <div class="cookie-banner__inner">
      <p class="cookie-banner__text">
        Мы используем файлы cookie для корректной работы сайта. Продолжая просмотр, вы соглашаетесь с их использованием.
      </p>
      <button type="button" class="btn btn--primary btn--sm" id="cookie-accept">Понятно</button>
    </div>`;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('is-visible'));

  banner.querySelector('#cookie-accept')?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    banner.classList.remove('is-visible');
    setTimeout(() => banner.remove(), 300);
  });
}

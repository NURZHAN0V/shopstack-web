# ShopStack — публичная витрина (web)

Простой статический сайт магазина: HTML, SCSS и vanilla JS. Данные загружаются из API ShopStack (`/api/*`).

## Быстрый старт

1. Запустите API и БД (из корня репозитория):

   ```bash
   docker compose up --build
   ```

   API: `http://localhost:18080`

2. Соберите стили и запустите витрину:

   ```bash
   cd web
   npm install
   npm run build:css
   npm run dev
   ```

   Сайт: `http://localhost:3000`

   Маршруты вида `/product/slug` обрабатывает встроенный `dev-server.mjs`. Для nginx и `serve` см. `serve.json`.

## Настройка API

По умолчанию витрина обращается к `http://localhost:18080`. Измените одним из способов:

- `<meta name="shopstack-api" content="https://api.example.com" />` в HTML
- `?api=https://api.example.com` в URL страницы
- `window.ShopStack.apiUrl` в `js/config.js`

## Страницы

| Файл | Назначение |
|------|------------|
| `index.html` | Главная: слайды, приветствие, категории, товары |
| `catalog.html` | Каталог с фильтрами по категориям и характеристикам |
| `product.html?slug=…` / `/product/…` | Карточка товара |
| `search.html?q=…` | Поиск и фильтры без перезагрузки |
| `page.html?slug=…` | Информационные страницы из CMS |

## Режим техобслуживания

При `maintenanceMode` в `/api/store/status` показывается страница «Сайт временно недоступен»; каталог и поиск скрыты.

## Стили

Исходники SCSS в `scss/`, общие токены — `scss/_variables.scss`. После правок:

```bash
npm run build:css
```

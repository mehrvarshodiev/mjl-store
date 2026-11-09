# MJL — Telegram-магазин электроники

Стартовая серверная основа MJL на TypeScript, grammY, Vercel Serverless Functions и Supabase PostgreSQL.

## Уже реализовано
- Telegram Mini App: каталог, поиск, категории, корзина и форма ручного заказа.
- API каталога и создания заказа с проверкой Telegram Mini App initData.
- SQL-миграция `0002_mini_app_orders.sql`: позиции заказа, ручная оплата/получение, идемпотентность и атомарная проверка остатков.
- Уведомление администраторов Telegram о принятом заказе.
- Webhook `/api/webhook` без polling.
- Проверка Telegram webhook secret token.
- Разделение клиентского меню и команды администратора.
- Проверка доступа по числовым Telegram ID из `MJL_ADMIN_IDS`.
- Чтение категорий и товаров из Supabase.
- SQL-схема для каталога, заказов, клиентов, публикаций, опросов, кампаний, администраторов, аудита и идемпотентности webhook.
- Тесты форматирования Telegram-сообщений.

## Важно: статус функциональности
Это **ранний MVP**, а не готовый к коммерческому запуску магазин. Интерфейс Mini App, API каталога и базовый сценарий заказа уже добавлены в код, но не заработают в production до подключения Supabase и Telegram secrets, применения миграций и end-to-end теста. Полное управление товарами, статусы заказов, публикации, опросы, аналитика и экспорт ещё требуют реализации.

## Требования
Node.js 20+, npm, Telegram bot token, Supabase project.

## Локальная проверка
```bash
npm install
cp .env.example .env
# Заполнить .env локально
npm run typecheck
npm test
```

## Переменные окружения
См. `.env.example`. Не коммитьте `.env`, токены или ключи. `SUPABASE_SERVICE_ROLE_KEY` используется только серверной функцией и обходит RLS; храните его только в защищённых переменных Vercel.

## Supabase
Выполните SQL по порядку в SQL Editor проекта Supabase: `0001_initial_schema.sql`, затем `0002_mini_app_orders.sql`.

## Vercel
Импортируйте репозиторий, framework preset — Other (или Node.js functions auto-detection). Добавьте переменные из `.env.example` в Project Settings → Environment Variables. После успешного деплоя установите webhook:

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${APP_BASE_URL}/api/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Проверьте `getWebhookInfo`. Не запускайте polling одновременно с webhook.

## Административное управление товарами (миграция 0003)\n- `/admin` → «Товары» и «Добавить товар» запускают реальные CRUD-сценарии.\n- Мастер сохраняет шаги в `admin_sessions`, поэтому работает с Vercel Serverless.\n- Поддерживаются категории, бренд, модель, до 10 Telegram-фото, описание, характеристики, цена, остаток и статусы.\n- Доступны просмотр, изменение основных полей, архивирование и окончательное удаление с подтверждением.\n- Изменения записываются в `admin_activity_logs`.\n- Перед запуском примените `0003_admin_product_management.sql` в Supabase SQL Editor.\n\n## Следующие этапы
1. Подключить реальный Supabase-проект и Telegram secrets в Vercel, применить обе миграции и проверить Mini App end-to-end.
2. Реализовать полноценные CRUD-сценарии каталога товаров и категорий.
3. Фото товара, предпросмотр и публикация в канал с сохранением message ID.
4. Опросы, кампании, аналитика и CSV-экспорт.
5. Интеграционные тесты и end-to-end проверка Telegram → Mini App → webhook/API → Supabase.


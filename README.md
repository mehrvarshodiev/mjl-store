# MJL — Telegram-магазин электроники

Стартовая серверная основа MJL на TypeScript, grammY, Vercel Serverless Functions и Supabase PostgreSQL.

## Уже реализовано
- Webhook `/api/webhook` без polling.
- Проверка Telegram webhook secret token.
- Разделение клиентского меню и команды администратора.
- Проверка доступа по числовым Telegram ID из `MJL_ADMIN_IDS`.
- Чтение категорий и товаров из Supabase.
- SQL-схема для каталога, заказов, клиентов, публикаций, опросов, кампаний, администраторов, аудита и идемпотентности webhook.
- Тесты форматирования Telegram-сообщений.

## Важно: статус функциональности
Это **MVP-каркас**, а не готовый к коммерческому запуску магазин. Заказы, полный CRUD, пошаговый мастер товара, публикации, опросы, аналитика и экспорт ещё требуют реализации. Заглушки в меню явно обозначают незавершённые разделы.

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
Выполните SQL из `supabase/migrations/0001_initial_schema.sql` в SQL Editor проекта Supabase.

## Vercel
Импортируйте репозиторий, framework preset — Other (или Node.js functions auto-detection). Добавьте переменные из `.env.example` в Project Settings → Environment Variables. После успешного деплоя установите webhook:

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${APP_BASE_URL}/api/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

Проверьте `getWebhookInfo`. Не запускайте polling одновременно с webhook.

## Следующие этапы
1. Реализовать полноценные CRUD-сценарии каталога.
2. Оформление заказов с проверкой остатков и защитой от повторов.
3. Фото товара, предпросмотр и публикация в канал с сохранением message ID.
4. Опросы, кампании, аналитика и CSV-экспорт.
5. Интеграционные тесты и end-to-end проверка Telegram → webhook → Supabase.


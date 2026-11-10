# MJL implementation roadmap

## Repository audit — 2026-11-09

Repository: https://github.com/mehrvarshodiev/mjl-store  
Default branch: main  
Working branch: feature/mjl-admin-management

### Existing foundation

- TypeScript, Node.js 20+, grammY and a Vercel serverless webhook.
- Supabase PostgreSQL with a server-only service-role client.
- Telegram webhook secret validation and duplicate-update protection.
- Admin allowlist based on numeric Telegram IDs in MJL_ADMIN_IDS.
- Customer entry point, Telegram Mini App/catalog/order foundation.
- SQL schema for categories, products, orders, channel_posts, polls, poll_results, administrators, campaigns, store_settings, audit logs and processed_updates.
- Product formatter escapes HTML output.
- Existing tests cover Telegram formatting helpers.

### Confirmed gaps

- The /admin menu contains placeholder responses for product management, orders, posts and settings.
- Product CRUD conversation flows are not implemented in the inspected bot code.
- Channel publishing/editing/deleting and message-ID synchronization are not implemented in the inspected bot code.
- Poll creation/closing and result synchronization are not implemented in the inspected bot code.
- Analytics and scheduled publishing are not implemented in the inspected bot code.
- README explicitly describes the repository as an early MVP. Production requires real Supabase credentials, applied migrations and end-to-end testing.

## Architecture decision

Keep the current stack; do not rewrite the project.

- grammY remains the Telegram webhook entry point.
- Supabase is the source of truth for catalog, stock, publication records, polls and audit events.
- Admin actions use the numeric Telegram ID allowlist and server-side authorization checks.
- Store Telegram file_id values for product media to avoid unnecessary re-uploads.
- Persist every published channel message ID in channel_posts so later edits/deletions target the exact post.
- Require explicit confirmation for publish, archive and destructive delete actions.
- Implement scheduled publishing with a persistent database-backed queue; do not use in-memory timers in serverless functions.
- Add a separately authenticated, narrowly scoped API/MCP adapter only after bot workflows are stable. ChatGPT must obey the same authorization and confirmation rules.

## Delivery phases

1. Admin catalog workflows: list/search/filter, guided product creation, edit, archive, confirmed delete, stock/status changes, preview and audit logging.
2. Channel publishing: publish approved product cards, save message IDs, edit/re-publish/remove posts, handle Telegram API errors and channel permissions.
3. Polls and feedback: create native Telegram polls, close polls, persist poll identifiers and available result counts.
4. Operations: persistent scheduled jobs, order management, analytics, CSV export and operational reports.
5. ChatGPT integration: authenticated API/MCP tools with least privilege, confirmation gates and audit logging.
6. Production verification: migration checks, typecheck, tests, webhook smoke tests and end-to-end Telegram/Supabase validation.

## Production prerequisites

- Configure BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, MJL_ADMIN_IDS, MJL_CHANNEL_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APP_BASE_URL in deployment environment variables.
- Add the bot to the target channel with only the permissions required for the planned operations.
- Apply Supabase migrations in order.
- Configure the Telegram webhook after deployment and verify getWebhookInfo.
- Never commit .env files, bot tokens or Supabase service-role keys.

## Acceptance criteria

- Unauthorized users cannot invoke admin actions or mutate store data.
- Product changes persist in Supabase and update channel posts only after explicit approval.
- Publish/edit/delete operations store and use the correct chat_id and message_id.
- Destructive actions require confirmation and create audit records.
- Duplicate webhook updates do not create duplicate products, posts or polls.
- Polls can be created and closed from the admin bot; available results are persisted.
- Typecheck and automated tests pass. Production readiness is not claimed until live credentials and end-to-end checks are verified.

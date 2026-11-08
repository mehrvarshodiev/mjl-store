import { z } from 'zod';

const envSchema = z.object({
  BOT_TOKEN: z.string().min(20),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  MJL_ADMIN_IDS: z.string().default(''),
  MJL_CHANNEL_ID: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_BASE_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`);
}

export const config = parsed.data;
export const adminIds = new Set(
  config.MJL_ADMIN_IDS.split(',').map((value) => value.trim()).filter(Boolean),
);

export function isAdmin(telegramId: number | undefined): boolean {
  return telegramId !== undefined && adminIds.has(String(telegramId));
}

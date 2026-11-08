import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
import { bot } from '../src/bot.js';
import { config } from '../src/config.js';

const handleUpdate = webhookCallback(bot, 'http', { timeoutMilliseconds: 8_000 });

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const suppliedSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (typeof suppliedSecret !== 'string' || suppliedSecret !== config.TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Unauthorized webhook request' });
    return;
  }

  try {
    await handleUpdate(req, res);
  } catch (error) {
    console.error('Webhook processing error', error);
    if (!res.headersSent) res.status(500).json({ error: 'Webhook processing failed' });
  }
}

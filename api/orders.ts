import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { config, adminIds } from '../src/config.js';
import { db } from '../src/db.js';
import { verifyTelegramInitData } from '../src/telegram-auth.js';

const orderSchema = z.object({
  initData: z.string().min(1).max(10_000),
  idempotencyKey: z.string().min(12).max(100),
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  city: z.string().trim().max(120).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  fulfillmentMethod: z.enum(['delivery', 'pickup']),
  paymentMethod: z.enum(['cash', 'transfer']),
  comment: z.string().trim().max(1000).optional().default(''),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(30),
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Проверьте заполнение формы заказа.' });
    return;
  }

  const telegram = verifyTelegramInitData(parsed.data.initData, config.BOT_TOKEN);
  if (!telegram) {
    res.status(401).json({ error: 'Не удалось подтвердить Telegram-пользователя. Откройте магазин через бота.' });
    return;
  }

  if (parsed.data.fulfillmentMethod === 'delivery' && parsed.data.address.length < 5) {
    res.status(400).json({ error: 'Укажите адрес доставки.' });
    return;
  }

  const { data, error } = await db.rpc('create_mjl_order', {
    p_telegram_user_id: telegram.user.id,
    p_username: telegram.user.username ?? null,
    p_first_name: telegram.user.first_name,
    p_customer_name: parsed.data.customerName,
    p_phone: parsed.data.phone,
    p_delivery_city: parsed.data.city,
    p_delivery_address: parsed.data.address,
    p_fulfillment_method: parsed.data.fulfillmentMethod,
    p_payment_method: parsed.data.paymentMethod,
    p_comment: parsed.data.comment,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_items: parsed.data.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  });

  if (error) {
    console.error('Order creation failed', { code: error.code, message: error.message });
    const unavailable = error.message.includes('PRODUCT_UNAVAILABLE');
    res.status(unavailable ? 409 : 400).json({
      error: unavailable
        ? 'Один из товаров уже закончился или его количество изменилось. Обновите корзину.'
        : 'Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.',
    });
    return;
  }

  const order = data as { order_number?: number; total_amount?: number; currency?: string; duplicate?: boolean };
  const summary = [
    `Новый заказ MJL #${order.order_number ?? '—'}`,
    `Покупатель: ${parsed.data.customerName}`,
    `Телефон: ${parsed.data.phone}`,
    `Получение: ${parsed.data.fulfillmentMethod === 'delivery' ? 'Доставка' : 'Самовывоз'}`,
    `Город: ${parsed.data.city || 'не указан'}`,
    `Адрес: ${parsed.data.address || 'согласовать'}`,
    `Оплата: ${parsed.data.paymentMethod === 'cash' ? 'Наличные' : 'Перевод'}`,
    `Сумма: ${order.total_amount ?? '—'} ${order.currency ?? 'RUB'}`,
    `Комментарий: ${parsed.data.comment || 'нет'}`,
  ].join('\n');

  await Promise.all([...adminIds].map(async (adminId) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(adminId), text: summary }),
      });
      if (!response.ok) console.error('Admin order notification failed', { adminId, status: response.status });
    } catch (notificationError) {
      console.error('Admin order notification error', notificationError);
    }
  }));

  res.status(201).json({
    ok: true,
    orderNumber: order.order_number,
    totalAmount: order.total_amount,
    currency: order.currency ?? 'RUB',
    duplicate: order.duplicate ?? false,
  });
}

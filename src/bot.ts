import { Bot, InlineKeyboard } from 'grammy';
import { config, isAdmin } from './config.js';
import { db, type Product } from './db.js';
import { formatProduct } from './format.js';

// Telegram retries webhook updates. Persist update_id before side effects to ignore duplicates.
export const bot = new Bot(config.BOT_TOKEN);

bot.use(async (ctx, next) => {
  const { error } = await db.from('processed_updates').insert({ update_id: ctx.update.update_id });
  if (error?.code === '23505') return;
  if (error) throw error;
  try {
    await next();
  } catch (processingError) {
    await db.from('processed_updates').delete().eq('update_id', ctx.update.update_id);
    throw processingError;
  }
});

const customerMenu = new InlineKeyboard()
  .text('🛍 Каталог товаров', 'catalog').row()
  .text('🔥 Новинки', 'new').text('💰 Акции', 'promotions').row()
  .text('📦 Мои заказы', 'orders').text('🔎 Поиск товара', 'search').row()
  .text('💬 Связаться с продавцом', 'contact').row()
  .text('ℹ️ О магазине', 'about');

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Добро пожаловать в <b>MJL — магазин электроники</b>!\n\nЗдесь вы найдёте полезные гаджеты, современные аксессуары и электронику по привлекательным ценам.',
    { parse_mode: 'HTML', reply_markup: customerMenu },
  );
});

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ У вас нет доступа к административной панели.');
    return;
  }
  const keyboard = new InlineKeyboard()
    .text('📊 Сводка', 'admin:stats').row()
    .text('📦 Товары', 'admin:products').text('📨 Заказы', 'admin:orders').row()
    .text('➕ Добавить товар', 'admin:add').row()
    .text('📢 Публикации', 'admin:posts').text('⚙️ Настройки', 'admin:settings');
  await ctx.reply('🔐 <b>Панель управления MJL</b>\nВыберите нужный раздел:', { parse_mode: 'HTML', reply_markup: keyboard });
});

bot.callbackQuery('catalog', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { data, error } = await db.from('categories').select('id,name,emoji').eq('is_active', true).order('sort_order');
  if (error) {
    await ctx.reply('Не удалось загрузить каталог. Попробуйте позже.');
    return;
  }
  if (!data?.length) {
    await ctx.reply('Каталог скоро появится. Загляните немного позже!');
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const category of data) keyboard.text(`${category.emoji ?? '📁'} ${category.name}`, `category:${category.id}`).row();
  await ctx.reply('Выберите категорию:', { reply_markup: keyboard });
});

bot.callbackQuery(/^category:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const categoryId = ctx.match[1] ?? '';
  const { data, error } = await db.from('products')
    .select('id,name,brand,model,price,currency,description,specifications,stock_quantity,status')
    .eq('category_id', categoryId).eq('status', 'active').order('created_at', { ascending: false }).limit(20);
  if (error) {
    await ctx.reply('Не удалось загрузить товары. Попробуйте позже.');
    return;
  }
  if (!data?.length) {
    await ctx.reply('В этой категории пока нет товаров.');
    return;
  }
  for (const product of data as Product[]) {
    const keyboard = new InlineKeyboard().text('🛒 Оформить заказ', `order:${product.id}`).text('💬 Задать вопрос', `question:${product.id}`);
    await ctx.reply(formatProduct(product), { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

bot.callbackQuery(/^admin:/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  const action = ctx.callbackQuery.data.slice('admin:'.length);
  const messages: Record<string, string> = {
    stats: '📊 Аналитика будет подключена на следующем этапе.',
    products: '📦 Управление товарами: следующий этап — список, фильтры и редактирование.',
    orders: '📨 Управление заказами будет подключено на следующем этапе.',
    add: '➕ Мастер добавления товара будет подключён следующим этапом.',
    posts: '📢 Управление публикациями будет подключено на следующем этапе.',
    settings: '⚙️ Настройки магазина будут подключены на следующем этапе.',
  };
  await ctx.reply(messages[action] ?? 'Раздел пока не реализован.');
});

bot.callbackQuery(/^order:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const productId = ctx.match[1] ?? '';
  await ctx.reply(`Для оформления заказа на товар ${productId} напишите продавцу. Полноценная пошаговая форма заказов подключается на следующем этапе.`);
});

bot.callbackQuery(/^question:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('Напишите ваш вопрос следующим сообщением. Продавец сможет ответить после подключения центра обращений.');
});

bot.callbackQuery('new', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { data } = await db.from('products').select('id,name,brand,model,price,currency,description,specifications,stock_quantity,status').eq('status', 'active').order('created_at', { ascending: false }).limit(10);
  if (!data?.length) return void await ctx.reply('Новые товары скоро появятся!');
  for (const product of data as Product[]) await ctx.reply(formatProduct(product), { parse_mode: 'HTML' });
});

bot.callbackQuery('promotions', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Актуальные акции появятся здесь после их добавления администратором.'); });
bot.callbackQuery('orders', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Чтобы проверить заказ, понадобится номер заказа. История заказов будет доступна после завершения регистрации заказов.'); });
bot.callbackQuery('search', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Поиск по каталогу будет подключён на следующем этапе.'); });
bot.callbackQuery('contact', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('Связаться с продавцом MJL: напишите сообщение администратору магазина. Контакт для связи будет добавлен в настройках.'); });
bot.callbackQuery('about', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply('MJL — магазин электроники. Современные гаджеты и полезные аксессуары. Актуальные цены, наличие и условия продажи уточняйте в карточке товара.'); });

bot.catch((error) => {
  console.error('Telegram bot update failed', { error: error.error, updateId: error.ctx.update.update_id });
});

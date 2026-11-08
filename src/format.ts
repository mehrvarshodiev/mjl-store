import type { Product } from './db.js';

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount) + ` ${currency}`;
}

export function formatProduct(product: Product): string {
  const lines = [`🛍 <b>${escapeHtml(product.name)}</b>`];
  if (product.brand || product.model) lines.push(`🏷 ${[product.brand, product.model].filter(Boolean).map(escapeHtml).join(' ')}`);
  lines.push(`💰 Цена: <b>${formatPrice(product.price, product.currency)}</b>`);
  lines.push(`📦 Наличие: ${product.stock_quantity > 0 ? `${product.stock_quantity} шт.` : 'Нет в наличии'}`);
  if (product.description) lines.push('', escapeHtml(product.description));
  const specs = Object.entries(product.specifications ?? {});
  if (specs.length) lines.push('', '<b>Характеристики:</b>', ...specs.map(([key, value]) => `• ${escapeHtml(key)}: ${escapeHtml(value)}`));
  return lines.join('\n');
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

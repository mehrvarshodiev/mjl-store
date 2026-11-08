import { describe, expect, it } from 'vitest';
import type { Product } from '../src/db.js';
import { escapeHtml, formatPrice, formatProduct } from '../src/format.js';

describe('Telegram formatting helpers', () => {
  it('escapes HTML characters in user-provided text', () => {
    expect(escapeHtml('<A & B>')).toBe('&lt;A &amp; B&gt;');
  });

  it('formats price with Russian locale and currency', () => {
    expect(formatPrice(2500, 'RUB')).toContain('RUB');
    expect(formatPrice(2500, 'RUB')).toContain('2');
  });

  it('escapes database-provided currency before inserting it into Telegram HTML', () => {
    const product: Product = {
      id: 'test-id',
      name: 'Demo product',
      brand: null,
      model: null,
      price: 100,
      currency: '<b>INJECT</b>',
      description: null,
      specifications: {},
      stock_quantity: 1,
      status: 'active',
    };
    expect(formatProduct(product)).toContain('&lt;b&gt;INJECT&lt;/b&gt;');
    expect(formatProduct(product)).not.toContain('<b>INJECT</b>');
  });
});

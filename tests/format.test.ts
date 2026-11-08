import { describe, expect, it } from 'vitest';
import { escapeHtml, formatPrice } from '../src/format.js';

describe('Telegram formatting helpers', () => {
  it('escapes HTML characters in user-provided text', () => {
    expect(escapeHtml('<A & B>')).toBe('&lt;A &amp; B&gt;');
  });

  it('formats price with Russian locale and currency', () => {
    expect(formatPrice(2500, 'RUB')).toContain('RUB');
    expect(formatPrice(2500, 'RUB')).toContain('2');
  });
});

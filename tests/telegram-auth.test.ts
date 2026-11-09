import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from '../src/telegram-auth.js';

const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';

function makeInitData(now: number, overrides: Record<string, string> = {}): string {
  const values = new URLSearchParams({
    auth_date: String(now),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: 123456, first_name: 'Test', username: 'tester' }),
    ...overrides,
  });
  const dataCheckString = [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', token).update('WebAppData').digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  values.set('hash', hash);
  return values.toString();
}

describe('verifyTelegramInitData', () => {
  const now = 1_800_000_000;

  it('accepts correctly signed recent Telegram data', () => {
    const result = verifyTelegramInitData(makeInitData(now), token, now);
    expect(result?.user.id).toBe(123456);
  });

  it('rejects modified or invalidly signed data', () => {
    const data = makeInitData(now).replace('first_name%22%3A%22Test', 'first_name%22%3A%22Fake');
    expect(verifyTelegramInitData(data, token, now)).toBeNull();
  });

  it('rejects expired data', () => {
    expect(verifyTelegramInitData(makeInitData(now - 86_401), token, now)).toBeNull();
  });
});

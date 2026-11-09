import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramWebAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type VerifiedTelegramInitData = {
  user: TelegramWebAppUser;
  authDate: number;
};

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedTelegramInitData | null {
  if (!initData || initData.length > 10_000) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash) || !authDateRaw || !userRaw) return null;

  const authDate = Number(authDateRaw);
  if (!Number.isInteger(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > 86_400) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', botToken).update('WebAppData').digest();
  const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const suppliedHash = Buffer.from(receivedHash, 'hex');
  if (suppliedHash.length !== calculatedHash.length || !timingSafeEqual(suppliedHash, calculatedHash)) return null;

  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser;
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') return null;
    return { user, authDate };
  } catch {
    return null;
  }
}

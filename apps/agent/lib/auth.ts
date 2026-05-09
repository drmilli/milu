const TOKEN_KEY = 'milu_affiliate_token';
const USER_KEY = 'milu_affiliate_user';

export interface AffiliateUser {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  status: string;
}

export function getAffiliateToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAffiliateUser(): AffiliateUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AffiliateUser; } catch { return null; }
}

export function saveAffiliateSession(token: string, user: AffiliateUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAffiliateSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}


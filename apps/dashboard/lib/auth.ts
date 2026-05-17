const TOKEN_KEY = 'milu_token';
const USER_KEY = 'milu_user';
const ACTIVE_BIZ_KEY = 'activeBusinessId';

export interface StoredUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  businessId: string;
  emailVerified: boolean;
  businessName?: string;
  planName?: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: StoredUser, initialBusinessId?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (initialBusinessId && !localStorage.getItem(ACTIVE_BIZ_KEY)) {
    localStorage.setItem(ACTIVE_BIZ_KEY, initialBusinessId);
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVE_BIZ_KEY);
}

export function getActiveBusinessId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_BIZ_KEY);
}

export function setActiveBusinessId(id: string) {
  localStorage.setItem(ACTIVE_BIZ_KEY, id);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function adminGet<T>(path: string, token: string) {
  return apiFetch<T>(path, { headers: { Authorization: `Bearer ${token}` } });
}

export function adminPost<T>(path: string, body: unknown, token: string) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminPatch<T>(path: string, body: unknown, token: string) {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}` },
  });
}

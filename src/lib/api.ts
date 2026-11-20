import { auth } from './firebase';

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export async function getFreshToken(): Promise<string | null> {
  if (auth.currentUser) {
    inMemoryToken = await auth.currentUser.getIdToken();
  }
  return inMemoryToken;
}

export async function apiRequest<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getFreshToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// Export any array of objects as Excel-compatible UTF-8 BOM CSV (supports Myanmar Unicode cleanly in Excel!)
export function downloadCSV(filename: string, headers: { key: string; label: string }[], rows: Record<string, any>[]) {
  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map((h) => escapeCell(h.label)).join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h.key])).join(',')),
  ];

  // UTF-8 BOM ensures Microsoft Excel displays Myanmar Unicode characters properly
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

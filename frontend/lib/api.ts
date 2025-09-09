import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const api = {
  get: async (path: string) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  post: async (path: string, body?: any, extraHeaders?: Record<string, string>) => {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { ...headers, ...(extraHeaders || {}) },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

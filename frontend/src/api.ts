const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
export const apiUrl = (path: string): string => `${API_URL}${path}`;
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  const payload = await response.json().catch(() => null) as { message?: string; code?: string } | null;
  if (!response.ok) throw new ApiClientError(payload?.message ?? 'Não foi possível concluir a solicitação.', payload?.code ?? 'REQUEST_FAILED', response.status);
  return payload as T;
}

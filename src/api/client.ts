import type { AppState } from '../state/store';

/**
 * Base de la API. Vacío significa "el mismo origen que sirve la web", que es
 * lo normal cuando el servidor va detrás de Caddy; solo hace falta rellenar
 * VITE_API_URL si la PWA vive en otro sitio (por ejemplo GitHub Pages).
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface Account {
  id: number;
  username: string;
}

export interface AuthResult {
  token: string;
  user: Account;
}

export interface RemoteState {
  state: AppState | null;
  revision: number;
  updatedAt: number | null;
}

/** Error de la API con su código HTTP, para poder distinguir los casos. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Cuerpo de la respuesta; en un 409 trae el estado del servidor. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const { method = 'GET', body, token } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Sin red o servidor caído: se distingue de un error devuelto por la API
    // para poder decirle al usuario que siga entrenando en local.
    throw new ApiError('No se pudo contactar con el servidor', 0);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'Error del servidor';
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export const api = {
  health: () => call<{ ok: boolean }>('/health'),

  register: (username: string, password: string) =>
    call<AuthResult>('/auth/register', { method: 'POST', body: { username, password } }),

  login: (username: string, password: string) =>
    call<AuthResult>('/auth/login', { method: 'POST', body: { username, password } }),

  me: (token: string) => call<{ user: Account }>('/auth/me', { token }),

  deleteAccount: (token: string) => call<void>('/auth/me', { method: 'DELETE', token }),

  pullState: (token: string) => call<RemoteState>('/state', { token }),

  pushState: (token: string, state: AppState, baseRevision?: number) =>
    call<{ revision: number; updatedAt: number }>('/state', {
      method: 'PUT',
      token,
      body: { state, baseRevision },
    }),
};

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type Account } from '../api/client';
import type { AppState } from './store';

const TOKEN_KEY = 'ratafit:token';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface AuthState {
  account: Account | null;
  /** true mientras se comprueba la sesión guardada al abrir la app. */
  loading: boolean;
  status: SyncStatus;
  /** Mensaje del último problema, para mostrarlo en la interfaz. */
  message: string | null;
  lastSyncedAt: number | null;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Modo privado o sin espacio: la sesión durará lo que dure la pestaña.
  }
}

export interface UseAuthOptions {
  /** Estado actual de la app, que es lo que se sube al servidor. */
  state: AppState;
  /** Sustituye el estado local por el que venga del servidor. */
  onReplaceState: (state: AppState) => void;
}

export interface AuthApi extends AuthState {
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  /** Fuerza una subida inmediata. */
  syncNow: () => Promise<void>;
}

/**
 * Gestiona la cuenta y la sincronización. Los datos siguen viviendo en el
 * dispositivo: el servidor es una copia para poder usarlos desde otro sitio,
 * así que si no hay red la app funciona igual y sube al recuperarla.
 */
export function useAuth({ state, onReplaceState }: UseAuthOptions): AuthApi {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const tokenRef = useRef<string | null>(readToken());
  const revisionRef = useRef<number>(0);
  // El estado cambia en cada tecleo; se lee desde una referencia para no
  // reprogramar la subida en cada pulsación.
  const stateRef = useRef(state);
  stateRef.current = state;

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    revisionRef.current = 0;
    writeToken(null);
    setAccount(null);
    setStatus('idle');
    setLastSyncedAt(null);
  }, []);

  /** Sube el estado actual; resuelve los conflictos quedándose con el servidor. */
  const push = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setStatus('syncing');
    try {
      const result = await api.pushState(token, stateRef.current, revisionRef.current);
      revisionRef.current = result.revision;
      setLastSyncedAt(result.updatedAt);
      setStatus('synced');
      setMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Otro dispositivo guardó algo más nuevo: gana lo remoto, porque
        // sobrescribirlo perdería entrenamientos ya registrados allí.
        const body = error.body as { revision?: number; state?: AppState } | undefined;
        if (body?.state) {
          revisionRef.current = body.revision ?? 0;
          onReplaceState(body.state);
          setStatus('synced');
          setMessage('Se han recuperado cambios más recientes de otro dispositivo.');
          return;
        }
      }
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        setMessage('La sesión ha caducado, vuelve a entrar.');
        return;
      }
      setStatus(error instanceof ApiError && error.status === 0 ? 'offline' : 'error');
      setMessage(
        error instanceof ApiError && error.status === 0
          ? 'Sin conexión con el servidor. Los datos se guardan en el dispositivo.'
          : error instanceof Error
            ? error.message
            : 'No se pudo sincronizar',
      );
    }
  }, [clearSession, onReplaceState]);

  /** Descarga el estado del servidor; si no hay nada, sube el local. */
  const pull = useCallback(
    async (token: string) => {
      setStatus('syncing');
      const remote = await api.pullState(token);
      revisionRef.current = remote.revision;
      if (remote.state) {
        onReplaceState(remote.state);
        setLastSyncedAt(remote.updatedAt);
        setStatus('synced');
      } else {
        // Cuenta nueva: se vuelca lo que ya hubiera en el dispositivo.
        await push();
      }
    },
    [onReplaceState, push],
  );

  // Al abrir la app se recupera la sesión guardada y se baja el estado.
  useEffect(() => {
    const token = tokenRef.current;
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { user } = await api.me(token);
        if (cancelled) return;
        setAccount(user);
        await pull(token);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
        } else {
          // Sin red: se sigue con la sesión y los datos locales.
          setStatus('offline');
          setMessage('Sin conexión con el servidor. Los datos se guardan en el dispositivo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar: la sesión se recupera una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subida automática con retardo: agrupa una ráfaga de cambios en una sola
  // petición en vez de llamar al servidor por cada serie registrada.
  useEffect(() => {
    if (!account || !tokenRef.current) return;
    const id = setTimeout(() => void push(), 2500);
    return () => clearTimeout(id);
  }, [state, account, push]);

  const authenticate = useCallback(
    async (mode: 'register' | 'login', username: string, password: string) => {
      const result = mode === 'register'
        ? await api.register(username, password)
        : await api.login(username, password);

      tokenRef.current = result.token;
      writeToken(result.token);
      setAccount(result.user);
      setMessage(null);

      if (mode === 'register') {
        // Cuenta recién creada: lo que ya haya en el dispositivo se sube tal
        // cual, que es justo lo que se espera al pasar de local a cuenta.
        revisionRef.current = 0;
        await push();
      } else {
        await pull(result.token);
      }
    },
    [pull, push],
  );

  return {
    account,
    loading,
    status,
    message,
    lastSyncedAt,
    register: (username, password) => authenticate('register', username, password),
    login: (username, password) => authenticate('login', username, password),
    logout: clearSession,
    deleteAccount: async () => {
      const token = tokenRef.current;
      if (!token) return;
      await api.deleteAccount(token);
      clearSession();
    },
    syncNow: push,
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInitialState, reducer, type AppState } from '../state/store';

const START = 1_700_000_000_000;

/** Estado con el cuestionario respondido, para entrar directo a la app. */
function configured(): AppState {
  return reducer(createInitialState(START), { type: 'profile/skip' });
}

/** Estado con un entrenamiento ya registrado. */
function withHistory(): AppState {
  return [
    { type: 'session/start' as const, dayId: 'day-1', now: START },
    {
      type: 'session/logSet' as const,
      exerciseId: 'bench-press',
      set: { weight: 100, reps: 8, rir: 1, technique: 'straight' as const, warmup: false },
      now: START + 1,
    },
    { type: 'session/finish' as const, now: START + 1000 },
  ].reduce(reducer, configured());
}

/**
 * Servidor simulado en memoria: replica el contrato de la API real para poder
 * probar el flujo completo sin levantar el backend.
 */
function mockServer() {
  const users = new Map<string, { id: number; password: string }>();
  const states = new Map<number, { state: unknown; revision: number; updatedAt: number }>();
  let nextId = 1;
  const calls: string[] = [];

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const userIdFrom = (init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
    const id = Number(auth.replace('Bearer token-', ''));
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(url.indexOf('/api'));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(`${init?.method ?? 'GET'} ${path}`);

    if (path === '/api/auth/register') {
      const key = String(body.username).toLowerCase();
      if (users.has(key)) return json(409, { error: 'Ese nombre de usuario ya está cogido' });
      const id = nextId++;
      users.set(key, { id, password: body.password });
      return json(201, { token: `token-${id}`, user: { id, username: body.username } });
    }

    if (path === '/api/auth/login') {
      const user = users.get(String(body.username).toLowerCase());
      if (!user || user.password !== body.password) {
        return json(401, { error: 'Usuario o contraseña incorrectos' });
      }
      return json(200, { token: `token-${user.id}`, user: { id: user.id, username: body.username } });
    }

    const id = userIdFrom(init);
    if (!id) return json(401, { error: 'Falta el token de sesión' });

    if (path === '/api/auth/me' && init?.method === 'DELETE') {
      states.delete(id);
      for (const [key, user] of users) if (user.id === id) users.delete(key);
      return new Response(null, { status: 204 });
    }
    if (path === '/api/auth/me') {
      const entry = [...users.entries()].find(([, u]) => u.id === id);
      if (!entry) return json(401, { error: 'Sesión no válida' });
      return json(200, { user: { id, username: entry[0] } });
    }

    if (path === '/api/state' && (init?.method ?? 'GET') === 'GET') {
      const stored = states.get(id);
      return json(200, stored ?? { state: null, revision: 0, updatedAt: null });
    }

    if (path === '/api/state' && init?.method === 'PUT') {
      const current = states.get(id);
      if (body.baseRevision !== undefined && current && current.revision !== body.baseRevision) {
        return json(409, { error: 'Hay cambios más recientes', ...current });
      }
      const saved = {
        state: body.state,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: START + 5000,
      };
      states.set(id, saved);
      return json(200, { revision: saved.revision, updatedAt: saved.updatedAt });
    }

    return json(404, { error: 'No encontrado' });
  });

  return { fetchMock, users, states, calls };
}

let server: ReturnType<typeof mockServer>;

beforeEach(() => {
  localStorage.clear();
  server = mockServer();
  vi.stubGlobal('fetch', server.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const goToSettings = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /AJUSTES/ }));

async function fillAccount(user: ReturnType<typeof userEvent.setup>, name: string, pass: string) {
  await user.type(screen.getByLabelText('Usuario'), name);
  await user.type(screen.getByLabelText('Contraseña'), pass);
}

describe('panel de cuenta', () => {
  it('se muestra en Ajustes y explica que sin cuenta todo es local', async () => {
    const user = userEvent.setup();
    render(<App initialState={configured()} />);
    await goToSettings(user);

    expect(screen.getByRole('heading', { name: /Mi cuenta/ })).toBeInTheDocument();
    expect(screen.getByText(/se guardan solo en este dispositivo/)).toBeInTheDocument();
  });

  it('exige usuario y contraseña con longitud mínima', async () => {
    const user = userEvent.setup();
    render(<App initialState={configured()} />);
    await goToSettings(user);

    const submit = screen.getByRole('button', { name: /Crear cuenta y subir/ });
    expect(submit).toBeDisabled();

    await fillAccount(user, 'en', 'corta');
    expect(submit).toBeDisabled();

    await user.clear(screen.getByLabelText('Usuario'));
    await user.clear(screen.getByLabelText('Contraseña'));
    await fillAccount(user, 'enrique', 'contrasena-larga');
    expect(submit).toBeEnabled();
  });

  it('avisa de cuántos entrenamientos se van a subir', async () => {
    const user = userEvent.setup();
    render(<App initialState={withHistory()} />);
    await goToSettings(user);

    expect(screen.getByText(/se subirán tus 1 entrenamientos/)).toBeInTheDocument();
  });

  it('avisa de que entrar sustituye los datos locales', async () => {
    const user = userEvent.setup();
    render(<App initialState={configured()} />);
    await goToSettings(user);

    await user.click(screen.getByRole('button', { name: /Ya tengo cuenta/ }));
    expect(screen.getByText(/sustituyen a los de este dispositivo/)).toBeInTheDocument();
  });
});

describe('crear cuenta', () => {
  it('vuelca los datos locales a la cuenta nueva', async () => {
    const user = userEvent.setup();
    render(<App initialState={withHistory()} />);
    await goToSettings(user);

    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y subir/ }));

    await waitFor(() => expect(screen.getByText('enrique')).toBeInTheDocument());
    // El entrenamiento que ya existía en el dispositivo está en el servidor.
    await waitFor(() => expect(server.states.size).toBe(1));
    const stored = [...server.states.values()][0].state as AppState;
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].exercises[0].exerciseId).toBe('bench-press');
  });

  it('muestra el error si el usuario ya existe', async () => {
    const user = userEvent.setup();
    server.users.set('enrique', { id: 99, password: 'otra' });
    render(<App initialState={configured()} />);
    await goToSettings(user);

    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y subir/ }));

    expect(await screen.findByText(/ya está cogido/)).toBeInTheDocument();
    // Sigue sin sesión: el formulario continúa visible.
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  it('avisa si el servidor no responde', async () => {
    const user = userEvent.setup();
    server.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<App initialState={configured()} />);
    await goToSettings(user);

    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y subir/ }));

    expect(await screen.findByText(/No se pudo contactar con el servidor/)).toBeInTheDocument();
  });
});

describe('entrar en una cuenta', () => {
  it('descarga los datos guardados en el servidor', async () => {
    const user = userEvent.setup();
    server.users.set('enrique', { id: 7, password: 'contrasena-larga' });
    const remote = reducer(configured(), { type: 'routine/rename', name: 'RUTINA DEL SERVIDOR' });
    server.states.set(7, { state: remote, revision: 3, updatedAt: START });

    render(<App initialState={configured()} />);
    await goToSettings(user);
    await user.click(screen.getByRole('button', { name: /Ya tengo cuenta/ }));
    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Entrar/ }));

    await waitFor(() => expect(screen.getByText('enrique')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /RUTINA/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('RUTINA DEL SERVIDOR');
  });

  it('rechaza credenciales incorrectas', async () => {
    const user = userEvent.setup();
    server.users.set('enrique', { id: 7, password: 'la-buena-de-verdad' });

    render(<App initialState={configured()} />);
    await goToSettings(user);
    await user.click(screen.getByRole('button', { name: /Ya tengo cuenta/ }));
    await fillAccount(user, 'enrique', 'la-equivocada');
    await user.click(screen.getByRole('button', { name: /Entrar/ }));

    expect(await screen.findByText(/Usuario o contraseña incorrectos/)).toBeInTheDocument();
  });

  it('sube el estado local si la cuenta está vacía', async () => {
    const user = userEvent.setup();
    server.users.set('enrique', { id: 7, password: 'contrasena-larga' });

    render(<App initialState={withHistory()} />);
    await goToSettings(user);
    await user.click(screen.getByRole('button', { name: /Ya tengo cuenta/ }));
    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Entrar/ }));

    await waitFor(() => expect(server.states.has(7)).toBe(true));
    const stored = server.states.get(7)!.state as AppState;
    expect(stored.history).toHaveLength(1);
  });
});

describe('sesión iniciada', () => {
  /** Crea una cuenta y deja la app con la sesión abierta. */
  async function signedIn(initial: AppState = configured()) {
    const user = userEvent.setup();
    render(<App initialState={initial} />);
    await goToSettings(user);
    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y subir/ }));
    await waitFor(() => expect(screen.getByText('enrique')).toBeInTheDocument());
    return user;
  }

  it('muestra el usuario y el estado de sincronización', async () => {
    await signedIn();
    expect(screen.getByText('Usuario')).toBeInTheDocument();
    expect(screen.getByText('Sincronización')).toBeInTheDocument();
    expect(await screen.findByText('Al día')).toBeInTheDocument();
  });

  it('permite forzar una sincronización', async () => {
    const user = await signedIn();
    const before = server.calls.filter((c) => c.startsWith('PUT /api/state')).length;
    await user.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));
    await waitFor(() =>
      expect(server.calls.filter((c) => c.startsWith('PUT /api/state')).length).toBeGreaterThan(before),
    );
  });

  it('cierra la sesión y vuelve al formulario', async () => {
    const user = await signedIn();
    await user.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(localStorage.getItem('ratafit:token')).toBeNull();
  });

  it('recupera la sesión al reabrir la app', async () => {
    const { unmount } = render(<App initialState={configured()} />);
    const user = userEvent.setup();
    await goToSettings(user);
    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Crear cuenta y subir/ }));
    await waitFor(() => expect(screen.getByText('enrique')).toBeInTheDocument());
    unmount();

    render(<App />);
    const user2 = userEvent.setup();
    await goToSettings(user2);
    expect(await screen.findByText('enrique')).toBeInTheDocument();
  });

  it('borra la cuenta solo tras confirmar', async () => {
    const user = await signedIn();

    await user.click(screen.getByRole('button', { name: /Borrar mi cuenta/ }));
    await user.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(screen.getByText('enrique')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Borrar mi cuenta/ }));
    await user.click(screen.getByRole('button', { name: /Sí, borrar la cuenta/ }));

    await waitFor(() => expect(screen.getByLabelText('Usuario')).toBeInTheDocument());
    expect(server.users.size).toBe(0);
  });

  it('conserva los datos del dispositivo al borrar la cuenta', async () => {
    const user = await signedIn(withHistory());
    await user.click(screen.getByRole('button', { name: /Borrar mi cuenta/ }));
    await user.click(screen.getByRole('button', { name: /Sí, borrar la cuenta/ }));

    await waitFor(() => expect(screen.getByLabelText('Usuario')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /PROGRESO/ }));
    expect(screen.getByRole('heading', { name: /Récords personales/ })).toBeInTheDocument();
  });

  it('marca la sesión en la cabecera', async () => {
    await signedIn();
    expect(screen.getByTitle(/Sesión de enrique/)).toBeInTheDocument();
  });
});

describe('conflictos entre dispositivos', () => {
  it('se queda con lo del servidor si otro dispositivo guardó algo más nuevo', async () => {
    const user = userEvent.setup();
    server.users.set('enrique', { id: 7, password: 'contrasena-larga' });
    server.states.set(7, { state: configured(), revision: 1, updatedAt: START });

    render(<App initialState={configured()} />);
    await goToSettings(user);
    await user.click(screen.getByRole('button', { name: /Ya tengo cuenta/ }));
    await fillAccount(user, 'enrique', 'contrasena-larga');
    await user.click(screen.getByRole('button', { name: /Entrar/ }));
    await waitFor(() => expect(screen.getByText('enrique')).toBeInTheDocument());

    // Otro dispositivo guarda mientras tanto: la revisión avanza.
    const newer = reducer(configured(), { type: 'routine/rename', name: 'DESDE EL MÓVIL' });
    server.states.set(7, { state: newer, revision: 9, updatedAt: START + 10 });

    await user.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));

    expect(await screen.findByText(/cambios más recientes de otro dispositivo/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /RUTINA/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('DESDE EL MÓVIL');
  });
});

import { useState, type FormEvent } from 'react';
import type { AuthApi } from '../state/useAuth';
import { Field, Panel } from './ui';

const STATUS_LABELS: Record<string, string> = {
  idle: 'Sin sincronizar',
  syncing: 'Sincronizando...',
  synced: 'Al día',
  offline: 'Sin conexión',
  error: 'Error al sincronizar',
};

export interface AccountPanelProps {
  auth: AuthApi;
  /** Número de entrenamientos guardados, para avisar de qué se va a subir. */
  sessionCount: number;
}

/**
 * Cuenta y sincronización. Sin cuenta la app funciona igual, en local; al
 * registrarse, lo que ya hay en el dispositivo se sube a la cuenta nueva.
 */
export function AccountPanel({ auth, sessionCount }: AccountPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await auth.register(username.trim(), password);
      else await auth.login(username.trim(), password);
      setPassword('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se pudo completar');
    } finally {
      setBusy(false);
    }
  };

  if (auth.account) {
    return (
      <Panel title="Mi cuenta">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat__value" style={{ fontSize: 15 }}>{auth.account.username}</div>
            <div className="stat__label">Usuario</div>
          </div>
          <div className="stat">
            <div className="stat__value" style={{ fontSize: 13 }}>
              {STATUS_LABELS[auth.status] ?? auth.status}
            </div>
            <div className="stat__label">Sincronización</div>
          </div>
        </div>

        {auth.lastSyncedAt && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Última copia en el servidor:{' '}
            {new Date(auth.lastSyncedAt).toLocaleString('es-ES', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        {auth.message && <div className="hint">{auth.message}</div>}

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn--sm"
            disabled={auth.status === 'syncing'}
            onClick={() => void auth.syncNow()}
          >
            ↻ Sincronizar ahora
          </button>
          <button type="button" className="btn btn--sm" onClick={auth.logout}>
            Cerrar sesión
          </button>
        </div>

        <div className="divider" />

        {confirmDelete ? (
          <>
            <div className="hint">
              Se borrará la cuenta y su copia del servidor. Los datos de este dispositivo se
              conservan, pero dejarán de sincronizarse. No se puede deshacer.
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={async () => {
                  await auth.deleteAccount();
                  setConfirmDelete(false);
                }}
              >
                Sí, borrar la cuenta
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => setConfirmDelete(true)}
          >
            Borrar mi cuenta del servidor
          </button>
        )}
      </Panel>
    );
  }

  return (
    <Panel title="Mi cuenta">
      <p className="muted" style={{ marginTop: 0 }}>
        Sin cuenta, los entrenamientos se guardan solo en este dispositivo. Con cuenta se copian al
        servidor y los tienes en el móvil y en el ordenador.
      </p>

      <div className="chip-row">
        <button
          type="button"
          className="chip chip--button"
          aria-pressed={mode === 'register'}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
        >
          Crear cuenta
        </button>
        <button
          type="button"
          className="chip chip--button"
          aria-pressed={mode === 'login'}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          Ya tengo cuenta
        </button>
      </div>

      <form onSubmit={submit}>
        <div style={{ marginTop: 10 }}>
          <Field label="Usuario" htmlFor="account-username">
            <input
              id="account-username"
              className="input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="Contraseña" htmlFor="account-password">
            <input
              id="account-password"
              className="input"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </div>

        {mode === 'register' && sessionCount > 0 && (
          <div className="hint hint--accent">
            Al crear la cuenta se subirán tus {sessionCount} entrenamientos y tu rutina actual.
          </div>
        )}

        {mode === 'login' && (
          <div className="hint">
            Al entrar se descargan los datos de la cuenta y sustituyen a los de este dispositivo. Si
            aquí tienes algo que no esté en la cuenta, exporta antes una copia.
          </div>
        )}

        {error && <div className="hint" style={{ borderLeftColor: 'var(--danger)' }}>{error}</div>}

        <button
          type="submit"
          className="btn btn--primary btn--block"
          style={{ marginTop: 10 }}
          disabled={busy || username.trim().length < 3 || password.length < 8}
        >
          {busy ? 'Un momento...' : mode === 'register' ? '✓ Crear cuenta y subir mis datos' : '→ Entrar'}
        </button>

        <p className="muted" style={{ marginBottom: 0 }}>
          El usuario necesita 3 caracteres o más; la contraseña, 8 o más.
        </p>
      </form>
    </Panel>
  );
}

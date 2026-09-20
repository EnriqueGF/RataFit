import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import type { AppState } from './state/store';
import { TodayScreen } from './components/TodayScreen';
import { WorkoutScreen } from './components/WorkoutScreen';
import { RoutineScreen } from './components/RoutineScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { formatSeconds, useRestTimer } from './hooks/useRestTimer';
import { elapsedMs, formatDuration, phaseForWeek } from './domain/training';
import { useTicker } from './hooks/useTicker';
import { useAuth } from './state/useAuth';

export type Tab = 'today' | 'workout' | 'routine' | 'progress' | 'settings';

const TABS: Array<{ id: Tab; label: string; glyph: string }> = [
  { id: 'today', label: 'Hoy', glyph: '⊞' },
  { id: 'workout', label: 'Entreno', glyph: '🏋' },
  { id: 'routine', label: 'Rutina', glyph: '☰' },
  { id: 'progress', label: 'Progreso', glyph: '📈' },
  { id: 'settings', label: 'Ajustes', glyph: '⚙' },
];

const PHASE_SHORT: Record<string, string> = {
  accumulation: 'ACUM',
  intensification: 'INTENS',
  peak: 'PICO',
  deload: 'DESCARGA',
};

function Shell() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const auth = useAuth({
    state,
    onReplaceState: (next) => dispatch({ type: 'state/replace', state: next }),
  });
  const rest = useRestTimer({
    sound: state.settings.soundEnabled,
    vibration: state.settings.vibrationEnabled,
  });

  const sessionRunning = state.active?.status === 'running';
  const now = useTicker(sessionRunning);

  // El título del documento refleja el cronómetro: útil con la app en segundo
  // plano o instalada como PWA.
  useEffect(() => {
    if (!state.active) {
      document.title = 'RataFit';
      return;
    }
    const time = formatDuration(elapsedMs(state.active, now));
    document.title = `${sessionRunning ? '▶' : '⏸'} ${time} · RataFit`;
  }, [state.active, now, sessionRunning]);

  const resting = rest.running || rest.done;

  // Sin perfil todavía: primero el cuestionario, para no imponer una rutina
  // con material que quizá no haya en el gimnasio.
  if (!state.profile) {
    return (
      <div className="app app--onboarding">
        <header className="topbar">
          <h1 className="topbar__brand">RataFit</h1>
          <span className="badge badge--quiet">CONFIGURACIÓN INICIAL</span>
        </header>
        <main className="app__main">
          <OnboardingScreen
            initialProfile={state.lastProfile}
            onFinish={(profile) => dispatch({ type: 'profile/apply', profile })}
            onSkip={() => dispatch({ type: 'profile/skip' })}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`app${resting ? ' app--resting' : ''}`}>
      <header className="topbar">
        <h1 className="topbar__brand">RataFit</h1>
        <div className="topbar__meta">
          {auth.account && (
            <span className="badge badge--quiet" title={`Sesión de ${auth.account.username}`}>
              {auth.status === 'offline' ? '☁✕' : auth.status === 'syncing' ? '☁↻' : '☁'}{' '}
              {auth.account.username}
            </span>
          )}
          {state.active ? (
            <span className="badge">
              {sessionRunning ? '▶' : '⏸'} {formatDuration(elapsedMs(state.active, now))}
            </span>
          ) : (
            <span className="badge badge--quiet">
              SEM {state.mesocycle.week}/{state.mesocycle.lengthWeeks} ·{' '}
              {PHASE_SHORT[phaseForWeek(state.mesocycle)]}
            </span>
          )}
        </div>
      </header>

      <main className="app__main">
        {tab === 'today' && <TodayScreen onStarted={() => setTab('workout')} />}
        {tab === 'workout' && <WorkoutScreen rest={rest} />}
        {tab === 'routine' && <RoutineScreen />}
        {tab === 'progress' && <ProgressScreen />}
        {tab === 'settings' && <SettingsScreen auth={auth} />}
      </main>

      {resting && (
        <div className={`rest-bar${rest.done ? ' rest-bar--done' : ''}`} role="status">
          <span className="rest-bar__value">
            {rest.done ? '¡YA!' : formatSeconds(rest.remaining)}
          </span>
          <span className="rest-bar__track">
            <span
              className="rest-bar__fill"
              style={{ width: `${rest.total > 0 ? (rest.remaining / rest.total) * 100 : 0}%` }}
            />
          </span>
          <button type="button" className="btn btn--sm" onClick={() => rest.adjust(30)}>
            +30s
          </button>
          <button type="button" className="btn btn--sm" onClick={rest.stop}>
            ✕
          </button>
        </div>
      )}

      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tabbar__item"
            // Etiqueta explícita: el rótulo visible ("Entreno") aparece también
            // en botones como "Empezar entreno" y las búsquedas se confundirían.
            aria-label={`Ir a ${item.label}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <span className="tabbar__glyph" aria-hidden="true">
              {item.glyph}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App({ initialState }: { initialState?: AppState } = {}) {
  return (
    <AppProvider initialState={initialState}>
      <Shell />
    </AppProvider>
  );
}

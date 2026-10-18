import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { type Action, type AppState, loadState, normalizeTrainingState, reducer, saveState } from './store';

interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function AppProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  /** Estado inicial explícito; en los tests evita depender de localStorage. */
  initialState?: AppState;
}) {
  const [state, dispatch] = useReducer(reducer, initialState, (given) => given ? normalizeTrainingState(given) : loadState(storage()));

  // Cada cambio se persiste: si el móvil mata la app a mitad de sesión, al
  // volver a abrirla el entrenamiento sigue donde estaba.
  useEffect(() => {
    saveState(storage(), state);
  }, [state]);

  // La semana del mesociclo avanza por calendario: se comprueba al abrir y al
  // volver a la app, que puede quedarse días abierta en segundo plano.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') dispatch({ type: 'mesocycle/sync' });
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp debe usarse dentro de <AppProvider>');
  return context;
}

import type {
  LoggedSet,
  MesocycleState,
  MuscleGroup,
  Routine,
  RoutineDay,
  RoutineExercise,
  SessionExercise,
  Weekday,
  WorkoutSession,
} from '../domain/types';
import { EXERCISE_BY_ID } from '../data/exercises';
import { buildPrescriptions } from '../domain/training';
import { createDefaultRoutine, defaultRoutineExercise } from '../domain/routineBuilder';
import { DEFAULT_PROFILE, buildRoutineFromProfile, type GymProfile } from '../domain/onboarding';

export interface Settings {
  /** Unidad de peso; la app guarda siempre kg y convierte al mostrar. */
  unit: 'kg' | 'lb';
  /** Segundos de descanso por defecto si el ejercicio no define otro. */
  defaultRestSeconds: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /** Arranca el cronómetro de descanso al registrar una serie. */
  autoStartRest: boolean;
  bodyweight: number | null;
}

export interface AppState {
  routine: Routine;
  /** Respuestas del cuestionario inicial; null si aún no se ha hecho. */
  profile: GymProfile | null;
  /** Últimas respuestas dadas, para precargarlas al rehacer el cuestionario. */
  lastProfile: GymProfile | null;
  /** Sesiones terminadas, de la más reciente a la más antigua. */
  history: WorkoutSession[];
  /** Sesión en curso (o pausada); null si no hay ninguna. */
  active: WorkoutSession | null;
  mesocycle: MesocycleState;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  defaultRestSeconds: 120,
  soundEnabled: true,
  vibrationEnabled: true,
  autoStartRest: true,
  bodyweight: null,
};

export function createInitialState(now = Date.now()): AppState {
  return {
    routine: createDefaultRoutine(now),
    profile: null,
    lastProfile: null,
    history: [],
    active: null,
    mesocycle: { startedAt: now, week: 1, lengthWeeks: 5 },
    settings: DEFAULT_SETTINGS,
  };
}

export type Action =
  // Sesión
  | { type: 'session/start'; dayId: string; now?: number; force?: boolean }
  | { type: 'session/pause'; now?: number }
  | { type: 'session/resume'; now?: number }
  | { type: 'session/finish'; now?: number }
  | { type: 'session/discard' }
  | { type: 'session/logSet'; exerciseId: string; set: Omit<LoggedSet, 'id' | 'completedAt'>; now?: number }
  | { type: 'session/editSet'; exerciseId: string; setId: string; patch: Partial<LoggedSet> }
  | { type: 'session/deleteSet'; exerciseId: string; setId: string }
  | { type: 'session/skipExercise'; exerciseId: string; skipped: boolean }
  | { type: 'session/swapExercise'; fromId: string; toId: string }
  | { type: 'session/addExercise'; exerciseId: string }
  | { type: 'session/note'; exerciseId?: string; note: string }
  // Rutina
  | { type: 'routine/rename'; name: string }
  | { type: 'routine/addDay'; name: string }
  | { type: 'routine/removeDay'; dayId: string }
  | { type: 'routine/renameDay'; dayId: string; name: string }
  | { type: 'routine/setWeekday'; dayId: string; weekday: Weekday | null }
  | { type: 'routine/addExercise'; dayId: string; exerciseId: string }
  | { type: 'routine/swapExercise'; dayId: string; index: number; exerciseId: string }
  | { type: 'routine/removeExercise'; dayId: string; index: number }
  | { type: 'routine/updateExercise'; dayId: string; index: number; patch: Partial<RoutineExercise> }
  | { type: 'routine/moveExercise'; dayId: string; from: number; to: number }
  | { type: 'routine/setPriorities'; priorities: MuscleGroup[] }
  | { type: 'routine/reset' }
  // Cuestionario inicial
  | { type: 'profile/apply'; profile: GymProfile; now?: number }
  | { type: 'profile/skip' }
  | { type: 'profile/reopen' }
  // Mesociclo y ajustes
  | { type: 'mesocycle/advance'; now?: number }
  | { type: 'mesocycle/set'; week: number; lengthWeeks?: number }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'state/replace'; state: AppState };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    // ───────────────────────────── Sesión ─────────────────────────────────
    case 'session/start': {
      const day = state.routine.days.find((d) => d.id === action.dayId);
      if (!day) return state;
      const now = action.now ?? Date.now();
      // Empezar otra sesión no puede tirar el trabajo ya registrado: la que
      // estaba en curso se archiva, salvo que esté vacía.
      const previous = state.active;
      const hasWork = previous ? previous.exercises.some((e) => e.loggedSets.length > 0) : false;
      if (previous && hasWork && !action.force) return state;
      const history =
        previous && hasWork ? [finishSession(previous, now), ...state.history] : state.history;
      return { ...state, history, active: buildSession({ ...state, history }, day, now) };
    }

    case 'session/pause': {
      const { active } = state;
      if (!active || active.status !== 'running') return state;
      const now = action.now ?? Date.now();
      const accumulatedMs = active.accumulatedMs + Math.max(0, now - (active.resumedAt ?? now));
      return { ...state, active: { ...active, status: 'paused', accumulatedMs, resumedAt: null } };
    }

    case 'session/resume': {
      const { active } = state;
      if (!active || active.status !== 'paused') return state;
      const now = action.now ?? Date.now();
      return { ...state, active: { ...active, status: 'running', resumedAt: now } };
    }

    case 'session/finish': {
      const { active } = state;
      if (!active) return state;
      const now = action.now ?? Date.now();
      return { ...state, active: null, history: [finishSession(active, now), ...state.history] };
    }

    case 'session/discard':
      return { ...state, active: null };

    case 'session/logSet': {
      const now = action.now ?? Date.now();
      const set: LoggedSet = {
        ...action.set,
        id: `set-${now}-${Math.random().toString(36).slice(2, 8)}`,
        completedAt: now,
      };
      return updateSessionExercise(state, action.exerciseId, (e) => ({
        ...e,
        loggedSets: [...e.loggedSets, set],
      }));
    }

    case 'session/editSet':
      return updateSessionExercise(state, action.exerciseId, (e) => ({
        ...e,
        loggedSets: e.loggedSets.map((s) => (s.id === action.setId ? { ...s, ...action.patch } : s)),
      }));

    case 'session/deleteSet':
      return updateSessionExercise(state, action.exerciseId, (e) => ({
        ...e,
        loggedSets: e.loggedSets.filter((s) => s.id !== action.setId),
      }));

    case 'session/skipExercise':
      return updateSessionExercise(state, action.exerciseId, (e) => ({ ...e, skipped: action.skipped }));

    case 'session/swapExercise': {
      const { active } = state;
      if (!active || !EXERCISE_BY_ID[action.toId]) return state;
      const routineDay = state.routine.days.find((d) => d.id === active.dayId);
      const routineExercise =
        routineDay?.exercises.find((e) => e.exerciseId === action.fromId) ??
        defaultRoutineExercise(action.toId);
      return {
        ...state,
        active: {
          ...active,
          exercises: active.exercises.map((e) =>
            e.exerciseId === action.fromId
              ? buildSessionExercise(state, { ...routineExercise, exerciseId: action.toId })
              : e,
          ),
        },
      };
    }

    case 'session/addExercise': {
      const { active } = state;
      if (!active || !EXERCISE_BY_ID[action.exerciseId]) return state;
      if (active.exercises.some((e) => e.exerciseId === action.exerciseId)) return state;
      return {
        ...state,
        active: {
          ...active,
          exercises: [
            ...active.exercises,
            buildSessionExercise(state, defaultRoutineExercise(action.exerciseId)),
          ],
        },
      };
    }

    case 'session/note': {
      const { active } = state;
      if (!active) return state;
      if (!action.exerciseId) return { ...state, active: { ...active, notes: action.note } };
      return updateSessionExercise(state, action.exerciseId, (e) => ({ ...e, notes: action.note }));
    }

    // ───────────────────────────── Rutina ─────────────────────────────────
    case 'routine/rename':
      return withRoutine(state, (r) => ({ ...r, name: action.name }));

    case 'routine/addDay':
      return withRoutine(state, (r) => ({
        ...r,
        days: [...r.days, { id: uniqueDayId(r.days), name: action.name, weekday: null, exercises: [] }],
      }));

    case 'routine/removeDay':
      return withRoutine(state, (r) => ({ ...r, days: r.days.filter((d) => d.id !== action.dayId) }));

    case 'routine/renameDay':
      return withDay(state, action.dayId, (d) => ({ ...d, name: action.name }));

    case 'routine/setWeekday':
      // Un día de la semana solo puede tener una sesión asignada.
      return withRoutine(state, (r) => ({
        ...r,
        days: r.days.map((d) => {
          if (d.id === action.dayId) return { ...d, weekday: action.weekday };
          if (action.weekday !== null && d.weekday === action.weekday) return { ...d, weekday: null };
          return d;
        }),
      }));

    case 'routine/addExercise': {
      if (!EXERCISE_BY_ID[action.exerciseId]) return state;
      return withDay(state, action.dayId, (d) =>
        d.exercises.some((e) => e.exerciseId === action.exerciseId)
          ? d
          : { ...d, exercises: [...d.exercises, defaultRoutineExercise(action.exerciseId)] },
      );
    }

    case 'routine/swapExercise': {
      if (!EXERCISE_BY_ID[action.exerciseId]) return state;
      return withDay(state, action.dayId, (d) => {
        if (action.index < 0 || action.index >= d.exercises.length) return d;
        if (
          d.exercises.some(
            (exercise, index) =>
              index !== action.index && exercise.exerciseId === action.exerciseId,
          )
        ) {
          return d;
        }
        return {
          ...d,
          exercises: d.exercises.map((exercise, index) =>
            index === action.index
              ? { ...exercise, exerciseId: action.exerciseId }
              : exercise,
          ),
        };
      });
    }

    case 'routine/removeExercise':
      return withDay(state, action.dayId, (d) => ({
        ...d,
        exercises: d.exercises.filter((_, i) => i !== action.index),
      }));

    case 'routine/updateExercise':
      return withDay(state, action.dayId, (d) => ({
        ...d,
        exercises: d.exercises.map((e, i) => (i === action.index ? { ...e, ...action.patch } : e)),
      }));

    case 'routine/moveExercise':
      return withDay(state, action.dayId, (d) => {
        const { from, to } = action;
        if (from === to || from < 0 || to < 0 || from >= d.exercises.length || to >= d.exercises.length) {
          return d;
        }
        const exercises = [...d.exercises];
        const [moved] = exercises.splice(from, 1);
        exercises.splice(to, 0, moved);
        return { ...d, exercises };
      });

    case 'routine/setPriorities':
      return withRoutine(state, (r) => ({ ...r, priorities: action.priorities }));

    case 'routine/reset':
      return { ...state, routine: createDefaultRoutine() };

    case 'profile/apply': {
      const now = action.now ?? Date.now();
      // Cambiar la rutina a mitad de sesión dejaría la sesión activa apuntando
      // a ejercicios que ya no existen, así que se descarta.
      return {
        ...state,
        profile: action.profile,
        lastProfile: action.profile,
        routine: buildRoutineFromProfile(action.profile, now),
        active: null,
      };
    }

    case 'profile/skip': {
      // Se acepta la plantilla por defecto sin pasar por el cuestionario.
      const profile = { ...DEFAULT_PROFILE };
      return { ...state, profile, lastProfile: state.lastProfile ?? profile };
    }

    case 'profile/reopen':
      // Vuelve al cuestionario sin tocar el histórico ni los récords.
      return { ...state, profile: null };

    // ──────────────────────── Mesociclo y ajustes ─────────────────────────
    case 'mesocycle/advance': {
      const now = action.now ?? Date.now();
      const { mesocycle } = state;
      return {
        ...state,
        mesocycle:
          mesocycle.week >= mesocycle.lengthWeeks
            ? { startedAt: now, week: 1, lengthWeeks: mesocycle.lengthWeeks }
            : { ...mesocycle, week: mesocycle.week + 1 },
      };
    }

    case 'mesocycle/set':
      return {
        ...state,
        mesocycle: {
          ...state.mesocycle,
          lengthWeeks: Math.max(2, action.lengthWeeks ?? state.mesocycle.lengthWeeks),
          week: Math.min(
            Math.max(1, action.week),
            Math.max(2, action.lengthWeeks ?? state.mesocycle.lengthWeeks),
          ),
        },
      };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'state/replace':
      return action.state;

    default:
      return state;
  }
}

// ─────────────────────────────── Auxiliares ─────────────────────────────────

/** Cierra una sesión: congela el tiempo y descarta los ejercicios sin trabajo. */
function finishSession(session: WorkoutSession, now: number): WorkoutSession {
  const accumulatedMs =
    session.status === 'running'
      ? session.accumulatedMs + Math.max(0, now - (session.resumedAt ?? now))
      : session.accumulatedMs;
  return {
    ...session,
    status: 'finished',
    finishedAt: now,
    accumulatedMs,
    resumedAt: null,
    exercises: session.exercises.filter((e) => e.loggedSets.length > 0),
  };
}

/**
 * Identificador de día libre. Date.now() por sí solo colisiona si se añaden
 * dos días en el mismo milisegundo, y entonces editar o borrar uno afectaría
 * a los dos.
 */
function uniqueDayId(days: RoutineDay[]): string {
  const taken = new Set(days.map((d) => d.id));
  const base = Date.now().toString(36);
  let candidate = `day-${base}`;
  let suffix = 0;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `day-${base}-${suffix}`;
  }
  return candidate;
}

function withRoutine(state: AppState, fn: (r: Routine) => Routine): AppState {
  return { ...state, routine: { ...fn(state.routine), updatedAt: Date.now() } };
}

function withDay(state: AppState, dayId: string, fn: (d: RoutineDay) => RoutineDay): AppState {
  return withRoutine(state, (r) => ({
    ...r,
    days: r.days.map((d) => (d.id === dayId ? fn(d) : d)),
  }));
}

function updateSessionExercise(
  state: AppState,
  exerciseId: string,
  fn: (e: SessionExercise) => SessionExercise,
): AppState {
  const { active } = state;
  if (!active) return state;
  return {
    ...state,
    active: {
      ...active,
      exercises: active.exercises.map((e) => (e.exerciseId === exerciseId ? fn(e) : e)),
    },
  };
}

/** Series registradas de un ejercicio en la sesión más reciente que lo incluyó. */
export function lastSetsFor(history: WorkoutSession[], exerciseId: string): LoggedSet[] {
  for (const session of history) {
    const found = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (found && found.loggedSets.length > 0) return found.loggedSets;
  }
  return [];
}

function buildSessionExercise(state: AppState, routineExercise: RoutineExercise): SessionExercise {
  const exercise = EXERCISE_BY_ID[routineExercise.exerciseId];
  const history = lastSetsFor(state.history, routineExercise.exerciseId);
  const prescriptions = exercise
    ? buildPrescriptions({ exercise, routineExercise, history, mesocycle: state.mesocycle }).sets
    : [];
  return {
    exerciseId: routineExercise.exerciseId,
    prescriptions,
    loggedSets: [],
    supersetGroup: routineExercise.supersetGroup,
    skipped: false,
  };
}

function buildSession(state: AppState, day: RoutineDay, now: number): WorkoutSession {
  return {
    id: `session-${now}`,
    routineId: state.routine.id,
    dayId: day.id,
    dayName: day.name,
    startedAt: now,
    finishedAt: null,
    status: 'running',
    accumulatedMs: 0,
    resumedAt: now,
    exercises: day.exercises.map((re) => buildSessionExercise(state, re)),
    bodyweight: state.settings.bodyweight ?? undefined,
  };
}

// ───────────────────────────── Persistencia ─────────────────────────────────

// La clave mantiene el nombre original a propósito: renombrarla dejaría
// inaccesible el histórico ya guardado en un dispositivo con la versión previa.
export const STORAGE_KEY = 'iron-terminal:v1';

/** Serializa el estado; se usa también para exportar una copia de seguridad. */
export function serialize(state: AppState): string {
  return JSON.stringify({ version: 1, state });
}

/**
 * Lee el estado guardado. Cualquier dato corrupto o de una versión distinta se
 * descarta y se parte del estado inicial: es preferible perder la caché a
 * arrancar la app en un estado inconsistente.
 */
export function deserialize(raw: string | null, now = Date.now()): AppState {
  if (!raw) return createInitialState(now);
  try {
    const parsed = JSON.parse(raw) as { version?: number; state?: Partial<AppState> };
    if (parsed.version !== 1 || !parsed.state) return createInitialState(now);
    const initial = createInitialState(now);
    const { routine, history, active, mesocycle, settings } = parsed.state;
    if (!isValidRoutine(routine)) return initial;
    return {
      routine,
      profile: parsed.state.profile ?? null,
      lastProfile: parsed.state.lastProfile ?? parsed.state.profile ?? null,
      history: Array.isArray(history) ? history.filter(isValidSession) : [],
      active: restoreActiveSession(active, now),
      mesocycle: mesocycle ?? initial.mesocycle,
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    };
  } catch {
    return createInitialState(now);
  }
}

/**
 * Comprueba la forma de la rutina importada. Sin esto, un archivo con días sin
 * `exercises` pasaría el filtro y rompería el render, dejando la app inservible
 * porque el estado corrupto ya se habría persistido.
 */
function isValidRoutine(routine: unknown): routine is Routine {
  if (!routine || typeof routine !== 'object') return false;
  const candidate = routine as Routine;
  if (typeof candidate.id !== 'string' || !Array.isArray(candidate.days)) return false;
  return candidate.days.every(
    (day) =>
      day &&
      typeof day.id === 'string' &&
      Array.isArray(day.exercises) &&
      day.exercises.every((e) => e && typeof e.exerciseId === 'string'),
  );
}

function isValidSession(session: unknown): session is WorkoutSession {
  if (!session || typeof session !== 'object') return false;
  const candidate = session as WorkoutSession;
  return (
    typeof candidate.id === 'string' &&
    Array.isArray(candidate.exercises) &&
    candidate.exercises.every((e) => e && Array.isArray(e.loggedSets))
  );
}

/**
 * Recupera la sesión en curso. Una sesión guardada como 'running' seguiría
 * contando contra el reloj mientras la app estuvo cerrada, así que al volver
 * se restaura en pausa con el tiempo que llevaba.
 */
function restoreActiveSession(active: unknown, now: number): WorkoutSession | null {
  if (!isValidSession(active)) return null;
  if (active.status !== 'running') return active;
  const elapsed = active.resumedAt !== null ? Math.max(0, now - active.resumedAt) : 0;
  // Un hueco enorme significa que la app estuvo cerrada, no entrenando.
  const credited = Math.min(elapsed, 10 * 60 * 1000);
  return {
    ...active,
    status: 'paused',
    accumulatedMs: active.accumulatedMs + credited,
    resumedAt: null,
  };
}

export function loadState(storage: Storage | undefined, now = Date.now()): AppState {
  if (!storage) return createInitialState(now);
  try {
    return deserialize(storage.getItem(STORAGE_KEY), now);
  } catch {
    return createInitialState(now);
  }
}

export function saveState(storage: Storage | undefined, state: AppState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Cuota llena o modo privado: la app sigue funcionando en memoria.
  }
}

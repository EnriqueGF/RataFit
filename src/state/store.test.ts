import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  createInitialState,
  deserialize,
  lastSetsFor,
  loadState,
  reducer,
  saveState,
  serialize,
  type AppState,
} from './store';
import type { LoggedSet, WorkoutSession } from '../domain/types';

const START = 1_700_000_000_000;

function initial(): AppState {
  return createInitialState(START);
}

/** Aplica una lista de acciones sobre el estado inicial. */
function run(actions: Parameters<typeof reducer>[1][], from: AppState = initial()): AppState {
  return actions.reduce(reducer, from);
}

const logged = (overrides: Partial<LoggedSet> = {}): Omit<LoggedSet, 'id' | 'completedAt'> => ({
  reps: 8,
  weight: 60,
  rir: 2,
  technique: 'straight',
  warmup: false,
  ...overrides,
});

describe('estado inicial', () => {
  it('arranca con la rutina fullbody de tres días y sin sesión activa', () => {
    const state = initial();
    expect(state.routine.days).toHaveLength(3);
    expect(state.active).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.mesocycle).toEqual({ startedAt: START, week: 1, lengthWeeks: 5 });
  });

  it('prioriza pecho y espalda', () => {
    expect(initial().routine.priorities).toEqual(['chest', 'back']);
  });
});

describe('ciclo de vida de la sesión', () => {
  it('crea la sesión con las prescripciones de cada ejercicio del día', () => {
    const state = run([{ type: 'session/start', dayId: 'day-1', now: START }]);
    expect(state.active).not.toBeNull();
    expect(state.active!.status).toBe('running');
    expect(state.active!.dayId).toBe('day-1');
    expect(state.active!.exercises).toHaveLength(
      initial().routine.days[0].exercises.length,
    );
    expect(state.active!.exercises[0].prescriptions.length).toBeGreaterThan(0);
  });

  it('ignora un día inexistente', () => {
    const state = run([{ type: 'session/start', dayId: 'no-existe' }]);
    expect(state.active).toBeNull();
  });

  it('acumula el tiempo al pausar y lo congela hasta reanudar', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/pause', now: START + 60_000 },
    ]);
    expect(state.active!.status).toBe('paused');
    expect(state.active!.accumulatedMs).toBe(60_000);
    expect(state.active!.resumedAt).toBeNull();
  });

  it('suma los tramos tras reanudar', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/pause', now: START + 60_000 },
      { type: 'session/resume', now: START + 300_000 },
      { type: 'session/pause', now: START + 330_000 },
    ]);
    expect(state.active!.accumulatedMs).toBe(90_000);
  });

  it('no hace nada al pausar dos veces o reanudar una sesión en marcha', () => {
    const paused = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/pause', now: START + 1_000 },
    ]);
    expect(reducer(paused, { type: 'session/pause', now: START + 5_000 })).toBe(paused);
    expect(reducer(paused, { type: 'session/resume', now: START + 5_000 }).active!.status).toBe('running');

    const running = run([{ type: 'session/start', dayId: 'day-1', now: START }]);
    expect(reducer(running, { type: 'session/resume', now: START + 10 })).toBe(running);
  });

  it('archiva la sesión al terminar y deja solo los ejercicios trabajados', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged(), now: START + 1_000 },
      { type: 'session/finish', now: START + 3_600_000 },
    ]);
    expect(state.active).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].status).toBe('finished');
    expect(state.history[0].accumulatedMs).toBe(3_600_000);
    expect(state.history[0].exercises).toHaveLength(1);
    expect(state.history[0].exercises[0].exerciseId).toBe('bench-press');
  });

  it('respeta el tiempo acumulado si se termina estando en pausa', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/pause', now: START + 60_000 },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged() },
      { type: 'session/finish', now: START + 999_999 },
    ]);
    expect(state.history[0].accumulatedMs).toBe(60_000);
  });

  it('guarda las sesiones de la más reciente a la más antigua', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged() },
      { type: 'session/finish', now: START + 1_000 },
      { type: 'session/start', dayId: 'day-2', now: START + 2_000 },
      { type: 'session/logSet', exerciseId: 'weighted-pullup', set: logged() },
      { type: 'session/finish', now: START + 3_000 },
    ]);
    expect(state.history.map((s) => s.dayId)).toEqual(['day-2', 'day-1']);
  });

  it('descarta la sesión sin guardarla en el histórico', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged() },
      { type: 'session/discard' },
    ]);
    expect(state.active).toBeNull();
    expect(state.history).toHaveLength(0);
  });

  it('ignora finalizar o pausar sin sesión activa', () => {
    const base = initial();
    expect(reducer(base, { type: 'session/finish' })).toBe(base);
    expect(reducer(base, { type: 'session/pause' })).toBe(base);
    expect(reducer(base, { type: 'session/logSet', exerciseId: 'bench-press', set: logged() })).toBe(base);
  });
});

describe('registro de series', () => {
  const started = () => run([{ type: 'session/start', dayId: 'day-1', now: START }]);

  it('añade la serie con identificador y marca de tiempo', () => {
    const state = reducer(started(), {
      type: 'session/logSet',
      exerciseId: 'bench-press',
      set: logged({ reps: 10, weight: 80 }),
      now: START + 5_000,
    });
    const sets = state.active!.exercises[0].loggedSets;
    expect(sets).toHaveLength(1);
    expect(sets[0].completedAt).toBe(START + 5_000);
    expect(sets[0].id).toBeTruthy();
    expect(sets[0].weight).toBe(80);
  });

  it('edita y borra series por identificador', () => {
    const withSet = reducer(started(), {
      type: 'session/logSet',
      exerciseId: 'bench-press',
      set: logged(),
      now: START + 1,
    });
    const setId = withSet.active!.exercises[0].loggedSets[0].id;

    const edited = reducer(withSet, {
      type: 'session/editSet',
      exerciseId: 'bench-press',
      setId,
      patch: { reps: 12 },
    });
    expect(edited.active!.exercises[0].loggedSets[0].reps).toBe(12);

    const deleted = reducer(edited, { type: 'session/deleteSet', exerciseId: 'bench-press', setId });
    expect(deleted.active!.exercises[0].loggedSets).toHaveLength(0);
  });

  it('marca y desmarca un ejercicio como saltado', () => {
    const skipped = reducer(started(), {
      type: 'session/skipExercise',
      exerciseId: 'bench-press',
      skipped: true,
    });
    expect(skipped.active!.exercises[0].skipped).toBe(true);
    const restored = reducer(skipped, {
      type: 'session/skipExercise',
      exerciseId: 'bench-press',
      skipped: false,
    });
    expect(restored.active!.exercises[0].skipped).toBe(false);
  });

  it('guarda notas de sesión y de ejercicio por separado', () => {
    const state = run(
      [
        { type: 'session/note', note: 'Dormí mal' },
        { type: 'session/note', exerciseId: 'bench-press', note: 'Hombro tocado' },
      ],
      started(),
    );
    expect(state.active!.notes).toBe('Dormí mal');
    expect(state.active!.exercises[0].notes).toBe('Hombro tocado');
  });
});

describe('cambios de ejercicio en caliente', () => {
  const started = () => run([{ type: 'session/start', dayId: 'day-1', now: START }]);

  it('sustituye un ejercicio conservando su posición y prescripción', () => {
    const state = reducer(started(), {
      type: 'session/swapExercise',
      fromId: 'bench-press',
      toId: 'db-bench-press',
    });
    expect(state.active!.exercises[0].exerciseId).toBe('db-bench-press');
    expect(state.active!.exercises[0].loggedSets).toHaveLength(0);
    expect(state.active!.exercises[0].prescriptions.length).toBeGreaterThan(0);
  });

  it('rechaza sustituir por un ejercicio desconocido', () => {
    const base = started();
    expect(reducer(base, { type: 'session/swapExercise', fromId: 'bench-press', toId: 'nope' })).toBe(base);
  });

  it('añade un ejercicio extra pero no lo duplica', () => {
    const added = reducer(started(), { type: 'session/addExercise', exerciseId: 'hip-thrust' });
    expect(added.active!.exercises.map((e) => e.exerciseId)).toContain('hip-thrust');
    expect(reducer(added, { type: 'session/addExercise', exerciseId: 'hip-thrust' })).toBe(added);
  });
});

describe('edición de la rutina', () => {
  it('renombra la rutina y los días', () => {
    const state = run([
      { type: 'routine/rename', name: 'MI PLAN' },
      { type: 'routine/renameDay', dayId: 'day-1', name: 'LUNES BRUTAL' },
    ]);
    expect(state.routine.name).toBe('MI PLAN');
    expect(state.routine.days[0].name).toBe('LUNES BRUTAL');
  });

  it('añade y elimina días', () => {
    const added = reducer(initial(), { type: 'routine/addDay', name: 'DÍA D' });
    expect(added.routine.days).toHaveLength(4);
    const removed = reducer(added, { type: 'routine/removeDay', dayId: 'day-1' });
    expect(removed.routine.days.map((d) => d.id)).not.toContain('day-1');
  });

  it('libera el día de la semana si ya estaba ocupado por otra sesión', () => {
    // day-1 está en lunes (1) y day-2 en miércoles (3).
    const state = reducer(initial(), { type: 'routine/setWeekday', dayId: 'day-2', weekday: 1 });
    expect(state.routine.days.find((d) => d.id === 'day-2')!.weekday).toBe(1);
    expect(state.routine.days.find((d) => d.id === 'day-1')!.weekday).toBeNull();
  });

  it('permite dejar un día sin asignar para entrenarlo cuando se quiera', () => {
    const state = reducer(initial(), { type: 'routine/setWeekday', dayId: 'day-1', weekday: null });
    expect(state.routine.days[0].weekday).toBeNull();
    // Los demás días conservan su asignación.
    expect(state.routine.days[1].weekday).toBe(3);
  });

  it('añade ejercicios sin duplicar y rechaza los desconocidos', () => {
    const base = initial();
    const originalCount = base.routine.days[0].exercises.length;

    const added = reducer(base, { type: 'routine/addExercise', dayId: 'day-1', exerciseId: 'hip-thrust' });
    expect(added.routine.days[0].exercises.map((e) => e.exerciseId)).toContain('hip-thrust');
    expect(added.routine.days[0].exercises).toHaveLength(originalCount + 1);

    const again = reducer(added, { type: 'routine/addExercise', dayId: 'day-1', exerciseId: 'hip-thrust' });
    expect(again.routine.days[0].exercises).toHaveLength(added.routine.days[0].exercises.length);

    const bad = reducer(base, { type: 'routine/addExercise', dayId: 'day-1', exerciseId: 'xxx' });
    expect(bad.routine.days[0].exercises).toHaveLength(originalCount);
  });

  it('actualiza series, repeticiones, RIR, técnica y descanso', () => {
    const state = reducer(initial(), {
      type: 'routine/updateExercise',
      dayId: 'day-1',
      index: 0,
      patch: { sets: 6, targetReps: [4, 6], targetRir: 1, technique: 'cluster', restSeconds: 240 },
    });
    const exercise = state.routine.days[0].exercises[0];
    expect(exercise.sets).toBe(6);
    expect(exercise.targetReps).toEqual([4, 6]);
    expect(exercise.technique).toBe('cluster');
    expect(exercise.restSeconds).toBe(240);
  });

  it('elimina un ejercicio por su índice', () => {
    const base = initial();
    const state = reducer(base, { type: 'routine/removeExercise', dayId: 'day-1', index: 0 });
    expect(state.routine.days[0].exercises).toHaveLength(
      base.routine.days[0].exercises.length - 1,
    );
    expect(state.routine.days[0].exercises[0].exerciseId).toBe('barbell-row');
  });

  it('cambia un ejercicio de la rutina conservando su configuración', () => {
    const configured = reducer(initial(), {
      type: 'routine/updateExercise',
      dayId: 'day-1',
      index: 0,
      patch: { sets: 6, targetReps: [4, 6], targetRir: 1, technique: 'cluster' },
    });
    const state = reducer(configured, {
      type: 'routine/swapExercise',
      dayId: 'day-1',
      index: 0,
      exerciseId: 'incline-barbell-press',
    });

    expect(state.routine.days[0].exercises[0]).toEqual({
      ...configured.routine.days[0].exercises[0],
      exerciseId: 'incline-barbell-press',
    });
  });

  it('no cambia un ejercicio por otro duplicado, desconocido o en un índice inválido', () => {
    const base = initial();
    for (const action of [
      { type: 'routine/swapExercise' as const, dayId: 'day-1', index: 0, exerciseId: 'barbell-row' },
      { type: 'routine/swapExercise' as const, dayId: 'day-1', index: 0, exerciseId: 'xxx' },
      { type: 'routine/swapExercise' as const, dayId: 'day-1', index: 99, exerciseId: 'hip-thrust' },
    ]) {
      expect(reducer(base, action).routine.days[0].exercises).toEqual(
        base.routine.days[0].exercises,
      );
    }
  });

  it('reordena ejercicios y protege los índices fuera de rango', () => {
    const base = initial();
    const moved = reducer(base, { type: 'routine/moveExercise', dayId: 'day-1', from: 0, to: 2 });
    expect(moved.routine.days[0].exercises[2].exerciseId).toBe('bench-press');

    for (const args of [
      { from: 0, to: 0 },
      { from: -1, to: 2 },
      { from: 0, to: 99 },
    ]) {
      const result = reducer(base, { type: 'routine/moveExercise', dayId: 'day-1', ...args });
      expect(result.routine.days[0].exercises.map((e) => e.exerciseId)).toEqual(
        base.routine.days[0].exercises.map((e) => e.exerciseId),
      );
    }
  });

  it('cambia las prioridades y restaura la rutina por defecto', () => {
    const state = reducer(initial(), { type: 'routine/setPriorities', priorities: ['quads'] });
    expect(state.routine.priorities).toEqual(['quads']);
    const reset = reducer(state, { type: 'routine/reset' });
    expect(reset.routine.priorities).toEqual(['chest', 'back']);
    expect(reset.routine.days).toHaveLength(3);
  });
});

describe('mesociclo y ajustes', () => {
  it('avanza de semana y reinicia tras la descarga', () => {
    const week2 = reducer(initial(), { type: 'mesocycle/advance', now: START });
    expect(week2.mesocycle.week).toBe(2);

    const atEnd = reducer(initial(), { type: 'mesocycle/set', week: 5 });
    const restarted = reducer(atEnd, { type: 'mesocycle/advance', now: START + 1 });
    expect(restarted.mesocycle).toEqual({ startedAt: START + 1, week: 1, lengthWeeks: 5 });
  });

  it('limita la semana al rango del mesociclo', () => {
    expect(reducer(initial(), { type: 'mesocycle/set', week: 99 }).mesocycle.week).toBe(5);
    expect(reducer(initial(), { type: 'mesocycle/set', week: 0 }).mesocycle.week).toBe(1);
    expect(reducer(initial(), { type: 'mesocycle/set', week: 1, lengthWeeks: 1 }).mesocycle.lengthWeeks).toBe(2);
  });

  it('actualiza los ajustes de forma parcial', () => {
    const state = reducer(initial(), { type: 'settings/update', patch: { unit: 'lb', bodyweight: 78 } });
    expect(state.settings.unit).toBe('lb');
    expect(state.settings.bodyweight).toBe(78);
    expect(state.settings.soundEnabled).toBe(DEFAULT_SETTINGS.soundEnabled);
  });

  it('reemplaza el estado completo al importar', () => {
    const other = createInitialState(1);
    expect(reducer(initial(), { type: 'state/replace', state: other })).toBe(other);
  });
});

describe('lastSetsFor', () => {
  it('devuelve las series de la sesión más reciente con ese ejercicio', () => {
    const history = [
      { exercises: [{ exerciseId: 'bench-press', loggedSets: [] }] },
      { exercises: [{ exerciseId: 'bench-press', loggedSets: [{ id: 'x' }] }] },
    ] as unknown as WorkoutSession[];
    expect(lastSetsFor(history, 'bench-press')).toHaveLength(1);
    expect(lastSetsFor(history, 'otro')).toEqual([]);
  });
});

describe('progresión entre sesiones', () => {
  it('sugiere más peso en la siguiente sesión al completar el rango', () => {
    const afterFirst = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged({ reps: 10, weight: 100, rir: 2 }) },
      { type: 'session/finish', now: START + 1_000 },
    ]);
    const second = reducer(afterFirst, { type: 'session/start', dayId: 'day-1', now: START + 2_000 });
    const working = second.active!.exercises[0].prescriptions.filter((p) => !p.warmup);
    expect(working[0].suggestedWeight).toBe(102.5);
  });
});

describe('persistencia', () => {
  it('serializa y recupera el estado sin pérdidas', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged(), now: START + 10 },
      // Pausada: así el tiempo guardado es exactamente el que se recupera.
      { type: 'session/pause', now: START + 60_000 },
    ]);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('recupera en pausa una sesión que quedó en marcha', () => {
    const state = run([
      { type: 'session/start', dayId: 'day-1', now: START },
      { type: 'session/logSet', exerciseId: 'bench-press', set: logged(), now: START + 10 },
    ]);
    // Un mes después: la app estuvo cerrada, no entrenando un mes seguido.
    const restored = deserialize(serialize(state), START + 30 * 24 * 3600_000);
    expect(restored.active!.status).toBe('paused');
    expect(restored.active!.resumedAt).toBeNull();
    // Solo se acredita el tope de 10 minutos, no el hueco entero.
    expect(restored.active!.accumulatedMs).toBe(10 * 60_000);
    expect(restored.active!.exercises[0].loggedSets).toHaveLength(1);
  });

  it('acredita el tiempo real si el hueco fue corto', () => {
    const state = run([{ type: 'session/start', dayId: 'day-1', now: START }]);
    const restored = deserialize(serialize(state), START + 90_000);
    expect(restored.active!.accumulatedMs).toBe(90_000);
  });

  it('descarta una rutina con días malformados', () => {
    const broken = JSON.stringify({
      version: 1,
      state: { routine: { id: 'r', days: [{ id: 'd' }] } },
    });
    expect(deserialize(broken, START)).toEqual(createInitialState(START));
  });

  it('descarta sesiones malformadas del histórico', () => {
    const stored = JSON.stringify({
      version: 1,
      state: {
        routine: createInitialState(START).routine,
        history: [{ id: 's1', exercises: [{ exerciseId: 'x', loggedSets: [] }] }, { id: 'malo' }],
      },
    });
    expect(deserialize(stored, START).history).toHaveLength(1);
  });

  it('parte del estado inicial ante datos ausentes, corruptos o de otra versión', () => {
    expect(deserialize(null, START)).toEqual(createInitialState(START));
    expect(deserialize('{{{', START)).toEqual(createInitialState(START));
    expect(deserialize(JSON.stringify({ version: 99, state: {} }), START)).toEqual(createInitialState(START));
    expect(deserialize(JSON.stringify({ version: 1 }), START)).toEqual(createInitialState(START));
    expect(deserialize(JSON.stringify({ version: 1, state: { routine: {} } }), START)).toEqual(
      createInitialState(START),
    );
  });

  it('completa los ajustes que falten en un guardado antiguo', () => {
    const stored = JSON.stringify({
      version: 1,
      state: { routine: createInitialState(START).routine, settings: { unit: 'lb' } },
    });
    const state = deserialize(stored, START);
    expect(state.settings.unit).toBe('lb');
    expect(state.settings.autoStartRest).toBe(DEFAULT_SETTINGS.autoStartRest);
    expect(state.history).toEqual([]);
    expect(state.active).toBeNull();
  });

  describe('con localStorage', () => {
    beforeEach(() => localStorage.clear());

    it('guarda y recupera a través del almacenamiento', () => {
      const state = reducer(initial(), { type: 'routine/rename', name: 'PERSISTIDO' });
      saveState(localStorage, state);
      expect(localStorage.getItem(STORAGE_KEY)).toContain('PERSISTIDO');
      expect(loadState(localStorage).routine.name).toBe('PERSISTIDO');
    });

    it('funciona sin almacenamiento disponible', () => {
      expect(loadState(undefined, START)).toEqual(createInitialState(START));
      expect(() => saveState(undefined, initial())).not.toThrow();
    });

    it('no rompe si el almacenamiento lanza (modo privado o cuota llena)', () => {
      const broken = {
        getItem: vi.fn(() => {
          throw new Error('denegado');
        }),
        setItem: vi.fn(() => {
          throw new Error('cuota superada');
        }),
      } as unknown as Storage;
      expect(loadState(broken, START)).toEqual(createInitialState(START));
      expect(() => saveState(broken, initial())).not.toThrow();
    });
  });
});

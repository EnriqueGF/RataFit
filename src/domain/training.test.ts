import { describe, expect, it } from 'vitest';
import {
  advanceMesocycle,
  average,
  buildPrescriptions,
  computePersonalRecords,
  effectiveSetValue,
  elapsedMs,
  estimate1RM,
  formatDuration,
  incrementFor,
  isStalled,
  percentOf1RM,
  phaseForWeek,
  round,
  roundToIncrement,
  sessionTonnage,
  suggestProgression,
  targetRirForWeek,
  techniqueForSet,
  volumeByMuscle,
  volumeMultiplierForWeek,
  volumeVerdict,
  warmupSets,
  weightForReps,
} from './training';
import type { LoggedSet, MesocycleState, WorkoutSession } from './types';
import { EXERCISE_BY_ID, getExercise } from '../data/exercises';

const bench = EXERCISE_BY_ID['bench-press'];
const lateral = EXERCISE_BY_ID['lateral-raise'];
const pecDeck = EXERCISE_BY_ID['pec-deck'];
const dbFly = EXERCISE_BY_ID['db-fly'];

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: overrides.id ?? 'set-1',
    reps: 8,
    weight: 100,
    rir: 2,
    completedAt: 1_000,
    technique: 'straight',
    warmup: false,
    ...overrides,
  };
}

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    routineId: 'routine-default',
    dayId: 'day-1',
    dayName: 'DÍA A',
    startedAt: 0,
    finishedAt: null,
    status: 'finished',
    accumulatedMs: 0,
    resumedAt: null,
    exercises: [],
    ...overrides,
  };
}

describe('estimate1RM', () => {
  it('devuelve el propio peso para una repetición al fallo', () => {
    expect(estimate1RM(100, 1, 0)).toBe(100);
  });

  it('aplica Epley sobre las repeticiones', () => {
    // 100 * (1 + 10/30) = 133.33
    expect(estimate1RM(100, 10, 0)).toBeCloseTo(133.33, 1);
  });

  it('suma el RIR como repeticiones no realizadas', () => {
    expect(estimate1RM(100, 8, 2)).toBeCloseTo(estimate1RM(100, 10, 0), 5);
  });

  it('ignora entradas no válidas', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(-50, 5)).toBe(0);
  });

  it('trata un RIR negativo como cero', () => {
    expect(estimate1RM(100, 5, -3)).toBe(estimate1RM(100, 5, 0));
  });
});

describe('weightForReps y percentOf1RM', () => {
  it('es la inversa de estimate1RM', () => {
    const oneRm = estimate1RM(100, 8, 2);
    expect(weightForReps(oneRm, 8, 2)).toBeCloseTo(100, 4);
  });

  it('devuelve un porcentaje decreciente con las repeticiones', () => {
    expect(percentOf1RM(1)).toBeCloseTo(0.9677, 3);
    expect(percentOf1RM(10)).toBeLessThan(percentOf1RM(5));
  });

  it('protege de entradas no válidas', () => {
    expect(weightForReps(0, 5)).toBe(0);
    expect(weightForReps(100, 0)).toBe(0);
    expect(percentOf1RM(0)).toBe(0);
  });
});

describe('roundToIncrement e incrementFor', () => {
  it('redondea al múltiplo más cercano', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.5, 2.5)).toBe(102.5);
  });

  it('devuelve el valor sin cambios si el incremento no es válido', () => {
    expect(roundToIncrement(101.234, 0)).toBe(101.23);
  });

  it('usa el salto propio de cada material', () => {
    expect(incrementFor(bench)).toBe(2.5);
    expect(incrementFor(EXERCISE_BY_ID['db-bench-press'])).toBe(2);
    expect(incrementFor(EXERCISE_BY_ID['leg-press'])).toBe(5);
    expect(incrementFor(EXERCISE_BY_ID['weighted-pullup'])).toBe(1.25);
  });
});

describe('effectiveSetValue', () => {
  it('no cuenta las series de aproximación', () => {
    expect(effectiveSetValue(set({ warmup: true }))).toBe(0);
  });

  it('cuenta una serie completa cerca del fallo', () => {
    expect(effectiveSetValue(set({ rir: 2 }))).toBe(1);
  });

  it('cuenta media serie por encima de RIR 4', () => {
    expect(effectiveSetValue(set({ rir: 5 }))).toBe(0.5);
  });

  it('bonifica las técnicas de intensificación', () => {
    expect(effectiveSetValue(set({ technique: 'myo-reps' }))).toBe(1.5);
    expect(effectiveSetValue(set({ technique: 'drop-set' }))).toBe(1.5);
    expect(effectiveSetValue(set({ technique: 'cluster' }))).toBe(1.25);
    expect(effectiveSetValue(set({ technique: 'superset' }))).toBe(1);
  });
});

describe('volumeByMuscle', () => {
  it('asigna una serie al principal y media a cada secundario', () => {
    const s = session({
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [set({ id: 'a' }), set({ id: 'b' })],
          skipped: false,
        },
      ],
    });
    const volume = volumeByMuscle([s], getExercise);
    expect(volume.chest).toBe(2);
    expect(volume.triceps).toBe(1);
    expect(volume.shoulders).toBe(1);
  });

  it('ignora ejercicios desconocidos y aproximaciones', () => {
    const s = session({
      exercises: [
        { exerciseId: 'inexistente', prescriptions: [], loggedSets: [set()], skipped: false },
        {
          exerciseId: 'pec-deck',
          prescriptions: [],
          loggedSets: [set({ warmup: true })],
          skipped: false,
        },
      ],
    });
    expect(volumeByMuscle([s], getExercise)).toEqual({});
  });
});

describe('sessionTonnage', () => {
  it('suma peso por repeticiones incluidas las extra', () => {
    const s = session({
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [
            set({ id: 'a', weight: 100, reps: 10 }),
            set({ id: 'b', weight: 50, reps: 10, extraReps: [3, 2] }),
            set({ id: 'c', weight: 40, reps: 5, warmup: true }),
          ],
          skipped: false,
        },
      ],
    });
    // 100*10 + 50*(10+5) = 1750, la aproximación no cuenta
    expect(sessionTonnage(s)).toBe(1750);
  });
});

describe('volumeVerdict', () => {
  it('clasifica respecto al rango semanal de referencia', () => {
    expect(volumeVerdict('chest', 6)).toBe('below');
    expect(volumeVerdict('chest', 16)).toBe('optimal');
    expect(volumeVerdict('chest', 30)).toBe('above');
  });

  it('da a pecho y espalda un rango más alto que a core', () => {
    expect(volumeVerdict('core', 13)).toBe('above');
    expect(volumeVerdict('chest', 13)).toBe('optimal');
  });
});

describe('periodización', () => {
  const meso = (week: number, lengthWeeks = 5): MesocycleState => ({
    startedAt: 0,
    week,
    lengthWeeks,
  });

  it('recorre acumulación, intensificación, pico y descarga', () => {
    expect(phaseForWeek(meso(1))).toBe('accumulation');
    expect(phaseForWeek(meso(2))).toBe('accumulation');
    expect(phaseForWeek(meso(3))).toBe('intensification');
    expect(phaseForWeek(meso(4))).toBe('intensification');
    expect(phaseForWeek(meso(5))).toBe('deload');
  });

  it('marca descarga también si se pasa de la última semana', () => {
    expect(phaseForWeek(meso(9, 5))).toBe('deload');
  });

  it('incluye una fase de pico en mesociclos largos', () => {
    expect(phaseForWeek(meso(9, 10))).toBe('peak');
  });

  it('aprieta el RIR conforme avanza el ciclo', () => {
    expect(targetRirForWeek(meso(1))).toBe(3);
    expect(targetRirForWeek(meso(3))).toBe(2);
    expect(targetRirForWeek(meso(9, 10))).toBe(1);
    expect(targetRirForWeek(meso(5))).toBe(4);
  });

  it('reduce el volumen a la mitad en la descarga', () => {
    expect(volumeMultiplierForWeek(meso(1))).toBe(1);
    expect(volumeMultiplierForWeek(meso(3))).toBeCloseTo(1.15);
    expect(volumeMultiplierForWeek(meso(9, 10))).toBeCloseTo(1.25);
    expect(volumeMultiplierForWeek(meso(5))).toBe(0.5);
  });

  it('avanza semana a semana y reinicia tras la descarga', () => {
    expect(advanceMesocycle(meso(1)).week).toBe(2);
    const restarted = advanceMesocycle(meso(5), 999);
    expect(restarted).toEqual({ startedAt: 999, week: 1, lengthWeeks: 5 });
  });
});

describe('suggestProgression', () => {
  const targetReps: [number, number] = [6, 10];

  it('no sugiere peso sin histórico', () => {
    const result = suggestProgression({ exercise: bench, lastSets: [], targetReps, targetRir: 2 });
    expect(result.suggestedWeight).toBeNull();
    expect(result.action).toBe('hold');
  });

  it('sube la carga al completar el tope del rango', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 10, weight: 100, rir: 2 }), set({ id: 'b', reps: 10, weight: 100, rir: 1 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('load');
    expect(result.suggestedWeight).toBe(102.5);
  });

  it('sube el doble si además sobró RIR', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 10, weight: 100, rir: 4 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('load');
    expect(result.suggestedWeight).toBe(105);
  });

  it('mantiene el peso y pide una repetición más dentro del rango', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 8, weight: 100, rir: 2 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('reps');
    expect(result.suggestedWeight).toBe(100);
    expect(result.rationale).toContain('9');
  });

  it('repite carga si aún no llega al mínimo del rango', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 5, weight: 100, rir: 3 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('hold');
    expect(result.suggestedWeight).toBe(100);
  });

  it('baja un 10 % si se apuró demasiado sin alcanzar el rango', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 4, weight: 100, rir: 0 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('deload');
    expect(result.suggestedWeight).toBe(90);
  });

  it('baja la carga aunque el RIR objetivo sea 0', () => {
    // Con targetRir 0, exigir `avgRir < -1.5` era imposible y el ejercicio
    // nunca bajaba de peso por mucho que se apurase sin llegar al rango.
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ reps: 4, weight: 100, rir: 0 })],
      targetReps,
      targetRir: 0,
    });
    expect(result.action).toBe('deload');
    expect(result.suggestedWeight).toBe(90);
  });

  it('tiene en cuenta las series de back-off, no solo la más pesada', () => {
    // Top set a 100 kg y back-off a 90: si solo se mirase la serie superior,
    // las 3 reps del back-off no contarían y la app diría "sube repeticiones".
    const result = suggestProgression({
      exercise: bench,
      lastSets: [
        set({ id: 'top', reps: 8, weight: 100, rir: 1 }),
        set({ id: 'back', reps: 3, weight: 90, rir: 0 }),
      ],
      targetReps: [6, 10],
      targetRir: 2,
    });
    expect(result.action).toBe('deload');
  });

  it('se basa en la serie más pesada y su peor repetición', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [
        set({ id: 'a', reps: 10, weight: 100, rir: 2 }),
        set({ id: 'b', reps: 7, weight: 100, rir: 1 }),
        set({ id: 'c', reps: 15, weight: 60, rir: 3 }),
      ],
      targetReps,
      targetRir: 2,
    });
    expect(result.action).toBe('reps');
    expect(result.suggestedWeight).toBe(100);
  });

  it('descarta las series de aproximación', () => {
    const result = suggestProgression({
      exercise: bench,
      lastSets: [set({ id: 'w', reps: 5, weight: 200, warmup: true }), set({ reps: 10, weight: 100, rir: 2 })],
      targetReps,
      targetRir: 2,
    });
    expect(result.suggestedWeight).toBe(102.5);
  });
});

describe('warmupSets', () => {
  it('genera tres aproximaciones para los básicos más costosos', () => {
    const sets = warmupSets(bench, 100);
    expect(sets).toHaveLength(3);
    expect(sets.map((s) => s.suggestedWeight)).toEqual([40, 60, 80]);
    expect(sets.every((s) => s.warmup)).toBe(true);
  });

  it('no genera aproximaciones para aislamientos ni sin peso conocido', () => {
    expect(warmupSets(lateral, 20)).toHaveLength(0);
    expect(warmupSets(bench, null)).toHaveLength(0);
    expect(warmupSets(bench, 0)).toHaveLength(0);
  });

  it('usa dos aproximaciones en compuestos de menor coste', () => {
    expect(warmupSets(EXERCISE_BY_ID['machine-chest-press'], 100)).toHaveLength(2);
  });
});

describe('techniqueForSet', () => {
  it('solo intensifica la última serie', () => {
    expect(techniqueForSet(pecDeck, 0, 3, 'drop-set', 'accumulation')).toBe('straight');
    expect(techniqueForSet(pecDeck, 2, 3, 'drop-set', 'accumulation')).toBe('drop-set');
  });

  it('nunca intensifica durante la descarga', () => {
    expect(techniqueForSet(pecDeck, 2, 3, 'drop-set', 'deload')).toBe('straight');
  });

  it('no intensifica básicos pesados', () => {
    expect(techniqueForSet(bench, 3, 4, 'drop-set', 'peak')).toBe('straight');
  });

  it('mantiene series rectas y superseries tal cual', () => {
    expect(techniqueForSet(bench, 0, 4, 'straight', 'peak')).toBe('straight');
    expect(techniqueForSet(lateral, 0, 3, 'superset', 'peak')).toBe('superset');
  });

  it('aplica el top set solo a la primera serie', () => {
    expect(techniqueForSet(bench, 0, 4, 'top-backoff', 'peak')).toBe('top-backoff');
    expect(techniqueForSet(bench, 1, 4, 'top-backoff', 'peak')).toBe('straight');
  });

  it('cambia los parciales por drop set si el ejercicio no es duro en estiramiento', () => {
    expect(techniqueForSet(pecDeck, 2, 3, 'lengthened-partials', 'peak')).toBe('drop-set');
    expect(techniqueForSet(dbFly, 2, 3, 'lengthened-partials', 'peak')).toBe('lengthened-partials');
  });
});

describe('buildPrescriptions', () => {
  const routineExercise = {
    exerciseId: 'bench-press',
    sets: 4,
    targetReps: [6, 10] as [number, number],
    targetRir: 2,
    technique: 'top-backoff' as const,
    restSeconds: 180,
  };

  it('añade aproximaciones y series de trabajo con back-off más ligero', () => {
    const { sets } = buildPrescriptions({
      exercise: bench,
      routineExercise,
      history: [set({ reps: 10, weight: 100, rir: 2 })],
      mesocycle: { startedAt: 0, week: 1, lengthWeeks: 5 },
    });
    const warmups = sets.filter((s) => s.warmup);
    const working = sets.filter((s) => !s.warmup);
    expect(warmups).toHaveLength(3);
    expect(working).toHaveLength(4);
    expect(working[0].suggestedWeight).toBe(102.5);
    expect(working[1].suggestedWeight).toBe(92.5);
    expect(working[0].technique).toBe('top-backoff');
    expect(sets.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('recorta el volumen y quita aproximaciones en descarga', () => {
    const { sets } = buildPrescriptions({
      exercise: bench,
      routineExercise,
      history: [set({ reps: 10, weight: 100, rir: 2 })],
      mesocycle: { startedAt: 0, week: 5, lengthWeeks: 5 },
    });
    expect(sets.filter((s) => s.warmup)).toHaveLength(0);
    expect(sets).toHaveLength(2);
    expect(sets.every((s) => s.technique === 'straight')).toBe(true);
  });

  it('sube el número de series en la fase de intensificación', () => {
    const { sets } = buildPrescriptions({
      exercise: bench,
      routineExercise,
      history: [],
      mesocycle: { startedAt: 0, week: 3, lengthWeeks: 5 },
    });
    expect(sets.filter((s) => !s.warmup)).toHaveLength(5);
  });

  it('expone el motivo de la progresión', () => {
    const { rationale } = buildPrescriptions({
      exercise: bench,
      routineExercise,
      history: [],
      mesocycle: { startedAt: 0, week: 1, lengthWeeks: 5 },
    });
    expect(rationale).toContain('Primera vez');
  });
});

describe('computePersonalRecords', () => {
  it('guarda el mejor 1RM estimado por ejercicio', () => {
    const s1 = session({
      id: 's1',
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [set({ id: 'a', weight: 100, reps: 5, rir: 0, completedAt: 10 })],
          skipped: false,
        },
      ],
    });
    const s2 = session({
      id: 's2',
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [set({ id: 'b', weight: 110, reps: 5, rir: 0, completedAt: 20 })],
          skipped: false,
        },
      ],
    });
    const records = computePersonalRecords([s1, s2]);
    expect(records['bench-press'].bestWeight).toBe(110);
    expect(records['bench-press'].achievedAt).toBe(20);
  });

  it('conserva el mejor peso absoluto aunque el 1RM no mejore', () => {
    const s = session({
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [
            set({ id: 'a', weight: 100, reps: 10, rir: 0 }),
            set({ id: 'b', weight: 120, reps: 1, rir: 0 }),
          ],
          skipped: false,
        },
      ],
    });
    const record = computePersonalRecords([s])['bench-press'];
    expect(record.best1Rm).toBeCloseTo(133.33, 1);
    expect(record.bestWeight).toBe(120);
  });

  it('no rebaja el peso máximo al batir el 1RM con una serie ligera', () => {
    const s = session({
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [
            // Un single pesado fija el peso máximo...
            set({ id: 'a', weight: 100, reps: 1, rir: 0, completedAt: 10 }),
            // ...y una serie larga y ligera mejora el 1RM estimado sin ser
            // el peso más alto que se ha movido.
            set({ id: 'b', weight: 60, reps: 30, rir: 0, completedAt: 20 }),
          ],
          skipped: false,
        },
      ],
    });
    const record = computePersonalRecords([s])['bench-press'];
    expect(record.best1Rm).toBeGreaterThan(estimate1RM(100, 1, 0));
    expect(record.bestWeight).toBe(100);
  });

  it('ignora aproximaciones y valores vacíos', () => {
    const s = session({
      exercises: [
        {
          exerciseId: 'bench-press',
          prescriptions: [],
          loggedSets: [set({ warmup: true }), set({ id: 'z', weight: 0, reps: 0 })],
          skipped: false,
        },
      ],
    });
    expect(computePersonalRecords([s])).toEqual({});
  });
});

describe('isStalled', () => {
  const build = (weights: number[]) =>
    weights.map((weight, i) =>
      session({
        id: `s${i}`,
        exercises: [
          {
            exerciseId: 'bench-press',
            prescriptions: [],
            loggedSets: [set({ id: `set${i}`, weight, reps: 8, rir: 2 })],
            skipped: false,
          },
        ],
      }),
    );

  it('detecta tres sesiones sin mejorar', () => {
    expect(isStalled(build([100, 100, 100]), 'bench-press')).toBe(true);
  });

  it('no marca estancamiento si la última mejoró', () => {
    expect(isStalled(build([105, 100, 100]), 'bench-press')).toBe(false);
  });

  it('necesita al menos tres registros', () => {
    expect(isStalled(build([100, 100]), 'bench-press')).toBe(false);
    expect(isStalled(build([100, 100, 100]), 'otro')).toBe(false);
  });
});

describe('elapsedMs y formatDuration', () => {
  it('suma el tramo activo cuando la sesión corre', () => {
    const s = session({ status: 'running', accumulatedMs: 5_000, resumedAt: 1_000 });
    expect(elapsedMs(s, 4_000)).toBe(8_000);
  });

  it('congela el tiempo mientras está pausada', () => {
    const s = session({ status: 'paused', accumulatedMs: 5_000, resumedAt: null });
    expect(elapsedMs(s, 999_999)).toBe(5_000);
  });

  it('nunca resta tiempo si el reloj va hacia atrás', () => {
    const s = session({ status: 'running', accumulatedMs: 5_000, resumedAt: 10_000 });
    expect(elapsedMs(s, 1_000)).toBe(5_000);
  });

  it('formatea minutos y horas', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('01:02:05');
    expect(formatDuration(-5_000)).toBe('00:00');
  });
});

describe('utilidades numéricas', () => {
  it('round respeta los decimales pedidos', () => {
    expect(round(2.4449, 2)).toBe(2.44);
    expect(round(2.375, 2)).toBe(2.38);
    expect(round(102.5000000001, 2)).toBe(102.5);
  });

  it('average devuelve 0 con lista vacía', () => {
    expect(average([])).toBe(0);
    expect(average([1, 2, 3])).toBe(2);
  });
});

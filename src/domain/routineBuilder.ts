import type {
  MuscleGroup,
  Routine,
  RoutineDay,
  RoutineExercise,
  Weekday,
} from './types';
import { EXERCISE_BY_ID } from '../data/exercises';

/**
 * Plantilla fullbody de 3 días con pecho y espalda como prioridades: ambos
 * aparecen los tres días (uno pesado + uno accesorio), mientras que el resto de
 * grupos rota para mantener el volumen semanal dentro de rango sin alargar la
 * sesión.
 */
interface Template {
  name: string;
  entries: Array<Omit<RoutineExercise, 'targetReps' | 'restSeconds'> & {
    targetReps?: [number, number];
    restSeconds?: number;
  }>;
}

const TEMPLATES: Template[] = [
  {
    name: 'DÍA A · Empuje pesado',
    entries: [
      { exerciseId: 'bench-press', sets: 4, targetRir: 2, technique: 'top-backoff' },
      { exerciseId: 'barbell-row', sets: 3, targetRir: 2, technique: 'straight' },
      { exerciseId: 'back-squat', sets: 4, targetRir: 3, technique: 'straight' },
      { exerciseId: 'incline-db-press', sets: 3, targetRir: 1, technique: 'drop-set' },
      { exerciseId: 'lat-pulldown', sets: 2, targetRir: 1, technique: 'myo-reps' },
      { exerciseId: 'lateral-raise', sets: 3, targetRir: 0, technique: 'drop-set', supersetGroup: 'A1' },
      { exerciseId: 'triceps-pushdown', sets: 3, targetRir: 0, technique: 'straight', supersetGroup: 'A1' },
      { exerciseId: 'cable-crunch', sets: 3, targetRir: 1, technique: 'straight' },
      { exerciseId: 'seated-calf-raise', sets: 3, targetRir: 1, technique: 'straight' },
    ],
  },
  {
    name: 'DÍA B · Tracción pesada',
    entries: [
      { exerciseId: 'weighted-pullup', sets: 4, targetRir: 2, technique: 'straight' },
      { exerciseId: 'incline-barbell-press', sets: 4, targetRir: 2, technique: 'top-backoff' },
      { exerciseId: 'romanian-deadlift', sets: 3, targetRir: 3, technique: 'straight' },
      { exerciseId: 'chest-supported-row', sets: 2, targetRir: 1, technique: 'myo-reps' },
      { exerciseId: 'hip-thrust', sets: 3, targetRir: 2, technique: 'straight' },
      { exerciseId: 'pec-deck', sets: 3, targetRir: 0, technique: 'drop-set' },
      { exerciseId: 'db-shoulder-press', sets: 3, targetRir: 2, technique: 'straight' },
      { exerciseId: 'incline-db-curl', sets: 3, targetRir: 0, technique: 'lengthened-partials', supersetGroup: 'B1' },
      { exerciseId: 'overhead-triceps-ext', sets: 3, targetRir: 0, technique: 'lengthened-partials', supersetGroup: 'B1' },
      { exerciseId: 'standing-calf-raise', sets: 3, targetRir: 1, technique: 'straight' },
    ],
  },
  {
    name: 'DÍA C · Volumen y densidad',
    entries: [
      { exerciseId: 'db-bench-press', sets: 4, targetRir: 2, technique: 'straight' },
      { exerciseId: 'seated-cable-row', sets: 4, targetRir: 2, technique: 'straight' },
      { exerciseId: 'hack-squat', sets: 4, targetRir: 2, technique: 'straight' },
      { exerciseId: 'leg-extension', sets: 3, targetRir: 0, technique: 'drop-set' },
      { exerciseId: 'cable-fly-low', sets: 3, targetRir: 0, technique: 'drop-set' },
      { exerciseId: 'straight-arm-pulldown', sets: 2, targetRir: 0, technique: 'myo-reps' },
      { exerciseId: 'seated-leg-curl', sets: 3, targetRir: 1, technique: 'straight' },
      { exerciseId: 'face-pull', sets: 3, targetRir: 1, technique: 'straight', supersetGroup: 'C1' },
      { exerciseId: 'hammer-curl', sets: 3, targetRir: 0, technique: 'straight', supersetGroup: 'C1' },
      { exerciseId: 'hanging-leg-raise', sets: 3, targetRir: 1, technique: 'straight' },
    ],
  },
];

/** Días de la semana por defecto: lunes, miércoles y viernes. */
export const DEFAULT_WEEKDAYS: Weekday[] = [1, 3, 5];

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAY_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export const DEFAULT_PRIORITIES: MuscleGroup[] = ['chest', 'back'];

/** Crea la rutina por defecto: fullbody 3 días con foco en pecho y espalda. */
export function createDefaultRoutine(now = Date.now()): Routine {
  const days: RoutineDay[] = TEMPLATES.map((template, index) => ({
    id: `day-${index + 1}`,
    name: template.name,
    weekday: DEFAULT_WEEKDAYS[index] ?? null,
    exercises: template.entries.map((entry) => {
      const exercise = EXERCISE_BY_ID[entry.exerciseId];
      return {
        exerciseId: entry.exerciseId,
        sets: entry.sets,
        targetRir: entry.targetRir,
        technique: entry.technique,
        supersetGroup: entry.supersetGroup,
        targetReps: entry.targetReps ?? exercise?.repRange ?? [8, 12],
        restSeconds: entry.restSeconds ?? exercise?.restSeconds ?? 120,
      } satisfies RoutineExercise;
    }),
  }));

  return {
    id: 'routine-default',
    name: 'FULLBODY 3D · PECHO + ESPALDA',
    days,
    priorities: DEFAULT_PRIORITIES,
    createdAt: now,
    updatedAt: now,
  };
}

/** Series semanales planificadas por grupo (principal 1, secundario 0,5). */
export function plannedWeeklyVolume(routine: Routine): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const day of routine.days) {
    for (const routineExercise of day.exercises) {
      const exercise = EXERCISE_BY_ID[routineExercise.exerciseId];
      if (!exercise) continue;
      totals[exercise.primary] = (totals[exercise.primary] ?? 0) + routineExercise.sets;
      for (const secondary of exercise.secondary) {
        totals[secondary] = (totals[secondary] ?? 0) + routineExercise.sets / 2;
      }
    }
  }
  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 10) / 10;
  }
  return totals;
}

/**
 * Duración estimada de un día en minutos: series por (descanso + tiempo bajo
 * tensión aproximado) más las aproximaciones de los básicos.
 */
export function estimateDayMinutes(day: RoutineDay): number {
  let seconds = 0;
  for (const routineExercise of day.exercises) {
    const exercise = EXERCISE_BY_ID[routineExercise.exerciseId];
    if (!exercise) continue;
    const setSeconds = 35 + routineExercise.restSeconds;
    seconds += routineExercise.sets * setSeconds;
    if (exercise.compound) seconds += exercise.fatigueCost >= 4 ? 3 * 95 : 2 * 95;
    // Las superseries ahorran aproximadamente un descanso por serie.
    if (routineExercise.supersetGroup) seconds -= routineExercise.sets * routineExercise.restSeconds * 0.4;
  }
  return Math.round(seconds / 60);
}

/** Siguiente día sugerido: el que toca por calendario o el menos reciente. */
export function suggestNextDay(
  routine: Routine,
  lastTrainedByDayId: Record<string, number>,
  now = Date.now(),
): RoutineDay | null {
  if (routine.days.length === 0) return null;
  const today = new Date(now).getDay() as Weekday;
  const scheduled = routine.days.find((day) => day.weekday === today);
  if (scheduled) return scheduled;
  return [...routine.days].sort(
    (a, b) => (lastTrainedByDayId[a.id] ?? 0) - (lastTrainedByDayId[b.id] ?? 0),
  )[0];
}

export function createEmptyDay(id: string, name: string): RoutineDay {
  return { id, name, weekday: null, exercises: [] };
}

/** Crea la entrada de rutina para un ejercicio con sus valores por defecto. */
export function defaultRoutineExercise(exerciseId: string): RoutineExercise {
  const exercise = EXERCISE_BY_ID[exerciseId];
  return {
    exerciseId,
    sets: exercise?.compound ? 4 : 3,
    targetReps: exercise?.repRange ?? [8, 12],
    targetRir: exercise?.compound ? 2 : 1,
    technique: 'straight',
    restSeconds: exercise?.restSeconds ?? 120,
  };
}

import type {
  AdvancedTechnique,
  Exercise,
  LoggedSet,
  MesocyclePhase,
  MesocycleState,
  MuscleGroup,
  RoutineExercise,
  SetPrescription,
  WorkoutSession,
} from './types';

// ───────────────────────────── Fuerza estimada ──────────────────────────────

/**
 * 1RM estimado con la fórmula de Epley, ajustada por las repeticiones en
 * reserva: una serie de 8 reps a RIR 2 equivale a una de 10 al fallo.
 */
export function estimate1RM(weight: number, reps: number, rir = 0): number {
  if (weight <= 0 || reps <= 0) return 0;
  const effectiveReps = reps + Math.max(0, rir);
  if (effectiveReps === 1) return round(weight, 2);
  return round(weight * (1 + effectiveReps / 30), 2);
}

/** Peso necesario para lograr `reps` repeticiones dado un 1RM (inversa de Epley). */
export function weightForReps(oneRm: number, reps: number, rir = 0): number {
  if (oneRm <= 0 || reps <= 0) return 0;
  const effectiveReps = reps + Math.max(0, rir);
  return round(oneRm / (1 + effectiveReps / 30), 2);
}

/**
 * Porcentaje del 1RM que corresponde a un número de repeticiones.
 * Devuelve un valor entre 0 y 1.
 */
export function percentOf1RM(reps: number, rir = 0): number {
  if (reps <= 0) return 0;
  const effectiveReps = reps + Math.max(0, rir);
  return round(1 / (1 + effectiveReps / 30), 4);
}

/**
 * Redondea a la mínima fracción cargable. Por defecto 2,5 kg (discos de
 * 1,25 kg por lado); las mancuernas suelen ir de 2 en 2 y las máquinas de 5.
 */
export function roundToIncrement(weight: number, increment = 2.5): number {
  if (increment <= 0) return round(weight, 2);
  return round(Math.round(weight / increment) * increment, 2);
}

/** Incremento cargable habitual según el material. */
export function incrementFor(exercise: Exercise): number {
  switch (exercise.equipment) {
    case 'dumbbell':
      return 2;
    case 'machine':
    case 'cable':
      return 5;
    case 'bodyweight':
      return 1.25;
    default:
      return 2.5;
  }
}

// ──────────────────────────────── Volumen ───────────────────────────────────

/**
 * Series efectivas: las de aproximación no cuentan y las series por encima de
 * RIR 4 aportan un estímulo marginal, así que valen medio punto. Las técnicas
 * de intensificación añaden estímulo por encima de una serie recta.
 */
export function effectiveSetValue(set: LoggedSet): number {
  if (set.warmup) return 0;
  const base = set.rir > 4 ? 0.5 : 1;
  const bonus = TECHNIQUE_SET_BONUS[set.technique] ?? 0;
  return round(base + bonus, 2);
}

const TECHNIQUE_SET_BONUS: Record<AdvancedTechnique, number> = {
  straight: 0,
  'myo-reps': 0.5,
  'drop-set': 0.5,
  'rest-pause': 0.5,
  cluster: 0.25,
  'lengthened-partials': 0.25,
  superset: 0,
  'top-backoff': 0,
};

/**
 * Reparto de volumen por grupo muscular: el músculo principal recibe una serie
 * completa y cada secundario media (criterio habitual al contar volumen).
 */
export function volumeByMuscle(
  sessions: WorkoutSession[],
  resolve: (id: string) => Exercise | undefined,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const session of sessions) {
    for (const sessionExercise of session.exercises) {
      const exercise = resolve(sessionExercise.exerciseId);
      if (!exercise) continue;
      for (const set of sessionExercise.loggedSets) {
        const value = effectiveSetValue(set);
        if (value === 0) continue;
        totals[exercise.primary] = round((totals[exercise.primary] ?? 0) + value, 2);
        for (const secondary of exercise.secondary) {
          totals[secondary] = round((totals[secondary] ?? 0) + value / 2, 2);
        }
      }
    }
  }
  return totals;
}

/** Tonelaje total (kg levantados) de una sesión, sin contar aproximaciones. */
export function sessionTonnage(session: WorkoutSession): number {
  let total = 0;
  for (const sessionExercise of session.exercises) {
    for (const set of sessionExercise.loggedSets) {
      if (set.warmup) continue;
      const extra = (set.extraReps ?? []).reduce((a, b) => a + b, 0);
      total += set.weight * (set.reps + extra);
    }
  }
  return round(total, 1);
}

/**
 * Rangos semanales de referencia (MEV-MAV) por grupo muscular, en series
 * efectivas. Pecho y espalda llevan el rango alto por ser las prioridades.
 */
export const WEEKLY_VOLUME_TARGETS: Record<MuscleGroup, [number, number]> = {
  chest: [12, 22],
  back: [12, 22],
  quads: [8, 16],
  hamstrings: [6, 14],
  glutes: [6, 14],
  shoulders: [8, 18],
  biceps: [6, 16],
  triceps: [6, 16],
  calves: [6, 14],
  core: [4, 12],
};

export type VolumeVerdict = 'below' | 'optimal' | 'above';

export function volumeVerdict(muscle: MuscleGroup, sets: number): VolumeVerdict {
  const [min, max] = WEEKLY_VOLUME_TARGETS[muscle];
  if (sets < min) return 'below';
  if (sets > max) return 'above';
  return 'optimal';
}

// ───────────────────────────── Periodización ────────────────────────────────

/**
 * Mesociclo con sobrecarga progresiva: se acumulan semanas ganando volumen e
 * intensidad y se cierra con una semana de descarga.
 */
export function phaseForWeek(state: MesocycleState): MesocyclePhase {
  const { week, lengthWeeks } = state;
  if (week >= lengthWeeks) return 'deload';
  const ratio = week / lengthWeeks;
  if (ratio <= 0.45) return 'accumulation';
  if (ratio <= 0.8) return 'intensification';
  return 'peak';
}

/** RIR objetivo de la semana: se aprieta a medida que avanza el mesociclo. */
export function targetRirForWeek(state: MesocycleState): number {
  switch (phaseForWeek(state)) {
    case 'accumulation':
      return 3;
    case 'intensification':
      return 2;
    case 'peak':
      return 1;
    case 'deload':
      return 4;
  }
}

/** Multiplicador de series de la semana respecto a la prescripción base. */
export function volumeMultiplierForWeek(state: MesocycleState): number {
  switch (phaseForWeek(state)) {
    case 'accumulation':
      return 1;
    case 'intensification':
      return 1.15;
    case 'peak':
      return 1.25;
    case 'deload':
      return 0.5;
  }
}

/** Avanza una semana el mesociclo, reiniciándolo cuando termina la descarga. */
export function advanceMesocycle(state: MesocycleState, now = Date.now()): MesocycleState {
  if (state.week >= state.lengthWeeks) {
    return { startedAt: now, week: 1, lengthWeeks: state.lengthWeeks };
  }
  return { ...state, week: state.week + 1 };
}

// ────────────────────────── Progresión de la carga ──────────────────────────

export interface ProgressionInput {
  exercise: Exercise;
  /** Series reales de la última sesión de este ejercicio (sin aproximaciones). */
  lastSets: LoggedSet[];
  targetReps: [number, number];
  targetRir: number;
}

export interface ProgressionResult {
  suggestedWeight: number | null;
  /** Explicación breve mostrada al usuario. */
  rationale: string;
  /** 'load' sube peso, 'reps' suma repeticiones, 'hold' repite, 'deload' baja. */
  action: 'load' | 'reps' | 'hold' | 'deload';
}

/**
 * Doble progresión con autorregulación por RIR: primero se llenan las
 * repeticiones del rango y solo entonces sube el peso. Si el RIR real quedó muy
 * por debajo del objetivo (se apuró de más), la carga baja.
 */
export function suggestProgression({
  exercise,
  lastSets,
  targetReps,
  targetRir,
}: ProgressionInput): ProgressionResult {
  const working = lastSets.filter((s) => !s.warmup);
  if (working.length === 0) {
    return {
      suggestedWeight: null,
      rationale: 'Primera vez: elige un peso que te deje a ' + targetRir + ' repeticiones del fallo.',
      action: 'hold',
    };
  }

  const increment = incrementFor(exercise);
  const topWeight = Math.max(...working.map((s) => s.weight));
  // Las series de back-off son intencionadamente más ligeras (hasta un 10 %),
  // así que cuentan como parte del trabajo: mirar solo la serie más pesada
  // dejaría fuera casi todo el ejercicio en un esquema top set + back-off.
  const relevant = working.filter((s) => s.weight >= topWeight * 0.88);
  const minReps = Math.min(...relevant.map((s) => s.reps));
  const avgRir = average(relevant.map((s) => s.rir));
  const [lowReps, highReps] = targetReps;

  // Se pasó de intensidad: apuró hasta el fallo (o más) y aun así no llegó al
  // rango. El umbral nunca baja de 0, porque con un objetivo de RIR 0 o 1 la
  // condición `targetRir - 1.5` sería imposible de cumplir y justo entonces es
  // cuando conviene bajar la carga.
  const overreachingRir = Math.max(0, targetRir - 1.5);
  if (avgRir <= overreachingRir && minReps < lowReps) {
    const suggested = roundToIncrement(topWeight * 0.9, increment);
    return {
      suggestedWeight: suggested,
      rationale: `Te quedaste corto de reps y apurando demasiado (RIR ${fmt(avgRir)}). Baja un 10 % y reconstruye.`,
      action: 'deload',
    };
  }

  // Rango completado en todas las series: toca subir peso.
  if (minReps >= highReps) {
    const bump = avgRir >= targetRir + 1 ? increment * 2 : increment;
    const suggested = roundToIncrement(topWeight + bump, increment);
    return {
      suggestedWeight: suggested,
      rationale:
        avgRir >= targetRir + 1
          ? `Completaste el rango sobrado (RIR ${fmt(avgRir)}): sube ${fmt(bump)} kg.`
          : `Rango completado: sube ${fmt(bump)} kg y vuelve a la parte baja del rango.`,
      action: 'load',
    };
  }

  // Dentro del rango: mantener peso y sumar repeticiones.
  if (minReps >= lowReps) {
    return {
      suggestedWeight: topWeight,
      rationale: `Mantén ${fmt(topWeight)} kg y busca ${minReps + 1} reps en todas las series.`,
      action: 'reps',
    };
  }

  // Aún por debajo del rango pero con RIR razonable: repetir carga.
  return {
    suggestedWeight: topWeight,
    rationale: `Repite ${fmt(topWeight)} kg hasta alcanzar ${lowReps} reps en todas las series.`,
    action: 'hold',
  };
}

// ─────────────────────── Generación de las prescripciones ───────────────────

/** Series de aproximación recomendadas según el coste del ejercicio. */
export function warmupSets(exercise: Exercise, workingWeight: number | null): SetPrescription[] {
  if (!exercise.compound || workingWeight === null || workingWeight <= 0) return [];
  const increment = incrementFor(exercise);
  const ramp = exercise.fatigueCost >= 4 ? [0.4, 0.6, 0.8] : [0.5, 0.75];
  return ramp.map((pct, index) => ({
    index,
    targetReps: [Math.max(3, 8 - index * 2), Math.max(3, 8 - index * 2)] as [number, number],
    targetRir: 5,
    suggestedWeight: roundToIncrement(workingWeight * pct, increment),
    technique: 'straight' as AdvancedTechnique,
    restSeconds: 60,
    warmup: true,
  }));
}

/**
 * Elige la técnica de intensificación adecuada para cada serie. Los básicos
 * pesados van a series rectas (o top set + back-off) para no acumular fatiga
 * innecesaria; los accesorios admiten técnicas más agresivas, y solo en la
 * última serie.
 */
export function techniqueForSet(
  exercise: Exercise,
  setIndex: number,
  totalSets: number,
  requested: AdvancedTechnique,
  phase: MesocyclePhase,
): AdvancedTechnique {
  if (phase === 'deload') return 'straight';
  if (requested === 'straight' || requested === 'superset') return requested;
  if (requested === 'top-backoff') return setIndex === 0 ? 'top-backoff' : 'straight';

  const isLastSet = setIndex === totalSets - 1;
  if (!isLastSet) return 'straight';

  // Intensificar un básico pesado tiene mal ratio estímulo/fatiga.
  if (exercise.compound && exercise.fatigueCost >= 4) return 'straight';

  // Los parciales en estiramiento solo tienen sentido si el ejercicio es duro
  // en la posición alargada.
  if (requested === 'lengthened-partials' && exercise.profile !== 'stretch') {
    return 'drop-set';
  }
  return requested;
}

export interface PrescriptionContext {
  exercise: Exercise;
  routineExercise: RoutineExercise;
  history: LoggedSet[];
  mesocycle: MesocycleState;
}

/**
 * Construye las series de un ejercicio para la sesión de hoy, combinando
 * progresión, fase del mesociclo y técnicas avanzadas.
 */
export function buildPrescriptions({
  exercise,
  routineExercise,
  history,
  mesocycle,
}: PrescriptionContext): { sets: SetPrescription[]; rationale: string } {
  const phase = phaseForWeek(mesocycle);
  const weekRir = targetRirForWeek(mesocycle);
  const targetRir = Math.max(0, Math.round((routineExercise.targetRir + weekRir) / 2));

  const progression = suggestProgression({
    exercise,
    lastSets: history,
    targetReps: routineExercise.targetReps,
    targetRir,
  });

  const multiplier = volumeMultiplierForWeek(mesocycle);
  const workingCount = Math.max(1, Math.round(routineExercise.sets * multiplier));

  const warmups = phase === 'deload' ? [] : warmupSets(exercise, progression.suggestedWeight);
  const sets: SetPrescription[] = [...warmups];

  for (let i = 0; i < workingCount; i += 1) {
    const technique = techniqueForSet(
      exercise,
      i,
      workingCount,
      routineExercise.technique,
      phase,
    );
    // Top set más pesado y back-offs con un 10 % menos.
    let weight = progression.suggestedWeight;
    if (weight !== null && routineExercise.technique === 'top-backoff' && i > 0) {
      weight = roundToIncrement(weight * 0.9, incrementFor(exercise));
    }
    sets.push({
      index: warmups.length + i,
      targetReps: routineExercise.targetReps,
      targetRir: phase === 'deload' ? targetRir + 1 : targetRir,
      suggestedWeight: weight,
      technique,
      restSeconds: routineExercise.restSeconds,
      warmup: false,
    });
  }

  return { sets, rationale: progression.rationale };
}

// ────────────────────────────── Utilidades ──────────────────────────────────

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor + Number.EPSILON) / factor;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Duración activa de una sesión en ms, respetando las pausas. */
export function elapsedMs(session: WorkoutSession, now = Date.now()): number {
  if (session.status === 'running' && session.resumedAt !== null) {
    return session.accumulatedMs + Math.max(0, now - session.resumedAt);
  }
  return session.accumulatedMs;
}

/** Formatea milisegundos como HH:MM:SS (u MM:SS si dura menos de una hora). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Récords personales por ejercicio: mejor 1RM estimado y mejor peso absoluto.
 */
export interface PersonalRecord {
  exerciseId: string;
  best1Rm: number;
  bestWeight: number;
  bestReps: number;
  achievedAt: number;
}

export function computePersonalRecords(sessions: WorkoutSession[]): Record<string, PersonalRecord> {
  const records: Record<string, PersonalRecord> = {};
  for (const session of sessions) {
    for (const sessionExercise of session.exercises) {
      for (const set of sessionExercise.loggedSets) {
        if (set.warmup || set.weight <= 0 || set.reps <= 0) continue;
        const oneRm = estimate1RM(set.weight, set.reps, set.rir);
        const current = records[sessionExercise.exerciseId];
        if (!current) {
          records[sessionExercise.exerciseId] = {
            exerciseId: sessionExercise.exerciseId,
            best1Rm: oneRm,
            bestWeight: set.weight,
            bestReps: set.reps,
            achievedAt: set.completedAt,
          };
          continue;
        }
        // El mejor 1RM y el peso máximo son marcas independientes: una serie
        // larga y ligera puede batir el 1RM estimado sin ser el peso más alto
        // que se ha llegado a mover.
        const next = { ...current };
        if (oneRm > current.best1Rm) {
          next.best1Rm = oneRm;
          next.bestReps = set.reps;
          next.achievedAt = set.completedAt;
        }
        next.bestWeight = Math.max(current.bestWeight, set.weight);
        records[sessionExercise.exerciseId] = next;
      }
    }
  }
  return records;
}

/**
 * Detecta estancamiento: tres sesiones seguidas sin mejorar el 1RM estimado.
 */
export function isStalled(sessionsNewestFirst: WorkoutSession[], exerciseId: string): boolean {
  const bests: number[] = [];
  for (const session of sessionsNewestFirst) {
    const se = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!se) continue;
    const working = se.loggedSets.filter((s) => !s.warmup);
    if (working.length === 0) continue;
    bests.push(Math.max(...working.map((s) => estimate1RM(s.weight, s.reps, s.rir))));
    if (bests.length === 3) break;
  }
  if (bests.length < 3) return false;
  // bests[0] es la más reciente: no ha superado ninguna de las dos anteriores.
  return bests[0] <= bests[1] && bests[1] <= bests[2];
}

import type {
  Equipment,
  Exercise,
  MovementPattern,
  MuscleGroup,
  Routine,
  RoutineDay,
  RoutineExercise,
  Weekday,
} from './types';
import { EXERCISES, EXERCISE_BY_ID } from '../data/exercises';
import { DEFAULT_WEEKDAYS } from './routineBuilder';

/** Días de entrenamiento a la semana que admite el generador. */
export type DaysPerWeek = 2 | 3 | 4;

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface GymProfile {
  /** Material disponible en el gimnasio. */
  equipment: Equipment[];
  /** Ejercicios descartados expresamente (no hay máquina, molestias, o no gusta). */
  excludedExerciseIds: string[];
  /** Ejercicios que se quieren sí o sí en la rutina. */
  favoriteExerciseIds: string[];
  priorities: MuscleGroup[];
  daysPerWeek: DaysPerWeek;
  weekdays: Weekday[];
  /** Minutos disponibles por sesión; recorta el número de accesorios. */
  sessionMinutes: number;
  experience: ExperienceLevel;
}

export const DEFAULT_PROFILE: GymProfile = {
  equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'smith'],
  excludedExerciseIds: [],
  favoriteExerciseIds: [],
  priorities: ['chest', 'back'],
  daysPerWeek: 3,
  weekdays: DEFAULT_WEEKDAYS,
  sessionMinutes: 75,
  experience: 'intermediate',
};

/** Ejercicios que el perfil permite: material disponible y no descartados. */
export function availableExercises(profile: GymProfile): Exercise[] {
  return EXERCISES.filter(
    (exercise) =>
      profile.equipment.includes(exercise.equipment) &&
      !profile.excludedExerciseIds.includes(exercise.id),
  );
}

/**
 * Comprueba si un grupo muscular puede entrenarse con lo que hay disponible.
 * Sirve para avisar en el cuestionario antes de generar una rutina coja.
 */
export function uncoveredMuscles(profile: GymProfile): MuscleGroup[] {
  const available = availableExercises(profile);
  const covered = new Set(available.map((e) => e.primary));
  const needed: MuscleGroup[] = [
    'chest',
    'back',
    'quads',
    'hamstrings',
    'shoulders',
    'biceps',
    'triceps',
  ];
  return needed.filter((muscle) => !covered.has(muscle));
}

// ─────────────────────── Esqueleto de cada día ──────────────────────────────

/** Hueco de la sesión: qué papel cumple y con qué patrón se cubre. */
interface Slot {
  role: 'primary' | 'secondary' | 'accessory';
  /** Patrones aceptables, en orden de preferencia. */
  patterns: MovementPattern[];
  muscle: MuscleGroup;
  /** Se puede recortar si la sesión es corta. */
  optional?: boolean;
  supersetGroup?: string;
}

const PUSH_PULL_CORE = (suffix: string): Slot[] => [
  { role: 'accessory', patterns: ['isolation'], muscle: 'shoulders', supersetGroup: suffix },
  { role: 'accessory', patterns: ['isolation'], muscle: 'triceps', supersetGroup: suffix },
  { role: 'accessory', patterns: ['isolation'], muscle: 'calves', optional: true },
  { role: 'accessory', patterns: ['isolation', 'carry'], muscle: 'core', optional: true },
];

/**
 * Plantillas de sesión por día. Cada una es fullbody con pecho y espalda
 * repetidos (pesado + accesorio) y rotación del resto de grupos, de modo que
 * al entrenar 2, 3 o 4 días el volumen semanal siga cuadrando.
 */
const DAY_TEMPLATES: Array<{ name: string; slots: Slot[] }> = [
  {
    name: 'DÍA A · Empuje pesado',
    slots: [
      { role: 'primary', patterns: ['horizontal-push'], muscle: 'chest' },
      { role: 'primary', patterns: ['horizontal-pull'], muscle: 'back' },
      { role: 'secondary', patterns: ['squat'], muscle: 'quads' },
      { role: 'secondary', patterns: ['horizontal-push'], muscle: 'chest' },
      { role: 'secondary', patterns: ['vertical-pull'], muscle: 'back' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'quads', optional: true },
      ...PUSH_PULL_CORE('A1'),
    ],
  },
  {
    name: 'DÍA B · Tracción pesada',
    slots: [
      { role: 'primary', patterns: ['vertical-pull'], muscle: 'back' },
      { role: 'primary', patterns: ['horizontal-push'], muscle: 'chest' },
      { role: 'secondary', patterns: ['hinge'], muscle: 'hamstrings' },
      { role: 'secondary', patterns: ['horizontal-pull'], muscle: 'back' },
      { role: 'secondary', patterns: ['isolation'], muscle: 'chest' },
      { role: 'accessory', patterns: ['vertical-push'], muscle: 'shoulders' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'biceps', supersetGroup: 'B1' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'triceps', supersetGroup: 'B1' },
      { role: 'accessory', patterns: ['hinge', 'lunge'], muscle: 'glutes', optional: true },
      { role: 'accessory', patterns: ['isolation'], muscle: 'calves', optional: true },
    ],
  },
  {
    name: 'DÍA C · Volumen y densidad',
    slots: [
      { role: 'primary', patterns: ['horizontal-push'], muscle: 'chest' },
      { role: 'primary', patterns: ['horizontal-pull'], muscle: 'back' },
      { role: 'secondary', patterns: ['squat', 'lunge'], muscle: 'quads' },
      { role: 'secondary', patterns: ['isolation'], muscle: 'chest' },
      { role: 'secondary', patterns: ['isolation', 'vertical-pull'], muscle: 'back' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'hamstrings', optional: true },
      { role: 'accessory', patterns: ['isolation', 'horizontal-pull'], muscle: 'shoulders', supersetGroup: 'C1' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'biceps', supersetGroup: 'C1' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'calves', optional: true },
      { role: 'accessory', patterns: ['isolation', 'carry'], muscle: 'core', optional: true },
    ],
  },
  {
    name: 'DÍA D · Bombeo y puntos débiles',
    slots: [
      { role: 'primary', patterns: ['horizontal-pull', 'vertical-pull'], muscle: 'back' },
      { role: 'primary', patterns: ['horizontal-push'], muscle: 'chest' },
      { role: 'secondary', patterns: ['hinge', 'lunge'], muscle: 'glutes' },
      { role: 'secondary', patterns: ['squat', 'lunge'], muscle: 'quads' },
      { role: 'secondary', patterns: ['isolation'], muscle: 'chest' },
      { role: 'secondary', patterns: ['isolation'], muscle: 'back' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'hamstrings', optional: true },
      { role: 'accessory', patterns: ['isolation'], muscle: 'shoulders', supersetGroup: 'D1' },
      { role: 'accessory', patterns: ['isolation'], muscle: 'calves', supersetGroup: 'D1' },
      { role: 'accessory', patterns: ['isolation', 'carry'], muscle: 'core', optional: true },
    ],
  },
];

/** Grupos que la plantilla repite varias veces dentro de la misma sesión. */
const REPEATED_MUSCLES: MuscleGroup[] = ['chest', 'back'];

// ──────────────────────────── Selección ─────────────────────────────────────

/**
 * Puntúa un ejercicio para un hueco concreto. Gana el que mejor encaje en
 * patrón y papel, con preferencia por los marcados como favoritos.
 */
function scoreExercise(exercise: Exercise, slot: Slot, profile: GymProfile): number {
  if (exercise.primary !== slot.muscle) return -1;

  const patternIndex = slot.patterns.indexOf(exercise.pattern);
  if (patternIndex === -1) return -1;

  let score = 100 - patternIndex * 10;

  if (profile.favoriteExerciseIds.includes(exercise.id)) score += 50;

  if (slot.role === 'primary') {
    // Para el básico del día interesa carga alta y progresión limpia.
    score += exercise.compound ? 30 : -40;
    score += exercise.fatigueCost * 4;
    // Un principiante progresa mejor con algo guiado que con barra libre.
    if (profile.experience === 'beginner' && exercise.fatigueCost >= 5) score -= 25;
    if (profile.experience === 'advanced' && exercise.equipment === 'barbell') score += 10;
  } else if (slot.role === 'secondary') {
    score += exercise.compound ? 12 : 0;
    score -= exercise.fatigueCost * 3;
  } else {
    // Los accesorios buscan estímulo barato: poca fatiga sistémica.
    score += exercise.compound ? -15 : 15;
    score -= exercise.fatigueCost * 5;
    // Aislamientos duros en estiramiento responden bien a las técnicas
    // avanzadas que la app aplica en la última serie.
    if (exercise.profile === 'stretch') score += 6;
  }

  return score;
}

/**
 * Series de cada hueco. El volumen que importa es el semanal, así que la dosis
 * por sesión se reparte entre los días: repetir las mismas series los cuatro
 * días dispararía el total muy por encima del rango recomendado.
 */
function setsFor(slot: Slot, profile: GymProfile): number {
  const base = slot.role === 'primary' ? 4 : 3;

  // El objetivo de volumen es semanal, así que la dosis por sesión se escala
  // con los días entrenados: repetir la misma cada día multiplicaría el total.
  let sets = base * (3 / profile.daysPerWeek);

  // Pecho y espalda ocupan varios huecos por sesión, y los brazos reciben
  // mucho trabajo indirecto de presses y remos. En ambos casos la dosis de
  // cada hueco baja para que el total semanal caiga dentro del rango.
  if (REPEATED_MUSCLES.includes(slot.muscle)) sets *= slot.role === 'primary' ? 0.75 : 0.5;
  if (slot.muscle === 'biceps' || slot.muscle === 'triceps') sets *= 0.5;

  // Un grupo priorizado gana una serie en el básico del día y media en los
  // huecos secundarios, que es donde se nota sin desbordar el rango semanal.
  if (profile.priorities.includes(slot.muscle)) {
    sets += slot.role === 'primary' ? 1 : slot.role === 'secondary' ? 0.5 : 0;
  }

  if (profile.experience === 'beginner') sets -= 1;
  if (profile.experience === 'advanced' && slot.role === 'primary') sets += 0.5;

  // Los accesorios pueden quedarse en 2 series; el básico del día nunca baja
  // de 3 para que siga siendo el plato fuerte de la sesión.
  const floor = slot.role === 'primary' ? 3 : 2;
  return Math.min(6, Math.max(floor, Math.round(sets)));
}

/** Técnica avanzada apropiada para el hueco. */
function techniqueFor(slot: Slot, exercise: Exercise, profile: GymProfile): RoutineExercise['technique'] {
  // Un principiante primero necesita técnica y constancia, no intensificadores.
  if (profile.experience === 'beginner') return 'straight';
  if (slot.supersetGroup) return 'superset';
  if (slot.role === 'primary') return exercise.compound ? 'top-backoff' : 'straight';
  if (slot.role === 'accessory' || !exercise.compound) {
    if (exercise.profile === 'stretch') return 'lengthened-partials';
    return exercise.fatigueCost <= 2 ? 'drop-set' : 'myo-reps';
  }
  return 'straight';
}

function rirFor(slot: Slot, profile: GymProfile): number {
  if (profile.experience === 'beginner') return slot.role === 'primary' ? 3 : 2;
  if (slot.role === 'primary') return 2;
  return slot.role === 'secondary' ? 1 : 0;
}

/** Cuántos huecos caben en el tiempo disponible. */
function slotBudget(minutes: number): number {
  // Un ejercicio ronda los 7 minutos de media: los básicos pesados gastan más
  // y los accesorios en superserie bastante menos.
  return Math.max(4, Math.round(minutes / 7));
}

/**
 * Genera la rutina a partir del cuestionario. Recorre los huecos de cada día
 * eligiendo el mejor ejercicio disponible y evitando repetir dentro del día.
 */
export function buildRoutineFromProfile(profile: GymProfile, now = Date.now()): Routine {
  const pool = availableExercises(profile);
  const budget = slotBudget(profile.sessionMinutes);
  const templates = DAY_TEMPLATES.slice(0, profile.daysPerWeek);

  // Cuántas veces se ha usado cada ejercicio en la semana: a igualdad de
  // puntuación se prefiere variar para repartir el estímulo.
  const weeklyUses = new Map<string, number>();

  const days: RoutineDay[] = templates.map((template, dayIndex) => {
    const chosen = new Set<string>();
    const exercises: RoutineExercise[] = [];

    // Los huecos opcionales solo entran si el tiempo lo permite, y se rotan
    // entre días para que ninguno (core, gemelos...) quede siempre fuera.
    const required = template.slots.filter((s) => !s.optional);
    const optional = template.slots.filter((s) => s.optional);
    const rotated = optional.map((_, i) => optional[(i + dayIndex) % optional.length]);
    const slots = [...required, ...rotated].slice(0, Math.max(required.length, budget));

    for (const slot of slots) {
      const candidate = pool
        .filter((e) => !chosen.has(e.id))
        .map((e) => ({
          exercise: e,
          score: scoreExercise(e, slot, profile) - (weeklyUses.get(e.id) ?? 0) * 12,
        }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!candidate) continue;

      const { exercise } = candidate;
      chosen.add(exercise.id);
      weeklyUses.set(exercise.id, (weeklyUses.get(exercise.id) ?? 0) + 1);

      exercises.push({
        exerciseId: exercise.id,
        sets: setsFor(slot, profile),
        targetReps: exercise.repRange,
        targetRir: rirFor(slot, profile),
        technique: techniqueFor(slot, exercise, profile),
        restSeconds: exercise.restSeconds,
        supersetGroup: slot.supersetGroup,
      });
    }

    // Una superserie sin pareja no tiene sentido: se deja como serie recta.
    const groupCounts = new Map<string, number>();
    for (const e of exercises) {
      if (e.supersetGroup) groupCounts.set(e.supersetGroup, (groupCounts.get(e.supersetGroup) ?? 0) + 1);
    }
    const cleaned = exercises.map((e) =>
      e.supersetGroup && groupCounts.get(e.supersetGroup) === 1
        ? { ...e, supersetGroup: undefined, technique: 'straight' as const }
        : e,
    );

    return {
      id: `day-${dayIndex + 1}`,
      name: template.name,
      weekday: profile.weekdays[dayIndex] ?? null,
      exercises: cleaned,
    };
  });

  // Los favoritos que no hayan entrado en ningún día se añaden al día con
  // menos trabajo, para que el cuestionario se respete.
  for (const favoriteId of profile.favoriteExerciseIds) {
    const exercise = EXERCISE_BY_ID[favoriteId];
    if (!exercise) continue;
    if (profile.excludedExerciseIds.includes(favoriteId)) continue;
    if (days.some((d) => d.exercises.some((e) => e.exerciseId === favoriteId))) continue;

    const target = [...days].sort((a, b) => a.exercises.length - b.exercises.length)[0];
    if (!target) continue;
    target.exercises.push({
      exerciseId: favoriteId,
      sets: 3,
      targetReps: exercise.repRange,
      targetRir: 1,
      technique: 'straight',
      restSeconds: exercise.restSeconds,
    });
  }

  return {
    id: 'routine-custom',
    name: routineName(profile),
    days,
    priorities: profile.priorities,
    createdAt: now,
    updatedAt: now,
  };
}

function routineName(profile: GymProfile): string {
  const labels: Record<MuscleGroup, string> = {
    chest: 'PECHO',
    back: 'ESPALDA',
    quads: 'CUÁDRICEPS',
    hamstrings: 'ISQUIOS',
    glutes: 'GLÚTEO',
    shoulders: 'HOMBRO',
    biceps: 'BÍCEPS',
    triceps: 'TRÍCEPS',
    calves: 'GEMELOS',
    core: 'CORE',
  };
  const focus = profile.priorities.map((m) => labels[m]).join(' + ');
  return `FULLBODY ${profile.daysPerWeek}D${focus ? ` · ${focus}` : ''}`;
}

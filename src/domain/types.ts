/** Grupos musculares cubiertos por la app. */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'core';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'smith'
  | 'kettlebell';

/** Patrón de movimiento, usado para equilibrar la sesión. */
export type MovementPattern =
  | 'horizontal-push'
  | 'vertical-push'
  | 'horizontal-pull'
  | 'vertical-pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation'
  | 'carry';

/** Curva de resistencia: dónde el ejercicio es más exigente. */
export type ResistanceProfile = 'stretch' | 'mid' | 'contraction' | 'flat';

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  pattern: MovementPattern;
  /** Curva de resistencia, relevante para elegir técnicas avanzadas. */
  profile: ResistanceProfile;
  /** true si es un básico pesado (multiarticular de alta carga). */
  compound: boolean;
  /** Coste sistémico 1-5; condiciona la frecuencia y el orden en la sesión. */
  fatigueCost: 1 | 2 | 3 | 4 | 5;
  /** Rango de repeticiones recomendado por la literatura para este patrón. */
  repRange: [number, number];
  /** Descanso recomendado en segundos. */
  restSeconds: number;
  cues: string[];
  /** Fotogramas demostrativos (inicio y final del recorrido). */
  media: string[];
  /** Ejercicios intercambiables (mismo patrón/estímulo). */
  alternatives: string[];
}

/** Técnicas avanzadas de intensificación. */
export type AdvancedTechnique =
  | 'straight'
  | 'myo-reps'
  | 'drop-set'
  | 'rest-pause'
  | 'cluster'
  | 'lengthened-partials'
  | 'superset'
  | 'top-backoff';

export interface SetPrescription {
  /** Índice de la serie dentro del ejercicio (0-based). */
  index: number;
  targetReps: [number, number];
  /** Reps en reserva objetivo. */
  targetRir: number;
  /** Peso sugerido en kg, null si no hay histórico suficiente. */
  suggestedWeight: number | null;
  technique: AdvancedTechnique;
  restSeconds: number;
  /** true si es serie de aproximación (no cuenta como volumen efectivo). */
  warmup: boolean;
}

export interface LoggedSet {
  id: string;
  reps: number;
  weight: number;
  rir: number;
  completedAt: number;
  technique: AdvancedTechnique;
  warmup: boolean;
  /** Reps extra conseguidas en myo-reps / rest-pause / drop-set. */
  extraReps?: number[];
  notes?: string;
}

export interface RoutineExercise {
  exerciseId: string;
  sets: number;
  targetReps: [number, number];
  targetRir: number;
  technique: AdvancedTechnique;
  restSeconds: number;
  /** Identificador de superserie; los que comparten valor se alternan. */
  supersetGroup?: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RoutineDay {
  id: string;
  name: string;
  /** Día de la semana asignado; null = libre, se entrena cuando se quiera. */
  weekday: Weekday | null;
  exercises: RoutineExercise[];
}

export interface Routine {
  id: string;
  name: string;
  days: RoutineDay[];
  /** Grupos musculares priorizados: reciben más volumen. */
  priorities: MuscleGroup[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionExercise {
  exerciseId: string;
  prescriptions: SetPrescription[];
  loggedSets: LoggedSet[];
  supersetGroup?: string;
  notes?: string;
  /** true cuando el usuario marca el ejercicio como terminado o saltado. */
  skipped: boolean;
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface WorkoutSession {
  id: string;
  routineId: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  finishedAt: number | null;
  status: SessionStatus;
  /** Suma de milisegundos ya acumulados antes de la pausa actual. */
  accumulatedMs: number;
  /** Momento en que arrancó el tramo activo actual; null si está pausada. */
  resumedAt: number | null;
  exercises: SessionExercise[];
  bodyweight?: number;
  notes?: string;
}

/** Fase del mesociclo. */
export type MesocyclePhase = 'accumulation' | 'intensification' | 'peak' | 'deload';

export interface MesocycleState {
  startedAt: number;
  /** Semana actual dentro del mesociclo, 1-based. */
  week: number;
  /** Duración total en semanas, deload incluido. */
  lengthWeeks: number;
}

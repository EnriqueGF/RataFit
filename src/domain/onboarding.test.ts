import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  availableExercises,
  buildRoutineFromProfile,
  uncoveredMuscles,
  type GymProfile,
} from './onboarding';
import { EXERCISE_BY_ID } from '../data/exercises';
import { plannedWeeklyVolume } from './routineBuilder';
import { WEEKLY_VOLUME_TARGETS } from './training';
import type { MuscleGroup } from './types';

const profile = (overrides: Partial<GymProfile> = {}): GymProfile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
});

/** Todos los ejercicios de la rutina, en plano. */
const allExerciseIds = (p: GymProfile) =>
  buildRoutineFromProfile(p, 0).days.flatMap((d) => d.exercises.map((e) => e.exerciseId));

describe('availableExercises', () => {
  it('solo devuelve ejercicios del material disponible', () => {
    const list = availableExercises(profile({ equipment: ['dumbbell'] }));
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.equipment === 'dumbbell')).toBe(true);
  });

  it('respeta los ejercicios descartados', () => {
    const list = availableExercises(profile({ excludedExerciseIds: ['bench-press'] }));
    expect(list.map((e) => e.id)).not.toContain('bench-press');
  });

  it('devuelve lista vacía si no hay material', () => {
    expect(availableExercises(profile({ equipment: [] }))).toEqual([]);
  });
});

describe('uncoveredMuscles', () => {
  it('no avisa de nada con un gimnasio completo', () => {
    expect(uncoveredMuscles(profile())).toEqual([]);
  });

  it('avisa de los grupos que se quedan sin ejercicios', () => {
    // Solo peso corporal: no hay forma de entrenar cuádriceps ni isquios.
    const missing = uncoveredMuscles(profile({ equipment: ['bodyweight'] }));
    expect(missing).toContain('quads');
    expect(missing).toContain('hamstrings');
  });

  it('tiene en cuenta los ejercicios descartados', () => {
    const chestIds = Object.values(EXERCISE_BY_ID)
      .filter((e) => e.primary === 'chest')
      .map((e) => e.id);
    expect(uncoveredMuscles(profile({ excludedExerciseIds: chestIds }))).toContain('chest');
  });
});

describe('buildRoutineFromProfile', () => {
  it('genera tantos días como se hayan pedido', () => {
    for (const days of [2, 3, 4, 5] as const) {
      const routine = buildRoutineFromProfile(profile({ daysPerWeek: days }), 0);
      expect(routine.days, `${days} días`).toHaveLength(days);
    }
  });

  it('asigna los días de la semana elegidos', () => {
    const routine = buildRoutineFromProfile(profile({ daysPerWeek: 3, weekdays: [2, 4, 6] }), 0);
    expect(routine.days.map((d) => d.weekday)).toEqual([2, 4, 6]);
  });

  it('genera cinco sesiones completas con volumen de pecho y espalda controlado', () => {
    const routine = buildRoutineFromProfile(profile({ daysPerWeek: 5, weekdays: [1, 2, 3, 4, 5] }), 0);
    expect(routine.days.map(d => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    for (const day of routine.days) {
      expect(day.exercises.length).toBeGreaterThan(0);
      expect(new Set(day.exercises.map(e => e.exerciseId)).size).toBe(day.exercises.length);
      expect(EXERCISE_BY_ID[day.exercises[0].exerciseId].compound).toBe(true);
    }
    const volume = plannedWeeklyVolume(routine);
    for (const muscle of ['chest', 'back'] as const) {
      expect(volume[muscle]).toBeGreaterThanOrEqual(WEEKLY_VOLUME_TARGETS[muscle][0]);
      expect(volume[muscle]).toBeLessThanOrEqual(WEEKLY_VOLUME_TARGETS[muscle][1]);
    }
  });

  it('deja los días libres si no se eligió ninguno', () => {
    const routine = buildRoutineFromProfile(profile({ weekdays: [] }), 0);
    expect(routine.days.every((d) => d.weekday === null)).toBe(true);
  });

  it('nunca usa material que no se tiene', () => {
    const routine = buildRoutineFromProfile(profile({ equipment: ['machine', 'cable'] }), 0);
    for (const day of routine.days) {
      for (const e of day.exercises) {
        expect(['machine', 'cable'], e.exerciseId).toContain(EXERCISE_BY_ID[e.exerciseId].equipment);
      }
    }
  });

  it('nunca incluye un ejercicio descartado', () => {
    const excluded = ['bench-press', 'barbell-row', 'back-squat'];
    expect(allExerciseIds(profile({ excludedExerciseIds: excluded }))).not.toContain('bench-press');
    expect(allExerciseIds(profile({ excludedExerciseIds: excluded }))).not.toContain('back-squat');
  });

  it('incluye siempre los ejercicios marcados como favoritos', () => {
    const ids = allExerciseIds(profile({ favoriteExerciseIds: ['hip-thrust', 'hammer-curl'] }));
    expect(ids).toContain('hip-thrust');
    expect(ids).toContain('hammer-curl');
  });

  it('un descarte gana a un favorito contradictorio', () => {
    const ids = allExerciseIds(
      profile({ favoriteExerciseIds: ['hip-thrust'], excludedExerciseIds: ['hip-thrust'] }),
    );
    expect(ids).not.toContain('hip-thrust');
  });

  it('no repite ejercicios dentro del mismo día', () => {
    for (const day of buildRoutineFromProfile(profile(), 0).days) {
      const ids = day.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size, day.name).toBe(ids.length);
    }
  });

  it('entrena las prioridades en todos los días', () => {
    const routine = buildRoutineFromProfile(profile({ priorities: ['chest', 'back'] }), 0);
    for (const day of routine.days) {
      const primaries = day.exercises.map((e) => EXERCISE_BY_ID[e.exerciseId].primary);
      expect(primaries, day.name).toContain('chest');
      expect(primaries, day.name).toContain('back');
    }
  });

  it('da más series a los grupos prioritarios', () => {
    const chestFocus = plannedWeeklyVolume(buildRoutineFromProfile(profile({ priorities: ['chest'] }), 0));
    const legFocus = plannedWeeklyVolume(buildRoutineFromProfile(profile({ priorities: ['quads'] }), 0));
    expect(chestFocus.chest).toBeGreaterThan(legFocus.chest);
    expect(legFocus.quads).toBeGreaterThan(chestFocus.quads);
  });

  it('mantiene pecho y espalda en rango con el perfil por defecto', () => {
    const volume = plannedWeeklyVolume(buildRoutineFromProfile(profile(), 0));
    for (const muscle of ['chest', 'back'] as MuscleGroup[]) {
      const [min, max] = WEEKLY_VOLUME_TARGETS[muscle];
      expect(volume[muscle], muscle).toBeGreaterThanOrEqual(min);
      expect(volume[muscle], muscle).toBeLessThanOrEqual(max);
    }
  });

  it('abre cada día con un ejercicio compuesto', () => {
    for (const day of buildRoutineFromProfile(profile(), 0).days) {
      expect(EXERCISE_BY_ID[day.exercises[0].exerciseId].compound, day.name).toBe(true);
    }
  });

  it('recorta la sesión si hay poco tiempo', () => {
    const short = buildRoutineFromProfile(profile({ sessionMinutes: 45 }), 0);
    const long = buildRoutineFromProfile(profile({ sessionMinutes: 90 }), 0);
    expect(short.days[0].exercises.length).toBeLessThan(long.days[0].exercises.length);
  });

  it('a un principiante no le pone técnicas de intensificación', () => {
    const routine = buildRoutineFromProfile(profile({ experience: 'beginner' }), 0);
    for (const day of routine.days) {
      for (const e of day.exercises) {
        expect(e.technique, e.exerciseId).toBe('straight');
      }
    }
  });

  it('a un principiante le deja un RIR más conservador y menos series', () => {
    const beginner = buildRoutineFromProfile(profile({ experience: 'beginner' }), 0);
    const advanced = buildRoutineFromProfile(profile({ experience: 'advanced' }), 0);
    const sets = (r: typeof beginner) =>
      r.days.reduce((sum, d) => sum + d.exercises.reduce((n, e) => n + e.sets, 0), 0);
    expect(sets(beginner)).toBeLessThan(sets(advanced));
    expect(Math.min(...beginner.days[0].exercises.map((e) => e.targetRir))).toBeGreaterThanOrEqual(2);
  });

  it('usa técnicas avanzadas en los accesorios de un intermedio', () => {
    const routine = buildRoutineFromProfile(profile({ experience: 'intermediate' }), 0);
    const techniques = routine.days.flatMap((d) => d.exercises.map((e) => e.technique));
    expect(techniques.some((t) => t !== 'straight')).toBe(true);
  });

  it('empareja las superseries de dos en dos o las convierte en series rectas', () => {
    for (const day of buildRoutineFromProfile(profile(), 0).days) {
      const counts = new Map<string, number>();
      for (const e of day.exercises) {
        if (e.supersetGroup) counts.set(e.supersetGroup, (counts.get(e.supersetGroup) ?? 0) + 1);
      }
      for (const [group, count] of counts) {
        expect(count, `${day.name} · ${group}`).toBe(2);
      }
    }
  });

  it('hereda el rango de repeticiones y el descanso de cada ejercicio', () => {
    for (const day of buildRoutineFromProfile(profile(), 0).days) {
      for (const e of day.exercises) {
        const exercise = EXERCISE_BY_ID[e.exerciseId];
        expect(e.targetReps).toEqual(exercise.repRange);
        expect(e.restSeconds).toBe(exercise.restSeconds);
      }
    }
  });

  it('funciona en un gimnasio mínimo de mancuernas y peso corporal', () => {
    const routine = buildRoutineFromProfile(
      profile({ equipment: ['dumbbell', 'bodyweight'] }),
      0,
    );
    expect(routine.days).toHaveLength(3);
    for (const day of routine.days) {
      expect(day.exercises.length, day.name).toBeGreaterThan(3);
    }
  });

  it('no se rompe si no hay material seleccionado', () => {
    const routine = buildRoutineFromProfile(profile({ equipment: [] }), 0);
    expect(routine.days).toHaveLength(3);
    expect(routine.days.every((d) => d.exercises.length === 0)).toBe(true);
  });

  it('refleja las prioridades en el nombre de la rutina', () => {
    expect(buildRoutineFromProfile(profile({ priorities: ['chest', 'back'] }), 0).name).toBe(
      'FULLBODY 3D · PECHO + ESPALDA',
    );
    expect(buildRoutineFromProfile(profile({ priorities: [], daysPerWeek: 4 }), 0).name).toBe(
      'FULLBODY 4D',
    );
  });

  it('ignora favoritos que no existen', () => {
    expect(() => buildRoutineFromProfile(profile({ favoriteExerciseIds: ['fantasma'] }), 0)).not.toThrow();
    expect(allExerciseIds(profile({ favoriteExerciseIds: ['fantasma'] }))).not.toContain('fantasma');
  });
});

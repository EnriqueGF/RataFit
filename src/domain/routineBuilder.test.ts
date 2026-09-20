import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITIES,
  DEFAULT_WEEKDAYS,
  createDefaultRoutine,
  createEmptyDay,
  defaultRoutineExercise,
  estimateDayMinutes,
  plannedWeeklyVolume,
  suggestNextDay,
} from './routineBuilder';
import { EXERCISE_BY_ID, EXERCISES } from '../data/exercises';
import { WEEKLY_VOLUME_TARGETS } from './training';
import type { MuscleGroup } from './types';

describe('biblioteca de ejercicios', () => {
  it('no repite identificadores', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todas las alternativas apuntan a ejercicios existentes', () => {
    for (const exercise of EXERCISES) {
      for (const alternative of exercise.alternatives) {
        expect(EXERCISE_BY_ID[alternative], `${exercise.id} → ${alternative}`).toBeDefined();
      }
    }
  });

  it('ningún ejercicio se lista como alternativa de sí mismo', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.alternatives).not.toContain(exercise.id);
    }
  });

  it('cada ejercicio trae imágenes, consignas y un rango de repeticiones coherente', () => {
    for (const exercise of EXERCISES) {
      // Dos fotogramas: inicio y final del recorrido.
      expect(exercise.media, exercise.id).toHaveLength(2);
      for (const frame of exercise.media) {
        expect(frame).toMatch(/^https:\/\//);
      }
      expect(exercise.cues.length).toBeGreaterThan(0);
      expect(exercise.repRange[0]).toBeLessThanOrEqual(exercise.repRange[1]);
      expect(exercise.restSeconds).toBeGreaterThan(0);
      expect(exercise.secondary).not.toContain(exercise.primary);
    }
  });

  it('no reutiliza las mismas imágenes en dos ejercicios distintos', () => {
    const seen = new Map<string, string>();
    for (const exercise of EXERCISES) {
      const key = exercise.media[0];
      const previous = seen.get(key);
      expect(previous, `${exercise.id} comparte imágenes con ${previous}`).toBeUndefined();
      seen.set(key, exercise.id);
    }
  });

  it('cubre pecho y espalda con varias opciones por material', () => {
    const chest = EXERCISES.filter((e) => e.primary === 'chest');
    const back = EXERCISES.filter((e) => e.primary === 'back');
    expect(chest.length).toBeGreaterThanOrEqual(8);
    expect(back.length).toBeGreaterThanOrEqual(8);
    // Ambos grupos deben poder entrenarse con barra, mancuerna, máquina y polea.
    for (const group of [chest, back]) {
      const equipment = new Set(group.map((e) => e.equipment));
      expect(equipment.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('hay al menos un ejercicio de cada grupo muscular', () => {
    const primaries = new Set(EXERCISES.map((e) => e.primary));
    for (const muscle of Object.keys(WEEKLY_VOLUME_TARGETS) as MuscleGroup[]) {
      expect(primaries, muscle).toContain(muscle);
    }
  });
});

describe('createDefaultRoutine', () => {
  const routine = createDefaultRoutine(1_000);

  it('genera tres días asignados a lunes, miércoles y viernes', () => {
    expect(routine.days).toHaveLength(3);
    expect(routine.days.map((d) => d.weekday)).toEqual(DEFAULT_WEEKDAYS);
  });

  it('prioriza pecho y espalda', () => {
    expect(routine.priorities).toEqual(DEFAULT_PRIORITIES);
    expect(routine.priorities).toEqual(['chest', 'back']);
  });

  it('usa solo ejercicios de la biblioteca', () => {
    for (const day of routine.days) {
      for (const exercise of day.exercises) {
        expect(EXERCISE_BY_ID[exercise.exerciseId], exercise.exerciseId).toBeDefined();
      }
    }
  });

  it('entrena pecho y espalda los tres días', () => {
    for (const day of routine.days) {
      const primaries = day.exercises.map((e) => EXERCISE_BY_ID[e.exerciseId].primary);
      expect(primaries.filter((m) => m === 'chest').length).toBeGreaterThanOrEqual(2);
      expect(primaries.filter((m) => m === 'back').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('abre cada día con un básico pesado', () => {
    for (const day of routine.days) {
      const first = EXERCISE_BY_ID[day.exercises[0].exerciseId];
      expect(first.compound, day.name).toBe(true);
      expect(first.fatigueCost).toBeGreaterThanOrEqual(3);
    }
  });

  it('reserva las técnicas de intensificación para los accesorios', () => {
    for (const day of routine.days) {
      for (const routineExercise of day.exercises) {
        const exercise = EXERCISE_BY_ID[routineExercise.exerciseId];
        const intense = ['myo-reps', 'drop-set', 'rest-pause', 'lengthened-partials'];
        if (intense.includes(routineExercise.technique)) {
          expect(exercise.fatigueCost, exercise.name).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('empareja las superseries de dos en dos', () => {
    for (const day of routine.days) {
      const groups: Record<string, number> = {};
      for (const exercise of day.exercises) {
        if (exercise.supersetGroup) {
          groups[exercise.supersetGroup] = (groups[exercise.supersetGroup] ?? 0) + 1;
        }
      }
      for (const [group, count] of Object.entries(groups)) {
        expect(count, `${day.name} · ${group}`).toBe(2);
      }
    }
  });

  it('hereda rango de repeticiones y descanso del ejercicio', () => {
    const day = routine.days[0];
    const bench = day.exercises.find((e) => e.exerciseId === 'bench-press')!;
    expect(bench.targetReps).toEqual(EXERCISE_BY_ID['bench-press'].repRange);
    expect(bench.restSeconds).toBe(EXERCISE_BY_ID['bench-press'].restSeconds);
  });

  it('mantiene cada día en una duración razonable', () => {
    for (const day of routine.days) {
      const minutes = estimateDayMinutes(day);
      expect(minutes, day.name).toBeGreaterThan(40);
      expect(minutes, day.name).toBeLessThan(110);
    }
  });
});

describe('plannedWeeklyVolume', () => {
  const routine = createDefaultRoutine(0);
  const volume = plannedWeeklyVolume(routine);

  it('deja pecho y espalda dentro del rango recomendado', () => {
    for (const muscle of ['chest', 'back'] as const) {
      const [min, max] = WEEKLY_VOLUME_TARGETS[muscle];
      expect(volume[muscle], muscle).toBeGreaterThanOrEqual(min);
      expect(volume[muscle], muscle).toBeLessThanOrEqual(max);
    }
  });

  it('da a las prioridades más volumen que a las piernas', () => {
    expect(volume.chest).toBeGreaterThan(volume.quads);
    expect(volume.back).toBeGreaterThan(volume.quads);
  });

  it('no deja ningún grupo por debajo de su mínimo', () => {
    for (const [muscle, [min]] of Object.entries(WEEKLY_VOLUME_TARGETS)) {
      expect(volume[muscle] ?? 0, muscle).toBeGreaterThanOrEqual(min);
    }
  });

  it('cuenta media serie por cada músculo secundario', () => {
    const single = plannedWeeklyVolume({
      ...routine,
      days: [{ id: 'd', name: 'D', weekday: null, exercises: [defaultRoutineExercise('bench-press')] }],
    });
    // 4 series: pecho 4, tríceps y hombro 2 cada uno.
    expect(single.chest).toBe(4);
    expect(single.triceps).toBe(2);
    expect(single.shoulders).toBe(2);
  });
});

describe('estimateDayMinutes', () => {
  it('devuelve 0 para un día vacío', () => {
    expect(estimateDayMinutes(createEmptyDay('x', 'Vacío'))).toBe(0);
  });

  it('crece con el número de series', () => {
    const one = { ...createEmptyDay('a', 'A'), exercises: [defaultRoutineExercise('lateral-raise')] };
    const many = {
      ...one,
      exercises: [{ ...defaultRoutineExercise('lateral-raise'), sets: 9 }],
    };
    expect(estimateDayMinutes(many)).toBeGreaterThan(estimateDayMinutes(one));
  });

  it('descuenta tiempo cuando el ejercicio va en superserie', () => {
    const solo = { ...createEmptyDay('a', 'A'), exercises: [defaultRoutineExercise('lateral-raise')] };
    const paired = {
      ...solo,
      exercises: [{ ...defaultRoutineExercise('lateral-raise'), supersetGroup: 'X' }],
    };
    expect(estimateDayMinutes(paired)).toBeLessThan(estimateDayMinutes(solo));
  });

  it('ignora ejercicios que no existen', () => {
    const day = {
      ...createEmptyDay('a', 'A'),
      exercises: [{ ...defaultRoutineExercise('lateral-raise'), exerciseId: 'fantasma' }],
    };
    expect(estimateDayMinutes(day)).toBe(0);
  });
});

describe('suggestNextDay', () => {
  const routine = createDefaultRoutine(0);
  // 2024-01-03 fue miércoles, el día asignado al segundo entreno.
  const wednesday = new Date('2024-01-03T10:00:00Z').getTime();
  const tuesday = new Date('2024-01-02T10:00:00Z').getTime();

  it('propone el día que toca por calendario', () => {
    expect(suggestNextDay(routine, {}, wednesday)?.id).toBe('day-2');
  });

  it('si hoy no toca, propone el menos reciente', () => {
    const lastTrained = { 'day-1': 5_000, 'day-2': 1_000, 'day-3': 9_000 };
    expect(suggestNextDay(routine, lastTrained, tuesday)?.id).toBe('day-2');
  });

  it('propone el primero sin registrar cuando no hay histórico', () => {
    expect(suggestNextDay(routine, {}, tuesday)?.id).toBe('day-1');
  });

  it('devuelve null si la rutina no tiene días', () => {
    expect(suggestNextDay({ ...routine, days: [] }, {}, tuesday)).toBeNull();
  });
});

describe('defaultRoutineExercise', () => {
  it('da cuatro series a los básicos y tres a los aislamientos', () => {
    expect(defaultRoutineExercise('bench-press').sets).toBe(4);
    expect(defaultRoutineExercise('lateral-raise').sets).toBe(3);
  });

  it('arranca siempre con series rectas', () => {
    expect(defaultRoutineExercise('bench-press').technique).toBe('straight');
  });

  it('usa valores seguros para un ejercicio desconocido', () => {
    const fallback = defaultRoutineExercise('fantasma');
    expect(fallback.sets).toBe(3);
    expect(fallback.targetReps).toEqual([8, 12]);
    expect(fallback.restSeconds).toBe(120);
  });
});

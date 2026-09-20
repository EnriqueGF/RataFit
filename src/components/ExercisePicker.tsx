import { useMemo, useState } from 'react';
import {
  EQUIPMENT_LABELS,
  EXERCISES,
  MUSCLE_LABELS,
  getExercise,
} from '../data/exercises';
import type { Equipment, MuscleGroup } from '../domain/types';
import { Empty, Modal } from './ui';
import { ExerciseMedia } from './ExerciseMedia';

const MUSCLE_ORDER: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'biceps',
  'triceps',
  'calves',
  'core',
];

export interface ExercisePickerProps {
  title?: string;
  /** Ejercicios ya presentes, que se marcan y no se pueden volver a añadir. */
  excludeIds?: string[];
  /** Si se indica, la lista arranca filtrada por el grupo de este ejercicio. */
  suggestFor?: string;
  onSelect: (exerciseId: string) => void;
  onClose: () => void;
}

/**
 * Selector de ejercicios por grupo muscular, con GIF en cada fila para que se
 * entienda el movimiento sin abrirlo.
 */
export function ExercisePicker({
  title = 'Elegir ejercicio',
  excludeIds = [],
  suggestFor,
  onSelect,
  onClose,
}: ExercisePickerProps) {
  const suggested = suggestFor ? getExercise(suggestFor) : undefined;
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>(suggested?.primary ?? 'all');
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all');
  const [query, setQuery] = useState('');

  const alternatives = suggested?.alternatives ?? [];

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return EXERCISES.filter((exercise) => {
      if (muscle !== 'all' && exercise.primary !== muscle) return false;
      if (equipment !== 'all' && exercise.equipment !== equipment) return false;
      if (normalized && !exercise.name.toLowerCase().includes(normalized)) return false;
      return true;
    }).sort((a, b) => {
      // Las alternativas directas del ejercicio actual van primero.
      const rank = (id: string) => (alternatives.includes(id) ? 0 : 1);
      return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'es');
    });
  }, [muscle, equipment, query, alternatives]);

  const equipmentOptions = useMemo(
    () => Array.from(new Set(EXERCISES.map((e) => e.equipment))).sort(),
    [],
  );

  return (
    <Modal title={title} onClose={onClose}>
      <input
        className="input"
        type="search"
        placeholder="> buscar ejercicio..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar ejercicio"
      />

      <div className="section-label">Grupo muscular</div>
      <div className="chip-row">
        <button
          type="button"
          className="chip chip--button"
          aria-pressed={muscle === 'all'}
          onClick={() => setMuscle('all')}
        >
          Todos
        </button>
        {MUSCLE_ORDER.map((group) => (
          <button
            key={group}
            type="button"
            className="chip chip--button"
            aria-pressed={muscle === group}
            onClick={() => setMuscle(group)}
          >
            {MUSCLE_LABELS[group]}
          </button>
        ))}
      </div>

      <div className="section-label">Material</div>
      <div className="chip-row">
        <button
          type="button"
          className="chip chip--button"
          aria-pressed={equipment === 'all'}
          onClick={() => setEquipment('all')}
        >
          Todo
        </button>
        {equipmentOptions.map((item) => (
          <button
            key={item}
            type="button"
            className="chip chip--button"
            aria-pressed={equipment === item}
            onClick={() => setEquipment(item)}
          >
            {EQUIPMENT_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="divider" />

      {results.length === 0 ? (
        <Empty glyph="∅">Ningún ejercicio coincide con el filtro.</Empty>
      ) : (
        <ul className="list-reset">
          {results.map((exercise) => {
            const already = excludeIds.includes(exercise.id);
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  className={`picker__item${already ? ' picker__item--selected' : ''}`}
                  disabled={already}
                  onClick={() => onSelect(exercise.id)}
                >
                  <ExerciseMedia frames={exercise.media} alt="" className="picker__thumb" animate={false} />
                  <span className="exercise__info">
                    <span className="picker__name">{exercise.name}</span>
                    <span className="picker__meta">
                      {MUSCLE_LABELS[exercise.primary]} · {EQUIPMENT_LABELS[exercise.equipment]} ·{' '}
                      {exercise.repRange[0]}-{exercise.repRange[1]} reps
                      {alternatives.includes(exercise.id) ? ' · ALTERNATIVA' : ''}
                      {already ? ' · YA INCLUIDO' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

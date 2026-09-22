import { useState } from 'react';
import { useApp } from '../state/AppContext';
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  TECHNIQUE_HELP,
  TECHNIQUE_LABELS,
  getExercise,
} from '../data/exercises';
import { WEEKDAY_SHORT, estimateDayMinutes } from '../domain/routineBuilder';
import type { AdvancedTechnique, MuscleGroup, Weekday } from '../domain/types';
import { Field, Panel } from './ui';
import { ExerciseMedia } from './ExerciseMedia';
import { NumberInput } from './NumberInput';
import { ExercisePicker } from './ExercisePicker';

const TECHNIQUES: AdvancedTechnique[] = [
  'straight',
  'top-backoff',
  'myo-reps',
  'drop-set',
  'rest-pause',
  'cluster',
  'lengthened-partials',
  'superset',
];

const ALL_MUSCLES: MuscleGroup[] = [
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

export function RoutineScreen() {
  const { state, dispatch } = useApp();
  const { routine } = state;
  const [picker, setPicker] = useState<
    | { mode: 'add'; dayId: string }
    | { mode: 'swap'; dayId: string; index: number; exerciseId: string }
    | null
  >(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <Panel title="Rutina">
        <Field label="Nombre" htmlFor="routine-name">
          <input
            id="routine-name"
            className="input"
            value={routine.name}
            onChange={(event) => dispatch({ type: 'routine/rename', name: event.target.value })}
          />
        </Field>

        <div className="section-label">Grupos prioritarios</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Los grupos marcados se destacan durante el entreno y se les exige el rango alto de volumen.
        </p>
        <div className="chip-row">
          {ALL_MUSCLES.map((muscle) => {
            const active = routine.priorities.includes(muscle);
            return (
              <button
                key={muscle}
                type="button"
                className="chip chip--button"
                aria-pressed={active}
                onClick={() =>
                  dispatch({
                    type: 'routine/setPriorities',
                    priorities: active
                      ? routine.priorities.filter((m) => m !== muscle)
                      : [...routine.priorities, muscle],
                  })
                }
              >
                {MUSCLE_LABELS[muscle]}
              </button>
            );
          })}
        </div>
      </Panel>

      {routine.days.map((day) => (
        <section className="panel" key={day.id}>
          <header className="panel__head">
            <input
              className="input"
              style={{ minHeight: 32, padding: '4px 8px', fontSize: 12 }}
              value={day.name}
              aria-label={`Nombre del día ${day.name}`}
              onChange={(event) =>
                dispatch({ type: 'routine/renameDay', dayId: day.id, name: event.target.value })
              }
            />
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={`Eliminar ${day.name}`}
              onClick={() => dispatch({ type: 'routine/removeDay', dayId: day.id })}
            >
              🗑
            </button>
          </header>

          <div className="panel__body">
            <div className="section-label">Día de la semana</div>
            <div className="chip-row">
              {WEEKDAY_SHORT.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={day.weekday === index}
                  onClick={() =>
                    dispatch({
                      type: 'routine/setWeekday',
                      dayId: day.id,
                      weekday: day.weekday === index ? null : (index as Weekday),
                    })
                  }
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="chip chip--button"
                aria-pressed={day.weekday === null}
                onClick={() => dispatch({ type: 'routine/setWeekday', dayId: day.id, weekday: null })}
              >
                Libre
              </button>
            </div>

            <p className="muted" style={{ marginTop: 10 }}>
              {day.exercises.length} ejercicios · ~{estimateDayMinutes(day)} min
            </p>

            <ul className="list-reset">
              {day.exercises.map((routineExercise, index) => {
                const exercise = getExercise(routineExercise.exerciseId);
                if (!exercise) return null;
                // La clave va por ejercicio para que, al reordenar, el panel
                // abierto siga al ejercicio en vez de quedarse en el hueco. Se
                // añade la posición de la primera aparición por si una rutina
                // importada repite el mismo ejercicio dentro de un día.
                const firstIndex = day.exercises.findIndex(
                  (e) => e.exerciseId === routineExercise.exerciseId,
                );
                const key =
                  firstIndex === index
                    ? `${day.id}:${routineExercise.exerciseId}`
                    : `${day.id}:${routineExercise.exerciseId}:${index}`;
                const open = expanded === key;

                return (
                  <li className="exercise" key={key}>
                    <div className="exercise__head" style={{ cursor: 'default' }}>
                      <ExerciseMedia frames={exercise.media} alt="" className="exercise__thumb" animate={false} />
                      <div className="exercise__info">
                        <div className="exercise__name">{exercise.name}</div>
                        <div className="exercise__meta">
                          {routineExercise.sets}×{routineExercise.targetReps[0]}-
                          {routineExercise.targetReps[1]} @ RIR {routineExercise.targetRir} ·{' '}
                          {TECHNIQUE_LABELS[routineExercise.technique]}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        aria-expanded={open}
                        aria-label={`Editar ${exercise.name}`}
                        onClick={() => setExpanded(open ? null : key)}
                      >
                        <span className={`exercise__chevron${open ? ' exercise__chevron--open' : ''}`}>
                          ⌄
                        </span>
                      </button>
                    </div>

                    {open && (
                      <div className="exercise__body">
                        <div className="grid-3" style={{ marginTop: 10 }}>
                          <Field label="Series">
                            <NumberInput
                              value={routineExercise.sets}
                              min={1}
                              max={12}
                              label={`Series de ${exercise.name}`}
                              onCommit={(sets) =>
                                dispatch({
                                  type: 'routine/updateExercise',
                                  dayId: day.id,
                                  index,
                                  patch: { sets },
                                })
                              }
                            />
                          </Field>
                          <Field label="Reps mín.">
                            <NumberInput
                              value={routineExercise.targetReps[0]}
                              min={1}
                              max={100}
                              label={`Repeticiones mínimas de ${exercise.name}`}
                              onCommit={(low) =>
                                dispatch({
                                  type: 'routine/updateExercise',
                                  dayId: day.id,
                                  index,
                                  // El máximo acompaña al mínimo si se queda por
                                  // debajo: un rango invertido haría que la app
                                  // recomendara subir peso en cada sesión.
                                  patch: {
                                    targetReps: [low, Math.max(low, routineExercise.targetReps[1])],
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="Reps máx.">
                            <NumberInput
                              value={routineExercise.targetReps[1]}
                              min={1}
                              max={100}
                              label={`Repeticiones máximas de ${exercise.name}`}
                              onCommit={(high) =>
                                dispatch({
                                  type: 'routine/updateExercise',
                                  dayId: day.id,
                                  index,
                                  patch: {
                                    targetReps: [Math.min(high, routineExercise.targetReps[0]), high],
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>

                        <div className="grid-2" style={{ marginTop: 10 }}>
                          <Field label="RIR objetivo">
                            <NumberInput
                              value={routineExercise.targetRir}
                              min={0}
                              max={5}
                              label={`RIR de ${exercise.name}`}
                              onCommit={(targetRir) =>
                                dispatch({
                                  type: 'routine/updateExercise',
                                  dayId: day.id,
                                  index,
                                  patch: { targetRir },
                                })
                              }
                            />
                          </Field>
                          <Field label="Descanso (s)">
                            <NumberInput
                              value={routineExercise.restSeconds}
                              min={15}
                              max={600}
                              step={15}
                              label={`Descanso de ${exercise.name}`}
                              onCommit={(restSeconds) =>
                                dispatch({
                                  type: 'routine/updateExercise',
                                  dayId: day.id,
                                  index,
                                  patch: { restSeconds },
                                })
                              }
                            />
                          </Field>
                        </div>

                        <Field label="Técnica avanzada">
                          <select
                            className="select"
                            value={routineExercise.technique}
                            aria-label={`Técnica de ${exercise.name}`}
                            onChange={(event) =>
                              dispatch({
                                type: 'routine/updateExercise',
                                dayId: day.id,
                                index,
                                patch: { technique: event.target.value as AdvancedTechnique },
                              })
                            }
                          >
                            {TECHNIQUES.map((technique) => (
                              <option key={technique} value={technique}>
                                {TECHNIQUE_LABELS[technique]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div className="hint">{TECHNIQUE_HELP[routineExercise.technique]}</div>

                        <p className="muted">
                          {MUSCLE_LABELS[exercise.primary]} · {EQUIPMENT_LABELS[exercise.equipment]} ·
                          rango sugerido {exercise.repRange[0]}-{exercise.repRange[1]}
                        </p>

                        <div className="btn-row">
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() =>
                              setPicker({
                                mode: 'swap',
                                dayId: day.id,
                                index,
                                exerciseId: exercise.id,
                              })
                            }
                          >
                            ⇄ Cambiar
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={index === 0}
                            onClick={() =>
                              dispatch({ type: 'routine/moveExercise', dayId: day.id, from: index, to: index - 1 })
                            }
                          >
                            ↑ Subir
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={index === day.exercises.length - 1}
                            onClick={() =>
                              dispatch({ type: 'routine/moveExercise', dayId: day.id, from: index, to: index + 1 })
                            }
                          >
                            ↓ Bajar
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => {
                              dispatch({ type: 'routine/removeExercise', dayId: day.id, index });
                              setExpanded(null);
                            }}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              className="btn btn--block"
              onClick={() => setPicker({ mode: 'add', dayId: day.id })}
            >
              + Añadir ejercicio
            </button>
          </div>
        </section>
      ))}

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'routine/addDay', name: `DÍA ${routine.days.length + 1}` })}
        >
          + Nuevo día
        </button>
        {confirmReset ? (
          <>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                dispatch({ type: 'routine/reset' });
                setConfirmReset(false);
              }}
            >
              Sí, restaurar
            </button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--amber" onClick={() => setConfirmReset(true)}>
            ↺ Restaurar plantilla
          </button>
        )}
      </div>
      {confirmReset && (
        <div className="hint">
          Se sustituirá la rutina actual por la plantilla fullbody de 3 días. El histórico no se toca.
        </div>
      )}

      {picker && (
        <ExercisePicker
          title={picker.mode === 'swap' ? 'Cambiar ejercicio' : 'Añadir ejercicio'}
          suggestFor={picker.mode === 'swap' ? picker.exerciseId : undefined}
          excludeIds={
            routine.days.find((d) => d.id === picker.dayId)?.exercises.map((e) => e.exerciseId) ?? []
          }
          onSelect={(exerciseId) => {
            if (picker.mode === 'swap') {
              dispatch({
                type: 'routine/swapExercise',
                dayId: picker.dayId,
                index: picker.index,
                exerciseId,
              });
              setExpanded(null);
            } else {
              dispatch({ type: 'routine/addExercise', dayId: picker.dayId, exerciseId });
            }
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

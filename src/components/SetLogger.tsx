import { useEffect, useState } from 'react';
import type { Exercise, LoggedSet, SetPrescription } from '../domain/types';
import { TECHNIQUE_HELP, TECHNIQUE_LABELS } from '../data/exercises';
import { estimate1RM } from '../domain/training';
import { NumberInput } from './NumberInput';

export interface SetLoggerProps {
  exercise: Exercise;
  prescriptions: SetPrescription[];
  loggedSets: LoggedSet[];
  unit: 'kg' | 'lb';
  onLog: (set: Omit<LoggedSet, 'id' | 'completedAt'>) => void;
  onEdit: (setId: string, patch: Partial<LoggedSet>) => void;
  onDelete: (setId: string) => void;
}

/**
 * Tabla de series de un ejercicio: las ya registradas se pueden editar en
 * línea y la siguiente aparece precargada con la prescripción del día.
 */
export function SetLogger({
  exercise,
  prescriptions,
  loggedSets,
  unit,
  onLog,
  onEdit,
  onDelete,
}: SetLoggerProps) {
  const next = prescriptions[loggedSets.length];
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');

  // Al avanzar de serie, precargamos los valores prescritos.
  useEffect(() => {
    if (!next) {
      setWeight('');
      setReps('');
      setRir('');
      return;
    }
    const previous = loggedSets[loggedSets.length - 1];
    setWeight(next.suggestedWeight !== null ? String(next.suggestedWeight) : previous ? String(previous.weight) : '');
    setReps(String(next.targetReps[0]));
    setRir(String(next.targetRir));
    // `loggedSets.length` basta: cambia exactamente al registrar o borrar una serie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedSets.length, exercise.id]);

  const submit = () => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    const parsedRir = Number(rir);
    if (!Number.isFinite(parsedReps) || parsedReps <= 0) return;
    onLog({
      weight: Number.isFinite(parsedWeight) && parsedWeight >= 0 ? parsedWeight : 0,
      reps: parsedReps,
      rir: Number.isFinite(parsedRir) && parsedRir >= 0 ? parsedRir : 0,
      technique: next?.technique ?? 'straight',
      warmup: next?.warmup ?? false,
    });
  };

  return (
    <div>
      <table className="sets">
        <thead>
          <tr>
            <th className="sets__index" scope="col">#</th>
            <th scope="col">{unit === 'kg' ? 'KG' : 'LB'}</th>
            <th scope="col">Reps</th>
            <th scope="col">RIR</th>
            <th scope="col">1RM</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {loggedSets.map((set, index) => (
            <tr key={set.id} data-logged="true" data-warmup={set.warmup}>
              <td className="sets__index">{set.warmup ? 'C' : index + 1 - countWarmups(loggedSets, index)}</td>
              <td>
                <NumberInput
                  className="sets__input"
                  value={set.weight}
                  min={0}
                  max={1000}
                  step={0.5}
                  decimals
                  label={`Peso de la serie ${index + 1}`}
                  onCommit={(weight) => onEdit(set.id, { weight })}
                />
              </td>
              <td>
                <NumberInput
                  className="sets__input"
                  value={set.reps}
                  min={1}
                  max={100}
                  label={`Repeticiones de la serie ${index + 1}`}
                  onCommit={(reps) => onEdit(set.id, { reps })}
                />
              </td>
              <td>
                <NumberInput
                  className="sets__input"
                  value={set.rir}
                  min={0}
                  max={10}
                  label={`RIR de la serie ${index + 1}`}
                  onCommit={(rir) => onEdit(set.id, { rir })}
                />
              </td>
              <td>{set.warmup ? '—' : Math.round(estimate1RM(set.weight, set.reps, set.rir))}</td>
              <td>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={`Borrar serie ${index + 1}`}
                  onClick={() => onDelete(set.id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}

          {next && (
            <tr data-warmup={next.warmup}>
              <td className="sets__index">{next.warmup ? 'C' : loggedSets.length + 1 - countWarmups(prescriptions, loggedSets.length)}</td>
              <td>
                <input
                  className="sets__input"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={weight}
                  placeholder="—"
                  aria-label="Peso de la siguiente serie"
                  onChange={(event) => setWeight(event.target.value)}
                />
              </td>
              <td>
                <input
                  className="sets__input"
                  type="number"
                  inputMode="numeric"
                  value={reps}
                  aria-label="Repeticiones de la siguiente serie"
                  onChange={(event) => setReps(event.target.value)}
                />
              </td>
              <td>
                <input
                  className="sets__input"
                  type="number"
                  inputMode="numeric"
                  value={rir}
                  aria-label="RIR de la siguiente serie"
                  onChange={(event) => setRir(event.target.value)}
                />
              </td>
              <td colSpan={2}>
                <button type="button" className="btn btn--primary btn--sm" onClick={submit}>
                  ✓ OK
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {next && (
        <p className="muted" style={{ marginTop: 6 }}>
          Objetivo: {next.targetReps[0]}-{next.targetReps[1]} reps @ RIR {next.targetRir}
          {next.warmup ? ' · aproximación' : ''}
          {next.technique !== 'straight' && !next.warmup
            ? ` · ${TECHNIQUE_LABELS[next.technique]}`
            : ''}
        </p>
      )}

      {next && next.technique !== 'straight' && !next.warmup && (
        <div className="hint">{TECHNIQUE_HELP[next.technique]}</div>
      )}

      {!next && (
        <div className="hint hint--accent">
          Ejercicio completado: {loggedSets.filter((s) => !s.warmup).length} series efectivas.
        </div>
      )}

      {!next && (
        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            onLog({
              weight: loggedSets.length > 0 ? loggedSets[loggedSets.length - 1].weight : 0,
              reps: loggedSets.length > 0 ? loggedSets[loggedSets.length - 1].reps : 8,
              rir: 0,
              technique: 'straight',
              warmup: false,
            })
          }
        >
          + Serie extra
        </button>
      )}
    </div>
  );
}

/** Cuántas de las series hasta `index` son de aproximación. */
function countWarmups(sets: Array<{ warmup: boolean }>, index: number): number {
  return sets.slice(0, index + 1).filter((s) => s.warmup).length;
}

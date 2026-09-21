import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, TECHNIQUE_LABELS, getExercise } from '../data/exercises';
import { elapsedMs, formatDuration, sessionTonnage } from '../domain/training';
import { useTicker } from '../hooks/useTicker';
import { formatSeconds, type RestTimer } from '../hooks/useRestTimer';
import { Empty, Panel } from './ui';
import { ExerciseMedia } from './ExerciseMedia';
import { ExercisePicker } from './ExercisePicker';
import { SetLogger } from './SetLogger';
import type { SessionExercise } from '../domain/types';

export function WorkoutScreen({ rest }: { rest: RestTimer }) {
  const { state, dispatch } = useApp();
  const session = state.active;
  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mode: 'swap'; fromId: string } | { mode: 'add' } | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const running = session?.status === 'running';
  const now = useTicker(running);

  const duration = session ? elapsedMs(session, now) : 0;
  const totalSets = useMemo(
    () => (session ? session.exercises.reduce((sum, e) => sum + e.loggedSets.filter((s) => !s.warmup).length, 0) : 0),
    [session],
  );

  if (!session) {
    return (
      <Empty glyph="🏋" image="./mascot-celebrate.webp">
        No hay ningún entrenamiento en curso.
        <br />
        Ve a <strong>HOY</strong> y arranca una sesión.
      </Empty>
    );
  }

  const openExercise = (exerciseId: string) =>
    setOpenId((current) => (current === exerciseId ? null : exerciseId));

  return (
    <>
      <section className="panel">
        <div className="timer">
          <p className={`timer__value${running ? '' : ' timer__value--paused'}`} aria-live="off">
            {formatDuration(duration)}
          </p>
          <p className="timer__label">
            {session.dayName} · {running ? 'EN MARCHA' : 'EN PAUSA'}
          </p>
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
            {running ? (
              <button type="button" className="btn btn--amber" onClick={() => dispatch({ type: 'session/pause' })}>
                ⏸ Pausar
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'session/resume' })}>
                ▶ Reanudar
              </button>
            )}
            <button type="button" className="btn" onClick={() => setConfirmFinish(true)}>
              ⏹ Terminar
            </button>
          </div>
        </div>
        <div className="panel__body" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat__value">{totalSets}</div>
              <div className="stat__label">Series</div>
            </div>
            <div className="stat">
              <div className="stat__value">{Math.round(sessionTonnage(session)).toLocaleString('es-ES')}</div>
              <div className="stat__label">Kg totales</div>
            </div>
            <div className="stat">
              <div className="stat__value">
                {session.exercises.filter((e) => isComplete(e)).length}/{session.exercises.length}
              </div>
              <div className="stat__label">Ejercicios</div>
            </div>
          </div>
        </div>
      </section>

      {confirmFinish && (
        <div className="panel finish-panel">
          <div className="panel__body">
            {totalSets > 0 && (
              <div className="finish-panel__mascot">
                <img
                  src="./mascot-celebrate.webp"
                  alt=""
                  className="finish-panel__img"
                  aria-hidden="true"
                />
              </div>
            )}
            <p style={{ marginTop: 0 }}>
              {totalSets === 0
                ? 'No has registrado ninguna serie. Si terminas ahora la sesión se descartará.'
                : `Vas a cerrar la sesión con ${totalSets} series registradas.`}
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  rest.stop();
                  dispatch(totalSets === 0 ? { type: 'session/discard' } : { type: 'session/finish' });
                  setConfirmFinish(false);
                }}
              >
                Confirmar
              </button>
              <button type="button" className="btn" onClick={() => setConfirmFinish(false)}>
                Seguir entrenando
              </button>
            </div>
          </div>
        </div>
      )}

      {session.exercises.map((sessionExercise) => {
        const exercise = getExercise(sessionExercise.exerciseId);
        if (!exercise) return null;
        const open = openId === exercise.id;
        const done = isComplete(sessionExercise);
        const priority = state.routine.priorities.includes(exercise.primary);
        const workingDone = sessionExercise.loggedSets.filter((s) => !s.warmup).length;
        const workingTotal = sessionExercise.prescriptions.filter((p) => !p.warmup).length;
        // La pareja de la superserie: se alterna con este ejercicio sin descanso.
        const partner = sessionExercise.supersetGroup
          ? session.exercises.find(
              (e) =>
                e.exerciseId !== sessionExercise.exerciseId &&
                e.supersetGroup === sessionExercise.supersetGroup,
            )
          : undefined;
        const partnerName = partner ? getExercise(partner.exerciseId)?.name : undefined;

        return (
          <article
            key={exercise.id}
            className={[
              'exercise',
              done ? 'exercise--done' : '',
              sessionExercise.skipped ? 'exercise--skipped' : '',
              priority ? 'exercise--priority' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <button
              type="button"
              className="exercise__head"
              onClick={() => openExercise(exercise.id)}
              aria-expanded={open}
            >
              <ExerciseMedia frames={exercise.media} alt="" className="exercise__thumb" animate={false} />
              <span className="exercise__info">
                <span className="exercise__name">
                  {done ? '✓ ' : ''}
                  {exercise.name}
                </span>
                <span className="exercise__meta">
                  {MUSCLE_LABELS[exercise.primary]} · {workingDone}/{workingTotal} series
                  {sessionExercise.supersetGroup ? ' · SUPERSERIE' : ''}
                </span>
              </span>
              <span className={`exercise__chevron${open ? ' exercise__chevron--open' : ''}`} aria-hidden="true">
                ⌄
              </span>
            </button>

            {open && (
              <div className="exercise__body">
                <ExerciseMedia frames={exercise.media} alt={`Demostración de ${exercise.name}`} />

                {partnerName && (
                  <div className="hint">
                    Superserie con <strong>{partnerName}</strong>: alterna una serie de cada uno y
                    descansa solo al terminar la pareja.
                  </div>
                )}

                <div className="chip-row">
                  <span className="chip chip--accent">{MUSCLE_LABELS[exercise.primary]}</span>
                  <span className="chip">{EQUIPMENT_LABELS[exercise.equipment]}</span>
                  {exercise.secondary.map((m) => (
                    <span key={m} className="chip">
                      {MUSCLE_LABELS[m]}
                    </span>
                  ))}
                </div>

                <ul className="cues">
                  {exercise.cues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>

                <SetLogger
                  exercise={exercise}
                  prescriptions={sessionExercise.prescriptions}
                  loggedSets={sessionExercise.loggedSets}
                  unit={state.settings.unit}
                  onLog={(set) => {
                    dispatch({ type: 'session/logSet', exerciseId: exercise.id, set });
                    if (state.settings.autoStartRest && !set.warmup) {
                      const prescription = sessionExercise.prescriptions[sessionExercise.loggedSets.length];
                      rest.start(prescription?.restSeconds ?? exercise.restSeconds);
                    }
                  }}
                  onEdit={(setId, patch) =>
                    dispatch({ type: 'session/editSet', exerciseId: exercise.id, setId, patch })
                  }
                  onDelete={(setId) => dispatch({ type: 'session/deleteSet', exerciseId: exercise.id, setId })}
                />

                <div className="divider" />

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => rest.start(exercise.restSeconds)}
                  >
                    ⏱ Descanso {formatSeconds(exercise.restSeconds)}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setPicker({ mode: 'swap', fromId: exercise.id })}
                  >
                    ⇄ Cambiar
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      dispatch({
                        type: 'session/skipExercise',
                        exerciseId: exercise.id,
                        skipped: !sessionExercise.skipped,
                      })
                    }
                  >
                    {sessionExercise.skipped ? '↺ Recuperar' : '⤫ Saltar'}
                  </button>
                </div>

                <label className="field" style={{ marginTop: 10 }}>
                  <span className="field__label">Notas del ejercicio</span>
                  <textarea
                    className="textarea"
                    value={sessionExercise.notes ?? ''}
                    placeholder="Sensaciones, molestias, altura del banco..."
                    onChange={(event) =>
                      dispatch({ type: 'session/note', exerciseId: exercise.id, note: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
          </article>
        );
      })}

      <Panel title="Sesión">
        <button type="button" className="btn btn--block" onClick={() => setPicker({ mode: 'add' })}>
          + Añadir ejercicio suelto
        </button>
        <label className="field" style={{ marginTop: 10 }}>
          <span className="field__label">Notas de la sesión</span>
          <textarea
            className="textarea"
            value={session.notes ?? ''}
            placeholder="Descanso, energía, dolores..."
            onChange={(event) => dispatch({ type: 'session/note', note: event.target.value })}
          />
        </label>
        <div className="divider" />
        <button
          type="button"
          className="btn btn--danger btn--block"
          onClick={() => {
            rest.stop();
            dispatch({ type: 'session/discard' });
          }}
        >
          Descartar sesión
        </button>
      </Panel>

      {picker && (
        <ExercisePicker
          title={picker.mode === 'swap' ? 'Cambiar ejercicio' : 'Añadir ejercicio'}
          suggestFor={picker.mode === 'swap' ? picker.fromId : undefined}
          excludeIds={session.exercises.map((e) => e.exerciseId)}
          onSelect={(exerciseId) => {
            if (picker.mode === 'swap') {
              dispatch({ type: 'session/swapExercise', fromId: picker.fromId, toId: exerciseId });
              setOpenId(exerciseId);
            } else {
              dispatch({ type: 'session/addExercise', exerciseId });
            }
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

/** Un ejercicio está cerrado cuando se han cubierto todas sus series o se saltó. */
function isComplete(sessionExercise: SessionExercise): boolean {
  if (sessionExercise.skipped) return true;
  const target = sessionExercise.prescriptions.filter((p) => !p.warmup).length;
  const done = sessionExercise.loggedSets.filter((s) => !s.warmup).length;
  return target > 0 && done >= target;
}

export { TECHNIQUE_LABELS };

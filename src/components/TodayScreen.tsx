import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { MUSCLE_LABELS, getExercise } from '../data/exercises';
import {
  WEEKDAY_LABELS,
  estimateDayMinutes,
  plannedWeeklyVolume,
  suggestNextDay,
} from '../domain/routineBuilder';
import { phaseForWeek, targetRirForWeek, volumeVerdict } from '../domain/training';
import type { MuscleGroup, RoutineDay } from '../domain/types';
import { ExerciseMedia } from './ExerciseMedia';
import { Empty, Panel } from './ui';

const PHASE_LABELS: Record<string, string> = {
  accumulation: 'ACUMULACIÓN',
  intensification: 'INTENSIFICACIÓN',
  peak: 'PICO',
  deload: 'DESCARGA',
};

export function TodayScreen({ onStarted }: { onStarted: () => void }) {
  const { state, dispatch } = useApp();
  const { routine, history, mesocycle } = state;
  const [pendingDayId, setPendingDayId] = useState<string | null>(null);

  const activeHasWork = Boolean(state.active?.exercises.some((e) => e.loggedSets.length > 0));

  const lastTrainedByDayId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const session of history) {
      if (map[session.dayId] === undefined) map[session.dayId] = session.startedAt;
    }
    return map;
  }, [history]);

  const suggested = suggestNextDay(routine, lastTrainedByDayId);
  // El día elegido a mano manda sobre la sugerencia por calendario.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected: RoutineDay | undefined =
    routine.days.find((d) => d.id === pickedId) ?? suggested ?? routine.days[0];

  const phase = phaseForWeek(mesocycle);
  const planned = useMemo(() => plannedWeeklyVolume(routine), [routine]);
  const today = new Date().getDay();

  if (routine.days.length === 0) {
    return (
      <Empty glyph="○" image="./mascot-celebrate.webp">
        No hay días en la rutina.
        <br />
        Créalos en la pestaña <strong>RUTINA</strong>.
      </Empty>
    );
  }

  const lastTrained = selected ? lastTrainedByDayId[selected.id] : undefined;
  const start = (force: boolean) => {
    if (!selected) return;
    if (activeHasWork && !force) {
      setPendingDayId(selected.id);
      return;
    }
    dispatch({ type: 'session/start', dayId: selected.id, force });
    setPendingDayId(null);
    onStarted();
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head__row">
          <div>
            <div className="page-head__eyebrow">
              Semana {mesocycle.week}/{mesocycle.lengthWeeks} · {PHASE_LABELS[phase]}
            </div>
            <h2 className="page-head__title">{selected?.name ?? 'Sin día'}</h2>
          </div>
          <span className={`badge${lastTrained ? '' : ' badge--quiet'}`}>
            {lastTrained
              ? new Date(lastTrained).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
              : 'sin datos'}
          </span>
        </div>
      </header>

      {/* Píldoras para cambiar de día sin salir de la pantalla. */}
      <div className="segmented" role="group" aria-label="Elegir día">
        {routine.days.map((day) => {
          const active = selected?.id === day.id;
          return (
            <button
              key={day.id}
              type="button"
              className="segmented__item"
              aria-pressed={active}
              onClick={() => {
                setPickedId(day.id);
                setPendingDayId(null);
              }}
            >
              {active && (
                <span className="segmented__check" aria-hidden="true">
                  ✓
                </span>
              )}
              {shortName(day.name)}
            </button>
          );
        })}
      </div>

      {state.active && (
        <div className="hint hint--accent">
          Tienes una sesión {state.active.status === 'paused' ? 'pausada' : 'en marcha'}:{' '}
          {state.active.dayName}. Ve a <strong>ENTRENO</strong> para continuarla.
        </div>
      )}

      {phase === 'deload' && (
        <div className="hint">
          Semana de descarga: la mitad de series, sin técnicas de intensificación y un RIR más alto.
          Sirve para disipar fatiga, no para probar récords.
        </div>
      )}

      {selected && (
        <>
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            {selected.exercises.length} ejercicios ·{' '}
            {selected.exercises.reduce((sum, e) => sum + e.sets, 0)} series · ~
            {estimateDayMinutes(selected)} min
            {selected.weekday !== null ? ` · ${WEEKDAY_LABELS[selected.weekday]}` : ' · libre'}
            {selected.weekday === today ? ' · HOY TOCA' : ''}
          </p>

          {/* Vista previa de la sesión: lo que de verdad importa antes de empezar. */}
          <ul className="list-reset">
            {selected.exercises.map((routineExercise) => {
              const exercise = getExercise(routineExercise.exerciseId);
              if (!exercise) return null;
              const priority = routine.priorities.includes(exercise.primary);
              return (
                <li
                  key={routineExercise.exerciseId}
                  className={`exercise${priority ? ' exercise--priority' : ''}`}
                >
                  <div className="exercise__head" style={{ cursor: 'default' }}>
                    <ExerciseMedia
                      frames={exercise.media}
                      alt=""
                      className="exercise__thumb"
                      animate={false}
                    />
                    <span className="exercise__info">
                      <span className="exercise__name">{exercise.name}</span>
                      <span className="exercise__meta">
                        {routineExercise.sets}×{routineExercise.targetReps[0]}–
                        {routineExercise.targetReps[1]} · RIR {routineExercise.targetRir}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pendingDayId && (
        <div className="hint">
          Tienes «{state.active?.dayName}» a medias con series registradas.
          <div className="btn-row" style={{ marginTop: 9 }}>
            <button type="button" className="btn btn--sm btn--primary" onClick={() => start(true)}>
              Guardar y empezar
            </button>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                dispatch({ type: 'session/discard' });
                start(true);
              }}
            >
              Descartar y empezar
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setPendingDayId(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <Panel title="Volumen semanal planificado">
        <p className="muted" style={{ marginTop: 0 }}>
          Series por grupo frente al rango recomendado. Tus prioridades van al rango alto.
        </p>
        <VolumeBars volume={planned} priorities={routine.priorities} />
      </Panel>

      <Panel title="Mesociclo">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat__value" style={{ fontSize: 14 }}>
              {PHASE_LABELS[phase]}
            </div>
            <div className="stat__label">Fase</div>
          </div>
          <div className="stat">
            <div className="stat__value">{targetRirForWeek(mesocycle)}</div>
            <div className="stat__label">RIR objetivo</div>
          </div>
          <div className="stat">
            <div className="stat__value">{history.length}</div>
            <div className="stat__label">Sesiones</div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginTop: 11 }}
          onClick={() => dispatch({ type: 'mesocycle/advance' })}
        >
          → Avanzar de semana
        </button>
      </Panel>

      {/* Acción principal siempre a mano, sobre la barra de pestañas. */}
      <div className="cta-bar">
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!selected || selected.exercises.length === 0}
          onClick={() => start(false)}
        >
          ▶ Empezar entreno
        </button>
      </div>
      {/* Hueco para que el botón fijo no tape el final del contenido. */}
      <div style={{ height: 78 }} aria-hidden="true" />
    </>
  );
}

/** "DÍA A · Empuje pesado" → "Día A", que es lo que cabe en la píldora. */
function shortName(name: string): string {
  const head = name.split('·')[0].trim();
  return head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
}

export function VolumeBars({
  volume,
  priorities = [],
}: {
  volume: Record<string, number>;
  priorities?: MuscleGroup[];
}) {
  const entries = Object.entries(volume)
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="muted">Sin volumen registrado todavía.</p>;
  }

  const max = Math.max(...entries.map(([, sets]) => sets), 20);

  return (
    <div>
      {entries.map(([muscle, sets]) => {
        const verdict = volumeVerdict(muscle as MuscleGroup, sets);
        return (
          <div className="vol-row" key={muscle}>
            <span style={{ color: priorities.includes(muscle as MuscleGroup) ? 'var(--accent)' : undefined }}>
              {MUSCLE_LABELS[muscle] ?? muscle}
            </span>
            <span className="vol-row__track">
              <span
                className={`vol-row__fill vol-row__fill--${verdict}`}
                style={{ width: `${Math.min(100, (sets / max) * 100)}%` }}
              />
            </span>
            <span className="vol-row__value">
              {sets} {verdict === 'below' ? '↓' : verdict === 'above' ? '↑' : '✓'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
import type { MuscleGroup } from '../domain/types';
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

  const activeHasWork = Boolean(
    state.active?.exercises.some((e) => e.loggedSets.length > 0),
  );

  const lastTrainedByDayId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const session of history) {
      if (map[session.dayId] === undefined) map[session.dayId] = session.startedAt;
    }
    return map;
  }, [history]);

  const suggested = suggestNextDay(routine, lastTrainedByDayId);
  const phase = phaseForWeek(mesocycle);
  const planned = useMemo(() => plannedWeeklyVolume(routine), [routine]);
  const today = new Date().getDay();

  return (
    <>
      <Panel title={`Mesociclo · semana ${mesocycle.week}/${mesocycle.lengthWeeks}`}>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat__value" style={{ fontSize: 14 }}>{PHASE_LABELS[phase]}</div>
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
        {phase === 'deload' && (
          <div className="hint">
            Semana de descarga: la mitad de series, sin técnicas de intensificación y un RIR más alto.
            Sirve para disipar fatiga, no para probar récords.
          </div>
        )}
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginTop: 10 }}
          onClick={() => dispatch({ type: 'mesocycle/advance' })}
        >
          → Avanzar de semana
        </button>
      </Panel>

      {state.active && (
        <div className="hint hint--accent">
          Tienes una sesión {state.active.status === 'paused' ? 'pausada' : 'en marcha'}:{' '}
          {state.active.dayName}. Ve a la pestaña ENTRENO para continuarla.
        </div>
      )}

      <div className="section-label">Elige el día a entrenar</div>

      {routine.days.length === 0 ? (
        <Empty glyph="∅">
          No hay días en la rutina. Créalos en la pestaña <strong>RUTINA</strong>.
        </Empty>
      ) : (
        routine.days.map((day) => {
          const isSuggested = suggested?.id === day.id;
          const lastTrained = lastTrainedByDayId[day.id];
          const groups = Array.from(
            new Set(
              day.exercises
                .map((e) => getExercise(e.exerciseId)?.primary)
                .filter((m): m is MuscleGroup => Boolean(m)),
            ),
          );

          return (
            <article key={day.id} className={`panel${isSuggested ? ' exercise--priority' : ''}`}>
              <header className="panel__head">
                <h2 className="panel__title">{day.name}</h2>
                <span className={`chip${isSuggested ? ' chip--amber' : ''}`}>
                  {day.weekday !== null ? WEEKDAY_LABELS[day.weekday] : 'LIBRE'}
                </span>
              </header>
              <div className="panel__body">
                <p className="muted" style={{ marginTop: 0 }}>
                  {day.exercises.length} ejercicios · ~{estimateDayMinutes(day)} min ·{' '}
                  {day.exercises.reduce((sum, e) => sum + e.sets, 0)} series
                </p>
                <div className="chip-row">
                  {groups.map((group) => (
                    <span
                      key={group}
                      className={`chip${routine.priorities.includes(group) ? ' chip--amber' : ''}`}
                    >
                      {MUSCLE_LABELS[group]}
                    </span>
                  ))}
                </div>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {lastTrained
                    ? `Última vez: ${new Date(lastTrained).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                      })}`
                    : 'Aún sin registrar'}
                  {day.weekday === today ? ' · HOY TOCA' : ''}
                </p>
                <button
                  type="button"
                  className={`btn btn--block${isSuggested ? ' btn--primary' : ''}`}
                  style={{ marginTop: 10 }}
                  disabled={day.exercises.length === 0}
                  onClick={() => {
                    // Con trabajo registrado en la sesión en curso, el reducer
                    // no la pisa: hay que decidir antes qué hacer con ella.
                    if (activeHasWork) {
                      setPendingDayId(day.id);
                      return;
                    }
                    dispatch({ type: 'session/start', dayId: day.id });
                    onStarted();
                  }}
                >
                  ▶ Empezar entreno
                </button>

                {pendingDayId === day.id && (
                  <div className="hint">
                    Tienes «{state.active?.dayName}» a medias con series registradas.
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--primary"
                        onClick={() => {
                          // Se guarda en el histórico y se arranca la nueva.
                          dispatch({ type: 'session/start', dayId: day.id, force: true });
                          setPendingDayId(null);
                          onStarted();
                        }}
                      >
                        Guardar y empezar
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        onClick={() => {
                          dispatch({ type: 'session/discard' });
                          dispatch({ type: 'session/start', dayId: day.id });
                          setPendingDayId(null);
                          onStarted();
                        }}
                      >
                        Descartar y empezar
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setPendingDayId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })
      )}

      <Panel title="Volumen semanal planificado">
        <p className="muted" style={{ marginTop: 0 }}>
          Series por grupo muscular frente al rango recomendado. Pecho y espalda van al rango alto por
          ser tus prioridades.
        </p>
        <VolumeBars volume={planned} priorities={routine.priorities} />
      </Panel>
    </>
  );
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
            <span style={{ color: priorities.includes(muscle as MuscleGroup) ? 'var(--amber)' : undefined }}>
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

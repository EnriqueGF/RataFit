import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { MUSCLE_LABELS, getExercise } from '../data/exercises';
import {
  computePersonalRecords,
  estimate1RM,
  formatDuration,
  isStalled,
  sessionTonnage,
  volumeByMuscle,
} from '../domain/training';
import type { WorkoutSession } from '../domain/types';
import { Empty, Panel, Stat } from './ui';
import { VolumeBars } from './TodayScreen';
import { useTicker } from '../hooks/useTicker';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ProgressScreen() {
  const { state } = useApp();
  const { history, routine } = state;
  const [detailId, setDetailId] = useState<string | null>(null);

  // La app puede quedarse abierta días, así que el corte de los 7 días se
  // recalcula con el reloj en vez de congelarse en el primer render.
  const now = useTicker(true, 60_000);
  const lastWeek = useMemo(() => history.filter((s) => now - s.startedAt <= WEEK_MS), [history, now]);
  const weeklyVolume = useMemo(() => volumeByMuscle(lastWeek, getExercise), [lastWeek]);
  const records = useMemo(() => computePersonalRecords(history), [history]);

  const totals = useMemo(
    () => ({
      sessions: history.length,
      tonnage: history.reduce((sum, s) => sum + sessionTonnage(s), 0),
      minutes: Math.round(history.reduce((sum, s) => sum + s.accumulatedMs, 0) / 60000),
      sets: history.reduce(
        (sum, s) => sum + s.exercises.reduce((n, e) => n + e.loggedSets.filter((x) => !x.warmup).length, 0),
        0,
      ),
    }),
    [history],
  );

  if (history.length === 0) {
    return (
      <Empty glyph="▁▂▃">
        Todavía no hay entrenamientos registrados.
        <br />
        Termina tu primera sesión y aquí aparecerán tus marcas y tu volumen.
      </Empty>
    );
  }

  const stalled = Object.keys(records).filter((id) => isStalled(history, id));

  return (
    <>
      <Panel title="Acumulado">
        <div className="stat-grid">
          <Stat value={totals.sessions} label="Sesiones" />
          <Stat value={totals.sets} label="Series" />
          <Stat value={`${Math.round(totals.tonnage / 1000)}t`} label="Tonelaje" />
          <Stat value={`${totals.minutes}m`} label="Tiempo" />
        </div>
      </Panel>

      <Panel title="Volumen de los últimos 7 días">
        <VolumeBars volume={weeklyVolume} priorities={routine.priorities} />
        <p className="muted" style={{ marginBottom: 0 }}>
          ↓ por debajo del mínimo · ✓ en rango · ↑ por encima del máximo recomendado
        </p>
      </Panel>

      {stalled.length > 0 && (
        <Panel title="Atención">
          <p className="muted" style={{ marginTop: 0 }}>
            Tres sesiones seguidas sin mejorar el 1RM estimado en:
          </p>
          <ul className="cues">
            {stalled.map((id) => (
              <li key={id}>{getExercise(id)?.name ?? id}</li>
            ))}
          </ul>
          <div className="hint">
            Opciones: cambiar por una variante del mismo patrón, bajar un 10 % y reconstruir, o meter
            una semana de descarga.
          </div>
        </Panel>
      )}

      <Panel title="Récords personales">
        <ul className="list-reset">
          {Object.values(records)
            .sort((a, b) => b.best1Rm - a.best1Rm)
            .map((record) => {
              const exercise = getExercise(record.exerciseId);
              const series = oneRmSeries(history, record.exerciseId);
              const max = Math.max(...series, 1);
              return (
                <li key={record.exerciseId} className="panel" style={{ marginBottom: 8 }}>
                  <div className="panel__body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{exercise?.name ?? record.exerciseId}</strong>
                      <span className="chip chip--accent">{Math.round(record.best1Rm)} kg 1RM</span>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      Mejor serie: {record.bestReps} reps · Peso máximo: {record.bestWeight} kg ·{' '}
                      {exercise ? MUSCLE_LABELS[exercise.primary] : ''}
                    </p>
                    {series.length > 1 && (
                      <div className="spark" aria-hidden="true">
                        {series.map((value, index) => (
                          <span
                            key={index}
                            className={`spark__bar${index === series.length - 1 ? ' spark__bar--last' : ''}`}
                            style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
                          />
                        ))}
                      </div>
                    )}
                    {series.length > 1 && (
                      <p className="muted" style={{ margin: '4px 0 0' }}>
                        Evolución del 1RM estimado en las últimas {series.length} sesiones.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </Panel>

      <Panel title="Historial">
        <ul className="list-reset">
          {history.map((session) => {
            const open = detailId === session.id;
            const workingSets = session.exercises.reduce(
              (n, e) => n + e.loggedSets.filter((s) => !s.warmup).length,
              0,
            );
            return (
              <li key={session.id} className="exercise">
                <button
                  type="button"
                  className="exercise__head"
                  aria-expanded={open}
                  onClick={() => setDetailId(open ? null : session.id)}
                >
                  <span className="exercise__info">
                    <span className="exercise__name">{session.dayName}</span>
                    <span className="exercise__meta">
                      {new Date(session.startedAt).toLocaleDateString('es-ES', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      · {formatDuration(session.accumulatedMs)} · {workingSets} series ·{' '}
                      {Math.round(sessionTonnage(session)).toLocaleString('es-ES')} kg
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ color: 'var(--fg-dim)' }}>{open ? '▾' : '▸'}</span>
                </button>

                {open && (
                  <div className="exercise__body">
                    {session.exercises.map((sessionExercise) => (
                      <div key={sessionExercise.exerciseId} style={{ marginTop: 10 }}>
                        <strong style={{ fontSize: 13 }}>
                          {getExercise(sessionExercise.exerciseId)?.name ?? sessionExercise.exerciseId}
                        </strong>
                        <p className="muted" style={{ margin: '2px 0 0' }}>
                          {sessionExercise.loggedSets
                            .filter((s) => !s.warmup)
                            .map((s) => `${s.weight}×${s.reps}@${s.rir}`)
                            .join('  ·  ') || 'Sin series efectivas'}
                        </p>
                        {sessionExercise.notes && <p className="muted">“{sessionExercise.notes}”</p>}
                      </div>
                    ))}
                    {session.notes && <div className="hint">{session.notes}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}

/** Mejor 1RM estimado por sesión, de la más antigua a la más reciente. */
function oneRmSeries(history: WorkoutSession[], exerciseId: string): number[] {
  const values: number[] = [];
  for (const session of history) {
    const sessionExercise = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!sessionExercise) continue;
    const working = sessionExercise.loggedSets.filter((s) => !s.warmup);
    if (working.length === 0) continue;
    values.push(Math.max(...working.map((s) => estimate1RM(s.weight, s.reps, s.rir))));
  }
  return values.reverse().slice(-12);
}

import { useMemo, useState } from 'react';
import { EQUIPMENT_LABELS, EXERCISES, MUSCLE_LABELS } from '../data/exercises';
import {
  DEFAULT_PROFILE,
  availableExercises,
  buildRoutineFromProfile,
  uncoveredMuscles,
  type DaysPerWeek,
  type ExperienceLevel,
  type GymProfile,
} from '../domain/onboarding';
import { WEEKDAY_SHORT, estimateDayMinutes } from '../domain/routineBuilder';
import type { Equipment, MuscleGroup, Weekday } from '../domain/types';
import { ExerciseMedia } from './ExerciseMedia';
import { Panel } from './ui';

const STEPS = ['Material', 'Ejercicios', 'Objetivo', 'Calendario', 'Resumen'] as const;

const EQUIPMENT_ORDER: Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'smith',
  'bodyweight',
  'kettlebell',
];

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

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Empiezo ahora',
  intermediate: 'Llevo tiempo',
  advanced: 'Avanzado',
};

const EXPERIENCE_HELP: Record<ExperienceLevel, string> = {
  beginner: 'Series rectas, menos volumen y RIR conservador: primero técnica y constancia.',
  intermediate: 'Técnicas avanzadas en los accesorios y doble progresión en los básicos.',
  advanced: 'Más volumen, barra libre siempre que se pueda y RIR apurado.',
};

export interface OnboardingScreenProps {
  /** Perfil de partida al reabrir el cuestionario desde Ajustes. */
  initialProfile?: GymProfile | null;
  onFinish: (profile: GymProfile) => void;
  /** Continuar con la plantilla por defecto sin responder. */
  onSkip: () => void;
}

/**
 * Cuestionario inicial: pregunta qué hay en el gimnasio y qué se quiere (o no)
 * entrenar, y con eso genera la rutina en lugar de imponer una plantilla fija.
 */
export function OnboardingScreen({ initialProfile, onFinish, onSkip }: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<GymProfile>(initialProfile ?? DEFAULT_PROFILE);

  const patch = (changes: Partial<GymProfile>) => setProfile((p) => ({ ...p, ...changes }));

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const available = useMemo(() => availableExercises(profile), [profile]);
  const missing = useMemo(() => uncoveredMuscles(profile), [profile]);
  const preview = useMemo(() => buildRoutineFromProfile(profile), [profile]);

  const byMuscle = useMemo(() => {
    const groups = new Map<MuscleGroup, typeof EXERCISES>();
    for (const exercise of EXERCISES) {
      if (!profile.equipment.includes(exercise.equipment)) continue;
      const current = groups.get(exercise.primary) ?? [];
      groups.set(exercise.primary, [...current, exercise]);
    }
    return groups;
  }, [profile.equipment]);

  const canContinue = step !== 0 || profile.equipment.length > 0;

  return (
    <div className="onboarding">
      <Panel title={`Configuración · ${step + 1}/${STEPS.length} · ${STEPS[step]}`}>
        <div className="steps" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`steps__dot${index === step ? ' steps__dot--active' : ''}${
                index < step ? ' steps__dot--done' : ''
              }`}
            />
          ))}
        </div>

        {/* ─────────────────────────── 1. Material ─────────────────────────── */}
        {step === 0 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              ¿Qué hay en tu gimnasio? Solo se propondrán ejercicios que puedas hacer de verdad.
            </p>
            <div className="chip-row">
              {EQUIPMENT_ORDER.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={profile.equipment.includes(item)}
                  onClick={() => patch({ equipment: toggle(profile.equipment, item) })}
                >
                  {EQUIPMENT_LABELS[item]}
                </button>
              ))}
            </div>

            <p className="muted" style={{ marginBottom: 0 }}>
              {available.length} ejercicios disponibles con esta selección.
            </p>

            {profile.equipment.length === 0 && (
              <div className="hint">Marca al menos un tipo de material para continuar.</div>
            )}

            {missing.length > 0 && profile.equipment.length > 0 && (
              <div className="hint">
                Sin material para: {missing.map((m) => MUSCLE_LABELS[m]).join(', ')}. La rutina se
                generará igual, pero esos grupos se quedarán fuera.
              </div>
            )}
          </>
        )}

        {/* ────────────────────────── 2. Ejercicios ────────────────────────── */}
        {step === 1 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Marca ★ lo que quieras sí o sí y ✕ lo que no puedas o no quieras hacer (no hay máquina,
              te molesta, no te gusta). El resto se elige solo.
            </p>

            {MUSCLE_ORDER.map((muscle) => {
              const list = byMuscle.get(muscle);
              if (!list || list.length === 0) return null;
              return (
                <div key={muscle}>
                  <div className="section-label">{MUSCLE_LABELS[muscle]}</div>
                  <ul className="list-reset">
                    {list.map((exercise) => {
                      const excluded = profile.excludedExerciseIds.includes(exercise.id);
                      const favorite = profile.favoriteExerciseIds.includes(exercise.id);
                      return (
                        <li key={exercise.id} className="pick">
                          <ExerciseMedia
                            frames={exercise.media}
                            alt=""
                            className="picker__thumb"
                            animate={false}
                          />
                          <span className="exercise__info">
                            <span className="picker__name">{exercise.name}</span>
                            <span className="picker__meta">
                              {EQUIPMENT_LABELS[exercise.equipment]} · {exercise.repRange[0]}-
                              {exercise.repRange[1]} reps
                            </span>
                          </span>
                          <span className="pick__actions">
                            <button
                              type="button"
                              className="btn btn--sm"
                              aria-pressed={favorite}
                              aria-label={`Quiero hacer ${exercise.name}`}
                              onClick={() =>
                                patch({
                                  favoriteExerciseIds: toggle(profile.favoriteExerciseIds, exercise.id),
                                  excludedExerciseIds: profile.excludedExerciseIds.filter(
                                    (id) => id !== exercise.id,
                                  ),
                                })
                              }
                              style={favorite ? { color: 'var(--amber)', borderColor: 'var(--amber-dim)' } : undefined}
                            >
                              ★
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm"
                              aria-pressed={excluded}
                              aria-label={`Descartar ${exercise.name}`}
                              onClick={() =>
                                patch({
                                  excludedExerciseIds: toggle(profile.excludedExerciseIds, exercise.id),
                                  favoriteExerciseIds: profile.favoriteExerciseIds.filter(
                                    (id) => id !== exercise.id,
                                  ),
                                })
                              }
                              style={excluded ? { color: 'var(--danger)', borderColor: '#6b1f1f' } : undefined}
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </>
        )}

        {/* ─────────────────────────── 3. Objetivo ─────────────────────────── */}
        {step === 2 && (
          <>
            <div className="section-label">¿Qué quieres priorizar?</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Los grupos marcados reciben más series y aparecen antes en la sesión.
            </p>
            <div className="chip-row">
              {MUSCLE_ORDER.map((muscle) => (
                <button
                  key={muscle}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={profile.priorities.includes(muscle)}
                  onClick={() => patch({ priorities: toggle(profile.priorities, muscle) })}
                >
                  {MUSCLE_LABELS[muscle]}
                </button>
              ))}
            </div>

            <div className="section-label">¿Cuánta experiencia tienes?</div>
            <div className="chip-row">
              {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={profile.experience === level}
                  onClick={() => patch({ experience: level })}
                >
                  {EXPERIENCE_LABELS[level]}
                </button>
              ))}
            </div>
            <div className="hint">{EXPERIENCE_HELP[profile.experience]}</div>
          </>
        )}

        {/* ────────────────────────── 4. Calendario ────────────────────────── */}
        {step === 3 && (
          <>
            <div className="section-label">¿Cuántos días entrenas a la semana?</div>
            <div className="chip-row">
              {([2, 3, 4] as DaysPerWeek[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={profile.daysPerWeek === days}
                  onClick={() =>
                    patch({
                      daysPerWeek: days,
                      weekdays: profile.weekdays.slice(0, days),
                    })
                  }
                >
                  {days} días
                </button>
              ))}
            </div>

            <div className="section-label">¿Qué días? (opcional)</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Puedes dejarlo en blanco y entrenar cuando te venga bien; la app te sugerirá el día que
              lleves más tiempo sin hacer.
            </p>
            <div className="chip-row">
              {WEEKDAY_SHORT.map((label, index) => {
                const selected = profile.weekdays.includes(index as Weekday);
                const full = profile.weekdays.length >= profile.daysPerWeek;
                return (
                  <button
                    key={label}
                    type="button"
                    className="chip chip--button"
                    aria-pressed={selected}
                    disabled={!selected && full}
                    onClick={() =>
                      patch({
                        weekdays: selected
                          ? profile.weekdays.filter((d) => d !== index)
                          : [...profile.weekdays, index as Weekday].sort((a, b) => a - b),
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="section-label">¿Cuánto tiempo tienes por sesión?</div>
            <div className="chip-row">
              {[45, 60, 75, 90].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="chip chip--button"
                  aria-pressed={profile.sessionMinutes === minutes}
                  onClick={() => patch({ sessionMinutes: minutes })}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </>
        )}

        {/* ─────────────────────────── 5. Resumen ──────────────────────────── */}
        {step === 4 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Esta es la rutina que se va a crear. Después puedes cambiarlo todo desde la pestaña
              RUTINA.
            </p>
            {preview.days.map((day) => (
              <div key={day.id} style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13, color: 'var(--accent)' }}>{day.name}</strong>
                <p className="muted" style={{ margin: '2px 0 4px' }}>
                  {day.weekday !== null ? WEEKDAY_SHORT[day.weekday] : 'LIBRE'} ·{' '}
                  {day.exercises.length} ejercicios · ~{estimateDayMinutes(day)} min
                </p>
                <ul className="cues">
                  {day.exercises.map((e) => (
                    <li key={e.exerciseId}>
                      {EXERCISES.find((x) => x.id === e.exerciseId)?.name ?? e.exerciseId} — {e.sets}×
                      {e.targetReps[0]}-{e.targetReps[1]} @ RIR {e.targetRir}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        <div className="divider" />

        <div className="btn-row">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep((n) => n - 1)}>
              ← Atrás
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canContinue}
              onClick={() => setStep((n) => n + 1)}
            >
              Siguiente →
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => onFinish(profile)}>
              ✓ Crear mi rutina
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            Usar la rutina por defecto
          </button>
        </div>
      </Panel>
    </div>
  );
}

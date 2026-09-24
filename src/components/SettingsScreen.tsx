import { useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { createInitialState, deserialize, serialize } from '../state/store';
import { Field, Panel } from './ui';
import { AccountPanel } from './AccountPanel';
import type { AuthApi } from '../state/useAuth';
import { NumberInput } from './NumberInput';

export function SettingsScreen({ auth }: { auth: AuthApi }) {
  const { state, dispatch } = useApp();
  const { settings, mesocycle } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const exportBackup = () => {
    const blob = new Blob([serialize(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ratafit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Copia de seguridad descargada.');
  };

  const importBackup = async (file: File) => {
    try {
      const imported = deserialize(await file.text());
      dispatch({ type: 'state/replace', state: imported });
      setMessage('Datos importados correctamente.');
    } catch {
      setMessage('No se pudo leer el archivo.');
    }
  };

  return (
    <>
      <AccountPanel auth={auth} sessionCount={state.history.length} />

      <Panel title="Entreno">
        <Field label="Unidad de peso" htmlFor="unit">
          <select
            id="unit"
            className="select"
            value={settings.unit}
            onChange={(event) =>
              dispatch({ type: 'settings/update', patch: { unit: event.target.value as 'kg' | 'lb' } })
            }
          >
            <option value="kg">Kilogramos</option>
            <option value="lb">Libras</option>
          </select>
        </Field>

        <div className="grid-2" style={{ marginTop: 10 }}>
          <Field label="Descanso por defecto (s)">
            <NumberInput
              value={settings.defaultRestSeconds}
              min={15}
              max={600}
              step={15}
              label="Descanso por defecto (s)"
              onCommit={(defaultRestSeconds) =>
                dispatch({ type: 'settings/update', patch: { defaultRestSeconds } })
              }
            />
          </Field>
          <Field label="Peso corporal (kg)" htmlFor="bodyweight">
            <input
              id="bodyweight"
              className="input input--number"
              type="number"
              min={30}
              max={250}
              step={0.1}
              value={settings.bodyweight ?? ''}
              placeholder="—"
              onChange={(event) =>
                dispatch({
                  type: 'settings/update',
                  patch: { bodyweight: event.target.value === '' ? null : Number(event.target.value) },
                })
              }
            />
          </Field>
        </div>

        <div className="section-label">Avisos</div>
        <p className="muted">Registra tus mediciones de peso y grasa en PROGRESO para ver su evolución.</p>
        <div className="chip-row">
          <Toggle
            label="Sonido"
            active={settings.soundEnabled}
            onToggle={() => dispatch({ type: 'settings/update', patch: { soundEnabled: !settings.soundEnabled } })}
          />
          <Toggle
            label="Vibración"
            active={settings.vibrationEnabled}
            onToggle={() =>
              dispatch({ type: 'settings/update', patch: { vibrationEnabled: !settings.vibrationEnabled } })
            }
          />
          <Toggle
            label="Descanso automático"
            active={settings.autoStartRest}
            onToggle={() => dispatch({ type: 'settings/update', patch: { autoStartRest: !settings.autoStartRest } })}
          />
        </div>
      </Panel>

      <Panel title="Mesociclo">
        <div className="grid-2">
          <Field label="Semana actual">
            <NumberInput
              value={mesocycle.week}
              min={1}
              max={mesocycle.lengthWeeks}
              label="Semana actual"
              onCommit={(week) => dispatch({ type: 'mesocycle/set', week })}
            />
          </Field>
          <Field label="Duración (semanas)">
            <NumberInput
              value={mesocycle.lengthWeeks}
              min={2}
              max={12}
              label="Duración (semanas)"
              onCommit={(lengthWeeks) =>
                dispatch({ type: 'mesocycle/set', week: mesocycle.week, lengthWeeks })
              }
            />
          </Field>
        </div>
        <div className="hint">
          La última semana siempre es de descarga: la mitad de series, sin técnicas de intensificación
          y con un RIR más conservador.
        </div>
      </Panel>

      <Panel title="Mi gimnasio">
        <p className="muted" style={{ marginTop: 0 }}>
          ¿Has cambiado de gimnasio o quieres revisar qué máquinas y ejercicios entran en la rutina?
          Vuelve al cuestionario: el histórico y los récords se conservan.
        </p>
        <button
          type="button"
          className="btn btn--block"
          onClick={() => dispatch({ type: 'profile/reopen' })}
        >
          ⚙ Rehacer el cuestionario
        </button>
        <div className="hint">
          Al crear la rutina nueva se sustituye la actual. Si has personalizado días o ejercicios a
          mano, exporta antes una copia.
        </div>
      </Panel>

      <Panel title="Datos">
        <p className="muted" style={{ marginTop: 0 }}>
          Todo se guarda en este dispositivo. Exporta de vez en cuando si no quieres perder el
          histórico al cambiar de móvil o limpiar el navegador.
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportBackup}>
            ↓ Exportar copia
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            ↑ Importar copia
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="sr-only"
          aria-label="Importar copia de seguridad"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBackup(file);
            event.target.value = '';
          }}
        />

        <div className="divider" />

        {confirmWipe ? (
          <>
            <div className="hint">
              Se borrarán el histórico, la rutina y los ajustes. Esta acción no se puede deshacer.
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  dispatch({ type: 'state/replace', state: createInitialState() });
                  setConfirmWipe(false);
                  setMessage('Datos borrados.');
                }}
              >
                Sí, borrar todo
              </button>
              <button type="button" className="btn" onClick={() => setConfirmWipe(false)}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn--danger btn--block" onClick={() => setConfirmWipe(true)}>
            Borrar todos los datos
          </button>
        )}

        {message && <div className="hint hint--accent">{message}</div>}
      </Panel>

      <Panel title="Cómo calcula la app">
        <ul className="cues">
          <li>
            <strong>1RM estimado</strong>: fórmula de Epley ajustada por RIR, de modo que 8 reps a
            RIR 2 pesan lo mismo que 10 al fallo.
          </li>
          <li>
            <strong>Progresión</strong>: doble progresión. Primero llenas el rango de repeticiones en
            todas las series y solo entonces sube el peso.
          </li>
          <li>
            <strong>Autorregulación</strong>: si acabas muy por debajo del RIR objetivo sin llegar al
            rango, la carga baja un 10 % en lugar de insistir.
          </li>
          <li>
            <strong>Series efectivas</strong>: las aproximaciones no cuentan y por encima de RIR 4 una
            serie vale la mitad.
          </li>
          <li>
            <strong>Técnicas avanzadas</strong>: se aplican solo a la última serie de los accesorios;
            los básicos pesados van a series rectas para cuidar el ratio estímulo-fatiga.
          </li>
        </ul>
      </Panel>

      <footer className="settings-footer">
        <img src="./favicon-32.png" alt="" className="settings-footer__logo" width="32" height="32" aria-hidden="true" />
        <div className="settings-footer__text">
          <strong>RataFit</strong>
          <span>Hecho para auténticas ratas de gimnasio.</span>
        </div>
      </footer>
    </>
  );
}

function Toggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="chip chip--button" aria-pressed={active} onClick={onToggle}>
      {active ? '◉' : '○'} {label}
    </button>
  );
}
